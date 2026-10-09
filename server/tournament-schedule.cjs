'use strict';

// The owner confirmed this timetable and its policies on October 7, 2026.
const crypto=require('node:crypto');
const DAY=86400000,LEGACY_INTERVAL=3*DAY,SCHEDULE_VERSION='arena-refined-fixed-schedule-v1';
const DRAFT_ROUNDS=Object.freeze({QF:Object.freeze([0,8,16]),SF:Object.freeze([25,33,41]),FINAL:Object.freeze([50,58,66,74,82])});
const ROUND_GAMES=Object.freeze({QF:3,SF:3,FINAL:5});
const formatters=new Map();
function fail(message){throw Object.assign(new Error(message),{code:'TOURNAMENT_SCHEDULE_CONFLICT'});}
// Existing cloud clocks include performance.now() fractions. Preserve those
// exact saved anchor values/IDs; only newly planned wall times are integral.
function timestamp(value,label){if(!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)fail('Invalid '+label);return value;}
function dateParts(at,timezone){
 timestamp(at,'timestamp');
 if(timezone==='EST'){const d=new Date(at-5*3600000);return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),second:d.getUTCSeconds()};}
 if(timezone!=='America/New_York')fail('Choose fixed EST or America/New_York explicitly');
 if(!formatters.has(timezone))formatters.set(timezone,new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 return Object.fromEntries(formatters.get(timezone).formatToParts(at).filter(p=>['year','month','day','hour','minute','second'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
}
function dateKey(parts){return [parts.year,String(parts.month).padStart(2,'0'),String(parts.day).padStart(2,'0')].join('-');}
function addDays(parts,days){const d=new Date(Date.UTC(parts.year,parts.month-1,parts.day+days));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
function wallTimestamp(parts,timezone){
 const {year,month,day,hour=19,minute=30}=parts;
 if(![year,month,day,hour,minute].every(Number.isInteger)||year<1970||year>9998||month<1||month>12||day<1||day>31||hour<0||hour>23||minute<0||minute>59)fail('Invalid scheduled wall time');
 const wall=Date.UTC(year,month-1,day,hour,minute),valid=new Date(wall);
 if(valid.getUTCFullYear()!==year||valid.getUTCMonth()+1!==month||valid.getUTCDate()!==day)fail('Invalid scheduled calendar date');
 const candidates=(timezone==='EST'?[5]:timezone==='America/New_York'?[4,5]:[]).map(offset=>wall+offset*3600000).filter(at=>{const p=dateParts(at,timezone);return p.year===year&&p.month===month&&p.day===day&&p.hour===hour&&p.minute===minute;});
 if(candidates.length!==1)fail(candidates.length?'Ambiguous scheduled wall time':'Scheduled wall time does not exist');
 return candidates[0];
}
function confirmedPolicy(input){
 if(!input||input.confirmed!==true||!Number.isSafeInteger(input.confirmedAt)||input.confirmedAt<=0)fail('The tournament timetable and policies require explicit confirmation');
 if(input.timezone!=='EST'&&input.timezone!=='America/New_York')fail('Choose fixed EST or America/New_York explicitly');
 if(input.checkInInsidePreparation!==true||input.checkInMs!==90000||input.preparationMs!==120000||input.gameplayMs!==300000)fail('Confirm 90-second check-in inside two-minute preparation and the full five-minute game');
 if(!Number.isInteger(input.countdownMs)||input.countdownMs<=0||input.countdownMs>input.preparationMs-input.checkInMs)fail('Countdown must fit the confirmed preparation window');
 for(const field of ['aggregateTiePolicy','noShowReturnPolicy','payoutPolicy'])if(typeof input[field]!=='string'||!input[field].trim()||input[field]==='unresolved')fail('Unresolved tournament '+field);
 const rounds={};let previousEnd=-Infinity;
 for(const [round,count] of Object.entries(ROUND_GAMES)){
  const starts=input.rounds?.[round];if(!Array.isArray(starts)||starts.length!==count)fail('Invalid '+round+' game blocks');
  rounds[round]=starts.map(offset=>{
   if(!Number.isSafeInteger(offset)||offset<0||offset*60000<previousEnd)fail('Overlapping or invalid '+round+' game blocks');
   previousEnd=offset*60000+input.preparationMs+input.gameplayMs;return offset;
  });
  if(input.roundEnds?.[round]!==previousEnd/60000)fail('Confirm the corrected '+round+' overview endpoint');
  Object.freeze(rounds[round]);
 }
 if(rounds.QF[0]!==0)fail('First official block must begin at the event start');
 return Object.freeze({version:SCHEDULE_VERSION,confirmed:true,confirmedAt:input.confirmedAt,timezone:input.timezone,checkInInsidePreparation:true,checkInMs:input.checkInMs,preparationMs:input.preparationMs,gameplayMs:input.gameplayMs,countdownMs:input.countdownMs,rounds:Object.freeze(rounds),roundEnds:Object.freeze({...input.roundEnds}),aggregateTiePolicy:input.aggregateTiePolicy,noShowReturnPolicy:input.noShowReturnPolicy,payoutPolicy:input.payoutPolicy,...(input.missedWindowPolicy?{missedWindowPolicy:input.missedWindowPolicy}:{})});
}
function policySignature(policy){const p=confirmedPolicy(policy);return crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');}
function anchorRecord({id,startsAt,timezone}){
 if(typeof id!=='string'||!id||id.length>160)fail('A stable existing event anchor is required');
 timestamp(startsAt,'existing event anchor');
 return Object.freeze({id,legacyStartsAt:startsAt,wallDate:dateKey(dateParts(startsAt,timezone)),timezone,version:SCHEDULE_VERSION});
}
function validateAnchor(anchor,policy){
 if(!anchor||anchor.version!==SCHEDULE_VERSION||anchor.timezone!==policy.timezone||typeof anchor.id!=='string'||!anchor.id)fail('Missing or incompatible persistent schedule anchor');
 timestamp(anchor.legacyStartsAt,'existing event anchor');
 if(anchor.wallDate!==dateKey(dateParts(anchor.legacyStartsAt,policy.timezone)))fail('Schedule anchor date changed');
 return anchor;
}
function eventIdentity(userId,anchorId,ordinal){return crypto.createHash('sha256').update(userId+':'+SCHEDULE_VERSION+':'+anchorId+':'+ordinal).digest('hex');}
function planRecurrence({userId,anchor,policy:input,rangeStart,rangeEnd,existingEvents=[],now}){
 const policy=confirmedPolicy(input);validateAnchor(anchor,policy);
 if(typeof userId!=='string'||!userId)fail('A schedule owner is required');
 timestamp(rangeStart,'range start');timestamp(rangeEnd,'range end');timestamp(now,'test/server clock');
 if(rangeEnd<=rangeStart||rangeEnd-rangeStart>366*DAY)fail('Schedule planning range must be positive and at most one year');
 const signature=policySignature(policy),first=dateParts(anchor.legacyStartsAt,policy.timezone),start=dateParts(rangeStart,policy.timezone),end=dateParts(rangeEnd,policy.timezone);
 const dayNumber=p=>Date.UTC(p.year,p.month-1,p.day)/DAY,from=Math.max(0,Math.floor((dayNumber(start)-dayNumber(first))/3)-1),through=Math.ceil((dayNumber(end)-dayNumber(first))/3)+1;
 const events=[],conflicts=[],matched=new Set();
 if(!Array.isArray(existingEvents)||new Set(existingEvents.map(e=>e.id)).size!==existingEvents.length)fail('Duplicate existing event identities');
 for(const event of existingEvents){
  if(event.kind!=='official')continue;
  const stored=event.schedule;
  if(stored&&(stored.anchorId!==anchor.id||stored.timezone!==policy.timezone||stored.policySignature!==signature))conflicts.push({code:'INCOMPATIBLE_SCHEDULE_LINEAGE',eventId:event.id});
 }
 for(let ordinal=from;ordinal<=through;ordinal++){
  const startsAt=wallTimestamp({...addDays(first,ordinal*3),hour:19,minute:30},policy.timezone);if(startsAt<rangeStart||startsAt>=rangeEnd)continue;
  const legacyStartsAt=anchor.legacyStartsAt+ordinal*LEGACY_INTERVAL;
  const candidates=existingEvents.filter(e=>e.kind==='official'&&(e.schedule?.anchorId===anchor.id&&e.schedule.ordinal===ordinal||!e.schedule&&e.startsAt===legacyStartsAt));
  if(candidates.length>1){conflicts.push({code:'DUPLICATE_EVENT_ORDINAL',ordinal,eventIds:candidates.map(e=>e.id)});continue;}
  const existing=candidates[0],schedule=Object.freeze({version:SCHEDULE_VERSION,anchorId:anchor.id,ordinal,legacyStartsAt,wallDate:dateKey(dateParts(startsAt,policy.timezone)),timezone:policy.timezone,policySignature:signature});
  if(existing)matched.add(existing.id);
  let action=existing?'KEEP':'CREATE',actualStartsAt=startsAt;
  if(existing&&!['REGISTRATION','ANNOUNCED','UPCOMING'].includes(existing.status)){actualStartsAt=existing.startsAt;action='PRESERVE_HISTORY';}
  else if(existing&&existing.startsAt!==startsAt){
   if(existing.startsAt<=now||startsAt<=now){conflicts.push({code:'LEGACY_EVENT_ALREADY_DUE',eventId:existing.id,ordinal});action='CONFLICT';actualStartsAt=existing.startsAt;}
   else action='RESCHEDULE';
  }
  const id=existing?.id||eventIdentity(userId,anchor.id,ordinal);
  if(!existing&&existingEvents.some(e=>e.kind==='official'&&e.startsAt===startsAt)){conflicts.push({code:'UNRECOGNIZED_EVENT_AT_START',ordinal,startsAt});action='CONFLICT';}
  events.push(Object.freeze({id,startsAt:actualStartsAt,plannedStartsAt:startsAt,kind:'official',action,schedule}));
 }
 for(const event of existingEvents)if(event.kind==='official'&&!matched.has(event.id)&&event.startsAt>=rangeStart&&event.startsAt<rangeEnd&&!event.schedule)conflicts.push({code:'UNRECOGNIZED_OFFICIAL_EVENT',eventId:event.id});
 return {events,conflicts,canApply:conflicts.length===0,anchor,policy};
}
function gameWindows(event,input){
 const policy=confirmedPolicy(input);timestamp(event.startsAt,'event start');
 if(event.kind==='custom'&&event.customTimetable){
  const windows=Object.values(event.scheduling?.games||{}).map(g=>Object.fromEntries(['seriesId','gameId','round','gameNumber','checkInOpenAt','checkInCloseAt','rosterLockDeadlineAt','countdownAt','matchStartAt','latestEndAt'].map(key=>[key,g[key]])));
  for(const s of event.series||[]){
   if(s.winnerTeamId||s.status==='awaiting-tie-policy'||s.teamIds?.length!==2||s.teamIds.some(id=>!id)||s.games.length>=s.requiredGames)continue;
   const gameNumber=s.games.length+1,gameId=s.id+':game'+gameNumber;if(windows.some(w=>w.gameId===gameId))continue;
   const source=s.games.at(-1)||event.series.filter(previous=>previous.round===(s.round==='SF'?'QF':s.round==='FINAL'?'SF':null)&&previous.teamIds.some(id=>s.teamIds.includes(id))).flatMap(previous=>previous.games);
   const checkInOpenAt=Array.isArray(source)?Math.max(event.customPreparationStartsAt??event.startsAt,...source.map(g=>g.completedAt)):source?.completedAt??event.customPreparationStartsAt??event.startsAt;
   const checkInCloseAt=checkInOpenAt+policy.checkInMs,matchStartAt=checkInOpenAt+policy.preparationMs;
   windows.push({seriesId:s.id,gameId,round:s.round,gameNumber,checkInOpenAt,checkInCloseAt,rosterLockDeadlineAt:checkInCloseAt,countdownAt:matchStartAt-policy.countdownMs,matchStartAt,latestEndAt:matchStartAt+policy.gameplayMs});
  }
  return windows;
 }
 if(event.kind!=='official')fail('Custom tournament times must not use the official timetable');
 return Object.entries(policy.rounds).flatMap(([round,offsets])=>offsets.map((offset,index)=>{
  const checkInOpenAt=event.startsAt+offset*60000,checkInCloseAt=checkInOpenAt+policy.checkInMs,matchStartAt=checkInOpenAt+policy.preparationMs;
  return Object.freeze({round,gameNumber:index+1,checkInOpenAt,checkInCloseAt,rosterLockDeadlineAt:checkInCloseAt,countdownAt:matchStartAt-policy.countdownMs,matchStartAt,latestEndAt:matchStartAt+policy.gameplayMs});
 }));
}
function windowState(window,now,record={}){
 timestamp(now,'test/server clock');
 const keys=['checkInOpenAt','checkInCloseAt','rosterLockDeadlineAt','countdownAt','matchStartAt','latestEndAt'];
 keys.forEach(key=>timestamp(window[key],key));
 if(window.checkInOpenAt>=window.checkInCloseAt||window.checkInCloseAt!==window.rosterLockDeadlineAt||window.checkInCloseAt>window.countdownAt||window.countdownAt>=window.matchStartAt||window.matchStartAt>=window.latestEndAt)fail('Invalid game window');
 for(const key of ['rostersLockedAt','readyAt','startedAt','finalizedAt','waitingAt'])if(record[key]!=null){timestamp(record[key],key);if(record[key]>now)fail('Future timestamp in actual '+key+' state');}
 if(record.rostersLockedAt!=null&&record.rostersLockedAt<window.checkInCloseAt)fail('Roster locked before check-in closed');
 if(record.startedAt!=null&&(record.startedAt!==window.matchStartAt||record.readyAt==null||record.readyAt>window.matchStartAt||record.rostersLockedAt==null||record.rostersLockedAt>window.matchStartAt))fail('A game must start ready at its authoritative timestamp');
 if(record.finalizedAt!=null&&(record.startedAt==null||record.finalizedAt<record.startedAt))fail('Unstarted game cannot be finalized');
 if(record.waitingAt!=null&&(record.finalizedAt==null||record.waitingAt<record.finalizedAt))fail('Unfinalized game cannot wait for its successor');
 const clockPhase=now<window.checkInOpenAt?'WAITING_FOR_CHECK_IN':now<window.checkInCloseAt?'CHECK_IN_OPEN':now<window.countdownAt?'ROSTERS_LOCKED':now<window.matchStartAt?'PRE_MATCH_COUNTDOWN':'PLAYING';
 let state=clockPhase,conflict=null;
 if(record.finalizedAt!=null)state=record.waitingAt!=null?'WAITING_FOR_NEXT_SCHEDULED_GAME':'FINALIZED';
 else if(record.error){state='SCHEDULING_CONFLICT';conflict=String(record.error);}
 else if(record.startedAt!=null){state='PLAYING';if(now>=window.latestEndAt)conflict='GAME_OVERRAN_SCHEDULED_WINDOW';}
 else if(now>=window.checkInCloseAt&&record.rostersLockedAt==null){state='CHECK_IN_CLOSED';if(now>=window.matchStartAt)conflict='ROSTER_LOCK_MISSED_GAME_START';}
 else if(now>=window.matchStartAt){
  const preparedInTime=record.readyAt!=null&&record.readyAt<=window.matchStartAt&&record.rostersLockedAt<=window.matchStartAt;
  state=preparedInTime&&now<window.latestEndAt?'SCHEDULED_START_PENDING':'SCHEDULING_CONFLICT';
  if(state==='SCHEDULING_CONFLICT')conflict=preparedInTime?'GAME_START_WINDOW_ELAPSED':'PREPARATION_MISSED_GAME_START';
 }
 else if(now>=window.countdownAt&&record.readyAt==null)state='ROSTERS_LOCKED';
 const nextTransitionAt=keys.map(key=>window[key]).find(at=>at>now)??null;
 return Object.freeze({state,clockPhase,nextTransitionAt,conflict,requiresRosterLock:now>=window.checkInCloseAt&&record.rostersLockedAt==null&&record.finalizedAt==null&&!record.error,canBeginCountdown:now>=window.countdownAt&&now<window.matchStartAt&&record.rostersLockedAt!=null&&record.readyAt!=null&&record.finalizedAt==null&&!record.error,canStart:now>=window.matchStartAt&&now<window.latestEndAt&&record.rostersLockedAt!=null&&record.rostersLockedAt<=window.matchStartAt&&record.readyAt!=null&&record.readyAt<=window.matchStartAt&&record.startedAt==null&&record.finalizedAt==null&&!record.error});
}
const APPROVED_POLICY=confirmedPolicy({confirmed:true,confirmedAt:Date.UTC(2026,9,7),timezone:'America/New_York',checkInInsidePreparation:true,checkInMs:90000,preparationMs:120000,gameplayMs:300000,countdownMs:3000,rounds:DRAFT_ROUNDS,roundEnds:{QF:23,SF:48,FINAL:89},aggregateTiePolicy:'total-team-damage-then-hold',noShowReturnPolicy:'permanent-for-event',payoutPolicy:'replacement-slot-owner',missedWindowPolicy:'cancel-event-without-rewards'});
module.exports={SCHEDULE_VERSION,DRAFT_ROUNDS,APPROVED_POLICY,LEGACY_INTERVAL,dateParts,dateKey,wallTimestamp,confirmedPolicy,policySignature,anchorRecord,planRecurrence,gameWindows,windowState};
