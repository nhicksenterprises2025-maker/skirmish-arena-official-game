/* Controlled-rAF checks for the shipped game loop, not a replacement scheduler.
   node dev/overclock-timing-check.cjs [--baseline] [--output=absolute-path.json]
   --baseline records the old uncapped behavior before the render cap is added.
   Canvas/audio output is observed; combat, timers, careers and progression run
   through game.js. This checks timing invariance, not hardware performance. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { engine } = require('./simulate.cjs');
const gamePath = path.resolve(__dirname, '../game.js');
const original = fs.readFileSync(gamePath, 'utf8');
const baselineOnly = process.argv.includes('--baseline');
const CAPS = [0, 60, 120, 144, 165, 200, 240, 300, 360];
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
}

// These observers and clock bindings exist only in this in-memory source copy.
// In particular, do not replace loop(), elapsed-time arithmetic, or render().
const prelude = `
const rafTest = window.__RAF_TEST = {
  pending: new Map(), nextId: 0, frames: [], events: [], substeps: [],
  views: [], flushes: 0
};
requestAnimationFrame = callback => {
  const id = ++rafTest.nextId; rafTest.pending.set(id, callback); return id;
};
window.requestAnimationFrame = requestAnimationFrame;
window.cancelAnimationFrame = id => rafTest.pending.delete(id);
window.SARCloud.now = () => 1791028800000 + performance.now();
window.SAR25D = {
  render(snapshot) {
    rafTest.frames.push({ at: performance.now(), simulation: snapshot.time, matchId: snapshot.matchId });
  }, resize() {}
};
window.SARAudio = {
  setView(view) { rafTest.views.push({ ...view }); },
  emit(event) { rafTest.events.push(JSON.parse(JSON.stringify(event))); },
  flush() { rafTest.flushes++; }
};
`;
assert.ok(original.includes("'use strict';"), 'game source prelude anchor');
assert.ok(original.includes('window.SAR = {'), 'game source diagnostic anchor');
const observedSource = original.replace("'use strict';", "'use strict';\n" + prelude)
  .replace('window.SAR = {', `
const observedUpdate = update;
update = (dt, now) => {
  rafTest.substeps.push([dt, now]);
  return observedUpdate(dt, now);
};
window.SAR = {`);

function make(cap = 0, human = false) {
  const e = engine({}, observedSource);
  e.raf = e.context.__RAF_TEST;
  e.clock = 1000;
  if (!baselineOnly) assert.equal(e.dev.CONFIG.maximumFPS, 0, 'fresh and legacy settings retain the previous uncapped default');
  e.dev.CONFIG.maximumFPS = cap;
  if (human) { e.dev.queueForMatch(); e.ui.flush(); }
  else assert.equal(e.context.SAR.watchMatch(0), true, 'watch an existing live match');
  e.ui.flush();
  return e;
}
function frame(e, deltaMs) {
  e.clock += deltaMs;
  e.ui.advance(deltaMs);
  const callbacks = [...e.raf.pending.values()];
  e.raf.pending.clear();
  assert.equal(callbacks.filter(fn => fn.name === 'loop').length, 1, 'one simulation rAF callback');
  for (const callback of callbacks) callback(e.clock);
  e.ui.flush();
  assert.equal([...e.raf.pending.values()].filter(fn => fn.name === 'loop').length, 1, 'one next simulation rAF callback');
}
function frames(e, count, hz = 360) { for (let i = 0; i < count; i++) frame(e, 1000 / hz); }
function visibility(e, hidden) {
  e.ui.document.hidden = hidden;
  e.ui.dispatch('document', 'visibilitychange');
  // StubEventTarget does not implement DOM bubbling to window.
  e.ui.dispatch('window', 'visibilitychange');
  e.ui.flush();
}

// Preserve cycles/shared references, Maps, Sets and non-finite sentinel values;
// JSON alone would silently discard bot memories and Infinity cooldowns.
function canonical(value, seen = new Map(), location = '$') {
  if (typeof value === 'number' && !Number.isFinite(value)) return { number: String(value) };
  if (typeof value === 'function') return { function: value.name };
  if (value === undefined) return { undefined: true };
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return { reference: seen.get(value) };
  seen.set(value, location);
  if (value instanceof Map) return { map: [...value].map(([key, item], index) => [canonical(key, seen, location + '.key' + index), canonical(item, seen, location + '.value' + index)]) };
  if (value instanceof Set) return { set: [...value].map((item, index) => canonical(item, seen, location + '.set' + index)) };
  if (Array.isArray(value)) return value.map((item, index) => canonical(item, seen, location + '[' + index + ']'));
  return Object.fromEntries(Object.keys(value).sort().filter(key => key !== 'maximumFPS')
    .map(key => [key, canonical(value[key], seen, location + '.' + key)]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function capture(e) {
  const { state, SAVE, meta, diagnostics } = e.dev.inspect();
  return {
    simulation: e.dev.now(),
    state: digest(state), world: digest(SAVE), meta: digest(meta), diagnostics: digest(diagnostics),
    audio: digest(e.raf.events), substeps: digest(e.raf.substeps), audioFlushes: e.raf.flushes,
    weapons: digest(e.context.SAR.getWeapons()), balance: e.dev.balanceFingerprint()
  };
}
function verifyRate(e, cap, hz, count, startIndex = 0, durationMs = count * 1000 / hz) {
  const rendered = e.raf.frames.length - startIndex;
  const target = baselineOnly || cap === 0 ? hz : Math.min(cap, hz);
  const expected = target * durationMs / 1000;
  assert.ok(Math.abs(rendered - expected) <= 2,
    `${cap || 'Unlimited'} on ${hz} Hz: ${rendered} real renderer calls; expected about ${expected}`);
  if (cap === 0 || baselineOnly) assert.equal(rendered, count, 'Unlimited renders once per host rAF');
  return rendered;
}
function completeAndRotate(e) {
  const { state, SAVE } = e.dev.inspect();
  const oldIds = state.matches.map(match => match.matchId);
  assert.equal(oldIds.length, 4);
  // Shorten fixture clocks only. Real clock expiry, overtime damage, result
  // commitment and cooldown replacement remain the shipped implementation.
  for (const match of state.matches) match.durationMs = e.dev.now() - match.startedAt;
  frame(e, 1000 / 360);
  for (const match of state.matches) {
    if (match.status !== 'active') continue;
    assert.equal(match.overtime, true, 'tied expired matches enter real overtime');
    const victim = match.participants.find(actor => !actor.dead);
    const attacker = match.participants.find(actor => actor.team !== victim.team);
    const weapon = attacker.slots[attacker.currentSlot].name;
    e.dev.applyDamage(victim, { owner: attacker, weapon, travel: 100 }, victim.hp, false, e.dev.now());
  }
  e.ui.flush();
  assert.ok(state.matches.every(match => match.status === 'cooldown'));
  assert.equal(SAVE.patchState.completedMatches, 4, 'all four matches commit once');
  assert.equal(Object.values(SAVE.bots).reduce((sum, bot) => sum + bot.career.games, 0), 40);
  const committed = digest(SAVE);
  for (const match of state.matches) e.dev.endMatch(match, match.winner, 'time');
  assert.equal(digest(SAVE), committed, 'repeated finalization cannot duplicate careers, rewards or telemetry');
  const before = e.dev.now();
  frame(e, 20000);
  near(e.dev.now() - before, 250, 'long host gap retains the established simulation catch-up bound');
  assert.ok(state.matches.every((match, index) => match.status === 'active' && match.matchId !== oldIds[index]), 'all persisted cooldowns rotate after wall-clock expiry');
  assert.equal(new Set(state.matches.map(match => match.matchId)).size, 4);
  assert.equal(SAVE.patchState.completedMatches, 4, 'slot restart does not award another match');
  assert.equal(SAVE.patchArchives.length, 0, 'render configuration cannot reset the active patch');
  frames(e, 30, 60);
}

const report = { mode: baselineOnly ? 'pre-change baseline' : 'render-cap invariance', sourceHash: crypto.createHash('sha256').update(original).digest('hex'), rates: [], checks };
const reference = make(0);
assert.equal(reference.dev.CONFIG.maximumFPS, 0);
frames(reference, 1440); // Four seconds of all four active matches at 360 Hz.
const combatReference = capture(reference);
assert.ok(reference.raf.events.some(event => event.type === 'shot'), 'fixture contains real firing');
assert.ok(Object.values(reference.dev.inspect().meta).some(row => row.damage > 0), 'fixture contains resolved damage');
for (const match of reference.dev.inspect().state.matches) {
  assert.equal(match.status, 'active');
  assert.ok(match.participants.every(actor => actor.career.timePlayed > 0), 'every active bot advances regardless of watched match');
}
report.rates.push({ cap: 0, hostHz: 360, rendered: verifyRate(reference, 0, 360, 1440) });
completeAndRotate(reference);
const rotatedReference = capture(reference);
for (const cap of CAPS.filter(Boolean)) {
  const e = make(cap);
  frames(e, 1440);
  assert.deepEqual(capture(e), combatReference, `${cap} FPS preserves exact seeded combat, clocks, audio events, careers, progression and weapon constants`);
  report.rates.push({ cap, hostHz: 360, rendered: verifyRate(e, cap, 360, 1440) });
  completeAndRotate(e);
  assert.deepEqual(capture(e), rotatedReference, `${cap} FPS preserves match finalization, four-slot rotation and long-gap behavior`);
}
pass('All nine caps preserve exact four-match simulation, audio events, careers, XP, seasons and balance constants');
pass('Renderer-call rates follow all cap values; Unlimited retains the host rAF rate');
pass('Real clock expiry, overtime, idempotent results and four-slot cooldown rotation are cap-independent');

// A lower-refresh host is never accelerated to the selected numerical cap.
for (const cap of [60, 144, 240, 300, 0]) {
  const e = make(cap);
  frames(e, 120, 60);
  report.rates.push({ cap, hostHz: 60, rendered: verifyRate(e, cap, 60, 120) });
}
pass('A 60 Hz host stays at 60 actual renderer calls per second for higher caps and Unlimited');

{
  const changed = make(60), unchanged = make(0);
  for (const cap of [60, 300, 0, 144, 240, 60]) {
    changed.dev.CONFIG.maximumFPS = cap;
    const start = changed.raf.frames.length;
    frames(changed, 360); frames(unchanged, 360);
    verifyRate(changed, cap, 360, 360, start);
    assert.deepEqual(capture(changed), capture(unchanged), `live switch to ${cap || 'Unlimited'} affects rendering only`);
  }
  // Irregular host timing exercises substeps rather than assuming perfect vsync.
  for (const delta of [1, 4, 9, 17, 33, 48, 125, 400, 3, 11, 7]) { frame(changed, delta); frame(unchanged, delta); }
  assert.deepEqual(capture(changed), capture(unchanged));
  pass('Live cap changes and irregular rAF timing leave gameplay and event ordering unchanged');
}

function focusScenario(cap) {
  const e = make(cap, true), { state } = e.dev.inspect();
  frames(e, 420, 120); // Includes the unchanged three-second match countdown.
  assert.equal(state.matches[state.playerMatchId].status, 'active');
  const player = state.actors.find(actor => actor.isPlayer);
  e.dev.input.keys.add('KeyW'); e.dev.input.keys.add('MouseRight'); e.dev.input.mouseDown = true;
  player.ads = true; player.adsBlend = 1;
  e.ui.setFocus(false); e.ui.dispatch('window', 'blur'); e.ui.flush();
  assert.equal(state.paused, true);
  assert.equal(e.dev.input.keys.size, 0); assert.equal(e.dev.input.mouseDown, false);
  const pausedAt = e.dev.now(), awards = digest(e.dev.inspect().SAVE.progression);
  frames(e, 60, 60);
  near(e.dev.now(), pausedAt, 'blur keeps simulation paused');
  assert.equal(e.raf.views.at(-1).active, false, 'blur disables viewed gameplay audio');
  e.ui.setFocus(true); e.ui.dispatch('window', 'focus'); e.ui.flush();
  assert.equal(state.paused, true, 'focus alone does not resume a paused game');
  e.ui.action('resume'); e.ui.flush();
  assert.equal(state.paused, false); assert.equal(e.ui.document.pointerLockElement, e.ui.canvas);
  frames(e, 30, 120);
  visibility(e, true);
  const hiddenAt = e.dev.now();
  frames(e, 10, 20);
  near(e.dev.now(), hiddenAt, 'hidden page keeps simulation paused');
  visibility(e, false);
  assert.equal(state.paused, true);
  e.ui.action('resume'); e.ui.flush();
  const resumedAt = e.dev.now(); frame(e, 5000);
  near(e.dev.now() - resumedAt, 250, 'resume preserves bounded long-gap catch-up');
  frames(e, 30, 120);
  assert.equal(digest(e.dev.inspect().SAVE.progression), awards, 'focus and resume do not duplicate or award XP');
  assert.ok(e.raf.substeps.every(([dt]) => dt > 0 && dt <= .035), 'all updates retain the existing 35 ms upper bound');
  return capture(e);
}
const focusReference = focusScenario(0);
for (const cap of [60, 144, 240, 300]) assert.deepEqual(focusScenario(cap), focusReference, `${cap} FPS preserves focus/hidden/resume behavior`);
pass('Human countdown, blur, visibility, input clearing, pointer recapture and resume are cap-independent');

report.result = 'PASS';
report.note = 'Synthetic host timestamps and stubbed output verify the shipped scheduler; these results are not installed FPS/GPU benchmarks or proof of determinism across different physical refresh rates.';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: report.result, checks: checks.length, rates: report.rates, sourceHash: report.sourceHash }));
