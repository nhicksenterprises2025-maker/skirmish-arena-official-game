'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const launcher=path.resolve(__dirname,'..');
const executable=path.resolve(process.argv[2]||path.join(launcher,'dist/skirmish-launcher.exe'));
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'sar-occupied-backend-'));
let server,origin,connections=0;
async function diagnostic(name){
  const report=path.join(fixture,name+'.json');
  const child=spawn(executable,['--verify-startup',origin,report],{windowsHide:true,stdio:'ignore',env:{...process.env,SAR_LAUNCHER_DATA_ROOT:fixture,SAR_DB_PATH:path.join(fixture,'skirmish.sqlite')}});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{child.kill();reject(Error('Native occupied-port diagnostic exceeded 15 seconds'));},15000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('Native diagnostic exited '+code));});
  });
  return JSON.parse(fs.readFileSync(report,'utf8'));
}
(async()=>{
  try{
    server=http.createServer((req,res)=>{
      // Its TCP listener is healthy, but its API exceeds the launcher's health deadline.
      setTimeout(()=>{if(res.destroyed)return;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,version:'1.5.3',databaseSchema:3}));},5000).unref();
    });
    server.on('connection',()=>{connections++;});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    origin='http://127.0.0.1:'+server.address().port;
    const results=await Promise.all(['first','concurrent','retry'].map(diagnostic));
    for(const result of results){assert.equal(result.online,false);assert.match(result.startupError||result.error||'',/occupied|health is unavailable/i);}
    assert.equal(fs.existsSync(path.join(fixture,'skirmish.sqlite')),false,'Unhealthy occupied port must not initialize another database/AI runtime');
    const log=fs.readFileSync(path.join(fixture,'local-service/startup.log'),'utf8');
    assert.equal(log.includes('Started hidden bundled backend'),false,'No duplicate backend may be spawned');
    const response=await fetch(origin+'/api/status');assert.equal((await response.json()).ok,true,'Existing process must survive unchanged');
    assert.ok(connections>=4);
    console.log(JSON.stringify({ok:true,groups:4,checks:['slow health + occupied TCP leaves process untouched','concurrent launchers never spawn duplicate','no account DB/AI runtime initialized','later retry preserves existing process'],fixture}));
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
