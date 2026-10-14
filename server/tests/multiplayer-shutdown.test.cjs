'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{fork}=require('node:child_process'),{DatabaseSync}=require('node:sqlite'),WebSocket=require('ws');
const {createDatabase,upsertWorldTables}=require('../db.cjs'),{createServer}=require('../index.cjs'),{engine}=require('../../dev/simulate.cjs');
const root=path.resolve(__dirname,'../..'),entry=path.join(root,'server/index.cjs'),preload=path.join(__dirname,'fixtures/emit-shutdown-signal.cjs'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function seed(db){
 const at=Date.now(),id='shutdown-human',token=crypto.randomBytes(32).toString('base64url'),save=JSON.parse(JSON.stringify(engine().dev.inspect().SAVE));save.config.primary='FAL';
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'ShutdownFixture','shutdownfixture','test-only-unused-password-hash',at,at);
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),id,at,at+86400000,at);
 db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,1,?,?,?,?,?)').run(id,save.schema,JSON.stringify(save),at,save.seasons.current.startAt,save.seasons.current.endAt);upsertWorldTables(db,id,save,at);
 return {id,cookie:'sar_session='+token,world:JSON.stringify(save)};
}
async function client(base,user){
 const ws=new WebSocket(base.replace('http:','ws:')+'/api/multiplayer/socket',{headers:{cookie:user.cookie,origin:base}}),messages=[],pending=new Map();let sequence=0;
 const state=await new Promise((resolve,reject)=>{ws.once('error',reject);ws.on('message',bytes=>{const message=JSON.parse(bytes);messages.push(message);if(message.type==='state')resolve(message.data);if(message.id&&pending.has(message.id)){const waiter=pending.get(message.id);pending.delete(message.id);clearTimeout(waiter.timeout);if(message.type==='error')waiter.reject(Object.assign(Error(message.data.error),message.data));else waiter.resolve(message.data);}});});
 return {ws,state,messages,action(type,data={}){return new Promise((resolve,reject)=>{const id='shutdown:'+ ++sequence,timeout=setTimeout(()=>reject(Error('Action timed out: '+type)),3000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,type,data}));});}};
}
test('Multiplayer quiescence drains authenticated presence handlers once and rejects further input/upgrades',async()=>{
 const db=createDatabase(':memory:'),user=seed(db),app=createServer({db,multiplayerOptions:{manual:true}});let c;
 try{
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;c=await client(base,user);assert.equal(db.prepare('SELECT connected FROM mp_presence WHERE user_id=?').get(user.id).connected,1);
  const closed=new Promise(resolve=>c.ws.once('close',code=>resolve(code))),first=app.multiplayer.close();assert.equal(app.multiplayer.close(),first,'Repeated shutdown returns the original drain promise');assert.throws(()=>app.multiplayer.action(user,'ping',{}),error=>error.status===503);
  await new Promise((resolve,reject)=>{let expected=false;const denied=new WebSocket(base.replace('http:','ws:')+'/api/multiplayer/socket',{headers:{cookie:user.cookie,origin:base}});denied.once('unexpected-response',(_request,response)=>{try{assert.equal(response.statusCode,503);expected=true;response.resume();resolve();}catch(error){reject(error);}});denied.once('open',()=>reject(Error('New socket accepted during shutdown')));denied.on('error',error=>{if(!expected)reject(error);});});
  assert.equal(await closed,1001);await first;assert.equal(db.prepare('SELECT connected FROM mp_presence WHERE user_id=?').get(user.id).connected,0);assert.equal(app.multiplayer.runtime.activeMatches().length,0);
 }finally{app.stopTournaments();await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));db.close();}
});
async function freePort(){const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
async function launch(file){
 const port=await freePort(),env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('SAR_')));Object.assign(env,{SAR_HOST:'127.0.0.1',SAR_PORT:String(port),SAR_DB_PATH:file,SAR_SHUTDOWN_TEST:'1',SAR_STRIPE_SANDBOX_ENABLED:'false',NODE_ENV:'test'});
 const child=fork(entry,[],{cwd:root,env,execArgv:['--require',preload],silent:true}),logs={stdout:'',stderr:''};child.stdout.on('data',bytes=>logs.stdout+=bytes);child.stderr.on('data',bytes=>logs.stderr+=bytes);const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const base='http://127.0.0.1:'+port,until=Date.now()+15000;while(Date.now()<until){if(child.exitCode!==null)throw Error('Server exited during fixture startup: '+logs.stderr);try{const response=await fetch(base+'/api/status',{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.json()).ok)return {child,logs,exited,base};}catch(error){if(!['ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code)&&error.name!=='TimeoutError')throw error;}await delay(25);}throw Error('Server startup timed out');
}
function signal(server,name){if(process.platform==='win32')server.child.send({type:'fixture-signal',signal:name});else server.child.kill(name);}
async function exitClean(server,name){const at=Date.now();signal(server,name);const result=await Promise.race([server.exited,delay(12000).then(()=>{throw Error('Shutdown exceeded fixture deadline');})]);assert.equal(result.code,0,server.logs.stderr);assert.equal(result.signal,null);assert(!/database is not open|ERR_INVALID_STATE|Server shutdown:|exceeded its drain/.test(server.logs.stderr),server.logs.stderr);return Date.now()-at;}
test('Production signal handler drains a live match, restarts its exact checkpoint and bounds unresponsive socket shutdown',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-network-shutdown-')),file=path.join(directory,'world.sqlite'),db=createDatabase(file),user=seed(db);db.close();let first,second,c,reconnected;
 try{
  first=await launch(file);c=await client(first.base,user);await c.action('background',{ready:true,slots:[]});const preparing=await c.action('custom',{config:{mode:'deathmatch',bots:[]}}),matchId=preparing.match.id;await c.action('ready');
  const until=Date.now()+10000;while(!c.messages.some(frame=>frame.type==='snapshot'&&frame.data.state==='active')&&Date.now()<until)await delay(50);assert(c.messages.some(frame=>frame.type==='snapshot'&&frame.data.state==='active'),'The real match must reach active simulation');
  await c.action('input',{seq:1,moveX:1,aim:0,fire:true,ads:true});await delay(150);const actorId=c.messages.findLast(frame=>frame.type==='snapshot').data.localActorId;assert((await exitClean(first,'SIGTERM'))<10000);
  const saved=new DatabaseSync(file,{readOnly:true});try{assert.equal(saved.prepare('SELECT connected FROM mp_presence WHERE user_id=?').get(user.id).connected,0);assert.equal(saved.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(user.id).save_json,user.world);assert.equal(saved.prepare('SELECT count(*) n FROM mp_results').get().n,0);assert.equal(saved.prepare('SELECT count(*) n FROM mp_matches WHERE id=?').get(matchId).n,1);assert.equal(saved.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{saved.close();}
  second=await launch(file);reconnected=await client(second.base,user);assert.equal(reconnected.state.match.id,matchId);assert.equal(reconnected.state.localActorId,actorId);assert.equal(reconnected.state.roster.filter(row=>row.userId===user.id).length,1);assert.equal(reconnected.state.state,'active');
  reconnected.ws._socket.pause();const elapsed=await exitClean(second,'SIGINT');assert(elapsed>=4500&&elapsed<10000,'Unresponsive socket must be terminated within the existing drain window');
  const final=new DatabaseSync(file,{readOnly:true});try{assert.equal(final.prepare('SELECT connected FROM mp_presence WHERE user_id=?').get(user.id).connected,0);assert.equal(final.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(user.id).save_json,user.world);assert.equal(final.prepare('SELECT count(*) n FROM mp_results').get().n,0);assert.equal(final.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{final.close();}
 }finally{c?.ws.terminate();reconnected?.ws.terminate();for(const server of [first,second])if(server&&server.child.exitCode===null){server.child.kill();await server.exited;}assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});
