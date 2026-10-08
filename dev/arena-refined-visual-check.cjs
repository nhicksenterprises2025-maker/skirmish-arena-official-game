'use strict';
// Real exported models and existing UI, isolated account. Before views route the
// archived Audit 2 assets; controlled HUD fixtures freeze combat, never user data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const phase=process.argv[2]||'after';assert.ok(['before','after'].includes(phase));
const root=path.resolve(__dirname,'..'),baseline=process.env.SAR_VISUAL_BASELINE||'C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/arena-refined-audit-3/before';
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-arena-refined-visual',phase));fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(phase==='before'?path.join(baseline,'game.js'):path.join(root,'game.js'),'utf8');
const fixture=source.replace('function update(dt,now){','function update(dt,now){return; // Isolated visual fixture.\n').replace('window.SAR = {','window.__AuditVisual={queue:queueForMatch,exit:exitGame,scoreboard:renderScoreboard,metrics:weaponDisplayMetrics};window.SAR = {');
assert.notEqual(fixture,source);
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
const checks=[],errors=[],surfaces=[],pass=name=>{checks.push(name);console.log('PASS '+name);};let browser,page;
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function start(mode){
 await page.evaluate(mode=>{
  __AuditVisual.exit();document.getElementById('modal').classList.remove('visible');
  if(mode==='tdm')__AuditVisual.queue();else if(mode==='deathmatch')SAR.startDeathmatch();else if(mode==='ranked')SAR.startRanked();
  else if(mode==='custom')SAR.startCustomMatch({mode:'tdm',player:true,bots:Object.values(SAR.getProfiles()).slice(0,9).map((p,i)=>({sourceBotId:p.id,team:i<4?0:1}))});
  else if(mode==='tournament'){
   const profiles=Object.values(SAR.getProfiles()).slice(0,9),owner=SARCloud.state.account;
   SAR.startTournamentGame({tournamentId:'audit3-visual',tournamentKind:'official',seriesId:'visual-series',gameId:'visual-game',hasPlayer:true,teamIds:['a','b'],teams:[{participants:[{id:owner.id,kind:'user',name:owner.username},...profiles.slice(0,4).map(p=>({id:p.id,kind:'bot',name:p.name}))]},{participants:profiles.slice(4).map(p=>({id:p.id,kind:'bot',name:p.name}))}]});
  }else SAR.watchMatch(2);
  document.getElementById('matchCountdown').classList.add('hidden');document.getElementById('pause').classList.remove('visible');
 },mode);
 await page.waitForTimeout(150);
}
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'');
  if(relative==='game.js'){await route.fulfill({contentType:'text/javascript',body:fixture});return;}
  if(phase==='before'){
   const file=path.resolve(baseline,relative);if(file.startsWith(path.resolve(baseline)+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});return;}
  }await route.continue();
 });
 const auth=await context.request.post(base+'/api/auth/signup',{data:{username:'visual_'+crypto.randomBytes(6).toString('hex'),password:crypto.randomBytes(20).toString('hex')},headers:{origin:base}});assert.equal(auth.status(),201);
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?diagnostics=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SAR&&window.SAR25D&&!document.getElementById('sarBoot'));await page.bringToFront();await page.evaluate(()=>SARFullscreen.setAutoEnter(false));
 await page.waitForTimeout(750);await shot('lobby');
 await page.locator('.menu-grid [data-action="loadout"]').click();await page.waitForSelector('[data-weapon-card="AK47"]');
 const ak=page.locator('[data-weapon-card="AK47"]');await ak.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-weapon-card="AK47"] canvas').dataset.previewReady==='true');await ak.screenshot({path:path.join(output,'ak-loadout.png')});
 await page.locator('[data-weapon-card="AR-15"]').scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.locator('[data-weapon-card="AR-15"]').screenshot({path:path.join(output,'loadout-bars.png')});
 const metrics=await page.evaluate(()=>Object.fromEntries(Object.keys(SAR.getWeapons()).map(name=>[name,__AuditVisual.metrics(name)])));
 fs.writeFileSync(path.join(output,'bar-metrics.json'),JSON.stringify(metrics,null,2));
 if(phase==='after'){
  const beforeFile=path.join(path.dirname(output),'before','bar-metrics.json');if(fs.existsSync(beforeFile))assert.deepEqual(metrics,JSON.parse(fs.readFileSync(beforeFile,'utf8')),'Exact numbers and existing normalization unchanged');
  for(const rows of Object.values(metrics))for(const row of rows){assert.equal(row.ratio,row.maximum>0?Math.max(0,Math.min(1,row.shorter?1-row.value/row.maximum:row.value/row.maximum)):1);}
  const reloads=Object.values(metrics).map(rows=>rows.find(r=>r.key==='reload')).sort((a,b)=>a.value-b.value);assert.ok(reloads[0].ratio>reloads.at(-1).ratio);
  const colors=await page.locator('.weapon-stat-bars>div').evaluateAll(rows=>rows.map(row=>({width:parseFloat(row.querySelector('i').style.width),hue:parseFloat(row.querySelector('.stat-track').style.getPropertyValue('--stat-fill').slice(4)),exact:row.querySelector('dd').textContent})));for(const c of colors){assert.ok(c.exact);assert.ok(Math.abs(c.hue-c.width*1.2)<.1);}assert.ok(new Set(colors.map(c=>c.hue)).size>8);
 }pass('Exact weapon numbers and shared normalized bars remain intact; lower time metrics have stronger performance');
 await page.locator('#closeModal').click();
 for(const mode of ['tdm','deathmatch','ranked','tournament','custom','spectator']){
  await start(mode);const selector=mode==='spectator'?'#spectatorHud .spectate-top':'#hud .topbar';
  const colors=await page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return {panel:s.backgroundColor,text:s.color,accent:s.borderLeftColor};});surfaces.push({mode,...colors});
  if(phase==='after')assert.match(colors.panel,/24, 32, 25|27, 36, 31/);await shot('hud-'+mode);
  await page.evaluate(()=>{__AuditVisual.scoreboard();document.getElementById('scoreboard').classList.remove('hidden');});const scoreboard=await page.locator('#scoreboard').evaluate(el=>getComputedStyle(el).backgroundColor);if(phase==='after')assert.match(scoreboard,/24, 32, 25|27, 36, 31/);await shot('scoreboard-'+mode);await page.evaluate(()=>document.getElementById('scoreboard').classList.add('hidden'));
 }pass('TDM, Deathmatch, ranked, tournament, custom and spectator HUD/scoreboard panels retain semantics with approved neutral surfaces');
 await start('tdm');await page.keyboard.press('Escape');await page.waitForSelector('#pause.visible');await page.waitForTimeout(300);await shot('pause');
 const button=await page.locator('#pause button.primary').evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundColor,text:s.color};});
 const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(n=>{const v=Number(n)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
 if(phase==='after'){assert.equal(button.background,'rgb(89, 108, 72)');assert.ok((luminance(button.text)+.05)/(luminance(button.background)+.05)>=4.5,'Resume text retains readable contrast');}
 await page.locator('#pause [data-action="settings"]').click();await page.waitForSelector('#modal.visible');await page.waitForTimeout(300);await shot('in-match-settings');
 const settingsPanel=await page.locator('#modal>.modal').evaluate(el=>getComputedStyle(el).backgroundColor);if(phase==='after')assert.match(settingsPanel,/236, 239, 230|224, 229, 216/);
 await page.locator('#closeModal').click();pass('Pause and in-match Settings use neutral surfaces and readable green primary controls');
 await start('spectator');await page.locator('#spectatorHud details>summary').click();await page.locator('[data-spectator="loadout"]').click();await page.waitForFunction(()=>document.querySelector('#modal canvas[data-weapon-preview]')?.dataset.previewReady==='true');await page.waitForTimeout(300);await shot('in-match-loadout');
 const previewBackground=await page.locator('#modal canvas[data-weapon-preview]').first().evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data));if(phase==='after')assert.deepEqual(previewBackground,[224,229,216,255],'In-match model preview inherits the neutral modal theme');await page.locator('#closeModal').click();pass('Spectator loadout canvases inherit their panel theme without a blue background block');
 await page.evaluate(()=>__AuditVisual.exit());assert.deepEqual(errors,[]);pass('No browser errors or broken preview/card interactions');
 fs.writeFileSync(path.join(output,'visual-results.json'),JSON.stringify({ok:true,phase,checks,errors,surfaces,gameSHA256:crypto.createHash('sha256').update(source).digest('hex')},null,2));
}catch(error){if(page)await shot('failure').catch(()=>{});console.error(error);fs.writeFileSync(path.join(output,'visual-results.json'),JSON.stringify({ok:false,phase,checks,errors,error:String(error.stack)},null,2));process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}})();
