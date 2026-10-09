'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Circuit=require('../tournaments.cjs'),Schedule=require('../tournament-schedule.cjs');
const {fixture,snapshot}=require('../../dev/live-circuit-tournament-check.cjs');
const {game}=require('../../dev/arena-refined-tournament-series-check.cjs');
const USER='live-circuit-fixture',clone=value=>JSON.parse(JSON.stringify(value));
function event(f){return Circuit.scheduleOfficial(f.db,USER,f.season,f.season.startAt).find(t=>t.status==='REGISTRATION');}
function open(f,withHuman=false){let t=event(f);if(withHuman)Circuit.registerTeam(f.db,USER,t.id,{name:'Player squad',participantIds:[USER]},t.startsAt-1000);return Circuit.advanceScheduled(f.db,USER,t.id,t.startsAt);}
function prepare(f,t,at){t=Circuit.advanceScheduled(f.db,USER,t.id,at);for(const g of Object.values(t.scheduling.games).filter(g=>g.rostersLockedAt&&!g.startedAt&&!g.finalizedAt&&g.matchStartAt>at)){
 const human=g.teams.some(team=>team.participants.some(p=>p.kind==='user'));Circuit.claimScheduledGame(f.db,USER,t.id,g.gameId,{owner:human?'client:'+USER:'server',clientId:'fixture-client-1',ttlMs:60000},at);Circuit.markScheduledPrepared(f.db,USER,t.id,g.gameId,at);
 }return Circuit.getTournament(f.db,USER,t.id);}
function finishWindow(f,t,at,score=[50,20]){t=Circuit.advanceScheduled(f.db,USER,t.id,at);for(const g of Object.values(t.scheduling.games).filter(g=>g.matchStartAt===at&&!g.finalizedAt)){
 Circuit.markScheduledStarted(f.db,USER,t.id,g.gameId,g.lease.token,at);t=Circuit.getTournament(f.db,USER,t.id);const s=t.series.find(s=>s.id===g.seriesId),result=game(t,s,score,{id:g.gameId});t=Circuit.recordGame(f.db,USER,t.id,s.id,result,at+1000);
 }return t;}
