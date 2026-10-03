'use strict';
// Opt-in actual local-model evaluation plus a real browser Ranked result. All
// accounts, conversations, progress and feedback use one disposable SQLite DB.
// Run: node dev/blue-circuit-dialogue-acceptance.cjs --run-live
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {comparisonBots,nerf,examples}=require('./blue-circuit-dialogue-fixtures.cjs');
const {PROFILES,personalityFor}=require('../server/social-personalities.cjs');
const AI=require('../server/local-ai.cjs'),{createDatabase}=require('../server/db.cjs'),{createServer}=require('../server/index.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-blue-dialogue-evidence'));
const caseFilter=new Set((process.env.SAR_EVAL_CASES||'').split(',').map(value=>value.trim()).filter(Boolean));
const evidence={purpose:'Actual installed local model; isolated browser, database and synthetic account. No production history/progress accessed.',fixturePolicy:'Examples are explicitly synthetic, never canned fallbacks or automatically accepted training rows.',startedAt:new Date().toISOString(),cases:[],providerAttempts:[],checks:[],errors:[]};
let app,context,page,userId,base,db,file,temp,completed;
function save(){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'blue-circuit-dialogue-acceptance.json'),JSON.stringify(evidence,null,2)+'\n');}
function pass(name){evidence.checks.push(name);console.log('PASS '+name);save();}
function unchangedGameplay(before,after){
 const a=typeof before==='string'?JSON.parse(before):before,b=typeof after==='string'?JSON.parse(after):after;
 // Browser autosave advances updatedAt and serializes remaining slot clocks.
 // These bookkeeping snapshots are not reward/career or balance mutations.
 const changed=Object.keys(a).filter(key=>!['updatedAt','matchSlots'].includes(key)&&JSON.stringify(a[key])!==JSON.stringify(b[key]));
 assert.deepEqual(changed,[],'Dialogue changed persistent gameplay fields: '+changed.join(', '));
}
function inspectGeneration(result){
 if(!result.generation)return null;
 const g=db.prepare('SELECT * FROM ai_generations WHERE id=? AND user_id=?').get(result.generation.id,userId);
 return {id:g.id,botId:g.bot_id,botName:g.bot_name,model:g.model,modelVersion:g.model_version,gameVersion:g.game_version,balancePatchId:g.balance_patch_id,raw:g.raw_response,validated:JSON.parse(g.validated_json),context:JSON.parse(g.context_json),prompt:JSON.parse(g.prompt_json)};
}
async function waitJob(id){
 const start=Date.now();while(Date.now()-start<390000){AI.kick(db);const result=AI.jobResult(db,userId,id);if(['COMPLETED','FAILED','CANCELLED'].includes(result.job.status))return result;await delay(500);}throw Error('Actual local-model job exceeded bounded wait: '+id);
}
function rubric(body){return {hasOutput:!!body,noInfrastructureLeak:!/(?:authoritativeGameFacts|payload|JSON|system prompt|repair instructions|chain.of.thought|validation failed)/i.test(body),noDetectedCoaching:!/(?:you should|you need to|you ought|try (?:using|aiming|moving)|remember to|work on your|improve your|your (?:playstyle|weakness|aim needs))/i.test(body)};}
async function runCase(name,label,{text,eventType,mock}={}){
 if(caseFilter.size&&!caseFilter.has(label))return null;
 const start=Date.now(),botId=personalityFor(name).botId,request=text?await AI.replyToBot(db,userId,botId,text):AI.lab(db,userId,{botId,eventType,mockContext:mock});
 if(label==='actual-ranked-participant'){const duplicate=await AI.replyToBot(db,userId,botId,text);assert.equal(duplicate.jobId,request.jobId);assert.equal(duplicate.messageId,request.messageId);assert.equal(duplicate.reused,true);}
 const requestContext=JSON.parse(db.prepare('SELECT request_json FROM ai_jobs WHERE id=?').get(request.jobId).request_json).context;
 const result=await waitJob(request.jobId),generation=inspectGeneration(result),entry={name,label,synthetic:!text,playerText:text||null,mockContext:mock||null,seconds:(Date.now()-start)/1000,job:result.job,generation,...(!generation?{failedRequestContext:requestContext}:{}),rubric:rubric(generation?.validated.body||'')};
 evidence.cases.push(entry);save();console.log(label+': '+result.job.status+' ('+entry.seconds.toFixed(1)+'s)'+(generation?' '+generation.validated.body:' '+result.job.error));return entry;
}
async function flush(){await page.evaluate(async()=>{await SARCloud.flush();await SARStorage.flush();});await page.waitForFunction(()=>!SARCloud.state.sending&&!SARCloud.state.dirty&&!SARCloud.state.saveRejected,null,{timeout:25000});}
async function openBrowser(profile){
 const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block',...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
 assert.equal(source.split('if(!state.paused&&!document.hidden){').length,2);
 const instrumented=source.replace('if(!state.paused&&!document.hidden){','if(!window.__BLUE_HOLD_SIMULATION&&!state.paused&&!document.hidden){').replace('window.SAR = {','window.__BLUE_TEST={state,fire,tryDash,respawnActor,applyDamage,endMatch,commitMatchXP,commitMatchRanked};window.SAR = {');
 await context.addInitScript(()=>{window.__BLUE_HOLD_SIMULATION=true;});
 await context.route(/\/game\.js(?:\?|$)/,route=>route.fulfill({status:200,contentType:'text/javascript',body:instrumented}));
 page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
}
async function openGame(){await page.goto(base+'/?diagnostics=1');await page.waitForFunction(()=>window.SAR&&window.__BLUE_TEST&&window.SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));}
async function finishMatch(){return page.evaluate(()=>{
 const t=__BLUE_TEST,m=t.state.matches.find(m=>m?.hasPlayer),p=m?.participants.find(a=>a.isPlayer);if(!m||!p)throw Error('No allocated match');
 m.status='active';m.countdownUntil=0;t.state.countdownUntil=0;document.getElementById('matchCountdown').classList.add('hidden');for(const a of m.participants){a.spawnFlash=0;a.dead=false;}
 const enemy=m.participants.find(a=>a.team!==p.team);if(!t.fire(p,0,10000)||!t.tryDash(p,1,0,10000))throw Error('Expected real fire/dash hooks');
 let impacts=0;while(m.status==='active'&&impacts<60){if(enemy.dead)t.respawnActor(enemy);enemy.spawnFlash=0;t.applyDamage(enemy,{owner:p,weapon:p.slots[0].name,travel:1},250,false,11000+impacts*1000);impacts++;}
 if(impacts!==60||m.result?.reason!=='score')throw Error('Did not reach actual score limit');t.completed=m;
 const bot=m.participants.find(a=>!a.isPlayer&&a.team===p.team);return {matchId:m.matchId,humanId:p.participantId,botId:bot?.participantId,botName:bot?.name,xp:m.xpAward?.units||0,elo:m.rankedAwards?.[p.participantId]?.appliedUnits||0,botElo:bot?m.rankedAwards?.[bot.participantId]?.afterUnits:null};
 });}
