'use strict';
// Isolated test records use the production reward validators. They are never
// installed into a real account and do not fabricate public match history.
const assert=require('node:assert/strict'),XP=require('../progression.js');
const {engine}=require('./simulate.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function profileFixture(participantId='audit9-profile-fixture',source){
 const e=engine({},source),world=e.context.SAR.getUniverse(),now=Date.now();
 world.seasons.history=[{...clone(world.seasons.current),startAt:now-16*86400000,endAt:now-86400000}];
 Object.assign(world.seasons.current,{number:2,startAt:now-86400000,endAt:now+14*86400000});
 world.playerSeasons.current={...world.playerSeasons.current,number:2,startAt:now-86400000,endAt:now+14*86400000};
 world.playerSeasons.history=[{number:1,startAt:now-16*86400000,endAt:now-86400000,stats:clone(world.playerSeasons.current.stats)}];
 const rows=[
  {id:'match:audit9:casual-tdm',kind:'standard',mode:'tdm',sessionType:'standard',at:now-2*86400000,won:true,stats:{kills:10,deaths:5,assists:2,headshots:2,damage:900,shots:100,hits:40,timeAlive:40}},
  {id:'match:audit9:casual-dm',kind:'standard',mode:'deathmatch',sessionType:'standard',at:now-7200000,won:false,stats:{kills:4,deaths:8,assists:1,headshots:1,damage:500,shots:10,hits:9,timeAlive:25}},
  {id:'match:audit9:ranked-tdm',kind:'ranked',mode:'tdm',sessionType:'ranked',at:now-3600000,won:true,stats:{kills:18,deaths:2,assists:7,headshots:4,damage:3800,shots:20,hits:10,timeAlive:100}},
  {id:'audit9:official',kind:'official',mode:'tdm',sessionType:'tournament',tournamentId:'audit9:official-event',seriesId:'audit9:official-series',at:now-1800000,won:true,stats:{kills:50,deaths:1,assists:20,headshots:25,damage:12500,shots:100,hits:90,timeAlive:200}}
 ];
 for(const row of rows){
  const leader=row.kind==='ranked',input={...clone(row),matchId:row.id,participantId,eligible:true,practice:false,events:XP.events(),leaders:{kills:leader,assists:leader,alive:leader},winStreak:0};delete input.id;assert.equal(XP.award(world.progression,input).applied,true);
  if(row.kind==='ranked'){
   assert.equal(XP.awardRanked(world.ranked,input).applied,true);
   const rankedRows=[{participantId,type:'human',team:0,stats:clone(row.stats),events:XP.events(),leaders:clone(input.leaders),won:true}];
   for(const [index,name]of world.activeBotNames.slice(0,9).entries()){
    const bot=world.bots[name],team=index<4?0:1,stats={kills:0,deaths:0,assists:0,headshots:0,damage:0,shots:0,hits:0,timeAlive:0},leaders={kills:false,assists:false,alive:false},won=team===0;
    XP.awardRanked(world.ranked,{...input,participantId:bot.profile.id,stats,leaders,won});
    rankedRows.push({participantId:bot.profile.id,type:'bot',team,stats,events:XP.events(),leaders,won});
    Object.assign(bot.career,{games:1,wins:won?1:0,losses:won?0:1});
   }
   world.rankedResults[row.id]={matchId:row.id,mode:row.mode,sessionType:row.sessionType,eligible:true,practice:false,at:row.at,winnerTeam:0,rows:rankedRows};
  }
 }
 const ordinary=rows.filter(row=>row.kind==='standard'||row.kind==='ranked'),tdm=ordinary.filter(row=>row.mode==='tdm'),dm=ordinary.find(row=>row.mode==='deathmatch');
 Object.assign(world.playerCareer,{games:2,wins:2,losses:0,...Object.fromEntries(['kills','deaths','assists','damage','headshots','shots','hits','timeAlive'].map(key=>[key,tdm.reduce((sum,row)=>sum+row.stats[key],0)]))});
 world.playerCareer.recentMatches=tdm.map(row=>({matchId:row.id,mode:row.mode,sessionType:row.sessionType,eligible:true,practice:false,at:row.at,won:row.won,...clone(row.stats)}));
 world.playerCareer.recentMatches.push({matchId:'match:audit9:custom',mode:'tdm',sessionType:'custom',eligible:false,practice:false,at:now-1000,won:true,kills:99,deaths:0,assists:0,headshots:0,damage:24750,shots:200,hits:190});
 Object.assign(world.modeStats.deathmatch.player,{games:1,wins:0,losses:1,...clone(dm.stats)});
 const deathmatch=world.modeStats.deathmatch,dmRows=[{id:1,participantId,isPlayer:true,...clone(dm.stats)}],enemyStats={kills:8,deaths:4,assists:0,headshots:0,damage:2000,shots:32,hits:24,timeAlive:30};
 deathmatch.player.taken=2000;
 for(const [index,name]of world.activeBotNames.slice(0,9).entries()){
  const stats=index===0?enemyStats:{kills:0,deaths:0,assists:0,headshots:0,damage:0,shots:0,hits:0,timeAlive:0};
  deathmatch.bots[name]??={...clone(world.bots[name].career),name,games:0,wins:0,losses:0,weaponUsage:clone(world.bots[name].career.weaponUsage)};
  Object.assign(deathmatch.bots[name],stats,{games:1,wins:index===0?1:0,losses:index===0?0:1,taken:index===0?500:0});
  dmRows.push({id:index+2,participantId:world.bots[name].profile.id,isPlayer:false,...clone(stats)});
 }
 deathmatch.completedMatches=1;
 for(const [career,key,stats]of [[deathmatch.player,'weapons',dm.stats],[deathmatch.bots[world.activeBotNames[0]],'weaponUsage',enemyStats]]){
  career[key]['AR-15']??={k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
  Object.assign(career[key]['AR-15'],{k:stats.kills,d:stats.deaths,damage:stats.damage,shots:stats.shots,hits:stats.hits,headshots:stats.headshots,equippedTime:stats.timeAlive});
 }
 const legacy=world.patchState.participantAnalytics.legacy.deathmatch['AR-15'];
 for(const [key,value]of Object.entries({kills:12,deaths:12,damage:2500,shots:42,hits:33,headshots:1,equippedTime:55})){deathmatch.meta['AR-15'][key]+=value;legacy[key]+=value;}
 deathmatch.recentMatches=[{matchId:dm.id,mode:'deathmatch',sessionType:'standard',eligible:true,practice:false,endedAtWall:dm.at,winnerIds:[2],rows:dmRows}];
 XP.validate(world.progression);XP.validateRanked(world.ranked);
 return {world,participantId,now,rows,expected:{combined:{games:3,wins:2,losses:1,draws:0,kills:32,deaths:15,assists:10,damage:5200,taken:null,headshots:7,shots:130,hits:59,timeAlive:165,timePlayed:null},ranked:{games:1,wins:1,losses:0,draws:0,kills:18,deaths:2,assists:7,damage:3800,taken:null,headshots:4,shots:20,hits:10,timeAlive:100,timePlayed:null}}};
}
module.exports={profileFixture,clone};
