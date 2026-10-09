'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Stats=require('../../profile-stats.js'),XP=require('../../progression.js'),Profiles=require('../profile-participations.cjs');
const {engine}=require('../../dev/simulate.cjs'),{profileFixture,clone}=require('../../dev/arena-refined-profile-fixture.cjs');
const Circuit=require('../tournaments.cjs'),{fixture,fillTeams,snapshot}=require('../../dev/live-circuit-tournament-check.cjs'),{game}=require('../../dev/arena-refined-tournament-series-check.cjs');
const {createServer}=require('../index.cjs');
const USER='live-circuit-fixture';
function officialEvent(id,participantId,at,extra={}){
 return {id,kind:'official',status:'ACTIVE',teams:[{id:'team:one',participants:[{id:participantId,kind:'user'}]},{id:'team:two',participants:[{id:'opponent',kind:'bot'}]}],series:[{id:id+':QF0',games:[{id:id+':QF0:game1',completedAt:at,winnerTeamId:'team:two',mode:'tdm',sessionType:'tournament',stats:[{participantId,kills:6,deaths:12,assists:3,damage:1100,taken:1600,headshots:2,shots:50,hits:20,timeAlive:100,timePlayed:150}],...extra}]}]};
}
const projection=(f,officialRecords,extra={})=>Stats.project(f.world,{participantId:f.participantId,accountId:f.participantId,officialRecords,...extra});
test('Combined includes accepted official game once alongside TDM/DM/Ranked, excludes custom/incomplete and derives raw weighted ratios',()=>{
 const f=profileFixture(),before=JSON.stringify(f.world),event=officialEvent('official:fixture',f.participantId,f.now-1000),custom={...clone(event),id:'custom:event',kind:'custom'};
 const incomplete=clone(event);delete incomplete.series[0].games[0].completedAt;
 const debug=clone(event);debug.series[0].games[0].debug=true;
 const events=[event,event,custom,incomplete,debug],official=Stats.officialParticipations(events,f.participantId),p=projection(f,official);
 assert.equal(p.totals.games,4);assert.equal(p.totals.kills,38);assert.equal(p.totals.deaths,27);assert.equal(p.totals.assists,13);assert.equal(p.totals.damage,6300);
 assert.equal(p.totals.shots,180);assert.equal(p.totals.hits,79);assert.equal(p.totals.headshots,9);assert.equal(p.ratios.kd,38/27);assert.equal(p.ratios.accuracy,79/180);assert.equal(p.ratios.winRate,2/4);assert.equal(p.ratios.headshotKillRate,9/38);
 assert.equal(p.totals.taken,null);assert.equal(p.totals.timePlayed,null);assert.equal(p.knownTotals.taken,1600);assert.equal(p.knownTotals.timePlayed,150,'Unknown historical playtime is not invented');
 assert.equal(p.included.find(row=>row.queue==='tournament').games,1);assert.equal(p.records.filter(row=>row.matchId==='match:audit9:ranked-tdm').length,1);
 assert.equal(JSON.stringify(f.world),before);assert.equal(projection(f,official,{kind:'ranked'}).totals.games,1);assert.ok(p.policy.excluded.includes('Custom tournaments'));
});
test('Official identity wins over copied ordinary rows, refuses foreign accounts, filters saved seasons and preserves missing measurements',()=>{
 const f=profileFixture(),event=officialEvent('official:fixture',f.participantId,f.now-1000),official=Stats.officialParticipations([event],f.participantId),id=official[0].matchId;
 f.world.playerCareer.recentMatches.push({matchId:id,mode:'tdm',sessionType:'standard',eligible:true,at:official[0].at,won:true,kills:999});
 let p=projection(f,official);assert.equal(p.totals.games,4);assert.equal(p.totals.kills,38);assert.equal(p.coverage.conflictingRecords,0);
 assert.equal(projection(f,official,{scope:'season',seasonNumber:1}).totals.games,1);assert.equal(projection(f,official,{scope:'season',seasonNumber:2}).totals.games,3);
 assert.equal(Stats.project(f.world,{participantId:'another-account',accountId:f.participantId,officialRecords:official}).totals.games,0);
 delete event.series[0].games[0].stats[0].hits;p=projection(f,Stats.officialParticipations([event],f.participantId));assert.equal(p.ratios.accuracy,null);assert.equal(p.totals.hits,null);
});
test('Per-game roster snapshots retain original participation and outcome after a permanent no-show replacement',()=>{
 const f=profileFixture(),event=officialEvent('official:replacement',f.participantId,f.now-1000),original=clone(event.teams);
 event.series[0].games[0].teams=original;event.teams[0].participants=[{id:'replacement:bot',kind:'bot'}];event.replacementHistory=[{previous:{id:f.participantId},replacement:{id:'replacement:bot'},teamId:'team:one'}];
 const records=Stats.officialParticipations([event],f.participantId);assert.equal(records.length,1);assert.equal(records[0].won,false);
 const newer=clone(event.series[0].games[0]);newer.id+=':later';newer.stats[0].participantId='replacement:bot';newer.teams=clone(event.teams);event.series[0].games.push(newer);
 assert.equal(Stats.officialParticipations([event],f.participantId).length,1);delete event.series[0].games[0].teams;assert.equal(Stats.officialParticipations([event],f.participantId)[0].won,undefined,'Missing historical roster is not inferred from the replacement');
});
function accepted(f,name){
 const now=Date.now(),created=Circuit.createCustom(f.db,USER,{name,startsAt:now},now);fillTeams(f.db,created.id,now);const t=Circuit.startTournament(f.db,USER,created.id,now),s=t.series.find(s=>s.teamIds.some(id=>t.teams.find(team=>team.id===id).participants.some(p=>p.id===USER))),result=game(t,s,[56,30]);
 for(const stat of result.stats){stat.taken=300;stat.timePlayed=180;}
 const saved=Circuit.recordGame(f.db,USER,t.id,s.id,result,now+500);
 // Cancel only the remaining synthetic event so its real persistent roster can
 // be reused by the second fixture. Its accepted completed game is retained.
 f.db.prepare("UPDATE tournaments SET status='CANCELLED' WHERE id=?").run(t.id);
 return {t,s,result,saved};
}
test('Server projects individual accepted official ledger rows only and reopens idempotently without changing careers, rewards or summaries',()=>{
 const f=fixture();try{
  const official=accepted(f,'Official ledger fixture'),custom=accepted(f,'Custom ledger fixture');f.db.prepare("UPDATE tournaments SET kind='official' WHERE id=?").run(official.t.id);
  const before=snapshot(f.db),statsBefore=f.db.prepare('SELECT * FROM tournament_stats').all(),p=Profiles.official(f.db,USER);
  assert.equal(p.records.length,1);assert.equal(p.records[0].matchId,official.result.id);assert.notEqual(p.records[0].matchId,custom.result.id);assert.equal(p.records[0].stats.kills,official.result.stats.find(row=>row.participantId===USER).kills);assert.equal(p.records[0].stats.taken,300);assert.equal(p.records[0].stats.timePlayed,180);
  assert.equal(p.records[0].won,official.saved.teams.find(team=>team.participants.some(person=>person.id===USER)).id===official.result.winnerTeamId);assert.equal(Profiles.official(f.db,'foreign-account').records.length,0);
  Circuit.recordGame(f.db,USER,official.t.id,official.s.id,official.result,Date.now()+2000);assert.deepEqual(Profiles.official(f.db,USER),p);assert.deepEqual(snapshot(f.db),before);assert.deepEqual(f.db.prepare('SELECT * FROM tournament_stats').all(),statsBefore);
  f.reopen();assert.deepEqual(Profiles.official(f.db,USER),p);
 }finally{f.close();}
});
test('Real HTTP participation query requires authentication, ignores foreign participant selectors and exposes no private state',async()=>{
 const f=fixture();let app;try{
  const official=accepted(f,'HTTP official fixture');f.db.prepare("UPDATE tournaments SET kind='official' WHERE id=?").run(official.t.id);
  const now=Date.now(),token=crypto.randomBytes(32).toString('base64url');f.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),USER,now,now+86400000,now);
  app=createServer({db:f.db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+app.server.address().port+'/api/profile/participations';
  assert.equal((await fetch(url)).status,401);const response=await fetch(url+'?participantId=other-account',{headers:{cookie:'sar_session='+token}});assert.equal(response.status,200);const body=await response.json();assert.equal(body.owner,USER);assert.equal(body.records.length,1);assert.ok(body.records.every(row=>row.participantId===USER));assert.ok(!JSON.stringify(body).includes(token));assert.ok(!JSON.stringify(body).includes('password'));
 }finally{if(app)await new Promise(resolve=>app.server.close(resolve));f.close();}
});
test('One-time reset archives preserve accepted official contributions without duplicating a surviving relational game or inventing missing history',()=>{
 const f=fixture();try{
  const official=accepted(f,'Archived official fixture');f.db.prepare("UPDATE tournaments SET kind='official' WHERE id=?").run(official.t.id);
  const event=f.db.prepare('SELECT * FROM tournaments WHERE id=?').get(official.t.id),matches=f.db.prepare('SELECT * FROM tournament_matches WHERE tournament_id=?').all(event.id),stats=f.db.prepare('SELECT * FROM tournament_stats WHERE tournament_id=?').all(event.id),reset='combined-archive-fixture';
  f.db.prepare('INSERT INTO tournament_state_resets VALUES(?,?,?,?)').run(reset,Date.now(),null,'{}');f.db.prepare('INSERT INTO tournament_reset_archives VALUES(?,?,?,?,?)').run(reset,event.id,USER,JSON.stringify({event,matches,stats}),Date.now());
  const records=Profiles.official(f.db,USER),world=f.runtime.context.SAR.getUniverse(),before=JSON.stringify(world),once=Stats.project(world,{participantId:USER,accountId:USER,officialRecords:records.records});
  assert.equal(records.records.length,2);assert.equal(once.totals.games,1,'Same authoritative match ID is counted once across both retained sources');assert.equal(records.missingGames,0);
  f.db.prepare('DELETE FROM tournament_matches WHERE tournament_id=?').run(event.id);f.db.prepare('DELETE FROM tournament_stats WHERE tournament_id=?').run(event.id);
  const archived=Profiles.official(f.db,USER);assert.equal(archived.records.length,1);assert.deepEqual(Stats.project(world,{participantId:USER,accountId:USER,officialRecords:archived.records}).totals,once.totals);assert.equal(JSON.stringify(world),before);
  const user=stats.find(stat=>stat.participant_id===USER);user.stats_json=JSON.stringify({...JSON.parse(user.stats_json),games:2,kills:999});f.db.prepare('UPDATE tournament_reset_archives SET snapshot_json=? WHERE reset_id=? AND tournament_id=?').run(JSON.stringify({event,matches,stats}),reset,event.id);
  const partial=Profiles.official(f.db,USER);assert.equal(partial.missingGames,1);assert.equal(partial.records[0].stats.kills,official.result.stats.find(row=>row.participantId===USER).kills,'Summary is coverage metadata only, never fabricated contribution');
 }finally{f.close();}
});
test('Open Combined refreshes once from accepted games, preserves the saved world and restores account-owned official cache offline',()=>{
 const f=profileFixture(),e=engine({'sar-persistent-save':JSON.stringify(f.world)}),account={id:f.participantId,username:'CombinedFixture'};e.context.SARCloud={state:{account,available:false,localMode:true},now:e.context.SARCloud.now};
 e.context.SAR.openCombinedProfile();const before=JSON.stringify(e.context.SAR.getUniverse()),event=officialEvent('official:cached',f.participantId,f.now-1000);
 assert.equal(e.context.SAR.updateTournamentProfileRecords([event]),true);assert.equal(e.context.SAR.getProfileStats().totals.games,4);const html=e.ui.element('modalContent').innerHTML;assert.match(html,/TDM \+ Deathmatch \+ Ranked \+ Official Tournaments/);assert.match(html,/data-profile-metric="games"[\s\S]*?<strong>4<\/strong>/);
 assert.equal(e.context.SAR.updateTournamentProfileRecords([event,event]),false);assert.equal(e.ui.element('modalContent').innerHTML,html);assert.equal(JSON.stringify(e.context.SAR.getUniverse()),before);
 const restarted=engine(Object.fromEntries(e.data));restarted.context.SARCloud={state:{account,available:false,localMode:true},now:restarted.context.SARCloud.now};assert.deepEqual(restarted.context.SAR.getProfileStats(),e.context.SAR.getProfileStats());
 restarted.context.SARCloud.state.account={id:'foreign',username:'Foreign'};assert.equal(restarted.context.SAR.getProfileStats().totals.games,0);assert.equal(restarted.context.SAR.getProfileStats().coverage.authorized,false);
});
test('Combined renders immediately during a deferred official query and applies only its current authenticated account response',async()=>{
 const f=profileFixture(),e=engine({'sar-persistent-save':JSON.stringify(f.world)});let deliver,calls=0;e.context.SARCloud={state:{account:{id:f.participantId,username:'CombinedFixture'},available:true},now:e.context.SARCloud.now,api(){calls++;return new Promise(resolve=>{deliver=resolve;});}};
 e.context.SAR.openCombinedProfile();assert.equal(e.context.SAR.getProfileStats().totals.games,3);assert.match(e.ui.element('modalContent').innerHTML,/COMBINED STATS/);await Promise.resolve();assert.equal(calls,1);e.context.SAR.openCombinedProfile();assert.equal(calls,1);
 const rows=Stats.officialParticipations([officialEvent('official:deferred',f.participantId,f.now-1000)],f.participantId);deliver({owner:f.participantId,schema:1,source:'accepted-official-tournament-games',records:rows,missingGames:0});await new Promise(resolve=>setImmediate(resolve));assert.equal(e.context.SAR.getProfileStats().totals.games,4);assert.match(e.ui.element('modalContent').innerHTML,/data-profile-metric="games"[\s\S]*?<strong>4<\/strong>/);
});
