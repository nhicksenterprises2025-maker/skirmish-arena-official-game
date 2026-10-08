'use strict';
// Exercise the approved scheduler against its persisted original event anchor.
// The injected clock never waits days or accesses an installed account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Circuit=require('../server/tournaments.cjs');
const Schedule=require('../server/tournament-schedule.cjs');
const {fixture,snapshot}=require('./live-circuit-tournament-check.cjs');
const USER='live-circuit-fixture',DAY=86400000,clone=value=>JSON.parse(JSON.stringify(value));
const checks=[];
function check(name,run){run();checks.push({name,result:'PASS'});console.log('PASS: '+name);}
function events(f,now){return Circuit.scheduleOfficial(f.db,USER,f.season,now).sort((a,b)=>a.startsAt-b.startsAt);}
function rows(f){return clone(f.db.prepare("SELECT * FROM tournaments WHERE user_id=? AND kind='official' ORDER BY starts_at").all(USER));}
function unchanged(f){assert.deepEqual(snapshot(f.db),f.before,'Scheduling must preserve accounts, world, XP, careers, seasons, familiarity and balance telemetry');}
function run(){
 const f=fixture();
 try{
  let first,recorded;
  check('Official recurrence retains the persisted season anchor and unique three-day event identities',()=>{
   first=events(f,f.season.startAt);
   assert.ok(first.length>0);const meta=JSON.parse(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(first[0].id).metadata_json);assert.equal(meta.officialSchedule.anchor.legacyStartsAt,f.season.startAt+3*DAY);assert.equal(meta.officialSchedule.anchor.id,first[0].id);
   first.forEach((event,i)=>{const wall=Schedule.dateParts(event.startsAt,'America/New_York');assert.equal(wall.hour,19);assert.equal(wall.minute,30);assert.equal(event.kind,'official');assert.deepEqual(event.schedulePolicy,Schedule.APPROVED_POLICY);if(i){const prior=Schedule.dateParts(first[i-1].startsAt,'America/New_York');assert.equal((Date.UTC(wall.year,wall.month-1,wall.day)-Date.UTC(prior.year,prior.month-1,prior.day))/DAY,3);}});
   assert.equal(new Set(first.map(t=>t.id)).size,first.length);
   recorded=rows(f);unchanged(f);
  });
  check('Repeated authoritative scheduling reads do not reseed recurrence from the current clock or duplicate events',()=>{
   const ids=first.map(t=>t.id);
   for(let read=0;read<4;read++)assert.deepEqual(events(f,f.season.startAt).map(t=>t.id),ids);
   assert.deepEqual(rows(f),recorded);unchanged(f);
  });
  check('Backend and SQLite restart retain event IDs, anchor, timestamps and saved world',()=>{
   f.reopen();assert.deepEqual(events(f,f.season.startAt).map(t=>({id:t.id,startsAt:t.startsAt})),first.map(t=>({id:t.id,startsAt:t.startsAt})));
   assert.deepEqual(rows(f),recorded);assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');unchanged(f);
  });
  check('Existing registration and invitation history survive schedule reconciliation and reopening',()=>{
   const event=first[0],at=event.startsAt-60000;
   let t=Circuit.registerTeam(f.db,USER,event.id,{name:'Persisted Human Team',participantIds:[USER]},at);
   for(const botId of ['bot_0001','bot_0002','bot_0003','bot_0004'])t=Circuit.inviteBot(f.db,USER,event.id,{teamId:t.teams[0].id,botId},at);
   const before=clone(t),registered=clone(f.db.prepare('SELECT * FROM tournament_registrations WHERE tournament_id=? ORDER BY participant_id').all(t.id)),invites=clone(f.db.prepare('SELECT * FROM tournament_invites WHERE tournament_id=? ORDER BY bot_id').all(t.id));
   for(let i=0;i<3;i++)events(f,at+i);
   assert.deepEqual(clone(Circuit.getTournament(f.db,USER,t.id)),before);f.reopen();events(f,at+1000);
   assert.deepEqual(clone(Circuit.getTournament(f.db,USER,t.id)),before);
   assert.deepEqual(clone(f.db.prepare('SELECT * FROM tournament_registrations WHERE tournament_id=? ORDER BY participant_id').all(t.id)),registered);
   assert.deepEqual(clone(f.db.prepare('SELECT * FROM tournament_invites WHERE tournament_id=? ORDER BY bot_id').all(t.id)),invites);unchanged(f);
  });
  check('Custom event instants including repeated DST wall times remain exactly user supplied',()=>{
   const clock=Date.parse('2026-10-07T12:00:00Z'),times=['2026-11-01T01:30:00-04:00','2026-11-01T01:30:00-05:00','2026-11-01T19:30:00-05:00'].map(Date.parse),custom=times.map((startsAt,i)=>Circuit.createCustom(f.db,USER,{name:'Custom Time '+i,startsAt},clock));
   assert.equal(times[1]-times[0],3600000);
   for(let i=0;i<custom.length;i++){assert.equal(custom[i].kind,'custom');assert.equal(custom[i].startsAt,times[i]);}
   events(f,f.season.startAt);f.reopen();events(f,f.season.startAt);
   for(let i=0;i<custom.length;i++)assert.equal(Circuit.getTournament(f.db,USER,custom[i].id).startsAt,times[i]);unchanged(f);
  });
  check('Existing tournament allocation uses forty unique real roster identities and preserves all fifty canonical bots',()=>{
   const before=clone(f.db.prepare('SELECT * FROM bots WHERE user_id=? ORDER BY bot_id').all(USER));assert.equal(before.length,50);
   const event=first[0],t=Circuit.advanceScheduled(f.db,USER,event.id,event.startsAt);
   assert.equal(t.teams.length,8);assert.ok(t.teams.every(team=>team.participants.length===5));
   const people=t.teams.flatMap(team=>team.participants);assert.equal(new Set(people.map(p=>p.id)).size,40);
   const botIds=new Set(before.map(b=>b.bot_id));assert.equal(people.filter(p=>p.kind==='bot').length,39);assert.ok(people.filter(p=>p.kind==='bot').every(p=>botIds.has(p.id)));
   assert.equal(t.status,'ACTIVE');assert.equal(t.scheduling.reservations.length,39);assert.equal(Object.keys(t.scheduling.games).length,4);
   assert.deepEqual(clone(f.db.prepare('SELECT * FROM bots WHERE user_id=? ORDER BY bot_id').all(USER)),before);unchanged(f);
  });
  check('Recurrence in a later season preserves old event history rather than overwriting or reusing identities',()=>{
   const old=rows(f),next={...f.season,number:f.season.number+1,startAt:f.season.endAt,endAt:f.season.endAt+(f.season.endAt-f.season.startAt)},added=Circuit.scheduleOfficial(f.db,USER,next,next.startAt);
   assert.ok(added.length>0);assert.ok(added.some(t=>!first.some(previous=>previous.id===t.id)));for(const row of old)assert.deepEqual(clone(f.db.prepare('SELECT * FROM tournaments WHERE id=?').get(row.id)),row);
   assert.deepEqual(Circuit.scheduleOfficial(f.db,USER,next,next.startAt).map(t=>t.id),added.map(t=>t.id));const all=rows(f);for(let i=1;i<all.length;i++){const a=Schedule.dateParts(all[i-1].starts_at,'America/New_York'),b=Schedule.dateParts(all[i].starts_at,'America/New_York');assert.equal((Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day))/DAY,3);}unchanged(f);
  });
  check('Approved policy is active while unconfirmed replacements still reject without database mutation',()=>{
   const old=rows(f),rejected=error=>error.code==='TOURNAMENT_SCHEDULE_CONFLICT'&&/explicit confirmation/.test(error.message);
   assert.throws(()=>Schedule.confirmedPolicy({}),rejected);
   assert.throws(()=>Schedule.confirmedPolicy({...Schedule.DRAFT_ROUNDS,confirmed:false}),rejected);
   assert.throws(()=>Schedule.planRecurrence({userId:USER,anchor:{id:first[0].id,legacyStartsAt:first[0].startsAt},policy:{},rangeStart:f.season.startAt,rangeEnd:f.season.endAt,existingEvents:first,now:f.season.startAt}),rejected);
   assert.deepEqual(Circuit.getTournament(f.db,USER,first[0].id).schedulePolicy,Schedule.APPROVED_POLICY);assert.throws(()=>Circuit.configureOfficialSchedule(f.db,USER,{policy:{}},f.season.startAt),rejected);
   assert.deepEqual(rows(f),old);unchanged(f);
  });
 }finally{f.close();}
 const report={result:'PASS',scope:'Approved Eastern calendar recurrence, stable original anchors and account/history preservation. Full check-in, replacement, game and payout transitions are additionally covered by lifecycle/runtime tests.',checks,sourceHashes:Object.fromEntries(['server/tournaments.cjs','server/tournament-lifecycle.cjs','server/tournament-schedule.cjs','server/tournament-runtime.cjs','game.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]))};
 const flag=process.argv.find(arg=>arg.startsWith('--report='));if(flag){const destination=path.resolve(flag.slice('--report='.length));fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2));}
 return report;
}
if(require.main===module){try{run();console.log('PASS: '+checks.length+' approved-schedule preservation groups.');}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={run};
