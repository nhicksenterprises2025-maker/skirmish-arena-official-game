'use strict';

// Opt-in integration check against the user's already installed local model.
// Every account, world, message and feedback record lives in an isolated temp DB.
// Run: node dev/ollama-acceptance.cjs --run-live
// After a reviewed guard fix: node dev/ollama-acceptance.cjs --run-live --retest-bot Ghost
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../server/db.cjs');
// simulate.cjs also has its own CLI. Hide this runner's flags during import so
// --retest-bot Ghost is not interpreted as a combat-engine source filename.
const runnerArguments = process.argv;
let engine;
try {
  process.argv = runnerArguments.slice(0, 2);
  ({ engine } = require('./simulate.cjs'));
} finally {
  process.argv = runnerArguments;
}
const { writeWorld } = require('../server/world.cjs');
const AI = require('../server/local-ai.cjs');
const { personalityFor, eventEligibility } = require('../server/social-personalities.cjs');

const OUTPUT = path.join(__dirname, 'ollama-acceptance-results.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const COMPARE_BOTS = ['Ace', 'Vex', 'Sage', 'Quill', 'Jinx', 'Ghost', 'Moss', 'Zane'];
const REPLY_TEXT = 'Quill, does the Pump now leave 2 HP after two full body hits, and what would you change in your approach?';
const COMMON_EVENT = {
  weapon: 'Pump Shotgun',
  previousBodyDamage: 125,
  currentBodyDamage: 124,
  victimHealth: 250,
  scenario: 'The Pump damage changes from 125 to 124. React to the breakpoint and what it means to your playstyle. The damage values are complete blast damage, not damage per pellet.',
  mock: true
};
const MECHANICAL_CASES = [
  { name: 'Quill', type: 'BALANCE_FEEDBACK', label: 'pump-125-to-124-breakpoint', mock: COMMON_EVENT },
  { name: 'Quill', type: 'META_OPINION', label: 'P90-eight-head-hits', mock: {
    weapon: 'P90', headDamage: 35, victimHealth: 250,
    scenario: 'Explain the base-damage number of P90 head hits to kill an undamaged 250 HP target. Can it one-shot?', mock: true
  } },
  { name: 'Sage', type: 'META_OPINION', label: 'Sage-twelve-game-caution', mock: {
    weapon: 'P90', completedGames: 12, reportedKd: 2.1,
    scenario: 'A mocked twelve-game P90 sample has K/D 2.1. Is this enough evidence to conclude it must be nerfed?', mock: true
  } },
  { name: 'Ace', type: 'PERSONAL_WEAPON_COLLAPSE', label: 'high-global-poor-personal', mock: {
    weapon: 'P90', globalCurrentPatch: { kills: 800, deaths: 400, games: 120 },
    personalCurrentPatch: { kills: 10, deaths: 24, games: 12 }, familiarity: 15,
    scenario: 'In this mocked scenario the P90 performs well globally but poorly for you. Explain both without pretending your personal result proves the weapon is weak.', mock: true
  } },
  { name: 'Sage', type: 'PERSONAL_WEAPON_BREAKOUT', label: 'low-global-good-personal', mock: {
    weapon: 'P90', globalCurrentPatch: { kills: 300, deaths: 600, games: 120 },
    personalCurrentPatch: { kills: 24, deaths: 8, games: 12 }, familiarity: 85,
    scenario: 'In this mocked scenario the P90 performs poorly globally but well for you. Explain both without pretending your personal result proves it is globally dominant.', mock: true
  } },
  { name: 'Ghost', type: 'TOURNAMENT_ANNOUNCEMENT', label: 'unknown-tournament-winner', mock: {
    tournamentName: 'Developer Cup', tournamentStatus: 'ANNOUNCED',
    scenario: 'No tournament results or winner have been supplied. Who won the tournament?', mock: true
  } }
];

function saveEvidence(evidence) {
  fs.writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2) + '\n');
}

