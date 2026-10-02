'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),readline=require('node:readline'),{spawn}=require('node:child_process');
const {createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),{engine}=require('../../dev/simulate.cjs'),{createServer}=require('../index.cjs'),AI=require('../local-ai.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function seed(db,id){const now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'never-send-password-hash',now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);db.prepare('INSERT INTO ai_preferences(user_id,settings_json,updated_at) VALUES(?,?,?)').run(id,JSON.stringify({developerMode:true,botInitiated:false}),now);}
function worker(file,ollama,origin=''){
  const child=spawn(process.execPath,[path.join(__dirname,'../offline-bridge.cjs')],{windowsHide:true,env:{...process.env,SAR_DB_PATH:file,SAR_OLLAMA_URL:ollama,SAR_GPT_OSS_URL:'',SAR_LOCAL_SERVER_ORIGIN:origin,NODE_NO_WARNINGS:'1'},stdio:['pipe','pipe','pipe']});
  const lines=readline.createInterface({input:child.stdout}),waiters=[];let stderr='',parseError=null;
  child.stderr.on('data',data=>{stderr+=data;});
  lines.on('line',line=>{try{const result=JSON.parse(line);assert.equal(typeof result.status,'number');waiters.shift()?.resolve(result);}catch(error){parseError=error;waiters.shift()?.reject(error);}});
  child.on('error',error=>{while(waiters.length)waiters.shift().reject(error);});
  async function request(pathname,{accountId='offline-owner',method='GET',body}={}){
    if(parseError)throw parseError;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native bridge response timeout: '+pathname+' '+stderr)),8000);waiters.push({resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});child.stdin.write(JSON.stringify({accountId,path:pathname,method,body})+'\n');});
  }
  async function close(){let timer;const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.stdin.end();try{const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(Error('Native bridge did not stop after stdin EOF'));},6000);})]);assert.equal(result.code,0,stderr);}finally{clearTimeout(timer);lines.close();}}
  return {request,close,child,get stderr(){return stderr;}};
}
test('native JSON-lines bridge reuses local GPT queue without HTTP backend and preserves canonical account/world/messages',async()=>{
  let active=0,maxActive=0;const generations=[],mock=http.createServer(async(req,res)=>{
    if(req.url==='/api/tags'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({models:[{name:'gpt-oss:20b',digest:'offline-mock-version'}]}));return;}
    assert.equal(req.url,'/api/chat');let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);generations.push(input);active++;maxActive=Math.max(maxActive,active);await delay(500);active--;
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({message:{content:JSON.stringify({subject:'Local reply',body:'I would wait for more range data before touching the P90.',mood:'focused',category:'balance',wantsReply:true,certainty:.6})},done:true}));
  });await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-native-offline-')),file=path.join(directory,'canonical.sqlite');let db=createDatabase(file),bridge;
  try{
    seed(db,'offline-owner');seed(db,'other-owner');
    const before=db.prepare('SELECT revision,save_json,updated_at FROM worlds WHERE user_id=?').get('offline-owner'),userBefore=db.prepare('SELECT * FROM users WHERE id=?').get('offline-owner');db.close();
    bridge=worker(file,'http://127.0.0.1:'+mock.address().port);
    const status=await bridge.request('/api/ai/status');assert.equal(status.status,200);assert.equal(status.body.status,'CONNECTED');assert.equal(status.body.model,'gpt-oss:20b');
    const account=await bridge.request('/api/ai/offline-account');assert.equal(account.status,200);assert.deepEqual(account.body.account,{id:'offline-owner',username:'offline-owner',revision:before.revision});assert.equal(account.body.updatedAt,before.updated_at);assert.ok(!JSON.stringify(account).includes('password'));
    for(const route of ['/api/world','/api/auth/signup','/api/account','/api/admin/tournaments','https://example.com/api/ai/status'])assert.equal((await bridge.request(route,{method:'POST',body:{save:{}}})).status,404);
    assert.equal((await bridge.request('/api/ai/status',{accountId:'unknown'})).status,401);
    assert.equal((await bridge.request('/api/ai/preferences',{method:'PATCH',body:'broken json'})).status,400);
    const preferences=await bridge.request('/api/ai/preferences',{method:'PATCH',body:JSON.stringify({botMessages:true,playerReplies:true,botInitiated:false,developerMode:true,temperature:.65})});assert.equal(preferences.status,200);assert.equal(preferences.body.preferences.temperature,.65);
    assert.equal((await bridge.request('/api/messages/reply',{method:'POST',body:{botId:'bot_0001',text:'   '}})).status,400);
    const reply=await bridge.request('/api/messages/reply',{method:'POST',body:JSON.stringify({botId:'bot_0001',text:'How is the P90 at range?'})});assert.equal(reply.status,201);assert.equal(reply.body.pending,true);assert.ok(reply.body.jobId);
    const second=await bridge.request('/api/ai/test',{method:'POST',body:{botId:'bot_0005'}});assert.equal(second.status,202);
    for(let i=0;i<100&&!active;i++)await delay(10);assert.equal(active,1);assert.deepEqual((await bridge.request('/api/ai/bridge-status')).body,{busy:true});
    async function job(id){for(let i=0;i<150;i++){const result=await bridge.request('/api/ai/jobs/'+id);assert.equal(result.status,200);if(['COMPLETED','FAILED'].includes(result.body.job.status))return result.body;await delay(40);}throw Error('Offline local queue timeout');}
    const generated=await job(reply.body.jobId),diagnostic=await job(second.body.jobId);assert.equal(generated.job.status,'COMPLETED');assert.equal(diagnostic.job.status,'COMPLETED');assert.equal(maxActive,1);assert.ok(generations.length>=2);assert.ok(generations.every(g=>g.model==='gpt-oss:20b'&&g.stream===false&&g.think==='medium'));assert.ok(!JSON.stringify(generations).includes('never-send-password-hash'));
    assert.deepEqual((await bridge.request('/api/ai/bridge-status')).body,{busy:false});
    const list=await bridge.request('/api/messages');assert.equal(list.status,200);assert.ok(list.body.messages.some(m=>m.id===reply.body.messageId));const botMessage=list.body.messages.find(m=>m.source==='ollama:gpt-oss:20b');assert.ok(botMessage);assert.equal(botMessage.body,generated.generation.validatedMessage.body);
    const thread=await bridge.request('/api/messages/thread/bot_0001');assert.equal(thread.status,200);assert.ok(thread.body.messages.length>=2);assert.equal(thread.body.nextCursor,null);
    const other=await bridge.request('/api/messages',{accountId:'other-owner'});assert.equal(other.status,200);assert.equal(other.body.messages.length,0);assert.equal((await bridge.request('/api/ai/jobs/'+reply.body.jobId,{accountId:'other-owner'})).status,404);assert.equal((await bridge.request('/api/messages/'+reply.body.messageId,{accountId:'other-owner',method:'DELETE'})).status,404);
    assert.equal((await bridge.request('/api/messages/'+botMessage.id+'/read',{method:'POST',body:'{}'})).status,200);assert.ok((await bridge.request('/api/messages')).body.messages.find(m=>m.id===botMessage.id).readAt);
    assert.equal((await bridge.request('/api/ai/feedback',{method:'POST',body:{generationId:generated.generation.id,rating:'GOOD'}})).status,200);const exported=await bridge.request('/api/ai/export');assert.equal(exported.status,200);assert.match(exported.contentType,/application\/x-ndjson/);assert.equal(JSON.parse(exported.body.trim()).rating,'GOOD');
    assert.equal((await bridge.request('/api/messages/'+reply.body.messageId,{method:'DELETE'})).status,200);assert.ok(!(await bridge.request('/api/messages')).body.messages.some(m=>m.id===reply.body.messageId));
    await bridge.close();bridge=null;db=createDatabase(file);
    assert.deepEqual(db.prepare('SELECT revision,save_json,updated_at FROM worlds WHERE user_id=?').get('offline-owner'),before);assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get('offline-owner'),userBefore);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT body FROM messages WHERE id=?').get(botMessage.id).body,botMessage.body);assert.equal(db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(reply.body.jobId).status,'COMPLETED');
  }finally{if(bridge)await bridge.close();if(db.isOpen)db.close();await new Promise(resolve=>mock.close(resolve));const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});}
});

