'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDatabase,upsertWorldTables}=require('../db.cjs'),{engine}=require('../../dev/simulate.cjs'),{createRuntime}=require('../multiplayer-runtime.cjs');
const Rewards=require('../multiplayer-progression.cjs'),Profiles=require('../../profile-stats.js'),Social=require('../social.cjs'),XP=require('../../progression.js'),Maps=require('../../map-data.js');
const clone=v=>JSON.parse(JSON.stringify(v)),newModes=['gun-game','domination','hardpoint'];let base;
function fixture(options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-mode-expansion-')),db=createDatabase(path.join(directory,'world.sqlite'));let clock=Date.parse('2026-10-13T12:00:00Z'),runtime;
 base??=clone(engine().dev.inspect().SAVE);const save=clone(base);save.config.primary='FAL';
 for(let i=0;i<10;i++){const id='human-'+i;db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'Human '+i,id,'fixture-only',clock,clock);db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,1,?,?,?,?,?)').run(id,save.schema,JSON.stringify(save),clock,save.seasons.current.startAt,save.seasons.current.endAt);upsertWorldTables(db,id,save,clock);}
 const open=()=>runtime=createRuntime({db,now:()=>clock,manual:true,casualWaitMs:0,maxSteps:20000,onResult:(r,m)=>Rewards.applyResult(db,r,m),...options});open();
 return {db,save,get runtime(){return runtime;},get now(){return clock;},advance(ms){clock+=ms;runtime.step(clock);},restart(ms=0,next={}){runtime.close();clock+=ms;Object.assign(options,next);open();},close(){runtime.close();db.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}};
}
function enter(f,ids=['human-0']){for(const id of ids)f.runtime.ready(id);f.advance(3000);assert.equal(f.runtime.snapshot(ids[0]).state,'countdown');f.advance(3034);assert.equal(f.runtime.snapshot(ids[0]).state,'active');}
function complete(f,id='human-0'){const entry=f.runtime.activeFor(id);entry.match.durationMs=1;f.advance(34);assert.equal(entry.match.status,'ended');return entry;}
function party(ids){return {id:'party:'+ids[0],leaderId:ids[0],members:ids.map(id=>({id,ready:true}))};}

test('new casual queues preserve ten unique persistent participants and authoritative mode state; Ranked remains TDM/DM only',()=>{
 const f=fixture();try{const before=f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all();
  for(const [i,mode]of newModes.entries()){const id='human-'+i;f.runtime.queue(id,'casual-'+mode);const s=f.runtime.snapshot(id);assert.equal(s.match.mode,mode);assert.equal(s.roster.length,10);assert.equal(new Set(s.roster.map(a=>a.participantId)).size,10);assert.equal(s.match.sessionType,'standard');assert.equal(s.match.modeRulesRevision,'mode-expansion-1');
   if(mode==='gun-game'){assert.equal(new Set(s.roster.map(a=>a.team)).size,10);assert.ok(s.modeState.weaponOrder.includes('FAL'));assert.ok(s.roster.every(a=>a.gunTier===0));}else{assert.deepEqual([0,1].map(team=>s.roster.filter(a=>a.team===team).length),[5,5]);assert.equal(s.objectives.filter(z=>z.active).length,mode==='domination'?3:1);}
  }
  for(const mode of newModes)assert.throws(()=>f.runtime.queue('human-9','ranked-'+mode),/available multiplayer mode/);
  assert.throws(()=>f.runtime.custom('human-9',{mode:'ranked-tdm'}),/available multiplayer mode/);assert.throws(()=>f.runtime.queue('human-9','casual-ranked-deathmatch'),/available multiplayer mode/);
  assert.deepEqual(f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),before);const ids=f.runtime.activeMatches().flatMap(e=>e.match.participants.filter(a=>!a.isPlayer).map(a=>a.sourceBotId));assert.equal(new Set(ids).size,ids.length);
 }finally{f.close();}
});

test('objective capture excludes disconnected humans immediately and reconnect restores one unchanged actor',()=>{
 const f=fixture();try{f.runtime.custom('human-0',{mode:'domination',bots:[]},party(['human-0','human-1']));enter(f,['human-0','human-1']);const entry=f.runtime.activeFor('human-0'),a=entry.match.participants[0],zone=entry.match.objectives[0];a.team=0;a.x=zone.x;a.y=zone.y;entry.match.participants[1].x=zone.x+zone.radius+500;
  f.runtime.connect('human-0','first');f.advance(1000);assert.ok(zone.progress>0);const before=zone.progress;f.runtime.disconnect('human-0','first');assert.equal(a.objectiveEligible,false);f.advance(1000);assert.ok(zone.progress<=before,'Disconnected idle positions cannot capture');f.runtime.connect('human-0','replacement');assert.equal(a.objectiveEligible,true);assert.equal(f.runtime.snapshot('human-0').localActorId,a.id);f.advance(1000);assert.ok(zone.progress>0);
  assert.throws(()=>f.runtime.input('human-0',{seq:0,objectiveOwner:0}),/Only gameplay intent/);
 }finally{f.close();}
});

