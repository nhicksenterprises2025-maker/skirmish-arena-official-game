'use strict';
// Actual shipped match allocation, resolved damage and finalization. Only DOM,
// drawing, cloud transport and commerce transport are observed/stubbed. No live
// account, database, wallet credit or installed profile is touched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),checks=[];
const instrumentation=`
window.__AC_REPORTS=[];window.__AC_COMMITS=[];
window.SARCloud.state={account:{id:'commerce-game-fixture',username:'CommerceFixture'},online:true,localMode:false};
window.SARCloud.commitMatch=(world,matchId)=>window.__AC_COMMITS.push({matchId,receipt:JSON.parse(JSON.stringify(world.progression.awards[matchId]||null))});
window.SARCommerce={getEquipped:()=>null,recordMatch(matchId){const commit=window.__AC_COMMITS.find(row=>row.matchId===matchId);window.__AC_REPORTS.push({matchId,committed:!!commit,receipt:commit?.receipt||null});return Promise.resolve(true);}};
`;
const shipped=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),source=instrumentation+shipped;
function fresh(world){return engine(world?{'sar-persistent-save':JSON.stringify(world)}:{},source);}
function pass(label){checks.push(label);console.log('PASS '+label);}
function activate(e,match){assert.ok(match);match.status='active';for(const actor of e.dev.inspect().state.actors){actor.spawnFlash=0;actor.dead=false;}return match;}
function start(e,mode){if(mode==='ranked')e.context.SAR.startRanked();else if(mode==='deathmatch')e.context.SAR.startDeathmatch();else e.dev.queueForMatch();const match=activate(e,e.dev.inspect().state.matches.find(row=>row?.hasPlayer));return {match,player:match.participants.find(actor=>actor.isPlayer)};}
function kill(e,match,player,victim){if(victim.dead)e.dev.respawnActor(victim);victim.spawnFlash=0;e.dev.applyDamage(victim,{owner:player,weapon:player.slots[0].name,travel:1},250,false,10000+player.stats.kills*1000);}
function complete(e,match,player){const victim=match.participants.find(actor=>actor!==player&&(match.mode==='deathmatch'||actor.team!==player.team));let count=0;while(match.status==='active'){assert.ok(++count<100,'normal kill target finalizes');kill(e,match,player,victim);}e.ui.flush();assert.equal(match.result.reason,'score');}
function officialContext(e,kind='official',hasPlayer=true){const ids=Object.values(e.context.SAR.getProfiles()).slice(0,hasPlayer?9:10).map(p=>({kind:'bot',id:p.id}));if(hasPlayer)ids.unshift({kind:'user',id:'commerce-game-fixture'});return {mode:'tdm',sessionType:'tournament',tournamentKind:kind,tournamentId:'fixture:'+kind,seriesId:'fixture:series',gameId:'fixture:game:'+kind,teamIds:['fixture:blue','fixture:red'],teams:[{participants:ids.slice(0,5)},{participants:ids.slice(5)}],hasPlayer};}

for(const mode of ['tdm','ranked','deathmatch']){
  const e=fresh(),{match,player}=start(e,mode);assert.equal(e.context.__AC_REPORTS.length,0);complete(e,match,player);
  assert.equal(e.context.__AC_REPORTS.length,1);const report=e.context.__AC_REPORTS[0];assert.equal(report.matchId,match.matchId);assert.equal(report.committed,true,'world commit precedes pending credit report');assert.equal(report.receipt.participantId,'commerce-game-fixture');assert.equal(report.receipt.kind,mode==='ranked'?'ranked':'standard');assert.equal(report.receipt.mode,mode==='deathmatch'?'deathmatch':'tdm');assert.equal(report.receipt.eligible,true);assert.equal(report.receipt.practice,false);
  const fixed=clone(e.context.SAR.getUniverse().progression);e.dev.endMatch(match,player.team);e.ui.flush();assert.equal(e.context.__AC_REPORTS.length,1);assert.deepEqual(e.context.SAR.getUniverse().progression,fixed);
  const restarted=fresh(e.context.SAR.getUniverse());assert.equal(restarted.context.__AC_REPORTS.length,0,'startup never scans historical receipts');assert.deepEqual(restarted.context.SAR.getUniverse().progression,fixed);restarted.context.SAR.openPlayerProfile();restarted.ui.flush();assert.equal(restarted.context.__AC_REPORTS.length,0,'opening profile awards nothing');
  pass(mode+' human completion dispatches one prospective report after world checkpoint; duplicate finalization and reload preserve rewards');
}

{
  for(const mode of ['tdm','deathmatch'])for(const practice of [true,false]){
    const e=fresh(),before=clone(e.context.SAR.getUniverse().progression),match=activate(e,e.context.SAR.startCustomMatch({mode,bots:practice?[]:[{name:'Ace',team:1}]}));assert.equal(match.practice,practice);e.dev.endMatch(match,match.participants[0].team,'time');e.ui.flush();assert.equal(e.context.__AC_REPORTS.length,0);assert.deepEqual(e.context.SAR.getUniverse().progression,before);
  }
  const e=fresh();for(const match of e.dev.inspect().state.matches.slice(0,4)){activate(e,match);e.dev.endMatch(match,0,'time');}e.ui.flush();assert.equal(e.context.__AC_REPORTS.length,0,'background/spectator results never report human AC');
  for(const mode of ['tdm','ranked','deathmatch']){const abandoned=fresh(),{match}=start(abandoned,mode);abandoned.dev.exitGame();abandoned.ui.flush();assert.equal(abandoned.context.__AC_REPORTS.length,0,'abandoning an unfinished '+mode+' match awards nothing');if(match.status==='active'){abandoned.dev.endMatch(match,0,'time');abandoned.ui.flush();assert.equal(abandoned.context.__AC_REPORTS.length,0,'later bot completion cannot credit an abandoned human');}}
  pass('custom/practice, four background bot slots, spectating and abandoned human sessions dispatch no credit reports');
}

{
  for(const kind of ['official','custom'])for(const hasPlayer of [true,false]){
    const e=fresh(),match=activate(e,e.context.SAR.startTournamentGame(officialContext(e,kind,hasPlayer)));e.dev.endMatch(match,0,'time');e.ui.flush();assert.equal(e.context.__AC_REPORTS.length,0,'tournament AC remains disabled');
    if(kind==='official'&&hasPlayer){const xp=e.context.SAR.getUniverse().progression.awards[match.matchId];assert.ok(xp);assert.equal(xp.units,Math.round(xp.baseUnits*13/10),'official XP multiplier remains untouched');}
  }
  pass('official/custom human/bot tournaments report no AC and retain official tournament XP rules');
}

console.log(JSON.stringify({ok:true,groups:checks.length,sourceHash:require('node:crypto').createHash('sha256').update(shipped).digest('hex'),scope:'Real match engine with observed transport; no assertion of server validation or spendable credit grants'}));
