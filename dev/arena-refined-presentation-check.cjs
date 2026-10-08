'use strict';
// Shipped Phone/HUD rendering in an isolated account. Freeze only combat so
// score, waiting and cooldown fixtures cannot award progress or race assertions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const fixture=source.replace('function update(dt,now){','function update(dt,now){return; // Isolated presentation fixture.\n').replace('window.SAR = {',`window.__auditPresentation={
  scoreboard:renderScoreboard,
  waiting(id,count=0){const m=getMatch(id);m.fixtureParticipants??=m.participants.slice();for(const a of m.fixtureParticipants)a.matchId=null;m.participants=m.fixtureParticipants.slice(0,count);for(const a of m.participants)a.matchId=id;m.status='waiting';m.waitReason='tournament-reservations';m.requiredParticipants=10;m.availableParticipants=count;updateSpectatorHud(gameNow());},
  cooldown(id){const m=getMatch(id);m.status='cooldown';m.cooldownUntil=wallNow()+15000;},
  modeRecords(){const name=BOT_NAMES[0];careerFor(name).kills=17;careerFor(name).games=3;const dm=SAVE.modeStats.deathmatch.bots[name]??=blankBotCareer(name);dm.kills=23;dm.games=4;return name;}
};window.SAR = {`);
assert.notEqual(fixture,source);
const out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-arena-refined-presentation'));fs.mkdirSync(out,{recursive:true});
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
const checks=[],errors=[],pass=name=>{checks.push(name);console.log('PASS '+name);};let browser,page;
(async()=>{try{
 const engineSource=source.replace('window.SAR = {','window.__auditResult={snapshotResult,sessionResultHtml};window.SAR = {'),e=require('./simulate.cjs').engine({},engineSource);
 for(const m of e.dev.inspect().state.matches){m.endedAt=e.dev.now()+1000;m.endReason='score';if(m.mode==='deathmatch'){m.participants[0].stats.kills=30;m.winner=m.participants[0].id;}else{m.score=[60,12];m.winner=0;}const html=e.context.__auditResult.sessionResultHtml(e.context.__auditResult.snapshotResult(m));
  if(m.mode==='deathmatch'){assert.match(html,/<th>PLACE<\/th>/);assert.match(html,/Winner:/);assert.doesNotMatch(html,/<th>TEAM<\/th>|BLUE 60|RED 12/);}else{assert.match(html,/<th>TEAM<\/th>/);assert.match(html,/BLUE 60/);assert.match(html,/RED 12/);}}
 pass('Both background Deathmatch result formatters use placement/winner; both TDM formatters retain team outcomes');
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const auth=await context.request.post(base+'/api/auth/signup',{data:{username:'audit2_'+Date.now().toString(36),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base}});assert.equal(auth.status(),201);
 await context.route(/\/game\.js(?:\?|$)/,route=>route.fulfill({status:200,contentType:'text/javascript',body:fixture}));
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/?diagnostics=1');
 await page.waitForFunction(()=>window.SARPhone&&window.SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));
 const initial=await page.evaluate(()=>({xp:SAR.getProgression().totalXP,weapons:SAR.getWeapons(),fingerprint:SAR.getUniverse().patchState.fingerprint}));
 await page.locator('[data-action="phone"]').click();await page.locator('[data-phone-open="scores"]').click();
 assert.equal(await page.locator('.phone-match-card[data-mode="tdm"]').count(),2);assert.equal(await page.locator('.phone-match-card[data-mode="deathmatch"]').count(),2);
 assert.match(await page.locator('.phone-scheduler').innerText(),/2 TDM · 2 Deathmatch\s+40 active participants · 10 in waiting pool/);
 const states=await page.evaluate(()=>SAR.getState().matches.slice(0,4));assert.deepEqual(states.map(m=>m.participants),[10,10,10,10]);
 for(const m of states){const card=page.locator(`[data-phone-match="${m.id}"]`);assert.match(await card.innerText(),new RegExp('10 / 10 participants · '+m.limit+' kills'));assert.equal(await card.locator('.phone-team-score').count(),m.mode==='tdm'?1:0);assert.equal(m.durationMs,m.mode==='tdm'?300000:240000);}
 await page.screenshot({path:path.join(out,'two-tdm-two-deathmatch.png')});
 pass('Phone exposes 2 TDM + 2 Deathmatch, 10 participants each, goals/clocks and honest waiting-pool summary');
 await page.locator('[data-phone-filter]').selectOption('deathmatch');assert.equal(await page.locator('.phone-match-card').count(),2);await page.locator('.phone-match-card').first().click();
 assert.equal(await page.locator('.phone-ffa-standings li').count(),10);assert.equal(await page.locator('.phone-team-score').count(),0);await page.locator('#closeModal').click();
 pass('Deathmatch filter/detail shows ten individual standings with no team-score cards');
 for(const m of states){assert.equal(await page.evaluate(id=>SAR.watchMatch(id),m.id),true);assert.equal(await page.locator('#spectatorHud').getAttribute('data-mode'),m.mode);await page.locator('.spectate-controls details').evaluate(el=>el.open=true);
  const score=await page.locator('#spectateScore').innerText(),heading=await page.locator('#spectateScoreHeading').innerText();
  if(m.mode==='deathmatch'){assert.match(score,/KILLS.*LEADER/);assert.doesNotMatch(score,/BLUE|RED/);assert.match(heading,/PLACE 1\/10 · TARGET 30/);assert.equal(await page.locator('[data-spectator="blue"]').isVisible(),false);assert.equal(await page.locator('[data-spectator="red"]').isVisible(),false);}
  else{assert.match(score,/BLUE 0.*RED 0/);assert.equal(heading,'TARGET 60');assert.equal(await page.locator('[data-spectator="blue"]').isVisible(),true);}
  await page.evaluate(()=>__auditPresentation.scoreboard());assert.equal(await page.locator('#scoreGroupHeading').innerText(),m.mode==='deathmatch'?'Place':'Team');assert.equal(await page.locator('#scoreRows .score-row').count(),10);
  assert.match(await page.locator(`[data-spectator-match="${m.id}"]`).getAttribute('aria-label'),new RegExp(m.mode==='deathmatch'?'Deathmatch':'Team Deathmatch'));
 }
 await page.screenshot({path:path.join(out,'deathmatch-spectator-hud.png')});
 pass('Every spectator selector shows mode-correct scores, targets, FFA placement/team controls and ten scoreboard rows');
 const dm=states.find(m=>m.mode==='deathmatch');await page.evaluate(id=>{SAR.watchMatch(id);__auditPresentation.waiting(id);},dm.id);
 assert.equal(await page.locator('#spectateName').innerText(),'WAITING FOR PARTICIPANTS');assert.equal(await page.locator('#spectateName').getAttribute('data-bot-profile'),null);
 assert.equal(await page.locator('#spectateScore').innerText(),'WAITING FOR PARTICIPANTS');assert.equal(await page.locator('#spectateClock').innerText(),'WAITING');assert.equal(await page.locator('#spectateWeapon').innerText(),'—');assert.equal(await page.locator('[data-spectator="stats"]').isDisabled(),true);
 await page.evaluate(id=>{__auditPresentation.waiting(id,6);SARPhone.open('scores');SARPhone.back();},dm.id);await page.locator('[data-phone-filter]').selectOption('all');await page.locator(`[data-phone-match="${dm.id}"]`).click();
 assert.match(await page.locator('.phone-match-detail').innerText(),/6 \/ 10 bots available · Tournament reservations active/);assert.equal(await page.locator('[data-phone-watch]').isDisabled(),true);assert.equal(await page.locator('.phone-team-score,.phone-ffa-standings').count(),0);
 await page.screenshot({path:path.join(out,'reserved-slot-waiting.png')});
 pass('Reserved empty slots keep their mode, show truthful availability, disable Watch and clear stale spectator identity/scores');
 await page.locator('[data-phone-action="back"]').click();const tdm=states.find(m=>m.mode==='tdm');await page.evaluate(id=>__auditPresentation.cooldown(id),tdm.id);await page.evaluate(()=>SARPhone.open('scores'));
 const cooldown=page.locator(`[data-phone-match="${tdm.id}"]`);assert.match(await cooldown.innerText(),/COMPLETE.*Next match in 15s/s);assert.match(await cooldown.innerText(),/TEAM DEATHMATCH.*60 KILLS/s);await cooldown.click();assert.equal(await page.locator('[data-phone-watch]').isDisabled(),true);
 await page.locator('[data-phone-action="home"]').click();const bot=await page.evaluate(()=>__auditPresentation.modeRecords());await page.locator('[data-phone-open="bots"]').click();
 const botRow=()=>page.locator(`[data-bot-profile="${bot}"]`).locator('xpath=ancestor::details');const kills=()=>botRow().evaluate(row=>[...row.querySelectorAll('dl > div')].find(el=>el.querySelector('dt')?.textContent==='Kills')?.querySelector('dd')?.textContent);
 assert.equal(await kills(),'17');await page.locator('[data-phone-bot-mode]').selectOption('deathmatch');assert.equal(await kills(),'23');assert.equal(await page.locator('.phone-stat-row').count(),50);
 await page.locator(`[data-bot-profile="${bot}"]`).click();assert.match(await page.locator('#modalContent').innerText(),/TEAM DEATHMATCH CAREER.*DEATHMATCH CAREER/s);assert.equal(await page.locator('[data-message-thread]').count(),0);
 await page.locator('[data-phone-workspace="back"]').click();assert.equal(await page.locator('[data-phone-bot-mode]').inputValue(),'deathmatch');await page.locator('[data-phone-expand]').click();await page.locator('[data-bot-mode="tdm"]').click();assert.equal(await page.locator('[data-bot-mode="tdm"]').getAttribute('aria-selected'),'true');await page.locator('[data-phone-workspace="back"]').click();assert.equal(await page.locator('[data-phone-bot-mode]').inputValue(),'tdm');assert.equal(await kills(),'17');
 pass('Bot Leaderboard separates existing TDM/Deathmatch records in compact/expanded views, preserves mode on return, and profiles have no retired Message link');
 assert.deepEqual(await page.evaluate(()=>({xp:SAR.getProgression().totalXP,weapons:SAR.getWeapons(),fingerprint:SAR.getUniverse().patchState.fingerprint})),initial);assert.deepEqual(errors,[]);
 pass('Cooldown preserves slot mode/target and disables entry; rendering/navigation leaves XP, constants and telemetry fingerprint intact');
 fs.writeFileSync(path.join(out,'presentation-results.json'),JSON.stringify({ok:true,checks,errors,method:'Real Edge/WebGL; isolated in-memory account; shipped presentation and scheduler initialization with only combat updates frozen.'},null,2));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'presentation-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'presentation-results.json'),JSON.stringify({ok:false,checks,errors,message:error.message,stack:error.stack},null,2));throw error;}finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