test('fractional cloud-clock season anchors preserve legacy IDs and converge to integral Eastern windows',()=>{
 const f=fixture();try{const season={...f.season,startAt:f.season.startAt+.375,endAt:f.season.endAt+.375},first=Circuit.scheduleOfficial(f.db,USER,season,season.startAt),row=f.db.prepare("SELECT id,metadata_json FROM tournaments WHERE user_id=? AND kind='official' ORDER BY starts_at LIMIT 1").get(USER),anchor=JSON.parse(row.metadata_json).officialSchedule.anchor;assert.equal(anchor.legacyStartsAt,season.startAt+Circuit.INTERVAL);assert.equal(anchor.id,row.id);assert.ok(first.every(t=>Number.isSafeInteger(t.startsAt)));f.reopen();assert.deepEqual(Circuit.scheduleOfficial(f.db,USER,season,season.startAt+.25).map(t=>t.id),first.map(t=>t.id));assert.deepEqual(JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(row.id).metadata_json).officialSchedule.anchor,anchor);
 }finally{f.close();}
});
test('approved persistent recurrence is Eastern 19:30 with one old anchor, idempotent restart and no season-boundary gap',()=>{
 const f=fixture();try{const first=Circuit.scheduleOfficial(f.db,USER,f.season,f.season.startAt),ids=first.map(t=>t.id);assert.ok(first.length>=4);for(const t of first){const p=Schedule.dateParts(t.startsAt,'America/New_York');assert.equal(p.hour,19);assert.equal(p.minute,30);assert.equal(t.schedulePolicy.aggregateTiePolicy,'total-team-damage-then-hold');}
 const original=f.db.prepare("SELECT id,metadata_json FROM tournaments WHERE user_id=? AND kind='official' ORDER BY starts_at LIMIT 1").get(USER),anchor=JSON.parse(original.metadata_json).officialSchedule.anchor;f.reopen();assert.deepEqual(Circuit.scheduleOfficial(f.db,USER,f.season,f.season.startAt).map(t=>t.id),ids);
 const next={...f.season,startAt:f.season.endAt,endAt:f.season.endAt+(f.season.endAt-f.season.startAt),number:f.season.number+1};Circuit.scheduleOfficial(f.db,USER,next,next.startAt);const all=f.db.prepare("SELECT starts_at FROM tournaments WHERE user_id=? AND kind='official' ORDER BY starts_at").all(USER);for(let i=1;i<all.length;i++){const a=Schedule.dateParts(all[i-1].starts_at,'America/New_York'),b=Schedule.dateParts(all[i].starts_at,'America/New_York');assert.equal((Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day))/86400000,3);}assert.deepEqual(JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(original.id).metadata_json).officialSchedule.anchor,anchor);assert.deepEqual(snapshot(f.db),f.before);
 }finally{f.close();}
});
test('partial human teams become eight complete unique teams and all four QF windows coexist',()=>{
 const f=fixture();try{const t=open(f,true);assert.equal(t.status,'ACTIVE');assert.equal(t.teams.length,8);assert.equal(new Set(t.teams.map(team=>team.name)).size,8);assert.equal(t.teams[0].name,'Player squad');assert.ok(t.teams.every(team=>team.participants.length===5));assert.equal(new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size,40);assert.equal(Object.keys(t.scheduling.games).length,4);assert.equal(t.scheduling.reservations.length,40);assert.equal(t.scheduling.standbyReservations.length,1);
 // Reconciliation at the exact opening may not cancel an on-time event.
 Circuit.scheduleOfficial(f.db,USER,f.season,t.startsAt);assert.equal(Circuit.getTournament(f.db,USER,t.id).status,'ACTIVE');assert.deepEqual(snapshot(f.db),f.before);
 }finally{f.close();}
});
test('check-in is account scoped, deadline bounded and repeat safe; a slow checked-in client is never replaced',()=>{
 const f=fixture();try{let t=open(f,true),g=Object.values(t.scheduling.games).find(g=>t.series.find(s=>s.id===g.seriesId).teamIds.some(id=>t.teams.find(team=>team.id===id).participants.some(p=>p.id===USER)));
 t=Circuit.checkIn(f.db,USER,t.id,{gameId:g.gameId},g.checkInOpenAt+1000);const first=clone(t.scheduling.games[g.gameId].checkIns);t=Circuit.checkIn(f.db,USER,t.id,{gameId:g.gameId},g.checkInOpenAt+2000);assert.deepEqual(t.scheduling.games[g.gameId].checkIns,first);
 t=Circuit.advanceScheduled(f.db,USER,t.id,g.checkInCloseAt);g=t.scheduling.games[g.gameId];assert.ok(g.teams.some(team=>team.participants.some(p=>p.id===USER)));assert.equal(g.replacements.length,0);assert.equal(g.rostersLockedAt,g.checkInCloseAt);
 t=Circuit.advanceScheduled(f.db,USER,t.id,g.matchStartAt);assert.equal(t.status,'CANCELLED');assert.equal(t.scheduling.cancellationReason,'MISSED_PREPARATION_DEADLINE');assert.ok(t.teams.some(team=>team.participants.some(p=>p.id===USER)));assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_earnings').get().n,0);
 }finally{f.close();}
});
test('no-show replacement is permanent, atomic and owns exactly one slot; snapshots and checkpoints survive restart',()=>{
 const f=fixture();try{let t=open(f,true),g=Object.values(t.scheduling.games)[0],m=JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json);m.runtimeGames={diagnostic:{retained:true}};f.db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(m),t.id);
 t=Circuit.advanceScheduled(f.db,USER,t.id,g.checkInCloseAt);const replacement=t.replacementHistory[0];assert.equal(replacement.previous.id,USER);assert.equal(replacement.payoutOwnerId,replacement.replacement.id);assert.equal(new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size,40);assert.ok(!t.teams.some(team=>team.participants.some(p=>p.id===USER)));assert.equal(t.scheduling.reservations.length,40);
 const locked=clone(t.scheduling.games);f.reopen();t=Circuit.advanceScheduled(f.db,USER,t.id,g.checkInCloseAt+1);assert.deepEqual(t.scheduling.games,locked);assert.equal(t.replacementHistory.length,1);assert.deepEqual(JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json).runtimeGames,{diagnostic:{retained:true}});assert.throws(()=>Circuit.checkIn(f.db,USER,t.id,{gameId:g.gameId},g.checkInCloseAt+2),/does not occupy/);
 }finally{f.close();}
});
test('one lease owner per running human game and countdown uses immutable absolute boundaries',()=>{
 const f=fixture();try{let t=open(f,true),g=Object.values(t.scheduling.games)[0];Circuit.checkIn(f.db,USER,t.id,{gameId:g.gameId},g.checkInOpenAt+1000);t=prepare(f,t,g.checkInCloseAt);g=t.scheduling.games[g.gameId];assert.throws(()=>Circuit.claimScheduledGame(f.db,USER,t.id,g.gameId,{owner:'client:'+USER,clientId:'fixture-client-2'},g.checkInCloseAt+1),/Another client/);assert.throws(()=>Circuit.markScheduledStarted(f.db,USER,t.id,g.gameId,g.lease.token,g.matchStartAt-1),/cannot start/);
 const started=Circuit.markScheduledStarted(f.db,USER,t.id,g.gameId,g.lease.token,g.matchStartAt);assert.equal(started.startedAt,g.matchStartAt);assert.equal(Circuit.markScheduledStarted(f.db,USER,t.id,g.gameId,g.lease.token,g.matchStartAt+1).startedAt,g.matchStartAt);assert.throws(()=>Circuit.renewScheduledGame(f.db,USER,t.id,g.gameId,'wrong-token',g.matchStartAt),/expired/);
 }finally{f.close();}
});
test('all fixed 3/3/5 games finalize once, early finishes wait, replacement payout excludes the absent human',()=>{
 const f=fixture();try{let t=open(f,true);const firstHuman=Object.values(t.scheduling.games)[0];Circuit.checkIn(f.db,USER,t.id,{gameId:firstHuman.gameId},firstHuman.checkInOpenAt+1000);for(const w of Schedule.gameWindows(t,t.schedulePolicy)){
  t=prepare(f,t,w.checkInCloseAt);assert.equal(t.status,'ACTIVE');t=finishWindow(f,t,w.matchStartAt);
  for(const s of t.series)if(s.games.length<s.requiredGames)assert.equal(s.winnerTeamId,null);
 }
 assert.equal(t.status,'COMPLETED');assert.deepEqual(t.series.map(s=>s.games.length),[3,3,3,3,3,3,5]);assert.equal(t.earnings.length,40);assert.ok(!t.earnings.some(e=>e.participantId===USER));const replacement=t.replacementHistory[0].replacement.id;assert.equal(t.earnings.filter(e=>e.participantId===replacement).length,1);assert.equal(t.scheduling.reservations.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_matches WHERE tournament_id=?').get(t.id).n,23);assert.ok(t.series[0].games[0].teams[0].participants.some(p=>p.id===USER));assert.ok(t.series[0].games[1].teams[0].participants.some(p=>p.id===replacement));assert.equal(JSON.parse(f.db.prepare('SELECT stats_json FROM tournament_stats WHERE tournament_id=? AND participant_id=?').get(t.id,USER).stats_json).games,1);
 const first=t.series[0].games[0],counts=f.db.prepare('SELECT count(*) n FROM tournament_matches').get().n;Circuit.recordGame(f.db,USER,t.id,t.series[0].id,first,first.completedAt+999);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_matches').get().n,counts);f.reopen();assert.deepEqual(Circuit.getTournament(f.db,USER,t.id).earnings,t.earnings);assert.deepEqual(snapshot(f.db),f.before);
 }finally{f.close();}
});
test('missed startup and interrupted elapsed windows cancel without results, awards or losing checkpoints',()=>{
 for(const duringGame of [false,true]){const f=fixture();try{let t=event(f);if(duringGame){t=Circuit.advanceScheduled(f.db,USER,t.id,t.startsAt);const g=Object.values(t.scheduling.games)[0];t=prepare(f,t,g.checkInCloseAt);for(const value of Object.values(t.scheduling.games))Circuit.markScheduledStarted(f.db,USER,t.id,value.gameId,value.lease.token,value.matchStartAt);const m=JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json);m.runtimeGames={saved:{bytes:123}};f.db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(m),t.id);}
 t=Circuit.advanceScheduled(f.db,USER,t.id,t.startsAt+600000);assert.equal(t.status,'CANCELLED');assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_matches').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_earnings').get().n,0);if(duringGame)assert.deepEqual(JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json).runtimeGames,{saved:{bytes:123}});assert.deepEqual(snapshot(f.db),f.before);
 }finally{f.close();}}
});
test('a second overlapping tournament cannot clone official participants or consume the same bot twice',()=>{
 const f=fixture();try{const t=open(f),second=Circuit.createCustom(f.db,USER,{name:'Overlap',startsAt:t.startsAt},t.startsAt);f.db.prepare("UPDATE tournaments SET kind='official',metadata_json=? WHERE id=?").run(JSON.stringify({schedulePolicy:t.schedulePolicy,scheduling:{games:{},reservations:[],conflicts:[]}}),second.id);const conflict=Circuit.advanceScheduled(f.db,USER,second.id,t.startsAt);assert.equal(conflict.status,'REGISTRATION');assert.equal(conflict.scheduling.conflicts[0].code,'ROSTER_ALLOCATION_CONFLICT');assert.equal(conflict.teams.length,0);assert.equal(new Set(Circuit.getTournament(f.db,USER,t.id).scheduling.reservations).size,40);
 }finally{f.close();}
});
test('automatic vacant-slot completion preserves optional invite decisions without starving real bot eligibility',()=>{
 const f=fixture();try{const t=event(f);f.db.prepare('UPDATE bot_competition_profiles SET competitiveness=0,socialness=0,ego=0 WHERE user_id=? AND bot_id<=?').run(USER,'bot_0011');f.db.prepare('UPDATE bots SET form=-10 WHERE user_id=? AND bot_id<=?').run(USER,'bot_0011');const before=f.db.prepare('SELECT * FROM bot_competition_profiles WHERE user_id=? ORDER BY bot_id').all(USER),result=Circuit.advanceScheduled(f.db,USER,t.id,t.startsAt);assert.equal(result.status,'ACTIVE');assert.equal(result.teams.length,8);assert.equal(Circuit.decision(f.db,USER,result,'bot_0001').accepted,false);assert.deepEqual(f.db.prepare('SELECT * FROM bot_competition_profiles WHERE user_id=? ORDER BY bot_id').all(USER),before);
 }finally{f.close();}
});
test('equal aggregate kills use total damage and an exact damage tie remains held for an explicit ruling',()=>{
 for(const extraDamage of [0,1]){const f=fixture();try{let t=Circuit.createCustom(f.db,USER,{name:'Tie fixture',startsAt:f.season.startAt},f.season.startAt);for(let n=0;n<8;n++)t=Circuit.registerTeam(f.db,USER,t.id,{name:'Team '+n,participantIds:Array.from({length:5},(_,i)=>'bot_'+String(n*5+i+1).padStart(4,'0'))},t.startsAt);t=Circuit.startTournament(f.db,USER,t.id,t.startsAt);const sid=t.series[0].id;
 for(const [index,score] of [[10,9],[10,9],[8,10]].entries()){const s=t.series.find(s=>s.id===sid),r=game(t,s,score);for(const p of r.stats)p.damage=100;if(index===2)r.stats[5].damage+=extraDamage;t=Circuit.recordGame(f.db,USER,t.id,sid,r,t.startsAt+index+1);}
 const s=t.series.find(s=>s.id===sid);assert.deepEqual(s.aggregateKills,[28,28]);if(extraDamage){assert.equal(s.winnerTeamId,s.teamIds[1]);assert.equal(s.advancement.criterion,'total-team-damage');}else{assert.equal(s.winnerTeamId,null);assert.equal(s.advancement.criterion,'explicit-ruling-required');assert.equal(s.status,'awaiting-tie-policy');}assert.deepEqual(snapshot(f.db),f.before);
 }finally{f.close();}}
});
