'use strict';
const crypto=require('node:crypto'),Schedule=require('./tournament-schedule.cjs');
const terminal=new Set(['COMPLETED','CANCELLED']);
const RESERVATION_LEAD_MS=7*60000;
const error=(message,status=409)=>Object.assign(new Error(message),{status});
const copy=value=>JSON.parse(JSON.stringify(value));
const circuit=()=>require('./tournaments.cjs');
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
function metadata(db,id){return JSON.parse(db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(id)?.metadata_json||'{}');}
function saveMetadata(db,id,value,now){const encoded=JSON.stringify(value);if(db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(id)?.metadata_json===encoded)return;db.prepare('UPDATE tournaments SET metadata_json=?,updated_at=? WHERE id=?').run(encoded,now,id);}
function supportedPolicy(input){const p=Schedule.confirmedPolicy(input);if(p.aggregateTiePolicy!=='total-team-damage-then-hold'||p.noShowReturnPolicy!=='permanent-for-event'||p.payoutPolicy!=='replacement-slot-owner'||p.missedWindowPolicy!=='cancel-event-without-rewards')throw error('Unsupported confirmed tournament policy');return p;}
function configureOfficialSchedule(db,userId,{policy,anchor}={},now=Date.now()){
 const persisted=db.prepare('SELECT * FROM tournament_schedule_anchors WHERE user_id=?').get(userId);
 if(persisted)return {anchor:JSON.parse(persisted.anchor_json),policy:supportedPolicy(JSON.parse(persisted.policy_json)),configuredAt:persisted.configured_at};
 const p=supportedPolicy(policy),row=db.prepare("SELECT id,starts_at,metadata_json FROM tournaments WHERE user_id=? AND kind='official' AND deleted_at IS NULL ORDER BY starts_at,id LIMIT 1").get(userId);
 if(!row)throw error('An existing official event is required to preserve the schedule anchor');
 const m=metadata(db,row.id),existing=m.officialSchedule;
 const stable=existing?.anchor||anchor||Schedule.anchorRecord({id:row.id,startsAt:row.starts_at,timezone:p.timezone});
 Schedule.planRecurrence({userId,anchor:stable,policy:p,rangeStart:now,rangeEnd:now+86400000,existingEvents:[],now});
 if(existing&&JSON.stringify(existing.anchor)!==JSON.stringify(stable))throw error('The official schedule anchor cannot change');
 m.officialSchedule={anchor:stable,policy:p,configuredAt:existing?.configuredAt||now};saveMetadata(db,row.id,m,now);
 db.prepare('INSERT INTO tournament_schedule_anchors VALUES(?,?,?,?)').run(userId,JSON.stringify(stable),JSON.stringify(p),m.officialSchedule.configuredAt);return copy(m.officialSchedule);
}
function reconcileOfficial(db,userId,season,now,create){
 const C=circuit(),seasonId=String(season.id||season.number||season.startAt);
 let rows=db.prepare("SELECT * FROM tournaments WHERE user_id=? AND kind='official' AND deleted_at IS NULL ORDER BY starts_at,id").all(userId);
 const preservedAnchor=db.prepare('SELECT * FROM tournament_schedule_anchors WHERE user_id=?').get(userId);
 if(!rows.length&&!preservedAnchor){const at=season.startAt+C.INTERVAL,tournamentId=crypto.createHash('sha256').update(userId+':'+seasonId+':'+at).digest('hex');create(db,userId,{name:require('./tournament-presentation.cjs').OFFICIAL_TITLE,startsAt:at,kind:'official',seasonId},now,tournamentId);rows=db.prepare("SELECT * FROM tournaments WHERE user_id=? AND kind='official' AND deleted_at IS NULL ORDER BY starts_at,id").all(userId);}
 const stored=preservedAnchor?{anchor:JSON.parse(preservedAnchor.anchor_json),policy:JSON.parse(preservedAnchor.policy_json)}:rows.map(r=>JSON.parse(r.metadata_json||'{}').officialSchedule).find(Boolean)||configureOfficialSchedule(db,userId,{policy:Schedule.APPROVED_POLICY},now);
 if(!preservedAnchor)db.prepare('INSERT OR IGNORE INTO tournament_schedule_anchors VALUES(?,?,?,?)').run(userId,JSON.stringify(stored.anchor),JSON.stringify(stored.policy),stored.configuredAt||now);
 const policy=supportedPolicy(stored.policy),anchor=stored.anchor;
 // Old unplayed windows are retained as cancelled records. Their results and
 // registration snapshots are never manufactured or rewritten during update.
 for(const r of rows)if(['REGISTRATION','ANNOUNCED','UPCOMING'].includes(r.status)&&r.starts_at<=now&&!JSON.parse(r.metadata_json||'{}').schedulePolicy){const m=metadata(db,r.id);m.scheduling={...(m.scheduling||{}),cancelledAt:now,cancellationReason:'MISSED_EVENT_WINDOW',reservations:[],conflicts:[]};saveMetadata(db,r.id,m,now);db.prepare("UPDATE tournaments SET status='CANCELLED' WHERE id=?").run(r.id);r.status='CANCELLED';}
 const rangeStart=Math.max(0,season.startAt,preservedAnchor?now:0),rangeEnd=Math.max(season.endAt,now+15*86400000);
 const plan=Schedule.planRecurrence({userId,anchor,policy,rangeStart,rangeEnd,now,existingEvents:rows.map(r=>({id:r.id,startsAt:r.starts_at,status:r.status,kind:r.kind,schedule:JSON.parse(r.metadata_json||'{}').schedule}))});
 if(!plan.canApply){const m=metadata(db,anchor.id);m.scheduleConflicts=plan.conflicts;saveMetadata(db,anchor.id,m,now);throw error('Official schedule reconciliation conflict: '+plan.conflicts.map(c=>c.code).join(', '));}
 for(const event of plan.events){
  if(event.action==='PRESERVE_HISTORY')continue;
  if(event.action==='CREATE')create(db,userId,{name:require('./tournament-presentation.cjs').OFFICIAL_TITLE,startsAt:event.startsAt,kind:'official',seasonId},now,event.id);
  const m=metadata(db,event.id);m.schedule=event.schedule;m.schedulePolicy=policy;m.scheduling||={games:{},reservations:[],conflicts:[]};
  if(event.action==='CREATE'&&event.startsAt<=now){m.scheduling.cancelledAt=now;m.scheduling.cancellationReason='MISSED_EVENT_WINDOW';db.prepare("UPDATE tournaments SET status='CANCELLED' WHERE id=?").run(event.id);}
  db.prepare('UPDATE tournaments SET starts_at=? WHERE id=?').run(event.startsAt,event.id);saveMetadata(db,event.id,m,now);
 }
 return plan.events.map(e=>C.getTournament(db,userId,e.id));
}
function externalReservations(db,userId,excluding){
 const used=new Set();for(const row of db.prepare("SELECT id,status,bracket_json,metadata_json FROM tournaments WHERE user_id=? AND id<>? AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')").all(userId,excluding)){
  const m=JSON.parse(row.metadata_json||'{}');for(const id of m.scheduling?.reservations||[])used.add(id);
  if(row.status==='ACTIVE')for(const t of JSON.parse(row.bracket_json||'{}').teams||[])for(const p of t.participants||[])used.add(p.id);
 }return used;
}
function availableBots(db,userId,t){
 const used=new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))),reserved=externalReservations(db,userId,t.id),owned=new Set(t.scheduling?.reservations||[]);
 // Invitation willingness remains a personality decision. Filling vacant event
 // slots uses eligible real identities, not that optional social threshold.
 return db.prepare('SELECT b.bot_id,b.name,b.power,COUNT(t.id) appearances FROM bots b LEFT JOIN tournament_registrations r ON r.participant_id=b.bot_id LEFT JOIN tournaments t ON t.id=r.tournament_id AND t.user_id=b.user_id WHERE b.user_id=? GROUP BY b.bot_id ORDER BY appearances,b.bot_id').all(userId).filter(b=>!used.has(b.bot_id)&&!reserved.has(b.bot_id)).sort((a,b)=>Number(owned.has(b.bot_id))-Number(owned.has(a.bot_id))).map(b=>({id:b.bot_id,name:b.name,power:b.power,kind:'bot'}));
}
function prepareReservations(db,userId,eventId,now=Date.now()) {return transaction(db,()=>{
 const t=circuit().getTournament(db,userId,eventId);if(terminal.has(t.status)||now<t.startsAt-RESERVATION_LEAD_MS)return t;
 const m=metadata(db,t.id),state=m.scheduling||={games:{},reservations:[],conflicts:[]},bots=t.teams.flatMap(team=>team.participants.filter(p=>p.kind==='bot').map(p=>p.id)),external=externalReservations(db,userId,t.id);
 if(bots.some(id=>external.has(id)))state.conflicts=[{code:'BOT_RESERVATION_CONFLICT',at:now}];
 else{
  const candidates=availableBots(db,userId,t),needed=40-bots.length;
  if(candidates.length<needed)state.conflicts=[{code:'ROSTER_ALLOCATION_CONFLICT',message:'Insufficient uncommitted persistent bots for roster and no-show cover',at:now}];
  else{state.standbyReservations=candidates.slice(0,needed).map(p=>p.id);state.reservations=[...bots,...state.standbyReservations];state.reservedAt??=now;state.reservationLeadMs=RESERVATION_LEAD_MS;state.conflicts=[];}
 }
 saveMetadata(db,t.id,m,now);return circuit().getTournament(db,userId,t.id);
});}
function saveTeams(db,t,now){const row=db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(t.id),state=JSON.parse(row.bracket_json||'{}');Object.assign(state,{teams:t.teams,replacementHistory:t.replacementHistory||[]});db.prepare('UPDATE tournaments SET bracket_json=?,updated_at=? WHERE id=?').run(JSON.stringify(state),now,t.id);}
function completeTeams(db,userId,eventId,now){return transaction(db,()=>{
 const t=circuit().getTournament(db,userId,eventId);if(t.status==='ACTIVE'||terminal.has(t.status))return t;
 if(t.teams.length>8||t.teams.some(team=>team.participants.length>5)||new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size!==t.teams.reduce((sum,team)=>sum+team.participants.length,0))throw error('Invalid tournament roster');
 const available=availableBots(db,userId,t),needed=40-t.teams.reduce((sum,team)=>sum+team.participants.length,0),created=new Set();if(available.length<needed)throw error('Insufficient eligible persistent bots for eight teams');
 while(t.teams.length<8){const team={id:crypto.randomUUID(),seed:t.teams.length+1,name:'Challenge Team '+(t.teams.length+1),participants:[]};created.add(team.id);t.teams.push(team);db.prepare('INSERT INTO tournament_teams(id,tournament_id,name,seed) VALUES(?,?,?,?)').run(team.id,t.id,team.name,team.seed);}
 for(const team of t.teams)while(team.participants.length<5){const p=available.shift();team.participants.push(p);db.prepare('INSERT INTO tournament_registrations(tournament_id,team_id,participant_id,kind) VALUES(?,?,?,?)').run(t.id,team.id,p.id,p.kind);}
 for(const team of t.teams)if(created.has(team.id)){team.name=team.participants[0].name+' Challenge';db.prepare('UPDATE tournament_teams SET name=? WHERE id=?').run(team.name,team.id);}
 saveTeams(db,t,now);const m=metadata(db,t.id);if(m.scheduling){const roster=new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id)));m.scheduling.standbyReservations=(m.scheduling.standbyReservations||[]).filter(id=>!roster.has(id));saveMetadata(db,t.id,m,now);}return circuit().getTournament(db,userId,t.id);
});}
function gameRoster(t,series,gameId){const game=t.scheduling?.games?.[gameId];if(t.schedulePolicy){if(!game?.teams)throw error('Scheduled game rosters have not locked');return copy(game.teams);}return series.teamIds.map(id=>copy(t.teams.find(team=>team.id===id)));}
function advanceCustom(db,userId,eventId,now=Date.now()){
 let t=circuit().getTournament(db,userId,eventId);if(t.kind!=='custom'||terminal.has(t.status))return t;
 t=prepareReservations(db,userId,eventId,now);if(now<t.startsAt)return t;
 if(!t.schedulePolicy&&t.status!=='ACTIVE'){
  const m=metadata(db,t.id);m.schedulePolicy=Schedule.APPROVED_POLICY;m.customTimetable=true;m.customPreparationStartsAt=now;
  m.scheduling||={games:{},reservations:[],conflicts:[]};saveMetadata(db,t.id,m,now);
 }
 return advanceScheduled(db,userId,eventId,now);
}
function advanceScheduled(db,userId,eventId,now=Date.now()){
 let t=circuit().getTournament(db,userId,eventId);if(!t.schedulePolicy||terminal.has(t.status))return t;supportedPolicy(t.schedulePolicy);
 t=prepareReservations(db,userId,eventId,now);
 if(now<t.startsAt)return t;
 if(t.status!=='ACTIVE'){
  if(now>=(t.customPreparationStartsAt??t.startsAt)+t.schedulePolicy.preparationMs){return transaction(db,()=>{const m=metadata(db,t.id);m.scheduling={...(m.scheduling||{}),cancelledAt:now,cancellationReason:'MISSED_EVENT_WINDOW',reservations:[],standbyReservations:[]};saveMetadata(db,t.id,m,now);db.prepare("UPDATE tournaments SET status='CANCELLED' WHERE id=?").run(t.id);return circuit().getTournament(db,userId,t.id);});}
  try{completeTeams(db,userId,t.id,now);t=circuit().startTournament(db,userId,t.id,now);}catch(e){const m=metadata(db,t.id);m.scheduling={...(m.scheduling||{}),conflicts:[{code:'ROSTER_ALLOCATION_CONFLICT',message:e.message,at:now}]};saveMetadata(db,t.id,m,now);return circuit().getTournament(db,userId,t.id);}
 }
 return transaction(db,()=>{
  t=circuit().getTournament(db,userId,eventId);const m=metadata(db,t.id),state=m.scheduling||={games:{},reservations:[],conflicts:[]};state.games||={};state.conflicts=[];
  const windows=Schedule.gameWindows(t,t.schedulePolicy),external=externalReservations(db,userId,t.id);
  state.reservations=[...new Set([...t.teams.flatMap(team=>team.participants.filter(p=>p.kind==='bot').map(p=>p.id)),...(state.standbyReservations||[])])];
  if(state.reservations.some(id=>external.has(id))){state.conflicts.push({code:'BOT_RESERVATION_CONFLICT',at:now});saveMetadata(db,t.id,m,now);return circuit().getTournament(db,userId,t.id);}
  for(const s of t.series.filter(s=>circuit().canPlaySeries(s,t))){
   const gameNumber=s.games.length+1,gameId=s.id+':game'+gameNumber,window=windows.find(w=>(!w.seriesId||w.seriesId===s.id)&&w.round===s.round&&w.gameNumber===gameNumber);if(!window)continue;
   const game=state.games[gameId]||={gameId,seriesId:s.id,round:s.round,gameNumber,...window,checkIns:{},replacements:[]};
   if(now>=game.latestEndAt&&(game.error||game.startedAt&&(!game.lease||game.lease.expiresAt<now))){game.error||='PLAYER_OR_RUNTIME_CONNECTION_LOST';state.cancelledAt=now;state.cancellationReason=game.error;break;}
   if(game.startedAt&&now>=game.latestEndAt&&state.lastAdvancedAt!=null&&now-state.lastAdvancedAt>60000){game.error='MISSED_GAME_WINDOW_DURING_OUTAGE';state.cancelledAt=now;state.cancellationReason=game.error;break;}
   if(now<game.checkInCloseAt)continue;
   if(!game.rostersLockedAt){
    if(now>=game.matchStartAt){game.error='MISSED_ROSTER_LOCK_DEADLINE';state.cancelledAt=now;state.cancellationReason=game.error;break;}
    const absent=s.teamIds.flatMap(id=>t.teams.find(team=>team.id===id).participants.filter(p=>p.kind==='user'&&!game.checkIns[p.id]).map(p=>({teamId:id,p})));
    const available=availableBots(db,userId,t);if(available.length<absent.length){game.error='INSUFFICIENT_ELIGIBLE_REPLACEMENTS';state.conflicts.push({code:game.error,gameId,at:now});continue;}
    for(const {teamId,p} of absent){const team=t.teams.find(team=>team.id===teamId),index=team.participants.findIndex(value=>value.id===p.id),replacement=available.shift(),change={gameId,round:s.round,gameNumber,teamId,slot:index,previous:copy(p),replacement:copy(replacement),at:now,reason:'NO_SHOW',returnPolicy:t.schedulePolicy.noShowReturnPolicy,payoutOwnerId:replacement.id};team.participants[index]=replacement;state.standbyReservations=(state.standbyReservations||[]).filter(id=>id!==replacement.id);t.replacementHistory||=[];t.replacementHistory.push(change);game.replacements.push(change);db.prepare('DELETE FROM tournament_registrations WHERE tournament_id=? AND participant_id=?').run(t.id,p.id);db.prepare('INSERT INTO tournament_registrations(tournament_id,team_id,participant_id,kind) VALUES(?,?,?,?)').run(t.id,teamId,replacement.id,replacement.kind);}
    game.teams=s.teamIds.map(id=>copy(t.teams.find(team=>team.id===id)));game.rostersLockedAt=now;saveTeams(db,t,now);
   }
   if(now>=game.matchStartAt&&!game.startedAt&&(!game.readyAt||game.readyAt>game.matchStartAt)){game.error='MISSED_PREPARATION_DEADLINE';state.cancelledAt=now;state.cancellationReason=game.error;break;}
   if(now>=game.latestEndAt&&!game.startedAt){game.error='MISSED_GAME_WINDOW';state.cancelledAt=now;state.cancellationReason=game.error;break;}
  }
  state.reservations=state.cancelledAt?[]:[...new Set([...t.teams.flatMap(team=>team.participants.filter(p=>p.kind==='bot').map(p=>p.id)),...(state.standbyReservations||[])])];if(state.cancelledAt)state.standbyReservations=[];state.lastAdvancedAt=now;
  if(state.cancelledAt)db.prepare("UPDATE tournaments SET status='CANCELLED' WHERE id=?").run(t.id);
  saveMetadata(db,t.id,m,now);return circuit().getTournament(db,userId,t.id);
 });
}
function mutateGame(db,userId,eventId,gameId,now,fn){return transaction(db,()=>{const t=circuit().getTournament(db,userId,eventId);if(!t.schedulePolicy||t.status!=='ACTIVE')throw error('No active scheduled tournament');const m=metadata(db,eventId),g=m.scheduling?.games?.[gameId];if(!g)throw error('Scheduled game is not available');const value=fn(g,t,m);saveMetadata(db,eventId,m,now);return value??circuit().getTournament(db,userId,eventId);});}
function checkIn(db,userId,eventId,{gameId},now=Date.now()){
 advanceScheduled(db,userId,eventId,now);return mutateGame(db,userId,eventId,gameId,now,(g,t)=>{const s=t.series.find(s=>s.id===g.seriesId);if(!s.teamIds.some(id=>t.teams.find(team=>team.id===id).participants.some(p=>p.id===userId&&p.kind==='user')))throw error('Your account does not occupy this game',403);if(g.checkIns[userId])return;if(now<g.checkInOpenAt||now>=g.checkInCloseAt)throw error('Check-in is closed');g.checkIns[userId]={at:now};});
}
function markScheduledPrepared(db,userId,eventId,gameId,now=Date.now()) {return mutateGame(db,userId,eventId,gameId,now,g=>{if(g.finalizedAt||g.error||!g.rostersLockedAt||now>=g.matchStartAt)throw error('Game preparation missed its deadline');g.readyAt??=now;});}
function claimScheduledGame(db,userId,eventId,gameId,{owner,clientId,ttlMs=15000,resume=false}={},now=Date.now()) {return mutateGame(db,userId,eventId,gameId,now,(g,t)=>{
 if(g.error||g.finalizedAt||!g.teams)throw error('Scheduled game rosters have not locked');const human=g.teams.some(team=>team.participants.some(p=>p.kind==='user'));
 if(owner!==(human?'client:'+userId:'server'))throw error('Game lease owner does not match its locked roster',403);
 if(human&&(typeof clientId!=='string'||clientId.length<8||clientId.length>100))throw error('A stable client identity is required');
 if(g.lease&&g.lease.expiresAt>now){if(g.lease.owner!==owner||human&&g.lease.clientId!==clientId)throw error('Another client owns this game');g.lease.expiresAt=now+Math.max(5000,Math.min(60000,ttlMs));g.lease.lastHeartbeatAt=now;return copy(g);}
 if(g.startedAt&&human&&!resume)throw error('A running player match requires its saved checkpoint to resume');
 g.lease={owner,...(human?{clientId}:{}),token:crypto.randomUUID(),claimedAt:now,expiresAt:now+Math.max(5000,Math.min(60000,ttlMs))};return copy(g);
 });}