async function run(){
 if(!process.argv.includes('--run-live')){console.log('Opt in with --run-live. Fixtures only: '+examples.length+' cases / '+comparisonBots.length+' contrasting personas.');return;}
 const previous=process.env.SAR_OLLAMA_URL,previousTimeout=process.env.SAR_OLLAMA_TIMEOUT_MS;
 const originalFetch=globalThis.fetch;
 // Test-only transport observation retains actual failed/corrected content and
 // input scope. Never retain the provider's thinking/debug fields as dialogue.
 globalThis.fetch=async(input,options)=>{if(!String(input).endsWith('/api/chat'))return originalFetch(input,options);const started=Date.now(),payload=JSON.parse(options.body),facts=JSON.parse(payload.messages[1].content);try{const response=await originalFetch(input,options),data=await response.clone().json();evidence.providerAttempts.push({bot:facts.bot.name,query:facts.event,seconds:(Date.now()-started)/1000,repair:payload.messages.length>2,repairReason:payload.messages.length>2?payload.messages.at(-1).content:null,doneReason:data.done_reason,output:data.message?.content||'',weapons:facts.authoritativeGameFacts.weapons.map(w=>w.name)});save();return response;}catch(error){evidence.providerAttempts.push({bot:facts.bot.name,seconds:(Date.now()-started)/1000,error:error.message,repair:payload.messages.length>2});save();throw error;}};
 process.env.SAR_OLLAMA_URL='http://127.0.0.1:11434';process.env.SAR_OLLAMA_TIMEOUT_MS='180000';
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'sar-blue-dialogue-'));file=path.join(temp,'fixture.sqlite');const profile=path.join(temp,'edge-profile');
 try{
  db=createDatabase(file);app=createServer({db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
  await openBrowser(profile);const signup=await context.request.post(base+'/api/auth/signup',{data:{username:'blue_dialogue_'+Date.now().toString(36),password:crypto.randomBytes(20).toString('hex')},headers:{origin:base}});assert.equal(signup.status(),201);userId=(await signup.json()).account.id;
  AI.setPreferences(db,userId,{botInitiated:false,developerMode:true});await openGame();await flush();
  const status=await AI.status(db,userId);evidence.model={status:status.status,name:status.model,digest:status.modelVersion};assert.equal(status.status,'CONNECTED');
  assert.equal(PROFILES.length,50);for(const persona of PROFILES){assert.equal(personalityFor(persona.botId),persona);assert.equal(personalityFor(persona.name),persona);const ctx=AI.botContext(db,userId,persona.botId);assert.equal(ctx.botId,persona.botId);assert.equal(ctx.name,persona.name);assert.deepEqual(ctx.socialProfile.social,persona.social);}
  pass('All 50 stable identities and complete permanent numeric social traits resolve unchanged');
  await page.locator('.menu-grid [data-action="play"]').click();await page.locator('[data-action="play-ranked"]').click();await page.waitForFunction(()=>SAR.getState().matches.some(m=>m?.hasPlayer&&m.sessionType==='ranked'));
  completed=await finishMatch();await flush();assert.equal(completed.humanId,userId);assert.equal(completed.xp,48520);assert.equal(completed.elo,23010);assert.equal(completed.botElo,1000);
  const world=await page.evaluate(()=>SAR.getUniverse()),fixed=JSON.stringify({progression:world.progression,ranked:world.ranked,rankedResults:world.rankedResults});
  await page.locator('[data-action="close-result"]').click();await page.locator('#cloudBadge').click();await page.locator('#cloudAccountMenu [data-action="player-profile"]').click();assert.equal(await page.locator('.profile-ranked strong').innerText(),'Beginner III');assert.match(await page.locator('.profile-ranked').innerText(),/230\.1 ELO/);assert.match(await page.locator('.profile-progression').innerText(),/485\.2/);assert.ok(await page.locator('.rank-badge').count());
  await page.screenshot({path:path.join(output,'blue-circuit-ranked-dialogue-profile.png')});await page.locator('#closeModal').click();
  await page.evaluate(()=>{const t=__BLUE_TEST;t.endMatch(t.completed,1-t.completed.winner,'time');t.commitMatchXP(t.completed);t.commitMatchRanked(t.completed);});
  assert.equal(await page.evaluate(()=>{const w=SAR.getUniverse();return JSON.stringify({progression:w.progression,ranked:w.ranked,rankedResults:w.rankedResults});}),fixed);
  evidence.ranked=completed;pass('Real 60-kill Ranked match grants485.20 XP/230.10 ELO, Profile badge/level renders, duplicate finalization is inert');
  const beforeDialogue=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(userId).save_json;
  if(!caseFilter.size||caseFilter.has('actual-ranked-participant')){
  const actual=await runCase(completed.botName,'actual-ranked-participant',{text:'What is your current ranked title and exact ELO?'});
  assert.equal(actual.generation?.context.botId,completed.botId);assert.equal(actual.generation?.context.authoritativeGameFacts.ranked.participantId,completed.botId);assert.equal(actual.generation?.context.authoritativeGameFacts.ranked.rating,10);const actualBody=(actual.generation?.validated.body||'').normalize('NFKC').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ');assert.match(actualBody,/Beginner I\b/);assert.ok((actualBody.match(/\b\d+(?:\.\d+)?\b/g)||[]).some(value=>Number(value)===10),'Direct ranked answer contains the exact supported rating');assert.doesNotMatch(actualBody,/230\.1|Beginner III/);
  pass('Participating bot answers its own actual Beginner I /10 ELO rather than human230.10 ELO, Power, or XP');
  await page.evaluate(botId=>{SARCloud.state.messageThread=botId;return SARSocialUI.showMessages();},completed.botId);await page.waitForSelector('.message-card:not(.message-sent)');assert.equal(await page.locator('.inbox-bot strong').innerText(),completed.botName);assert.equal(await page.locator('.message-card:not(.message-sent) p').last().innerText(),actual.generation.validated.body);await page.screenshot({path:path.join(output,'blue-circuit-actual-ranked-phone.png')});await page.locator('#closeModal').click();pass('Phone renders the validated selected-bot reply without JSON, repairs, or prompt text; duplicate pending reply reuses one job');
  }
  for(const name of comparisonBots)await runCase(name,'same-nerf-'+name,{eventType:'NERF_REACTION',mock:nerf});
  await runCase('Vex','casual-banter',{text:'you still here?'});
  await runCase('Ace','actual-leaderboard',{text:'what do you rank on the TDM bot leaderboard, sorted by K/D?'});
  await runCase('Ace','unsupported-leaderboard-scope',{text:'what do you rank on the bot leaderboard across all eligible modes combined, sorted by K/D?'});
  await runCase('Sage','actual-own-ranked',{text:'what is your ranked title and ELO?'});
  await runCase('Moss','unknown-result',{text:'who won the unreleased Moon Cup final?'});
  await runCase('Ghost','upcoming-tournament',{eventType:'TOURNAMENT_ANNOUNCEMENT',mock:{tournamentName:'Fixture Cup',tournamentStatus:'ANNOUNCED',mock:true,scenario:'SYNTHETIC EVALUATION: A Fixture Cup has been announced. No date, bracket, invitation or result is known. Give your own short feeling about waiting for it. Do not invent those missing facts.'}});
  await runCase('Jinx','off-meta-success',{eventType:'PERSONAL_WEAPON_BREAKOUT',mock:{weapon:'P90',globalCurrentPatch:{kills:300,deaths:600,games:120},personalCurrentPatch:{kills:24,deaths:8,games:12},familiarity:85,mock:true,scenario:'SYNTHETIC EVALUATION: P90 has poor broad K/D but your own twelve-game sample is good. Give your own reaction or attachment to it. Do not coach the human or claim universal dominance.'}});
  const voices=evidence.cases.filter(row=>row.label.startsWith('same-nerf-')).map(row=>row.generation?.validated.body).filter(Boolean);assert.equal(new Set(voices).size,voices.length);assert.equal(voices.length,comparisonBots.filter(name=>!caseFilter.size||caseFilter.has('same-nerf-'+name)).length);
  unchangedGameplay(beforeDialogue,db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(userId).save_json);
  pass(evidence.cases.length+' actual model cases recorded for wording review'+(caseFilter.size?' (targeted retest)':' across eight contrasting personas and seven additional topics'));
  const messageRows=AI.messageRows(db,userId,500),messageCount=messageRows.length,generationCount=db.prepare('SELECT count(*) n FROM ai_generations WHERE user_id=?').get(userId).n;
  await AI.processEvents(db,userId);await AI.processEvents(db,userId);AI.messageData(db,userId);AI.messageData(db,userId);await delay(200);
  assert.equal(AI.messageRows(db,userId,500).length,messageCount);assert.equal(db.prepare('SELECT count(*) n FROM ai_generations WHERE user_id=?').get(userId).n,generationCount);
  assert.equal(db.prepare('SELECT count(*) n FROM messages WHERE generation_id IS NOT NULL AND user_id=?').get(userId).n,new Set(messageRows.filter(row=>row.generationId).map(row=>row.generationId)).size);
  pass('Repeated event processing and Phone data reads create no duplicate generation, notification, or conversation entry');
  // Existing completed custom combat must still be excluded after dialogue.
  const beforeCustom=await page.evaluate(()=>SAR.getUniverse());await page.locator('.menu-grid [data-action="play"]').click();await page.locator('[data-action="play-custom"]').click();await page.locator('#customBot0').selectOption('random');await page.locator('#customTeam0').selectOption('1');await page.locator('[data-action="start-custom"]').click();const custom=await finishMatch();assert.equal(custom.xp,0);assert.equal(custom.elo,0);await flush();
  const afterCustom=await page.evaluate(()=>SAR.getUniverse());for(const key of ['progression','ranked','rankedResults','playerCareer','bots'])assert.deepEqual(afterCustom[key],beforeCustom[key]);pass('Completed custom60-kill game leaves both reward tracks, official careers and bot stats unchanged');
  const savedContext=AI.botContext(db,userId,completed.botId),unread=AI.messageData(db,userId).unread,identity=AI.messageData(db,userId).bots;
  await context.close();context=null;AI.dispose(db);await new Promise(resolve=>app.server.close(resolve));db.close();db=createDatabase(file);app=createServer({db});const oldPort=Number(new URL(base).port);await new Promise(resolve=>app.server.listen(oldPort,'127.0.0.1',resolve));await openBrowser(profile);await openGame();await flush();
  assert.equal(await page.evaluate(()=>SARCloud.state.account.id),userId);assert.deepEqual(AI.messageRows(db,userId,500),messageRows);assert.equal(AI.messageData(db,userId).unread,unread);assert.deepEqual(AI.messageData(db,userId).bots,identity);const restored=AI.botContext(db,userId,completed.botId);assert.deepEqual(restored.importantMemories,savedContext.importantMemories);assert.deepEqual(restored.recentMessages,savedContext.recentMessages);assert.deepEqual((await page.evaluate(()=>SAR.getUniverse())).ranked,afterCustom.ranked);pass('Browser/backend restart retains identities, history, unread count, attributed memories and exact progress');
  process.env.SAR_OLLAMA_URL='http://127.0.0.1:1';await AI.probe(db,true);const beforeOffline=AI.messageRows(db,userId,500).filter(row=>row.direction==='bot').length,pending=await AI.replyToBot(db,userId,'bot_0001','still around?');await delay(300);assert.equal(AI.jobResult(db,userId,pending.jobId).job.status,'QUEUED');assert.equal(AI.messageRows(db,userId,500).filter(row=>row.direction==='bot').length,beforeOffline);assert.equal(await page.evaluate(()=>!!SAR.getUniverse().ranked&&!document.getElementById('sarBoot')),true);pass('Unavailable local dialogue remains queued without fake bot messages or blocking an initialized game');
  assert.equal(evidence.errors.length,0);evidence.finishedAt=new Date().toISOString();evidence.allJobsCompleted=evidence.cases.every(row=>row.job.status==='COMPLETED');evidence.rubricPassed=evidence.cases.every(row=>Object.values(row.rubric).every(Boolean));evidence.review='Automated detection is limited; inspect every recorded actual response. No GOOD/BAD/EDIT rating or model training performed automatically.';save();
  assert.ok(evidence.allJobsCompleted,'Some actual model jobs failed; inspect retained failures');assert.ok(evidence.rubricPassed,'A generated response needs manual wording review');console.log(JSON.stringify({ok:true,cases:evidence.cases.length,checks:evidence.checks.length,evidence:path.join(output,'blue-circuit-dialogue-acceptance.json')}));
 }catch(error){evidence.failure={message:error.message,stack:error.stack};evidence.finishedAt=new Date().toISOString();save();throw error;}
 finally{await context?.close();if(db?.isOpen)AI.dispose(db);if(app)await new Promise(resolve=>app.server.close(resolve));if(db?.isOpen)db.close();globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previous;if(previousTimeout===undefined)delete process.env.SAR_OLLAMA_TIMEOUT_MS;else process.env.SAR_OLLAMA_TIMEOUT_MS=previousTimeout;if(temp){const root=fs.realpathSync(os.tmpdir()),resolved=fs.realpathSync(temp);assert.ok(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('sar-blue-dialogue-'));fs.rmSync(resolved,{recursive:true,force:true});}}
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={rubric,run};
