'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createServer}=require('../index.cjs'),Circuit=require('../tournaments.cjs'),Runtime=require('../tournament-runtime.cjs');
const {fixture,snapshot}=require('../../dev/live-circuit-tournament-check.cjs');
const {game}=require('../../dev/arena-refined-tournament-series-check.cjs');
const USER='live-circuit-fixture',clone=value=>JSON.parse(JSON.stringify(value));
test('persisted unscheduled aggregate API preserves 128–136 advancement, authorization and immutable retries after restart',async()=>{
 const f=fixture(),now=Date.now(),token=crypto.randomBytes(32).toString('base64url'),cookie='sar_session='+token;
 // An isolated test session exercises the real authentication middleware. No
 // account secrets from the installed game are read or written.
 f.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),USER,now,now+86400000,now);
 let app,base;
 const open=async()=>{app=createServer({db:f.db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;};
 const close=async()=>{if(app?.server.listening)await new Promise(resolve=>app.server.close(resolve));};
 const request=async(route,{method='GET',body,authenticated=true}={})=>{
  const response=await fetch(base+'/api/tournaments'+route,{method,headers:{...(authenticated?{cookie}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};
 };
 const same=(a,b,label)=>assert.deepEqual(clone(a),clone(b),label);
 try{
  await open();assert.equal((await request('',{authenticated:false})).status,401);
  const created=await request('',{method:'POST',body:{name:'Aggregate API Fixture',startsAt:now+60000}});assert.equal(created.status,201);
  let t=created.body.tournament;assert.equal(t.rulesetId,'arena-refined-aggregate-kills-v1');assert.equal(t.teams.length,1);const ownTeam=t.teams[0],route='/'+t.id;
  for(const botId of ['bot_0001','bot_0002','bot_0003','bot_0004']){const invited=await request(route+'/invite',{method:'POST',body:{teamId:ownTeam.id,botId}});assert.equal(invited.status,200,botId+': '+JSON.stringify(invited.body));assert.equal(invited.body.tournament.invites.find(i=>i.botId===botId)?.state,'ACCEPTED');if(botId==='bot_0001'){Runtime.advance(f.db,{now:Date.now(),budget:0});const draft=Circuit.getTournament(f.db,USER,t.id);assert.equal(draft.status,'REGISTRATION');assert.equal(draft.teams.length,1,'The scheduler must not consume the pending human invitations');}}
  // Historical unscheduled aggregate records retain their original timing contract.
  f.db.prepare('UPDATE tournaments SET starts_at=? WHERE id=?').run(now,t.id);Circuit.startTournament(f.db,USER,t.id,now);
  const started=await request(route+'/start',{method:'POST',body:{}});assert.equal(started.status,200,JSON.stringify(started.body));t=started.body.tournament;assert.equal(t.teams.length,8);assert.ok(t.teams.every(team=>team.participants.length===5));assert.equal(new Set(t.teams.flatMap(team=>team.participants.map(p=>p.id))).size,40);
  const play=await request(route+'/play',{method:'POST',body:{}});assert.equal(play.status,200);let context=play.body.context;
  const sid=context.seriesId,q=t.series.find(s=>s.id===sid),foreign=t.series.find(s=>s.id!==sid&&s.round==='QF');assert.equal(q.teamIds[0],ownTeam.id);assert.equal(context.gameId,sid+':game1');assert.equal(context.requiredGames,3);
  const first=game(t,q,[56,30],{id:context.gameId});
  const wrongGame=await request(route+'/result',{method:'POST',body:{seriesId:sid,result:{...first,id:sid+':game2'}}});assert.equal(wrongGame.status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_matches WHERE series_id=?').get(sid).n,0);
  const wrongSeries=await request(route+'/result',{method:'POST',body:{seriesId:foreign.id,result:first}});assert.equal(wrongSeries.status,409);
  assert.equal((await request(route+'/result',{method:'POST',body:{seriesId:sid,result:first},authenticated:false})).status,401);
  const scores=[[56,30],[52,46],[20,60]],results=[];
  for(let i=0;i<scores.length;i++){
   t=Circuit.getTournament(f.db,USER,t.id);const current=t.series.find(s=>s.id===sid),result=game(t,current,scores[i],{id:context.gameId});results.push(result);
   const received=await request(route+'/result',{method:'POST',body:{seriesId:sid,result}});assert.equal(received.status,200);t=received.body.tournament;
   const s=t.series.find(s=>s.id===sid);assert.equal(s.completedGames,i+1);assert.equal(s.remainingGames,2-i);
   if(i<2){assert.equal(s.winnerTeamId,null);assert.equal((await request(route+'/play',{method:'POST',body:{}})).status,200);context=(await request(route+'/play',{method:'POST',body:{}})).body.context;assert.equal(context.gameId,sid+':game'+(i+2));}
  }
  const finished=t.series.find(s=>s.id===sid);same(finished.wins,[2,1]);same(finished.aggregateKills,[128,136]);assert.equal(finished.winnerTeamId,q.teamIds[1]);assert.equal(finished.games.length,3);assert.equal(finished.advancement.status,'decided');assert.ok(t.series.filter(s=>s.round==='SF').some(s=>s.teamIds.includes(q.teamIds[1])));
  const seriesRow=f.db.prepare('SELECT * FROM tournament_series WHERE id=?').get(sid),gameRows=f.db.prepare('SELECT * FROM tournament_matches WHERE series_id=? ORDER BY id').all(sid),statRows=f.db.prepare('SELECT * FROM tournament_stats WHERE tournament_id=? AND participant_id IN (SELECT participant_id FROM tournament_registrations WHERE team_id IN (?,?)) ORDER BY participant_id').all(t.id,...q.teamIds);
  // No playable next series exists for the eliminated human. The result route
  // must still acknowledge previously stored game IDs after this advancement.
  assert.equal((await request(route+'/play',{method:'POST',body:{}})).status,409);
  const changed={...results[2],winnerTeamId:q.teamIds[0],score:[999,0],stats:[]};
  const replays=await Promise.all([results[0],results[2],changed].map(result=>request(route+'/result',{method:'POST',body:{seriesId:sid,result}})));assert.ok(replays.every(r=>r.status===200));
  assert.equal((await request(route+'/result',{method:'POST',body:{seriesId:foreign.id,result:results[2]}})).status,409);
  assert.equal((await request(route+'/result',{method:'POST',body:{seriesId:sid,result:{...results[2],id:sid+':game4'}}})).status,409);
  for(let i=0;i<3;i++){const read=await request(route);assert.equal(read.status,200);same(read.body.tournament.series.find(s=>s.id===sid),finished,'Reopening tournament UI cannot advance its series');}
  same(f.db.prepare('SELECT * FROM tournament_series WHERE id=?').get(sid),seriesRow);same(f.db.prepare('SELECT * FROM tournament_matches WHERE series_id=? ORDER BY id').all(sid),gameRows);same(f.db.prepare('SELECT * FROM tournament_stats WHERE tournament_id=? AND participant_id IN (SELECT participant_id FROM tournament_registrations WHERE team_id IN (?,?)) ORDER BY participant_id').all(t.id,...q.teamIds),statRows);
  same(snapshot(f.db),f.before,'Authenticated tournament APIs preserve normal account world, careers, XP, seasons and meta');assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_earnings WHERE tournament_id=?').get(t.id).n,0);
  await close();f.reopen();await open();const reopened=await request(route);assert.equal(reopened.status,200);same(reopened.body.tournament.series.find(s=>s.id===sid),finished);assert.equal((await request(route+'/result',{method:'POST',body:{seriesId:sid,result:changed}})).status,200);same(f.db.prepare('SELECT * FROM tournament_series WHERE id=?').get(sid),seriesRow);same(f.db.prepare('SELECT * FROM tournament_matches WHERE series_id=? ORDER BY id').all(sid),gameRows);same(snapshot(f.db),f.before);assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{await close();f.close();}
});
