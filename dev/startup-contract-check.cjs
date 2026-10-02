'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||'C:/Users/Noah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {engine}=require('./simulate.cjs'),root=path.resolve(__dirname,'..'),release=require('../version.json');
const copy=value=>JSON.parse(JSON.stringify(value));
const legacy=copy(engine().context.SAR.getUniverse());delete legacy.progression;
const original=JSON.stringify(legacy),migrated=engine({'sar-persistent-save':original});
assert.equal(migrated.data.get('sar-xp-migration-original'),original);
const current=copy(migrated.context.SAR.getUniverse());current.progression.totalXPUnits=50000;current.progression.currentLevel=5;
current.patchState.meta['AR-15'].kills=47;
const restarted=engine({'sar-persistent-save':JSON.stringify(current),'sar-xp-migration-original':original});
assert.equal(restarted.context.SAR.getUniverse().progression.totalXPUnits,50000);
assert.equal(restarted.data.get('sar-xp-migration-original'),original);
assert.equal(restarted.context.SAR.getUniverse().patchState.id,current.patchState.id);
assert.equal(restarted.context.SAR.getUniverse().patchState.meta['AR-15'].kills,47);
assert.equal(restarted.context.SAR.getUniverse().patchArchives.length,current.patchArchives.length);
assert.equal(JSON.stringify(restarted.context.SAR.getUniverse().playerCareer),JSON.stringify(current.playerCareer));
assert.throws(()=>engine({'sar-persistent-save':'{corrupt original'}),error=>error.name==='SyntaxError');
console.log('PASS recoverable, idempotent XP migration; existing XP/career/patch retained; failed save never becomes a blank world');
let mismatch=true,entryRequests=0,indexDelay=6500,browser;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://test');
 if(url.pathname==='/seed'){res.setHeader('content-type','text/html');res.end('<!doctype html><body>Previous installed release</body>');return;}
 if(url.pathname==='/legacy-sw.js'){
  const boot=fs.readFileSync(path.join(__dirname,'fixtures/desktop-bootstrap-progression/boot.js'),'utf8');
  res.setHeader('content-type','text/javascript');res.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>{if(e.data.type==='GET_VERSION')e.source.postMessage({type:'SW_VERSION',version:'1.9.2',cache:'sar-shell-1.9.2-account-progression-3'});});self.addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/boot.js')e.respondWith(new Response(${JSON.stringify(boot)},{headers:{'content-type':'text/javascript'}}));});`);return;
 }
 if(url.pathname==='/version.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({...release,version:mismatch?'1.8.0':release.version}));return;}
 if(url.pathname==='/api/status'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,version:release.version,databaseSchema:5}));return;}
 if(url.pathname==='/index.html'){
  res.setHeader('content-type','text/html');res.end('<!doctype html><body><script src="/boot.js"></script><main>LOBBY</main><script>window.__readyAt=0;window.__gameLoads=1;window.SAR={};window.SAR25D={diagnostics:()=>({assetState:"loading"})};addEventListener("sar:boot-ready",()=>__readyAt=Date.now());setTimeout(()=>SARBoot.gameReady(),'+indexDelay+');</script>');return;
 }
 if(url.pathname.startsWith('/assets/')){res.writeHead(503);res.end('Optional fixture asset unavailable');return;}
 if(url.pathname==='/desktop-entry.html')entryRequests++;
 const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('cache-control','no-store');res.setHeader('content-type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));
});
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.SAR_CHROMIUM||'C:/Users/Noah/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 const context=await browser.newContext();await context.addInitScript(version=>window.__SAR_EXPECTED_VERSION__=version,release.version);const page=await context.newPage();
 await page.goto(origin+'/seed');await page.evaluate(async()=>{await navigator.serviceWorker.register('/legacy-sw.js',{scope:'/'});await navigator.serviceWorker.ready;while(!navigator.serviceWorker.controller)await new Promise(r=>setTimeout(r,20));});
 await page.goto(origin+'/desktop-entry.html');await page.waitForFunction(()=>window.__SAR_DESKTOP_LAUNCH_DIAGNOSTIC__);
 assert.equal(await page.evaluate(()=>typeof SARBoot.stage),'undefined','Must reproduce the real cached 1.9.2 boot API');
 const error=await page.evaluate(()=>window.__SAR_DESKTOP_LAUNCH_DIAGNOSTIC__);assert.equal(error.stage,'installed-release');assert.match(error.stack,/desktop-launch.js/);assert.match(error.message,/1.8.0/);
 mismatch=false;await page.locator('#retry').click();await page.waitForURL('**/index.html?*');
 await page.waitForTimeout(3300);assert.equal(await page.evaluate(()=>SARBoot.getState().closed),false,'Three seconds is not an initialization deadline');
 await page.waitForFunction(()=>window.__readyAt>0);const state=await page.evaluate(()=>({boot:SARBoot.getState(),readyAt:__readyAt,loads:__gameLoads,failed:window.__SAR_BOOT_FAILURE__||null}));
 assert.ok(state.readyAt-state.boot.started>=6500);assert.equal(state.loads,1);assert.equal(state.failed,null);assert.equal(entryRequests,2);
 const cache=await page.evaluate(()=>caches.keys());assert.deepEqual(cache.filter(k=>k.startsWith('sar-shell-')),[`sar-shell-${release.version}-${release.shellRevision}`]);
 console.log('PASS cached 1.9.2 boot compatibility; real service-worker activation with audio/scenery unavailable; staged error includes stack; Retry opens one new document; 6.5-second initialization succeeds');
 await page.close();
 }finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
