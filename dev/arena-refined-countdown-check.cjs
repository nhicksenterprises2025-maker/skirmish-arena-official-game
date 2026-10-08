'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {engine}=require('./simulate.cjs');
const checks=[];
function check(name,run){run();checks.push(name);console.log('PASS '+name);}
function context(e,{human=true,offset=0,id='game1'}={}){
 const bots=Object.values(e.context.SAR.getProfiles()).slice(offset,offset+(human?9:10)).map(p=>({id:p.id,name:p.name,kind:'bot'}));
 const people=human?[{id:'countdown-owner',name:'Fixture',kind:'user'},...bots]:bots;
 return {tournamentId:'countdown-cup',tournamentKind:'custom',seriesId:'countdown-series',gameId:'countdown-series:'+id,teamIds:['blue','red'],teams:[{id:'blue',participants:people.slice(0,5)},{id:'red',participants:people.slice(5)}],hasPlayer:human,userId:'countdown-owner'};
}
const actorState=match=>match.participants.map(a=>({id:a.id,x:a.x,y:a.y,hp:a.hp,stats:{...a.stats},ammo:a.slots.map(s=>s.ammo)}));
function isolated(human=true){const e=engine(),m=e.context.SAR.startTournamentGame(context(e,{human}));for(const other of e.dev.inspect().state.matches)if(other&&other!==m)other.status='ended';return {e,m};}
check('First human tournament game shows the existing 3-second countdown and freezes combat/XP',()=>{
 const {e,m}=isolated(),before=actorState(m),progress=JSON.stringify(e.context.SAR.getProgression()),overlay=e.ui.element('matchCountdown');
 assert.equal(m.status,'countdown');assert.equal(m.countdownUntil-m.countdownStartedAt,3000);assert.equal(overlay.classList.contains('hidden'),false);assert.equal(overlay.querySelector('strong').textContent,'3');
 assert.equal(e.dev.fire(m.participants[0],0,e.dev.now()),false);e.step(2.999);assert.equal(m.status,'countdown');assert.deepEqual(actorState(m),before);assert.equal(JSON.stringify(e.context.SAR.getProgression()),progress);assert.deepEqual(m.score,[0,0]);assert.equal(m.durationMs,300000);assert.equal(m.limit,50);
 e.step(.001);assert.equal(m.status,'active');assert.equal(m.startedAt,m.countdownUntil);assert.equal(overlay.querySelector('strong').textContent,'FIGHT');assert.equal(overlay.classList.contains('fight'),true);
});
check('Late/rebuilt countdown HUD reconstructs current authoritative number without replaying cues',()=>{
 const {e,m}=isolated(),events=[];e.context.SARAudio={emit:event=>events.push(event),flush(){}};e.step(1.2);
 const overlay=e.ui.element('matchCountdown');overlay.classList.add('hidden','fight');overlay.querySelector('strong').textContent='STALE';overlay.querySelector('span').textContent='STALE';e.step(.1);
 assert.equal(overlay.classList.contains('hidden'),false);assert.equal(overlay.classList.contains('fight'),false);assert.equal(overlay.querySelector('strong').textContent,'2');assert.equal(overlay.querySelector('span').textContent,'MATCH STARTS IN');
 const current=e.context.SAR.getState().matches.find(row=>row?.matchId===m.matchId),render=e.dev.renderSnapshot();assert.equal(current.countdown.phase,'countdown');assert.equal(current.countdown.number,2);assert.equal(render.countdown.number,2);assert.equal(render.countdown.endsAt,m.countdownUntil);
 assert.equal(events.filter(event=>event.type==='countdown').length,1);e.step(1.7);assert.equal(m.status,'active');assert.equal(events.filter(event=>event.type==='fight').length,1);e.step(.7);assert.equal(overlay.classList.contains('hidden'),true);e.step(.2);assert.equal(events.filter(event=>event.type==='fight').length,1);
});
check('Bot-only games progress through countdown while a separate human HUD keeps its own countdown',()=>{
 const e=engine(),bot=e.context.SAR.startTournamentGame(context(e,{human:false,offset:10,id:'other'})),before=actorState(bot);e.step(1);
 const human=e.context.SAR.startTournamentGame(context(e)),overlay=e.ui.element('matchCountdown');for(const other of e.dev.inspect().state.matches)if(other&&other!==human&&other!==bot)other.status='ended';
 assert.equal(bot.status,'countdown');assert.equal(overlay.querySelector('strong').textContent,'3');e.step(1.9);assert.deepEqual(actorState(bot),before);assert.equal(human.status,'countdown');assert.equal(bot.status,'countdown');e.step(.1);assert.equal(bot.status,'active');assert.equal(human.status,'countdown');assert.equal(overlay.querySelector('strong').textContent,'1');e.step(1);assert.equal(human.status,'active');assert.equal(bot.startedAt,bot.countdownUntil);assert.equal(overlay.querySelector('strong').textContent,'FIGHT');e.step(.7);assert.equal(overlay.classList.contains('hidden'),true);
});
check('Repeated game entry reuses one reservation, roster, countdown and audio cue',()=>{
 const e=engine(),events=[];e.context.SARAudio={emit:event=>events.push(event),flush(){}};const input=context(e),m=e.context.SAR.startTournamentGame(input),actors=e.dev.inspect().state.actors.length,deadline=m.countdownUntil,reserved=m.reservedBots.slice();e.step(.5);
 assert.equal(e.context.SAR.startTournamentGame(input),m);assert.equal(e.dev.inspect().state.actors.length,actors);assert.equal(m.countdownUntil,deadline);assert.deepEqual(m.reservedBots,reserved);assert.equal(e.dev.inspect().state.matches.filter(row=>row?.context?.gameId===input.gameId).length,1);assert.equal(events.filter(event=>event.type==='countdown').length,1);
});
check('Late update keeps the authoritative start/deadline and the full gameplay time limit',()=>{
 const {e,m}=isolated();e.step(3.8);assert.equal(m.status,'active');assert.equal(m.startedAt,m.countdownUntil);assert.equal(m.fightUntil,m.countdownUntil+650);assert.equal(e.ui.element('matchCountdown').classList.contains('hidden'),true);const current=e.context.SAR.getState().matches.find(row=>row?.matchId===m.matchId);assert.equal(current.timeLeftMs,299200);assert.equal(current.countdown.phase,'none');
});
check('Normal TDM/DM starts retain their match rules and the player countdown',()=>{
 const e=engine(),before=e.context.SAR.getState();assert.deepEqual(before.matches.map(row=>row.mode),['tdm','tdm','deathmatch','deathmatch']);assert.deepEqual(before.matches.map(row=>[row.limit,row.durationMs]),[[60,300000],[60,300000],[30,240000],[30,240000]]);assert.ok(before.matches.every(row=>row.status==='active'));
 e.dev.queueForMatch();const m=e.dev.inspect().state.matches[e.dev.inspect().state.playerMatchId];assert.equal(m.status,'countdown');assert.equal(m.countdownUntil-m.countdownStartedAt,3000);const beforeActors=actorState(m);e.step(2.99);assert.equal(m.status,'countdown');assert.deepEqual(actorState(m),beforeActors);e.step(.01);assert.equal(m.status,'active');assert.equal(m.limit,60);assert.equal(m.durationMs,300000);
});
check('Delayed normal-player countdown preserves its existing gameplay start and FIGHT duration',()=>{
 const e=engine();e.dev.queueForMatch();const m=e.dev.inspect().state.matches[e.dev.inspect().state.playerMatchId];e.step(3.8);assert.equal(m.status,'active');assert.equal(m.startedAt,e.dev.now());assert.equal(m.fightUntil,e.dev.now()+650);assert.equal(e.context.SAR.getState().matches.find(row=>row?.matchId===m.matchId).timeLeftMs,300000);assert.equal(e.ui.element('matchCountdown').querySelector('strong').textContent,'FIGHT');e.step(.65);assert.equal(e.ui.element('matchCountdown').classList.contains('hidden'),true);
 if(process.env.SAR_BASELINE_SOURCE){const before=engine({},fs.readFileSync(process.env.SAR_BASELINE_SOURCE,'utf8'));before.dev.queueForMatch();before.step(3.8);before.step(.65);for(let i=0;i<40;i++){before.step(.1);e.step(.1);}const a=before.dev.inspect().state.matches[before.dev.inspect().state.playerMatchId];assert.equal(m.startedAt,a.startedAt);assert.deepEqual(actorState(m),actorState(a));assert.deepEqual(m.score,a.score);}
});
if(process.env.SAR_TEST_OUTPUT){fs.mkdirSync(path.dirname(process.env.SAR_TEST_OUTPUT),{recursive:true});fs.writeFileSync(process.env.SAR_TEST_OUTPUT,JSON.stringify({checks,passed:checks.length},null,2));}
console.log(checks.length+' countdown acceptance groups passed');
