'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createServer}=require('../index.cjs'),Runtime=require('../tournament-runtime.cjs'),Circuit=require('../tournaments.cjs');
const {readWorld}=require('../world.cjs');
const {fixtureForPresentation,clone}=require('../../dev/arena-refined-presentation-fixture.cjs');
const {snapshot}=require('../../dev/live-circuit-tournament-check.cjs');
const sum=(rows,key)=>rows.reduce((total,row)=>total+row[key],0);
const records=db=>Object.fromEntries(['tournaments','tournament_series','tournament_matches','tournament_stats','tournament_placements','tournament_earnings'].map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(clone)]));

test('actual authenticated upcoming/history/detail records reconcile, isolate owners and survive SQLite restart without read mutation',async()=>{
 const fixture=fixtureForPresentation(),f=fixture.f,originalStart=Runtime.start;let app,base;
 // Pause only this test's unattended simulation so reads can be compared exactly.
 Runtime.start=()=>()=>{};
 const open=async()=>{app=createServer({db:f.db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;};
 const close=async()=>{if(app?.server.listening)await new Promise(resolve=>app.server.close(resolve));};
 const request=async(route='',cookie=fixture.cookie)=>{const response=await fetch(base+'/api/tournaments'+route,{headers:cookie?{cookie}:{}});return {status:response.status,body:await response.json()};};
 try{
  await open();assert.equal((await request('',null)).status,401);
  const listed=await request();assert.equal(listed.status,200);assert.ok(listed.body.tournaments.some(t=>t.kind==='official'&&t.startsAt>Date.now()&&['REGISTRATION','UPCOMING','ANNOUNCED'].includes(t.status)));
  const history=listed.body.officialHistory;assert.ok(Array.isArray(history));assert.equal(history.length,3);assert.ok(history.every(row=>[fixture.historicalId,fixture.unknownId,fixture.legacyMapId].includes(row.tournamentId)));
  const champion=history.find(row=>row.tournamentId===fixture.historicalId),unknown=history.find(row=>row.tournamentId===fixture.unknownId);
  assert.equal(champion.name,'Live Circuit — Archived Championship');assert.equal(champion.winnerTeamId,fixture.history.series.find(s=>s.round==='FINAL').winnerTeamId);assert.equal(champion.winningRoster.length,5);assert.ok(champion.winningRoster.some(p=>p.name==='Archived Player Name'));assert.equal(champion.placements.length,8);
  assert.equal(unknown.winnerTeamId,null);assert.equal(unknown.winnerTeamName,null);assert.deepEqual(unknown.winningRoster,[]);assert.equal(unknown.available,false);assert.equal(unknown.rulesetId,Circuit.LEGACY_RULESET);
  const legacy=history.find(row=>row.tournamentId===fixture.legacyMapId);assert.equal(legacy.winnerTeamId,'legacy-winners');assert.equal(legacy.winnerTeamName,'Legacy Winners');assert.equal(legacy.winningRoster.length,5);assert.equal(legacy.winningRoster[0].name,'Archived winners 1');assert.deepEqual(legacy.placements.map(p=>[p.teamId,p.placement]),[['legacy-winners',1],['legacy-runners',2]]);assert.equal(legacy.rulesetId,Circuit.LEGACY_RULESET);
  assert.equal(listed.body.tournaments.find(t=>t.id===fixture.activeId).name,'Noah’s Custom Circuit — Keep This Name');
  const detail=await request('/'+fixture.historicalId);assert.equal(detail.status,200);const t=detail.body.tournament,p=detail.body.presentation;
  assert.equal(p.playerLeaderboard.length,40);assert.equal(p.teamLeaderboard.length,8);assert.equal(t.series.reduce((n,s)=>n+s.games.length,0),23);
  for(const player of p.playerLeaderboard){
   const raw=detail.body.stats.find(row=>row.participantId===player.participantId).stats;assert.equal(player.games,raw.games);for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])assert.equal(player[key],raw[key]);
   assert.equal(player.accuracy,raw.shots?100*raw.hits/raw.shots:0);assert.equal(player.kd,raw.deaths?raw.kills/raw.deaths:raw.kills?null:0);
  }
  for(const team of p.teamLeaderboard){
   const series=t.series.filter(s=>s.teamIds.includes(team.teamId)),players=p.playerLeaderboard.filter(player=>player.teamId===team.teamId),kills=series.reduce((total,s)=>total+s.games.reduce((n,g)=>n+g.teamKills[g.teamIds.indexOf(team.teamId)],0),0);
   assert.equal(team.aggregateKills,kills);assert.equal(team.games,series.reduce((total,s)=>total+s.games.length,0));for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])assert.equal(team[key],sum(players,key));
   assert.equal(team.kills,team.aggregateKills);assert.equal(team.accuracy,100*team.hits/team.shots);
  }
  const championRow=p.teamLeaderboard.find(row=>row.status==='champion');assert.equal(championRow.teamId,champion.winnerTeamId);assert.equal(championRow.games,11);assert.equal(championRow.aggregateKills,550);
  const championPlayers=p.playerLeaderboard.filter(row=>row.teamId===championRow.teamId);assert.ok(championPlayers.some(row=>row.kills!==championRow.kills/5),'Individual contribution cannot be team kills divided by five');assert.equal(Math.max(...championPlayers.map(p=>p.kills)),506);
  assert.equal(p.schedule.status,'unconfirmed');assert.equal(p.schedule.timezone,null);assert.deepEqual(p.schedule.rounds,[]);assert.deepEqual(p.schedule.games,[]);
  const active=await request('/'+fixture.activeId);assert.equal(active.body.presentation.schedule.status,'event-time-only');assert.equal(active.body.presentation.teamLeaderboard.filter(t=>t.games===1).length,2);assert.equal(active.body.presentation.playerLeaderboard.filter(p=>p.available).length,10);
  const unknownDetail=await request('/'+fixture.unknownId);assert.equal(unknownDetail.body.presentation.history.available,false);assert.deepEqual(unknownDetail.body.presentation.playerLeaderboard,[]);
  const now=Date.now(),otherId=crypto.randomUUID(),otherToken=crypto.randomBytes(24).toString('base64url');f.db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(otherId,'OtherAudit8Owner','otheraudit8owner','isolated-fixture',now,now);f.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(otherToken).digest('hex'),otherId,now,now+86400000,now);
  assert.equal((await request('/'+fixture.historicalId,'sar_session='+otherToken)).status,404);const foreign=await request('','sar_session='+otherToken);assert.deepEqual(foreign.body.tournaments,[]);assert.deepEqual(foreign.body.officialHistory,[]);
  const normal=snapshot(f.db),stored=records(f.db);for(let i=0;i<3;i++){assert.deepEqual((await request('/'+fixture.historicalId)).body.presentation,p);await request();}assert.deepEqual(records(f.db),stored,'Opening calendar/detail must not change finalization, champion, earnings or ledger');assert.deepEqual(snapshot(f.db),normal,'Presentation preserves accounts, worlds, XP, careers, seasons and normal meta');
  await close();f.reopen();await open();const reopened=await request('/'+fixture.historicalId);assert.deepEqual(reopened.body.presentation,p);assert.deepEqual((await request()).body.officialHistory,history);assert.deepEqual(records(f.db),stored);assert.deepEqual(snapshot(f.db),normal);assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{await close();Runtime.start=originalStart;f.close();}
});

