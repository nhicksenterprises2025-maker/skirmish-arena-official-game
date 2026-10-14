'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createDatabase}=require('../db.cjs'),{createServer}=require('../index.cjs'),XP=require('../../progression.js'),Competitive=require('../competitive-progression.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
test('Authenticated first-save and established-save reset injection cannot seed rank or unlock rewards without strict import mode',async()=>{
 const previousFlag=process.env.SAR_REQUIRE_TRUSTED_HISTORY;delete process.env.SAR_REQUIRE_TRUSTED_HISTORY;
 const db=createDatabase(':memory:'),id='reset-attacker',now=Date.now(),token=crypto.randomBytes(32).toString('hex');let app;
 try{
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'Reset_Attacker','reset_attacker','fixture',now,now);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),id,now,now+86400000,now);
  const original=copy(require('../../dev/simulate.cjs').engine().context.SAR.getUniverse());
  const attack=copy(original);XP.applyRankedReset(attack.ranked,{participantId:id,seasonId:'invented-reset',at:now,policy:{type:'set',ratingUnits:1000000}});XP.validateRanked(attack.ranked);
  Competitive.configure(db,{rewards:[{id:'high-rank-reward',name:'Configured high reward',type:'profile-icon',rankIndex:25,payload:{asset:'/assets/branding/app-256.png'}}]});
  app=createServer({db,multiplayerOptions:{manual:true}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port,request=async(save,revision)=>{const res=await fetch(base+'/api/world',{method:'PUT',headers:{cookie:'sar_session='+token,origin:base,'content-type':'application/json'},body:JSON.stringify({save,baseRevision:revision})});return {status:res.status,data:await res.json()};};
  const first=await request(attack,0);assert.equal(first.status,409,JSON.stringify(first.data));
  const imported=await fetch(base+'/api/world/import',{method:'POST',headers:{cookie:'sar_session='+token,origin:base,'content-type':'application/json'},body:JSON.stringify({save:attack})});assert.equal(imported.status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM worlds WHERE user_id=?').get(id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mp_progression_baselines WHERE user_id=?').get(id).n,0);
  assert.equal((await request(original,0)).status,200);
  const saved=db.prepare('SELECT * FROM worlds WHERE user_id=?').get(id);
  assert.equal((await request(attack,1)).status,409);
  assert.deepEqual(db.prepare('SELECT * FROM worlds WHERE user_id=?').get(id),saved);
  const profile=Competitive.snapshot(db,id,now,'test');assert.equal(profile.ranked.ratingUnits,0);assert.equal(profile.rewards[0].state,'LOCKED');
  Competitive.configure(db,{seasons:[{id:'server-transition',label:'Configured future season',startAt:now+1000,endAt:now+100000,reset:{type:'set',ratingUnits:25000}}]});
  const serverProfile=Competitive.snapshot(db,id,now+2000,'test');assert.equal(serverProfile.ranked.ratingUnits,25000);
  assert.equal((await request(original,1)).status,200,'A read-only server reset projection does not require rewriting the local world ledger');
  assert.equal(Competitive.snapshot(db,id,now+2000,'test').ranked.ratingUnits,25000);
 }finally{if(app){await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));}db.close();if(previousFlag===undefined)delete process.env.SAR_REQUIRE_TRUSTED_HISTORY;else process.env.SAR_REQUIRE_TRUSTED_HISTORY=previousFlag;}
});
test('Trusted already persisted historical reset receipts survive authenticated world checkpoint and projection unchanged',async()=>{
 const db=createDatabase(':memory:'),id='trusted-reset-history',now=Date.now(),token=crypto.randomBytes(32).toString('hex');let app;
 try{
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'Trusted_Reset','trusted_reset','fixture',now,now);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),id,now,now+86400000,now);
  const original=copy(require('../../dev/simulate.cjs').engine().context.SAR.getUniverse());XP.applyRankedReset(original.ranked,{participantId:id,seasonId:'trusted-old-season',at:now-1000,policy:{type:'set',ratingUnits:25000}});
  db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,1,?,?,?,?,?)').run(id,original.schema,JSON.stringify(original),now,original.seasons.current.startAt,original.seasons.current.endAt);
  app=createServer({db,multiplayerOptions:{manual:true}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  const res=await fetch(base+'/api/world',{method:'PUT',headers:{cookie:'sar_session='+token,origin:base,'content-type':'application/json'},body:JSON.stringify({save:original,baseRevision:1})});assert.equal(res.status,200,await res.text());
  const saved=JSON.parse(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(id).save_json);assert.deepEqual(saved.ranked,original.ranked);
  assert.equal(Competitive.snapshot(db,id,now,'test').ranked.ratingUnits,25000);
 }finally{if(app){await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));}db.close();}
});
