'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),AI=require('../local-ai.cjs'),{createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),{engine}=require('../../dev/simulate.cjs');
test('Balance7 factual context derives all six changed weapons from the active configuration',()=>{
 const db=createDatabase(':memory:'),id='balance-seven-context',now=Date.now(),expected=require('../../dev/fixtures/balance-7.0.json');try{
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'isolated',now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);
  for(const name of ['AK47','SMG-9','LR-762','LW Tundra','SR-Aug','SPAS-12']){const context=AI.botContext(db,id,'bot_0001',{weapon:name}),w=context.authoritativeGameFacts.weapons.find(w=>w.name===name);assert.ok(w,name+' context');for(const key of ['damage','head','spread','walkSpread','sprintSpread','adsSpread','falloffStart','falloff','hitSpeed','mag','reload'])assert.equal(w.stats[key],expected.weapons[name][key],name+' '+key);assert.equal(w.mechanics.preferredTiles,expected.weapons[name].preferred/70);}
 }finally{AI.dispose(db);db.close();}
});
test('SR-Aug dialogue uses real cadence and rejects confusing round spacing with burst cycles',()=>{
 const db=createDatabase(':memory:'),id='sr-context',now=Date.now();try{
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'isolated',now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);
 const context=AI.botContext(db,id,'bot_0001',{weapon:'SR-Aug'}),w=context.authoritativeGameFacts.weapons.find(w=>w.name==='SR-Aug');assert.equal(w.role,'Triple Burst AR');assert.equal(w.stats.damage,24);assert.equal(w.stats.head,49);assert.equal(w.stats.pellets,1);assert.equal(w.mechanics.roundsPerBurst,3);assert.ok(Math.abs(w.mechanics.bodyTTK-2.165)<1e-9);assert.ok(Math.abs(w.mechanics.headTTK-.83)<1e-9);assert.equal(w.mechanics.preferredTiles,750/70);
 assert.throws(()=>AI.mechanicalGuard({body:'SR-Aug fires 3-shot bursts every 0.065 s.'},context),/burst STARTS/);assert.throws(()=>AI.mechanicalGuard({body:'SR-Aug fires three pellets.'},context),/independent bullets/);assert.doesNotThrow(()=>AI.mechanicalGuard({body:'SR-Aug starts bursts every 0.70 seconds, with individual bullets 65 ms apart.'},context));
 assert.throws(()=>AI.mechanicalGuard({body:'Each trigger pull of the SR\u2011Aug shoots a 3\u2011bullet burst\u2014one bullet per burst.'},context),/3 independent bullets PER BURST/);
 assert.throws(()=>AI.mechanicalGuard({body:'SR-Aug fires two rounds in each burst.'},context),/3 independent bullets PER BURST/);
 assert.throws(()=>AI.mechanicalGuard({body:'SR-Aug fires a single projectile per burst.'},context),/3 independent bullets PER BURST/);
 assert.doesNotThrow(()=>AI.mechanicalGuard({body:'SR-Aug fires three independent bullets per burst, not one bullet per burst.'},context));
 }finally{AI.dispose(db);db.close();}
});
test('a contradictory actual-style SR-Aug reply is repaired before it reaches the conversation',async()=>{
 const requests=[],wrong='Each trigger pull of the SR\u2011Aug shoots a 3\u2011bullet burst\u2014one bullet per burst.',correct='SR-Aug fires three independent bullets per burst. Holding the trigger repeats successive bursts.';
 const provider=http.createServer(async(req,res)=>{res.writeHead(200,{'content-type':'application/json'});if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'gpt-oss:20b',digest:'isolated-aug-guard'}]}));return;}let raw='';for await(const chunk of req)raw+=chunk;requests.push(JSON.parse(raw));res.end(JSON.stringify({message:{content:JSON.stringify({subject:'SR-Aug mechanics',body:requests.length===1?wrong:correct,mood:'focused',category:'weapon',wantsReply:false,certainty:1})},done:true}));});
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));const previous=process.env.SAR_OLLAMA_URL;process.env.SAR_OLLAMA_URL='http://127.0.0.1:'+provider.address().port;
 const db=createDatabase(':memory:'),id='sr-repair',now=Date.now();try{
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'isolated',now,now);db.prepare('INSERT INTO ai_preferences(user_id,settings_json,updated_at) VALUES(?,?,?)').run(id,JSON.stringify({botInitiated:false}),now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);const before=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json;
  const reply=await AI.replyToBot(db,id,'bot_0001','Does the SR-Aug fire three separate bullets per trigger pull?');let result;
  for(let count=0;count<200;count++){AI.kick(db);result=AI.jobResult(db,id,reply.jobId);if(['COMPLETED','FAILED'].includes(result.job.status))break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(result.job.status,'COMPLETED');assert.equal(requests.length,2);assert.match(requests[1].messages.at(-1).content,/3 independent bullets PER BURST/);assert.equal(result.generation.validatedMessage.body,correct);const delivered=AI.messageRows(db,id).filter(message=>message.direction==='bot');assert.equal(delivered.length,1);assert.equal(delivered[0].body,correct);assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json,before);
 }finally{AI.dispose(db);db.close();await new Promise(resolve=>provider.close(resolve));if(previous===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previous;}
});
test('SPAS-12 dialogue context derives its shell, pellet, range and TTK facts from the active patch',()=>{
 const db=createDatabase(':memory:'),id='spas-context',now=Date.now();try{
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'isolated',now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);
  const context=AI.botContext(db,id,'bot_0001',{weapon:'SPAS-12'}),w=context.authoritativeGameFacts.weapons.find(w=>w.name==='SPAS-12');assert.equal(w.role,'3 Shot Shotgun');assert.equal(w.stats.damage,108);assert.equal(w.stats.head,220);assert.equal(w.stats.pellets,12);assert.equal(w.stats.mag,3);assert.equal(w.mechanics.preferredTiles,6);assert.equal(w.mechanics.bodyTTK,2);assert.equal(w.mechanics.headTTK,1);
  assert.doesNotThrow(()=>AI.mechanicalGuard({body:'SPAS-12 has 3 shells and 12 pellets per discharge.'},context));
 }finally{AI.dispose(db);db.close();}
});
