'use strict';
// A private marker for the launcher-owned child before its health endpoint exists.
// It never appears in the HTTP API and contains no account data or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const version=require('../version.json').version;
const STAGES=new Set(['opening-database','snapshot','snapshot-verify','archive','archive-verify','migration-9','migration-10','migration-11','listening','ready','failed']);
let active=null;
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function begin({databasePath,serviceRoot,origin,entryPath}){
  active=null;
  const attempt=process.env.SAR_STARTUP_ATTEMPT;
  if(!/^[0-9a-f]{32}$/.test(attempt||'')||!process.env.SAR_DB_PATH||!process.env.SAR_SERVICE_ROOT||!process.env.SAR_LOCAL_SERVER_ORIGIN)return false;
  if(!databasePath||!serviceRoot||!entryPath||!path.isAbsolute(databasePath)||!path.isAbsolute(serviceRoot)||!path.isAbsolute(entryPath))return false;
  if(!same(databasePath,process.env.SAR_DB_PATH)||!same(serviceRoot,process.env.SAR_SERVICE_ROOT)||!same(entryPath,path.join(__dirname,'desktop-service.cjs'))||!process.argv[1]||!same(entryPath,process.argv[1]))return false;
  let url,expected;try{url=new URL(origin);expected=new URL(process.env.SAR_LOCAL_SERVER_ORIGIN);}catch{return false;}
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/'||url.search||url.hash||url.origin!==expected.origin)return false;
  fs.mkdirSync(serviceRoot,{recursive:true});
  active={schema:1,pid:process.pid,attempt,version,startedAt:Date.now(),databasePath:path.resolve(databasePath),nodeExecutable:path.resolve(process.execPath),entryPath:path.resolve(entryPath),origin:url.origin,marker:path.join(path.resolve(serviceRoot),'desktop-startup.json'),state:null};
  emit('opening-database');return true;
}
function emit(stage,{artifactPath}={}){
  if(!active||process.env.SAR_STARTUP_ATTEMPT!==active.attempt)return false;
  if(!STAGES.has(stage))throw new Error('Unknown private desktop startup stage');
  if(active.state){
    let current;try{current=JSON.parse(fs.readFileSync(active.marker,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(current&&(current.pid!==active.pid||current.attempt!==active.attempt))return false;
  }
  let artifact=null;
  if(artifactPath){
    artifact=path.resolve(artifactPath);
    if(!same(path.dirname(artifact),path.dirname(active.databasePath))||!path.basename(artifact).startsWith(path.basename(active.databasePath)+'.pre-'))throw new Error('Startup artifact does not belong to the canonical database');
  }
  const now=Date.now(),old=active.state;
  const state={schema:active.schema,pid:active.pid,attempt:active.attempt,version:active.version,startedAt:active.startedAt,databasePath:active.databasePath,nodeExecutable:active.nodeExecutable,entryPath:active.entryPath,origin:active.origin,stage,artifactPath:artifact,updatedAt:now,stageStartedAt:old?.stage===stage?old.stageStartedAt:now};
  if(stage==='failed')state.message=old?.stage==='failed'?old.message:'Startup failed during '+(old?.stage||'initialization')+'. See server.stderr.log for diagnostics.';
  const temporary=active.marker+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});
    fs.renameSync(temporary,active.marker);
  }catch(error){
    try{fs.unlinkSync(temporary);}catch(cleanup){if(cleanup.code!=='ENOENT')console.error('Private startup marker cleanup failed:',cleanup.code||'filesystem error');}
    throw new Error('Private startup diagnostics could not be recorded ('+(error.code||'filesystem error')+')');
  }
  active.state=state;return true;
}
function forDatabase(file,stage,detail){
  if(!active||file===':memory:'||!same(file,active.databasePath))return false;
  return stage==='failed'?fail():emit(stage,detail);
}
function fail(){try{return emit('failed');}catch(error){console.error('Private startup failure marker unavailable:',error.message);return false;}}
module.exports={begin,emit,forDatabase,fail};

