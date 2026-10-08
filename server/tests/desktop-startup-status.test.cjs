'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite'),startup=require('../startup-status.cjs');
const ENTRY=path.resolve(__dirname,'../desktop-service.cjs'),MIGRATIONS=path.resolve(__dirname,'../migrations');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const attempt=()=>crypto.randomBytes(16).toString('hex');
const TEST_TOKEN='private-desktop-startup-fixture-session';
function directory(){return fs.mkdtempSync(path.join(os.tmpdir(),'sar-desktop-startup-'));}
function cleanup(dir){const absolute=path.resolve(dir);assert(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('sar-desktop-startup-'));fs.rmSync(absolute,{recursive:true,force:true});}
function legacy(file){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 for(const name of fs.readdirSync(MIGRATIONS).filter(name=>/^00[1-8]_/.test(name)).sort()){
  const version=Number(name.slice(0,3));if(version===8)db.exec('PRAGMA foreign_keys=OFF');db.exec(fs.readFileSync(path.join(MIGRATIONS,name),'utf8'));if(version===8)db.exec('PRAGMA foreign_keys=ON');db.prepare('INSERT INTO save_migrations VALUES(?,?,?)').run(version,1,name);
 }
 db.exec('PRAGMA user_version=8');
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,recovery_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('startup-fixture','startup-fixture','startup-fixture','never-log-password-hash','never-log-recovery-hash',1,1);
 db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(TEST_TOKEN).digest('hex'),'startup-fixture',Date.now(),Date.now()+300000,Date.now());
 db.prepare('INSERT INTO messages(id,user_id,bot_id,direction,type,body,created_at,source) VALUES(?,?,?,?,?,?,?,?)').run('fixture-message','startup-fixture','bot_fixture','player','PLAYER_REPLY','private retired message: never-log-body',1,'fixture');
 db.close();
}
async function freePort(){const s=net.createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
function preload(options){
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
 const {modulePath,trace,exercisePath,slow,failure}=options,marker=path.join(process.env.SAR_SERVICE_ROOT,'desktop-startup.json');
 const rename=fs.renameSync;let exercised=false;
 fs.renameSync=function(source,target){
  if(failure&&String(target).endsWith('.jsonl'))throw Error('never-log-failure-secret');
  const out=rename.call(fs,source,target);
  if(path.resolve(String(target))===path.resolve(marker)){
   const value=JSON.parse(fs.readFileSync(marker,'utf8'));fs.appendFileSync(trace,JSON.stringify(value)+'\n');
   if(value.stage==='ready'&&!exercised){
    exercised=true;queueMicrotask(()=>{const status=require(modulePath),first=value.stageStartedAt;
    status.emit('ready');const repeated=JSON.parse(fs.readFileSync(marker,'utf8'));assert.equal(repeated.stageStartedAt,first);
    assert.equal(status.forDatabase(path.join(process.env.SAR_SERVICE_ROOT,'different.sqlite'),'snapshot'),false);
    assert.throws(()=>status.emit('snapshot',{artifactPath:path.join(process.env.SAR_SERVICE_ROOT,'unrelated.sqlite.pre-wrong')}),/canonical database/);
    const nonce=process.env.SAR_STARTUP_ATTEMPT,prior=fs.readFileSync(marker,'utf8');process.env.SAR_STARTUP_ATTEMPT='f'.repeat(32);assert.equal(status.emit('snapshot'),false);assert.equal(fs.readFileSync(marker,'utf8'),prior);process.env.SAR_STARTUP_ATTEMPT=nonce;
    fs.writeFileSync(exercisePath,JSON.stringify({duplicateStageKeptOriginalStart:true,otherDatabaseRejected:true,unrelatedArtifactRejected:true,staleAttemptRejected:true}));});
   }
  }
  return out;
 };
 if(slow){
  const prepare=DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare=function(sql,...args){
   const statement=prepare.call(this,sql,...args);
   if(String(sql).startsWith('VACUUM INTO')){
    const run=statement.run.bind(statement);
    statement.run=function(...parameters){
     const initial=process.cpuUsage(),end=Date.now()+16000,crypto=require('node:crypto'),bytes=Buffer.alloc(4096,7);
     while(Date.now()<end)crypto.createHash('sha256').update(bytes).digest();
     fs.writeFileSync(path.join(process.env.SAR_SERVICE_ROOT,'cpu-work.json'),JSON.stringify(process.cpuUsage(initial)));
     return run(...parameters);
    };
   }
   return statement;
  };
 }
}
function probe(dir,{slow=false,failure=false}={}){
 const file=path.join(dir,'probe.cjs'),modulePath=path.resolve(__dirname,'../startup-status.cjs'),trace=path.join(dir,'trace.jsonl'),exercises=path.join(dir,'exercises.json');
 fs.writeFileSync(file,'('+preload.toString()+')('+JSON.stringify({modulePath,trace,exercisePath:exercises,slow,failure})+');');return {file,trace,exercises};
}
async function launch(dir,options={}){
 const databasePath=path.join(dir,'fixture.sqlite');if(!fs.existsSync(databasePath))legacy(databasePath);
 const port=await freePort(),origin='http://127.0.0.1:'+port,nonce=attempt(),instrument=probe(dir,options);
 const env={...process.env,SAR_DB_PATH:databasePath,SAR_SERVICE_ROOT:dir,SAR_HOST:'127.0.0.1',SAR_PORT:String(port),SAR_LOCAL_SERVER_ORIGIN:origin,SAR_COMMERCE_ENV:'test',SAR_STARTUP_ATTEMPT:options.inactive?'':nonce};
 const child=spawn(process.execPath,['--require',instrument.file,ENTRY],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 return {child,exited,databasePath,origin,nonce,marker:path.join(dir,'desktop-startup.json'),...instrument,get stdout(){return stdout;},get stderr(){return stderr;}};
}
async function until(check,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw Error('Fixture startup did not reach the expected stage');}
async function ready(app){await until(()=>fs.existsSync(path.join(path.dirname(app.marker),'desktop-service.json')));const response=await fetch(app.origin+'/api/status');assert.equal(response.status,200);assert.equal((await response.json()).databaseSchema,10);}
async function stop(app){
 if(app.child.exitCode!==null)return;
 try{
  const m=JSON.parse(fs.readFileSync(path.join(path.dirname(app.marker),'desktop-service.json'),'utf8'));assert.equal(m.pid,app.child.pid);
  await new Promise((resolve,reject)=>{const socket=net.createConnection(m.controlPipe,()=>socket.write(JSON.stringify({token:m.controlToken,action:'shutdown'})+'\n'));socket.on('data',()=>{});socket.on('end',resolve);socket.on('error',reject);});
  await Promise.race([app.exited,delay(6000)]);
 }catch(error){if(!['ENOENT','ECONNREFUSED'].includes(error.code))throw error;}
 if(app.child.exitCode===null){app.child.kill();await app.exited;}
}
test('ordinary database use cannot activate a private desktop marker or accept an unbound entry',()=>{
 const dir=directory(),file=path.join(dir,'fixture.sqlite'),old={...process.env};
 try{
  process.env.SAR_DB_PATH=file;process.env.SAR_SERVICE_ROOT=dir;process.env.SAR_LOCAL_SERVER_ORIGIN='http://127.0.0.1:8803';delete process.env.SAR_STARTUP_ATTEMPT;
  assert.equal(startup.begin({databasePath:file,serviceRoot:dir,origin:'http://127.0.0.1:8803',entryPath:ENTRY}),false);
  process.env.SAR_STARTUP_ATTEMPT=attempt();
  assert.equal(startup.begin({databasePath:file,serviceRoot:dir,origin:'http://127.0.0.1:8803',entryPath:ENTRY}),false,'the actual process entry is not the desktop child');
  const db=require('../db.cjs').createDatabase(file);db.close();assert.equal(fs.existsSync(path.join(dir,'desktop-startup.json')),false);
 }finally{for(const key of ['SAR_DB_PATH','SAR_SERVICE_ROOT','SAR_LOCAL_SERVER_ORIGIN','SAR_STARTUP_ATTEMPT'])if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];cleanup(dir);}
});
test('real schema8 retirement reports verified snapshot/export stages and binds every record to one private child',async()=>{
 const dir=directory();let app;
 try{
  app=await launch(dir);await ready(app);
  const rows=fs.readFileSync(app.trace,'utf8').trim().split('\n').map(JSON.parse),stages=rows.map(row=>row.stage);
  for(const stage of ['opening-database','snapshot','snapshot-verify','archive','archive-verify','migration-9','migration-10','listening','ready'])assert(stages.includes(stage),stage);
  assert(stages.indexOf('snapshot')<stages.indexOf('snapshot-verify'));assert(stages.indexOf('archive')<stages.indexOf('archive-verify'));assert(stages.lastIndexOf('migration-9')>stages.indexOf('archive-verify'));assert(stages.indexOf('migration-10')<stages.indexOf('ready'));
  for(const row of rows){assert.equal(row.schema,1);assert.equal(row.pid,app.child.pid);assert.equal(row.attempt,app.nonce);assert.equal(row.databasePath,path.resolve(app.databasePath));assert.equal(row.nodeExecutable,path.resolve(process.execPath));assert.equal(row.entryPath,ENTRY);assert.equal(row.origin,app.origin);assert(row.updatedAt>=row.stageStartedAt);assert(!/never-log|controlToken|password|recovery|session_token/i.test(JSON.stringify(row)));if(row.artifactPath){assert.equal(path.dirname(row.artifactPath),dir);assert(path.basename(row.artifactPath).startsWith('fixture.sqlite.pre-'));}}
  assert(rows.every(row=>row.startedAt===rows[0].startedAt),'attempt start never resets across stages');
  assert.equal(new Set(rows.filter(row=>row.stage==='archive').map(row=>row.stageStartedAt)).size,1,'counting and archive creation share one bounded archive phase');
  assert.deepEqual(JSON.parse(fs.readFileSync(app.exercises)),{duplicateStageKeptOriginalStart:true,otherDatabaseRejected:true,unrelatedArtifactRejected:true,staleAttemptRejected:true});
  const db=new DatabaseSync(app.databasePath,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash,'never-log-password-hash');assert.equal(db.prepare('SELECT COUNT(*) n FROM retired_feature_archives').get().n,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{db.close();}
  assert.equal((await fetch(app.origin+'/desktop-startup.json')).status,404);assert.equal((await fetch(app.origin+'/api/desktop-startup',{headers:{cookie:'sar_session='+TEST_TOKEN}})).status,404);
 }finally{if(app)await stop(app);cleanup(dir);}
});
test('a genuine snapshot preparation lasting beyond15seconds remains identifiable and becomes healthy only after verified migration',async()=>{
 const dir=directory();let app;
 try{
  app=await launch(dir,{slow:true});await until(()=>fs.existsSync(app.marker)&&JSON.parse(fs.readFileSync(app.marker)).stage==='snapshot');
  const first=JSON.parse(fs.readFileSync(app.marker));await delay(15200);
  const still=JSON.parse(fs.readFileSync(app.marker));assert.equal(still.stage,'snapshot');assert.equal(still.stageStartedAt,first.stageStartedAt);assert.equal(still.updatedAt,first.updatedAt,'marker updates are not fabricated progress');assert.equal(app.child.exitCode,null);
  const premature=await fetch(app.origin+'/api/status',{signal:AbortSignal.timeout(500)}).catch(()=>null);assert.equal(premature,null,'unready migration cannot pass the health gate');
  await ready(app);const cpu=JSON.parse(fs.readFileSync(path.join(dir,'cpu-work.json')));assert(cpu.user+cpu.system>500000,'the owned child performed measurable work during the long stage');
  const db=new DatabaseSync(app.databasePath,{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);}finally{db.close();}
 }finally{if(app)await stop(app);cleanup(dir);}
});
test('failed export reports a sanitized failing stage, retains originals and retries with a new attempt exactly once',async()=>{
 const dir=directory();let first,second;
 try{
  first=await launch(dir,{failure:true});const end=await first.exited;assert.equal(end.code,1);
  const failed=JSON.parse(fs.readFileSync(first.marker));assert.equal(failed.stage,'failed');assert.match(failed.message,/archive-verify/);assert(!failed.message.includes('never-log'));
  let db=new DatabaseSync(first.databasePath,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,8);assert.equal(db.prepare('SELECT body FROM messages').get().body,'private retired message: never-log-body');}finally{db.close();}
  second=await launch(dir);await ready(second);const current=JSON.parse(fs.readFileSync(second.marker));assert.equal(current.attempt,second.nonce);assert.notEqual(current.attempt,failed.attempt);assert.equal(current.pid,second.child.pid);assert.equal(current.stage,'ready');
  db=new DatabaseSync(second.databasePath,{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) n FROM retired_feature_archives').get().n,1);assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);}finally{db.close();}
 }finally{if(first)await stop(first);if(second)await stop(second);cleanup(dir);}
});