test('the first calendar request refreshes an expired persisted season before generating real upcoming events',async()=>{
 const fixture=fixtureForPresentation(),f=fixture.f,originalStart=Runtime.start;let app;Runtime.start=()=>()=>{};
 try{
  const save=readWorld(f.db,fixture.owner).save,now=Date.now();for(const bot of Object.values(save.bots))bot.recentForm=10;save.seasons.current.startAt=now-16*86400000;save.seasons.current.endAt=now-86400000;if(save.playerSeasons){save.playerSeasons.current.startAt=save.seasons.current.startAt;save.playerSeasons.current.endAt=save.seasons.current.endAt;}
  f.db.prepare('UPDATE worlds SET save_json=?,season_start_at=?,season_end_at=? WHERE user_id=?').run(JSON.stringify(save),save.seasons.current.startAt,save.seasons.current.endAt,fixture.owner);
  // Recreate the original outage condition: all events from the saved season
  // are in the past, and no scheduler timer has run since it expired.
  for(const id of fixture.officialIds)f.db.prepare('DELETE FROM tournaments WHERE id=?').run(id);
  // The fixed recurrence planner can now fill future dates even from an old
  // season. Leave the calendar empty to verify the first GET still refreshes
  // the authoritative season before generating those records.
  assert.equal(f.db.prepare("SELECT count(*) n FROM tournaments WHERE kind='official' AND starts_at>?").get(now).n,0);
  const protectedBefore=snapshot(f.db),oldEvents=f.db.prepare('SELECT id,starts_at,bracket_json,name FROM tournaments ORDER BY id').all().map(clone),oldNumber=save.seasons.current.number,careerBefore=clone(save.playerCareer),progressBefore=clone(save.progression);
  app=createServer({db:f.db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/tournaments',{headers:{cookie:fixture.cookie}});assert.equal(response.status,200);const data=await response.json(),refreshed=readWorld(f.db,fixture.owner).save;
  assert.equal(refreshed.seasons.current.number,oldNumber+1);assert.ok(refreshed.seasons.current.endAt>now);assert.ok(data.tournaments.some(t=>t.kind==='official'&&t.startsAt>now&&t.seasonId===String(oldNumber+1)),'One request must show future records from the authoritative refreshed season');
  assert.deepEqual(refreshed.playerCareer,careerBefore);assert.deepEqual(refreshed.progression,progressBefore);const after=snapshot(f.db);for(const table of Object.keys(protectedBefore).filter(t=>!['worlds','seasons'].includes(t))){const normalize=rows=>table==='bots'?rows.map(({updated_at,...values})=>values):rows;assert.deepEqual(normalize(after[table]),normalize(protectedBefore[table]),table+' values are preserved by deadline refresh');}
  for(const old of oldEvents){const same=f.db.prepare('SELECT id,starts_at,bracket_json,name FROM tournaments WHERE id=?').get(old.id);assert.deepEqual(clone(same),old,'Existing schedule anchor, historical results and custom name remain intact');}
  const ids=data.tournaments.map(t=>t.id).sort(),again=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/tournaments',{headers:{cookie:fixture.cookie}});assert.deepEqual((await again.json()).tournaments.map(t=>t.id).sort(),ids,'Repeated reads do not generate duplicate events');
 }finally{if(app?.server.listening)await new Promise(resolve=>app.server.close(resolve));Runtime.start=originalStart;f.close();}
});