function arithmeticReview(entry) {
  const body = entry.generation?.validatedMessage?.body || '';
  if (!body) return { passed: false, reason: 'No actual validated model response' };
  if (entry.label.startsWith('same-event-') || entry.label === 'pump-125-to-124-breakpoint') {
    const wrongTwoHit = /(?:still (?:kills?|(?:need|requires?) only)|remains? the same)[^.]*\b(?:two|2)\b|\b(?:two|2)[- ](?:shot|hit)[^.]*remains? the same/i.test(body);
    const crossWeapon = /\b35\b/.test(body) && /head/i.test(body) && !/P90/i.test(body);
    const wrongTransition = /doesn[’']t affect (?:the )?(?:kill )?breakpoint|(?:required )?hit count (?:stays?|remains?) the same|leave[s]? 2 HP instead of 3|(?:one|1) (?:less|fewer) hit|(?:one|1) hit (?:less|fewer)|single body (?:hit|blast|shot)[^.]*leaves? (?:only )?2 HP/i.test(body);
    return { passed: !wrongTwoHit && !crossWeapon && !wrongTransition, explicitBreakpointMention: /(?:third|three|3|248|2[- ]?HP|2 HP)/i.test(body), reason: wrongTwoHit ? 'Claims 124 still kills 250 HP in two body hits' : crossWeapon ? 'Applies unrelated P90 head damage to Pump' : wrongTransition ? 'Denies the 2-to-3 hit transition or invents prior arithmetic' : 'No detected contradiction; human wording review still required' };
  }
  if (entry.label === 'P90-eight-head-hits') return { passed: /\b(?:eight|8)\b/i.test(body), reason: 'Must explicitly answer eight base-damage head hits' };
  if (entry.label === 'Sage-twelve-game-caution') return { passed: /small|low|thin|not enough|insufficient|more|larger|limited|twelve|12/i.test(body), reason: 'Must acknowledge limited sample' };
  if (entry.label.includes('global') && entry.label.includes('personal')) {
    const percentageKd = /(\d+(?:\.\d+)?)\s*%\s*(?:kill[\/\s‑\-]death|k\/d)/i.exec(body);
    const expectedKd = [entry.mockContext.globalCurrentPatch, entry.mockContext.personalCurrentPatch].map(row => row.kills / row.deaths);
    const wrongKd = percentageKd && !expectedKd.some(kd => Math.abs(kd - Number(percentageKd[1]) / 100) < .015);
    const wrongSampleThreshold = /haven[’']t (?:hit|reached)[^.]*5[‑\- ]kill threshold/i.test(body) && entry.mockContext.personalCurrentPatch.kills >= 5;
    const inventedMetric = /high win rate|\d+(?:[.:/]\d+)?\s+(?:win|winning) rate|70[\s\-‑–]*rpm/i.test(body) || wrongKd || wrongSampleThreshold;
    return { passed: /global|overall|league/i.test(body) && /\bmy\b|\bme\b|\bI\b|personal|\byour\b/i.test(body) && !inventedMetric, reason: inventedMetric ? 'Invented win rate or confused projectile speed with fire cadence' : 'Must separate global from personal evidence' };
  }
  return { passed: true, reason: 'Structural validation passed; human factual review required' };
}

function playerReplyReview(generation) {
  const body = generation?.validatedMessage?.body || '';
  const hasRequestedWeapon = generation?.suppliedContext.authoritativeGameFacts.weapons.some(weapon => weapon.name === 'Pump Shotgun') || false;
  const oneShotClaim = /(?:a|single|one) body (?:hit|blast|shot)[^.!?]*(?:bring|leave)[^.!?]*(?:2|two)[\s‑\-]?HP/i.test(body);
  const requiresHeadshot = /headshot (?:is )?(?:still )?(?:required|needed|necessary) (?:for|to)[^.!?]*(?:kill|finish)/i.test(body);
  const inventedUnits = /\b\d+\s*fps\b/i.test(body);
  return {
    hasRequestedWeapon,
    passed: hasRequestedWeapon && /\b(?:2|two)[\s‑\-]?HP\b/i.test(body) && !oneShotClaim && !requiresHeadshot && !inventedUnits &&
      !/194[\s‑\-]?HP|damage per body hit is 56|\b12[–\-]14[\s‑\-]tile/i.test(body),
    reason: oneShotClaim ? 'Incorrectly claims one body shot leaves2HP' : requiresHeadshot ? 'Requires a headshot despite a third body hit also killing' : inventedUnits ? 'Invents FPS projectile-speed units' : 'Verify Pump alias context and two-shot2HP result'
  };
}

async function waitJob(db, userId, jobId, limitMs = 380000) {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    AI.kick(db);
    const result = AI.jobResult(db, userId, jobId);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(result.job.status)) return result;
    await delay(1000);
  }
  throw new Error('Live model job exceeded acceptance wait limit: ' + jobId);
}

