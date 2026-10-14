'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),XP=require('../../progression.js'),Rewards=require('../multiplayer-progression.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const stats=extra=>({kills:0,deaths:0,assists:0,damage:0,taken:0,headshots:0,shots:0,hits:0,timeAlive:0,timePlayed:0,...extra});
function world(id){const p=XP.normalize(null),rank=XP.normalizeRanked(null);const input={participantId:id,matchId:'match:historical',kind:'ranked',mode:'tdm',sessionType:'ranked',eligible:true,practice:false,at:1000,stats:stats({kills:3,deaths:1,shots:3,hits:3,damage:84,timeAlive:30}),events:{...XP.events(),usedWeapons:['AR-15']},leaders:{kills:true,assists:false,alive:true},won:true,winStreak:1};XP.award(p,input);XP.awardRanked(rank,input);return {progression:p,ranked:rank,rankedResults:{},config:{skin:1},playerCareer:{games:4,kills:30,currentWinStreak:1},playerSeasons:{current:{number:3,stats:{games:4}}},modeStats:{deathmatch:{player:{games:2,kills:10,currentWinStreak:2},bots:{Bot:{games:1}}}},bots:{Bot:{career:{kills:10},profile:{id:'persistent-bot'}}},patchState:{generation:9},commerce:{credits:500,owned:['skin']} };}
function fixture(file=':memory:'){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,username_key TEXT,password_hash TEXT,disabled_at INTEGER); CREATE TABLE worlds(user_id TEXT PRIMARY KEY,save_json TEXT,revision INTEGER NOT NULL CHECK(revision>=1))');for(const file of ['006_overclock_commerce.sql','012_human_multiplayer.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
 for(let n=1;n<=10;n++){const id='user:'+n;db.prepare('INSERT INTO users VALUES(?,?,?,?,NULL)').run(id,'Player'+n,'player'+n,'not-exposed');db.prepare('INSERT INTO worlds(user_id,save_json,revision) VALUES(?,?,1)').run(id,JSON.stringify(world(id)));}return db;
}
function result(id='match:mp:fixture',mode='tdm',session='standard',count=2,at=2000){
 const rows=Array.from({length:count},(_,i)=>({userId:'user:'+(i+1),participantId:'user:'+(i+1),team:mode==='tdm'?i%2:null,type:'human',stats:stats({kills:i+1,deaths:1,assists:1,damage:(i+1)*28,shots:i+2,hits:i+1,timeAlive:30,timePlayed:40}),events:{...XP.events(),soloKills:1,usedWeapons:['FAL']},leaders:{kills:i===count-1,assists:true,alive:true},won:i===count-1,weaponStats:{FAL:{kills:i+1,shots:i+2,hits:i+1}},meta:{}}));
 return {matchId:id,mode,sessionType:session,eligible:session!=='custom',practice:false,endedAtWall:at,rows,rewards:{at,rows:rows.map(r=>({...r,participantId:r.userId,type:'human'}))}};
}
function persist(db,r,pending=false){
 db.prepare('INSERT INTO mp_matches(id,mode,status,state_json,result_json,created_at,updated_at) VALUES(?,?,\'ended\',\'{}\',?,?,?)').run(r.matchId,r.mode,JSON.stringify(r),r.endedAtWall-1000,r.endedAtWall);
 for(const row of r.rows){db.prepare('INSERT INTO mp_participations VALUES(?,?,?,\'{}\')').run(r.matchId,row.userId,row.team);if(pending)db.prepare('INSERT INTO mp_results VALUES(?,?,?,0)').run(r.matchId,row.userId,JSON.stringify(r));}
}
test('human Weapon Meta sums all equal-scale maps once and preserves map-specific participation provenance',()=>{
 const db=fixture();try{const Maps=require('../../map-data.js'),Units=require('../../distance-units.js'),reference=Units.worldProvenance(Units.mapCalibration('brightfield-blocks'));for(const [index,map]of Maps.list().entries()){const r=result('match:mp:meta:'+map.id,'tdm','standard',2,2000+index);r.mapId=map.id;r.mapVersion=map.revision;r.distanceProvenance=Units.worldProvenance(Units.mapCalibration(map.id));r.metaDistanceProvenance=reference;r.aiRevision='fixture-ai';r.rulesetRevision='fixture-rules';r.balance={version:'9.0',fingerprint:'fixture-balance9'};for(const row of r.rows)row.meta={FAL:{name:'FAL',kills:row.stats.kills,damage:row.stats.damage,shots:row.stats.shots,hits:row.stats.hits,engagementDistance:200,engagementDistanceN:2}};persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});assert.equal(Rewards.applyResult(db,r,{id:r.matchId}).some(receipt=>receipt.applied),false);}
  const p=Rewards.projection(db,'user:1'),mode=p.balanceMeta['fixture-balance9'].byMode.tdm;assert.equal(Object.keys(mode.cohorts).length,1);assert.equal(mode.completedMatches,3);assert.equal(mode.meta.FAL.kills,3);assert.equal(mode.meta.FAL.shots,6);assert.equal(mode.meta.FAL.engagementDistance,600);assert.equal(mode.meta.FAL.engagementDistanceN,6);assert.deepEqual(p.records.map(record=>record.mapId),Maps.list().map(map=>map.id));for(const record of p.records){assert.equal(record.distanceProvenance.mapId,record.mapId);assert.deepEqual(record.metaDistanceProvenance,reference);}assert.equal(p.totals.games,3);assert.deepEqual(Rewards.projection(db,'user:1'),p);
  const changed=result('match:mp:unknown-meta','tdm','standard',2,4000);changed.aiRevision='fixture-ai';changed.rulesetRevision='fixture-rules';changed.balance={version:'9.0',fingerprint:'fixture-balance9'};changed.distanceProvenance={distanceUnit:'world-unit',mapId:'unknown-scale',mapCalibration:{calibrationState:'unconfirmed'}};changed.metaDistanceProvenance=reference;changed.rows[0].meta={FAL:{kills:1}};persist(db,changed);Rewards.applyResult(db,changed,{id:changed.matchId});const separated=Rewards.projection(db,'user:1').balanceMeta['fixture-balance9'].byMode.tdm;assert.equal(Object.keys(separated.cohorts).length,2);assert.ok(Object.values(separated.cohorts).some(cohort=>cohort.completedMatches===3&&cohort.meta.FAL.kills===3));assert.equal(separated.distanceProvenance.mapId,'unknown-scale');
 }finally{db.close();}
});
test('Authoritative XP and weapon discovery preserve nonzero historical worlds and apply once',()=>{
 const db=fixture();try{
  const before=db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),r=result();persist(db,r,true);const outputs=Rewards.applyResult(db,r,{id:r.matchId});assert.equal(outputs.filter(o=>o.applied).length,2);
  const p=Rewards.projection(db,'user:2'),legacy=world('user:2'),expected=clone(legacy.progression);XP.award(expected,{...r.rows[1],matchId:r.matchId,participantId:'user:2',kind:'standard',mode:'tdm',sessionType:'standard',eligible:true,practice:false,at:2000,winStreak:2});
  assert.equal(p.progression.totalXPUnits,expected.totalXPUnits);assert.equal(p.progression.currentLevel,expected.currentLevel);assert.equal(p.progression.awards['match:historical'].units,legacy.progression.awards['match:historical'].units);
  assert.equal(p.totals.games,1);assert.equal(p.totals.kills,2);assert.equal(p.totals.shots,3);assert.equal(p.ratios.accuracy,2/3);assert.equal(p.records[0].xp.firstWeapons[0],'FAL');assert.equal(Rewards.applyResult(db,r,{id:r.matchId}).some(o=>o.applied),false);
  assert.deepEqual(db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_results WHERE applied_at>0').get().n,2);
 }finally{db.close();}
});
test('Ten-human Deathmatch persists per-participant raw records without dividing team totals',()=>{
 const db=fixture();try{
  const r=result('match:mp:dm','deathmatch','standard',10);persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_results').get().n,10);
  for(let i=0;i<10;i++){const p=Rewards.projection(db,'user:'+(i+1));assert.equal(p.byMode.deathmatch.kills,i+1);assert.equal(p.byMode.tdm.games,0);assert.equal(p.totals.wins,i===9?1:0);assert.equal(p.records[0].stats.damage,(i+1)*28);}
 }finally{db.close();}
});
test('Custom completion has session records but zero XP, ranked, careers, mastery or eligible totals',()=>{
 const db=fixture();try{
  const r=result('match:mp:custom','tdm','custom');persist(db,r);const old=world('user:1'),before=db.prepare('SELECT * FROM worlds').all();Rewards.applyResult(db,r,{id:r.matchId});
  const p=Rewards.projection(db,'user:1');assert.equal(p.records.length,1);assert.equal(p.records[0].eligible,false);assert.equal(p.records[0].xp,null);assert.equal(p.records[0].rating,null);assert.equal(p.totals.games,0);assert.deepEqual(p.progression,old.progression);assert.deepEqual(p.ranked,old.ranked);assert.deepEqual(db.prepare('SELECT * FROM worlds').all(),before);
 }finally{db.close();}
});
test('Abandonment preserves actual partial stats but earns no completion XP and cannot gain winning ranked rating',()=>{
 const db=fixture();try{
  const r=result('match:mp:abandoned','tdm','ranked');r.abandonedUserIds=['user:2'];r.rows[1].completed=false;persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});const p=Rewards.projection(db,'user:2'),old=world('user:2');assert.equal(p.records[0].teamOutcome,true);assert.equal(p.records[0].won,false);assert.equal(p.records[0].completed,false);assert.equal(p.records[0].xp,null);assert.equal(p.progression.totalXPUnits,old.progression.totalXPUnits);assert.equal(p.totals.kills,2);assert.equal(p.totals.losses,1);assert.ok(p.records[0].rating.calculatedUnits<0);assert.ok(p.summary.ranked.ratingUnits<old.ranked.participants['user:2'].ratingUnits);
 }finally{db.close();}
});
test('Ranked TDM and Ranked Deathmatch use shared formulas and survive reopen without duplicate awards',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-human-progression-')),file=path.join(dir,'world.sqlite');let db=fixture(file);try{
  const tdm=result('match:mp:ranktdm','tdm','ranked'),dm=result('match:mp:rankdm','deathmatch','ranked',2,3000);persist(db,tdm);persist(db,dm);Rewards.applyResult(db,tdm,{id:tdm.matchId});Rewards.applyResult(db,dm,{id:dm.matchId});const p=Rewards.projection(db,'user:2');
  const expected=clone(world('user:2').ranked);for(const r of [tdm,dm])XP.awardRanked(expected,{matchId:r.matchId,participantId:'user:2',kind:'ranked',mode:r.mode,sessionType:'ranked',eligible:true,practice:false,at:r.endedAtWall,stats:r.rows[1].stats,events:r.rows[1].events,leaders:r.rows[1].leaders,won:r.rows[1].won,winStreak:r.mode==='tdm'?2:3});assert.deepEqual(p.ranked,expected);
  db.close();db=new DatabaseSync(file);assert.deepEqual(Rewards.projection(db,'user:2'),p);assert.ok(Rewards.applyResult(db,dm,{id:dm.matchId}).every(o=>!o.applied));assert.equal(Object.keys(Rewards.projection(db,'user:2').ranked.participants['user:2'].awards).length,3);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Client result claims, mismatched identity and incomplete result rosters cannot award anything',()=>{
 const db=fixture();try{
  const r=result();assert.throws(()=>Rewards.applyResult(db,r,{id:r.matchId}),/persisted authoritative/);persist(db,r);const forged=clone(r);forged.rows[0].stats.kills=99;assert.throws(()=>Rewards.applyResult(db,forged,{id:r.matchId}),/persisted authoritative/);assert.throws(()=>Rewards.applyResult(db,r,{id:'other'}),/identities differ/);
  const incomplete=clone(r);incomplete.rows.pop();db.prepare('UPDATE mp_matches SET result_json=? WHERE id=?').run(JSON.stringify(incomplete),r.matchId);assert.throws(()=>Rewards.applyResult(db,incomplete,{id:r.matchId}),/missing a human/);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_results').get().n,0);
 }finally{db.close();}
});
test('World protection rejects forged human rewards while accepting unrelated bot, settings and telemetry progress',()=>{
 const db=fixture();try{
  const old=world('user:1');Rewards.ensureBaseline(db,'user:1');let next=clone(old);next.bots.Bot.career.kills++;next.modeStats.deathmatch.bots.Bot.games++;next.config.skin=4;next.patchState.completedMatches=20;assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);
  next=clone(old);next.playerCareer.weapons={FAL:{k:0,d:0,shots:0,hits:0,equippedTime:0}};assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);next.playerCareer.weapons.FAL.shots=1;assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),e=>e.code==='SERVER_AUTHORITY_REQUIRED');
  for(const mutate of [w=>w.progression.totalXPUnits++,w=>w.playerCareer.kills++,w=>w.playerSeasons.current.stats.games++,w=>w.modeStats.deathmatch.player.kills++,w=>w.ranked.participants['user:1'].ratingUnits++,w=>w.humanMultiplayer={totals:{games:999}}]){next=clone(old);mutate(next);assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),e=>e.code==='SERVER_AUTHORITY_REQUIRED');}
  for(const mode of ['gun-game','domination','hardpoint']){next=clone(old);next.modeStats[mode]={player:{name:'YOU',games:0,kills:0,recentMatches:[],weapons:{FAL:{shots:0}}}};assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);next.modeStats[mode].player.kills=1;assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),/resolved by the multiplayer server/);}
  next=clone(old);next.humanMultiplayer=Rewards.projection(db,'user:1');assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);assert.deepEqual(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get('user:1').save_json,JSON.stringify(old));
 }finally{db.close();}
});
test('The first post-upgrade world write establishes the existing historical baseline without needing a socket',()=>{
 const db=fixture();try{
  const old=world('user:1'),next=clone(old);next.playerCareer.kills++;assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_progression_baselines').get().n,0);assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),e=>e.code==='SERVER_AUTHORITY_REQUIRED');assert.equal(Rewards.projection(db,'user:1').progression.totalXPUnits,old.progression.totalXPUnits);
  assert.deepEqual(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get('user:1').save_json,JSON.stringify(old));
 }finally{db.close();}
});
test('Human weapon cohorts and range/classification telemetry are frozen while bot samples and clean patch migration remain valid',()=>{
 const db=fixture();try{
  const old=world('user:1');old.patchState={id:'patch:old',perBot:{'@human:YOU':{FAL:{k:1,killDistance:90}}},skillStrata:{human:{FAL:{kills:1,killDistance:90}}},aiSamples:{'ai:old':{perBot:{'@human:YOU':{FAL:{k:1}}}}}};
  old.patchState.participantAnalytics={samples:{'ai:old':{tdm:{human:{completedMatches:1,meta:{FAL:{kills:1,killDistance:90,soloKills:1}},skillStrata:{human:{FAL:{kills:1}}},participants:{'user:1':{meta:{FAL:{kills:1}}}}}},deathmatch:{human:{completedMatches:0,meta:{},skillStrata:{},participants:{}}}}}};
  Rewards.ensureBaseline(db,'user:1',old);let next=clone(old);next.patchState.participantAnalytics.samples['ai:old'].tdm.bot={completedMatches:2,meta:{FAL:{kills:10}}};next.patchState.participantAnalytics.samples['ai:new']={tdm:{human:{completedMatches:0,meta:{FAL:{name:'FAL',shots:0}},skillStrata:{},participants:{}}}};assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);
  for(const mutate of [p=>p.perBot['@human:YOU'].FAL.killDistance++,p=>p.skillStrata.human.FAL.killDistance++,p=>p.aiSamples['ai:old'].perBot['@human:YOU'].FAL.k++,p=>p.participantAnalytics.samples['ai:old'].tdm.human.meta.FAL.soloKills++,p=>p.participantAnalytics.samples['ai:old'].deathmatch.human.completedMatches++]){next=clone(old);mutate(next.patchState);assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),/Human weapon telemetry/);}
  next=clone(old);next.patchArchives=[clone(old.patchState)];next.patchState={id:'patch:new',perBot:{},participantAnalytics:{samples:{'ai:new':{tdm:{human:{completedMatches:0,meta:{FAL:{name:'FAL',kills:0}},skillStrata:{},participants:{}}}}}}};assert.equal(Rewards.protectWorld(db,'user:1',next,old),next);next.patchArchives[0].perBot['@human:YOU'].FAL.killDistance++;assert.throws(()=>Rewards.protectWorld(db,'user:1',next,old),/Human weapon telemetry/);
 }finally{db.close();}
});
test('Strict public-cloud initial imports reject client competitive history and preserve trusted existing server accounts',()=>{
 const db=fixture(),oldFlag=process.env.SAR_REQUIRE_TRUSTED_HISTORY;try{
  process.env.SAR_REQUIRE_TRUSTED_HISTORY='1';db.prepare('DELETE FROM worlds WHERE user_id=?').run('user:10');const pristine={progression:XP.normalize(null),ranked:XP.normalizeRanked(null),rankedResults:{},playerCareer:{name:'YOU',games:0,kills:0,weapons:{}},modeStats:{deathmatch:{player:{games:0,kills:0,weapons:{}}}},bots:{Bot:{career:{kills:99},mmr:1000}},playerSeasons:{current:{number:9,stats:{games:0}}},config:{skin:4}};
  assert.equal(Rewards.protectWorld(db,'user:10',pristine,null),pristine);for(const mutate of [w=>w.progression.totalXPUnits=100,w=>w.progression.currentLevel=2,w=>w.playerCareer.kills=1,w=>w.modeStats.deathmatch.player.shots=1,w=>w.playerCareer.weapons.FAL={shots:1},w=>w.playerSeasons.current.stats.games=1,w=>w.ranked.participants['user:10']={ratingUnits:100000,awards:{}},w=>w.rankedResults['match:fake']={rows:[]}]){const imported=clone(pristine);mutate(imported);const before=clone(imported);assert.throws(()=>Rewards.protectWorld(db,'user:10',imported,null),e=>e.code==='TRUSTED_HISTORY_REQUIRED');assert.deepEqual(imported,before);}
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_progression_baselines WHERE user_id=?').get('user:10').n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM worlds WHERE user_id=?').get('user:10').n,0);
  const trusted=world('user:1');assert.equal(Rewards.protectWorld(db,'user:1',clone(trusted),trusted).progression.totalXPUnits,trusted.progression.totalXPUnits);assert.equal(Rewards.projection(db,'user:1').progression.totalXPUnits,trusted.progression.totalXPUnits);
 }finally{if(oldFlag===undefined)delete process.env.SAR_REQUIRE_TRUSTED_HISTORY;else process.env.SAR_REQUIRE_TRUSTED_HISTORY=oldFlag;db.close();}
});
test('Historical offline baseline stays immutable, and out-of-order completion callbacks do not duplicate first-use XP',()=>{
 const db=fixture();try{
  const newer=result('match:mp:later','tdm','standard',2,3000),older=result('match:mp:earlier','tdm','standard',2,2000);persist(db,newer);persist(db,older);Rewards.applyResult(db,newer,{id:newer.matchId});const baseline=db.prepare('SELECT * FROM mp_progression_baselines WHERE user_id=?').get('user:1');Rewards.applyResult(db,older,{id:older.matchId});
  const p=Rewards.projection(db,'user:1');assert.equal(p.records.filter(r=>r.xp?.firstWeapons.includes('FAL')).length,1);assert.deepEqual(p.progression.awards[newer.matchId],p.records[0].xp);assert.deepEqual(p.progression.awards[older.matchId],p.records[1].xp);assert.deepEqual(db.prepare('SELECT * FROM mp_progression_baselines WHERE user_id=?').get('user:1'),baseline);
 }finally{db.close();}
});
test('Friends profile levels and ranked emblems read authoritative network progression after completion',()=>{
 const db=fixture();try{
  const Social=require('../social.cjs'),r=result('match:mp:profile','tdm','ranked');persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});const summary=Rewards.projection(db,'user:2').summary,profile=Social.publicProfile(db,'user:2','user:1',3000);assert.equal(profile.level,summary.xp.currentLevel);assert.equal(profile.rank.ratingUnits,summary.ranked.ratingUnits);assert.equal(profile.rank.rankName,summary.ranked.rankName);assert.equal(JSON.stringify(profile).includes('not-exposed'),false);
 }finally{db.close();}
});
test('A new account without a world stays pending and cannot establish a destructive empty baseline',()=>{
 const db=fixture();try{
  db.prepare('DELETE FROM worlds WHERE user_id=?').run('user:10');const p=Rewards.projection(db,'user:10');assert.equal(p.pending,true);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_progression_baselines WHERE user_id=?').get('user:10').n,0);assert.throws(()=>Rewards.ensureBaseline(db,'user:10'),e=>e.code==='WORLD_NOT_READY');
  const restored=world('user:10');db.prepare('INSERT INTO worlds(user_id,save_json,revision) VALUES(?,?,1)').run('user:10',JSON.stringify(restored));const next=Rewards.projection(db,'user:10');assert.equal(next.pending,undefined);assert.equal(next.progression.totalXPUnits,restored.progression.totalXPUnits);assert.deepEqual(next.ranked,restored.ranked);
 }finally{db.close();}
});
test('Official tournament XP uses the existing 1.3 formula while normal meta and completion credits stay separate',()=>{
 const db=fixture();try{
  const r=result('series:official:game1','tdm','tournament');r.tournament={tournamentId:'official:event',seriesId:'series:official',tournamentKind:'official'};r.rows[1].meta={FAL:{name:'FAL',kills:2,damage:56,shots:3,hits:2,equippedTime:30}};persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});const p=Rewards.projection(db,'user:2'),receipt=p.records[0].xp;
  assert.equal(receipt.kind,'official');assert.equal(receipt.tournamentId,'official:event');assert.equal(receipt.seriesId,'series:official');assert.equal(receipt.units,XP.totals(receipt).units);assert.equal(receipt.units,Number((BigInt(receipt.baseUnits)*13n+5n)/10n));assert.equal(p.weaponTotals.FAL,undefined);assert.equal(p.tournamentWeaponTotals.FAL.kills,2);assert.deepEqual(p.balanceMeta,{});
 }finally{db.close();}
});
test('Weapon meta retains exact raw measurements and separates mode, balance, AI, rules and units',()=>{
 const db=fixture();try{
  const Units=require('../../distance-units.js'),provenance=Units.worldProvenance(Units.mapCalibration('brightfield-blocks'));
  const events=[result('match:mp:meta-tdm','tdm','standard',2,2000),result('match:mp:meta-dm','deathmatch','standard',2,3000),result('match:mp:meta-ai','tdm','standard',2,4000),result('match:mp:meta-patch','tdm','standard',2,5000)];
  for(let i=0;i<events.length;i++){const r=events[i];r.balance={id:'patch:9',version:'9.0',fingerprint:i===3?'balance:new':'balance:original'};r.aiRevision=i===2?'ai:next':'ai:current';r.rulesetRevision='rules:current';r.distanceProvenance=clone(provenance);r.rows[1].meta={FAL:{name:'FAL',kills:2,shots:3,hits:2,damage:56,equippedTime:30,killDistance:420,killDistanceN:2,engagementDistance:560,engagementDistanceN:2,soloKills:1,finisherKills:0,classifiedKills:1}};persist(db,r);Rewards.applyResult(db,r,{id:r.matchId});}
  const p=Rewards.projection(db,'user:2'),patch=p.balanceMeta['balance:original'];assert.equal(p.weaponTotals.FAL.kills,8);assert.equal(patch.byMode.deathmatch.completedMatches,1);assert.equal(patch.byMode.deathmatch.meta.FAL.killDistance,420);assert.equal(Object.keys(patch.byMode.tdm.cohorts).length,2);assert.equal(patch.byMode.tdm.completedMatches,1);assert.equal(patch.byMode.tdm.meta.FAL.kills,2);assert.equal(patch.byMode.tdm.aiRevision,'ai:next');assert.deepEqual(patch.byMode.tdm.distanceProvenance,provenance);assert.equal(p.balanceMeta['balance:new'].byMode.tdm.completedMatches,1);assert.equal(Units.averageDistanceMeters(patch.byMode.tdm.meta.FAL.killDistance,2,patch.byMode.tdm.distanceProvenance),Units.worldDistanceToMeters(210,provenance.mapCalibration));
 }finally{db.close();}
});
