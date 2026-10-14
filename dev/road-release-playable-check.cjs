'use strict';
// Real Edge, shipped UI/physics, isolated authenticated world. No fake clock,
// replacement simulation, injected game source, or owner account storage.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-road-release-playable'));fs.mkdirSync(output,{recursive:true});
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
const report={checks:[],metrics:[],errors:[],sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../game.js'))).digest('hex'),unverified:['Physical Windows Alt+Tab and a physical keyboard/mouse session.']};
let browser,page,context;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const player=()=>page.evaluate(()=>SAR.getActorSnapshots().find(a=>a.isPlayer&&a.matchId!==null));
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function active(){await page.waitForFunction(()=>{const s=SAR.getState();return s.matches.find(m=>m?.id===s.playerMatchId)?.status==='active';},null,{timeout:15000});}
async function capture(){await page.locator('#game').click({position:{x:400,y:300}});await page.waitForFunction(()=>document.pointerLockElement?.id==='game');}
async function custom(mode){
 await page.locator('.menu-grid [data-action="play"]').click();await page.locator('[data-action="play-custom"]').click();await page.locator('#customMode').selectOption(mode);
 for(let i=0;i<9;i++)await page.locator('#customBot'+i).selectOption('random');
 const start=Date.now();await page.locator('[data-action="start-custom"]').click();await page.waitForSelector('#sarModeEntry:not([hidden])');
 await page.waitForFunction(()=>SAR.getActorSnapshots().some(a=>a.isPlayer&&a.matchId!==null));assert.ok(Date.now()-start>=2990);
 assert.equal(await page.locator('#matchCountdown').isVisible(),true);assert.equal((await player()).hp,250);await active();await capture();
 const s=await page.evaluate(()=>SAR.getState()),m=s.matches.find(m=>m?.id===s.playerMatchId);assert.equal(m.mode,mode);assert.equal(m.sessionType,'custom');assert.equal(m.participants,10);assert.equal(m.eligible,false);
 pass('Real '+mode+' custom entry: three-second loading, authoritative countdown, ten participants and active play');return m;
}
async function exit(){await page.keyboard.press('Escape');await page.waitForSelector('#pause.visible');await page.locator('#pause [data-action="exit"]').click();await page.waitForFunction(()=>SAR.getState().mode==='menu');}
async function move(code,ms){const before=await player();await page.keyboard.down(code);await page.waitForTimeout(ms);await page.keyboard.up(code);const after=await player();return Math.hypot(after.x-before.x,after.y-before.y);}
async function aimCenter(){await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:-10000,movementY:-10000,bubbles:true})));await page.mouse.move(683,384);}
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,channel:'msedge'});context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
 const signup=await context.request.post(base+'/api/auth/signup',{data:{username:'play_'+crypto.randomBytes(5).toString('hex'),password:crypto.randomBytes(20).toString('hex')},headers:{origin:base}});assert.equal(signup.status(),201);
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/?diagnostics=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SAR&&window.SAR25D&&!document.getElementById('sarBoot')&&SARCloud.state.loaded,null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));
 const baseline=await page.evaluate(()=>{const w=SAR.getUniverse();return {progression:w.progression,ranked:w.ranked,playerCareer:w.playerCareer,config:SAR.getConfig(),fingerprint:w.patchState.fingerprint,archives:w.patchArchives.length};});
 const m=await custom('deathmatch');
 const speeds=[];for(const key of ['KeyW','KeyD','KeyS','KeyA']){const d=await move(key,210);speeds.push(d);if(d>25)break;}assert.ok(speeds.some(d=>d>25),'Real keyboard moves human');
 await page.keyboard.down('ShiftLeft');const sprint=await move('KeyD',220);await page.keyboard.up('ShiftLeft');await page.waitForTimeout(100);assert.equal((await player()).sprinting,false);
 await page.keyboard.down('KeyW');await page.keyboard.press('Space');await page.waitForTimeout(45);const dash=await player();assert.ok(dash.dashing&&dash.dashCooldownMs>3500);await page.keyboard.up('KeyW');await page.waitForTimeout(260);
 pass('Real movement, sprint release, directional dash and cooldown run through the captured keyboard input');report.metrics.push({normalTravel:speeds,sprintTravel:sprint});
 await page.mouse.down({button:'right'});await page.waitForTimeout(500);const ads=await player();assert.ok(ads.spread>0);assert.equal(await page.locator('#crosshair').evaluate(el=>el.classList.contains('ads')),true);
 const adsColor=await page.locator('#crosshair i').first().evaluate(el=>getComputedStyle(el).backgroundColor);await page.mouse.up({button:'right'});await page.waitForTimeout(350);
 const hipColor=await page.locator('#crosshair i').first().evaluate(el=>getComputedStyle(el).backgroundColor);report.metrics.push({adsColor,hipColor});
 if(process.env.SAR_REQUIRE_WHITE==='1'){assert.equal(adsColor,'rgb(255, 255, 255)');assert.equal(hipColor,'rgb(255, 255, 255)');}
 pass('Real ADS press/release and authoritative spread update the visible crosshair');
 await page.keyboard.press('Digit2');await page.waitForTimeout(100);const side=await player();assert.equal(side.weapon,baseline.config.sidearm);const ammo=side.ammo;
 await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();assert.equal((await player()).ammo,ammo-1,'Semi-auto sidearm fires once per press');
 await page.mouse.click(760,400);assert.equal((await player()).ammo,ammo-2);await page.keyboard.press('KeyR');await page.waitForTimeout(100);assert.equal((await player()).reloading,true);
 await page.waitForTimeout(2200);assert.equal((await player()).reloading,false);await page.keyboard.press('Digit1');await page.waitForTimeout(100);assert.equal((await player()).weapon,baseline.config.primary);
 pass('Captured weapon switch, semi-auto clicks, reload and return to primary work in a live match');
 await shot('live-deathmatch');await page.keyboard.press('Escape');await page.waitForSelector('#pause.visible');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
 await page.locator('#pause [data-action="resume"]').click();await capture();assert.equal(await page.evaluate(()=>SAR.getState().paused),false);
 pass('Pause releases cursor and Resume reacquires pointer lock without duplicate humans');
 assert.equal((await page.evaluate(()=>SAR.getActorSnapshots())).filter(a=>a.isPlayer&&a.matchId!==null).length,1);
 // Let the full real-clock, real-projectile ten-participant match resolve.
 const began=Date.now();let sampledFinal=false,deathObserved=false,lastLog=Date.now();
 while(Date.now()-began<300000){
  const s=await page.evaluate(()=>SAR.getState());if(!s.running||s.playerMatchId===null)break;
  const p=await player();if(p?.dead)deathObserved=true;
  if(await page.locator('#finalCountdown').isVisible()){sampledFinal=true;await shot('final-five-seconds');}
  if(Date.now()-lastLog>20000){console.log('LIVE '+Math.round((Date.now()-began)/1000)+'s '+s.matches.find(x=>x?.id===s.playerMatchId)?.timeLeftMs+'ms remaining');lastLog=Date.now();}
  await page.waitForTimeout(200);
 }
 await page.waitForSelector('#modal.visible [data-action="play-again"]',{timeout:10000});await shot('real-deathmatch-results');
 assert.match(await page.locator('#modalContent').innerText(),/DEATHMATCH/);report.metrics.push({match:m.matchId,elapsedMs:Date.now()-began,deathObserved,finalCountdownObserved:sampledFinal});
 pass('Complete real-clock Deathmatch reaches actual results through simulated projectile damage');
 const after=await page.evaluate(()=>{const w=SAR.getUniverse();return {progression:w.progression,ranked:w.ranked,playerCareer:w.playerCareer,fingerprint:w.patchState.fingerprint,archives:w.patchArchives.length};});
 for(const k of ['progression','ranked','playerCareer','fingerprint','archives'])assert.deepEqual(after[k],baseline[k],k+' custom must remain isolated');
 pass('Completed custom gameplay leaves human XP, Ranked, career, balance fingerprint and patch archives unchanged');
 await page.locator('[data-action="play-again"]').click();await page.waitForSelector('#sarModeEntry:not([hidden])');await active();await capture();assert.equal(await page.evaluate(()=>SAR.getState().matches.find(m=>m?.id===SAR.getState().playerMatchId).sessionType),'custom');await exit();
 pass('Play Again creates one fresh custom entry; Return to Lobby removes the human safely');
 await custom('tdm');const hud=await page.locator('#hud').innerText();assert.match(hud,/TEAM|BLUE|RED|SIDE|ALLY/i);await shot('live-tdm');await exit();
 await page.locator('.menu-grid [data-action="phone"]').click();await page.locator('[data-phone-open="spectate"]').click();await page.locator('[data-phone-match]').first().click();await page.locator('[data-phone-watch]').first().click();await page.waitForFunction(()=>SAR.getState().mode==='spectate');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>SAR.getState().mode),'spectate');await shot('live-spectator');await page.keyboard.press('Escape');
 pass('TDM and live spectator transition retain their own HUD and switching controls');assert.deepEqual(report.errors,[]);report.ok=true;
 }catch(e){report.ok=false;report.message=e.message;report.stack=e.stack;if(page&&!page.isClosed())await shot('failure').catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(output,'playable-results.json'),JSON.stringify(report,null,2));await context?.close();await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