function generationEvidence(db, userId, result) {
  if (!result.generation) return null;
  const row = db.prepare('SELECT * FROM ai_generations WHERE id=? AND user_id=?')
    .get(result.generation.id, userId);
  return {
    id: row.id,
    botId: row.bot_id,
    botName: row.bot_name,
    model: row.model,
    modelVersion: row.model_version,
    gameVersion: row.game_version,
    balancePatchId: row.balance_patch_id,
    rawModelResponse: row.raw_response,
    validatedMessage: JSON.parse(row.validated_json),
    suppliedContext: JSON.parse(row.context_json),
    prompt: JSON.parse(row.prompt_json)
  };
}

async function runLab(db, userId, evidence, name, eventType, mockContext, label) {
  const started = Date.now();
  const request = AI.lab(db, userId, {
    botId: personalityFor(name).botId,
    eventType,
    mockContext
  });
  const result = await waitJob(db, userId, request.jobId);
  const entry = {
    label,
    botName: name,
    eventType,
    developerScenarioIsMock: true,
    mockContext,
    elapsedSeconds: (Date.now() - started) / 1000,
    job: result.job,
    generation: generationEvidence(db, userId, result)
  };
  entry.acceptanceReview = arithmeticReview(entry);
  const previousIndex = evidence.cases.findIndex(previous => previous.label === label);
  if (previousIndex >= 0) evidence.cases[previousIndex] = entry;
  else evidence.cases.push(entry);
  saveEvidence(evidence);
  console.log(label + ': ' + result.job.status + ' (' + entry.elapsedSeconds.toFixed(1) + 's)');
  if (entry.generation) console.log('  ' + name + ': ' + entry.generation.validatedMessage.body);
  return entry;
}

