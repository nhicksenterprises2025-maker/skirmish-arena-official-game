'use strict';
const crypto=require('node:crypto');
const INTERVAL=72*3600000, PAYOUTS=[50000,35000,20000,12500,7500,5000,2500,1000];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const decode=text=>JSON.parse(text||'{}');
const id=()=>crypto.randomUUID();
const transact=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
function getTournament(db,userId,tournamentId){
 const row=db.prepare('SELECT * FROM tournaments WHERE user_id=? AND id=?').get(userId,tournamentId);if(!row)throw error('Tournament not found',404);if(row.deleted_at)throw error('Custom tournament was deleted',410);
 const state=decode(row.bracket_json);
 return {id:row.id,canDelete:row.kind==='custom',creatorId:row.user_id,name:row.name,kind:row.kind,seasonId:row.season_id,startsAt:row.starts_at,status:row.status,createdAt:row.created_at,...state,teams:state.teams||[],series:state.series||[],placements:state.placements||[],earnings:state.earnings||[],invites:state.invites||[]};
}
function put(db,value,now){db.prepare('UPDATE tournaments SET status=?,bracket_json=?,updated_at=? WHERE id=?').run(value.status,JSON.stringify({teams:value.teams,series:value.series,placements:value.placements,earnings:value.earnings,invites:value.invites}),now,value.id);return value;}
function create(db,userId,{name,startsAt,kind,seasonId=null},now,tournamentId=id()){
 db.prepare('INSERT OR IGNORE INTO tournaments(id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at,kind,season_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(tournamentId,userId,name,startsAt,'REGISTRATION','{}','{}',now,now,kind,seasonId);
 return getTournament(db,userId,tournamentId);
}
function scheduleOfficial(db,userId,season,now=Date.now()){
 const events=[],seasonId=String(season.id||season.number||season.startAt);
 for(let at=season.startAt+INTERVAL;at<season.endAt;at+=INTERVAL){const tournamentId=crypto.createHash('sha256').update(userId+':'+seasonId+':'+at).digest('hex');events.push(create(db,userId,{name:'Live Circuit '+new Date(at).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'}),startsAt:at,kind:'official',seasonId},now,tournamentId));}return events;
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
function commitment(db,userId,participantId,excluding){return db.prepare("SELECT r.tournament_id FROM tournament_registrations r JOIN tournaments t ON t.id=r.tournament_id WHERE t.user_id=? AND r.participant_id=? AND t.status='ACTIVE' AND t.deleted_at IS NULL AND t.id<>?").get(userId,participantId,excluding);}
function decision(db,userId,tournament,botId){
 const row=db.prepare('SELECT b.form,b.personality_json,p.personality_json AS social FROM bots b LEFT JOIN bot_social_profiles p ON p.user_id=b.user_id AND p.bot_id=b.bot_id WHERE b.user_id=? AND b.bot_id=?').get(userId,botId);if(!row)throw error('Unknown bot');
 if(commitment(db,userId,botId,tournament.id))return {accepted:false,reason:'Already playing another tournament'};
 const p=decode(row.social||row.personality_json),s=p.social||p,score=(Number(s.competitiveness)||0)*.5+(Number(s.socialness)||0)*.2+(Number(s.ego)||0)*.15+Math.max(0,Math.min(1,(Number(row.form)+10)/20))*.15;
 return {accepted:score>=.37,reason:score>=.37?'Ready to compete':'Passing on this event'};
}
function event(db,userId,t,botId,type,facts,now){db.prepare('INSERT OR IGNORE INTO structured_events(id,user_id,bot_id,type,payload_json,created_at) VALUES(?,?,?,?,?,?)').run(`${userId}:circuit:${t.id}:${type}:${botId}:${facts.seriesId||facts.teamId||''}`,userId,botId,type,JSON.stringify({tournamentId:t.id,name:t.name,kind:t.kind,startsAt:t.startsAt,...facts}),now);}
function registerTeam(db,userId,tournamentId,{name,participantIds},now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);if(!['REGISTRATION','ANNOUNCED','UPCOMING'].includes(t.status)||t.teams.length>=8)throw error('Registration is closed',409);
 const ids=Array.isArray(participantIds)?participantIds:[];name=String(name||'').trim().replace(/[<>]/g,'').slice(0,40);
 if(!name||!ids.length||ids.length>5||new Set(ids).size!==ids.length)throw error('A team needs 1–5 unique participants');
 const booked=new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))),people=ids.map(value=>participant(db,userId,value));
 for(const p of people){if(booked.has(p.id)||commitment(db,userId,p.id,t.id))throw error('Participant is already committed',409);if(p.kind==='bot'&&!decision(db,userId,t,p.id).accepted)throw error(p.name+' declined this event',409);}
 const team={id:id(),seed:t.teams.length+1,name,participants:people};t.teams.push(team);db.prepare('INSERT INTO tournament_teams(id,tournament_id,name,seed) VALUES(?,?,?,?)').run(team.id,t.id,name,team.seed);
 for(const p of people){db.prepare('INSERT INTO tournament_registrations(tournament_id,team_id,participant_id,kind) VALUES(?,?,?,?)').run(t.id,team.id,p.id,p.kind);if(p.kind==='bot')event(db,userId,t,p.id,'TOURNAMENT_ACCEPT',{teamId:team.id,teamName:team.name},now);}return put(db,t,now);
 });
}
function inviteBot(db,userId,tournamentId,{teamId,botId},now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId),team=t.teams.find(team=>team.id===teamId);if(!team||!['REGISTRATION','UPCOMING'].includes(t.status)||team.participants.length>=5)throw error('This team cannot accept another invite');
 const known=t.invites.find(value=>value.teamId===teamId&&value.botId===botId);if(known)return t;
 const already=t.teams.some(team=>team.participants.some(p=>p.id===botId)),answer=already?{accepted:false,reason:'Already on a team'}:decision(db,userId,t,botId),state=answer.accepted?'ACCEPTED':'DECLINED';
 const invite={teamId,botId,state,reason:answer.reason,decidedAt:now};t.invites.push(invite);db.prepare('INSERT INTO tournament_invites VALUES(?,?,?,?,?,?)').run(t.id,teamId,botId,state,answer.reason,now);
 if(answer.accepted){const p=participant(db,userId,botId);team.participants.push(p);db.prepare('INSERT INTO tournament_registrations VALUES(?,?,?,?)').run(t.id,teamId,botId,'bot');}
 event(db,userId,t,botId,answer.accepted?'TOURNAMENT_ACCEPT':'TOURNAMENT_DECLINE',{teamId,teamName:team.name,reason:answer.reason},now);return put(db,t,now);
 });
}
function startTournament(db,userId,tournamentId,now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);if(t.status==='ACTIVE'||t.status==='COMPLETED')return t;
 if(now<t.startsAt)throw error('The tournament has not reached its start time');
 if(t.teams.length!==8||t.teams.some(team=>team.participants.length!==5)||new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size!==40)throw error('Eight complete teams of five are required');
 for(const p of t.teams.flatMap(team=>team.participants))if(commitment(db,userId,p.id,t.id))throw error('Participant has another active tournament',409);
 const bySeed=seed=>t.teams.find(team=>team.seed===seed).id,mk=(round,index,bestOf,teamIds)=>({id:t.id+':'+round+index,round,bestOf,teamIds,wins:[0,0],games:[],winnerTeamId:null});
 t.series=[[1,8],[4,5],[2,7],[3,6]].map((pair,i)=>mk('QF',i,3,pair.map(bySeed)));t.series.push(mk('SF',0,3,[null,null]),mk('SF',1,3,[null,null]),mk('FINAL',0,5,[null,null]));t.status='ACTIVE';
 for(const s of t.series)db.prepare('INSERT INTO tournament_series VALUES(?,?,?,?,?)').run(s.id,t.id,s.round,s.bestOf,JSON.stringify(s));
 for(const team of t.teams)for(const p of team.participants)if(p.kind==='bot')event(db,userId,t,p.id,'TOURNAMENT_BRACKET',{teamId:team.id,teamName:team.name,seed:team.seed},now);return put(db,t,now);
 });
}
function metrics(t,teamId){let games=0,kills=0,damage=0;for(const s of t.series.filter(s=>s.teamIds.includes(teamId)))for(const g of s.games){games+=g.winnerTeamId===teamId?1:-1;const ours=new Set(t.teams.find(team=>team.id===teamId).participants.map(p=>p.id));for(const p of g.stats){const sign=ours.has(p.participantId)?1:-1;kills+=sign*p.kills;damage+=sign*p.damage;}}return {games,kills,damage,seed:t.teams.find(team=>team.id===teamId).seed};}
function rankPlacements(t){const final=t.series.find(s=>s.round==='FINAL');if(!final?.winnerTeamId)return [];const ranked=[final.winnerTeamId,final.teamIds.find(value=>value!==final.winnerTeamId)];for(const round of ['SF','QF']){const losers=t.series.filter(s=>s.round===round).map(s=>s.teamIds.find(value=>value!==s.winnerTeamId));losers.sort((a,b)=>{const x=metrics(t,a),y=metrics(t,b);return y.games-x.games||y.kills-x.kills||y.damage-x.damage||x.seed-y.seed;});ranked.push(...losers);}return ranked.map((teamId,i)=>({teamId,placement:i+1,...metrics(t,teamId)}));}
function recordGame(db,userId,tournamentId,seriesId,result,now=Date.now()){
 return transact(db,()=>{const t=getTournament(db,userId,tournamentId);if(db.prepare('SELECT 1 FROM tournament_matches WHERE id=? AND tournament_id=?').get(result.id,t.id))return t;
 const series=t.series.find(s=>s.id===seriesId);if(t.status!=='ACTIVE'||!series||series.winnerTeamId||series.teamIds.some(value=>!value)||!series.teamIds.includes(result.winnerTeamId))throw error('This series cannot accept that result');
 const ids=new Set(series.teamIds.flatMap(teamId=>t.teams.find(team=>team.id===teamId).participants.map(p=>p.id)));
 if(typeof result.id!=='string'||result.id.length>160||!Array.isArray(result.stats)||result.stats.length!==10||new Set(result.stats.map(s=>s.participantId)).size!==10||result.stats.some(s=>!ids.has(s.participantId)))throw error('A resolved game must contain all ten participants');
 if(!Array.isArray(result.score)||result.score.length!==2||result.score.some(n=>!Number.isInteger(n)||n<0)||!Number.isFinite(result.duration)||result.duration<0)throw error('Invalid resolved score');
 for(const s of result.stats)for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])if(!Number.isFinite(s[key])||s[key]<0||s[key]>1e9)throw error('Invalid tournament statistics');
 const game={...result,completedAt:now};series.games.push(game);series.wins[series.teamIds.indexOf(result.winnerTeamId)]++;
 db.prepare('INSERT INTO tournament_matches VALUES(?,?,?,?,?)').run(result.id,t.id,seriesId,JSON.stringify(game),now);
 for(const s of result.stats){const prior=decode(db.prepare('SELECT stats_json FROM tournament_stats WHERE tournament_id=? AND participant_id=?').get(t.id,s.participantId)?.stats_json);prior.games=(prior.games||0)+1;for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])prior[key]=(prior[key]||0)+s[key];prior.weaponStats||={};for(const [weapon,values] of Object.entries(s.weaponStats||{})){prior.weaponStats[weapon]||={};for(const [key,n] of Object.entries(values))if(Number.isFinite(n))prior.weaponStats[weapon][key]=(prior.weaponStats[weapon][key]||0)+n;}db.prepare('INSERT INTO tournament_stats VALUES(?,?,?) ON CONFLICT(tournament_id,participant_id) DO UPDATE SET stats_json=excluded.stats_json').run(t.id,s.participantId,JSON.stringify(prior));}
 if(series.wins.some(n=>n>series.bestOf/2)){
  series.winnerTeamId=result.winnerTeamId;const group=t.series.filter(s=>s.round===series.round),index=group.indexOf(series),next=t.series.filter(s=>s.round===(series.round==='QF'?'SF':'FINAL'))[Math.floor(index/2)];if(series.round!=='FINAL')next.teamIds[index%2]=series.winnerTeamId;
  const loser=t.teams.find(team=>team.id===series.teamIds.find(value=>value!==series.winnerTeamId));for(const p of loser.participants)if(p.kind==='bot')event(db,userId,t,p.id,'TOURNAMENT_ELIMINATION',{seriesId,round:series.round,teamName:loser.name,winnerTeamId:series.winnerTeamId,wins:series.wins},now);
  if(series.round==='SF'){const winner=t.teams.find(team=>team.id===series.winnerTeamId);for(const p of winner.participants)if(p.kind==='bot')event(db,userId,t,p.id,'TOURNAMENT_FINAL',{seriesId,teamName:winner.name},now);}
 }
 for(const s of t.series)db.prepare('UPDATE tournament_series SET state_json=? WHERE id=?').run(JSON.stringify(s),s.id);
 if(t.series.find(s=>s.round==='FINAL').winnerTeamId){t.status='COMPLETED';t.placements=rankPlacements(t);for(const place of t.placements){db.prepare('INSERT INTO tournament_placements VALUES(?,?,?)').run(t.id,place.teamId,place.placement);const team=t.teams.find(team=>team.id===place.teamId);for(const p of team.participants){const amount=t.kind==='official'?PAYOUTS[place.placement-1]:0;t.earnings.push({participantId:p.id,kind:p.kind,amount});db.prepare('INSERT INTO tournament_earnings VALUES(?,?,?,?,?)').run(t.id,p.id,p.kind,amount,now);if(p.kind==='bot')event(db,userId,t,p.id,place.placement===1?'TOURNAMENT_WIN':'TOURNAMENT_PLACEMENT',{teamName:team.name,placement:place.placement,amount},now);}}}
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
  db.prepare("UPDATE ai_jobs SET status='CANCELLED',error='Custom tournament deleted',updated_at=?,completed_at=? WHERE user_id=? AND status IN ('QUEUED','RUNNING') AND (json_extract(request_json,'$.event.tournamentId')=? OR event_id IN (SELECT id FROM structured_events WHERE user_id=? AND json_extract(payload_json,'$.tournamentId')=?))").run(now,now,row.user_id,row.id,row.user_id,row.id);
  db.prepare("UPDATE structured_events SET messaged_at=? WHERE user_id=? AND json_extract(payload_json,'$.tournamentId')=? AND messaged_at IS NULL").run(now,row.user_id,row.id);
  for(const table of ['tournament_invites','tournament_registrations','tournament_participants'])db.prepare('DELETE FROM '+table+' WHERE tournament_id=?').run(row.id);
  return {id:row.id,deleted:true,deletedAt:now};
 });
}
module.exports={deleteCustom,INTERVAL,PAYOUTS,scheduleOfficial,createCustom,getTournament,registerTeam,inviteBot,startTournament,recordGame,rankPlacements,decision};
