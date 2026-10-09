'use strict';

// Read-only projections of the tournament ledger. Runtime checkpoints and
// private metadata are never part of the public response.
const OFFICIAL_TITLE='SKIRMISH CHALLENGE TOURNAMENT';
const AGGREGATE_RULESET='arena-refined-aggregate-kills-v1';
const Schedule=require('./tournament-schedule.cjs');
const fields=['kills','deaths','assists','damage','shots','hits','headshots'];
const number=value=>Number.isFinite(value)&&value>=0?value:null;
const snapshot=people=>(people||[]).map(p=>({id:p.id,name:p.name??null,kind:p.kind??null}));
// Preserve the established legacy map representation supported by
// dev/live-circuit-tournament-check.cjs: placementRows.
function placementRows(t){return Array.isArray(t.placements)?t.placements:Object.entries(t.placements||{}).map(([teamId,placement])=>typeof placement==='object'?{teamId,...placement}:{teamId,placement});}
function displayName(t){return t.kind==='official'&&t.status!=='COMPLETED'&&/^Live Circuit(?: [A-Za-z]{3} \d{1,2})?$/.test(t.name)?OFFICIAL_TITLE:t.name;}
function publicTournament(t){
 const value={...t,displayName:displayName(t)};
 if(t.scheduling)value.scheduling={...t.scheduling,games:Object.fromEntries(Object.entries(t.scheduling.games||{}).map(([id,record])=>{const {lease,...game}=record;return [id,{...game,...(lease?{lease:{owner:lease.owner,expiresAt:lease.expiresAt}}:{})}];}))};
 return value;
}
function ratios(row){return {...row,kd:row.kills===null||row.deaths===null?null:row.deaths?row.kills/row.deaths:row.kills?null:0,zeroDeaths:row.deaths===0&&row.kills>0,accuracy:row.shots===null||row.hits===null?null:row.shots?100*row.hits/row.shots:0};}
function winner(t){
 if(t.status!=='COMPLETED')return null;
 const final=t.series.find(s=>s.round==='FINAL');
 if(t.rulesetId===AGGREGATE_RULESET){
  if(!final||final.games?.length!==5||final.remainingGames!==0||final.advancement?.status!=='decided'||final.status!=='complete'||!final.teamIds?.includes(final.winnerTeamId))return null;
  return final.winnerTeamId;
 }
 // Historical champions come from the recorded decision or recorded placement,
 // never from recalculating old game totals under the current format.
 return final?.winnerTeamId||placementRows(t).find(p=>p.placement===1)?.teamId||null;
}
function history(t,metadata={}){
 const winnerTeamId=winner(t),team=t.teams.find(p=>p.id===winnerTeamId);
 const placements=placementRows(t).map(place=>{const p=t.teams.find(team=>team.id===place.teamId);return {...place,name:p?.name??null,roster:snapshot(p?.participants)};});
 return {tournamentId:t.id,name:t.name,startsAt:t.startsAt,rulesetId:t.rulesetId,winnerTeamId,winnerTeamName:team?.name??null,winningRoster:snapshot(team?.participants),placements,available:!!team,winnerParticipantId:typeof metadata.results?.winnerBotId==='string'?metadata.results.winnerBotId:null};
}
function leaderboards(t,stats,liveGames=[]){
 const recorded=new Map(stats.map(row=>[row.participantId,{...row.stats,liveGames:0}]));
 const recordedGames=new Set(t.series.flatMap(s=>(s.games||[]).map(g=>g.id))),seenLive=new Set();
 liveGames=liveGames.filter(g=>g.tournamentId===t.id&&!recordedGames.has(g.gameId)&&!seenLive.has(g.gameId)&&seenLive.add(g.gameId));
 for(const game of liveGames)for(const p of game.stats||[]){const value=recorded.get(p.participantId)||{games:0,...Object.fromEntries(fields.map(k=>[k,0])),liveGames:0};for(const key of fields)value[key]=number(value[key])===null||number(p[key])===null?null:value[key]+p[key];value.liveGames++;recorded.set(p.participantId,value);}
 const people=t.teams.flatMap(team=>team.participants.map(p=>({p,team})));
 for(const change of t.replacementHistory||[]){const team=t.teams.find(team=>team.id===change.teamId);if(team&&change.previous&&!people.some(row=>row.p.id===change.previous.id))people.push({p:change.previous,team});}
 const playerLeaderboard=people.map(({p,team})=>{
  const value=recorded.get(p.id),row={participantId:p.id,name:p.name??null,kind:p.kind??null,teamId:team.id,teamName:team.name,games:number(value?.games),liveGames:value?.liveGames||0,available:!!value};
  for(const key of fields)row[key]=number(value?.[key]);return ratios(row);
 });
 // A legacy record can contain a resolved participant without a surviving
 // roster snapshot. Preserve the record and show missing identity honestly.
 for(const [participantId,value] of recorded)if(!people.some(({p})=>p.id===participantId)){
  const row={participantId,name:null,kind:null,teamId:null,teamName:null,games:number(value.games),liveGames:value.liveGames||0,available:true};for(const key of fields)row[key]=number(value[key]);playerLeaderboard.push(ratios(row));
 }
 const champion=winner(t),teamLeaderboard=t.teams.map(team=>{
  const series=t.series.filter(s=>s.teamIds?.includes(team.id)),last=series.at(-1),participants=playerLeaderboard.filter(p=>p.teamId===team.id),games=series.reduce((count,s)=>count+(s.games?.length||0),0);
  let aggregateKills=0,known=!participants.some(p=>p.games!==null&&p.games>games)&&!(t.status==='COMPLETED'&&!series.length);
  for(const s of series)for(const game of s.games||[]){const index=(game.teamIds||s.teamIds).indexOf(team.id),kills=(game.teamKills||game.score)?.[index];if(number(kills)===null)known=false;else aggregateKills+=kills;}
  const placement=placementRows(t).find(p=>p.teamId===team.id)?.placement??null;
  const recordedAggregateKills=known?aggregateKills:null,ledgerGames=known?games:null,playing=liveGames.filter(g=>t.series.find(s=>s.id===g.seriesId)?.teamIds?.includes(team.id));
  for(const game of playing){const s=t.series.find(s=>s.id===game.seriesId),kills=game.score?.[s.teamIds.indexOf(team.id)];if(number(kills)===null)known=false;else aggregateKills+=kills;}
  const row={teamId:team.id,name:team.name,roster:snapshot(team.participants),round:last?.round??null,status:champion===team.id?'champion':placement?'placed':last?.status==='awaiting-tie-policy'?'awaiting-tie-policy':last?.winnerTeamId&&last.winnerTeamId!==team.id?'eliminated':t.status==='COMPLETED'?'completed':last?.teamIds?.some(id=>!id)?'waiting-opponents':last?.winnerTeamId?'waiting-next-round':last?'in-progress':'registered',games:ledgerGames,liveGames:playing.length,aggregateKills:known?aggregateKills:null,recordedAggregateKills,placement,available:participants.length>0&&participants.every(p=>p.available)};
  for(const key of fields)row[key]=participants.length&&participants.every(p=>p[key]!==null)?participants.reduce((total,p)=>total+p[key],0):null;
  return ratios(row);
 });
 return {teamLeaderboard,playerLeaderboard};
}
function schedule(t,liveGames=[],metadata={},now=Date.now()){
 const value={status:t.kind==='official'?'unconfirmed':'event-time-only',eventStartsAt:t.startsAt,timezone:null,rounds:[],games:[],seriesGames:[],liveGames:liveGames.filter(g=>g.tournamentId===t.id).map(g=>({seriesId:g.seriesId??t.series.find(s=>g.gameId.startsWith(s.id+':game'))?.id??null,gameId:g.gameId,status:g.status,score:g.score,elapsedMs:g.elapsedMs,countdownRemainingMs:g.countdownRemainingMs??null})),message:t.kind==='official'?'The event date is saved. Fixed round windows and check-in times await confirmation.':'Custom event start time is saved. No fixed round timetable is configured.'};
 if(metadata.invalid){value.status='unavailable';value.message='Saved schedule information is unavailable.';return value;}
 if(!(t.schedulePolicy||metadata.schedule?.policy)||t.kind==='custom'&&!t.customTimetable)return value;
 try{
  // This reads a future explicitly persisted policy only. It does not confirm,
  // save or activate the planner's proposed timetable.
  const policy=Schedule.confirmedPolicy(t.schedulePolicy||metadata.schedule.policy),windows=Schedule.gameWindows(t,policy);
  value.status='confirmed';value.timezone=policy.timezone;value.games=windows.map(w=>({...w}));
  value.rounds=Object.keys(policy.rounds).flatMap(round=>{const group=windows.filter(w=>w.round===round);return group.length?[{round,startsAt:Math.min(...group.map(w=>w.checkInOpenAt)),endsAt:Math.max(...group.map(w=>w.latestEndAt)),...(t.customTimetable?{provisional:true}:{})}]:[];});
  value.seriesGames=t.series.flatMap(s=>windows.filter(w=>(!w.seriesId||w.seriesId===s.id)&&w.round===s.round).map(w=>{
   const gameId=s.id+':game'+w.gameNumber,saved=(s.games||[]).find(g=>g.id===gameId),record=t.scheduling?.games?.[gameId]||metadata.schedule?.gameStates?.[gameId]||{};
   const state=saved?{state:'FINALIZED',conflict:null}:Schedule.windowState(w,now,record);
   const publicConflicts=['GAME_OVERRAN_SCHEDULED_WINDOW','ROSTER_LOCK_MISSED_GAME_START','GAME_START_WINDOW_ELAPSED','PREPARATION_MISSED_GAME_START'];
   return {...w,seriesId:s.id,gameId,state:t.status==='CANCELLED'?'CANCELLED':state.state,checkedIn:!!record.checkIns?.[t.creatorId],rostersLockedAt:record.rostersLockedAt??null,readyAt:record.readyAt??null,startedAt:record.startedAt??null,replacements:record.replacements||[],conflict:state.conflict?(publicConflicts.includes(state.conflict)?state.conflict:'PREPARATION_ERROR'):null};
  }));value.message=t.customTimetable?'Custom games open check-in when their preceding pairing finishes. Future round times are assigned from actual results.':'Saved authoritative round windows.';
 }catch(error){if(error.code!=='TOURNAMENT_SCHEDULE_CONFLICT')throw error;value.status='conflict';value.timezone=null;value.rounds=[];value.games=[];value.seriesGames=[];value.message='Saved tournament timing is inconsistent and requires correction.';}
 return value;
}
function presentation(t,stats,liveGames=[],metadata={},now=Date.now()){return {...leaderboards(t,stats,liveGames),schedule:schedule(t,liveGames,metadata,now),history:history(t,metadata)};}
function stats(db,id){return db.prepare('SELECT participant_id AS participantId,stats_json AS stats FROM tournament_stats WHERE tournament_id=?').all(id).map(row=>({...row,stats:JSON.parse(row.stats)}));}
function metadata(db,id){try{const value=JSON.parse(db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(id)?.metadata_json||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{invalid:true};}catch(error){if(!(error instanceof SyntaxError))throw error;return {invalid:true};}}
function detail(db,t,liveGames=[],now=Date.now()){const rows=stats(db,t.id);return {tournament:publicTournament(t),stats:rows,presentation:presentation(t,rows,liveGames,metadata(db,t.id),now)};}
function officialHistory(db,events){return events.filter(t=>t.kind==='official'&&t.status==='COMPLETED').map(t=>history(t,metadata(db,t.id)));}
module.exports={OFFICIAL_TITLE,displayName,publicTournament,history,leaderboards,schedule,presentation,detail,officialHistory};