function renewScheduledGame(db,userId,eventId,gameId,token,now=Date.now()){return mutateGame(db,userId,eventId,gameId,now,g=>{if(g.finalizedAt||g.error||g.lease?.token!==token||g.lease.expiresAt<now)throw error('Game lease expired');g.lease.expiresAt=now+15000;g.lease.lastHeartbeatAt=now;return copy(g);});}
function markScheduledStarted(db,userId,eventId,gameId,token,now=Date.now()){return mutateGame(db,userId,eventId,gameId,now,g=>{if(g.finalizedAt||g.error||g.lease?.token!==token||g.lease.expiresAt<now||!g.readyAt||g.readyAt>g.matchStartAt||now<g.matchStartAt||now>=g.latestEndAt)throw error('Scheduled game cannot start');g.startedAt??=g.matchStartAt;return copy(g);});}
function markScheduledError(db,userId,eventId,gameId,message,now=Date.now()){return mutateGame(db,userId,eventId,gameId,now,g=>{if(g.finalizedAt)return;g.error=String(message||'GAME_PREPARATION_FAILED').slice(0,300);g.errorAt=now;return copy(g);});}
module.exports={RESERVATION_LEAD_MS,prepareReservations,completeTeams,externalReservations,configureOfficialSchedule,reconcileOfficial,advanceCustom,advanceScheduled,checkIn,gameRoster,markScheduledPrepared,claimScheduledGame,renewScheduledGame,markScheduledStarted,markScheduledError,metadata,saveMetadata,supportedPolicy};
