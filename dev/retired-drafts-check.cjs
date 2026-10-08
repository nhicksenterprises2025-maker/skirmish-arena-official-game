'use strict';
// Shipped cloud client, real browser IndexedDB, isolated synthetic storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source=fs.readFileSync(path.join(__dirname,'../cloud.js'),'utf8'),ARCHIVE='sar-dialogue-retirement-backup-v1',DRAFT='sar.social.replyDrafts.fixture-account',checks=[];
const server=http.createServer((req,res)=>{
  if(req.url==='/cloud.js'){res.setHeader('content-type','text/javascript');return res.end(source);}
  if(req.url==='/game.js'){res.setHeader('content-type','text/javascript');return res.end('window.__fixtureGameLoaded=true;');}
  if(req.url.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});return res.end('{"error":"Synthetic offline account server"}');}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><main>Storage fixture</main></body></html>');
});
let browser,origin;
async function prepare(context,mode='normal'){
  const page=await context.newPage();await page.goto(origin);
  await page.evaluate(({mode,DRAFT,ARCHIVE})=>{
    window.__nativeCalls=[];window.__SAR_NATIVE_GAME__=true;window.__TAURI__={core:{invoke:async name=>{__nativeCalls.push(name);return {online:false};}}};
    if(!localStorage.getItem('__fixture-seeded')){
      localStorage.setItem('__fixture-seeded','1');
      localStorage.setItem('sar-cloud-owner','fixture-account');
      localStorage.setItem('sar-persistent-save',JSON.stringify({schema:17,config:{primary:'P90'},progression:{totalXPUnits:98765},playerCareer:{kills:77},seasons:{number:4}}));
      localStorage.setItem(DRAFT,JSON.stringify({fixturebot:'Retained unsent reply'}));
      localStorage.setItem('sar.social.replyDrafts.other-fixture',JSON.stringify({otherbot:'Other account draft'}));
      localStorage.setItem('sar.social.unrelated','preserve');
      localStorage.setItem('unrelated-app-key','preserve');
    }
    if(mode==='no-idb'||mode==='quota')Object.defineProperty(window,'indexedDB',{value:undefined});
    if(mode==='quota'){
      const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===ARCHIVE)throw new DOMException('Synthetic archive quota','QuotaExceededError');return set.call(this,key,value);};
    }
    if(mode==='abort-archive'){
      const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){const request=put.call(this,value,...args);if(value.key===ARCHIVE)this.transaction.abort();return request;};
    }
    if(mode==='concurrent-draft'){
      const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){const request=put.call(this,value,...args),db=this.transaction.db;if(value.key===ARCHIVE)request.addEventListener('success',()=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put({key:DRAFT,value:JSON.stringify({fixturebot:'Newer reply from an older open game'})});});return request;};
    }
    if(mode==='hold-initial-read'){
      const getAll=IDBObjectStore.prototype.getAll;let held=false;IDBObjectStore.prototype.getAll=function(...args){const request=getAll.apply(this,args);if(!held){held=true;request.addEventListener('success',event=>{event.stopImmediatePropagation();window.__resumeSnapshot=()=>request.onsuccess?.({target:request});window.__snapshotHeld=true;},{once:true});}return request;};
    }
  },{mode,DRAFT,ARCHIVE});
  await page.addScriptTag({url:origin+'/cloud.js'});if(mode==='hold-initial-read'){await page.waitForFunction(()=>window.__snapshotHeld);return page;}await page.waitForFunction(()=>window.SARCloud?.state.loaded);
  await page.evaluate(()=>SARStorage.ready);return page;
}
async function snapshot(page){return page.evaluate(({DRAFT,ARCHIVE})=>({draft:localStorage.getItem(DRAFT),archive:SARStorage.get(ARCHIVE),entries:SARStorage.entries(),save:SARStorage.get('sar-persistent-save'),owner:SARStorage.get('sar-cloud-owner'),localMode:SARCloud.state.localMode,calls:__nativeCalls,other:localStorage.getItem('sar.social.unrelated'),unrelated:localStorage.getItem('unrelated-app-key')}),{DRAFT,ARCHIVE});}
async function stored(page,key){return page.evaluate(key=>new Promise((resolve,reject)=>{const r=indexedDB.open('sar-world-cache-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('entries').objectStore('entries').get(key);q.onsuccess=()=>{db.close();resolve(q.result?.value??null);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}),key);}
async function resetArchive(page,oldDraft=null){await page.evaluate(({ARCHIVE,DRAFT,oldDraft})=>new Promise((resolve,reject)=>{const r=indexedDB.open('sar-world-cache-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries');store.delete(ARCHIVE);if(oldDraft!==null)store.put({key:DRAFT,value:oldDraft});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{ARCHIVE,DRAFT,oldDraft});}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.SAR_CHROMIUM||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')});
  await check('Exact draft contents are committed and reread in real IndexedDB before removal; account/world and unrelated keys remain intact',async()=>{
    const context=await browser.newContext(),page=await prepare(context),s=await snapshot(page),archive=JSON.parse(s.archive);
    assert.equal(s.draft,null);assert.equal(archive.entries.length,2);assert.equal(archive.entries.find(entry=>entry.key===DRAFT).value,JSON.stringify({fixturebot:'Retained unsent reply'}));
    assert.equal(await stored(page,ARCHIVE),s.archive);assert.equal(s.owner,'fixture-account');assert.equal(JSON.parse(s.save).progression.totalXPUnits,98765);assert.equal(s.other,'preserve');assert.equal(s.unrelated,'preserve');assert.equal(s.localMode,true);assert.deepEqual(s.calls,[]);assert.ok(s.entries.some(([key,value])=>key===ARCHIVE&&value===s.archive));
    const next=await prepare(context),again=await snapshot(next);assert.equal(again.archive,s.archive);assert.equal(again.save,s.save);assert.equal(again.draft,null);await context.close();
  });
  await check('A rejected archive transaction leaves originals present, permits cached play, and retries without duplicate archive entries',async()=>{
    const context=await browser.newContext(),page=await prepare(context,'abort-archive'),s=await snapshot(page);
    assert.ok(s.draft);assert.equal(s.archive,null);assert.equal(await stored(page,ARCHIVE),null);assert.equal(s.localMode,true);
    const next=await prepare(context),again=await snapshot(next);assert.equal(again.draft,null);assert.equal(JSON.parse(again.archive).entries.length,2);assert.equal(again.save,s.save);await context.close();
  });
  await check('A concurrent legacy draft replacement survives cleanup and joins the archive on the next startup',async()=>{
    const context=await browser.newContext(),page=await prepare(context,'concurrent-draft'),s=await snapshot(page),changed=JSON.stringify({fixturebot:'Newer reply from an older open game'});
    assert.equal(await stored(page,DRAFT),changed);assert.ok(s.entries.some(([key,value])=>key===DRAFT&&value===changed));assert.equal(JSON.parse(s.archive).entries.length,2);
    const next=await prepare(context),again=await snapshot(next),archive=JSON.parse(again.archive);assert.equal(archive.entries.length,3);assert.ok(archive.entries.some(entry=>entry.key===DRAFT&&entry.value===changed));assert.equal(await stored(next,DRAFT),null);assert.equal(again.save,s.save);await context.close();
  });
  await check('Two windows with stale hydration snapshots append both draft versions without overwriting the first committed archive',async()=>{
    const context=await browser.newContext(),setup=await prepare(context);await resetArchive(setup);await setup.evaluate(DRAFT=>localStorage.setItem(DRAFT,'first-window-draft'),DRAFT);
    const first=await prepare(context,'hold-initial-read'),second=await prepare(context,'hold-initial-read');
    await first.evaluate(()=>__resumeSnapshot());await first.evaluate(()=>SARStorage.ready);assert.equal(JSON.parse(await stored(first,ARCHIVE)).entries.length,1);
    await second.evaluate(DRAFT=>localStorage.setItem(DRAFT,'second-window-draft'),DRAFT);await second.evaluate(()=>__resumeSnapshot());await second.evaluate(()=>SARStorage.ready);
    const archive=JSON.parse(await stored(second,ARCHIVE));assert.deepEqual(archive.entries.map(entry=>entry.value).sort(),['first-window-draft','second-window-draft']);assert.equal(await second.evaluate(DRAFT=>localStorage.getItem(DRAFT),DRAFT),null);await context.close();
  });
  await check('Coexisting IndexedDB and localStorage versions of one draft are both archived before either is removed',async()=>{
    const context=await browser.newContext(),setup=await prepare(context);await resetArchive(setup,'older-indexeddb-draft');await setup.evaluate(DRAFT=>localStorage.setItem(DRAFT,'newer-localstorage-draft'),DRAFT);
    const next=await prepare(context),archive=JSON.parse(await stored(next,ARCHIVE));assert.deepEqual(archive.entries.map(entry=>entry.value).sort(),['newer-localstorage-draft','older-indexeddb-draft']);assert.equal(await stored(next,DRAFT),null);assert.equal(await next.evaluate(DRAFT=>localStorage.getItem(DRAFT),DRAFT),null);await context.close();
  });
  await check('LocalStorage-only fallback retains originals and verifies its archive; quota failures preserve cached play; later IndexedDB startup retires safely',async()=>{
    for(const mode of ['no-idb','quota']){const context=await browser.newContext(),page=await prepare(context,mode),s=await snapshot(page);assert.equal(s.localMode,true);assert.equal(s.owner,'fixture-account');assert.ok(s.draft);if(mode==='quota')assert.equal(s.archive,null);else assert.equal(JSON.parse(s.archive).entries.length,2);const next=await prepare(context),again=await snapshot(next);assert.equal(again.draft,null);assert.equal(JSON.parse(again.archive).entries.length,2);assert.equal(again.localMode,true);await context.close();}
  });
  if(process.env.SAR_TEST_OUTPUT){fs.mkdirSync(process.env.SAR_TEST_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.SAR_TEST_OUTPUT,'retired-drafts-results.json'),JSON.stringify({ok:true,checks},null,2));}
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
