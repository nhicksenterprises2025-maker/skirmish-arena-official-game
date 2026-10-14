'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDatabase,upsertWorldTables}=require('../db.cjs'),{engine}=require('../../dev/simulate.cjs'),{createRuntime}=require('../multiplayer-runtime.cjs');
const Rewards=require('../multiplayer-progression.cjs'),Bots=require('../bot-multiplayer-projection.cjs');
const KEEP=10*60000,clone=value=>JSON.parse(JSON.stringify(value));let base;
function fixture({settle=true}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-terminal-cache-')),file=path.join(directory,'fixture.sqlite'),db=createDatabase(file);let clock=Date.now(),runtime;
 base??=clone(engine().dev.inspect().SAVE);const save=clone(base);
 for(const id of ['owner','guest']){db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'test-only-not-a-credential',clock,clock);db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,1,?,?,?,?,?)').run(id,save.schema,JSON.stringify(save),clock,save.seasons.current.startAt,save.seasons.current.endAt);upsertWorldTables(db,id,save,clock);}
 const finalize=(result,entry)=>{if(settle)Rewards.applyResult(db,result,entry);};
 const open=(canonicalOwner)=>runtime=createRuntime({db,now:()=>clock,manual:true,casualWaitMs:0,onResult:finalize,...(canonicalOwner?{botOwnerId:canonicalOwner}:{})});open('owner');
 return {db,file,directory,save,get runtime(){return runtime;},get now(){return clock;},advance(ms){clock+=ms;runtime.step(clock);},restart(ms=0){runtime.close();clock+=ms;open();},complete(){runtime.queue('guest','casual-deathmatch');runtime.ready('guest');clock+=3000;runtime.step(clock);clock+=3034;runtime.step(clock);const entry=runtime.activeFor('guest');assert.equal(entry.match.status,'active');entry.match.durationMs=1;clock+=34;runtime.step(clock);assert.equal(entry.match.status,'ended');return entry;},close(){runtime.close();db.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}};
}
function row(f,id){return f.db.prepare('SELECT * FROM mp_matches WHERE id=?').get(id);}
function history(f){return Object.fromEntries(['users','worlds','bots','bot_careers','bot_weapon_stats','mp_participations','mp_results','mp_progression_baselines','ac_wallets','ac_ledger','tournaments'].map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]));}
test('settled terminal VM retires only after ten minutes, preserving complete results, configuration and exact replay protection',()=>{
 const f=fixture();try{
  const entry=f.complete(),before=row(f,entry.id),saved=JSON.parse(before.state_json),worlds=f.db.prepare('SELECT * FROM worlds').all(),rawHistory=history(f),projection=Bots.projection(f.db,'owner');assert.ok(saved.checkpoint.data.length>10000);
  f.advance(KEEP);assert.equal(row(f,entry.id).state_json,before.state_json,'The reconnect window is preserved at its boundary');
  f.advance(1);const retired=row(f,entry.id),state=JSON.parse(retired.state_json);assert.equal(state.checkpoint.data,undefined);assert.equal(state.checkpoint.retiredAt,f.now);assert.equal(state.checkpoint.sourceHash,saved.checkpoint.sourceHash);assert.deepEqual(state.checkpoint.dependencies,saved.checkpoint.dependencies);assert.equal(state.checkpoint.bytes,saved.checkpoint.bytes);
  assert.deepEqual(state.terminal.config,f.save.config);assert.deepEqual(state.terminal.weaponConfiguration,f.save.patchState.weaponStats);assert.equal(state.terminal.match.matchId,entry.id);assert.equal(state.terminal.match.balanceFingerprint,entry.match.balanceFingerprint);assert.equal(state.terminal.participants.length,10);assert.deepEqual(state.terminal.participants.find(a=>a.userId==='guest').loadout,entry.match.participants.find(a=>a.userId==='guest').mpLoadout);
  for(const key of Object.keys(saved).filter(key=>key!=='checkpoint'))assert.deepEqual(state[key],saved[key]);assert.equal(retired.result_json,before.result_json);assert.equal(retired.updated_at,before.updated_at);assert.deepEqual(history(f),rawHistory);assert.deepEqual(Bots.projection(f.db,'owner'),projection);assert.deepEqual(f.db.prepare('SELECT * FROM worlds').all(),worlds);assert.equal(f.runtime.activeFor('guest'),undefined);assert.ok(Buffer.byteLength(retired.state_json)<Buffer.byteLength(before.state_json)/4);
  f.restart(1000);assert.equal(f.runtime.rosterOwnerId(),'owner');assert.equal(row(f,entry.id).state_json,retired.state_json,'Startup retirement is idempotent');assert.equal(Rewards.applyResult(f.db,JSON.parse(retired.result_json),{id:entry.id})[0].applied,false);assert.deepEqual(history(f),rawHistory);assert.deepEqual(Bots.projection(f.db,'owner'),projection);
  f.runtime.queue('guest','casual-deathmatch');const next=f.runtime.activeFor('guest');assert.equal(next.ownerId,'owner');assert.ok(next.match.participants.filter(a=>!a.isPlayer).every(a=>!saved.botIds.includes(a.sourceBotId)),'Waiting-pool priority survives terminal VM retirement');
 }finally{f.close();}
});
test('unpaid terminal receipts keep the full checkpoint through restart and retire after settlement without duplicate awards',()=>{
 const f=fixture({settle:false});try{
  const entry=f.complete();f.advance(KEEP+1);assert.ok(JSON.parse(row(f,entry.id).state_json).checkpoint.data);assert.equal(f.db.prepare('SELECT applied_at FROM mp_results WHERE match_id=?').get(entry.id).applied_at,0);
  f.restart(KEEP+1);assert.ok(JSON.parse(row(f,entry.id).state_json).checkpoint.data,'Startup must not discard an unpaid game');const result=JSON.parse(row(f,entry.id).result_json);Rewards.applyResult(f.db,result,{id:entry.id});const records=f.db.prepare('SELECT * FROM mp_results WHERE match_id=?').all(entry.id),wallets=f.db.prepare('SELECT * FROM ac_wallets').all();f.restart();const retired=row(f,entry.id);assert.equal(JSON.parse(retired.state_json).checkpoint.data,undefined);assert.deepEqual(f.db.prepare('SELECT * FROM mp_results WHERE match_id=?').all(entry.id),records);assert.deepEqual(f.db.prepare('SELECT * FROM ac_wallets').all(),wallets);assert.equal(Rewards.applyResult(f.db,result,{id:entry.id})[0].applied,false);f.restart();assert.equal(row(f,entry.id).state_json,retired.state_json);
 }finally{f.close();}
});
test('a missing participant receipt prevents retirement and remains recoverable from the unchanged authoritative result',()=>{
 const f=fixture({settle:false});try{
  const entry=f.complete(),result=JSON.parse(row(f,entry.id).result_json);Rewards.applyResult(f.db,result,{id:entry.id});f.db.prepare('DELETE FROM mp_results WHERE match_id=? AND user_id=?').run(entry.id,'guest');f.advance(KEEP+1);const retained=row(f,entry.id);assert.ok(JSON.parse(retained.state_json).checkpoint.data);f.restart(KEEP+1);assert.ok(JSON.parse(row(f,entry.id).state_json).checkpoint.data);Rewards.applyResult(f.db,result,{id:entry.id});f.restart();assert.equal(JSON.parse(row(f,entry.id).state_json).checkpoint.data,undefined);assert.equal(row(f,entry.id).result_json,retained.result_json);
 }finally{f.close();}
});
test('cancelled preparation keeps its complete VM, roster and reason after cleanup and restart',()=>{
 const f=fixture();try{
  const party={id:'test-party',leaderId:'owner',members:[{id:'owner',ready:true},{id:'guest',ready:true}]};f.runtime.custom('owner',{mode:'tdm',difficulty:'Hard',bots:[]},party);f.runtime.ready('owner');f.advance(30001);const entry=f.runtime.activeFor('owner');assert.equal(entry.match.status,'cancelled');assert.equal(entry.match.endReason,'preparation-timeout');const before=row(f,entry.id);f.advance(KEEP+1);assert.equal(row(f,entry.id).state_json,before.state_json);assert.ok(JSON.parse(before.state_json).checkpoint.data);assert.equal(f.db.prepare('SELECT count(*) n FROM mp_results WHERE match_id=?').get(entry.id).n,0);f.restart(KEEP+1);assert.equal(row(f,entry.id).state_json,before.state_json);assert.ok(JSON.parse(row(f,entry.id).state_json).checkpoint.data);
 }finally{f.close();}
});
