'use strict';
// Isolated real-engine worlds and SQLite only; never reads the installed account.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {engine}=require('./simulate.cjs'),XP=require('../progression.js');
const {createDatabase}=require('../server/db.cjs'),{writeWorld,readWorld,validateWorld}=require('../server/world.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),userId='blue-persistence-fixture',checks=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
function game(world){const e=engine(world?{'sar-persistent-save':JSON.stringify(world)}:{});e.context.SARCloud.state={account:{id:userId,username:'BluePersistenceFixture'}};return e;}
function active(e,ranked=false){if(ranked)e.context.SAR.startRanked();else e.dev.queueForMatch();const m=e.dev.inspect().state.matches.find(m=>m?.hasPlayer);assert.ok(m);m.status='active';m.countdownUntil=0;for(const a of m.participants){a.dead=false;a.spawnFlash=0;}return {m,p:m.participants.find(a=>a.isPlayer)};}
function final(e,m,winner){e.dev.endMatch(m,winner,'time');e.ui.flush();return e.context.SAR.getUniverse();}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-blue-persistence-')),dbPath=path.join(dir,'fixture.sqlite');let db=createDatabase(dbPath);
try{
 const now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(userId,'BluePersistenceFixture','bluepersistencefixture','isolated-test-only',now,now);
 const oldGame=game(),oldMatch=active(oldGame),legacy=final(oldGame,oldMatch.m,oldMatch.p.team);
 // Emulate the published receipt shape without changing any earned balance.
 delete legacy.ranked;delete legacy.rankedResults;
 for(const receipt of Object.values(legacy.progression.awards))for(const key of ['rulesVersion','track','participantId','transactionKey','sessionType','eligible','practice'])delete receipt[key];
 XP.validate(legacy.progression);writeWorld(db,userId,legacy,0);
 const migratedGame=game(legacy),migrated=migratedGame.context.SAR.getUniverse(),normalized=migratedGame.dev.normalizeSave(clone(legacy));
 assert.deepEqual(migrated.progression,legacy.progression);assert.deepEqual(normalized.playerCareer,legacy.playerCareer);assert.deepEqual(normalized.bots,legacy.bots);assert.deepEqual(normalized.seasons,legacy.seasons);assert.equal(Object.keys(migrated.ranked.participants).length,0);assert.equal(Object.keys(migrated.rankedResults).length,0);
 writeWorld(db,userId,migrated,1);writeWorld(db,userId,migrated,2);
 const backups=db.prepare("SELECT save_json FROM world_backups WHERE user_id=? AND reason='before ranked progression migration'").all(userId);assert.equal(backups.length,1);assert.deepEqual(JSON.parse(backups[0].save_json),legacy);
 pass('Additive migration retains original XP/careers/seasons and one recoverable original; repeated migration is unchanged');
 const {m,p}=active(migratedGame,true);assert.equal(m.sessionType,'ranked');assert.equal(m.mode,'tdm');assert.equal(m.eligible,true);
 const enemy=m.participants.find(a=>a.team!==p.team);migratedGame.dev.fire(p,0,10000);migratedGame.dev.tryDash(p,1,0,10000);migratedGame.dev.applyDamage(enemy,{owner:p,weapon:p.slots[0].name,travel:1},250,false,10010);
 const checkpoint=migratedGame.context.SAR.getUniverse();writeWorld(db,userId,checkpoint,3);
 migratedGame.dev.respawnActor(enemy);enemy.spawnFlash=0;migratedGame.dev.fire(p,0,12000);migratedGame.dev.applyDamage(enemy,{owner:p,weapon:p.slots[0].name,travel:1},250,false,12010);
 const completed=final(migratedGame,m,p.team),receipt=completed.ranked.participants[userId].awards[m.matchId];
 assert.ok(receipt.appliedUnits>0);assert.equal(receipt.events.dashes,1);assert.equal(Object.keys(completed.ranked.participants).length,10);assert.equal(completed.rankedResults[m.matchId].rows.length,10);assert.equal(completed.progression.awards[m.matchId].participantId,userId);
 validateWorld(completed,{save:checkpoint});writeWorld(db,userId,completed,4);writeWorld(db,userId,completed,5);
 migratedGame.dev.endMatch(m,1-p.team,'time');assert.deepEqual(migratedGame.context.SAR.getUniverse().ranked,completed.ranked);
 db.close();db=createDatabase(dbPath);const restored=readWorld(db,userId),reopened=game(restored.save);
 assert.equal(restored.revision,6);assert.deepEqual(reopened.context.SAR.getUniverse().progression,completed.progression);assert.deepEqual(reopened.context.SAR.getUniverse().ranked,completed.ranked);assert.deepEqual(reopened.context.SAR.getUniverse().rankedResults,completed.rankedResults);
 assert.equal(reopened.context.SAR.getProgression().totalXP,completed.progression.totalXPUnits/100);
 pass('Eligible real-engine Ranked TDM survives a mid-match checkpoint, awards ten participants once, retries safely and survives SQLite/game restart');
 const protectedFields=['progression','ranked','rankedResults','playerCareer','bots','seasons','playerSeasons','patchState'];
 for(const mode of ['tdm','deathmatch']){
  const fixture=game(completed),before=fixture.context.SAR.getUniverse(),custom=fixture.context.SAR.startCustomMatch({mode,bots:[]}),human=custom.participants.find(a=>a.isPlayer);custom.status='active';fixture.dev.fire(human,0,10000);fixture.dev.tryDash(human,1,0,10000);const after=final(fixture,custom,mode==='tdm'?human.team:human.id);
  for(const key of protectedFields)assert.deepEqual(after[key],before[key],mode+' custom changed '+key);
 }
 pass('Custom TDM/Deathmatch do not change XP, ELO, discovery, careers, familiarity, seasons or patch telemetry');
 const tamper=(change,pattern=/ranked|progression|XP|match|transaction|account/i)=>{const next=clone(completed);change(next);assert.throws(()=>writeWorld(db,userId,next,6),pattern);assert.equal(readWorld(db,userId).revision,6);};
 tamper(w=>{w.ranked.participants[userId].awards[m.matchId].rulesVersion=2;});
 tamper(w=>{w.rankedResults[m.matchId].rows[0].team=1-w.rankedResults[m.matchId].rows[0].team;});
 tamper(w=>{delete w.rankedResults[m.matchId];});
 tamper(w=>{delete w.ranked.participants[userId];});
 tamper(w=>{w.progression.awards[m.matchId].rulesVersion=3;});
 const missing=clone(completed);delete missing.rankedResults;assert.throws(()=>validateWorld(missing),/evidence/);
 const orphanXP=clone(completed);delete orphanXP.ranked;delete orphanXP.rankedResults;assert.throws(()=>validateWorld(orphanXP),/evidence/);
 const customEvidence=clone(completed);customEvidence.rankedResults[m.matchId].sessionType='custom';assert.throws(()=>validateWorld(customEvidence),/canonical ranked/);
 const foreign='blue-foreign-account';db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(foreign,'BlueForeign','blueforeign','isolated-test-only',now,now);assert.throws(()=>writeWorld(db,foreign,completed,0),/different account/);
 pass('Policy-version replay, receipt/evidence changes, missing evidence, custom flags and cross-account awards are rejected without revision changes');
 const afterLegacyRetry=clone(completed),legacyId=Object.keys(legacy.progression.awards)[0],oldBalance=afterLegacyRetry.progression.totalXPUnits;
 const ignored=XP.award(afterLegacyRetry.progression,{...clone(legacy.progression.awards[legacyId]),matchId:legacyId,participantId:userId,sessionType:'standard',eligible:true,practice:false,kind:'standard'});
 assert.equal(ignored.applied,false);assert.equal(afterLegacyRetry.progression.totalXPUnits,oldBalance);assert.deepEqual(afterLegacyRetry.progression.awards[legacyId],legacy.progression.awards[legacyId]);
 pass('Old XP receipt retry under the new rules preserves the exact original receipt and balance');
 console.log(JSON.stringify({ok:true,groups:checks.length}));
}finally{db.close();const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});}
