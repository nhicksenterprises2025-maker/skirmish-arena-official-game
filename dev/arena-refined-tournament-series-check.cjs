/* Audit 6 acceptance checks: production tournament finalization, isolated SQLite,
   real gameplay reward/scoring paths, and immutable historical formats. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Circuit=require('../server/tournaments.cjs'),Runtime=require('../server/tournament-runtime.cjs'),XP=require('../progression.js');
const {engine}=require('./simulate.cjs'),{writeWorld,readWorld}=require('../server/world.cjs');
const {validateTournamentProgression}=require('../server/progression.cjs');
const {fixture,fillTeams,snapshot,placementRows,earningRows,PAYOUTS}=require('./live-circuit-tournament-check.cjs');
const RULESET='arena-refined-aggregate-kills-v1',USER='live-circuit-fixture',checks=[],clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b,label)=>assert.deepEqual(clone(a),clone(b),label);
let nextGame=0;
function event(f,kind='custom'){
 const now=kind==='official'?f.season.startAt+72*3600000:f.season.startAt+3600000;
 let value=kind==='official'?Circuit.scheduleOfficial(f.db,USER,f.season,now)[0]:Circuit.createCustom(f.db,USER,{name:'Aggregate Fixture '+(++nextGame),startsAt:now},now);
 fillTeams(f.db,value.id,now);value=Circuit.startTournament(f.db,USER,value.id,now);return {value,now};
}
function load(f,id){return Circuit.getTournament(f.db,USER,id);}
function series(value,id){return value.series.find(s=>s.id===id);}
function game(value,s,score,{id=s.id+':game'+(s.games.length+1),duration=Math.max(...score)<60?300:180}={}){
 const winner=score[0]>score[1]?0:1;
 const stats=s.teamIds.flatMap((teamId,index)=>value.teams.find(t=>t.id===teamId).participants.map((p,i)=>{
  const kills=Math.floor(score[index]/5)+(i<score[index]%5?1:0),deaths=Math.floor(score[1-index]/5)+(i<score[1-index]%5?1:0);
  return {participantId:p.id,kills,deaths,assists:2,damage:kills*250,shots:kills*12+5,hits:kills*8,headshots:Math.min(2,kills),timeAlive:duration*.8,weaponStats:{'AR-15':{kills,deaths,assists:2,damage:kills*250,shots:kills*12+5,hits:kills*8,headshots:Math.min(2,kills)}}};
 }));
 return {id,winnerTeamId:s.teamIds[winner],score:score.slice(),duration,stats};
}
function record(f,id,sid,score,options={}){const value=load(f,id),s=series(value,sid),result=game(value,s,score,options);return {value:Circuit.recordGame(f.db,USER,id,sid,result,options.now??Date.now()),result};}
function firstQf(value){return value.series.find(s=>s.round==='QF'&&s.teamIds.some(teamId=>value.teams.find(t=>t.id===teamId).participants.some(p=>p.id===USER)));}
function completeBeforeFinal(f,id){
 for(let step=0;step<30;step++){
  const value=load(f,id),s=value.series.find(s=>s.round!=='FINAL'&&!s.winnerTeamId&&s.teamIds.every(Boolean));
  if(!s){assert.ok(value.series.find(s=>s.round==='FINAL').teamIds.every(Boolean));return value;}
  record(f,id,s.id,[60,35]);
 }
 assert.fail('Bracket could not complete all quarterfinal and semifinal games');
}
function finish(f,id){
 for(let step=0;step<30;step++){const value=load(f,id);if(value.status==='COMPLETED')return value;const s=value.series.find(s=>!s.winnerTeamId&&s.status!=='awaiting-tie-policy'&&s.teamIds.every(Boolean));assert.ok(s,'An unfinished non-tied bracket has an eligible next game');record(f,id,s.id,[60,35]);}
 assert.fail('Bracket did not finalize all 23 required games');
}
function tournamentTables(db){
 return Object.fromEntries(['tournaments','tournament_series','tournament_matches','tournament_stats','tournament_placements','tournament_earnings'].map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(clone)]));
}
function isolation(f){same(snapshot(f.db),f.before,'Tournament writes must preserve normal world, career, XP, seasons, bot familiarity, standard meta and Gun Score inputs');same(f.runtime.context.SAR.getWeapons(),f.weapons,'Weapons remain unchanged');same(f.runtime.context.SAR.getWeaponScores(),f.gunScores,'Normal Gun Score remains unchanged');}
function persistedSeries(f,value){for(const s of value.series){const row=f.db.prepare('SELECT * FROM tournament_series WHERE id=?').get(s.id);assert.equal(row.round,s.round);same(JSON.parse(row.state_json),s,'Series table and bracket snapshot agree');}}
async function check(name,fn){await fn();checks.push({test:name,result:'PASS'});console.log('PASS',name);}
async function main(){
 await check('New tournaments persist eight stable teams, tagged aggregate rules and exact per-round game counts',()=>{
  const f=fixture();try{const {value}=event(f);assert.equal(value.rulesetId,RULESET);assert.equal(value.teams.length,8);assert.ok(value.teams.every(t=>t.participants.length===5));assert.equal(new Set(value.teams.flatMap(t=>t.participants.map(p=>p.id))).size,40);
   assert.equal(value.series.filter(s=>s.round==='QF').length,4);assert.equal(value.series.filter(s=>s.round==='SF').length,2);assert.equal(value.series.filter(s=>s.round==='FINAL').length,1);
   for(const s of value.series){assert.equal(s.rulesetId,RULESET);assert.equal(s.requiredGames,s.round==='FINAL'?5:3);assert.equal(s.completedGames,0);assert.equal(s.remainingGames,s.requiredGames);same(s.aggregateKills,[0,0]);assert.equal(s.advancement.status,'pending');assert.equal(s.status,s.round==='QF'?'in-progress':'waiting-opponents');assert.equal(s.winnerTeamId,null);}
   persistedSeries(f,value);const ids=value.teams.map(t=>t.id);f.reopen();same(load(f,value.id).teams.map(t=>t.id),ids);isolation(f);
  }finally{f.close();}
 });
 await check('Stable game identities reject out-of-order delivery and cannot be acknowledged under a different series',()=>{
  const f=fixture();try{const {value}=event(f),q=firstQf(value),foreign=value.series.find(s=>s.round==='QF'&&s.id!==q.id),wrong=game(value,q,[60,20],{id:q.id+':game2'}),before=tournamentTables(f.db);assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,q.id,wrong),/game|order|identity|expected/i);same(tournamentTables(f.db),before);
   const first=record(f,value.id,q.id,[60,20]);const accepted=tournamentTables(f.db);assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,foreign.id,first.result),/series|different|belongs/i);same(tournamentTables(f.db),accepted);isolation(f);
  }finally{f.close();}
 });
 await check('Required 128–136 quarterfinal advances Team 2 after all three games despite Team 1 winning two',()=>{
  const f=fixture();try{const {value}=event(f),q=firstQf(value),sf=value.series.find(s=>s.round==='SF'&&s.id.endsWith('0'));
   let result=record(f,value.id,q.id,[56,30]).value,s=series(result,q.id);same(s.aggregateKills,[56,30]);assert.equal(s.completedGames,1);assert.equal(s.remainingGames,2);assert.equal(s.winnerTeamId,null);
   result=record(f,value.id,q.id,[52,46]).value;s=series(result,q.id);same(s.wins,[2,0]);same(s.aggregateKills,[108,76]);assert.equal(s.winnerTeamId,null);assert.ok(series(result,sf.id).teamIds.includes(null),'Two individual wins cannot advance the bracket');
   result=record(f,value.id,q.id,[20,60]).value;s=series(result,q.id);same(s.wins,[2,1]);same(s.aggregateKills,[128,136]);assert.equal(s.completedGames,3);assert.equal(s.remainingGames,0);assert.equal(s.winnerTeamId,q.teamIds[1]);assert.equal(s.status,'complete');assert.equal(s.advancement.status,'decided');assert.ok(series(result,sf.id).teamIds.includes(q.teamIds[1]));same(s.games.map(g=>g.score),[[56,30],[52,46],[20,60]]);persistedSeries(f,result);isolation(f);
  }finally{f.close();}
 });
 await check('Final plays all five games even after three individual wins; total kills alone choose its winner',()=>{
  const f=fixture();try{const {value}=event(f),prepared=completeBeforeFinal(f,value.id),final=prepared.series.find(s=>s.round==='FINAL'),scores=[[60,58],[60,58],[60,58],[0,60],[0,60]];
   for(let i=0;i<scores.length;i++){const result=record(f,value.id,final.id,scores[i]).value,s=series(result,final.id);assert.equal(s.completedGames,i+1);assert.equal(s.remainingGames,4-i);if(i<4){assert.equal(result.status,'ACTIVE');assert.equal(s.winnerTeamId,null);assert.equal(result.earnings.length,0);assert.equal(result.placements.length,0);}}
   const completed=load(f,value.id),s=series(completed,final.id);same(s.wins,[3,2]);same(s.aggregateKills,[180,294]);assert.equal(s.winnerTeamId,final.teamIds[1]);assert.equal(s.games.length,5);assert.equal(completed.status,'COMPLETED');persistedSeries(f,completed);isolation(f);
  }finally{f.close();}
 });
 await check('Repeated and changed late callbacks are immutable; a fourth quarterfinal result cannot modify finalized games',()=>{
  const f=fixture();try{const {value}=event(f),q=firstQf(value),first=record(f,value.id,q.id,[60,40]),baseline=tournamentTables(f.db);
   Circuit.recordGame(f.db,USER,value.id,q.id,first.result);same(tournamentTables(f.db),baseline);
   const changed=game(value,q,[0,60],{id:first.result.id});Circuit.recordGame(f.db,USER,value.id,q.id,changed);same(tournamentTables(f.db),baseline,'Acknowledged ID is immutable even if a late payload changes');
   record(f,value.id,q.id,[60,35]);record(f,value.id,q.id,[60,25]);const complete=tournamentTables(f.db);assert.throws(()=>record(f,value.id,q.id,[60,0]),/series|complete|accept/i);same(tournamentTables(f.db),complete);Circuit.recordGame(f.db,USER,value.id,q.id,changed);same(tournamentTables(f.db),complete);isolation(f);
  }finally{f.close();}
 });
 await check('Resolved score must equal stable-team participant kill totals and failed validation rolls back every table',()=>{
  const f=fixture();try{const {value}=event(f),q=firstQf(value),valid=game(value,q,[60,30]),before=tournamentTables(f.db);
   const wrongScore=clone(valid);wrongScore.score=[60,31];assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,q.id,wrongScore),/score|kills|resolved/i);same(tournamentTables(f.db),before);
   const wrongWinner=clone(valid);wrongWinner.winnerTeamId=q.teamIds[1];assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,q.id,wrongWinner),/winner|score|resolved/i);same(tournamentTables(f.db),before);
   const missing=clone(valid);missing.stats.pop();assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,q.id,missing),/participant|ten/i);same(tournamentTables(f.db),before);
   const duplicate=clone(valid);duplicate.stats[1].participantId=duplicate.stats[0].participantId;assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,q.id,duplicate),/participant|ten/i);same(tournamentTables(f.db),before);isolation(f);
  }finally{f.close();}
 });
 await check('Restart midway restores IDs, totals and the next game; UI reads cannot advance a bracket or unlock early semifinals',()=>{
  const f=fixture();try{const {value,now}=event(f),q=firstQf(value),sf=value.series.find(s=>s.round==='SF');const premature=game({...value,teams:value.teams}, {...sf,teamIds:q.teamIds}, [60,30]);assert.throws(()=>Circuit.recordGame(f.db,USER,value.id,sf.id,premature),/series|ready|accept|opponent/i);
   record(f,value.id,q.id,[60,30]);record(f,value.id,q.id,[60,50]);let persisted=load(f,value.id),before=tournamentTables(f.db);for(let i=0;i<8;i++)load(f,value.id);same(tournamentTables(f.db),before,'Opening the UI is read only');
   const context=Runtime.playContext(f.db,USER,value.id,now);assert.equal(context.seriesId,q.id);assert.equal(context.gameId,q.id+':game3');f.reopen();same(load(f,value.id),persisted);same(Runtime.playContext(f.db,USER,value.id,now),context);same(series(load(f,value.id),q.id).aggregateKills,[120,80]);record(f,value.id,q.id,[0,60]);persisted=load(f,value.id);assert.equal(series(persisted,q.id).winnerTeamId,q.teamIds[1]);persistedSeries(f,persisted);isolation(f);
  }finally{f.close();}
 });
 await check('Equal complete aggregate pauses for explicit tie policy; game wins, seeds and retries cannot advance or schedule overtime',()=>{
  const f=fixture();try{const {value,now}=event(f),q=firstQf(value);for(const score of [[56,30],[44,54],[20,36]])record(f,value.id,q.id,score);const tied=load(f,value.id),s=series(tied,q.id),before=tournamentTables(f.db);same(s.aggregateKills,[120,120]);same(s.wins,[1,2]);assert.equal(s.completedGames,3);assert.equal(s.remainingGames,0);assert.equal(s.winnerTeamId,null);assert.equal(s.status,'awaiting-tie-policy');assert.equal(s.advancement.status,'tied');assert.equal(tied.status,'ACTIVE');assert.equal(tied.earnings.length,0);assert.equal(tied.placements.length,0);assert.ok(tied.series.filter(s=>s.round==='SF').every(s=>s.teamIds.some(id=>id===null)));
   assert.throws(()=>Runtime.playContext(f.db,USER,value.id,now),/tie|policy|ready|complete/i);assert.throws(()=>record(f,value.id,q.id,[60,0]),/tie|policy|series|complete|accept/i);same(tournamentTables(f.db),before);f.reopen();same(load(f,value.id),tied);assert.throws(()=>Runtime.playContext(f.db,USER,value.id,now),/tie|policy|ready|complete/i);same(tournamentTables(f.db),before);isolation(f);
  }finally{f.close();}
 });
 await check('An unresolved official aggregate tie cannot authorize XP for an unscheduled extra game',()=>{
  const f=fixture();try{const {value}=event(f,'official'),q=firstQf(value);for(const score of [[56,30],[44,54],[20,36]])record(f,value.id,q.id,score);const previous=readWorld(f.db,USER).save,forged=clone(previous);
   XP.award(forged.progression,{matchId:q.id+':game4',participantId:USER,kind:'official',mode:'tdm',sessionType:'tournament',eligible:true,practice:false,at:Date.now(),stats:{kills:0,deaths:0,assists:0,damage:0,headshots:0,timeAlive:0},events:XP.events(),leaders:{kills:false,assists:false,alive:false},won:true,winStreak:0,tournamentId:value.id,seriesId:q.id});
   assert.throws(()=>validateTournamentProgression(f.db,USER,forged,previous),/registered|tie|game|complete/i);isolation(f);
  }finally{f.close();}
 });
 await check('A tied five-game final cannot award prizes or finalize the event until a confirmed tie policy exists',()=>{
  const f=fixture();try{const {value}=event(f,'official'),prepared=completeBeforeFinal(f,value.id),final=prepared.series.find(s=>s.round==='FINAL');for(const score of [[60,50],[50,60],[60,50],[40,60],[40,30]])record(f,value.id,final.id,score);
   const result=load(f,value.id),s=series(result,final.id);same(s.aggregateKills,[250,250]);assert.equal(s.games.length,5);assert.equal(s.remainingGames,0);assert.equal(s.status,'awaiting-tie-policy');assert.equal(s.winnerTeamId,null);assert.equal(result.status,'ACTIVE');assert.equal(result.earnings.length,0);assert.equal(result.placements.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_earnings').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_placements').get().n,0);isolation(f);
  }finally{f.close();}
 });
 await check('Official aggregate championship records all 23 games, eight placements and exact per-player prizes once',()=>{
  const f=fixture();try{const {value}=event(f,'official'),completed=finish(f,value.id),placements=placementRows(completed),earnings=earningRows(completed);assert.equal(completed.series.reduce((n,s)=>n+s.games.length,0),23);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_matches WHERE tournament_id=?').get(value.id).n,23);assert.equal(placements.length,8);assert.equal(earnings.length,40);
   for(const place of placements){const team=completed.teams.find(t=>t.id===place.teamId);for(const p of team.participants){const reward=earnings.find(r=>r.participantId===p.id);assert.equal(reward.amount,PAYOUTS[place.placement-1]);assert.equal(reward.kind,p.kind);}}assert.equal(earnings.reduce((n,r)=>n+r.amount,0),667500);
   const before=tournamentTables(f.db);for(const s of completed.series)for(const g of s.games)Circuit.recordGame(f.db,USER,value.id,s.id,g);same(tournamentTables(f.db),before);f.reopen();same(load(f,value.id),completed);same(tournamentTables(f.db),before);persistedSeries(f,completed);isolation(f);
  }finally{f.close();}
 });
 await check('Custom aggregate championship has identical complete format but zero prizes and no normal-stat contamination',()=>{
  const f=fixture();try{const {value}=event(f),completed=finish(f,value.id);assert.equal(completed.series.reduce((n,s)=>n+s.games.length,0),23);assert.equal(completed.placements.length,8);assert.equal(completed.earnings.length,40);assert.ok(completed.earnings.every(r=>r.amount===0));assert.equal(f.db.prepare('SELECT sum(amount) n FROM tournament_earnings').get().n,0);f.reopen();same(load(f,value.id),completed);isolation(f);
  }finally{f.close();}
 });
 await check('Untagged historical best-of results retain their original games, rules and advancement through restart',()=>{
  const f=fixture();try{const {value}=event(f),legacy=clone(value);delete legacy.rulesetId;for(const s of legacy.series){for(const key of ['rulesetId','requiredGames','aggregateKills','completedGames','remainingGames','status','advancement'])delete s[key];s.bestOf=s.round==='FINAL'?5:3;}
   f.db.prepare('UPDATE tournaments SET bracket_json=?,metadata_json=? WHERE id=?').run(JSON.stringify({teams:legacy.teams,series:legacy.series,placements:[],earnings:[],invites:legacy.invites}), '{}',value.id);for(const s of legacy.series)f.db.prepare('UPDATE tournament_series SET state_json=? WHERE id=?').run(JSON.stringify(s),s.id);
   const before=tournamentTables(f.db);load(f,value.id);same(tournamentTables(f.db),before,'Read does not rewrite legacy storage');const q=firstQf(legacy);record(f,value.id,q.id,[60,20]);const second=record(f,value.id,q.id,[60,20]).value,s=series(second,q.id);assert.equal(s.games.length,2);assert.equal(s.bestOf,3);assert.equal(s.winnerTeamId,q.teamIds[0]);assert.notEqual(second.rulesetId,RULESET);assert.equal(s.requiredGames,undefined);
   const saved=tournamentTables(f.db);f.reopen();same(load(f,value.id),second);same(tournamentTables(f.db),saved);isolation(f);
  }finally{f.close();}
 });
 await check('Actual tournament runtime retains existing target 50, five-minute clocks and normal TDM/DM rules',()=>{
  const f=fixture();try{const {value,now}=event(f),context=Runtime.playContext(f.db,USER,value.id,now),runtime=engine(),match=runtime.context.SAR.startTournamentGame(context);assert.equal(match.mode,'tdm');assert.equal(match.sessionType,'tournament');assert.equal(match.limit,50);assert.equal(match.durationMs,300000);assert.equal(match.eligible,false);
   const background=runtime.dev.inspect().state.matches.filter(m=>m?.sessionType==='standard');assert.equal(background.length,4);assert.deepEqual(background.map(m=>[m.mode,m.limit,m.durationMs]).sort(),[['deathmatch',30,240000],['deathmatch',30,240000],['tdm',60,300000],['tdm',60,300000]].sort());isolation(f);
  }finally{f.close();}
 });
 await check('Early individual-game completion records only one game and preserves official 1.3 XP once; custom remains excluded',()=>{
  for(const kind of ['custom','official']){const f=fixture();try{const {value,now}=event(f,kind),context=Runtime.playContext(f.db,USER,value.id,now),saved=readWorld(f.db,USER).save,storage={'sar-persistent-save':JSON.stringify(saved)},runtime=engine(storage),match=runtime.context.SAR.startTournamentGame(context),before=runtime.context.SAR.getUniverse(),player=match.participants.find(a=>a.isPlayer);assert.ok(player);match.status='active';
    // Exercise the real kill-cap finalizer with resolved participant totals.
    match.score[player.team]=50;player.stats.kills=50;player.stats.damage=12500;player.stats.assists=1;player.stats.headshots=10;player.stats.timeAlive=30;player.xpEvents.soloKills=50;player.xpEvents.usedWeapons=['AR-15'];
    runtime.dev.endMatch(match,player.team,'limit');const result=clone(match.tournamentResult),world=runtime.context.SAR.getUniverse();assert.equal(result.duration,0);const received=Circuit.recordGame(f.db,USER,value.id,context.seriesId,result,now),s=series(received,context.seriesId);assert.equal(s.games.length,1);assert.equal(s.completedGames,1);assert.equal(s.remainingGames,2);assert.equal(s.winnerTeamId,null);same(world.playerCareer,before.playerCareer);same(world.bots,before.bots);same(world.seasons,before.seasons);same(world.patchState,before.patchState);same(world.modeStats,before.modeStats);
    if(kind==='custom'){same(world.progression,saved.progression);assert.equal(result.xp,null);}else{const receipt=world.progression.awards[context.gameId];assert.ok(receipt);assert.equal(receipt.kind,'official');assert.equal(receipt.units,XP.totals(receipt).units);assert.equal(receipt.units,Number((BigInt(receipt.baseUnits)*13n+5n)/10n));const progression=clone(world.progression);runtime.dev.endMatch(match,player.team,'limit');same(runtime.context.SAR.getUniverse().progression,progression,'Duplicate finalizer does not award XP');writeWorld(f.db,USER,world,1);writeWorld(f.db,USER,world,2);same(readWorld(f.db,USER).save.progression,progression);f.reopen();same(readWorld(f.db,USER).save.progression,progression);}
    const tables=tournamentTables(f.db);Circuit.recordGame(f.db,USER,value.id,context.seriesId,result,now+1);same(tournamentTables(f.db),tables);
   }finally{f.close();}}
 });
 const report={result:'PASS',rulesetId:RULESET,groups:checks.length,sourceHashes:Object.fromEntries(['server/tournaments.cjs','server/tournament-runtime.cjs','game.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')])),checks};
 const target=process.argv[2];if(target){if(path.extname(target).toLowerCase()!=='.json')throw Error('Report output must be a JSON file');fs.mkdirSync(path.dirname(path.resolve(target)),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));}console.log(JSON.stringify({ok:true,groups:checks.length}));return report;
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={main,game,event,finish,completeBeforeFinal};
