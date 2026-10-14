'use strict';
const assert=require('node:assert/strict'),{engine}=require('./simulate.cjs'),Mastery=require('../weapon-mastery.js');
const e=engine(),actors=e.dev.inspect().state.actors.slice(0,10),match=e.dev.startMatch(0,actors,false,{mode:'tdm',sessionType:'standard',shuffle:false});
const killer=actors[0],victim=actors[5],other=actors[6],now=()=>e.dev.now();
assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');
assert.equal(match.masteryRevision,Mastery.CONFIG.revision);
function hit(target,weapon,head=false,damage=999){
 e.dev.respawnActor(target,true);target.hp=7;
 e.dev.applyDamage(target,{owner:killer,weapon,travel:100,shot:{id:'mastery-telemetry'},feedbackId:'mastery-telemetry'},damage,head,now());
}
const careerKills=killer.career.kills,careerDamage=killer.career.damage;
hit(victim,'FAL',true);hit(victim,'FAL');hit(victim,'AK47');hit(victim,'FAL');
assert.equal(killer.matchWeaponStats.FAL.damage,21,'Resolved removed HP, never theoretical overkill');
assert.equal(killer.matchWeaponStats.FAL.k,3);assert.equal(killer.matchWeaponStats.FAL.headshots,1);
assert.equal(killer.matchWeaponStats.FAL.masteryBestStreak,3);assert.equal(killer.matchWeaponStats.AK47.masteryBestStreak,1);
assert.equal(killer.career.kills-careerKills,4);assert.equal(killer.career.damage-careerDamage,28);
e.dev.killActor(killer,other,'AR-15',false,100,now());assert.deepEqual(killer.masteryLifeKills,{});
e.dev.respawnActor(killer,true);hit(victim,'FAL');assert.equal(killer.masteryLifeKills.FAL,1);assert.equal(killer.matchWeaponStats.FAL.masteryBestStreak,3,'Earlier best survives death without stitching lives');
e.dev.endMatch(match,killer.team,'time');assert.equal(match.rewardResult.masteryRevision,Mastery.CONFIG.revision);assert.equal(match.result.masteryRevision,Mastery.CONFIG.revision);
const xp=e.dev.inspect().SAVE.progression.totalXPUnits;assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');
e.dev.endMatch(match,1-killer.team,'time');assert.equal(e.dev.inspect().SAVE.progression.totalXPUnits,xp);
console.log('PASS authoritative actual-HP telemetry, independent per-weapon life streak/death reset, unchanged career counters/balance and one finalized mastery revision');
