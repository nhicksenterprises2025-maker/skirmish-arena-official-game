'use strict';
// Real browser/account/SQLite acceptance. Only this test's game.js response is
// instrumented: simulation time is held still and existing combat hooks exposed.
// No reward balance, receipt, result counter or live account is fabricated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-blue-circuit-evidence'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sar-blue-browser-')),dbPath=path.join(temp,'fixture.sqlite'),profilePath=path.join(temp,'edge-profile');
fs.mkdirSync(out,{recursive:true});

const {createServer}=require('../server/index.cjs'),{createDatabase}=require('../server/db.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
assert.equal(source.split('if(!state.paused&&!document.hidden){').length,2,'One authoritative simulation loop');
const instrumented=source.replace('if(!state.paused&&!document.hidden){','if(!window.__BLUE_HOLD_SIMULATION&&!state.paused&&!document.hidden){').replace('window.SAR = {','window.__BLUE_TEST={state,fire,tryDash,respawnActor,applyDamage,endMatch,commitMatchXP,commitMatchRanked};window.SAR = {');
const checks=[],errors=[],saves=[];let app,context,page,base,port,accountId;
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const rewards=world=>({progression:world.progression,ranked:world.ranked,rankedResults:world.rankedResults});
async function startServer(){app=createServer({db:createDatabase(dbPath)});await new Promise(resolve=>app.server.listen(port||0,'127.0.0.1',resolve));port=app.server.address().port;base='http://127.0.0.1:'+port;}
async function stopServer(){if(!app)return;await new Promise(resolve=>app.server.close(resolve));app.db.close();app=null;}
async function startBrowser(browserProfile=profilePath){
 context=await chromium.launchPersistentContext(browserProfile,{headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block',...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 await context.addInitScript(()=>{window.__BLUE_HOLD_SIMULATION=true;});
 await context.route(/\/game\.js(?:\?|$)/,route=>route.fulfill({status:200,contentType:'text/javascript',body:instrumented}));
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 page.on('response',response=>{if(response.request().method()==='PUT'&&new URL(response.url()).pathname==='/api/world')saves.push(response.status());});
}
async function openGame(){await page.goto(base+'/?diagnostics=1');await page.waitForFunction(()=>window.SAR&&window.__BLUE_TEST&&window.SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));}
async function flush(){await page.evaluate(async()=>{await SARCloud.flush();await SARStorage.flush();});await page.waitForFunction(()=>!SARCloud.state.sending&&!SARCloud.state.dirty&&!SARCloud.state.saveRejected,null,{timeout:20000});}
async function snapshot(){return page.evaluate(()=>SAR.getUniverse());}
async function finishWithCombat(){
 return page.evaluate(()=>{
  const t=window.__BLUE_TEST,m=t.state.matches.find(row=>row?.hasPlayer),p=m?.participants.find(actor=>actor.isPlayer);if(!m||!p)throw Error('No allocated human match');
  m.status='active';m.countdownUntil=0;t.state.countdownUntil=0;document.getElementById('matchCountdown').classList.add('hidden');for(const a of m.participants){a.spawnFlash=0;a.dead=false;}
  const enemy=m.participants.find(a=>a.team!==p.team);if(!enemy)throw Error('Fixture needs an opposing participant');
  if(!t.fire(p,0,10000)||!t.tryDash(p,1,0,10000))throw Error('Real fire/dash hooks did not activate');
  // Existing resolved-damage and respawn hooks drive all 60 lethal events.
  // They execute normal combat/score/finalization, without writing statistics.
  let impacts=0;while(m.status==='active'&&impacts<60){if(enemy.dead)t.respawnActor(enemy);enemy.spawnFlash=0;t.applyDamage(enemy,{owner:p,weapon:p.slots[0].name,travel:1},250,false,11000+impacts*1000);impacts++;}
  if(impacts!==60||m.result?.reason!=='score')throw Error('The real 60-kill limit did not finalize');
  t.completed=m;return {matchId:m.matchId,participantId:p.participantId,impacts,score:[...m.score],xp:m.xpAward?.units||0,rating:m.rankedAwards?.[p.participantId]?.appliedUnits||0,resultFrozen:Object.isFrozen(m.result)};
 });
}
(async()=>{try{
 await startServer();await startBrowser();
 const username='blue_'+Date.now().toString(36),password=crypto.randomBytes(18).toString('hex'),signup=await context.request.post(base+'/api/auth/signup',{data:{username,password},headers:{origin:base}});
 assert.equal(signup.status(),201);accountId=(await signup.json()).account.id;
 await openGame();await flush();const initial=await snapshot();assert.equal(initial.progression.totalXPUnits,0);
 await page.locator('.menu-grid [data-action="play"]').click();await page.waitForSelector('[data-action="play-ranked"]');
 assert.deepEqual(await page.locator('.play-modes button strong').allTextContents(),['TEAM DEATHMATCH','RANKED','DEATHMATCH','CUSTOM']);
 await page.screenshot({path:path.join(out,'blue-circuit-play.png')});await page.locator('[data-action="play-ranked"]').click();
 await page.waitForFunction(()=>SAR.getState().matches.some(m=>m?.hasPlayer&&m.sessionType==='ranked'));
 await flush();const mode=await page.evaluate(()=>SAR.getState().matches.find(m=>m?.hasPlayer));assert.equal(mode.mode,'tdm');assert.equal(mode.eligible,true);
 pass('Real Play → Ranked navigation allocates the existing TDM match with the signed-in stable identity');

 // Fail one actual world checkpoint to exercise durable offline/retry behavior.
 let rejectedCheckpoint=false;
 await page.route('**/api/world',async route=>{if(route.request().method()==='PUT'&&!rejectedCheckpoint){rejectedCheckpoint=true;await route.abort('connectionfailed');}else await route.continue();});
 const completed=await finishWithCombat();assert.equal(completed.participantId,accountId);assert.equal(completed.xp,48520);assert.equal(completed.rating,23010);assert.equal(completed.resultFrozen,true);
 await page.waitForSelector('#modalContent[data-view="results"]');await page.waitForFunction(()=>SARCloud.state.localMode===true,null,{timeout:10000});
 assert.ok(rejectedCheckpoint);await page.evaluate(()=>SARStorage.flush());
 const earned=await snapshot(),earnedRewards=rewards(earned);assert.equal(earned.playerCareer.games,initial.playerCareer.games+1);assert.equal(earned.playerCareer.kills,initial.playerCareer.kills+60);
 assert.equal(Object.keys(earned.ranked.participants).length,10);assert.equal(earned.progression.totalXPUnits,48520);assert.equal(earned.ranked.participants[accountId].ratingUnits,23010);
 await page.screenshot({path:path.join(out,'blue-circuit-ranked-result.png')});
 pass('60 resolved lethal events finalize exact485.2 XP/230.1 ELO; the real failed checkpoint retains complete local rewards');

 await page.locator('[data-action="close-result"]').click();await page.locator('#cloudBadge').click();await page.locator('#cloudAccountMenu [data-action="player-profile"]').click();
 await page.waitForSelector('#modalContent[data-view="player-profile"]');const profileText=await page.locator('#modalContent').innerText();assert.match(profileText,/485\.2/);assert.equal(await page.locator('.profile-ranked strong').innerText(),'Beginner III');assert.match(await page.locator('.profile-ranked').innerText(),/230\.1 ELO/);await page.locator('.profile-progression').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'blue-circuit-profile.png')});
 await page.evaluate(()=>{const t=__BLUE_TEST,m=t.completed;t.endMatch(m,1-m.winner,'time');t.commitMatchXP(m);t.commitMatchRanked(m);SAR.openPlayerProfile();});assert.deepEqual(rewards(await snapshot()),earnedRewards);
 pass('Profile immediately displays canonical XP/rank; repeated finalization and Profile reopening award nothing twice');

 await page.evaluate(()=>SARCloud.reconnect());await flush();assert.equal(await page.evaluate(()=>SARCloud.state.localMode),false);
 for(let i=0;i<2;i++){await page.evaluate(()=>SARCloud.queueSave(SAR.getUniverse()));await flush();}
 const remoteResponse=await context.request.get(base+'/api/world');assert.equal(remoteResponse.status(),200);const remote=(await remoteResponse.json()).world;assert.deepEqual(rewards(remote.save),earnedRewards);assert.equal(remote.save.playerCareer.games,earned.playerCareer.games);
 pass('Offline checkpoint reconnects; repeated authenticated server writes preserve identical append-only XP/ELO receipts');

 await context.close();context=null;await stopServer();await startServer();await startBrowser();await openGame();await flush();
 assert.equal(await page.evaluate(()=>SARCloud.state.account.id),accountId);assert.deepEqual(rewards(await snapshot()),earnedRewards);
 await page.locator('#cloudBadge').click();await page.locator('#cloudAccountMenu [data-action="player-profile"]').click();assert.equal(await page.locator('.profile-ranked strong').innerText(),'Beginner III');assert.match(await page.locator('.profile-ranked').innerText(),/230\.1 ELO/);await page.locator('#closeModal').click();
 pass('Full browser and SQLite backend restart restores the same authenticated account, XP, rank, receipts and Profile');

 const beforeCustom=await snapshot();await page.locator('.menu-grid [data-action="play"]').click();await page.locator('[data-action="play-custom"]').click();await page.locator('#customBot0').selectOption('random');await page.locator('#customTeam0').selectOption('1');await page.locator('[data-action="start-custom"]').click();
 const custom=await finishWithCombat();assert.equal(custom.xp,0);assert.equal(custom.rating,0);await page.waitForSelector('#modalContent[data-view="results"]');await flush();const afterCustom=await snapshot();
 assert.deepEqual(rewards(afterCustom),earnedRewards);assert.deepEqual(afterCustom.playerCareer,beforeCustom.playerCareer);assert.deepEqual(afterCustom.bots,beforeCustom.bots);
 await page.screenshot({path:path.join(out,'blue-circuit-custom-result.png')});
 pass('A real custom 60-kill result leaves XP, ELO, discoveries, careers and bot familiarity untouched');

 // A separate pre-ranked fixture has legitimately earned XP, rather than a
 // balance inserted by hand. Remove only the new schema/receipt metadata to
 // represent the prior application's saved format.
 await context.close();context=null;await startBrowser(path.join(temp,'legacy-profile'));
 const legacySignup=await context.request.post(base+'/api/auth/signup',{data:{username:'legacy_'+Date.now().toString(36),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base}});assert.equal(legacySignup.status(),201);const legacyId=(await legacySignup.json()).account.id;
 const e=require('./simulate.cjs').engine();e.context.SARCloud.state={account:{id:legacyId}};e.dev.queueForMatch();const legacyMatch=e.dev.inspect().state.matches.find(m=>m?.hasPlayer),legacyPlayer=legacyMatch.participants.find(a=>a.isPlayer);legacyMatch.status='active';legacyPlayer.spawnFlash=0;e.dev.fire(legacyPlayer,0,10000);e.dev.endMatch(legacyMatch,legacyPlayer.team,'time');e.ui.flush();
 const legacyWorld=e.context.SAR.getUniverse();delete legacyWorld.ranked;delete legacyWorld.rankedResults;
 for(const receipt of Object.values(legacyWorld.progression.awards))for(const key of ['participantId','track','transactionKey','rulesVersion','sessionType','eligible','practice'])delete receipt[key];
 assert.ok(legacyWorld.progression.totalXPUnits>0);require('../server/world.cjs').writeWorld(app.db,legacyId,legacyWorld,0);
 await openGame();await flush();const migrated=await snapshot();assert.deepEqual(migrated.progression,legacyWorld.progression);assert.deepEqual(migrated.playerCareer,legacyWorld.playerCareer);assert.deepEqual(migrated.ranked,{version:1,participants:{}});
 const backup=await page.evaluate(()=>SARStorage.get('sar-ranked-migration-original'));assert.ok(backup);const original=JSON.parse(backup);assert.equal(original.ranked,undefined);assert.deepEqual(original.progression,legacyWorld.progression);assert.deepEqual(original.playerCareer,legacyWorld.playerCareer);
 const backupCount=()=>Number(app.db.prepare("SELECT count(*) AS n FROM world_backups WHERE user_id=? AND reason='before ranked progression migration'").get(legacyId).n);assert.equal(backupCount(),1);
 await page.reload();await page.waitForFunction(()=>window.SAR&&window.SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await flush();assert.equal(await page.evaluate(()=>SARStorage.get('sar-ranked-migration-original')),backup);assert.deepEqual((await snapshot()).progression,legacyWorld.progression);assert.equal(backupCount(),1);
 pass('Existing earned XP and career migrate unchanged; recoverable local/server originals are preserved exactly once across reload');
 assert.equal(errors.length,0,errors.join('\n'));assert.ok(saves.length>=4);assert.ok(saves.every(status=>status===200),JSON.stringify(saves));
 fs.writeFileSync(path.join(out,'blue-circuit-browser-check.json'),JSON.stringify({ok:true,checks,pageErrors:errors,successfulWorldWrites:saves.length,ranked:{resolvedLethalEvents:completed.impacts,xp:completed.xp/100,elo:completed.rating/100,rank:'Beginner III'},method:'Isolated Edge profile and SQLite account; test-only loop freeze and access to existing resolved combat hooks; production reward, Profile, network, IndexedDB and server validation code unchanged.'},null,2));
 console.log(JSON.stringify({ok:true,groups:checks.length,successfulWorldWrites:saves.length}));
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'blue-circuit-browser-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'blue-circuit-browser-check.json'),JSON.stringify({ok:false,checks,errors,message:error.message,stack:error.stack},null,2));throw error;}
 finally{await context?.close();await stopServer();const resolved=fs.realpathSync(temp),root=fs.realpathSync(os.tmpdir());assert.ok(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('sar-blue-browser-'));fs.rmSync(resolved,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
