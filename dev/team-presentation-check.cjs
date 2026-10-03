'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs');
const teams=require('../team-presentation.js'),{engine}=require('./simulate.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const participants=[{id:11,participantId:'user:a',team:0,name:'Same name'},{id:12,participantId:'user:b',team:1,name:'Same name'},{id:13,sourceBotId:'bot_0001',team:0,name:'Same name'}];

test('opposing stable participant identities each see their own side blue without changing records or scores',()=>{
  const before=copy(participants),score=[17,29];
  for(const viewer of participants.slice(0,2)){
    const view=teams.create({participants,viewerId:viewer.participantId});
    assert.equal(view.actor(viewer).side,'blue');assert.equal(view.actor(viewer).relation,'self');
    assert.equal(view.actor(participants.find(a=>a.team!==viewer.team)).side,'red');
    assert.equal(view.sides(score)[0].id,viewer.team);assert.equal(view.sides(score)[0].score,score[viewer.team]);
    assert.equal(view.sides(score)[1].score,score[1-viewer.team]);
  }
  assert.deepEqual(participants,before);assert.deepEqual(score,[17,29]);
  assert.equal(teams.create({participants,viewerId:'Same name'}).kind,'neutral');
});
test('neutral and explicit followed perspectives are stable across refresh ordering and preserve canonical keys',()=>{
  for(const rows of [participants,participants.slice().reverse()]){
    const neutral=teams.create({participants:rows,followId:'user:b'});
    assert.equal(neutral.actor('user:a').side,'blue');assert.equal(neutral.actor('user:b').side,'red');
    assert.equal(neutral.actor('user:b').isFocus,true);assert.equal(neutral.perspectiveLabel,'NEUTRAL COLORS');
    const followed=teams.create({participants:rows,followId:'user:b',followTeam:true});
    assert.equal(followed.actor('user:b').side,'blue');assert.equal(followed.actor('user:a').side,'red');
    assert.equal(followed.perspectiveLabel,'FOLLOWED TEAM IS BLUE');
  }
  const tournament=teams.create({teamIds:['final:away','final:home'],participants:[{participantId:'account:42',team:'final:home'}],viewerId:'account:42'});
  assert.equal(tournament.sides([2,3])[0].id,'final:home');assert.equal(tournament.sides([2,3])[0].score,3);
});
test('FFA highlights only self or the followed competitor and exposes no invented team scores or allies',()=>{
  for(const options of [{viewerId:'user:b'},{followId:'user:b'}]){
    const view=teams.create({mode:'deathmatch',participants,...options});
    assert.equal(view.actor('user:b').side,'blue');
    for(const a of participants.filter(a=>a.participantId!=='user:b')){assert.equal(view.actor(a).side,'red');assert.equal(view.actor(a).relation,'competitor');}
    assert.deepEqual(view.sides([8,9]),[]);assert.equal(view.team(0).label,'COMPETITOR');
  }
  const neutral=teams.create({mode:'deathmatch',participants});assert.ok(participants.every(a=>neutral.actor(a).side==='red'));
});

const source=fs.readFileSync(require.resolve('../game.js'),'utf8').replace('window.SAR = {','window.__teamCheck={matchTeamPresentation,matchHudState,updateHud,updateSpectatorHud,renderScoreboard,paintKillfeedItem,spectatorAction,sessionResultHtml,matchReportHtml};window.SAR = {');
function custom(mode='tdm',playerTeam=0){
  const e=engine({},source),names=Object.keys(e.context.SAR.getProfiles()),m=e.context.SAR.startCustomMatch({mode,player:true,playerTeam,bots:names.slice(0,3).map((name,i)=>({name,team:i===0?playerTeam:1-playerTeam}))});
  return {e,m,api:e.context.__teamCheck,state:e.dev.inspect().state,player:m.participants.find(a=>a.isPlayer)};
}
for(const side of [0,1])test('shipped TDM HUD, scoreboard, render snapshot, killfeed and result use local side '+side,()=>{
  const {e,m,api,player}=custom('tdm',side);m.score=[12,24];
  const before=m.participants.map(a=>[a.id,a.team]),scores=m.score.slice();
  api.updateHud(e.dev.now());api.renderScoreboard();
  assert.equal(e.ui.element('teamLabel').textContent,'BLUE');assert.equal(e.ui.element('teamLabel').style.color,teams.COLORS.blue);
  const hud=e.ui.element('teamScoreLabel').innerHTML;assert.match(hud,new RegExp('BLUE '+m.score[side]));assert.match(hud,new RegExp('RED '+m.score[1-side]));
  const snapshot=e.dev.renderSnapshot();assert.equal(snapshot.actors.find(a=>a.id===player.id).team,side);assert.equal(snapshot.actors.find(a=>a.id===player.id).presentation.side,'blue');
  assert.ok(snapshot.actors.filter(a=>a.team!==side).every(a=>a.presentation.side==='red'));
  const victim=m.participants.find(a=>a.team!==side),el=e.ui.document.createElement('div');el.sarEvent={matchId:m.id,matchKey:m.matchId,killer:player,victim,weapon:'AR-15',head:false};api.paintKillfeedItem(el);
  assert.match(el.innerHTML,/<small>BLUE<\/small>/);assert.match(el.innerHTML,/<small>RED<\/small>/);assert.match(el.innerHTML,new RegExp(teams.COLORS.blue));
  m.status='active';e.dev.endMatch(m,side,'time');const result=copy(m.result),html=api.sessionResultHtml(m.result);assert.match(html,new RegExp('BLUE '+scores[side]));assert.match(html,new RegExp('RED '+scores[1-side]));
  assert.deepEqual(m.result,result);assert.deepEqual(m.participants.map(a=>[a.id,a.team]),before);assert.deepEqual(m.score,scores);
  assert.equal(e.dev.balanceFingerprint(),'b-b9bdf00b');
});
test('shipped spectator cycling stays canonical, FFA switches highlight only and all four matches stay intact',()=>{
  const e=engine({},source),state=e.dev.inspect().state,api=e.context.__teamCheck,ids=state.matches.map(m=>m.matchId);
  state.mode='spectate';state.running=true;state.spectateMatchId=0;state.spectateActorId=state.matches[0].participants.find(a=>a.team===1).id;
  for(const side of ['blue','red','red','blue']){api.spectatorAction(side);const view=e.context.SAR.getTeamPresentation(0),actor=state.matches[0].participants.find(a=>a.id===state.spectateActorId);assert.equal(view.actor(actor).side,side);assert.match(e.ui.element('spectateGame').textContent,/NEUTRAL COLORS/);}
  for(let i=0;i<4;i++){api.spectatorAction('next-match');assert.equal(state.spectateMatchId,(i+1)%4);}
  assert.deepEqual(state.matches.map(m=>m.matchId),ids);
  const {e:ffa,m,api:ffaApi,state:ffaState,player}=custom('deathmatch');
  const snapshot=ffa.dev.renderSnapshot();assert.equal(snapshot.actors.find(a=>a.id===player.id).presentation.side,'blue');assert.equal(new Set(snapshot.actors.map(a=>a.team)).size,m.participants.length);
  player.isPlayer=false;ffaState.playerMatchId=null;ffaState.mode='spectate';ffaState.spectateMatchId=m.id;ffaState.spectateActorId=m.participants[1].id;
  for(let i=0;i<3;i++){const s=ffa.dev.renderSnapshot();assert.equal(s.actors.filter(a=>a.presentation.side==='blue').length,1);assert.equal(s.actors.find(a=>a.presentation.side==='blue').id,ffaState.spectateActorId);ffaApi.spectatorAction('next-bot');}
  assert.deepEqual(ffa.context.SAR.getTeamPresentation(m.id).sides(m.score),[]);
});
