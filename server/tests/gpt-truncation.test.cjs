'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),{engine}=require('../../dev/simulate.cjs'),AI=require('../local-ai.cjs');
test('truncated GPT-OSS JSON retries once with a larger answer budget and publishes only validated real output',async()=>{
  const requests=[],valid={subject:'Range data',body:'I would wait for more matches before judging this weapon.',mood:'focused',category:'balance',wantsReply:true,certainty:.6};
  const mock=http.createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'gpt-oss:20b',digest:'recovery-test'}]}));return;}
    let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);requests.push(input);
    res.end(JSON.stringify({done:true,done_reason:requests.length===1?'length':'stop',message:{content:requests.length===1?'':JSON.stringify(valid)}}));
  });await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const previous=process.env.SAR_OLLAMA_URL;process.env.SAR_OLLAMA_URL='http://127.0.0.1:'+mock.address().port;
  const db=createDatabase(':memory:'),id='truncation-test';
  try{
    const now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'not-for-model',now,now);
    writeWorld(db,id,engine().context.SAR.getUniverse(),0);AI.setPreferences(db,id,{developerMode:true,botInitiated:false});
    const world=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json;
    await AI.status(db,id);const {jobId}=AI.lab(db,id,{botId:'bot_0001',eventType:'BALANCE_FEEDBACK',mockContext:{}});
    let result;for(let i=0;i<160;i++){AI.kick(db);result=AI.jobResult(db,id,jobId);if(['COMPLETED','FAILED'].includes(result.job.status))break;await new Promise(resolve=>setTimeout(resolve,20));}
    assert.equal(result.job.status,'COMPLETED');assert.equal(requests.length,2);
    assert.equal(requests[0].think,'medium');assert.equal(requests[0].options.num_predict,1200);
    assert.equal(requests[1].think,'low');assert.equal(requests[1].options.num_predict,4096);
    assert.deepEqual(result.generation.validatedMessage,valid);assert.equal(requests[1].model,'gpt-oss:20b');
    assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json,world);
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_generations').get().n,1);
  }finally{AI.dispose(db);db.close();await new Promise(resolve=>mock.close(resolve));if(previous===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previous;}
});
