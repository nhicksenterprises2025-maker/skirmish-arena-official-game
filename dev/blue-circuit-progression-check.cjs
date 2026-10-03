'use strict';
const assert=require('node:assert/strict'),XP=require('../progression.js');
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const input=(extra={})=>({participantId:'human:fixture',matchId:'fixture:1',kind:'ranked',sessionType:'ranked',mode:'tdm',eligible:true,practice:false,at:1000,stats:{kills:0,deaths:0,assists:0,headshots:0,damage:0,timeAlive:0},events:XP.events(),leaders:{kills:false,assists:false,alive:false},won:true,winStreak:0,...extra});
const line=(r,key,track='xp')=>(track==='xp'?XP.breakdown(r):XP.rankedBreakdown(r)).find(row=>row.key===key)?.units||0;
const current=(extra={})=>({...input(),firstWeapons:[],rulesVersion:XP.XP_RULES_VERSION,...extra});

assert.equal(XP.ranks.length,26);
for(let i=0;i<XP.ranks.length;i++){
 const r=XP.ranks[i];assert.equal(XP.rankView(r.thresholdUnits).rankName,r.name);assert.equal(XP.rankView(r.thresholdUnits+1).rankName,r.name);
 if(i)assert.equal(XP.rankView(r.thresholdUnits-1).rankName,XP.ranks[i-1].name);
 assert.ok(!/^I+$/.test(r.name));
}
assert.equal(XP.rankView(0).rankName,'Beginner I');assert.equal(XP.rankView(100000000).rankName,'Ascendant');assert.equal(XP.rankView(1000000).nextRank,null);assert.throws(()=>XP.rankView(-1));
pass('All 26 rank thresholds immediately below/at/above; zero start; Ascendant is final rank');

let levelTotal=0;
for(let level=1;level<50;level++){assert.equal(XP.view(levelTotal).currentLevel,level);levelTotal+=XP.requirements[level-1]*100;assert.equal(XP.view(levelTotal-1).currentLevel,level);assert.equal(XP.view(levelTotal).currentLevel,level+1);}
assert.equal(XP.view(50000).currentLevel,5);assert.equal(XP.view(50000).currentXP,15);assert.equal(XP.requirements[49],25000);assert.equal(XP.view(levelTotal+90000000).currentLevel,50);assert.equal(XP.view(levelTotal+90000000).currentXP,900000);
pass('Separate account levels retain every boundary, multiple-level carry, cap50 and lifetime overflow');

for(const [family,field,tiers]of [
 ['kills','kills',[[9,0],[10,20],[14,20],[15,30],[19,30],[20,50],[30,50]]],
 ['damage','damage',[[1999,0],[2000,15],[2999,15],[3000,35],[3999,35],[4000,70],[4999,70],[5000,100],[10000,100]]],
 ['headshots','headshots',[[9,0],[10,10],[20,10]]]
])for(const [value,reward]of tiers){const r=current({stats:{...input().stats,[field]:value}});assert.equal(line(r,family),reward*100);assert.equal(line(r,family,'ranked'),reward*50);}
for(const [value,reward]of [[4,0],[5,15],[9,15],[10,50],[20,50]]){const r=current({stats:{...input().stats,kills:value,assists:value}});assert.equal(line(r,'combo'),reward*100);assert.equal(line(r,'combo','ranked'),reward*50);}
for(const [value,reward]of [[14,0],[15,25],[19,25],[20,60]]){const r=current({stats:{...input().stats,kills:value,deaths:10}});assert.equal(line(r,'kd'),reward*100);assert.equal(line(r,'kd','ranked'),reward*50);}
for(const [value,reward]of [[2,0],[3,10],[4,10],[5,15],[9,15],[10,25],[15,25]]){const r=current({events:{...XP.events(),bestStreak:value}});assert.equal(line(r,'killStreak'),reward*100);assert.equal(line(r,'killStreak','ranked'),reward*50);}
assert.equal(line(current({stats:{...input().stats,kills:2,deaths:0}}),'kd'),6000);
for(const [key,units]of [['killLeader',2500],['assistLeader',500],['aliveLeader',1000]]){const r=current({leaders:{kills:true,assists:true,alive:true}});assert.equal(line(r,key),units);assert.equal(line(r,key,'ranked'),units/2);}
pass('Authoritative XP/ELO highest-only reward families, new5K tier, zero-death denominator and tied-leader flags');

