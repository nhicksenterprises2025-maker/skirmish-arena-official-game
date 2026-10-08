'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),vm=require('node:vm'),{spawn,spawnSync}=require('node:child_process');
const {createDatabase,LATEST_DB_SCHEMA}=require('../server/db.cjs');
const RELEASE=require('../version.json'),CURRENT=RELEASE.version;
const project=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sar-lifecycle-'));
const backend=path.join(temporary,'backend'),service=path.join(temporary,'service'),database=path.join(service,'skirmish.sqlite');
fs.mkdirSync(path.join(backend,'server'),{recursive:true});fs.mkdirSync(service,{recursive:true});
const node=path.join(backend,process.platform==='win32'?'node.exe':'node');fs.copyFileSync(process.execPath,node);if(process.platform!=='win32')fs.chmodSync(node,0o755);
const source=fs.readFileSync(path.join(project,'server/desktop-service.cjs'),'utf8').replace("require('./index.cjs')",`require(${JSON.stringify(path.join(project,'server/index.cjs'))})`);
const entry=path.join(backend,'server/desktop-service.cjs');fs.writeFileSync(entry,source);fs.copyFileSync(path.join(project,'version.json'),path.join(backend,'version.json'));fs.copyFileSync(path.join(project,'server/startup-status.cjs'),path.join(backend,'server/startup-status.cjs'));
const initial=createDatabase(database);initial.exec('CREATE TABLE preserved_fixture(id TEXT PRIMARY KEY,value TEXT NOT NULL)');initial.prepare('INSERT INTO preserved_fixture VALUES(?,?)').run('original','account/world fixture retained');initial.close();
const checks=[],children=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function pass(name){checks.push({name,status:'PASS'});console.log('PASS',name);}
async function freePort(){return new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
function start(port){
  const child=spawn(node,['server/desktop-service.cjs'],{cwd:backend,windowsHide:true,env:{...process.env,SAR_DB_PATH:database,SAR_SERVICE_ROOT:service,SAR_HOST:'127.0.0.1',SAR_PORT:String(port),SAR_LOCAL_SERVER_ORIGIN:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});
  child.log='';child.stdout.on('data',data=>child.log+=data);child.stderr.on('data',data=>child.log+=data);children.push(child);return child;
}
async function until(test,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){const result=await test();if(result)return result;await delay(50);}throw Error('Lifecycle condition timed out');}
function control(record,action,token=record.controlToken){return new Promise((resolve,reject)=>{
  const socket=net.connect(record.controlPipe);let input='';socket.setTimeout(5000,()=>{socket.destroy();reject(Error('Private pipe timed out'));});socket.on('error',reject);
  socket.on('connect',()=>socket.write(JSON.stringify({action,token})+'\n'));socket.on('data',data=>{input+=data;if(input.includes('\n')){socket.destroy();try{resolve(JSON.parse(input));}catch(error){reject(error);}}});
});}
async function preflight({native=CURRENT,backendVersion=native,runningVersion=backendVersion,databaseSchema=LATEST_DB_SCHEMA,localShell=false,activeVersion=native,waitingVersion=null,activeCache=null,waitingCache=null,holdUpdateUntilActivated=false,installDelayMs=0,activateDuringVersionRead=false,staleRegistration=false,entryHtml=null}={}){
  const html=entryHtml||fs.readFileSync(path.join(project,'desktop-entry.html'),'utf8');
  const external=html.match(/<script\s+src="\.\/(desktop-launch\.js)"[^>]*><\/script>/);
  assert.ok(external,'Native startup must execute the installed external bootstrap');
  const script=fs.readFileSync(path.join(project,external[1]),'utf8');
  const release=JSON.parse(fs.readFileSync(path.join(project,'version.json'),'utf8')),expectedCache='sar-shell-'+native+'-'+release.shellRevision;
  const deleted=[],requests=[],listeners=new Set(),elements={status:{textContent:''},retry:{hidden:false,addEventListener(){}}};let destination=null,registered=0,activations=0,finishUpdate=null,updateResolved=0;
  const navigator={serviceWorker:{controller:null,addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}}};
  const worker=(version,cache)=>({postMessage(message){if(message.type==='GET_VERSION')queueMicrotask(()=>{if(activateDuringVersionRead&&registration.waiting===this){registration.active=this;registration.waiting=null;navigator.serviceWorker.controller=this;}for(const listener of [...listeners])listener({source:this,data:{type:'SW_VERSION',version,cache:cache||'sar-shell-'+version+'-'+release.shellRevision}});});else if(message.type==='SKIP_WAITING'){activations++;registration.active=this;registration.waiting=null;navigator.serviceWorker.controller=this;if(finishUpdate){updateResolved++;finishUpdate();}}}});
  const registration={active:worker(activeVersion,activeCache),waiting:waitingVersion?worker(waitingVersion,waitingCache):null,update:()=>holdUpdateUntilActivated?new Promise(resolve=>{finishUpdate=resolve;}):Promise.resolve()};navigator.serviceWorker.controller=registration.active;
  navigator.serviceWorker.register=async(url,options)=>{registered++;assert.equal(options.updateViaCache,'none');assert.equal(url,'./sw.js');return staleRegistration?{...registration,waiting:null}:registration;};
  navigator.serviceWorker.getRegistration=async()=>registration;
  let elapsed=0,downloaded=false;
  const schedule=(fn,ms)=>{if(installDelayMs&&ms===100){elapsed+=ms;if(elapsed>=installDelayMs&&!downloaded){downloaded=true;registration.waiting=worker(native,expectedCache);}return setTimeout(fn,0);}return setTimeout(fn,ms);};
  const context={window:{__SAR_EXPECTED_VERSION__:native,location:{replace(value){destination=value;}}},document:{getElementById:id=>elements[id]},navigator,caches:{keys:async()=>['sar-shell-1.5.4-old','sar-shell-'+native+'-obsolete',expectedCache,'unrelated-user-cache'],delete:async name=>{deleted.push(name);return true;}},fetch:async(url,options)=>{requests.push({url,options});return url.startsWith('./api/')?{ok:!localShell,json:async()=>localShell?{localShell:true}:{ok:true,version:runningVersion,databaseSchema}}:{ok:true,json:async()=>({...release,version:backendVersion})};},AbortSignal,setTimeout:schedule,clearTimeout,Date:installDelayMs?{now:()=>elapsed}:Date,Promise,encodeURIComponent};
  vm.runInNewContext(script,context);
  await until(()=>destination||context.window.__SAR_DESKTOP_LAUNCH_ERROR__,installDelayMs?15000:6000);
  assert.equal(requests[0].options.cache,'no-store');
  return {destination,error:context.window.__SAR_DESKTOP_LAUNCH_ERROR__,deleted,registered,activations,updateResolved,elapsed};
}
async function cachedLegacyEntry(origin){
  // Run the preserved fetch routing rather than assume a cache-busting query
  // bypasses it: immutable shell routing deliberately strips query strings.
  const fixture=path.join(__dirname,'fixtures/desktop-bootstrap-balance7');
  const legacyHtml=fs.readFileSync(path.join(fixture,'desktop-launch.html'),'utf8');
  const handlers={},cacheReads=[];
  const legacy={version:'1.6.0',shellRevision:'live-circuit-2-balance-7'};
  const worker={SARBuild:legacy,registration:{scope:origin+'/'},location:{origin},addEventListener:(type,handler)=>handlers[type]=handler};
  vm.runInNewContext(fs.readFileSync(path.join(fixture,'sw.js'),'utf8'),{
    self:worker,importScripts(){},URL,Request,fetch,
    caches:{open:async name=>({match:async key=>{cacheReads.push({name,key:String(key)});assert.equal(name,'sar-shell-1.6.0-live-circuit-2-balance-7');assert.equal(new URL(key).pathname,'/desktop-launch.html');return new Response(legacyHtml);}})}
  });
  async function route(relative){let intercepted=false,result;handlers.fetch({request:{method:'GET',mode:'navigate',url:new URL(relative,origin+'/').href},respondWith(value){intercepted=true;result=value;}});return {intercepted,response:intercepted?await result:await fetch(new URL(relative,origin+'/'))};}
  const stale=await route('./desktop-launch.html?launcher=1&build='+CURRENT);
  assert.equal(stale.intercepted,true);assert.equal(await stale.response.text(),legacyHtml);
  const inline=legacyHtml.match(/<script>([\s\S]+)<\/script>/);assert.ok(inline,'Fixture must reproduce a stale inline bootstrap');
  assert.doesNotMatch(legacyHtml,/<script\s+src="\.\/desktop-launch\.js"/);
  let oldSkipWaiting=0,oldUpdateCalls=0;
  vm.runInNewContext(inline[1],{navigator:{serviceWorker:{register:async()=>({update(){oldUpdateCalls++;return new Promise(()=>{});},waiting:{postMessage(){oldSkipWaiting++;}}})}}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(oldUpdateCalls,1);assert.equal(oldSkipWaiting,0,'Stale inline bootstrap deadlocks while awaiting an update that needs activation');
  const native=fs.readFileSync(path.join(project,'launcher/src-tauri/src/main.rs'),'utf8');
  const routeMatch=native.slice(native.indexOf('fn game_window('),native.indexOf('fn game_initialization(')).match(/\.join\("([^"]+\.html\?launcher=1)"\)/);
  assert.ok(routeMatch,'Native game entry URL must be discoverable');
  const fresh=await route(routeMatch[1]);assert.equal(fresh.intercepted,false,'Installed native entry must bypass the active legacy worker');
  assert.equal(fresh.response.status,200,'Installed backend must allow the new entry');assert.equal(fresh.response.headers.get('cache-control'),'no-store');
  const html=await fresh.response.text();assert.match(html,/<script src="\.\/desktop-launch\.js"><\/script>/);
  const script=await route('./desktop-launch.js');assert.equal(script.intercepted,false);assert.equal(script.response.status,200);assert.equal(script.response.headers.get('cache-control'),'no-store');
  assert.equal(cacheReads.length,1,'Fresh bootstrap must not consume or mutate account or legacy cached data');
  // Keep the fresh route outside future immutable shells as well.
  worker.SARBuild=RELEASE;
  vm.runInNewContext(fs.readFileSync(path.join(project,'sw.js'),'utf8'),{self:worker,importScripts(){},URL,Request,fetch,caches:{open(){throw Error('Current worker must not cache the native bootstrap');}}});
  assert.equal((await route(routeMatch[1])).intercepted,false);assert.equal((await route('./desktop-launch.js')).intercepted,false);
  const result=await preflight({entryHtml:html,activeVersion:'1.6.0',activeCache:'sar-shell-1.6.0-live-circuit-2-balance-7',waitingVersion:CURRENT,holdUpdateUntilActivated:true});
  assert.ok(result.destination);assert.equal(result.activations,1);assert.equal(result.updateResolved,1);assert.ok(!result.deleted.includes('unrelated-user-cache'));
  const revised=await preflight({entryHtml:html,activeVersion:CURRENT,activeCache:'sar-shell-1.7.0-fieldcraft-1',waitingVersion:CURRENT,holdUpdateUntilActivated:true});
  assert.ok(revised.destination);assert.equal(revised.activations,1,'Cached first FIELDCRAFT shell must activate the repaired revision');
  pass('Stale inline fixture remains cached under Balance7 routing; native fresh entry bypasses it, activates the current shell from Balance7 or FIELDCRAFT1 without Retry and preserves account caches');
}
function nativeRuntime(actual){
  const text=fs.readFileSync(path.join(project,'launcher/src-tauri/src/main.rs'),'utf8');
  const section=text.slice(text.indexOf('fn game_initialization('),text.indexOf('#[tauri::command]\nasync fn play'));
  const source=section.match(/r#"([\s\S]*?)"#\)\)/)[1].replaceAll('{{','{').replaceAll('}}','}').replace('{expected}',JSON.stringify(CURRENT)).replace('{release}',JSON.stringify(RELEASE.updateName));
  const nodes=[],body={append(node){nodes.push(node);}},window={SAR:{getVersion:()=>actual,prepareReload(){window.paused=true;}}};
  const document={body,getElementById:id=>nodes.find(node=>node.id===id),createElement:()=>({style:{},setAttribute(){},append(...children){this.children=children;}}),exitPointerLock(){},addEventListener(){}};
  vm.runInNewContext(source,{window,document,location:{pathname:'/index.html',replace(){}},Date,setTimeout,clearTimeout});return {window,nodes};
}
async function run(){
  const port=await freePort(),origin=`http://127.0.0.1:${port}`,child=start(port),marker=path.join(service,'desktop-service.json');
  const record=await until(()=>fs.existsSync(marker)&&JSON.parse(fs.readFileSync(marker,'utf8')));
  assert.equal(record.pid,child.pid);assert.equal(record.databasePath,database);assert.equal(record.databaseSchema,require('../server/db.cjs').LATEST_DB_SCHEMA);assert.equal(record.nodeExecutable,node);assert.equal(record.entryPath,entry);
  const status=await (await fetch(origin+'/api/status')).json();assert.equal(status.databaseSchema,require('../server/db.cjs').LATEST_DB_SCHEMA);assert(!JSON.stringify(status).includes(record.controlToken));
  await cachedLegacyEntry(origin);
  assert([401,404].includes((await fetch(origin+'/api/desktop/shutdown')).status));
  const health=await control(record,'health');assert.equal(health.pid,child.pid);assert.equal(health.version,record.version);assert(!('controlToken' in health));
  assert.equal((await control(record,'shutdown','invalid')).ok,false);assert.equal((await fetch(origin+'/api/status')).status,200);
  assert.equal((await control(record,'shutdown','a'.repeat(63)+'é')).ok,false);assert.equal((await fetch(origin+'/api/status')).status,200);
  pass('Private authenticated pipe exposes owned PID/path/database/version health; control token is absent from responses/public HTTP and invalid shutdown cannot stop service');
  const duplicate=start(port);await until(()=>duplicate.exitCode!==null);assert.notEqual(duplicate.exitCode,0);assert.equal(JSON.parse(fs.readFileSync(marker,'utf8')).pid,child.pid);assert.equal((await fetch(origin+'/api/status')).status,200);
  pass('Duplicate backend startup fails clearly without removing the live ownership manifest or stopping the existing service');
  assert.equal((await control(record,'shutdown')).ok,true);await until(()=>child.exitCode!==null);assert.equal(child.exitCode,0);assert(!fs.existsSync(marker));
  const reopened=createDatabase(database);assert.equal(reopened.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(reopened.prepare('SELECT value FROM preserved_fixture WHERE id=?').get('original').value,'account/world fixture retained');reopened.close();
  const checkpoint=spawnSync(node,['server/desktop-service.cjs','--checkpoint-only'],{cwd:backend,windowsHide:true,env:{...process.env,SAR_DB_PATH:database},encoding:'utf8'});assert.equal(checkpoint.status,0);assert.equal(JSON.parse(checkpoint.stdout).ok,true);
  const legacyDatabase=path.join(service,'legacy-schema.sqlite'),{DatabaseSync}=require('node:sqlite');
  let raw=new DatabaseSync(legacyDatabase);raw.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=3; CREATE TABLE original_data(value TEXT); INSERT INTO original_data VALUES('keep schema and rows')");raw.close();
  const legacyCheckpoint=spawnSync(node,['server/desktop-service.cjs','--checkpoint-only'],{cwd:backend,windowsHide:true,env:{...process.env,SAR_DB_PATH:legacyDatabase},encoding:'utf8'});assert.equal(legacyCheckpoint.status,0);
  raw=new DatabaseSync(legacyDatabase);assert.equal(raw.prepare('PRAGMA user_version').get().user_version,3);assert.equal(raw.prepare('SELECT value FROM original_data').get().value,'keep schema and rows');raw.close();
  pass('Authenticated graceful shutdown releases the listener/marker, checkpoints/closes SQLite and preserves persisted data; raw legacy checkpoint performs no migration');
  const obsolete=['sar-shell-1.5.4-old','sar-shell-'+CURRENT+'-obsolete'];
  const fresh=await preflight();assert.equal(fresh.destination,'./index.html?launcher=1&build='+CURRENT);assert.deepEqual(fresh.deleted,obsolete);
  const upgraded=await preflight({activeVersion:'1.6.0',waitingVersion:CURRENT});assert(upgraded.destination);assert.deepEqual(upgraded.deleted,obsolete);
  const oldReference=await preflight({activeVersion:'1.7.0',waitingVersion:CURRENT,staleRegistration:true});assert.ok(oldReference.destination);assert.equal(oldReference.activations,1);pass('Startup refreshes a stale registration reference and activates the fully downloaded worker without Retry or clearing saves');
  const activatedDuringRead=await preflight({activeVersion:'1.6.0',waitingVersion:CURRENT,activateDuringVersionRead:true});assert.ok(activatedDuringRead.destination,'Waiting worker can become active while its version response is awaited: '+activatedDuringRead.error);assert.equal(activatedDuringRead.activations,0);pass('Cold-start worker self-activation during version query cannot dereference a cleared waiting slot');
  const revised=await preflight({activeVersion:CURRENT,activeCache:'sar-shell-'+CURRENT+'-obsolete',waitingVersion:CURRENT});assert(revised.destination);assert.equal(revised.activations,1,'same version with an obsolete cache must activate the revised worker');assert.deepEqual(revised.deleted,obsolete);
  const stalledUpdate=await preflight({activeVersion:CURRENT,activeCache:'sar-shell-'+CURRENT+'-obsolete',waitingVersion:CURRENT,holdUpdateUntilActivated:true});assert(stalledUpdate.destination,'activation must proceed while update() is waiting for that same worker to activate');assert.equal(stalledUpdate.activations,1);assert.equal(stalledUpdate.updateResolved,1,'SKIP_WAITING releases the held update promise');assert.deepEqual(stalledUpdate.deleted,obsolete);
  const slowBalance=await preflight({activeCache:'sar-shell-1.6.0-live-circuit-2',installDelayMs:45000,holdUpdateUntilActivated:true});assert(slowBalance.destination,'A balance shell still downloading after35seconds must activate without Retry');assert.equal(slowBalance.activations,1);assert.equal(slowBalance.elapsed,45000);assert.equal(slowBalance.updateResolved,1);
  pass('Same-build balance shell finishing after45seconds activates automatically, retaining account caches and requiring no Retry');
  const bad=await preflight({backendVersion:'1.5.4'});assert(bad.error.includes('Version mismatch'));assert.equal(bad.registered,0);assert.deepEqual(bad.deleted,[]);
  const staleProcess=await preflight({runningVersion:'1.5.4'});assert(staleProcess.error.includes('active backend'));assert.equal(staleProcess.registered,0);assert.deepEqual(staleProcess.deleted,[]);
  for(const databaseSchema of [LATEST_DB_SCHEMA-1,LATEST_DB_SCHEMA+1]){const wrongSchema=await preflight({databaseSchema});assert.ok(wrongSchema.error.includes('account schema '+databaseSchema));assert.equal(wrongSchema.registered,0);assert.deepEqual(wrongSchema.deleted,[]);}
  const cached=await preflight({localShell:true});assert(cached.destination,'Cached authenticated mode retains the exact-version local shell when HTTP account health is offline');
  const wrongWorker=await preflight({activeVersion:'1.5.4',waitingVersion:'1.5.6'});assert(wrongWorker.error.includes('Version mismatch'));assert.deepEqual(wrongWorker.deleted,[]);
  const wrongRevision=await preflight({waitingVersion:CURRENT,waitingCache:'sar-shell-'+CURRENT+'-obsolete'});assert(wrongRevision.error.includes('Version mismatch'));assert.equal(wrongRevision.activations,0);assert.deepEqual(wrongRevision.deleted,[]);
  pass('Desktop preflight verifies backend and exact cache revision, activates the matching SW, preserves current/unrelated caches and blocks stale same-version shells');
  const verified=nativeRuntime(CURRENT);assert.equal(verified.window.__SAR_RUNTIME_VERIFIED__,true);assert.equal(verified.nodes.length,0);
  const blocked=nativeRuntime('1.5.4');assert.equal(blocked.window.__SAR_VERSION_MISMATCH__.actual,'1.5.4');assert.equal(blocked.nodes[0].id,'sar-native-version-error');assert.equal(blocked.window.paused,true);
  pass('Native initialization checks actual SAR.getVersion and blocks/pauses a stale runtime rather than trusting HTML or launcher labels');
  if(process.platform==='win32'&&!process.argv.includes('--skip-rust')){
    const pipePort=await freePort(),pipeChild=start(pipePort);
    await until(()=>fs.existsSync(marker)&&JSON.parse(fs.readFileSync(marker,'utf8')).pid===pipeChild.pid);
    const privateFixture=path.join(temporary,'private-fixture.json');fs.writeFileSync(privateFixture,JSON.stringify({root:backend,marker}));
    const cargo=path.join(os.homedir(),'.cargo','bin','cargo.exe');
    const privateTest=spawnSync(cargo,['test','private_control_handoff_runtime','--','--nocapture'],{cwd:path.join(project,'launcher/src-tauri'),windowsHide:true,env:{...process.env,SAR_PRIVATE_CONTROL_FIXTURE:privateFixture},encoding:'utf8',timeout:240000});
    fs.writeFileSync(path.join(temporary,'rust-private-test.log'),privateTest.stdout+'\n'+privateTest.stderr);
    assert.equal(privateTest.status,0,privateTest.stderr.slice(-1800));await until(()=>pipeChild.exitCode!==null);assert.equal(pipeChild.exitCode,0);
    pass('Actual Rust Windows named-pipe client authenticates owned service health, rejects a bad shutdown token and performs a graceful port-releasing handoff');
    // Simulate installation over a live pre-pipe release: same executable/entry
    // path, old process in memory, new checkpoint helper on disk, preserved DB.
    const legacyPort=await freePort();
    fs.writeFileSync(entry,`'use strict';const {createServer}=require(${JSON.stringify(path.join(project,'server/index.cjs'))});const app=createServer();app.server.listen(Number(process.env.SAR_PORT),'127.0.0.1');`);
    const legacy=start(legacyPort);await until(async()=>{try{return (await fetch(`http://127.0.0.1:${legacyPort}/api/status`)).ok;}catch{return false;}});
    fs.writeFileSync(entry,source);
    const fixture=path.join(temporary,'legacy-fixture.json');fs.writeFileSync(fixture,JSON.stringify({root:backend,database,origin:`http://127.0.0.1:${legacyPort}`,pid:legacy.pid}));
    const test=spawnSync(cargo,['test','legacy_handoff_runtime','--','--nocapture'],{cwd:path.join(project,'launcher/src-tauri'),windowsHide:true,env:{...process.env,SAR_LIFECYCLE_FIXTURE:fixture},encoding:'utf8',timeout:240000});
    fs.writeFileSync(path.join(temporary,'rust-legacy-test.log'),test.stdout+'\n'+test.stderr);
    assert.equal(test.status,0,test.stderr.slice(-1800));await until(()=>legacy.exitCode!==null);
    const persisted=createDatabase(database);assert.equal(persisted.prepare('SELECT value FROM preserved_fixture WHERE id=?').get('original').value,'account/world fixture retained');persisted.close();
    pass('Actual Windows CIM/Restart Manager legacy handoff rejects wrong PID/database, checkpoints the canonical SQLite file and stops only its exact installed-style backend PID');
  }
  fs.writeFileSync(path.join(__dirname,'updater-lifecycle-results.json'),JSON.stringify({status:'PASS',checks,version:require('../version.json').version,fixtureRoot:temporary,nativeBuildInstalled:false},null,2)+'\n');
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  for(const child of children)if(child.exitCode===null){child.kill();await delay(100);}
  // Fixtures are retained for concise runtime/Rust evidence; no user data touched.
});

