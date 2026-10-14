'use strict';
// Development-only local fixture. SDK comes from the installed Reticle package;
// no SDK, debugging endpoint, real account or new dependency enters the release.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const sdkRoot=process.env.SAR_RETICLE_ROOT||path.join(process.env.APPDATA,'npm/node_modules/@reticlehq/server'),sdk=path.join(sdkRoot,'node_modules/@reticlehq/browser/dist/reticle-inject.js');
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-reticle-multiplayer'));fs.mkdirSync(output,{recursive:true});
const sessionId='skirmish-practice-'+crypto.randomBytes(4).toString('hex'),root=path.resolve(__dirname,'..'),errors=[];let clockOffset=0,browser,timer,lastCommand=null;
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:'),multiplayerOptions:{manual:true,now:()=>Date.now()+clockOffset,preparationTimeoutMs:30000}});
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 timer=setInterval(()=>{try{const file=path.join(output,'command.json');if(fs.existsSync(file)){const command=JSON.parse(fs.readFileSync(file,'utf8'));if(command.id!==lastCommand){lastCommand=command.id;if(command.stop){clearInterval(timer);void finish();return;}if(Number.isInteger(command.advanceMs)&&command.advanceMs>=0&&command.advanceMs<=3600000)clockOffset+=command.advanceMs;else throw Error('Invalid isolated test-clock command');}}app.multiplayer.runtime.step();}catch(error){errors.push(error.message);}},33);
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block',bypassCSP:true});
 const response=await context.request.post(base+'/api/auth/signup',{data:{username:'reticle_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base}});assert.equal(response.status(),201);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/?diagnostics=1');await page.waitForFunction(()=>window.SAR&&SARCloud.state.loaded&&SARMultiplayer.state().connected&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));await page.addScriptTag({content:fs.readFileSync(sdk,'utf8')});
 await page.evaluate(({sessionId,root})=>{
  const sdk=window.ReticleSdk;const baseline=()=>({tdm:SAR.getUniverse().playerCareer,deathmatch:SAR.getUniverse().modeStats.deathmatch.player,progression:SAR.getUniverse().progression,ranked:SAR.getUniverse().ranked});
  const entry={elapsedMs:null,firstStatus:null,firstHP:null};window.__reticleBaseline=structuredClone(baseline());
  sdk.registerStore('skirmishPractice',()=>{const s=SAR.getState(),network=SARMultiplayer.state();return {mode:s.mode,loading:SARModeEntry.isVisible(),matchStatus:network.match?.status||null,practice:network.match?.practice??null,eligible:network.match?.eligible??null,entry,permanent:baseline(),permanentUnchanged:JSON.stringify(baseline())===JSON.stringify(window.__reticleBaseline),resultVisible:document.querySelector('#modal.visible[data-modal-type="results"]')!==null,modalOpen:document.getElementById('modal').classList.contains('visible'),records:network.progression?.records||[],xpUnits:network.progression?.progression?.totalXPUnits??0};});
  sdk.registerStore('skirmishMastery',()=>({modal:document.getElementById('modalContent').dataset.view,weapon:document.getElementById('masteryWeaponSelect')?.value||null,mastery:SARMultiplayer.state().mastery,connected:SARMultiplayer.state().connected,weaponCount:Object.keys(SAR.getWeapons()).length,badges:document.querySelectorAll('[data-mastery-badge]').length}));
  sdk.registerStore('skirmishFactions',()=>({modal:document.getElementById('modalContent').dataset.view,factions:SARMultiplayer.state().factions,connected:SARMultiplayer.state().connected,phone:SARPhone.getState(),factionProfile:document.querySelector('[data-faction-id]')?.dataset.factionId||null,confirmationOpen:!!document.querySelector('dialog.faction-confirm[open]')}));
  sdk.reticle.connect({url:'ws://127.0.0.1:4400',session:sessionId,root,overlay:false,allowInProduction:true,captureNetworkBodies:false,captureErrorBodies:false});
  let started=null;window.__reticleProbe=setInterval(()=>{
   const attempt=SARModeEntry.state();if(attempt?.started!==undefined&&started===null)started=attempt.started;
   const player=SAR.getActorSnapshots().find(a=>a.isPlayer&&a.matchId!==null);if(player&&entry.elapsedMs===null&&started!==null){entry.elapsedMs=performance.now()-started;entry.firstHP=player.hp;entry.firstStatus=SARMultiplayer.state().match?.status||null;}
   const selectors={'rt-play':'.menu-grid [data-action="play"]','rt-custom':'[data-action="play-custom"]','rt-start':'[data-action="start-custom"]','rt-mode':'#customMode','rt-lobby':'#modalContent [data-action="close-result"]'};
   for(let i=0;i<9;i++)selectors['rt-bot-'+i]='#customBot'+i;for(const [id,selector] of Object.entries(selectors))document.querySelector(selector)?.setAttribute('data-testid',id);
  },10);
 },{sessionId,root});
 await page.waitForFunction(()=>ReticleSdk.reticle.connected,null,{timeout:12000});
 fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify({sessionId,url:base,gameRoot:root,syntheticAccount:true,method:'Installed browser SDK injected only into isolated real Edge/production-server page; existing UI and simulation unchanged.'},null,2));console.log(JSON.stringify({ready:true,sessionId,url:base,output}));
 await new Promise(resolve=>setTimeout(resolve,240000));await finish();
 }catch(error){console.error(error.stack);process.exitCode=1;await finish();}})();
let finished=false;async function finish(){if(finished)return;finished=true;if(timer)clearInterval(timer);if(browser){for(const page of browser.contexts().flatMap(c=>c.pages())){await page.evaluate(()=>{clearInterval(window.__reticleProbe);window.ReticleSdk?.reticle.disconnect();}).catch(()=>{});}await browser.close();}await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();fs.writeFileSync(path.join(output,'fixture-errors.json'),JSON.stringify(errors));}
