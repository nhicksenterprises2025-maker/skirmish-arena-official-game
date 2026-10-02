'use strict';
// Native-only stdio transport for the existing authenticated HTTP handlers.
// It never binds a port and never accepts world/auth/account mutation routes.
const crypto=require('node:crypto'),{PassThrough}=require('node:stream');
const {createDatabase,LATEST_DB_SCHEMA}=require('./db.cjs'),{createServer}=require('./index.cjs');
const localAI=require('./local-ai.cjs');
const SESSION_TTL=30*60*1000;
function response(status,body,contentType='application/json; charset=utf-8'){return {status,body,contentType};}
function allowed(pathname,method){
  return method==='GET'&&['/api/ai/status','/api/ai/export','/api/ai/offline-account','/api/ai/bridge-status','/api/messages'].includes(pathname)
    ||method==='PATCH'&&pathname==='/api/ai/preferences'
    ||method==='POST'&&['/api/ai/test','/api/ai/lab','/api/ai/feedback','/api/messages/reply'].includes(pathname)
    ||method==='GET'&&/^\/api\/ai\/jobs\/[0-9a-f-]{36}$/i.test(pathname)
    ||method==='GET'&&/^\/api\/messages\/thread\/[a-z0-9_%.-]+$/i.test(pathname)
    ||method==='POST'&&/^\/api\/messages\/[0-9a-f-]{36}\/read$/i.test(pathname)
    ||method==='DELETE'&&/^\/api\/messages\/[0-9a-f-]{36}$/i.test(pathname);
}
function createBridge({db=createDatabase(),ownsDatabase=true}={}){
  // The native launcher gives this process exclusive ownership of the local AI
  // runtime while its HTTP service is absent, and closes it before starting one.
  const {server}=createServer({db}),sessions=new Map();let closed=false;
  function trustedSession(accountId){
    if(typeof accountId!=='string'||!accountId||accountId.length>128)return null;
    const user=db.prepare('SELECT id,disabled_at FROM users WHERE id=?').get(accountId);if(!user||user.disabled_at)return null;
    let session=sessions.get(accountId);
    if(!session){const token=crypto.randomBytes(32).toString('base64url');session={token,hash:crypto.createHash('sha256').update(token).digest('hex')};sessions.set(accountId,session);}
    const now=Date.now();
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET expires_at=excluded.expires_at,last_seen_at=excluded.last_seen_at').run(session.hash,accountId,now,now+SESSION_TTL,now);
    return session.token;
  }
  async function request(input){
    if(closed)return response(503,{error:'Local message service is closed'});
    if(!input||typeof input!=='object'||Array.isArray(input))return response(400,{error:'Invalid native request'});
    const method=String(input.method||'GET').toUpperCase();
    if(typeof input.path!=='string'||!input.path.startsWith('/api/')||input.path.length>2048)return response(404,{error:'Local route not available'});
    let url;try{url=new URL(input.path,'http://native.local');}catch{return response(400,{error:'Invalid local path'});}
    if(url.origin!=='http://native.local'||url.hash||!allowed(url.pathname,method))return response(404,{error:'Local route not available'});
    const token=trustedSession(input.accountId);if(!token)return response(401,{error:'A cached authenticated local account is required'});
    if(url.pathname==='/api/ai/bridge-status')return response(200,{busy:!!db.prepare("SELECT 1 FROM ai_jobs WHERE status='RUNNING' LIMIT 1").get()});
    if(url.pathname==='/api/ai/offline-account'){
      const row=db.prepare('SELECT u.id,u.username,w.revision,w.updated_at AS updatedAt FROM users u LEFT JOIN worlds w ON w.user_id=u.id WHERE u.id=?').get(input.accountId);
      return response(200,{account:{id:row.id,username:row.username,revision:row.revision||0},updatedAt:row.updatedAt||0});
    }
    let body;try{body=typeof input.body==='string'?input.body:JSON.stringify(input.body??{});}catch{return response(400,{error:'Invalid JSON request'});}
    if(Buffer.byteLength(body,'utf8')>16384)return response(413,{error:'Request body is too large'});
    return new Promise(resolve=>{
      const req=new PassThrough();req.url=url.pathname+url.search;req.method=method;
      req.headers={host:'native.local','content-type':'application/json',cookie:'sar_session='+token};req.socket={encrypted:false,remoteAddress:'native-loopback'};
      const headers=new Map();let status=200,ended=false;
      const res={headersSent:false,setHeader(key,value){headers.set(key.toLowerCase(),value);},getHeader(key){return headers.get(key.toLowerCase());},writeHead(code,values={}){status=code;for(const [key,value] of Object.entries(values))this.setHeader(key,value);this.headersSent=true;},end(payload=''){
        if(ended)return;ended=true;const contentType=headers.get('content-type')||'application/json; charset=utf-8';let result=String(payload);
        if(contentType.startsWith('application/json')){try{result=JSON.parse(result);}catch{resolve(response(502,{error:'Invalid local response'}));return;}}
        resolve(response(status,result,contentType));
      },destroy(){if(!ended){ended=true;resolve(response(500,{error:'Local request failed'}));}}};
      server.emit('request',req,res);req.end(['GET','DELETE'].includes(method)?'':body);
    });
  }
  async function close(){
    if(closed)return;closed=true;localAI.dispose(db);server.emit('close');
    // Let an aborted generation observe its closed runtime before releasing DB.
    await new Promise(resolve=>setImmediate(resolve));
    if(db.isOpen){for(const session of sessions.values())db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.hash);if(ownsDatabase)db.close();}
    sessions.clear();
  }
  return {request,close};
}
function proxyOrigin(){
  if(!process.env.SAR_LOCAL_SERVER_ORIGIN)return null;
  const url=new URL(process.env.SAR_LOCAL_SERVER_ORIGIN);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/')throw Error('Native transport requires an exact loopback origin');
  return url.origin;
}
async function online(origin){
  if(!origin)return false;
  try{const res=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(900),redirect:'error'});const data=await res.json();return res.ok&&data.ok===true&&data.databaseSchema===LATEST_DB_SCHEMA&&data.version===require('../version.json').version;}catch{return false;}
}
async function proxyRequest(origin,input){
  let url;try{url=new URL(input?.path,origin);}catch{return response(400,{error:'Invalid native request'});}
  const method=String(input.method||'GET').toUpperCase();
  if(!input.path?.startsWith('/api/')||url.origin!==origin||!allowed(url.pathname,method))return response(404,{error:'Local route not available'});
  const db=createDatabase();let hash;
  try{
    const user=typeof input.accountId==='string'&&db.prepare('SELECT id,disabled_at FROM users WHERE id=?').get(input.accountId);
    if(!user||user.disabled_at)return response(401,{error:'A cached authenticated local account is required'});
    if(url.pathname==='/api/ai/bridge-status')return response(200,{busy:false});
    if(url.pathname==='/api/ai/offline-account'){
      const row=db.prepare('SELECT u.id,u.username,w.revision,w.updated_at AS updatedAt FROM users u LEFT JOIN worlds w ON w.user_id=u.id WHERE u.id=?').get(user.id);
      return response(200,{account:{id:row.id,username:row.username,revision:row.revision||0},updatedAt:row.updatedAt||0});
    }
    const token=crypto.randomBytes(32).toString('base64url');hash=crypto.createHash('sha256').update(token).digest('hex');const now=Date.now();
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(hash,user.id,now,now+SESSION_TTL,now);
    const body=typeof input.body==='string'?input.body:JSON.stringify(input.body??{});
    if(Buffer.byteLength(body,'utf8')>16384)return response(413,{error:'Request body is too large'});
    // A cached native account can use its independent local Messages service
    // without starting a second model worker when the HTTP backend is healthy.
    const res=await fetch(url,{method,headers:{'content-type':'application/json',cookie:'sar_session='+token},body:['GET','DELETE'].includes(method)?undefined:body,signal:AbortSignal.timeout(20000),redirect:'error'});
    const kind=res.headers.get('content-type')||'application/json';return response(res.status,kind.startsWith('application/json')?await res.json():await res.text(),kind);
  }finally{if(hash)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);db.close();}
}
async function run(){
  // stdout is exclusively one JSON response per request, even if a dependency
  // adds informational logging later. Node diagnostics already use stderr.
  const util=require('node:util');for(const name of ['log','info','debug'])console[name]=(...args)=>process.stderr.write(util.format(...args)+'\n');
  const origin=proxyOrigin(),readline=require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity});let bridge=null,pending=Promise.resolve(),stopping=false;
  readline.on('line',line=>{
    pending=pending.then(async()=>{
      let result;
      if(Buffer.byteLength(line,'utf8')>32768)result=response(413,{error:'Request body is too large'});
      else try{
        const input=JSON.parse(line);
        if(await online(origin)){
          if(bridge){await bridge.close();bridge=null;}
          result=await proxyRequest(origin,input);
        }else{bridge??=createBridge();result=await bridge.request(input);}
      }catch(error){console.error('Native local messages:',error.message);result=response(400,{error:'Invalid native request'});}
      process.stdout.write(JSON.stringify(result)+'\n');
    });
  });
  async function stop(){if(stopping)return;stopping=true;readline.close();await pending;if(bridge)await bridge.close();}
  readline.on('close',()=>{void stop();});process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
}
if(require.main===module)run().catch(error=>{console.error('Native local messages:',error.message);process.exitCode=1;});
module.exports={createBridge};
