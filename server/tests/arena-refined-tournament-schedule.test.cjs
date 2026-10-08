'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Schedule=require('../tournament-schedule.cjs');
const DAY=86400000,HOUR=3600000;

// These are hypothetical accepted policies for tests only. Nothing imports
// them into the project scheduler or treats them as the user's confirmation.
function fixturePolicy(extra={}){return Schedule.confirmedPolicy({confirmed:true,confirmedAt:Date.UTC(2026,9,7),timezone:'America/New_York',checkInInsidePreparation:true,checkInMs:90000,preparationMs:120000,gameplayMs:300000,countdownMs:3000,rounds:Schedule.DRAFT_ROUNDS,roundEnds:{QF:23,SF:48,FINAL:89},aggregateTiePolicy:'fixture-announced-policy',noShowReturnPolicy:'fixture-announced-return-policy',payoutPolicy:'fixture-announced-occupant-policy',...extra});}
function recurrence(extra={}){
 const policy=fixturePolicy(),startsAt=Date.UTC(2026,9,3,14),anchor=Schedule.anchorRecord({id:'existing-first-official',startsAt,timezone:policy.timezone});
 return {userId:'fixture-owner',anchor,policy,rangeStart:Date.UTC(2026,9,1),rangeEnd:Date.UTC(2026,10,1),now:Date.UTC(2026,8,30),...extra};
}
function firstWindow(){const policy=fixturePolicy(),event={kind:'official',startsAt:Schedule.wallTimestamp({year:2026,month:10,day:9,hour:19,minute:30},policy.timezone)};return {window:Schedule.gameWindows(event,policy)[0],policy,event};}
function conflict(fn,text){assert.throws(fn,e=>e.code==='TOURNAMENT_SCHEDULE_CONFLICT'&&text.test(e.message));}