const events={...XP.events(),soloKills:1,finishingKills:1,dashes:1},stats={...input().stats,kills:2,deaths:1,assists:1};
const exact=current({stats,events,firstWeapons:['9mm']});
for(const [key,xp,elo]of [['solo',300,150],['finisher',100,50],['assist',50,25],['dash',20,10],['death',50,-25],['result',500,250],['weapon:9mm',2500,0]]){assert.equal(line(exact,key),xp);assert.equal(line(exact,key,'ranked'),elo);}
assert.equal(line(current({won:false}),'result'),250);assert.equal(line(current({won:false}),'result','ranked'),0);
const official=current({kind:'official',sessionType:'tournament',stats:{...input().stats,deaths:1},events:{...XP.events(),dashes:1},firstWeapons:['9mm'],won:null});
assert.deepEqual(XP.totals(official),{baseUnits:2570,units:3341});assert.equal(XP.totals({...official,stats:input().stats,firstWeapons:[]}).units,26);
pass('Exact .25/.1 ELO, .5/.2 XP, death deduction, first-use exclusion and one final official ×1.30 conversion');

const legacy=XP.normalize(null,{playerCareer:{weapons:{'AR-15':{shots:1},'9mm':{shots:0}}}});
const oldReceipt={...input({kind:'standard',sessionType:'standard',won:false,stats:{...input().stats,damage:5000}}),firstWeapons:[],beforeUnits:0};delete oldReceipt.matchId;delete oldReceipt.participantId;delete oldReceipt.sessionType;delete oldReceipt.eligible;delete oldReceipt.practice;
Object.assign(oldReceipt,XP.totals(oldReceipt));legacy.awards['legacy:match']=oldReceipt;legacy.totalXPUnits=oldReceipt.units;legacy.currentLevel=XP.view(oldReceipt.units).currentLevel;
XP.validate(legacy);assert.equal(line(oldReceipt,'damage'),7000);const untouched=JSON.stringify(legacy),migrated=XP.normalize(legacy);assert.equal(JSON.stringify(migrated),untouched);
assert.equal(XP.award(migrated,input({matchId:'legacy:match'})).applied,false);assert.equal(JSON.stringify(migrated),untouched);
const newAward=XP.award(migrated,input({matchId:'new:match',stats:{...input().stats,damage:5000},events:{...XP.events(),usedWeapons:['AR-15','9mm']}})).receipt;
assert.equal(line(newAward,'damage'),10000);assert.deepEqual(newAward.firstWeapons,['9mm']);assert.equal(newAward.rulesVersion,2);assert.equal(newAward.transactionKey,JSON.stringify(['human:fixture','new:match','xp']));XP.validate(migrated,legacy);
const next=XP.award(migrated,input({matchId:'next:match',events:{...XP.events(),usedWeapons:['9mm']}})).receipt;assert.deepEqual(next.firstWeapons,[]);XP.validate(migrated);
assert.equal(JSON.stringify(migrated.awards['legacy:match']),JSON.stringify(oldReceipt));assert.equal(JSON.stringify(XP.normalize(migrated)),JSON.stringify(migrated));
pass('Legacy balances/4K receipts preserved, stable transaction identity, no reaward across rules versions, permanent first-use tracking');

for(const session of [{sessionType:'standard',mode:'tdm'},{sessionType:'standard',mode:'deathmatch'},{sessionType:'ranked',mode:'tdm',eligible:true},{sessionType:'tournament',mode:'tdm',eligible:false,context:{tournamentKind:'official',tournamentId:'official:1'}}])assert.ok(XP.eligibility(session));
for(const session of [{sessionType:'custom',mode:'tdm'},{sessionType:'standard',mode:'tdm',practice:true},{sessionType:'ranked',mode:'tdm',eligible:false},{sessionType:'ranked',mode:'deathmatch',eligible:true},{sessionType:'tournament',mode:'tdm',context:{tournamentKind:'custom',tournamentId:'custom:1'}}])assert.equal(XP.eligibility(session),null);
const excludedXP=XP.normalize(null),excludedRank=XP.normalizeRanked();
for(const change of [{kind:'custom',sessionType:'custom'},{sessionType:'custom'},{practice:true},{eligible:false}]){assert.equal(XP.award(excludedXP,input(change)),null);assert.equal(XP.awardRanked(excludedRank,input(change)),null);}
assert.equal(excludedXP.totalXPUnits,0);assert.deepEqual(excludedXP.usedWeapons,[]);assert.deepEqual(excludedRank.participants,{});
assert.throws(()=>XP.awardRanked(excludedRank,input({won:null})),/win or loss/);
pass('Canonical eligibility and custom/practice exclusions; unresolved ranked draws are not silently awarded');