async function run() {
  if (!process.argv.includes('--run-live')) {
    console.log('This check sends real requests to the existing local gpt-oss:20b model.');
    console.log('Run explicitly: node dev/ollama-acceptance.cjs --run-live');
    return;
  }
  const previousUrl = process.env.SAR_OLLAMA_URL;
  const previousTimeout = process.env.SAR_OLLAMA_TIMEOUT_MS;
  process.env.SAR_OLLAMA_URL = 'http://127.0.0.1:11434';
  process.env.SAR_OLLAMA_TIMEOUT_MS = '180000';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sar-ollama-acceptance-'));
  const file = path.join(directory, 'acceptance.sqlite');
  const userId = 'acceptance-' + crypto.randomUUID();
  let db = createDatabase(file);
  const retestIndex = process.argv.indexOf('--retest-bot');
  const retestBot = retestIndex >= 0 ? process.argv[retestIndex + 1] : null;
  const retestCaseIndex = process.argv.indexOf('--retest-case');
  const retestCaseLabel = retestCaseIndex >= 0 ? process.argv[retestCaseIndex + 1] : null;
  const retestReply = process.argv.includes('--retest-reply');
  const isRetest = Boolean(retestBot || retestCaseLabel || retestReply);
  const retestLabel = retestReply ? 'player-conversation' : retestBot ? 'same-event-' + retestBot : retestCaseLabel;
  const previousEvidence = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null;
  const evidence = isRetest ? { ...previousEvidence, humanReview: null } : {
    startedAt: new Date().toISOString(),
    purpose: 'Actual installed Ollama gpt-oss:20b acceptance; isolated temp account and database; no production mutations',
    scenarioPolicy: 'Lab inputs are explicitly mocked. The map event and player conversation use the real seeded game world.',
    installedModel: null,
    cases: [],
    checks: {},
    humanReview: null
  };
  if (previousEvidence && !isRetest) {
    const previous = previousEvidence;
    evidence.previousValidationGaps = previous.previousValidationGaps || previous.cases
      .filter(entry => ['same-event-Vex', 'same-event-Sage'].includes(entry.label))
      .filter(entry => !arithmeticReview(entry).passed)
      .map(entry => ({ observedAt: previous.startedAt, label: entry.label, rawModelResponse: entry.generation.rawModelResponse, review: arithmeticReview(entry) }));
  }

  try {
    if (isRetest) {
      assert.ok(retestReply || (retestBot ? COMPARE_BOTS.includes(retestBot) : MECHANICAL_CASES.some(entry => entry.label === retestCaseLabel)), 'Retest must name a supplied comparison bot, mechanical case or player reply');
      assert.ok(previousEvidence?.checks?.persistentConversationMemoryAndRelationship, 'Complete a full run before a targeted retest');
    }
    db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(userId, userId, userId, bcrypt.hashSync('isolated-test-account', 4), Date.now(), Date.now());
    const world = engine().context.SAR.getUniverse();
    writeWorld(db, userId, world, 0);
    AI.setPreferences(db, userId, { developerMode: true, botInitiated: false, temperature: .7 });
    const originalWorld = db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(userId).save_json;
    const initialStatus = await AI.status(db, userId);
    evidence.installedModel = { status: initialStatus.status, name: initialStatus.model, digest: initialStatus.modelVersion };
    assert.equal(initialStatus.status, 'CONNECTED', 'The already installed gpt-oss:20b must be available');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bot_social_profiles WHERE user_id=?').get(userId).count, 50);
    saveEvidence(evidence);

    for (const name of retestBot ? [retestBot] : isRetest ? [] : COMPARE_BOTS) {
      await runLab(db, userId, evidence, name, 'BALANCE_FEEDBACK', COMMON_EVENT, 'same-event-' + name);
    }
    if (retestCaseLabel) {
      const selected = MECHANICAL_CASES.find(entry => entry.label === retestCaseLabel);
      await runLab(db, userId, evidence, selected.name, selected.type, selected.mock, selected.label);
    }
    if (retestReply) {
      const reply = await AI.replyToBot(db, userId, personalityFor('Quill').botId, REPLY_TEXT);
      const result = await waitJob(db, userId, reply.jobId);
      evidence.playerConversation = { playerText: REPLY_TEXT, job: result.job, generation: generationEvidence(db, userId, result) };
      const reviewed = playerReplyReview(evidence.playerConversation.generation);
      evidence.playerConversation.acceptanceReview = reviewed;
      evidence.checks.playerReplyContextContainsRequestedWeapon = reviewed.hasRequestedWeapon;
      evidence.checks.playerReplyFactualAcceptance = reviewed.passed;
      if (result.generation) console.log('Player reply: ' + result.generation.validatedMessage.body);
    }
    if (isRetest) {
      for (const entry of evidence.cases) entry.acceptanceReview = arithmeticReview(entry);
      evidence.checks.allLabJobsCompleted = evidence.cases.every(entry => entry.job.status === 'COMPLETED');
      evidence.checks.independentArithmeticChecksPassed = evidence.cases.every(entry => entry.acceptanceReview.passed);
      evidence.retests = [...(evidence.retests || []), {
        label: retestLabel, finishedAt: new Date().toISOString(),
        previousGeneration: retestReply ? previousEvidence.playerConversation.generation : previousEvidence.cases.find(entry => entry.label === retestLabel)?.generation,
        localAiSourceSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../server/local-ai.cjs'))).digest('hex')
      }];
      evidence.finishedAt = new Date().toISOString();
      const selected = evidence.cases.find(entry => entry.label === retestLabel);
      if (evidence.checks.independentArithmeticChecksPassed && evidence.checks.playerReplyFactualAcceptance) delete evidence.error;
      saveEvidence(evidence);
      assert.ok(retestReply ? evidence.checks.playerReplyFactualAcceptance : selected.job.status === 'COMPLETED' && selected.acceptanceReview.passed, 'Inspect targeted actual model response');
      console.log('Targeted retest integrated into the full evidence: ' + retestLabel);
      return;
    }
    for (const entry of MECHANICAL_CASES) await runLab(db, userId, evidence, entry.name, entry.type, entry.mock, entry.label);

    // Initial map feedback is created by the real world write, not by the model.
    const mapRows = db.prepare("SELECT * FROM structured_events WHERE user_id=? AND type='MAP_FEEDBACK'").all(userId);
    assert.ok(mapRows.length > 0, 'Real world initialization must create map facts');
    let factualEvent = mapRows.find(row => eventEligibility(AI.botContext(db, userId, row.bot_id), {
      id: row.id, type: row.type, ...JSON.parse(row.payload_json)
    }).eligible);
    // Re-evaluation of factual observations may select a different bot over time.
    // A unique observation id changes selection only; the facts stay unchanged.
    if (!factualEvent) {
      const base = mapRows[0];
      for (let sequence = 1; sequence <= 100; sequence++) {
        const id = base.id + ':observed:' + sequence;
        if (!eventEligibility(AI.botContext(db, userId, base.bot_id), {
          id, type: base.type, ...JSON.parse(base.payload_json)
        }).eligible) continue;
        db.prepare('INSERT INTO structured_events(id,user_id,bot_id,type,payload_json,created_at) VALUES(?,?,?,?,?,?)')
          .run(id, userId, base.bot_id, base.type, base.payload_json, Date.now());
        factualEvent = db.prepare('SELECT * FROM structured_events WHERE id=?').get(id);
        break;
      }
    }
    assert.ok(factualEvent, 'At least one factual map observation must be eligible');
    AI.setPreferences(db, userId, { botInitiated: true });
    await AI.processEvents(db, userId);
    const mapJob = db.prepare('SELECT id FROM ai_jobs WHERE user_id=? AND event_id=?').get(userId, factualEvent.id);
    assert.ok(mapJob, 'Real structured event must reach the durable queue');
    const mapResult = await waitJob(db, userId, mapJob.id);
    evidence.realMapEvent = {
      event: { type: factualEvent.type, payload: JSON.parse(factualEvent.payload_json) },
      job: mapResult.job,
      generation: generationEvidence(db, userId, mapResult)
    };
    AI.setPreferences(db, userId, { botInitiated: false });
    assert.equal(mapResult.job.status, 'COMPLETED');

    const replyText = REPLY_TEXT;
    const startedReply = Date.now();
    const reply = await AI.replyToBot(db, userId, personalityFor('Quill').botId, replyText);
    evidence.checks.playerReplyQueuedImmediately = reply.pending && Date.now() - startedReply < 1000;
    const replyResult = await waitJob(db, userId, reply.jobId);
    evidence.playerConversation = { playerText: replyText, job: replyResult.job, generation: generationEvidence(db, userId, replyResult) };
    saveEvidence(evidence);
    assert.equal(replyResult.job.status, 'COMPLETED');
    const reviewedReply = playerReplyReview(evidence.playerConversation.generation);
    evidence.playerConversation.acceptanceReview = reviewedReply;
    evidence.checks.playerReplyContextContainsRequestedWeapon = reviewedReply.hasRequestedWeapon;
    evidence.checks.playerReplyFactualAcceptance = reviewedReply.passed;
    const beforeRestart = AI.botContext(db, userId, personalityFor('Quill').botId);
    assert.ok(beforeRestart.importantMemories.some(memory => memory.quote === replyText));
    assert.ok(beforeRestart.relationship.playerTrust > 50);

    const completed = evidence.cases.filter(entry => entry.generation);
    assert.ok(completed.length >= 3, 'Need actual model generations to rate');
    AI.feedback(db, userId, { generationId: completed[0].generation.id, rating: 'GOOD' });
    AI.feedback(db, userId, {
      generationId: completed[1].generation.id, rating: 'EDIT',
      correctedOutput: {
        subject: 'Pump breakpoint', body: 'Two complete 124-damage body blasts leave 2 HP. I need a third body hit or a headshot against an undamaged 250 HP target.',
        mood: 'focused', category: 'balance', wantsReply: false, certainty: 1
      }
    });
    AI.feedback(db, userId, { generationId: completed[2].generation.id, rating: 'BAD' });
    const dataset = AI.exportTraining(db, userId).trim().split('\n').map(JSON.parse);
    assert.equal(dataset.length, 3);
    assert.deepEqual(dataset.map(row => row.rating).sort(), ['BAD', 'EDIT', 'GOOD']);
    assert.ok(dataset.find(row => row.rating === 'BAD').rejected);
    assert.equal(dataset.find(row => row.rating === 'BAD').messages, undefined);
    assert.ok(dataset.find(row => row.rating === 'EDIT').correctedOutput.body.includes('2 HP'));
    assert.ok(dataset.every(row => row.rawModelResponse && row.prompt && row.modelVersion));
    assert.ok(!JSON.stringify(dataset).includes('password_hash'));
    evidence.trainingExport = dataset;

    AI.dispose(db);
    db.close();
    db = createDatabase(file);
    const afterRestart = AI.botContext(db, userId, personalityFor('Quill').botId);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(afterRestart.importantMemories, beforeRestart.importantMemories);
    assert.deepEqual(afterRestart.recentMessages, beforeRestart.recentMessages);
    assert.deepEqual(afterRestart.relationship, beforeRestart.relationship);
    assert.equal(AI.exportTraining(db, userId).trim().split('\n').length, 3);
    assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(userId).save_json, originalWorld);
    evidence.checks = {
      ...evidence.checks,
      permanentProfiles: 50,
      allLabJobsCompleted: evidence.cases.every(entry => entry.job.status === 'COMPLETED'),
      independentArithmeticChecksPassed: evidence.cases.every(entry => entry.acceptanceReview.passed),
      modelRepliesAreReal: evidence.cases.every(entry => entry.generation?.model === 'gpt-oss:20b'),
      realStructuredMapEvent: mapResult.job.status === 'COMPLETED',
      persistentConversationMemoryAndRelationship: true,
      persistentFeedbackAndJsonl: true,
      badSamplesExcludedFromAcceptedChatExamples: true,
      gameWorldByteUnchanged: true,
      sqliteIntegrity: 'ok'
    };
    evidence.finishedAt = new Date().toISOString();
    saveEvidence(evidence);
    console.log('Live acceptance evidence saved: ' + OUTPUT);
    assert.ok(evidence.checks.allLabJobsCompleted, 'Inspect any failed actual model cases in the evidence');
    assert.ok(evidence.checks.independentArithmeticChecksPassed, 'Inspect arithmetic issues in actual model evidence');
    assert.ok(evidence.checks.playerReplyFactualAcceptance, 'Inspect requested weapon context and actual model reply');
  } catch (error) {
    evidence.error = error.message;
    evidence.finishedAt = new Date().toISOString();
    saveEvidence(evidence);
    throw error;
  } finally {
    AI.dispose(db);
    if (db.isOpen) db.close();
    if (previousUrl === undefined) delete process.env.SAR_OLLAMA_URL;
    else process.env.SAR_OLLAMA_URL = previousUrl;
    if (previousTimeout === undefined) delete process.env.SAR_OLLAMA_TIMEOUT_MS;
    else process.env.SAR_OLLAMA_TIMEOUT_MS = previousTimeout;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run, COMMON_EVENT, COMPARE_BOTS, MECHANICAL_CASES, REPLY_TEXT, arithmeticReview, playerReplyReview };
