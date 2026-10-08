'use strict';
// Execute the captured pre-Audit-7 engine and current engine against the same
// persisted fixture, seeded RNG and clock. This verifies actual simulation;
// assertions do not reproduce the countdown implementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs');
const root=path.resolve(__dirname,'..'),evidence=process.env.SAR_AUDIT7_EVIDENCE||path.join(os.homedir(),'OneDrive','Documents','ChatGPT','freeshui','arena-refined-audit-7');
const previousPath=process.env.SAR_AUDIT7_BEFORE_GAME||path.join(evidence,'before','game.js');
const previous=fs.readFileSync(previousPath,'utf8'),current=fs.readFileSync(path.join(root,'game.js'),'utf8'),epoch=Date.parse('2026-10-07T16:00:00Z');
const copy=value=>JSON.parse(JSON.stringify(value)),hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'),checks=[];
function check(name,work){work();checks.push(name);console.log('PASS: '+name);}
function make(source,storage={}){const clock={value:epoch},e=engine(storage,source,{wallNow:()=>clock.value});return {e,clock};}
function metadata(e){const value=e.context.SAR.getState();for(const m of value.matches)if(m)delete m.countdown;return copy(value);}
function geometry(e){const render=e.dev.renderSnapshot();return copy({world:render.world,geometry:render.geometry});}
function run(){
 const seed=make(previous),saved=seed.e.context.SAR.getUniverse();
 // An account-owned storage fixture includes retained non-gameplay data. Its
 // strings are test placeholders, never credentials from the installation.
 saved.futureAuditFixture={untouched:true,sequence:719};
 const accountRecord=JSON.stringify({fixture:{username:'PreservedFixture',hash:'isolated-test-placeholder',salt:'isolated-test-placeholder'}}),storage={'sar-persistent-save':JSON.stringify(saved),'sar-local-accounts-v1':accountRecord,'sar-local-session-v1':'fixture'};
 const a=make(previous,storage),b=make(current,storage),initial=copy(a.e.context.SAR.getUniverse()),mapBefore=geometry(a.e);
 check('Authoritative weapon constants, balance identity, application identity and saved configuration are unchanged',()=>{
  assert.deepEqual(b.e.context.SAR.getWeapons(),a.e.context.SAR.getWeapons());assert.equal(b.e.dev.balanceFingerprint(),a.e.dev.balanceFingerprint());
  assert.deepEqual(b.e.context.SAR.getVersion(),a.e.context.SAR.getVersion());assert.deepEqual(b.e.context.SAR.getConfig(),a.e.context.SAR.getConfig());
  assert.deepEqual(b.e.context.SAR.getUniverse(),initial);assert.deepEqual(b.e.context.SAR.getProfiles(),a.e.context.SAR.getProfiles());
  assert.deepEqual(geometry(b.e),mapBefore);assert.equal(Object.keys(initial.bots).filter(name=>initial.activeBotNames.includes(name)).length,50);
 });
 check('Normal background allocation remains two TDM plus two Deathmatch games with the same actors, score rules and clocks',()=>{
  assert.deepEqual(a.e.context.SAR.getState().matches.map(m=>m.mode),['tdm','tdm','deathmatch','deathmatch']);
  assert.deepEqual(metadata(b.e),metadata(a.e));assert.deepEqual(b.e.context.SAR.getActorSnapshots(),a.e.context.SAR.getActorSnapshots());
  assert.deepEqual(a.e.context.SAR.getState().matches.map(m=>[m.limit,m.durationMs]),[[60,300000],[60,300000],[30,240000],[30,240000]]);
 });
 check('Sixty seconds of seeded real AI, movement, projectiles and resolved combat match the captured engine exactly',()=>{
  for(let tick=0;tick<1800;tick++){
   a.clock.value+=1000/30;b.clock.value+=1000/30;a.e.step(1/30);b.e.step(1/30);
   if((tick+1)%300===0){assert.deepEqual(b.e.context.SAR.getActorSnapshots(),a.e.context.SAR.getActorSnapshots(),'Actual actor/projectile outcomes at tick '+(tick+1));assert.deepEqual(metadata(b.e),metadata(a.e),'Match mode/status/score/clock at tick '+(tick+1));}
  }
  assert.equal(b.e.dev.now(),a.e.dev.now());assert.ok(Math.abs((b.e.dev.now()-1000)/1000-60)<1e-8);
  const world=b.e.context.SAR.getUniverse();assert.ok(Object.values(world.patchState.meta).reduce((sum,row)=>sum+row.shots,0)>0,'Real TDM firing occurred');assert.ok(Object.values(world.modeStats.deathmatch.meta).reduce((sum,row)=>sum+row.shots,0)>0,'Real Deathmatch firing occurred');
  assert.ok(Object.values(world.patchState.meta).reduce((sum,row)=>sum+row.damage,0)>0);assert.ok(Object.values(world.modeStats.deathmatch.meta).reduce((sum,row)=>sum+row.damage,0)>0);
 });
 check('Complete saved world, XP/levels, careers, familiarity, seasons and lifetime/current/historical telemetry remain identical',()=>{
  const before=a.e.context.SAR.getUniverse(),after=b.e.context.SAR.getUniverse();assert.deepEqual(after,before);
  for(const key of ['progression','ranked','playerCareer','bots','seasons','playerSeasons','patchState','patchArchives','balancePatchHistory','modeStats','tournamentHistory','futureAuditFixture'])assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(after.progression,initial.progression,'Countdown change does not award background/player XP');assert.deepEqual(after.ranked,initial.ranked);
  assert.equal(b.e.data.get('sar-local-accounts-v1'),accountRecord);assert.equal(b.e.data.get('sar-local-session-v1'),'fixture');
  assert.equal(a.clock.value,b.clock.value);
 });
 check('Physical map geometry, collision and navigation results are unchanged after actual simulation',()=>{
  assert.deepEqual(geometry(a.e),mapBefore);assert.deepEqual(geometry(b.e),mapBefore);
  for(const [x,y] of [[100,100],[500,500],[2160,1440],[4300,2860],[1000,1800]]){assert.equal(b.e.dev.collides(x,y),a.e.dev.collides(x,y));assert.deepEqual(b.e.dev.navigationStart(x,y),a.e.dev.navigationStart(x,y));}
  for(const points of [[100,100,4300,2860],[500,500,1500,1000],[1000,1800,2000,2100]]){assert.equal(b.e.dev.pathClear(...points),a.e.dev.pathClear(...points));assert.deepEqual(b.e.dev.findPath(...points),a.e.dev.findPath(...points));}
 });
 check('Ordinary player countdown retains the original full gameplay clock after paused presentation and a delayed update',()=>{
  const older=make(previous),newer=make(current);
  for(const {e} of [older,newer]){e.dev.queueForMatch();e.step(2.99);const state=e.dev.inspect().state,m=state.matches[state.playerMatchId];assert.equal(m.status,'countdown');state.paused=true;const simulationAt=e.dev.now();e.ui.advance(20000);assert.equal(e.dev.now(),simulationAt,'The real animation loop stops simulation while paused');state.paused=false;e.step(.85);assert.equal(m.status,'active');assert.equal(m.startedAt,e.dev.now(),'Preserve normal-session late-update clock behavior');assert.equal(e.context.SAR.getState().matches[m.id].timeLeftMs,300000);}
  assert.deepEqual(newer.e.context.SAR.getActorSnapshots(),older.e.context.SAR.getActorSnapshots());assert.deepEqual(metadata(newer.e),metadata(older.e));assert.deepEqual(newer.e.context.SAR.getUniverse(),older.e.context.SAR.getUniverse());
 });
 const world=b.e.context.SAR.getUniverse(),report={result:'PASS',checks,scope:'Captured pre-Audit-7 versus current real engine; normal two-TDM/two-DM simulation and saved-data preservation, not scheduled check-in activation or installed graphics.',seconds:60,ticks:1800,clockEpoch:epoch,sourceHashes:{before:hash(previous),after:hash(current)},worldHash:hash(world),geometryHash:hash(mapBefore),balance:{version:world.patchState.balanceVersion,fingerprint:world.patchState.fingerprint},matchScores:metadata(b.e).matches.map(m=>({mode:m.mode,score:m.score,status:m.status,timeLeftMs:m.timeLeftMs})),resolvedDamage:{tdm:Object.values(world.patchState.meta).reduce((sum,row)=>sum+row.damage,0),deathmatch:Object.values(world.modeStats.deathmatch.meta).reduce((sum,row)=>sum+row.damage,0)}};
 const arg=process.argv.find(value=>value.startsWith('--report=')),output=arg?path.resolve(arg.slice('--report='.length)):path.join(evidence,'countdown-preservation-results.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));return report;
}
if(require.main===module){try{run();console.log('PASS: '+checks.length+' real-engine preservation groups.');}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={run};
