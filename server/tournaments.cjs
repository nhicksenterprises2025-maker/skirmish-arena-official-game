'use strict';
const crypto=require('node:crypto');
const Lifecycle=require('./tournament-lifecycle.cjs');
const {OFFICIAL_TITLE}=require('./tournament-presentation.cjs');
const INTERVAL=72*3600000, PAYOUTS=[50000,35000,20000,12500,7500,5000,2500,1000];
const AGGREGATE_RULESET='arena-refined-aggregate-kills-v1',LEGACY_RULESET='legacy-best-of-v1';
const ROUND_GAMES=Object.freeze({QF:3,SF:3,FINAL:5});
function isAggregateSeries(series,tournament){return (series?.rulesetId||tournament?.rulesetId)===AGGREGATE_RULESET;}
function canPlaySeries(series,tournament){
 if(!series||series.winnerTeamId||series.teamIds?.length!==2||series.teamIds.some(value=>!value))return false;
 return !isAggregateSeries(series,tournament)||(series.status!=='awaiting-tie-policy'&&series.games.length<series.requiredGames);
}
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const decode=text=>JSON.parse(text||'{}');
const id=()=>crypto.randomUUID();
const transact=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
function getTournament(db,userId,tournamentId){
 const row=db.prepare('SELECT * FROM tournaments WHERE user_id=? AND id=?').get(userId,tournamentId);if(!row)throw error('Tournament not found',404);if(row.deleted_at)throw error('Custom tournament was deleted',410);
 const state=decode(row.bracket_json),metadata=decode(row.metadata_json);
 return {id:row.id,canDelete:row.kind==='custom',creatorId:row.user_id,name:row.name,kind:row.kind,seasonId:row.season_id,startsAt:row.starts_at,status:row.status,createdAt:row.created_at,...state,...(metadata.schedulePolicy?{schedulePolicy:metadata.schedulePolicy,schedule:metadata.schedule,...(metadata.customTimetable?{customTimetable:true,customPreparationStartsAt:metadata.customPreparationStartsAt}:{} )}:{}),...(metadata.scheduling?{scheduling:metadata.scheduling}:{}),rulesetId:state.rulesetId||LEGACY_RULESET,teams:state.teams||[],series:state.series||[],placements:state.placements||[],earnings:state.earnings||[],invites:state.invites||[]};
}
function put(db,value,now){const previous=decode(db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(value.id)?.bracket_json);db.prepare('UPDATE tournaments SET status=?,bracket_json=?,updated_at=? WHERE id=?').run(value.status,JSON.stringify({...previous,rulesetId:value.rulesetId,tiePolicy:value.tiePolicy,teams:value.teams,series:value.series,placements:value.placements,earnings:value.earnings,invites:value.invites}),now,value.id);return value;}
function create(db,userId,{name,startsAt,kind,seasonId=null},now,tournamentId=id()){
 db.prepare('INSERT OR IGNORE INTO tournaments(id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at,kind,season_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(tournamentId,userId,name,startsAt,'REGISTRATION',JSON.stringify({rulesetId:AGGREGATE_RULESET,tiePolicy:'unresolved'}),'{}',now,now,kind,seasonId);
 return getTournament(db,userId,tournamentId);
}
function scheduleOfficial(db,userId,season,now=Date.now()){
 return Lifecycle.reconcileOfficial(db,userId,season,now,create);
}
function createCustom(db,userId,options,now=Date.now()){
 const name=String(options.name||'').trim().replace(/[<>]/g,'').slice(0,80),startsAt=Number(options.startsAt??now);
 if(!name||!Number.isFinite(startsAt)||startsAt<now-60000||startsAt>now+365*86400000)throw error('Enter a name and a valid start time');
 return create(db,userId,{name,startsAt,kind:'custom'},now);
}
function participant(db,userId,participantId){
 if(participantId===userId)return {id:userId,kind:'user',name:db.prepare('SELECT username FROM users WHERE id=?').get(userId)?.username||'YOU'};
 const row=db.prepare('SELECT name,power,form,personality_json FROM bots WHERE user_id=? AND bot_id=?').get(userId,participantId);if(!row)throw error('Unknown participant');return {id:participantId,kind:'bot',name:row.name,power:row.power};
}
function commitment(db,userId,participantId,excluding){return Lifecycle.externalReservations(db,userId,excluding).has(participantId);}
function decision(db,userId,tournament,botId){
 const row=db.prepare('SELECT b.form,b.personality_json,p.bot_id AS competition_id,p.competitiveness,p.socialness,p.ego FROM bots b LEFT JOIN bot_competition_profiles p ON p.user_id=b.user_id AND p.bot_id=b.bot_id WHERE b.user_id=? AND b.bot_id=?').get(userId,botId);if(!row)throw error('Unknown bot');
 if(commitment(db,userId,botId,tournament.id))return {accepted:false,reason:'Already playing another tournament'};
 const p=decode(row.personality_json),s=row.competition_id?row:p.social||p,score=(Number(s.competitiveness)||0)*.5+(Number(s.socialness)||0)*.2+(Number(s.ego)||0)*.15+Math.max(0,Math.min(1,(Number(row.form)+10)/20))*.15;
 return {accepted:score>=.37,reason:score>=.37?'Ready to compete':'Passing on this event'};
}
function registerTeam(db,userId,tournamentId,{name,participantIds},now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);if(!['REGISTRATION','ANNOUNCED','UPCOMING'].includes(t.status)||t.teams.length>=8)throw error('Registration is closed',409);
 const ids=Array.isArray(participantIds)?participantIds:[];name=String(name||'').trim().replace(/[<>]/g,'').slice(0,40);
 if(!name||!ids.length||ids.length>5||new Set(ids).size!==ids.length)throw error('A team needs 1–5 unique participants');
 const booked=new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))),people=ids.map(value=>participant(db,userId,value));
 for(const p of people){if(booked.has(p.id)||commitment(db,userId,p.id,t.id))throw error('Participant is already committed',409);if(p.kind==='bot'&&!decision(db,userId,t,p.id).accepted)throw error(p.name+' declined this event',409);}
 const team={id:id(),seed:t.teams.length+1,name,participants:people};t.teams.push(team);db.prepare('INSERT INTO tournament_teams(id,tournament_id,name,seed) VALUES(?,?,?,?)').run(team.id,t.id,name,team.seed);
 for(const p of people){db.prepare('INSERT INTO tournament_registrations(tournament_id,team_id,participant_id,kind) VALUES(?,?,?,?)').run(t.id,team.id,p.id,p.kind);}return put(db,t,now);
 });
}
function inviteBot(db,userId,tournamentId,{teamId,botId},now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId),team=t.teams.find(team=>team.id===teamId);if(!team||!['REGISTRATION','UPCOMING'].includes(t.status)||team.participants.length>=5)throw error('This team cannot accept another invite');
 const known=t.invites.find(value=>value.teamId===teamId&&value.botId===botId);if(known)return t;
 const already=t.teams.some(team=>team.participants.some(p=>p.id===botId)),answer=already?{accepted:false,reason:'Already on a team'}:decision(db,userId,t,botId),state=answer.accepted?'ACCEPTED':'DECLINED';
 const invite={teamId,botId,state,reason:answer.reason,decidedAt:now};t.invites.push(invite);db.prepare('INSERT INTO tournament_invites VALUES(?,?,?,?,?,?)').run(t.id,teamId,botId,state,answer.reason,now);
 if(answer.accepted){const p=participant(db,userId,botId);team.participants.push(p);db.prepare('INSERT INTO tournament_registrations VALUES(?,?,?,?)').run(t.id,teamId,botId,'bot');}
 return put(db,t,now);
 });
}
function startTournament(db,userId,tournamentId,now=Date.now()){
 const existing=getTournament(db,userId,tournamentId);if(now>=existing.startsAt&&!['ACTIVE','COMPLETED','CANCELLED'].includes(existing.status))Lifecycle.completeTeams(db,userId,tournamentId,now);
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);if(t.status==='ACTIVE'||t.status==='COMPLETED')return t;
 if(t.status==='CANCELLED')throw error('A cancelled tournament cannot restart',409);
 if(t.series.some(s=>s.games?.length))throw error('A tournament with recorded games cannot restart',409);
 if(now<t.startsAt)throw error('The tournament has not reached its start time');
 if(t.teams.length!==8||t.teams.some(team=>team.participants.length!==5)||new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size!==40)throw error('Eight complete teams of five are required');
 for(const p of t.teams.flatMap(team=>team.participants))if(commitment(db,userId,p.id,t.id))throw error('Participant has another active tournament',409);
 t.rulesetId=AGGREGATE_RULESET;t.tiePolicy=t.schedulePolicy?.aggregateTiePolicy||require('./tournament-schedule.cjs').APPROVED_POLICY.aggregateTiePolicy;
 const bySeed=seed=>t.teams.find(team=>team.seed===seed).id,mk=(round,index,bestOf,teamIds)=>({id:t.id+':'+round+index,round,rulesetId:AGGREGATE_RULESET,requiredGames:ROUND_GAMES[round],bestOf,teamIds,wins:[0,0],games:[],aggregateKills:[0,0],completedGames:0,remainingGames:ROUND_GAMES[round],status:teamIds.every(Boolean)?'in-progress':'waiting-opponents',advancement:{status:'pending',winnerTeamId:null},winnerTeamId:null});
 t.series=[[1,8],[4,5],[2,7],[3,6]].map((pair,i)=>mk('QF',i,3,pair.map(bySeed)));t.series.push(mk('SF',0,3,[null,null]),mk('SF',1,3,[null,null]),mk('FINAL',0,5,[null,null]));t.status='ACTIVE';
 for(const s of t.series)db.prepare('INSERT INTO tournament_series VALUES(?,?,?,?,?)').run(s.id,t.id,s.round,s.bestOf,JSON.stringify(s));
 return put(db,t,now);
 });
}
function metrics(t,teamId){let games=0,kills=0,damage=0;for(const s of t.series.filter(s=>s.teamIds.includes(teamId)))for(const g of s.games){games+=g.winnerTeamId===teamId?1:-1;const ours=new Set((g.teams||t.teams).find(team=>team.id===teamId).participants.map(p=>p.id));for(const p of g.stats){const sign=ours.has(p.participantId)?1:-1;kills+=sign*p.kills;damage+=sign*p.damage;}}return {games,kills,damage,seed:t.teams.find(team=>team.id===teamId).seed};}
function rankPlacements(t){const final=t.series.find(s=>s.round==='FINAL');if(!final?.winnerTeamId)return [];const ranked=[final.winnerTeamId,final.teamIds.find(value=>value!==final.winnerTeamId)];for(const round of ['SF','QF']){const losers=t.series.filter(s=>s.round===round).map(s=>s.teamIds.find(value=>value!==s.winnerTeamId));losers.sort((a,b)=>{const x=metrics(t,a),y=metrics(t,b);return y.games-x.games||y.kills-x.kills||y.damage-x.damage||x.seed-y.seed;});ranked.push(...losers);}return ranked.map((teamId,i)=>({teamId,placement:i+1,...metrics(t,teamId)}));}
function recordGame(db,userId,tournamentId,seriesId,result,now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);
 if(!result||typeof result.id!=='string'||!result.id||result.id.length>160)throw error('Invalid resolved game identity');
 const recorded=db.prepare('SELECT series_id FROM tournament_matches WHERE id=? AND tournament_id=?').get(result.id,t.id);
 if(recorded){if(recorded.series_id!==seriesId)throw error('This result belongs to a different series',409);return t;}
 const series=t.series.find(s=>s.id===seriesId);if(t.status!=='ACTIVE'||!canPlaySeries(series,t)||!series.teamIds.includes(result.winnerTeamId))throw error('This series cannot accept that result',409);
 const aggregate=isAggregateSeries(series,t);
 if(aggregate&&(series.requiredGames!==ROUND_GAMES[series.round]||result.id!==series.id+':game'+(series.games.length+1)))throw error('This result belongs to a different tournament game',409);
 const roster=Lifecycle.gameRoster(t,series,result.id),ids=new Set(roster.flatMap(team=>team.participants.map(p=>p.id)));
 const scheduled=t.scheduling?.games?.[result.id];if(t.schedulePolicy&&(!scheduled?.startedAt||scheduled.finalizedAt))throw error('Scheduled game has not started or is already final',409);
 if(typeof result.id!=='string'||result.id.length>160||!Array.isArray(result.stats)||result.stats.length!==10||new Set(result.stats.map(s=>s.participantId)).size!==10||result.stats.some(s=>!ids.has(s.participantId)))throw error('A resolved game must contain all ten participants');
 if(!Array.isArray(result.score)||result.score.length!==2||result.score.some(n=>!Number.isInteger(n)||n<0)||!Number.isFinite(result.duration)||result.duration<0)throw error('Invalid resolved score');
 for(const s of result.stats)for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])if(!Number.isFinite(s[key])||s[key]<0||s[key]>1e9)throw error('Invalid tournament statistics');
 if(aggregate){
  const measured=series.teamIds.map(teamId=>{const people=new Set(roster.find(team=>team.id===teamId).participants.map(p=>p.id));return result.stats.filter(s=>people.has(s.participantId)).reduce((sum,s)=>sum+s.kills,0);});
  if(result.stats.some(s=>!Number.isInteger(s.kills))||measured.some((kills,index)=>kills!==result.score[index]))throw error('Team kills must match the resolved participant kills');
  const winner=result.score[0]>result.score[1]?0:result.score[1]>result.score[0]?1:null;
  if(winner===null||series.teamIds[winner]!==result.winnerTeamId)throw error('The resolved game winner must match its team kills');
 }
 const game={...result,completedAt:now,...(scheduled?{teams:roster}:{}),...(aggregate?{seriesId:series.id,round:series.round,gameNumber:series.games.length+1,teamIds:[...series.teamIds],teamKills:[...result.score],rulesetId:AGGREGATE_RULESET}:{})};series.games.push(game);series.wins[series.teamIds.indexOf(result.winnerTeamId)]++;
 db.prepare('INSERT INTO tournament_matches VALUES(?,?,?,?,?)').run(result.id,t.id,seriesId,JSON.stringify(game),now);
 for(const s of result.stats){const prior=decode(db.prepare('SELECT stats_json FROM tournament_stats WHERE tournament_id=? AND participant_id=?').get(t.id,s.participantId)?.stats_json);prior.games=(prior.games||0)+1;for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])prior[key]=(prior[key]||0)+s[key];prior.weaponStats||={};for(const [weapon,values] of Object.entries(s.weaponStats||{})){prior.weaponStats[weapon]||={};for(const [key,n] of Object.entries(values))if(Number.isFinite(n))prior.weaponStats[weapon][key]=(prior.weaponStats[weapon][key]||0)+n;}db.prepare('INSERT INTO tournament_stats VALUES(?,?,?) ON CONFLICT(tournament_id,participant_id) DO UPDATE SET stats_json=excluded.stats_json').run(t.id,s.participantId,JSON.stringify(prior));}
 let advancement=null;
 if(aggregate){
  // Recompute from the once-recorded game ledger, never from callback count.
  series.aggregateKills=series.games.reduce((total,g)=>total.map((kills,index)=>kills+g.teamKills[index]),[0,0]);
  series.completedGames=series.games.length;series.remainingGames=series.requiredGames-series.completedGames;
  if(series.remainingGames===0){
   const [a,b]=series.aggregateKills;
   if(a===b){
    const damage=series.teamIds.map(teamId=>series.games.reduce((total,g)=>{const ids=new Set((g.teams||t.teams).find(team=>team.id===teamId).participants.map(p=>p.id));return total+g.stats.filter(p=>ids.has(p.participantId)).reduce((sum,p)=>sum+p.damage,0);},0));
    if(t.tiePolicy==='total-team-damage-then-hold'&&damage[0]!==damage[1]){advancement=series.teamIds[damage[0]>damage[1]?0:1];series.status='complete';series.advancement={status:'decided',criterion:'total-team-damage',winnerTeamId:advancement,aggregateKills:[a,b],aggregateDamage:damage,completedAt:now};}
    else{series.status='awaiting-tie-policy';series.advancement={status:'tied',criterion:t.tiePolicy==='total-team-damage-then-hold'?'explicit-ruling-required':'unresolved',winnerTeamId:null,aggregateKills:[a,b],aggregateDamage:damage,completedAt:now};}
   }
   else{advancement=series.teamIds[a>b?0:1];series.status='complete';series.advancement={status:'decided',criterion:'total-team-kills',winnerTeamId:advancement,aggregateKills:[a,b],completedAt:now};}
  }
 }else if(series.wins.some(n=>n>series.bestOf/2))advancement=result.winnerTeamId;
 if(advancement){
  series.winnerTeamId=advancement;const group=t.series.filter(s=>s.round===series.round),index=group.indexOf(series),next=t.series.filter(s=>s.round===(series.round==='QF'?'SF':'FINAL'))[Math.floor(index/2)];if(series.round!=='FINAL'){next.teamIds[index%2]=series.winnerTeamId;if(isAggregateSeries(next,t))next.status=next.teamIds.every(Boolean)?'in-progress':'waiting-opponents';}
 }
 for(const s of t.series)db.prepare('UPDATE tournament_series SET state_json=? WHERE id=?').run(JSON.stringify(s),s.id);
 if(t.series.find(s=>s.round==='FINAL').winnerTeamId){t.status='COMPLETED';t.placements=rankPlacements(t);for(const place of t.placements){db.prepare('INSERT INTO tournament_placements VALUES(?,?,?)').run(t.id,place.teamId,place.placement);const team=t.teams.find(team=>team.id===place.teamId);for(const p of team.participants){const amount=t.kind==='official'?PAYOUTS[place.placement-1]:0;t.earnings.push({participantId:p.id,kind:p.kind,amount});db.prepare('INSERT INTO tournament_earnings VALUES(?,?,?,?,?)').run(t.id,p.id,p.kind,amount,now);}}}
 if(scheduled){const m=Lifecycle.metadata(db,t.id),g=m.scheduling.games[result.id];g.finalizedAt=now;g.waitingAt=now;delete g.lease;if(t.status==='COMPLETED'){m.scheduling.reservations=[];m.scheduling.standbyReservations=[];}Lifecycle.saveMetadata(db,t.id,m,now);t.scheduling=m.scheduling;}
 return put(db,t,now);
 });
}
function deleteCustom(db,userId,tournamentId,confirmedName,now=Date.now(),authorizedAdmin=false){
 return transact(db,()=>{
  const row=db.prepare('SELECT * FROM tournaments WHERE id=?').get(tournamentId);
  if(!row||row.user_id!==userId&&!authorizedAdmin)throw error('Tournament not found',404);
  if(row.kind!=='custom')throw error('Official tournaments cannot be deleted',403);
  if(confirmedName!==row.name)throw error('Confirm the tournament name before deleting',400);
  if(row.deleted_at)return {id:row.id,deleted:true,deletedAt:row.deleted_at};
  db.prepare('UPDATE tournaments SET deleted_at=?,updated_at=? WHERE id=?').run(now,now,row.id);
  const m=Lifecycle.metadata(db,row.id);if(m.scheduling){m.scheduling.reservations=[];m.scheduling.standbyReservations=[];m.scheduling.cancelledAt=now;m.scheduling.cancellationReason='CUSTOM_EVENT_DELETED';Lifecycle.saveMetadata(db,row.id,m,now);}
  for(const table of ['tournament_invites','tournament_registrations','tournament_participants'])db.prepare('DELETE FROM '+table+' WHERE tournament_id=?').run(row.id);
  return {id:row.id,deleted:true,deletedAt:now};
 });
}
module.exports={deleteCustom,INTERVAL,PAYOUTS,AGGREGATE_RULESET,LEGACY_RULESET,isAggregateSeries,canPlaySeries,scheduleOfficial,createCustom,getTournament,registerTeam,inviteBot,startTournament,recordGame,rankPlacements,decision,...Object.fromEntries(['prepareReservations','completeTeams','configureOfficialSchedule','advanceCustom','advanceScheduled','checkIn','gameRoster','markScheduledPrepared','claimScheduledGame','renewScheduledGame','markScheduledStarted','markScheduledError'].map(key=>[key,Lifecycle[key]]))};
