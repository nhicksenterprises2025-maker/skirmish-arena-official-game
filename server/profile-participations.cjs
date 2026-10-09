'use strict';
const Stats=require('../profile-stats.js');

// Read accepted games owned by the authenticated account. Tournament summaries
// remain isolated; no career, reward, ELO, earnings or telemetry is written.
function official(db,userId){
 const rows=db.prepare(`SELECT m.id,m.series_id,m.result_json,m.completed_at,t.id AS tournament_id,t.bracket_json
  FROM tournament_matches m JOIN tournaments t ON t.id=m.tournament_id
  WHERE t.user_id=? AND t.kind='official' AND t.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM json_each(m.result_json,'$.stats') p WHERE json_extract(p.value,'$.participantId')=?)
  ORDER BY m.completed_at,m.id`).all(userId,userId);
 const records=[],summaries=new Map();
 function add(row){
  const game=JSON.parse(row.result_json),state=JSON.parse(row.bracket_json);
  if(game.id!==row.id||!(row.completed_at>0))return;
  const event={id:row.tournament_id,kind:'official',teams:state.teams||[],replacementHistory:state.replacementHistory||[],series:[{id:row.series_id,games:[{...game,completedAt:row.completed_at}]}]};
  records.push(...Stats.officialParticipations([event],userId));
 }
 for(const row of rows)add(row);
 function summary(id,raw){const games=JSON.parse(raw).games;if(Number.isSafeInteger(games)&&games>=0)summaries.set(id,Math.max(summaries.get(id)||0,games));}
 for(const row of db.prepare(`SELECT s.tournament_id,s.stats_json FROM tournament_stats s JOIN tournaments t ON t.id=s.tournament_id
  WHERE t.user_id=? AND t.kind='official' AND t.deleted_at IS NULL AND s.participant_id=?`).all(userId,userId)
 )summary(row.tournament_id,row.stats_json);
 // The explicit one-time tournament reset archives accepted unfinished official
 // games before removing their active graph. They are still completed match
 // contributions, with their exact original IDs and immutable per-player rows.
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tournament_reset_archives'").get()){
  for(const row of db.prepare('SELECT tournament_id,snapshot_json FROM tournament_reset_archives WHERE user_id=?').all(userId)){
   const archived=JSON.parse(row.snapshot_json),event=archived.event;
   if(event?.kind!=='official'||event.user_id!==userId||event.id!==row.tournament_id)continue;
   for(const game of archived.matches||[])if(game.tournament_id===event.id)add({...game,bracket_json:event.bracket_json});
   for(const stat of archived.stats||[])if(stat.participant_id===userId)summary(event.id,stat.stats_json);
  }
 }
 const summarized=[...summaries.values()].reduce((sum,games)=>sum+games,0);
 return {owner:userId,schema:1,source:'accepted-official-tournament-games',records,missingGames:Math.max(0,summarized-new Set(records.map(row=>row.matchId)).size)};
}
module.exports={official};