test('healthy local HTTP backend owns the only AI worker while native proxy preserves running jobs and cleans temporary sessions',async()=>{
  let active=0,maxActive=0,release;const held=new Promise(resolve=>{release=resolve;}),generations=[],mock=http.createServer(async(req,res)=>{
    if(req.url==='/api/tags'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({models:[{name:'gpt-oss:20b',digest:'http-owner-mock'}]}));return;}
    assert.equal(req.url,'/api/chat');let raw='';for await(const chunk of req)raw+=chunk;generations.push(JSON.parse(raw));active++;maxActive=Math.max(maxActive,active);await held;await delay(30);active--;
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({message:{content:JSON.stringify({subject:'Local reply',body:'I would wait for more range data before touching the P90.',mood:'focused',category:'balance',wantsReply:true,certainty:.6})},done:true}));
  });await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-native-proxy-')),file=path.join(directory,'canonical.sqlite'),previousOllama=process.env.SAR_OLLAMA_URL,previousRemote=process.env.SAR_GPT_OSS_URL;
  process.env.SAR_OLLAMA_URL='http://127.0.0.1:'+mock.address().port;process.env.SAR_GPT_OSS_URL='';let db=createDatabase(file),server,bridge;
  async function waitFor(predicate,label){for(let i=0;i<500;i++){if(predicate())return;await delay(10);}throw Error(label+' timed out');}
  try{
    seed(db,'offline-owner');const before=db.prepare('SELECT revision,save_json,updated_at FROM worlds WHERE user_id=?').get('offline-owner');
    ({server}=createServer({db}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await AI.probe(db,true);
    const first=AI.lab(db,'offline-owner',{botId:'bot_0001'},true);await waitFor(()=>active===1,'HTTP generation start');const running=db.prepare('SELECT status,attempts FROM ai_jobs WHERE id=?').get(first.jobId);assert.equal(running.status,'RUNNING');assert.equal(running.attempts,1);
    bridge=worker(file,process.env.SAR_OLLAMA_URL,'http://127.0.0.1:'+server.address().port);
    const status=await bridge.request('/api/ai/status');assert.equal(status.status,200);assert.equal(status.body.status,'CONNECTED');assert.equal(status.body.queue.active,1);
    assert.equal((await bridge.request('/api/ai/offline-account')).body.account.id,'offline-owner');assert.equal((await bridge.request('/api/messages')).status,200);
    // The proxy has no owned generation to abort when the launcher closes it.
    assert.deepEqual((await bridge.request('/api/ai/bridge-status')).body,{busy:false});
    const second=await bridge.request('/api/ai/test',{method:'POST',body:{botId:'bot_0005'}});assert.equal(second.status,202);
    assert.deepEqual(db.prepare('SELECT status,attempts FROM ai_jobs WHERE id=?').get(first.jobId),running);assert.equal(db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(second.body.jobId).status,'QUEUED');assert.equal(generations.length,1);assert.equal(maxActive,1);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    await delay(500);assert.deepEqual(db.prepare('SELECT status,attempts FROM ai_jobs WHERE id=?').get(first.jobId),running);assert.equal(generations.length,1);release();
    await waitFor(()=>{AI.kick(db);return [first.jobId,second.body.jobId].every(id=>db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id).status==='COMPLETED');},'Shared HTTP queue completion');
    assert.equal(generations.length,2);assert.equal(maxActive,1);for(const id of [first.jobId,second.body.jobId])assert.equal(db.prepare('SELECT attempts FROM ai_jobs WHERE id=?').get(id).attempts,1);
    const completed=await bridge.request('/api/ai/jobs/'+second.body.jobId);assert.equal(completed.status,200);assert.equal(completed.body.job.status,'COMPLETED');assert.deepEqual((await bridge.request('/api/ai/bridge-status')).body,{busy:false});assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    await bridge.close();bridge=null;assert.deepEqual(db.prepare('SELECT revision,save_json,updated_at FROM worlds WHERE user_id=?').get('offline-owner'),before);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
  }finally{
    release();if(bridge)await bridge.close();if(server)await new Promise(resolve=>server.close(resolve));AI.dispose(db);if(db.isOpen)db.close();await new Promise(resolve=>mock.close(resolve));if(previousOllama===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previousOllama;if(previousRemote===undefined)delete process.env.SAR_GPT_OSS_URL;else process.env.SAR_GPT_OSS_URL=previousRemote;
    const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});
  }
});