test('active objective schedules and Gun Game tiers survive persisted restart without duplicate players/results',()=>{
 for(const mode of newModes){const f=fixture();try{f.runtime.custom('human-0',{mode,bots:[]},party(['human-0','human-1']));enter(f,['human-0','human-1']);const entry=f.runtime.activeFor('human-0'),a=entry.match.participants[0];
   if(mode==='gun-game'){a.gunTier=3;a.gunTierKills=0;}else{entry.match.objectives[0].owner=0;entry.match.modeState.elapsedMs=22000;entry.match.modeState.scoreElapsedMs=400;entry.match.score[0]=17;}
   const actorId=a.id,id=entry.id,state=clone(entry.match.modeState),zones=clone(entry.match.objectives||[]);f.restart();const restored=f.runtime.activeFor('human-0');assert.equal(restored.id,id);assert.equal(restored.match.participants.find(a=>a.userId==='human-0').id,actorId);assert.deepEqual(clone(restored.match.modeState),state);assert.deepEqual(clone(restored.match.objectives||[]),zones);assert.equal(restored.match.participants[0].gunTier,mode==='gun-game'?3:undefined);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mp_participations WHERE match_id=?').get(id).n,2);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mp_results').get().n,0);
  }finally{f.close();}}
});

test('all permanent custom modes finalize stat-isolated on every arena and retain immutable result/map/rules metadata',()=>{
 for(const mode of newModes)for(const map of Maps.list()){const f=fixture();try{const before=f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all();f.runtime.custom('human-0',{mode,mapId:map.id,bots:[]},party(['human-0','human-1']));enter(f,['human-0','human-1']);const entry=complete(f),result=entry.result;assert.equal(result.mapId,map.id);assert.equal(result.modeRulesRevision,'mode-expansion-1');assert.equal(result.eligible,false);assert.equal(result.xpEligible,false);const p=Rewards.projection(f.db,'human-0');assert.equal(p.totals.games,0);assert.equal(p.records.length,1);assert.equal(p.records[0].xp,null);assert.equal(p.records[0].rating,null);assert.deepEqual(f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),before);Rewards.applyResult(f.db,result,entry);assert.equal(Rewards.projection(f.db,'human-0').records.length,1);
  }finally{f.close();}}
});

test('eligible new mode results remain separate, Combined de-duplicates raw participation, and no Ranked rating changes',()=>{
 const f=fixture();try{const original=clone(f.save.ranked),worlds=f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all();for(const mode of newModes){f.runtime.queue('human-0','casual-'+mode);enter(f);const entry=f.runtime.activeFor('human-0'),a=entry.match.participants.find(a=>a.userId==='human-0');Object.assign(a.stats,{kills:3,deaths:2,shots:7,hits:3,damage:90});a.xpEvents.usedWeapons=['FAL'];complete(f);f.runtime.leave('human-0');}
  const p=Rewards.projection(f.db,'human-0');assert.equal(p.totals.games,3);assert.equal(p.byMode.tdm.games,0);assert.equal(p.byMode.deathmatch.games,0);for(const mode of newModes)assert.equal(p.byMode[mode].games,1);assert.deepEqual(p.ranked,original);assert.ok(p.progression.totalXPUnits>f.save.progression.totalXPUnits);XP.validate(p.progression);
  const combined=Profiles.project(f.save,{participantId:'human-0',accountId:'human-0',networkRecords:[...p.records,...p.records],officialRecords:[],officialAvailable:true});assert.equal(combined.totals.games,3);assert.equal(combined.totals.kills,p.totals.kills);assert.equal(combined.ratios.kd,p.totals.kills/p.totals.deaths);assert.equal(combined.ratios.accuracy,p.totals.hits/p.totals.shots);const ranked=Profiles.project(f.save,{kind:'ranked',participantId:'human-0',accountId:'human-0',networkRecords:p.records});assert.equal(ranked.totals.games,0);assert.deepEqual(f.db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),worlds);
 }finally{f.close();}
});

test('party/chat permissions admit objective teams but never Gun Game team chat or voice',()=>{
 const f=fixture();try{const now=f.now;const call=(user,mode)=>Social.handle({db:f.db,user:{id:user},method:'POST',pathname:'/api/social/party/mode',body:{mode},now});
  Social.handle({db:f.db,user:{id:'human-0'},method:'POST',pathname:'/api/social/party/create',body:{},now});for(const mode of newModes)assert.equal(call('human-0','casual-'+mode).data.party.mode,'casual-'+mode);for(const mode of newModes)assert.throws(()=>call('human-0','ranked-'+mode),/Unknown multiplayer mode/);
  f.runtime.custom('human-0',{mode:'gun-game',bots:[]},party(['human-0','human-1']));const id=f.runtime.activeFor('human-0').id;assert.throws(()=>Social.chat(f.db,{id:'human-0'},{scope:'team',matchId:id,text:'no'},{now}),/no team chat/);assert.equal(Social.authorizeVoice(f.db,'human-0','human-1','team',{matchId:id}),false);
 }finally{f.close();}
});

