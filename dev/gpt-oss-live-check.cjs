'use strict';
// One real provider generation in an isolated in-memory account; no installed data is touched.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createDatabase}=require('../server/db.cjs'),{writeWorld}=require('../server/world.cjs'),AI=require('../server/local-ai.cjs'),{engine}=require('./simulate.cjs');
const db=createDatabase(':memory:'),user='live-provider-check',started=Date.now();
(async()=>{try{
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user,user,user,'isolated-no-login',started,started);
 writeWorld(db,user,engine().context.SAR.getUniverse(),0);AI.setPreferences(db,user,{developerMode:true,botInitiated:false});
 const before=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(user).save_json,status=await AI.status(db,user);assert.equal(status.status,'CONNECTED');
 const context=AI.botContext(db,user,'bot_0001',{weapon:'SR-Aug'}),facts=context.authoritativeGameFacts.weapons.find(w=>w.name==='SR-Aug');assert.equal(facts.mechanics.roundsPerBurst,3);assert.ok(Math.abs(facts.mechanics.bodyTTK-1.715)<1e-9);
 const {jobId}=AI.lab(db,user,{botId:'bot_0001',eventType:'NEW_WEAPON',mockContext:{weapon:'SR-Aug'}});let result;
 for(let i=0;i<480;i++){AI.kick(db);result=AI.jobResult(db,user,jobId);if(['COMPLETED','FAILED'].includes(result.job.status))break;await new Promise(resolve=>setTimeout(resolve,500));}
 assert.equal(result.job.status,'COMPLETED',result.job.error);assert.ok(result.generation.validatedMessage.body);assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(user).save_json,before);
 const evidence={result:'PASS',provider:status.status,model:'gpt-oss:20b',elapsedMs:Date.now()-started,jobStatus:result.job.status,attempts:result.job.attempts,validatedMessage:result.generation.validatedMessage,worldUnchanged:true,srAugFacts:facts.mechanics};fs.writeFileSync(__dirname+'/gpt-oss-live-results.json',JSON.stringify(evidence,null,2));console.log('PASS real Ollama gpt-oss:20b generated a validated SR-Aug message; account/world remained unchanged.');
 }finally{AI.dispose(db);db.close();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
