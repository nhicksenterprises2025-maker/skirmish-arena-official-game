'use strict';
// Private desktop lifecycle control. Nothing is added to the public HTTP API.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');

function checkpointOnly(){
  const file=path.resolve(process.env.SAR_DB_PATH||'');
  if(!process.env.SAR_DB_PATH||!fs.statSync(file).isFile())throw Error('Canonical database is unavailable');
  // Raw SQLite avoids applying a new migration while the old service owns it.
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{timeout:5000});
  try{
    const result=db.prepare('PRAGMA wal_checkpoint(FULL)').get();
    if(result.busy!==0||result.checkpointed<result.log)throw Error('Canonical database checkpoint is busy');
    console.log(JSON.stringify({ok:true,checkpointed:result.checkpointed,log:result.log}));
  }finally{db.close();}
}

function startDesktopService(){
  const {createServer}=require('./index.cjs');
  const host=process.env.SAR_HOST||'127.0.0.1',port=Number(process.env.SAR_PORT||8803);
  if(!['127.0.0.1','localhost','::1'].includes(host))throw Error('Desktop backend must bind a loopback address');
  const databasePath=path.resolve(process.env.SAR_DB_PATH||path.join(__dirname,'data','skirmish.sqlite'));
  const serviceRoot=path.resolve(process.env.SAR_SERVICE_ROOT||path.dirname(databasePath));
  fs.mkdirSync(serviceRoot,{recursive:true});
  const marker=path.join(serviceRoot,'desktop-service.json'),token=crypto.randomBytes(32).toString('hex');
  const scope=crypto.createHash('sha256').update(serviceRoot+'\0'+port).digest('hex').slice(0,20);
  const pipe=process.platform==='win32'?`\\\\.\\pipe\\skirmish-arena-${scope}-${process.pid}`:path.join(serviceRoot,`desktop-${scope}-${process.pid}.sock`);
  const app=createServer();
  const metadata={schema:1,pid:process.pid,nodeExecutable:path.resolve(process.execPath),entryPath:path.resolve(__filename),databasePath,version:require('../version.json').version,databaseSchema:app.db.prepare('PRAGMA user_version').get().user_version,origin:process.env.SAR_LOCAL_SERVER_ORIGIN||`http://${host.includes(':')?'['+host+']':host}:${port}`,controlPipe:pipe,controlToken:token,startedAt:Date.now()};
  let stopping=false,closed=false;
  const sockets=new Set();
  function authenticated(value){
    if(typeof value!=='string'||!/^[0-9a-f]{64}$/i.test(value))return false;
    return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(token));
  }
  function removeMarker(){
    try{const current=JSON.parse(fs.readFileSync(marker,'utf8'));if(current.pid===process.pid&&current.controlToken===token)fs.unlinkSync(marker);}catch{}
    if(process.platform!=='win32')try{fs.unlinkSync(pipe);}catch{}
  }
  const control=net.createServer(socket=>{
    sockets.add(socket);socket.setTimeout(2500,()=>socket.destroy());let input='',handled=false;
    socket.on('close',()=>sockets.delete(socket));
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      if(handled)return;input+=chunk.toString('utf8');
      if(Buffer.byteLength(input)>4096){socket.destroy();return;}
      const newline=input.indexOf('\n');if(newline<0)return;handled=true;
      let request;try{request=JSON.parse(input.slice(0,newline));}catch{socket.end(JSON.stringify({ok:false,error:'Invalid lifecycle request'})+'\n');return;}
      if(!authenticated(request.token)){socket.end(JSON.stringify({ok:false,error:'Lifecycle authentication failed'})+'\n');return;}
      if(request.action==='health'){
        const {controlToken,...publicMetadata}=metadata;
        socket.end(JSON.stringify({ok:true,...publicMetadata,stopping})+'\n');
      }else if(request.action==='shutdown'){
        socket.end(JSON.stringify({ok:true,pid:process.pid,stopping:true})+'\n',()=>{void shutdown('authenticated desktop handoff');});
      }else socket.end(JSON.stringify({ok:false,error:'Unknown lifecycle action'})+'\n');
    });
  });
  async function shutdown(reason){
    if(stopping)return;stopping=true;
    console.log('Desktop backend shutting down safely: '+reason);
    control.close();
    const deadline=setTimeout(()=>{app.server.closeAllConnections();for(const socket of sockets)socket.destroy();},5000);deadline.unref();
    await new Promise(resolve=>app.server.close(resolve));
    // Existing server close handlers abort/dispose the dialogue worker first.
    await new Promise(resolve=>setImmediate(resolve));
    try{app.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');app.db.close();closed=true;}
    catch(error){console.error('Database shutdown:',error.message);process.exitCode=1;}
    clearTimeout(deadline);for(const socket of sockets)socket.destroy();removeMarker();
  }
  process.on('SIGINT',()=>{void shutdown('SIGINT');});
  process.on('SIGTERM',()=>{void shutdown('SIGTERM');});
  const startupFailure=error=>{
    console.error('Desktop backend startup failed:',error.message);removeMarker();
    if(!closed)try{app.db.close();}catch{}
    process.exit(1);
  };
  app.server.on('error',startupFailure);control.on('error',startupFailure);
  app.server.listen(port,host,()=>{
    control.listen(pipe,()=>{
      const temporary=marker+'.'+process.pid+'.tmp';
      try{fs.writeFileSync(temporary,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,marker);}
      catch(error){startupFailure(error);return;}
      console.log('Desktop backend healthy at '+host+':'+port+'; private lifecycle control ready; shared service persists across game windows.');
    });
  });
  return {shutdown,metadata};
}

if(require.main===module){
  try{if(process.argv.includes('--checkpoint-only'))checkpointOnly();else startDesktopService();}
  catch(error){console.error('Desktop backend startup failed:',error.message);process.exitCode=1;}
}
module.exports={startDesktopService,checkpointOnly};
