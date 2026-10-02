'use strict';
const Circuit=require('./tournaments.cjs'),{engine}=require('../dev/simulate.cjs');
const {readWorld,refreshWorldSeason}=require('./world.cjs');
const runtimes=new WeakMap();
function fillBots(db,userId,t,now){
 const used=new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))),available=db.prepare('SELECT bot_id,name,power FROM bots WHERE user_id=? ORDER BY power DESC,bot_id').all(userId).filter(p=>!used.has(p.bot_id)&&Circuit.decision(db,userId,t,p.bot_id).accepted);
 while(t.teams.length<8&&available.length>=5){const batch=available.splice(0,5);try{t=Circuit.registerTeam(db,userId,t.id,{name:batch[0].name+' Circuit',participantIds:batch.map(p=>p.bot_id)},now);}catch{break;}}return t;
}
function playContext(db,userId,tournamentId,now=Date.now()){
 let t=Circuit.getTournament(db,userId,tournamentId);if(t.status!=='ACTIVE')throw Object.assign(new Error('Tournament is not active'),{status:409});
 const team=t.teams.find(team=>team.participants.some(p=>p.id===userId)),s=t.series.find(s=>!s.winnerTeamId&&s.teamIds.includes(team?.id)&&s.teamIds.every(Boolean));if(!s)throw Object.assign(new Error('Your next series is not ready'),{status:409});
 return {tournamentId:t.id,tournamentKind:t.kind,seriesId:s.id,teamIds:s.teamIds,teams:s.teamIds.map(id=>t.teams.find(team=>team.id===id)),gameId:s.id+':game'+(s.games.length+1),userId,hasPlayer:true};
}
function advance(db,{now=Date.now(),budget=90}={}){
 let rt=runtimes.get(db);if(!rt){rt={games:new Map(),worlds:new Map(),stopped:false};runtimes.set(db,rt);}if(rt.stopped)return;
 for(const [key,e] of rt.games){const row=db.prepare('SELECT deleted_at FROM tournaments WHERE id=?').get(e.tournamentMatch.context.tournamentId);if(!row||row.deleted_at){e.tournamentMatch.status='cancelled';rt.games.delete(key);}}
 for(const row of db.prepare('SELECT user_id FROM worlds').all()){
  let cached=rt.worlds.get(row.user_id);if(!cached||now-cached.at>=30000||now>=cached.save.seasons.current.endAt){const world=refreshWorldSeason(db,row.user_id,now);if(!world)continue;cached={at:now,save:world.save};rt.worlds.set(row.user_id,cached);Circuit.scheduleOfficial(db,row.user_id,cached.save.seasons.current,now);}
  const save=cached.save;
  for(const rowT of db.prepare("SELECT id FROM tournaments WHERE user_id=? AND kind IN ('official','custom') AND starts_at<=? AND deleted_at IS NULL AND status<>'COMPLETED' ORDER BY starts_at").all(row.user_id,now)){
   let t=Circuit.getTournament(db,row.user_id,rowT.id);
   if(t.status!=='ACTIVE'){t=fillBots(db,row.user_id,t,now);if(t.teams.length!==8||t.teams.some(team=>team.participants.length!==5))continue;try{t=Circuit.startTournament(db,row.user_id,t.id,now);}catch{continue;}}
   const s=t.series.find(s=>!s.winnerTeamId&&s.teamIds.every(Boolean)&&!s.teamIds.some(id=>t.teams.find(team=>team.id===id).participants.some(p=>p.kind==='user')));if(!s)continue;
   const key=s.id+':game'+(s.games.length+1);let e=rt.games.get(key);
   if(!e){const seed=engine(),storage={[seed.context.SAR.getSaveInfo().key]:JSON.stringify(save)};e=engine(storage);const state=e.dev.inspect().state;state.matches.forEach(match=>{match.status='ended';});const match=e.context.SAR.startTournamentGame({tournamentId:t.id,seriesId:s.id,teamIds:s.teamIds,teams:s.teamIds.map(id=>t.teams.find(team=>team.id===id)),gameId:key,hasPlayer:false});state.actors=match.participants;e.tournamentMatch=match;rt.games.set(key,e);}
   for(let n=0;n<budget&&e.tournamentMatch.status==='active';n++)e.step(1/30);
   if(e.tournamentMatch.tournamentResult){Circuit.recordGame(db,row.user_id,t.id,s.id,e.tournamentMatch.tournamentResult,now);rt.games.delete(key);}
  }
 }
}
function start(db){let stopped=false,running=false;const tick=()=>{if(stopped||running||!db.isOpen)return;running=true;try{advance(db);}catch(e){console.error('Tournament progression:',e.message);}finally{running=false;}};const timer=setInterval(tick,250);timer.unref();setImmediate(tick);return ()=>{stopped=true;clearInterval(timer);const rt=runtimes.get(db);if(rt){rt.stopped=true;rt.games.clear();}};}
function cancel(db,tournamentId){const rt=runtimes.get(db);let count=0;if(rt)for(const [key,e] of rt.games)if(e.tournamentMatch.context.tournamentId===tournamentId){e.tournamentMatch.status='cancelled';rt.games.delete(key);count++;}return count;}
function activeGames(db){return [...(runtimes.get(db)?.games.values()||[])].map(e=>({tournamentId:e.tournamentMatch.context.tournamentId,status:e.tournamentMatch.status}));}
module.exports={cancel,activeGames,advance,start,fillBots,playContext};