const losses=[];
for(const [dashes,deaths,expected]of [[0,0,-3100],[0,50,-3100],[500,0,-2500],[1000,0,-1900],[5000,0,-1900],[500,20,-2560]]){
 const r=input({won:false,stats:{...input().stats,deaths},events:{...XP.events(),dashes}}),totals=XP.rankedTotals(r);assert.equal(totals.calculatedUnits,expected);losses.push(totals.calculatedUnits);
 assert.ok(totals.calculatedUnits>=-3100&&totals.calculatedUnits<=-1900);
}
assert.equal(XP.rankedTotals(input({won:false,events:{...XP.events(),dashes:1}})).calculatedUnits,-3099);
const floor=XP.normalizeRanked(),floorReceipt=XP.awardRanked(floor,input({won:false})).receipt;assert.equal(floorReceipt.calculatedUnits,-3100);assert.equal(floorReceipt.appliedUnits,0);assert.equal(floorReceipt.afterUnits,0);XP.validateRanked(floor);
pass('Deterministic loss-band endpoints/midpoint/rounding; deaths included once; zero floor reports actual delta');

const ranked=XP.normalizeRanked(),rankedOld=clone(ranked),ratings=[];
for(let n=1;n<=6;n++){
 const result=XP.awardRanked(ranked,input({matchId:'ranked:'+n,events:{...XP.events(),dashes:100},winStreak:99}));ratings.push(result.receipt);
 assert.equal(result.receipt.winStreak,n);assert.equal(line(result.receipt,'winStreak','ranked'),n===3?500:n===5?1250:0);
 const before=clone(ranked);assert.equal(XP.awardRanked(ranked,input({matchId:'ranked:'+n,won:false})).applied,false);assert.deepEqual(ranked,before);
 // A casual result cannot advance or break this independent streak.
 assert.equal(XP.awardRanked(ranked,input({matchId:'casual:'+n,kind:'standard',sessionType:'standard',won:false})),null);
 assert.equal(ranked.participants['human:fixture'].winStreak,n);
}
XP.validateRanked(ranked,rankedOld);
assert.equal(XP.rankView(ranked.participants['human:fixture'].ratingUnits).rankName,'Beginner I');
const promoted=XP.awardRanked(ranked,input({matchId:'promotion',events:{...XP.events(),dashes:100}})).receipt;assert.equal(XP.rankView(promoted.afterUnits).rankName,'Beginner II');
const demoted=XP.awardRanked(ranked,input({matchId:'demotion',won:false})).receipt;assert.equal(XP.rankView(demoted.afterUnits).rankName,'Beginner I');assert.equal(demoted.winStreak,0);
const restarted=XP.normalizeRanked(JSON.parse(JSON.stringify(ranked)));assert.deepEqual(restarted,ranked);assert.equal(XP.awardRanked(restarted,input({matchId:'promotion'})).applied,false);
const bot=XP.awardRanked(restarted,input({matchId:'ranked:1',participantId:'bot:fixture',events:{...XP.events(),dashes:100}})).receipt;assert.equal(bot.afterUnits,ratings[0].afterUnits);assert.equal(bot.calculatedUnits,ratings[0].calculatedUnits);assert.equal(bot.beforeUnits,0);XP.validateRanked(restarted,ranked);
pass('Independent ranked streaks exactly at3/5; promotions/demotions; per-participant replay safety; bot rules parity and restart');

const forged=clone(restarted);forged.participants['human:fixture'].awards['ranked:1'].calculatedUnits++;assert.throws(()=>XP.validateRanked(forged,restarted),/changed/);
const removed=clone(restarted);delete removed.participants['bot:fixture'];assert.throws(()=>XP.validateRanked(removed,restarted),/removed/);
const rebalance=clone(restarted);rebalance.participants['human:fixture'].ratingUnits++;assert.throws(()=>XP.validateRanked(rebalance),/reconcile/);
const summary=XP.summary(migrated,restarted,'human:fixture'),display=XP.rewardBreakdown(newAward,demoted);assert.equal(summary.xp.totalXP,migrated.totalXPUnits/100);assert.equal(summary.ranked.rating,restarted.participants['human:fixture'].ratingUnits/100);assert.equal(summary.ranked.rankName,XP.rankView(summary.ranked.ratingUnits).rankName);assert.equal(display.ranked.appliedUnits,demoted.appliedUnits);assert.equal(display.ranked.calculatedUnits,demoted.calculatedUnits);assert.equal(display.xp.lines.find(l=>l.key==='damage').units,10000);
pass('Append-only reconciliation and canonical progression/rank/reward summaries for later UI runs');
console.log(JSON.stringify({ok:true,groups:checks.length}));
