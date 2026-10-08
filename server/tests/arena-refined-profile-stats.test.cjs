'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Stats=require('../../profile-stats.js'),XP=require('../../progression.js');
const {validateProgression}=require('../progression.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),account='human:profile';
const stats=(extra={})=>({kills:0,deaths:0,assists:0,damage:0,headshots:0,timeAlive:0,shots:0,hits:0,...extra});
function receipt(extra={}){return {participantId:account,matchId:'match:fixture',kind:'standard',sessionType:'standard',mode:'tdm',eligible:true,practice:false,at:1100,stats:stats(),events:XP.events(),leaders:{kills:false,assists:false,alive:false},won:false,winStreak:0,...extra};}
function fixture(){
 const world={progression:XP.normalize(null),ranked:XP.normalizeRanked(),rankedResults:{},playerCareer:{games:2},modeStats:{deathmatch:{player:{games:1},recentMatches:[]}},bots:{},playerSeasons:{current:{number:2,startAt:2000,endAt:3000,stats:{games:1}},history:[{number:1,startAt:1000,endAt:2000,stats:{games:1}}]}};
 const casual=receipt({matchId:'match:casual',stats:stats({kills:3,deaths:10,assists:2,damage:450,headshots:1,shots:10,hits:1}),won:false});
 const dm=receipt({matchId:'match:dm',mode:'deathmatch',at:2100,stats:stats({kills:15,deaths:1,assists:3,damage:1800,headshots:5,shots:90,hits:81}),won:true,winStreak:1});
 const ranked=receipt({matchId:'match:ranked',kind:'ranked',sessionType:'ranked',at:2200,stats:stats({kills:2,deaths:3,assists:4,damage:300,headshots:1,shots:20,hits:8}),won:false});
 for(const row of [casual,dm,ranked])XP.award(world.progression,row);
 XP.awardRanked(world.ranked,ranked);
 world.rankedResults[ranked.matchId]={matchId:ranked.matchId,mode:'tdm',sessionType:'ranked',eligible:true,practice:false,at:ranked.at,rows:[{participantId:account,won:false,stats:clone(ranked.stats)}]};
 XP.award(world.progression,receipt({matchId:'series:game1',kind:'official',sessionType:'tournament',at:2300,stats:stats({kills:90,deaths:2,damage:9000,shots:100,hits:100}),won:true,tournamentId:'tournament:fixture',seriesId:'series:fixture'}));
 world.playerCareer.recentMatches=[{...casual.stats,matchId:casual.matchId,mode:'tdm',sessionType:'standard',eligible:true,at:casual.at,won:false},{...ranked.stats,matchId:ranked.matchId,mode:'tdm',sessionType:'ranked',eligible:true,at:ranked.at,won:false},{...stats({kills:500}),matchId:'match:custom',mode:'tdm',sessionType:'custom',eligible:false,at:2201,won:true},{...stats({kills:700}),matchId:'match:practice',mode:'tdm',sessionType:'standard',eligible:true,practice:true,at:2202,won:true}];
 world.modeStats.deathmatch.recentMatches=[{matchId:dm.matchId,mode:'deathmatch',sessionType:'standard',eligible:true,practice:false,endedAtWall:dm.at,endedAt:50,winnerIds:[7],rows:[{id:7,participantId:account,...dm.stats}]}];
 return world;
}
const project=(world,extra={})=>Stats.project(world,{participantId:account,accountId:account,...extra});
test('Unique participation combines casual TDM/DM and Ranked TDM, excludes official/custom/practice, derives weighted ratios',()=>{
 const world=fixture(),before=JSON.stringify(world),p=project(world);
 assert.equal(p.totals.games,3);assert.deepEqual(p.records.map(r=>r.matchId),['match:casual','match:dm','match:ranked']);
 assert.deepEqual(p.totals,{games:3,wins:1,losses:2,draws:0,kills:20,deaths:14,assists:9,damage:2550,headshots:7,shots:120,hits:90});
 assert.equal(p.ratios.kd,20/14);assert.equal(p.ratios.accuracy,90/120);assert.equal(p.ratios.winRate,1/3);
 assert.notEqual(p.ratios.accuracy,(.1+.9+.4)/3);assert.equal(p.coverage.complete,true);assert.equal(p.coverage.missingGames,0);
 assert.deepEqual(p.included.map(r=>r.label),['Casual TDM','Casual Deathmatch','Ranked TDM']);
 assert.equal(JSON.stringify(world),before);assert.deepEqual(project(clone(world)),p);
});
test('Ranked includes only ranked-eligible records; current rank/rating receipts and formulas remain separate',()=>{
 const world=fixture(),before=clone(world.ranked),p=project(world,{kind:'ranked'});
 assert.equal(p.totals.games,1);assert.equal(p.totals.kills,2);assert.equal(p.ratios.accuracy,.4);assert.deepEqual(p.policy.included,['Ranked TDM']);
 assert.deepEqual(world.ranked,before);XP.validate(world.progression);XP.validateRanked(world.ranked);
});
test('Saved season boundaries filter completion timestamps, never simulation time or current rank',()=>{
 const world=fixture(),old=project(world,{scope:'season',seasonNumber:1}),current=project(world,{scope:'season'});
 assert.equal(old.totals.games,1);assert.equal(old.totals.kills,3);assert.equal(current.totals.games,2);assert.equal(current.totals.kills,17);assert.equal(current.season.number,2);
 world.progression.awards['match:ranked'].at=2000;world.ranked.participants[account].awards['match:ranked'].at=2000;world.rankedResults['match:ranked'].at=2000;
 assert.equal(project(world,{kind:'ranked',scope:'season',seasonNumber:1}).totals.games,0);assert.equal(project(world,{kind:'ranked',scope:'season',seasonNumber:2}).totals.games,1);
 const missing=project(world,{scope:'season',seasonNumber:99});assert.equal(missing.coverage.seasonAvailable,false);assert.equal(missing.totals.games,0);
});
test('Missing older precision is honest, matching saved results supplement without rewriting immutable receipts',()=>{
 const world=fixture();delete world.progression.awards['match:casual'].stats.shots;delete world.progression.awards['match:casual'].stats.hits;
 // Retained rows can supply the exact same resolved participation measurements.
 let p=project(world);assert.equal(p.ratios.accuracy,.75);
 delete world.playerCareer.recentMatches[0].shots;delete world.playerCareer.recentMatches[0].hits;
 p=project(world);assert.equal(p.ratios.accuracy,null);assert.equal(p.totals.shots,null);assert.equal(p.totals.hits,null);assert.equal(p.coverage.accuracyGames,2);assert.equal(p.coverage.missingMeasurements.shots,1);
 world.playerCareer.games=40;world.playerCareer.recentMatches.push({kills:99,deaths:0,damage:990,won:true,at:1400,mode:'tdm',sessionType:'standard',eligible:true});
 p=project(world);assert.equal(p.totals.games,3);assert.equal(p.coverage.missingGames,38);assert.equal(p.coverage.missingIdentity,1);assert.equal(p.coverage.complete,false);
 XP.validate(world.progression);assert.equal(world.progression.awards['match:casual'].stats.shots,undefined);
});
test('Absent outcomes and zero denominators remain distinct from recorded wins or measured accuracy',()=>{
 const world=fixture();world.progression.awards={draw:{...world.progression.awards['match:casual'],stats:stats(),won:null}};world.playerCareer={games:1,recentMatches:[]};world.ranked={participants:{}};world.rankedResults={};world.modeStats={deathmatch:{player:{games:0},recentMatches:[]}};
 let p=project(world);assert.equal(p.totals.draws,1);assert.equal(p.ratios.kd,0);assert.equal(p.ratios.accuracy,null);assert.equal(p.ratios.winRate,0);
 world.progression.awards.draw.stats.kills=5;p=project(world);assert.equal(p.zeroDeaths,true);assert.equal(p.ratios.kd,null);
 world.progression.awards.draw.won=undefined;p=project(world);assert.equal(p.coverage.unknownOutcomes,1);assert.equal(p.ratios.winRate,null);
});
test('Conflicting duplicate facts are withheld; account identities cannot borrow foreign receipts/recent rows',()=>{
 const world=fixture();world.playerCareer.recentMatches[0].kills=100;
 const p=project(world);assert.equal(p.coverage.conflictingRecords,1);assert.equal(p.totals.games,2);assert.equal(p.coverage.complete,false);
 const foreign=Stats.project(world,{participantId:'human:other',accountId:account});assert.equal(foreign.coverage.authorized,false);assert.equal(foreign.totals.games,0);assert.equal(foreign.totals.kills,0);
});
test('Bots use their own ranked and resolved DM rows; legacy simulation clocks cannot masquerade as season dates',()=>{
 const world=fixture(),bot='bot:fixture';world.bots.Ace={profile:{id:bot},career:{games:1},recentMatches:[]};world.seasons=clone(world.playerSeasons);world.modeStats.deathmatch.bots={Ace:{games:1}};
 XP.awardRanked(world.ranked,receipt({participantId:bot,kind:'ranked',sessionType:'ranked',matchId:'match:botrank',at:2100,stats:stats({kills:1,deaths:2}),won:false}));
 world.modeStats.deathmatch.recentMatches.push({matchId:'match:botdm',mode:'deathmatch',sessionType:'standard',eligible:true,endedAt:2200,winnerIds:[1],rows:[{id:1,sourceBotId:bot,...stats({kills:8})}]});
 const all=Stats.project(world,{participantId:bot}),season=Stats.project(world,{participantId:bot,scope:'season'});
 assert.equal(all.totals.games,2);assert.equal(all.totals.kills,9);assert.equal(season.totals.games,1);assert.equal(season.coverage.unknownSeason,1);
});
test('Optional resolved accuracy validation accepts old immutable receipts and rejects forged counters',()=>{
 const p=XP.normalize(null),ranked=XP.normalizeRanked(),oldStats=stats();delete oldStats.shots;delete oldStats.hits;
 XP.award(p,receipt({stats:oldStats}));XP.validate(p);XP.awardRanked(ranked,receipt({kind:'ranked',sessionType:'ranked',stats:oldStats}));XP.validateRanked(ranked);
 for(const bad of [{shots:0,hits:1},{shots:1.5,hits:1},{shots:2,hits:-1},{shots:2}]){
  const next=XP.normalize(null);XP.award(next,receipt({stats:{...oldStats,...bad}}));assert.throws(()=>XP.validate(next),/accuracy/);
  assert.throws(()=>XP.awardRanked(XP.normalizeRanked(),receipt({kind:'ranked',sessionType:'ranked',stats:{...oldStats,...bad}})),/accuracy/);
 }
 assert.equal(XP.totals(p.awards['match:fixture']).units,XP.totals({...p.awards['match:fixture'],stats:stats()}).units);
});
test('New ordinary receipt precision is corroborated against its retained match and lifetime mode measurements',()=>{
 const world={progression:XP.normalize(null),patchState:{weaponStats:{'AR-15':{}}},playerCareer:{games:1,shots:20,hits:5,recentMatches:[]},modeStats:{deathmatch:{player:{games:0,shots:0,hits:0}}}},input=receipt({stats:stats({shots:20,hits:5})});
 XP.award(world.progression,input);world.playerCareer.recentMatches=[{...input.stats,mode:'tdm',sessionType:'standard',matchId:input.matchId,won:false}];
 assert.doesNotThrow(()=>validateProgression(world));
 world.playerCareer.recentMatches[0].hits=4;assert.throws(()=>validateProgression(world),/accuracy differs/);
 world.playerCareer.recentMatches=[];world.playerCareer.hits=4;assert.throws(()=>validateProgression(world),/accuracy exceeds/);
 const old=clone(world);delete old.progression.awards[input.matchId].stats.shots;delete old.progression.awards[input.matchId].stats.hits;assert.doesNotThrow(()=>validateProgression(old));
});
