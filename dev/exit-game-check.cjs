/* Isolated lifecycle checks. No native window, account, or user database is closed. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../exit-game.js'),'utf8');
const {deferred,settle,cloudFixture,account}=require('./cloud-client-check.cjs');
function fixture({native=true,flush,prepare,invoke,closeWorks=false}={}){
 const calls=[],panels=[],errors=[],timers=new Map();let serial=0,prepares=0,resumes=0,closes=0,cloudFlushes=0;
 const context={console:{error:(...args)=>errors.push(args)},Promise,Error,setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),closed:false,
  SAR:{prepareReload(){prepares++;calls.push('checkpoint');if(prepare)return prepare();return()=>{resumes++;calls.push('resume');};},showPanel:(html,view)=>panels.push({html,view})},
  SARStorage:{flush(){calls.push('local-flush');return flush?.();},error:null},SARCloud:{state:{available:false,localMode:true},flush(){cloudFlushes++;return new Promise(()=>{});}},
  __SAR_NATIVE_GAME__:native,__TAURI__:{core:{async invoke(command){calls.push(command);if(invoke)return invoke(command);}}},close(){closes++;context.closed=closeWorks;calls.push('browser-close');}};
 context.window=context;vm.runInNewContext(source,context,{filename:'exit-game.js'});
 return {context,calls,panels,errors,timers,quit:()=>context.SARLifecycle.quit(),get prepares(){return prepares;},get resumes(){return resumes;},get closes(){return closes;},get cloudFlushes(){return cloudFlushes;},async timeout(){const timer=[...timers].find(([,item])=>item.ms===10000);assert.ok(timer,'bounded local flush timeout');timers.delete(timer[0]);timer[1].fn();await settle();}};
}
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
// Keep controlled native completion separate from the long-running browser
// process: the promise is an acknowledgment, never a real app.exit call.
async function run(){
 await check('Native quit waits for durable local commit; duplicate clicks cannot create a second checkpoint or close',async()=>{
  const saved=deferred(),native=deferred(),h=fixture({flush:()=>saved.promise,invoke:()=>native.promise});const first=h.quit(),second=h.quit();await settle();assert.equal(h.prepares,1);assert.deepEqual(h.calls,['checkpoint','local-flush']);assert.equal(h.cloudFlushes,0,'offline cloud requests never gate exit');saved.resolve();await settle();assert.deepEqual(h.calls,['checkpoint','local-flush','quit_game']);const third=h.quit();await settle();assert.equal(h.calls.filter(c=>c==='quit_game').length,1);native.resolve();await Promise.all([first,second,third]);assert.equal(h.resumes,1);assert.equal(h.timers.size,0);
 });
 await check('A rejected local commit leaves the game open and a later Retry saves before closing',async()=>{
  let fail=true;const h=fixture({flush:()=>fail?Promise.reject(new Error('Quota exceeded')):Promise.resolve()});await h.quit();assert.equal(h.calls.includes('quit_game'),false);assert.equal(h.closes,0);assert.match(h.panels.at(-1).html,/Could not save yet|could not finish/);assert.match(h.panels.at(-1).html,/RETRY SAVE &amp; EXIT|RETRY SAVE & EXIT/);assert.equal(h.resumes,1);fail=false;await h.quit();assert.equal(h.prepares,2);assert.equal(h.calls.filter(c=>c==='quit_game').length,1);assert.equal(h.resumes,2);
 });
 await check('Reported storage errors and bounded unresolved commits cannot show saved success or close',async()=>{
  const reported=fixture();reported.context.SARStorage.error='Write transaction failed';await reported.quit();assert.equal(reported.calls.includes('quit_game'),false);assert.match(reported.panels.at(-1).html,/could not finish/);
  const hold=deferred(),stalled=fixture({flush:()=>hold.promise}),attempt=stalled.quit();await settle();await stalled.timeout();await attempt;assert.equal(stalled.calls.includes('quit_game'),false);assert.match(stalled.panels.at(-1).html,/still open/);assert.equal(stalled.resumes,1);hold.resolve();await settle();assert.equal(stalled.calls.includes('quit_game'),false,'late completion cannot close after a failed attempt');
 });
 await check('Unsupported browser closing reports saved local progress honestly, without cloud flush or logout',async()=>{
  const h=fixture({native:false});await h.quit();assert.equal(h.closes,1);assert.equal(h.calls.includes('quit_game'),false);assert.equal(h.cloudFlushes,0);assert.match(h.panels.at(-1).html,/Progress saved/);assert.match(h.panels.at(-1).html,/cannot close this window automatically/);assert.match(h.panels.at(-1).html,/pending synchronization are saved/);assert.equal(h.panels.at(-1).view,'exit-confirmation');
  const closable=fixture({native:false,closeWorks:true});await closable.quit();assert.equal(closable.closes,1);assert.equal(closable.panels.length,0);
 });
 await check('A failed native acknowledgment stays open and retry is not locked behind a stale attempt',async()=>{
  let fail=true;const h=fixture({invoke:()=>fail?Promise.reject(new Error('Update is busy')):Promise.resolve()});await h.quit();assert.equal(h.closes,0);assert.match(h.panels.at(-1).html,/progress is saved/);assert.match(h.panels.at(-1).html,/could not close yet/);assert.doesNotMatch(h.panels.at(-1).html,/free storage/);fail=false;await h.quit();assert.equal(h.prepares,2);assert.equal(h.calls.filter(c=>c==='quit_game').length,2);
 });
 await check('The production prepareReload checkpoint retains account-owned offline pending sync and exact progression',async()=>{
  const {engine}=require('./simulate.cjs'),seed=engine(),world=seed.context.SAR.getUniverse(),cloud=await cloudFixture({save:world}),game=engine({},undefined,{storageAdapter:cloud.context.SARStorage});game.context.SARCloud=cloud.context.SARCloud;game.context.SARStorage=cloud.context.SARStorage;cloud.context.SARCloud.state.localMode=true;cloud.context.SARCloud.state.available=false;cloud.context.SAR=game.context.SAR;
  const before=game.context.SAR.getUniverse(),progression=JSON.stringify(before.progression),career=JSON.stringify(before.playerCareer),seasons=JSON.stringify(before.seasons),nativeCalls=[];cloud.context.__SAR_NATIVE_GAME__=true;cloud.context.__TAURI__={core:{async invoke(command){nativeCalls.push(command);const pending=JSON.parse(cloud.context.SARStorage.get('sar-cloud-pending'));assert.equal(pending.owner,account.id);assert.equal(pending.baseRevision,7);assert.equal(JSON.stringify(JSON.parse(pending.save).progression),progression);}}};cloud.run(source);const requestCount=cloud.calls.length;await cloud.context.SARLifecycle.quit();assert.deepEqual(nativeCalls,['quit_game']);assert.equal(cloud.calls.length,requestCount,'no exit-triggered server request');const pending=JSON.parse(cloud.context.SARStorage.get('sar-cloud-pending')),stored=JSON.parse(cloud.context.SARStorage.get('sar-persistent-save'));assert.equal(pending.owner,account.id);assert.equal(JSON.stringify(stored.progression),progression);assert.equal(JSON.stringify(stored.playerCareer),career);assert.equal(JSON.stringify(stored.seasons),seasons);assert.equal(JSON.stringify(JSON.parse(pending.save).playerCareer),career);assert.equal(game.context.SAR.getState().paused,false);
 });
 await check('A synchronous checkpoint exception cannot strand Retry behind a completed initialization promise',async()=>{
  let attempts=0;const h=fixture({prepare:()=>{attempts++;if(attempts===1)throw new Error('Checkpoint could not serialize');return()=>{};}});await h.quit();assert.equal(h.calls.includes('quit_game'),false);await h.quit();assert.equal(h.prepares,2,'Retry must start a clean checkpoint after a synchronous failure');assert.equal(h.calls.filter(c=>c==='quit_game').length,1);
 });
 console.log('PASS',checks.length,'exit lifecycle checks; no real native process was closed.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,run};