function limited(id,xpEligible,statEligible){return {id,name:'Fixture '+id,description:'Isolated test; never enabled by default.',activeFrom:'2026-10-13T11:00:00Z',activeUntil:'2026-10-13T13:00:00Z',mapPool:['foundry-crossing'],teamSize:1,rules:{baseMode:'gun-game',durationMs:30000},allowedLoadouts:['FAL','9mm'],xpEligible,statEligible};}
test('configured Gun Game uses only allowed live weapon tiers and resolves its final tier on the authoritative server',()=>{
 const definition={...limited('gun-authority',false,false),allowedLoadouts:['FAL','SR-Aug']},f=fixture({ltmDefinitions:[definition]});try{f.runtime.queue('human-0','ltm:gun-authority');enter(f);const entry=f.runtime.activeFor('human-0'),a=entry.match.participants.find(a=>a.userId==='human-0'),victims=entry.match.participants.filter(a=>!a.isPlayer);assert.deepEqual([...entry.match.modeState.weaponOrder].sort(),['FAL','SR-Aug'].sort());assert.ok(entry.match.participants.every(actor=>actor.slots.every(slot=>definition.allowedLoadouts.includes(slot.name))));
  f.runtime.input('human-0',{seq:0,slot:1});f.advance(34);assert.equal(a.currentSlot,0);const first=a.slots[0].name;entry.e.dev.killActor(victims[0],a,first,false,120,entry.e.dev.now());assert.equal(a.gunTier,1);assert.equal(entry.match.status,'active');assert.notEqual(a.slots[0].name,first);
  const step=entry.e.step;entry.e.step=dt=>{step(dt);entry.e.dev.killActor(victims[1],a,a.slots[0].name,false,120,entry.e.dev.now());};f.advance(34);entry.e.step=step;assert.equal(entry.match.status,'ended');assert.equal(entry.match.winner,a.id);assert.equal(entry.result.reason,'final-tier');assert.equal(Rewards.projection(f.db,'human-0').totals.games,0);assert.equal(Rewards.projection(f.db,'human-0').records[0].xp,null);
 }finally{f.close();}
});
test('LTM authority validates definitions, active dates, real maps/loadouts, independent XP/stats, and immutable resume after expiry',()=>{
 for(const [suffix,xpEligible,statEligible]of [['xp-only',true,false],['stats-only',false,true]]){const definition=limited(suffix,xpEligible,statEligible),f=fixture({ltmDefinitions:[definition]});try{assert.equal(f.runtime.snapshot('human-0').ltms.length,1);f.runtime.queue('human-0','ltm:'+suffix);const s=f.runtime.snapshot('human-0');assert.equal(s.match.sessionType,'ltm');assert.equal(s.match.mapId,'foundry-crossing');assert.equal(s.match.eligible,statEligible);assert.equal(s.match.xpEligible,xpEligible);enter(f);f.restart(7200000,{ltmDefinitions:[]});assert.equal(f.runtime.snapshot('human-1').ltms.length,0);const entry=f.runtime.activeFor('human-0');assert.equal(entry.match.context.ltmDefinition.id,suffix);f.runtime.connect('human-0','resumed');complete(f);const p=Rewards.projection(f.db,'human-0');assert.equal(p.totals.games,statEligible?1:0);assert.equal(!!p.records[0].xp,xpEligible);assert.equal(p.records[0].rating,null);XP.validate(p.progression);assert.throws(()=>f.runtime.queue('human-1','ltm:'+suffix),/unavailable/);
  }finally{f.close();}}
 const f=fixture();try{assert.deepEqual(f.runtime.snapshot('human-0').ltms,[]);}finally{f.close();}
});
test('removing an active LTM definition denies new admissions while preserving its already-persisted game',()=>{
 const definition=limited('removed-config',false,false),f=fixture({ltmDefinitions:[definition]});try{f.runtime.queue('human-0','ltm:removed-config');const id=f.runtime.activeFor('human-0').id;f.restart(0,{ltmDefinitions:[]});assert.deepEqual(f.runtime.snapshot('human-1').ltms,[]);assert.equal(f.runtime.activeFor('human-0').id,id);assert.throws(()=>f.runtime.queue('human-1','ltm:removed-config'),/unavailable/);
 }finally{f.close();}
});
