'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Circuit=require('../tournaments.cjs'),Runtime=require('../tournament-runtime.cjs'),Presentation=require('../tournament-presentation.cjs');
const {fixture,fillTeams}=require('../../dev/live-circuit-tournament-check.cjs');
const {game}=require('../../dev/arena-refined-tournament-series-check.cjs');
const USER='live-circuit-fixture',clone=value=>JSON.parse(JSON.stringify(value));
function start(f){const now=Date.now(),t=Circuit.createCustom(f.db,USER,{name:'Presentation Fixture',startsAt:now},now);fillTeams(f.db,t.id,now);return {now,t:Circuit.startTournament(f.db,USER,t.id,now)};}
test('official default branding changes without renaming custom events or historical snapshots',()=>{
 const f=fixture();try{
  const t=Circuit.scheduleOfficial(f.db,USER,f.season)[0];assert.equal(t.name,Presentation.OFFICIAL_TITLE);
  assert.equal(Presentation.displayName({...t,name:'Live Circuit Oct 7'}),Presentation.OFFICIAL_TITLE);
  assert.equal(Presentation.displayName({...t,name:'Live Circuit Oct 7',status:'COMPLETED'}),'Live Circuit Oct 7');
  assert.equal(Presentation.displayName({...t,name:'Live Circuit Oct 7',kind:'custom'}),'Live Circuit Oct 7');
  assert.equal(Presentation.displayName({...t,name:'An Existing Official Named Cup'}),'An Existing Official Named Cup');
 }finally{f.close();}
});
test('boards reconcile actual participant contributions, independent team kills and weighted accuracy',()=>{
 const f=fixture();try{
  const {now,t}=start(f),s=t.series[0],result=game(t,s,[56,30]);
  // Preserve the resolved score while making individual contributions unequal.
  result.stats[0].kills+=result.stats[1].kills;result.stats[1].kills=0;result.stats[0].damage+=500;
  const saved=Circuit.recordGame(f.db,USER,t.id,s.id,result,now),before=f.db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(t.id).bracket_json,detail=Presentation.detail(f.db,saved);
  const teams=detail.presentation.teamLeaderboard,players=detail.presentation.playerLeaderboard,first=teams.find(row=>row.teamId===s.teamIds[0]),ours=players.filter(row=>row.teamId===first.teamId);
  assert.equal(first.games,1);assert.equal(first.aggregateKills,56);assert.equal(first.kills,56);assert.equal(first.damage,ours.reduce((sum,p)=>sum+p.damage,0));
  assert.equal(first.accuracy,100*first.hits/first.shots);assert.equal(ours[0].kills,result.stats[0].kills);assert.equal(ours[1].kills,0);assert.notEqual(ours[0].kills,56/5);
  assert.equal(teams.find(row=>row.teamId===t.teams[1].id).kills,null);assert.equal(players.find(row=>row.teamId===t.teams[1].id).games,null);
  assert.equal(f.db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(t.id).bracket_json,before);
 }finally{f.close();}
});
test('live projections merge individual stats once and exclude games already in the authoritative ledger',()=>{
 const f=fixture();try{
  const {t}=start(f),s=t.series[0],resolved=game(t,s,[10,5]),stats=resolved.stats.map(row=>({participantId:row.participantId,stats:{...row,games:1}}));
  const recorded={...t,series:t.series.map(row=>row.id===s.id?{...row,games:[resolved]}:row)},live={tournamentId:t.id,seriesId:s.id,gameId:s.id+':game2',score:[20,10],status:'active',stats:game(t,s,[20,10]).stats};
  const before=clone(stats),once=Presentation.leaderboards(recorded,stats,[live]),twice=Presentation.leaderboards(recorded,stats,[live,live]);assert.deepEqual(once,twice);assert.deepEqual(stats,before);
  const row=once.teamLeaderboard.find(team=>team.teamId===s.teamIds[0]);assert.equal(row.aggregateKills,30);assert.equal(row.recordedAggregateKills,10);assert.equal(row.liveGames,1);assert.equal(row.games,1);assert.equal(row.kills,30);
  assert.deepEqual(Presentation.leaderboards(recorded,stats,[{...live,gameId:resolved.id}]),Presentation.leaderboards(recorded,stats));
 }finally{f.close();}
});
test('history preserves recorded legacy names and unknown identities while blocking premature aggregate champions',()=>{
 const legacy={id:'legacy',kind:'official',name:'Live Circuit Recorded Cup',startsAt:1,status:'COMPLETED',rulesetId:Circuit.LEGACY_RULESET,teams:[],series:[],placements:[]};
 const old=Presentation.history(legacy,{results:{winnerBotId:'bot_0042',token:'never-public'}});assert.equal(old.name,legacy.name);assert.equal(old.winnerParticipantId,'bot_0042');assert.equal(old.winnerTeamId,null);assert.deepEqual(old.winningRoster,[]);assert.equal(old.available,false);assert.ok(!JSON.stringify(old).includes('never-public'));
 const t={...legacy,rulesetId:Circuit.AGGREGATE_RULESET,teams:[{id:'a',name:'Recorded Team',participants:[{id:'p',name:'Original Name',kind:'bot'}]}],placements:[{teamId:'a',placement:1}],series:[{id:'final',round:'FINAL',teamIds:['a','b'],winnerTeamId:'a',games:Array.from({length:4},()=>({})),remainingGames:1,status:'in-progress',advancement:{status:'pending'}}]};
 assert.equal(Presentation.history(t).winnerTeamId,null);t.series[0].games.push({});t.series[0].remainingGames=0;t.series[0].status='complete';t.series[0].advancement.status='decided';assert.equal(Presentation.history(t).winnerTeamName,'Recorded Team');assert.equal(Presentation.history(t).winningRoster[0].name,'Original Name');
 t.series[0].advancement.status='tied';assert.equal(Presentation.history(t).winnerTeamId,null);
});
test('public schedule remains unconfirmed and never publishes draft windows or private runtime data',()=>{
 const t={id:'t',kind:'official',name:'Cup',startsAt:42,series:[{id:'s',teamIds:['a','b']}],teams:[],placements:[],status:'ACTIVE'};
 const value=Presentation.presentation(t,[],[{tournamentId:'t',gameId:'s:game1',seriesId:'s',status:'countdown',score:[0,0],elapsedMs:0,countdownRemainingMs:1500,sourceHash:'private'}],{runtimeGames:{source:'private',data:'secret'},token:'secret'});
 assert.equal(value.schedule.status,'unconfirmed');assert.equal(value.schedule.eventStartsAt,42);assert.deepEqual(value.schedule.rounds,[]);assert.deepEqual(value.schedule.games,[]);assert.equal(value.schedule.liveGames[0].countdownRemainingMs,1500);assert.ok(!JSON.stringify(value).includes('secret'));assert.ok(!JSON.stringify(value).includes('private'));
});
test('real runtime presentation reads current tournament actors without stepping or rewriting checkpoints',()=>{
 const f=fixture();try{
  const now=Date.now(),created=Circuit.createCustom(f.db,USER,{name:'Live Read Fixture',startsAt:now},now),filled=Runtime.fillBots(f.db,USER,created,now),t=Circuit.startTournament(f.db,USER,filled.id,now);
  Runtime.advance(f.db,{now,budget:60});const before=f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json,games=Runtime.presentationGames(f.db,t.id);assert.equal(games.length,1);assert.equal(games[0].status,'countdown');assert.equal(games[0].stats.length,10);assert.equal(games[0].score.reduce((n,k)=>n+k,0),0);assert.ok(games[0].countdownRemainingMs>0);
  const detail=Presentation.detail(f.db,Circuit.getTournament(f.db,USER,t.id),games);assert.equal(detail.presentation.playerLeaderboard.filter(p=>p.liveGames===1).length,10);assert.equal(f.db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(t.id).metadata_json,before);assert.ok(!JSON.stringify(detail).includes('headless-reference-state-v1'));
  Runtime.advance(f.db,{now,budget:500});const active=Runtime.presentationGames(f.db,t.id)[0];assert.equal(active.status,'active');assert.equal(active.countdownRemainingMs,0);assert.equal(active.stats.reduce((n,p)=>n+p.kills,0),active.score.reduce((n,k)=>n+k,0));assert.ok(active.stats.reduce((n,p)=>n+p.shots,0)>0);
 }finally{f.close();}
});
test('partial historical ledgers do not report false zero games or aggregate kills',()=>{
 const t={id:'past',kind:'official',name:'Original',status:'COMPLETED',rulesetId:Circuit.LEGACY_RULESET,teams:[{id:'team',name:'Recorded Team',participants:[{id:'p',name:'Past Player',kind:'user'}]}],series:[],placements:[{teamId:'team',placement:1}]};
 const rows=Presentation.leaderboards(t,[{participantId:'p',stats:{games:2,kills:42,deaths:10,assists:3,damage:11000,shots:200,hits:100,headshots:5}}]);
 assert.equal(rows.teamLeaderboard[0].games,null);assert.equal(rows.teamLeaderboard[0].aggregateKills,null);assert.equal(rows.teamLeaderboard[0].kills,42);assert.equal(rows.playerLeaderboard[0].games,2);
});
test('hypothetical confirmed saved windows use the existing planner and expose no private state',()=>{
 const Schedule=require('../tournament-schedule.cjs'),policy=Schedule.confirmedPolicy({confirmed:true,confirmedAt:Date.UTC(2026,9,7),timezone:'America/New_York',checkInInsidePreparation:true,checkInMs:90000,preparationMs:120000,gameplayMs:300000,countdownMs:3000,rounds:Schedule.DRAFT_ROUNDS,roundEnds:{QF:23,SF:48,FINAL:89},aggregateTiePolicy:'fixture-only',noShowReturnPolicy:'fixture-only',payoutPolicy:'fixture-only'});
 // This fixture represents a future persisted, confirmed policy. It never
 // writes production metadata or treats the proposal as the user's approval.
 const startsAt=Date.UTC(2026,9,9,23,30),t={id:'hypothetical',kind:'official',startsAt,series:[{id:'q',round:'QF',games:[]}]},saved={schedule:{policy,gameStates:{'q:game1':{error:'token=private-secret'}}}};
 const value=Presentation.schedule(t,[],saved,startsAt);assert.equal(value.status,'confirmed');assert.equal(value.games.length,11);assert.equal(value.seriesGames.length,3);assert.equal(value.rounds[0].endsAt,startsAt+23*60000);assert.equal(value.rounds[1].endsAt,startsAt+48*60000);assert.equal(value.rounds[2].endsAt,startsAt+89*60000);assert.equal(value.games[0].checkInCloseAt,startsAt+90000);assert.equal(value.games[0].matchStartAt,startsAt+120000);assert.equal(value.seriesGames[0].conflict,'PREPARATION_ERROR');assert.ok(!JSON.stringify(value).includes('private-secret'));
 assert.equal(Presentation.schedule(t,[],{schedule:{policy:{...policy,confirmed:false}}},startsAt).status,'conflict');assert.equal(Presentation.schedule({...t,kind:'custom'},[],saved,startsAt).status,'event-time-only');
});
test('malformed historical metadata is reported unavailable without suppressing recorded boards or history',()=>{
 const f=fixture();try{const {t}=start(f);f.db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run('{not-json',t.id);const value=Presentation.detail(f.db,t);assert.equal(value.presentation.schedule.status,'unavailable');assert.equal(value.presentation.teamLeaderboard.length,8);assert.equal(value.tournament.id,t.id);}finally{f.close();}
});
test('supported legacy placement maps retain recorded champion, metrics, roster names and stored bytes',()=>{
 const f=fixture();try{
  const {t}=start(f),state=JSON.parse(f.db.prepare('SELECT bracket_json FROM tournaments WHERE id=?').get(t.id).bracket_json);
  state.rulesetId=Circuit.LEGACY_RULESET;state.placements={[t.teams[0].id]:{placement:1,games:7,kills:42},[t.teams[1].id]:2};
  f.db.prepare('UPDATE tournaments SET status=?,bracket_json=? WHERE id=?').run('COMPLETED',JSON.stringify(state),t.id);
  const before=f.db.prepare('SELECT * FROM tournaments WHERE id=?').get(t.id),saved=Circuit.getTournament(f.db,USER,t.id),value=Presentation.detail(f.db,saved).presentation;
  assert.equal(value.history.winnerTeamId,t.teams[0].id);assert.equal(value.history.winnerTeamName,t.teams[0].name);assert.equal(value.history.winningRoster[0].name,t.teams[0].participants[0].name);assert.equal(value.history.placements[0].kills,42);assert.equal(value.history.placements[1].placement,2);assert.equal(value.teamLeaderboard.find(p=>p.teamId===t.teams[0].id).placement,1);
  assert.deepEqual(f.db.prepare('SELECT * FROM tournaments WHERE id=?').get(t.id),before);assert.deepEqual(Circuit.getTournament(f.db,USER,t.id).placements,state.placements);
 }finally{f.close();}
});
