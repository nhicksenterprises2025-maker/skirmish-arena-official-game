'use strict';
// Layout acceptance only, not an FPS benchmark. The isolated browser response
// freezes combat updates while keeping the real renderer and UI active. Each
// mode starts through its existing game entry point on a disposable account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-overclock-ui'));
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
assert.equal(source.split('function update(dt,now){').length,2,'explicit layout-only fixture hook');
const fixture=`window.__OVERCLOCK_UI_TEST={state,input,refresh(){updateHud(gameNow());updateSpectatorHud(gameNow());updateCrosshairVisual(getPlayer());positionCrosshair();},start(mode){if(mode==='spectator')startSpectate(0);else if(mode==='deathmatch')startDeathmatch();else queueForMatch(mode==='ranked'?'ranked-tdm':'tdm');const match=getMatch(state.playerMatchId??state.spectateMatchId);if(match&&match.hasPlayer){match.status='active';state.countdownUntil=0;document.getElementById('matchCountdown').classList.add('hidden');}state.paused=false;this.refresh();},exit:exitGame,camera(){return {...state.camera};},aim(){return {aimX:input.aimX,aimY:input.aimY};},fullMap(value){input.fullMap=value;}};window.SAR = {`;
const instrumented=source.replace('function update(dt,now){','function update(dt,now){ return; // Layout fixture only.\n').replace('window.SAR = {',fixture);
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
let browser,context,page,base;const checks=[],errors=[],layouts=[],screenshots=[];
const modes=(process.env.SAR_UI_MODES||'tdm,deathmatch,ranked,spectator').split(',');
const viewports=(process.env.SAR_UI_VIEWPORTS||'1920x1080,1720x1080,1024x768,800x520').split(',').map(size=>size.split('x').map(Number));
const pass=name=>{checks.push(name);console.log('PASS '+name);};
function assertRetained(actual,expected,at='world'){
 // A normal restart selects new bot kits and creates zero-valued participant
 // rows. Preserve every existing counter; only the existing pick counters grow.
 if(expected===null||typeof expected!=='object'){assert.deepEqual(actual,expected,at);return;}
 if(Array.isArray(expected)){assert.deepEqual(actual,expected,at);return;}
 for(const [key,value] of Object.entries(expected)){if(key==='picks'&&typeof value==='number')assert.ok(actual[key]>=value,at+'.picks');else assertRetained(actual[key],value,at+'.'+key);}
}
const settle=()=>page.waitForTimeout(180);
const preserved=()=>page.evaluate(()=>{const w=SAR.getUniverse();return {progression:w.progression,ranked:w.ranked,rankedResults:w.rankedResults,playerCareer:w.playerCareer,bots:w.bots,patchState:w.patchState,patchArchives:w.patchArchives,seasons:w.seasons,playerSeasons:w.playerSeasons,weapons:SAR.getWeapons()};});
async function ready(){await page.waitForFunction(()=>window.SAR&&window.SAR25D&&SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>{SARFullscreen.setAutoEnter(false);return document.fonts.ready;});}
async function openSettings(section='gameplay'){await page.evaluate(section=>SAR.showSettings(section),section);await page.locator('[data-settings-section]').evaluateAll((els,section)=>els.forEach(el=>el.open=el.dataset.settingsSection===section),section);}
async function closeSettings(){await page.locator('#closeModal').click();await settle();}
async function setHud(size){await page.locator('#hudSize').evaluate((el,size)=>{el.value=String(size);el.dispatchEvent(new Event('input',{bubbles:true}));},size);assert.equal(await page.evaluate(()=>SAR.getConfig().hudSize),size);assert.equal((await page.locator('#hudSizeValue').innerText()).trim(),size+'%');const previewScale=await page.locator('.hud-preview-panel').evaluate(el=>el.getBoundingClientRect().width/el.offsetWidth);assert.ok(Math.abs(previewScale-size/100)<.01,'live preview must visibly scale on input');await page.locator('#hudSize').dispatchEvent('change');await settle();}
async function screenContract(){return page.evaluate(()=>{const rect=selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;},canvas=selector=>{const e=document.querySelector(selector);return {rect:rect(selector),width:e.width,height:e.height,transform:getComputedStyle(e).transform};},crosshair=document.getElementById('crosshair');return {game:canvas('#game'),world:canvas('#game3d'),labels:canvas('#game3dLabels'),camera:__OVERCLOCK_UI_TEST.camera(),aim:__OVERCLOCK_UI_TEST.aim(),centerWorld:SAR25D.screenToWorld(innerWidth/2,innerHeight/2),crosshair:{rect:rect('#crosshair'),gap:crosshair.style.getPropertyValue('--gap'),spread:crosshair.dataset.spread}};});}
async function layout(mode,size,width,height){return page.evaluate(({mode,size,width,height})=>{const selectors=mode==='spectator'?['#spectatorHud .spectate-top','#spectatorHud .spectate-help']:['#hud .topbar','#hud .player-hud','#hud .rank-card'];selectors.push('#game3dMap');const panels=selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth+2};}),mini=document.querySelector('#game3dMap'),r=mini.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width*.5,r.y+r.height*.5),textOverflow=[...document.querySelectorAll(mode==='spectator'?'#spectatorHud button,#spectatorHud strong,#spectatorHud small':'#hud .topbar strong,#hud .player-hud strong,#hud .rank-card strong')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+3).map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth}));return {mode,size,width,height,panels,textOverflow,minimap:{pointerEvents:getComputedStyle(mini).pointerEvents,hit:hit?.id||hit?.tagName}};},{mode,size,width,height});}
async function screenshot(name){const file='hud-'+name+'.png';await page.screenshot({path:path.join(out,file)});screenshots.push(file);}
function validateLayout(item){for(const p of item.panels){assert.ok(p.width>0&&p.height>0,'visible '+p.selector);assert.ok(p.x>=6&&p.y>=6&&p.right<=item.width-6&&p.bottom<=item.height-6,`${item.mode}/${item.size}/${item.width} safe bounds: ${JSON.stringify(p)}`);assert.equal(p.overflow,false,`${p.selector} content overflow`);}assert.deepEqual(item.textOverflow,[],`${item.mode}/${item.size}/${item.width} readable HUD text`);assert.equal(item.minimap.pointerEvents,'none');assert.notEqual(item.minimap.hit,'game3dMap');for(let i=0;i<item.panels.length;i++)for(let j=i+1;j<item.panels.length;j++){const a=item.panels[i],b=item.panels[j],overlap=a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;assert.equal(overlap,false,`${item.mode}/${item.size}/${item.width} ${a.selector} overlaps ${b.selector}`);}}
async function spectatorClicks(){const first=await page.evaluate(()=>SAR.getState().spectateMatchId);for(let i=0;i<4;i++){const next=page.locator('[data-spectator="next-match"]'),r=await next.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);assert.equal(await page.evaluate(()=>SAR.getState().spectateMatchId),(first+i+1)%4);}await page.locator('.spectate-controls summary').click();for(const action of ['tactical','25d']){const control=page.locator(`[data-spectator="${action}"]`),r=await control.boundingBox();assert.ok(r.x>=6&&r.y>=6);await page.mouse.click(r.x+r.width/2,r.y+r.height/2);assert.equal(await control.getAttribute('aria-pressed'),'true');}await page.locator('.spectate-controls summary').click();}
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 for(const mode of modes){
  context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});const auth=await context.request.post(base+'/api/auth/signup',{data:{username:'oc_'+mode+'_'+Date.now().toString(36),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base}});assert.equal(auth.status(),201);
  await context.route(/\/game\.js(?:\?|$)/,route=>route.fulfill({status:200,contentType:'text/javascript',body:instrumented}));page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(base+'/?diagnostics=1');await ready();
  assert.equal(await page.evaluate(()=>SAR.getConfig().hudSize),100);assert.equal(await page.evaluate(()=>SAR.getConfig().maximumFPS),0);
  await page.evaluate(mode=>__OVERCLOCK_UI_TEST.start(mode),mode);await settle();const protectedData=await preserved();
  for(const [width,height] of viewports){
   await page.setViewportSize({width,height});await page.evaluate(()=>__OVERCLOCK_UI_TEST.refresh());await settle();const baseline=await screenContract();
   for(const size of [75,100,140]){
    await openSettings();assert.deepEqual(await page.locator('.settings-tabs [role="tab"]').allTextContents(),['GAME','AUDIO','ACCOUNT','ABOUT']);assert.deepEqual(await page.locator('#hudSize').evaluate(el=>({min:el.min,max:el.max,step:el.step})),{min:'75',max:'140',step:'1'});
    const modalWidth=await page.locator('#modal .modal').evaluate(el=>el.getBoundingClientRect().width);await setHud(size);assert.equal(await page.locator('#modal .modal').evaluate(el=>el.getBoundingClientRect().width),modalWidth,'HUD size must not scale Settings');await closeSettings();await page.evaluate(()=>__OVERCLOCK_UI_TEST.refresh());await settle();
    assert.deepEqual(await screenContract(),baseline,`${mode}/${width}/${size} HUD scaling must not alter reticle, aim, camera, world or world-label canvas`);const item=await layout(mode,size,width,height);validateLayout(item);layouts.push(item);if(width<=1024||size===100)await screenshot(mode+'-'+width+'-'+size);if(mode==='spectator')await spectatorClicks();
   }
  }
  pass(mode+': 75%, 100%, 140% at '+viewports.map(([w,h])=>w+'×'+h).join(', ')+'; HUD safe bounds, no panel overlap, minimap pass-through and unchanged aim/world/reticle');
  if(mode==='tdm'){
   await page.setViewportSize({width:1024,height:768});await settle();
   let phoneBounds=null,mapBounds=null;
   for(const size of [75,140]){
    await openSettings();await setHud(size);const previewFits=await page.locator('.hud-preview-panel').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.bottom<=p.bottom;});assert.ok(previewFits,'live preview must not be cropped at HUD extremes');if(size===140){await page.locator('.hud-size-preview').scrollIntoViewIfNeeded();await screenshot('settings-1024-140');}await closeSettings();await page.evaluate(()=>__OVERCLOCK_UI_TEST.fullMap(true));await settle();
    const full=await page.locator('#game3dMap').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});if(mapBounds)assert.deepEqual(full,mapBounds,'HUD size must not scale the full map');else mapBounds=full;await page.evaluate(()=>__OVERCLOCK_UI_TEST.fullMap(false));
    await page.evaluate(()=>SARPhone.home());await page.waitForSelector('.phone-device');const phone=await page.locator('.phone-device').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,font:getComputedStyle(el).fontSize};});if(phoneBounds)assert.deepEqual(phone,phoneBounds,'HUD size must not scale Phone');else phoneBounds=phone;await closeSettings();
   }
   pass('Phone responsive bounds and full tactical-map framing stay identical at HUD extremes; live Settings preview inspected at 1024×768');
  }
  await openSettings();await page.locator('#resetHudSize').click();assert.equal(await page.evaluate(()=>SAR.getConfig().hudSize),100);assert.equal(await page.locator('#hudSize').inputValue(),'100');assert.equal((await page.locator('#hudSizeValue').innerText()).trim(),'100%');
  await setHud(113);await page.locator('[data-settings-section="view"]').evaluate(el=>el.open=true);assert.deepEqual(await page.locator('#maximumFPS option').evaluateAll(options=>options.map(o=>Number(o.value))),[60,120,144,165,200,240,300,360,0]);for(const value of [60,144,240,300,0]){await page.locator('#maximumFPS').selectOption(String(value));assert.equal(await page.evaluate(()=>SAR.getConfig().maximumFPS),value);}await page.locator('#maximumFPS').selectOption('144');
  assert.deepEqual(await preserved(),protectedData,'HUD/FPS settings cannot award XP/ELO or change careers, seasons, balance or historical telemetry');
  await page.evaluate(async()=>{await SARCloud.flush();await SARStorage.flush();});await page.reload();await ready();assert.equal(await page.evaluate(()=>SAR.getConfig().hudSize),113);assert.equal(await page.evaluate(()=>SAR.getConfig().maximumFPS),144);assertRetained(await preserved(),protectedData);
  await context.close();context=null;page=null;
 }
 pass('HUD reset, exact FPS options, live config application and settings persistence across reload in selected modes');
 pass('Four Settings tabs retained; configuration changes and reload preserve progression, ELO, careers, seasons, weapon constants and patch archives');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'overclock-ui-check.json'),JSON.stringify({ok:true,checks,errors,layouts,screenshots,method:'Isolated in-memory SQLite accounts and real Edge/WebGL renderer; combat updates frozen only in intercepted test response. Layout and input checks are not performance measurements.'},null,2));console.log(JSON.stringify({ok:true,groups:checks.length,layouts:layouts.length}));
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'overclock-ui-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'overclock-ui-check.json'),JSON.stringify({ok:false,checks,errors,layouts,message:error.message,stack:error.stack},null,2));throw error;}
 finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
