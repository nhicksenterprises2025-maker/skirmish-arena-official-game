'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [exeArg, serverOrigin='http://127.0.0.1:8806', outputArg] = process.argv.slice(2);
if (!exeArg || !outputArg) throw Error('Usage: node scripts/native-check.cjs <launcher.exe> <test-server-origin> <results.json>');
const driver = process.env.SAR_WEBDRIVER || 'http://127.0.0.1:4450';
let sessionId = null;
const results = {nativeApp: path.resolve(exeArg), serverOrigin, checks: {}};
async function request(method, route, data) {
  const response = await fetch(driver + route, {method, headers: {'content-type':'application/json'}, body: data === undefined ? undefined : JSON.stringify(data)});
  const answer = await response.json();
  if (answer.value?.error) throw Error(answer.value.message);
  return answer.value;
}
async function start() {
  const response = await request('POST', '/session', {capabilities:{alwaysMatch:{'tauri:options':{application:path.resolve(exeArg),webviewOptions:{userDataFolder:path.join(path.dirname(path.resolve(outputArg)),'native-webdriver-profile')}}}}});
  sessionId = response.sessionId;
  await request('POST', '/session/' + sessionId + '/timeouts', {script:30000, implicit:0, pageLoad:30000});
}
const run = (script, args=[]) => request('POST', '/session/' + sessionId + '/execute/sync', {script, args});
const asyncRun = (script, args=[]) => request('POST', '/session/' + sessionId + '/execute/async', {script, args});
async function poll(script, args=[], timeout=25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await run(script, args);
    if (value) return value;
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error('Timed out waiting for native UI.');
}
async function stop() {
  if (sessionId) {
    const handles=await request('GET','/session/'+sessionId+'/window/handles').catch(()=>[]);
    for(const handle of handles.slice().reverse()) {
      await request('POST','/session/'+sessionId+'/window',{handle}).catch(()=>{});
      await request('DELETE','/session/'+sessionId+'/window').catch(()=>{});
    }
    await request('DELETE','/session/'+sessionId).catch(()=>{}); sessionId=null;
  }
}
async function switchGame() {
  const until=Date.now()+25000;
  while(Date.now()<until) {
    const handles=await request('GET','/session/'+sessionId+'/window/handles');
    for(const handle of handles){
      await request('POST','/session/'+sessionId+'/window',{handle});
      if((await request('GET','/session/'+sessionId+'/url')).startsWith(serverOrigin))return;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error('Game window did not navigate to the account server.');
}
(async()=>{
  try {
    await start();
    const expectedVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src-tauri/tauri.conf.json'), 'utf8')).version;
    assert.equal(await run('return document.querySelector("#version").textContent;'), expectedVersion);
    results.checks.nativeLauncherLoaded = true;
    const save = await asyncRun('const done=arguments[arguments.length-1]; window.__TAURI__.core.invoke("save_server",{serverOrigin:arguments[0]}).then(()=>done({ok:true})).catch(error=>done({error:String(error)}));', [serverOrigin]);
    assert.equal(save.ok,true,JSON.stringify(save));
    await run('document.querySelector("#server").value=arguments[0];document.querySelector("#server-form").requestSubmit();', [serverOrigin]);
    await poll('return document.querySelector("#connection").textContent==="Arena server online";');
    results.checks.nativeServerStatus = true;
    const width = await run('return {view:innerWidth,page:document.documentElement.scrollWidth};');
    assert.ok(width.page<=width.view);
    results.checks.noHorizontalOverflow = true;
    const screenshot = await request('GET','/session/'+sessionId+'/screenshot');
    fs.writeFileSync(path.join(path.dirname(path.resolve(outputArg)), 'launcher-native.png'), Buffer.from(screenshot,'base64'));
    await run('document.querySelector("#play").click();');
    await switchGame();
    assert.ok((await request('GET','/session/'+sessionId+'/url')).startsWith(serverOrigin));
    results.checks.playUsesSameAccountOrigin = true;
    const fullscreen = await asyncRun('const done=arguments[arguments.length-1]; window.__TAURI__.core.invoke("game_fullscreen_state").then(done).catch(error=>done({error:String(error)}));');
    assert.equal(fullscreen.fullscreen, true, JSON.stringify(fullscreen));
    results.checks.nativeGameStartsFullscreen = true;
    const fullscreenOff = await asyncRun('const done=arguments[arguments.length-1]; window.__TAURI__.core.invoke("set_game_fullscreen", {fullscreen:false}).then(done).catch(error=>done({error:String(error)}));');
    assert.equal(fullscreenOff.fullscreen, false, JSON.stringify(fullscreenOff));
    const fullscreenOn = await asyncRun('const done=arguments[arguments.length-1]; window.__TAURI__.core.invoke("set_game_fullscreen", {fullscreen:true}).then(done).catch(error=>done({error:String(error)}));');
    assert.equal(fullscreenOn.fullscreen, true, JSON.stringify(fullscreenOn));
    results.checks.nativeFullscreenControlsWork = true;
    await poll('return !!document.querySelector("#cloudUsername") || !document.querySelector("#cloudBadge")?.classList.contains("hidden");');
    let name='Launcher_'+crypto.randomBytes(4).toString('hex');
    if(await run('return !!document.querySelector("#cloudUsername");')) {
      const password=crypto.randomBytes(18).toString('hex');
      await run('document.querySelector("#cloudUsername").value=arguments[0];document.querySelector("#cloudPassword").value=arguments[1];document.querySelector("[data-cloud-action=submit]").click();',[name,password]);
      await poll('return !!document.querySelector("[data-cloud-action=continue]");');
      await run('document.querySelector("[data-cloud-action=continue]").click();');
    } else {
      name=await asyncRun('const done=arguments[arguments.length-1];fetch("/api/bootstrap",{cache:"no-store"}).then(r=>r.json()).then(data=>done(data.account.username));');
    }
    await poll('return document.querySelector("#cloudBadge")?.textContent.includes(arguments[0].toUpperCase());',[name]);
    await poll('return !!window.SAR;',[],25000);
    const checkpoint=await asyncRun('const done=arguments[arguments.length-1];window.SARCloud.checkpoint().then(resume=>{resume();done({ok:true});}).catch(error=>done({error:String(error.message||error)}));');
    assert.equal(checkpoint.ok,true,JSON.stringify(checkpoint));
    results.checks.openGameCloudCheckpoint = true;
    const world=await asyncRun('const done=arguments[arguments.length-1];fetch("/api/world",{cache:"no-store"}).then(r=>r.json()).then(data=>done({revision:data.world?.revision,botCount:Object.keys(data.world?.save?.bots||{}).length})).catch(e=>done({error:String(e)}));');
    assert.equal(world.botCount,50,JSON.stringify(world));
    results.checks.nativeAccountAndCanonicalWorld = true;
    const blocked = await asyncRun('const done=arguments[arguments.length-1];if(!window.__TAURI__?.core){done({blocked:true});return;}window.__TAURI__.core.invoke("launcher_settings").then(()=>done({blocked:false})).catch(()=>done({blocked:true}));');
    assert.equal(blocked.blocked,true);
    results.checks.remoteGameCannotInvokeNativeActions = true;
    await stop();
    await start();
    await poll('return document.querySelector("#connection").textContent==="Arena server online";');
    assert.equal(await run('return document.querySelector("#server").value;'),serverOrigin);
    results.checks.serverSelectionPersists = true;
    await run('document.querySelector("#play").click();');
    await switchGame();
    await poll('return document.querySelector("#cloudBadge")?.textContent.includes(arguments[0].toUpperCase());',[name]);
    results.checks.accountSessionPersistsAcrossLauncherRestart = true;
    results.ok=true;
    console.log('PASS native launcher, same-origin game, account session restart, world, restricted native commands.');
  } catch(error) {results.ok=false;results.error=error.message;results.uiStatus=await run('return {notice:document.querySelector("#notice")?.textContent,cloud:document.querySelector("#cloudStatus")?.textContent};').catch(()=>null);console.error(error.stack);process.exitCode=1;}
  finally {await stop();fs.writeFileSync(path.resolve(outputArg),JSON.stringify(results,null,2));}
})();