test('unconfirmed or incomplete timing/replacement/tie policies cannot activate scheduling',()=>{
 conflict(()=>Schedule.confirmedPolicy(),/explicit confirmation/);
 conflict(()=>Schedule.confirmedPolicy({...fixturePolicy(),confirmed:false}),/explicit confirmation/);
 for(const field of ['aggregateTiePolicy','noShowReturnPolicy','payoutPolicy'])conflict(()=>fixturePolicy({[field]:'unresolved'}),new RegExp(field));
 conflict(()=>fixturePolicy({timezone:'local'}),/fixed EST/);
 conflict(()=>fixturePolicy({checkInInsidePreparation:false}),/90-second/);
 conflict(()=>fixturePolicy({gameplayMs:240000}),/five-minute/);
 conflict(()=>Schedule.planRecurrence({...recurrence(),policy:{}}),/explicit confirmation/);
});
test('contradictory public endpoints and a shortened semifinal are rejected',()=>{
 conflict(()=>fixturePolicy({roundEnds:{QF:20,SF:45,FINAL:90}}),/QF overview/);
 conflict(()=>fixturePolicy({roundEnds:{QF:23,SF:47,FINAL:89}}),/SF overview/);
 conflict(()=>fixturePolicy({rounds:{QF:[0,7,14],SF:[21,28,35],FINAL:[42,49,56,63,69]},roundEnds:{QF:21,SF:42,FINAL:76}}),/Overlapping/);
 conflict(()=>fixturePolicy({countdownMs:31000}),/Countdown/);
});
test('hypothetical corrected timetable retains all eleven full preparation/game blocks',()=>{
 const {event,policy}=firstWindow(),windows=Schedule.gameWindows(event,policy);
 assert.equal(windows.length,11);assert.equal(windows.filter(w=>w.round==='QF').length,3);assert.equal(windows.filter(w=>w.round==='SF').length,3);assert.equal(windows.filter(w=>w.round==='FINAL').length,5);
 for(const w of windows){assert.equal(w.checkInCloseAt-w.checkInOpenAt,90000);assert.equal(w.matchStartAt-w.checkInOpenAt,120000);assert.equal(w.latestEndAt-w.matchStartAt,300000);assert.equal(w.matchStartAt-w.countdownAt,3000);assert.equal(w.rosterLockDeadlineAt,w.checkInCloseAt);}
 for(const [round,time] of [['QF','19:53'],['SF','20:18'],['FINAL','20:59']]){const w=windows.filter(w=>w.round===round).at(-1),p=Schedule.dateParts(w.latestEndAt,policy.timezone);assert.equal(String(p.hour).padStart(2,'0')+':'+String(p.minute).padStart(2,'0'),time);}
 assert.equal(Schedule.dateParts(windows[0].checkInOpenAt,policy.timezone).minute,30);assert.equal(Schedule.dateParts(windows[0].matchStartAt,policy.timezone).minute,32);
});
test('Eastern calendar recurrence remains 19:30 across fall DST while fixed EST remains UTC-05',()=>{
 const first=Date.UTC(2026,9,29,23,30),base=recurrence({rangeStart:Date.UTC(2026,9,29),rangeEnd:Date.UTC(2026,10,10)});
 for(const timezone of ['America/New_York','EST']){
  const policy=fixturePolicy({timezone}),anchor=Schedule.anchorRecord({id:'fall-anchor',startsAt:first,timezone}),result=Schedule.planRecurrence({...base,policy,anchor});
  assert.equal(result.events.length,4);for(const e of result.events){const p=Schedule.dateParts(e.startsAt,timezone);assert.equal(p.hour,19);assert.equal(p.minute,30);}
  const intervals=result.events.slice(1).map((e,i)=>e.startsAt-result.events[i].startsAt);
  assert.deepEqual(intervals,timezone==='EST'?[72*HOUR,72*HOUR,72*HOUR]:[73*HOUR,72*HOUR,72*HOUR]);
 }
});
test('Eastern calendar recurrence remains 19:30 across spring DST without changing the anchor',()=>{
 const policy=fixturePolicy(),anchor=Schedule.anchorRecord({id:'spring-anchor',startsAt:Date.UTC(2026,2,5,0,30),timezone:policy.timezone});
 const result=Schedule.planRecurrence(recurrence({policy,anchor,rangeStart:Date.UTC(2026,2,4),rangeEnd:Date.UTC(2026,2,14)}));
 assert.equal(result.events[1].startsAt-result.events[0].startsAt,72*HOUR);assert.equal(result.events[2].startsAt-result.events[1].startsAt,71*HOUR);
 assert.deepEqual(result.events.map(e=>Schedule.dateParts(e.startsAt,policy.timezone).hour),[19,19,19,19]);assert.strictEqual(result.anchor,anchor);
});
test('invalid/ambiguous wall dates are rejected rather than silently normalized',()=>{
 conflict(()=>Schedule.wallTimestamp({year:2026,month:2,day:30},'EST'),/calendar date/);
 conflict(()=>Schedule.wallTimestamp({year:2026,month:3,day:8,hour:2,minute:30},'America/New_York'),/does not exist/);
 conflict(()=>Schedule.wallTimestamp({year:2026,month:11,day:1,hour:1,minute:30},'America/New_York'),/Ambiguous/);
 conflict(()=>Schedule.wallTimestamp({year:2026,month:10,day:9},'UTC'),/does not exist/);
});
test('persistent first legacy event anchors global recurrence, including missing season-boundary events',()=>{
 const base=recurrence(),oldOrdinals=[0,1,2,3,5,6,7,8],existingEvents=oldOrdinals.map(ordinal=>({id:'legacy-event-'+ordinal,kind:'official',status:'REGISTRATION',startsAt:base.anchor.legacyStartsAt+ordinal*Schedule.LEGACY_INTERVAL}));
 const result=Schedule.planRecurrence({...base,existingEvents});assert.equal(result.canApply,true);assert.equal(result.events.length,10);
 for(const ordinal of oldOrdinals){const event=result.events.find(e=>e.schedule.ordinal===ordinal);assert.equal(event.id,'legacy-event-'+ordinal);assert.equal(event.action,'RESCHEDULE');}
 const boundary=result.events.find(e=>e.schedule.ordinal===4);assert.equal(boundary.action,'CREATE');assert.equal(Schedule.dateKey(Schedule.dateParts(boundary.startsAt,base.policy.timezone)),'2026-10-15');
 assert.equal(result.events.find(e=>e.schedule.ordinal===5).startsAt-boundary.startsAt,Schedule.LEGACY_INTERVAL);
 const repeat=Schedule.planRecurrence({...base,existingEvents,now:base.now+DAY});assert.deepEqual(repeat.events,result.events,'Code run time cannot reseed event dates or identities');
});
test('reconciliation of persisted events reuses every ID and is idempotent after a JSON restart',()=>{
 const base=recurrence(),first=Schedule.planRecurrence(base),existingEvents=first.events.map(e=>({...e,status:'REGISTRATION'}));
 const restored=JSON.parse(JSON.stringify({...base,existingEvents})),second=Schedule.planRecurrence(restored);
 assert.equal(second.canApply,true);assert.deepEqual(second.events.map(e=>e.id),first.events.map(e=>e.id));assert.ok(second.events.every(e=>e.action==='KEEP'));
 const split=Schedule.planRecurrence({...base,rangeStart:Date.UTC(2026,9,15),existingEvents});assert.equal(split.events[0].schedule.ordinal,4);assert.equal(split.events[0].id,first.events[4].id);
 assert.equal(new Set(second.events.map(e=>e.id)).size,second.events.length);
});
test('active/completed legacy events keep recorded timestamps and custom events are never rescheduled',()=>{
 const base=recurrence(),existingEvents=[{id:'active',kind:'official',status:'ACTIVE',startsAt:base.anchor.legacyStartsAt},{id:'finished',kind:'official',status:'COMPLETED',startsAt:base.anchor.legacyStartsAt+Schedule.LEGACY_INTERVAL},{id:'custom',kind:'custom',status:'REGISTRATION',startsAt:base.anchor.legacyStartsAt+2*Schedule.LEGACY_INTERVAL}],before=JSON.stringify(existingEvents);
 const result=Schedule.planRecurrence({...base,existingEvents});assert.equal(result.events[0].action,'PRESERVE_HISTORY');assert.equal(result.events[0].startsAt,existingEvents[0].startsAt);assert.equal(result.events[1].action,'PRESERVE_HISTORY');assert.equal(result.events[1].startsAt,existingEvents[1].startsAt);assert.ok(result.events.every(e=>e.id!=='custom'));assert.equal(JSON.stringify(existingEvents),before);
 conflict(()=>Schedule.gameWindows(existingEvents[2],base.policy),/Custom tournament/);
});
test('duplicate ordinals, mixed anchors/timezones/policies and past reschedules expose conflicts',()=>{
 const base=recurrence(),legacy={id:'a',kind:'official',status:'REGISTRATION',startsAt:base.anchor.legacyStartsAt};
 assert.ok(Schedule.planRecurrence({...base,existingEvents:[legacy,{...legacy,id:'b'}]}).conflicts.some(c=>c.code==='DUPLICATE_EVENT_ORDINAL'));
 const due=Schedule.planRecurrence({...base,existingEvents:[legacy],now:base.anchor.legacyStartsAt});assert.equal(due.canApply,false);assert.equal(due.events[0].startsAt,legacy.startsAt);assert.ok(due.conflicts.some(c=>c.code==='LEGACY_EVENT_ALREADY_DUE'));
 const first=Schedule.planRecurrence(base).events[0];for(const change of [{anchorId:'other-lineage'},{timezone:'EST'},{policySignature:'other-policy'}]){const plan=Schedule.planRecurrence({...base,existingEvents:[{...first,status:'REGISTRATION',schedule:{...first.schedule,...change}}]});assert.equal(plan.canApply,false);assert.ok(plan.conflicts.some(c=>c.code==='INCOMPATIBLE_SCHEDULE_LINEAGE'));}
 conflict(()=>Schedule.planRecurrence({...base,anchor:{...base.anchor,wallDate:'2026-10-04'}}),/anchor date/);
 conflict(()=>Schedule.planRecurrence({...base,anchor:{...base.anchor,timezone:'EST'}}),/incompatible persistent/);
});
test('controlled clock exposes check-in close, actual roster lock and countdown as separate states',()=>{
 const {window:w}=firstWindow(),state=(at,record)=>Schedule.windowState(w,at,record);
 assert.equal(state(w.checkInOpenAt-1).state,'WAITING_FOR_CHECK_IN');assert.equal(state(w.checkInOpenAt).state,'CHECK_IN_OPEN');assert.equal(state(w.checkInCloseAt-1).state,'CHECK_IN_OPEN');
 const closed=state(w.checkInCloseAt);assert.equal(closed.state,'CHECK_IN_CLOSED');assert.equal(closed.requiresRosterLock,true);assert.equal(closed.canStart,false);
 const locked={rostersLockedAt:w.checkInCloseAt};assert.equal(state(w.checkInCloseAt,locked).state,'ROSTERS_LOCKED');assert.equal(state(w.countdownAt,locked).state,'ROSTERS_LOCKED','No fabricated countdown before required preparation');
 const ready={...locked,readyAt:w.countdownAt};const countdown=state(w.countdownAt,ready);assert.equal(countdown.state,'PRE_MATCH_COUNTDOWN');assert.equal(countdown.canBeginCountdown,true);assert.equal(countdown.canStart,false);
 assert.equal(state(w.matchStartAt-1,ready).state,'PRE_MATCH_COUNTDOWN');assert.equal(state(w.matchStartAt,ready).canStart,true);assert.equal(state(w.matchStartAt,ready).state,'SCHEDULED_START_PENDING');const due=state(w.matchStartAt+200,ready);assert.equal(due.canStart,true,'A server tick consumes the unchanged authoritative start rather than moving it');assert.equal(due.state,'SCHEDULED_START_PENDING');assert.equal(due.canBeginCountdown,false);
 const playing={...ready,startedAt:w.matchStartAt};assert.equal(state(w.matchStartAt,playing).state,'PLAYING');assert.equal(state(w.matchStartAt,playing).canStart,false,'A duplicate attempt cannot start the game again');
});
test('slow/missing preparation is reported without moving starts or granting false readiness',()=>{
 const {window:w}=firstWindow(),before=JSON.stringify(w);
 const unlocked=Schedule.windowState(w,w.matchStartAt);assert.equal(unlocked.state,'CHECK_IN_CLOSED');assert.equal(unlocked.conflict,'ROSTER_LOCK_MISSED_GAME_START');assert.equal(unlocked.canStart,false);
 const slow=Schedule.windowState(w,w.matchStartAt,{rostersLockedAt:w.checkInCloseAt});assert.equal(slow.state,'SCHEDULING_CONFLICT');assert.equal(slow.conflict,'PREPARATION_MISSED_GAME_START');assert.equal(slow.canStart,false);
 const late=Schedule.windowState(w,w.matchStartAt+5000,{rostersLockedAt:w.checkInCloseAt,readyAt:w.matchStartAt+4000});assert.equal(late.canStart,false);assert.equal(late.conflict,'PREPARATION_MISSED_GAME_START');assert.equal(JSON.stringify(w),before);
 conflict(()=>Schedule.windowState(w,w.matchStartAt,{rostersLockedAt:w.checkInCloseAt,readyAt:w.matchStartAt+1}),/Future timestamp/);
});
test('early finalization waits without advancing later windows; repeated snapshots do not mutate results',()=>{
 const {event,policy,window:w}=firstWindow(),next=Schedule.gameWindows(event,policy)[1],record={rostersLockedAt:w.checkInCloseAt,readyAt:w.countdownAt,startedAt:w.matchStartAt,finalizedAt:w.matchStartAt+45000},before=JSON.stringify(record);
 assert.equal(Schedule.windowState(w,record.finalizedAt,record).state,'FINALIZED');record.waitingAt=record.finalizedAt+1;
 const waiting=Schedule.windowState(w,record.waitingAt,record);assert.equal(waiting.state,'WAITING_FOR_NEXT_SCHEDULED_GAME');assert.equal(waiting.canStart,false);assert.equal(waiting.requiresRosterLock,false);
 const restored=JSON.parse(JSON.stringify(record));assert.deepEqual(Schedule.windowState(w,record.waitingAt,restored),waiting);assert.equal(Schedule.windowState(next,record.waitingAt).state,'WAITING_FOR_CHECK_IN');assert.equal(next.checkInOpenAt,event.startsAt+8*60000);
 const unfinished=JSON.parse(before);assert.equal(unfinished.finalizedAt,record.finalizedAt);assert.equal(unfinished.waitingAt,undefined);
});
test('existing overtime is retained and blocks schedule advancement rather than cutting a game short',()=>{
 const {window:w}=firstWindow(),record={rostersLockedAt:w.checkInCloseAt,readyAt:w.countdownAt,startedAt:w.matchStartAt};
 const overrun=Schedule.windowState(w,w.latestEndAt+5000,record);assert.equal(overrun.state,'PLAYING');assert.equal(overrun.conflict,'GAME_OVERRAN_SCHEDULED_WINDOW');assert.equal(record.finalizedAt,undefined);assert.equal(overrun.canStart,false);
 const ended={...record,finalizedAt:w.latestEndAt+6000};assert.equal(Schedule.windowState(w,ended.finalizedAt,ended).state,'FINALIZED');
});
test('prepared and playing errors remain visible and cannot trigger countdown or duplicate start',()=>{
 const {window:w}=firstWindow(),ready={rostersLockedAt:w.checkInCloseAt,readyAt:w.countdownAt,error:'SIMULATION_INITIALIZATION_FAILED'};
 for(const now of [w.countdownAt,w.matchStartAt,w.matchStartAt+200]){const failed=Schedule.windowState(w,now,ready);assert.equal(failed.state,'SCHEDULING_CONFLICT');assert.equal(failed.conflict,ready.error);assert.equal(failed.canBeginCountdown,false);assert.equal(failed.canStart,false);assert.equal(failed.requiresRosterLock,false);}
 const playing={...ready,startedAt:w.matchStartAt},failure=Schedule.windowState(w,w.matchStartAt+1000,playing);assert.equal(failure.state,'SCHEDULING_CONFLICT');assert.equal(failure.conflict,ready.error);assert.equal(failure.canStart,false);assert.equal(playing.startedAt,w.matchStartAt,'The actual start remains recorded while the error is exposed');
});
test('impossible/future actual states reject before producing a queue snapshot',()=>{
 const {window:w}=firstWindow();conflict(()=>Schedule.windowState(w,w.matchStartAt,{rostersLockedAt:w.checkInCloseAt-1}),/before check-in/);
 conflict(()=>Schedule.windowState(w,w.matchStartAt,{rostersLockedAt:w.checkInCloseAt,readyAt:w.countdownAt,startedAt:w.matchStartAt-1}),/authoritative timestamp/);
 conflict(()=>Schedule.windowState(w,w.matchStartAt,{finalizedAt:w.matchStartAt}),/Unstarted/);
 conflict(()=>Schedule.windowState(w,w.matchStartAt,{waitingAt:w.matchStartAt}),/Unfinalized/);
 conflict(()=>Schedule.windowState({...w,matchStartAt:w.countdownAt},w.checkInOpenAt),/Invalid game window/);
 const failed=Schedule.windowState(w,w.countdownAt,{rostersLockedAt:w.checkInCloseAt,readyAt:w.countdownAt,error:'INSUFFICIENT_ELIGIBLE_BOTS'});assert.equal(failed.state,'SCHEDULING_CONFLICT');assert.equal(failed.canBeginCountdown,false);assert.equal(failed.canStart,false);assert.equal(failed.requiresRosterLock,false);
});
test('confirmed inputs are copied/frozen and planning never changes caller records',()=>{
 const rounds=Object.fromEntries(Object.entries(Schedule.DRAFT_ROUNDS).map(([k,v])=>[k,[...v]])),policy=fixturePolicy({rounds}),base=recurrence({policy}),before=JSON.stringify(base);rounds.QF[1]=999;
 assert.equal(policy.rounds.QF[1],8);assert.ok(Object.isFrozen(policy));assert.ok(Object.isFrozen(policy.rounds));assert.ok(Object.isFrozen(policy.rounds.QF));Schedule.planRecurrence(base);assert.equal(JSON.stringify(base),before);
});
