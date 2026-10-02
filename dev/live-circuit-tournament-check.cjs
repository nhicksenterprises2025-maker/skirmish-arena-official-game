/* Behavioral tournament checks use the production engine and isolated SQLite.
   Game-result fixtures stand for resolved 5v5 outcomes; this suite does not
   fabricate persistent production matches or reuse a player's database. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createDatabase}=require('../server/db.cjs'),{writeWorld}=require('../server/world.cjs'),{engine}=require('./simulate.cjs'),Circuit=require('../server/tournaments.cjs');
const HOUR=3600000,INTERVAL=72*HOUR,PAYOUTS=[50000,35000,20000,12500,7500,5000,2500,1000],USER='live-circuit-fixture',checks=[];
const clone=value=>JSON.parse(JSON.stringify(value));
const standardTables=['worlds','users','bots','bot_careers','bot_weapon_stats','user_career_stats','user_weapon_stats','seasons','balance_patches','weapon_patch_stats','bot_social_profiles'];
function snapshot(db){return Object.fromEntries(standardTables.map(table=>[table,db.prepare('SELECT * FROM '+table).all().map(row=>clone(row))]));}
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sar-live-circuit-')),file=path.join(directory,'isolated.sqlite');let db=createDatabase(file);const runtime=engine(),world=runtime.context.SAR.getUniverse(),now=Date.now();
 db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(USER,'CircuitFixture','circuitfixture','fixture-not-a-real-password',now,now);writeWorld(db,USER,world,0);
 // Only test data receives strong participation traits, so 40 accepted roster
 // members are available without replacing the production decision function.
 for(const row of db.prepare('SELECT bot_id,personality_json FROM bot_social_profiles WHERE user_id=?').all(USER)){const personality=JSON.parse(row.personality_json);personality.social={...personality.social,competitiveness:1,socialness:1,ego:1};db.prepare('UPDATE bot_social_profiles SET personality_json=? WHERE user_id=? AND bot_id=?').run(JSON.stringify(personality),USER,row.bot_id);}
 db.prepare('UPDATE bots SET form=10 WHERE user_id=?').run(USER);
 const before=snapshot(db),weapons=clone(runtime.context.SAR.getWeapons()),gunScores=clone(runtime.context.SAR.getWeaponScores()),season=clone(world.seasons.current);
 return {directory,file,runtime,weapons,gunScores,season,before,get db(){return db;},reopen(){db.close();db=createDatabase(file);return db;},close(){if(db.isOpen)db.close();const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});}};
}
function tournament(db,id){const value=Circuit.getTournament(db,USER,id);assert.ok(value,'Tournament is readable');return value;}
function schedule(f){const events=Circuit.scheduleOfficial(f.db,USER,f.season,f.season.startAt);assert.ok(Array.isArray(events),'Official scheduler returns events');return events.sort((a,b)=>a.startsAt-b.startsAt);}
function teamByName(value,name){const team=value.teams.find(item=>item.name===name);assert.ok(team,'Registered team '+name);return team;}
function fillTeams(db,id,now){
 const roster=[USER,...Array.from({length:39},(_,index)=>'bot_'+String(index+1).padStart(4,'0'))];
 for(let index=0;index<8;index++)Circuit.registerTeam(db,USER,id,{name:'Team '+(index+1),participantIds:roster.slice(index*5,index*5+5)},now);
 const value=tournament(db,id);assert.equal(value.teams.length,8);for(const team of value.teams)assert.equal(team.participants.length,5);assert.equal(new Set(value.teams.flatMap(team=>team.participants.map(participant=>participant.id))).size,40);assert.ok(value.teams.some(team=>team.participants.some(participant=>participant.id===USER&&participant.kind==='user')));return value;
}
let gameNumber=0;
function resolvedGame(value,series,winnerTeamId,{loserKills=10,loserDamage=3000}={}){
 const stats=series.teamIds.flatMap(teamId=>value.teams.find(team=>team.id===teamId).participants.map(participant=>{
  const won=teamId===winnerTeamId,kills=won?20:loserKills,deaths=won?loserKills:20,damage=won?6000:loserDamage,shots=Math.max(20,Math.ceil(damage/10)),hits=damage?Math.max(1,Math.ceil(damage/20)):0,headshots=Math.min(2,kills);
  return {participantId:participant.id,kills,deaths,assists:2,damage,shots,hits,headshots,weaponStats:{P90:{kills,deaths,assists:2,damage,shots,hits,headshots}}};
 }));
 return {id:'fixture-game-'+(++gameNumber),winnerTeamId,score:series.teamIds.map(teamId=>teamId===winnerTeamId?100:loserKills*5),duration:150,stats};
}
function placementRows(value){
 if(Array.isArray(value.placements))return value.placements;
 return Object.entries(value.placements||{}).map(([teamId,placement])=>typeof placement==='object'?{teamId,...placement}:{teamId,placement});
}
function earningRows(value){
 if(Array.isArray(value.earnings))return value.earnings;
 return Object.entries(value.earnings||{}).map(([participantId,amount])=>typeof amount==='object'?{participantId,...amount}:{participantId,amount});
}
function complete(db,id,now,{tiebreak=false}={}){
 let value=tournament(db,id);const replay=[];
 for(let guard=0;value.status!=='COMPLETED'&&guard<40;guard++){
  const playable=value.series.find(series=>!series.winnerTeamId&&series.teamIds?.length===2&&series.teamIds.every(Boolean));assert.ok(playable,'A complete bracket always has an unresolved playable series');
  const ordered=playable.teamIds.map(teamId=>value.teams.find(team=>team.id===teamId)).sort((a,b)=>a.seed-b.seed);let winner=ordered[0].id,metrics={};
  if(tiebreak&&playable.round==='QF'){
   const loser=ordered[1];if(loser.seed===8&&playable.games.length===0)winner=loser.id;
   else metrics=loser.seed===8?{loserKills:0,loserDamage:0}:loser.seed===5?{loserKills:19,loserDamage:5000}:loser.seed===7?{loserKills:10,loserDamage:9000}:{loserKills:10,loserDamage:8000};
  }
  const result=resolvedGame(value,playable,winner,metrics);
  Circuit.recordGame(db,USER,id,playable.id,result,now+guard);replay.push({seriesId:playable.id,result});value=tournament(db,id);const acknowledged=clone(value.series);Circuit.recordGame(db,USER,id,playable.id,result,now+guard);value=tournament(db,id);assert.deepEqual(value.series,acknowledged,'Replaying an acknowledged game cannot count another game or advance a series twice');
 }
 assert.equal(value.status,'COMPLETED');return {value,replay};
}
function assertIsolation(f){assert.deepEqual(snapshot(f.db),f.before,'Tournament writes cannot change standard world/profile/bot careers/meta/season rows');assert.deepEqual(clone(f.runtime.context.SAR.getWeapons()),f.weapons,'Balance remains unchanged');assert.deepEqual(clone(f.runtime.context.SAR.getWeaponScores()),f.gunScores,'Standard Gun Score remains unchanged');}
async function check(name,fn){await fn();checks.push({test:name,result:'PASS'});console.log('PASS',name);}
async function main(){
 await check('Official season events use exact 72h timestamps, exclude the season endpoint and survive repeated scheduling/restart',()=>{
  const f=fixture();try{const events=schedule(f),expected=[];for(let at=f.season.startAt+INTERVAL;at<f.season.endAt;at+=INTERVAL)expected.push(at);assert.deepEqual(events.map(event=>event.startsAt),expected);assert.equal(events.length,4);const ids=events.map(event=>event.id);assert.equal(new Set(ids).size,ids.length);
   assert.deepEqual(schedule(f).map(event=>event.id),ids);f.reopen();assert.deepEqual(Circuit.scheduleOfficial(f.db,USER,f.season,f.season.startAt+10*24*HOUR).sort((a,b)=>a.startsAt-b.startsAt).map(event=>event.id),ids);for(const event of events)assert.equal(tournament(f.db,event.id).startsAt,event.startsAt);
   const nextSeason={...f.season,number:f.season.number+1,startAt:f.season.endAt,endAt:f.season.endAt+(f.season.endAt-f.season.startAt)},next=Circuit.scheduleOfficial(f.db,USER,nextSeason,nextSeason.startAt);assert.equal(next.length,4);assert.ok(next.every(event=>!ids.includes(event.id)));assert.equal(Math.min(...next.map(event=>event.startsAt)),nextSeason.startAt+INTERVAL);for(const event of events)assert.equal(tournament(f.db,event.id).startsAt,event.startsAt);assertIsolation(f);
  }finally{f.close();}
 });
 await check('Registration supports users and 5-player bot teams while preventing duplicate participants and invalid starts',()=>{
  const f=fixture();try{const event=schedule(f)[0],now=event.startsAt;Circuit.registerTeam(f.db,USER,event.id,{name:'Draft',participantIds:[USER,'bot_0001']},now);assert.throws(()=>Circuit.startTournament(f.db,USER,event.id,now));const before=tournament(f.db,event.id);assert.throws(()=>Circuit.registerTeam(f.db,USER,event.id,{name:'Duplicate roster',participantIds:['bot_0002','bot_0002','bot_0003','bot_0004','bot_0005']},now));assert.deepEqual(tournament(f.db,event.id).teams,before.teams);assert.throws(()=>Circuit.registerTeam(f.db,USER,event.id,{name:'Double booking',participantIds:['bot_0001','bot_0006','bot_0007','bot_0008','bot_0009']},now));assert.throws(()=>Circuit.registerTeam(f.db,USER,event.id,{name:'Oversized',participantIds:Array.from({length:6},(_,index)=>'bot_'+String(index+10).padStart(4,'0'))},now));assertIsolation(f);
  }finally{f.close();}
 });
 await check('Bot invitation decisions use persistent traits/form and preserve accepted commitments without duplicate team membership',()=>{
  const f=fixture();try{const now=f.season.startAt+HOUR,event=Circuit.createCustom(f.db,USER,{name:'Invite Fixture Cup',startsAt:now},now),low=f.db.prepare('SELECT personality_json FROM bot_social_profiles WHERE user_id=? AND bot_id=?').get(USER,'bot_0050'),traits=JSON.parse(low.personality_json);traits.social={...traits.social,competitiveness:0,socialness:0,ego:0};f.db.prepare('UPDATE bot_social_profiles SET personality_json=? WHERE user_id=? AND bot_id=?').run(JSON.stringify(traits),USER,'bot_0050');f.db.prepare('UPDATE bots SET form=-10 WHERE user_id=? AND bot_id=?').run(USER,'bot_0050');f.before=snapshot(f.db);
   Circuit.registerTeam(f.db,USER,event.id,{name:'Invitation Team',participantIds:[USER]},now);let value=tournament(f.db,event.id),team=teamByName(value,'Invitation Team');Circuit.inviteBot(f.db,USER,event.id,{teamId:team.id,botId:'bot_0050'},now);value=tournament(f.db,event.id);assert.equal(teamByName(value,'Invitation Team').participants.some(participant=>participant.id==='bot_0050'),false,'Low competitiveness/socialness and poor form decline');
   Circuit.inviteBot(f.db,USER,event.id,{teamId:team.id,botId:'bot_0049'},now);value=tournament(f.db,event.id);assert.equal(teamByName(value,'Invitation Team').participants.some(participant=>participant.id==='bot_0049'),true,'Strong persistent participation traits accept');const accepted=clone(value.invites),eventCount=f.db.prepare('SELECT count(*) AS n FROM structured_events').get().n;Circuit.inviteBot(f.db,USER,event.id,{teamId:team.id,botId:'bot_0049'},now+1);assert.deepEqual(tournament(f.db,event.id).invites,accepted);assert.equal(f.db.prepare('SELECT count(*) AS n FROM structured_events').get().n,eventCount);assert.equal(accepted.find(invite=>invite.botId==='bot_0050').state,'DECLINED');assert.equal(accepted.find(invite=>invite.botId==='bot_0049').state,'ACCEPTED');
   Circuit.registerTeam(f.db,USER,event.id,{name:'Other Invitation Team',participantIds:['bot_0048']},now);const other=teamByName(tournament(f.db,event.id),'Other Invitation Team');try{Circuit.inviteBot(f.db,USER,event.id,{teamId:other.id,botId:'bot_0049'},now);}catch(error){assert.ok([400,409].includes(error.status),'Only an explicit invalid/conflicting commitment can reject an invitation');}value=tournament(f.db,event.id);assert.equal(value.teams.flatMap(item=>item.participants).filter(participant=>participant.id==='bot_0049').length,1);assert.throws(()=>Circuit.startTournament(f.db,USER,event.id,now));assertIsolation(f);
  }finally{f.close();}
 });
 await check('A complete official championship uses QF/SF BO3, Final BO5 and exact individual payouts with replay/restart safety',()=>{
  const f=fixture();try{const event=schedule(f)[0],now=event.startsAt;fillTeams(f.db,event.id,now);Circuit.startTournament(f.db,USER,event.id,now);const initial=tournament(f.db,event.id);assert.equal(initial.series.filter(series=>series.round==='QF').length,4);assert.equal(initial.series.filter(series=>series.round==='SF').length,2);assert.equal(initial.series.filter(series=>series.round==='FINAL').length,1);for(const series of initial.series)assert.equal(series.bestOf,series.round==='FINAL'?5:3);
   const {value,replay}=complete(f.db,event.id,now),placements=placementRows(value);assert.equal(placements.length,8);assert.deepEqual(placements.map(row=>row.placement).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);assert.equal(new Set(placements.map(row=>row.teamId)).size,8);for(const series of value.series){assert.equal(series.games.length,series.round==='FINAL'?3:2);assert.equal(Math.max(...series.wins),series.round==='FINAL'?3:2);}
   const final=value.series.find(series=>series.round==='FINAL'),seedOf=id=>value.teams.find(team=>team.id===id).seed,losers=round=>value.series.filter(series=>series.round===round).map(series=>series.teamIds.find(id=>id!==series.winnerTeamId)).sort((a,b)=>seedOf(a)-seedOf(b));assert.deepEqual([...placements].sort((a,b)=>a.placement-b.placement).map(row=>row.teamId),[final.winnerTeamId,final.teamIds.find(id=>id!==final.winnerTeamId),...losers('SF'),...losers('QF')],'Equal tournament-only metrics fall back to initial seed');
   const earnings=earningRows(value);assert.equal(earnings.length,40);let total=0;for(const placement of placements){const team=value.teams.find(team=>team.id===placement.teamId),expected=PAYOUTS[placement.placement-1];for(const participant of team.participants){const row=earnings.find(row=>row.participantId===participant.id);assert.ok(row,'Every participant has an individual credit');assert.equal(row.amount,expected);assert.equal(row.kind,participant.kind);total+=row.amount;}}assert.equal(total,667500);assert.equal(earnings.filter(row=>row.participantId===USER&&row.kind==='user').length,1);assert.equal(earnings.filter(row=>row.kind==='bot').length,39);
   const sqlCredits=()=>f.db.prepare('SELECT participant_id AS participantId,kind,amount FROM tournament_earnings WHERE tournament_id=? ORDER BY participant_id').all(event.id).map(row=>clone(row)),expectedCredits=earnings.map(row=>({participantId:row.participantId,kind:row.kind,amount:row.amount})).sort((a,b)=>a.participantId.localeCompare(b.participantId));assert.deepEqual(sqlCredits(),expectedCredits);const eventCount=f.db.prepare('SELECT count(*) AS n FROM structured_events').get().n;
   for(const played of replay)Circuit.recordGame(f.db,USER,event.id,played.seriesId,played.result,now+1000);assert.deepEqual(earningRows(tournament(f.db,event.id)),earnings);assert.equal(f.db.prepare('SELECT count(*) AS n FROM structured_events').get().n,eventCount);f.reopen();assert.deepEqual(placementRows(tournament(f.db,event.id)),placements);assert.deepEqual(earningRows(tournament(f.db,event.id)),earnings);assert.deepEqual(sqlCredits(),expectedCredits);Circuit.recordGame(f.db,USER,event.id,replay[0].seriesId,replay[0].result,now+2000);assert.deepEqual(earningRows(tournament(f.db,event.id)),earnings);assert.deepEqual(sqlCredits(),expectedCredits);assert.equal(f.db.prepare('SELECT count(*) AS n FROM structured_events').get().n,eventCount);assertIsolation(f);
  }finally{f.close();}
 });
 await check('Custom tournaments share the complete bracket while awarding zero and retaining isolated restart-safe history',()=>{
  const f=fixture();try{const now=f.season.startAt+HOUR,event=Circuit.createCustom(f.db,USER,{name:'Fixture Custom Cup',startsAt:now},now);assert.ok(event.id);fillTeams(f.db,event.id,now);Circuit.startTournament(f.db,USER,event.id,now);const {value,replay}=complete(f.db,event.id,now);assert.equal(placementRows(value).length,8);assert.equal(earningRows(value).reduce((sum,row)=>sum+row.amount,0),0);assert.equal(f.db.prepare('SELECT sum(amount) AS total FROM tournament_earnings WHERE tournament_id=?').get(event.id).total,0);const results=clone(value);f.reopen();assert.deepEqual(tournament(f.db,event.id).placements,results.placements);assert.equal(earningRows(tournament(f.db,event.id)).reduce((sum,row)=>sum+row.amount,0),0);Circuit.recordGame(f.db,USER,event.id,replay.at(-1).seriesId,replay.at(-1).result,now+1000);assert.equal(earningRows(tournament(f.db,event.id)).reduce((sum,row)=>sum+row.amount,0),0);assert.equal(f.db.prepare('SELECT sum(amount) AS total FROM tournament_earnings WHERE tournament_id=?').get(event.id).total,0);assertIsolation(f);
  }finally{f.close();}
 });
 await check('Recorded tournament-only game, kill and damage differentials override seed, while fully equal teams use seed deterministically',()=>{
  const f=fixture();try{const now=f.season.startAt+HOUR,event=Circuit.createCustom(f.db,USER,{name:'Tiebreak Fixture Cup',startsAt:now},now);fillTeams(f.db,event.id,now);Circuit.startTournament(f.db,USER,event.id,now);const {value}=complete(f.db,event.id,now,{tiebreak:true}),rows=placementRows(value).sort((a,b)=>a.placement-b.placement),orderedSeeds=rows.map(row=>value.teams.find(team=>team.id===row.teamId).seed);assert.deepEqual(orderedSeeds,[1,2,3,4,8,5,7,6]);
   const ranked=Circuit.rankPlacements(value),rankedValue=Array.isArray(ranked)?{placements:ranked}:ranked?.placements?ranked:{placements:ranked};assert.deepEqual(placementRows(rankedValue).sort((a,b)=>a.placement-b.placement).map(row=>row.teamId),rows.map(row=>row.teamId));assert.equal(value.series.find(series=>series.round==='QF'&&series.teamIds.some(id=>value.teams.find(team=>team.id===id).seed===8)).games.length,3);assertIsolation(f);
  }finally{f.close();}
 });
 fs.writeFileSync(path.join(__dirname,'live-circuit-tournament-results.json'),JSON.stringify({result:'PASS',sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../server/tournaments.cjs'))).digest('hex'),checks},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,fillTeams,resolvedGame,complete,snapshot,placementRows,earningRows,PAYOUTS};
