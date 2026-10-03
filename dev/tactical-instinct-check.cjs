'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const {engine}=require('./simulate.cjs'),T=require('../tactical-instinct.js'),{validateWorld}=require('../server/world.cjs');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8').replace('window.SAR = {','window.__tactical={updateFinalCountdown,matchRemainingMs,customConfiguration,renderPlayMenu,renderCustomSetup,sessionResultHtml,standings,spawnScore,isEnemy,isAlly,tacticalAssessment,revisionSample};window.SAR = {');
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);},make=()=>engine({},source);
function official(e){const w=e.context.SAR.getUniverse();return clone({bots:w.bots,player:w.playerCareer,seasons:w.seasons,playerSeasons:w.playerSeasons,patch:w.patchState,meta:w.meta,archives:w.patchArchives,history:w.balancePatchHistory,dm:w.modeStats});}
function holdBackground(e){e.dev.inspect().state.matches.slice(0,4).forEach(m=>m.status='fixture-held');}
function live(e,m){m.status='active';m.startedAt=e.dev.now();for(const a of m.participants){a.nextThink=Infinity;a.nextDecision=Infinity;a.nextAim=Infinity;}}
function damage(e,owner,victim,amount){e.dev.applyDamage(victim,{owner,weapon:owner.slots[0].name,travel:100},amount,false,e.dev.now());}
{
 const e=make(),w=e.context.SAR.getWeapons();assert.equal(e.dev.balanceFingerprint(),'b-b9bdf00b');assert.equal(e.context.SAR.getUniverse().patchState.balanceVersion,'8.0');assert.equal(w['SR-Aug'].burstSpacing,.065);pass('Balance 8.0 fingerprint and preserved real AUG cadence');
}
for(const mode of ['tdm','deathmatch'])for(const count of [0,1,2,9])for(const difficulty of Object.keys(T.presets)){
 const e=make();holdBackground(e);const before=official(e),names=Object.keys(e.context.SAR.getProfiles()),config={mode,difficulty,player:true,bots:names.slice(0,count).map((name,i)=>({name,team:i<4?0:1}))};
 if(mode==='tdm'&&count<9)config.bots.forEach(b=>b.team=1);
 const m=e.context.SAR.startCustomMatch(config);assert.equal(m.participants.length,count+1);assert.equal(m.eligible,false);assert.equal(m.practice,count===0);assert.equal(m.mode,mode);assert.equal(m.durationMs,mode==='tdm'?300000:240000);
 for(const a of m.participants.filter(a=>!a.isPlayer)){assert.equal(a.sourceBotId,e.context.SAR.getProfiles()[a.name].id);assert.notEqual(a.participantId,a.sourceBotId);assert.equal(a.profile.power,e.context.SAR.getProfiles()[a.name].power);assert.ok(a.sandbox);assert.equal(a.customDifficulty,difficulty);}
 e.step(3.001);for(let i=0;i<15;i++)e.step();const human=m.participants[0],enemy=m.participants.find(a=>e.context.__tactical.isEnemy(human,a));if(enemy)damage(e,human,enemy,250);
 e.dev.endMatch(m,mode==='tdm'?0:human.id,'time');const frozen=JSON.stringify(m.result);damage(e,human,enemy||human,200);e.dev.endMatch(m,1,'score');assert.equal(JSON.stringify(m.result),frozen);e.ui.flush();assert.deepEqual(official(e),before,'Custom cannot modify any official record');assert.equal(e.context.SAR.getState().actors,50);assert.equal(e.context.SAR.getLastResult().sessionType,'custom');
 const html=e.ui.element('modalContent').innerHTML;assert.match(html,/Session statistics only/);assert.match(html,/PLAY AGAIN/);
}
pass('32 custom configurations: solo / 1 / 2 / 9 bots, both modes and four difficulties; ZERO official stat writes');
{
 const e=make();holdBackground(e);const m=e.context.SAR.startCustomMatch({player:false,mode:'tdm',bots:[]});live(e,m);e.step(300);assert.equal(m.result.practice,true);assert.equal(m.result.winner,null);assert.equal(e.context.SAR.getState().actors,50);
 assert.throws(()=>e.context.SAR.startCustomMatch({bots:Array.from({length:5},()=>({sourceBotId:'random',team:0}))}),/five/);
 const p=e.context.SAR.getProfiles(),name=Object.keys(p)[0];assert.throws(()=>e.context.SAR.startCustomMatch({bots:[{name},{name}]}),/one custom slot/);pass('Empty observer practice, uneven team support, capacity and duplicate slot validation');
}
{
 const e=make(),state=e.dev.inspect().state,ids=state.matches.map(m=>m.matchId),roster=e.context.SAR.getProfiles(),before=e.context.SAR.getUniverse();holdBackground(e);
 const m=e.context.SAR.startDeathmatch();assert.equal(m.participants.length,10);assert.equal(state.idleBots.length,1);assert.deepEqual(state.matches.slice(0,4).map(m=>m.matchId),ids);
 const officialActors=state.matches.flatMap(m=>m.participants.filter(a=>!a.isPlayer));assert.equal(new Set(officialActors.map(a=>a.name)).size,49);assert.equal(new Set(m.participants.map(a=>a.team)).size,10);
 live(e,m);const p=m.participants[0],bot=m.participants[1];damage(e,p,bot,35);assert.equal(bot.hp,215);assert.equal(e.context.__tactical.isEnemy(p,bot),true);assert.equal(e.context.__tactical.isAlly(p,bot),false);e.step(1);
 e.dev.endMatch(m,p.id,'time');e.ui.flush();const after=e.context.SAR.getUniverse();assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.bots,before.bots);const afterPatch=structuredClone(after.patchState),beforePatch=structuredClone(before.patchState);delete afterPatch.participantAnalytics;delete beforePatch.participantAnalytics;assert.deepEqual(afterPatch,beforePatch);assert.equal(e.context.SAR.metaRowsForCohort({cohort:'human',mode:'deathmatch'}).reduce((sum,r)=>sum+r.damage,0),35);assert.equal(after.modeStats.deathmatch.player.damage,35);assert.equal(after.modeStats.deathmatch.player.games,1);assert.equal(state.idleBots.length,10);assert.deepEqual(e.context.SAR.getProfiles(),roster);validateWorld(after,{save:before});
 const restored=engine({[e.context.SAR.getSaveInfo().key]:JSON.stringify(after)},source);assert.equal(restored.context.SAR.getUniverse().modeStats.deathmatch.player.damage,35);pass('Official FFA allocates only idle identities, preserves four background games, saves isolated mode records and restores them');
}
for(const tie of [true,false]){
 const e=make();holdBackground(e);const m=e.context.SAR.startDeathmatch();live(e,m);m.participants.forEach(a=>{a.dead=true;a.respawnAt=Infinity;});if(!tie)m.participants[0].stats.damage=1;
 e.step(235);assert.equal(m.status,'active');assert.equal(e.ui.element('finalCountdown').textContent,'5');
 for(const digit of [4,3,2,1]){e.step(1);assert.equal(e.ui.element('finalCountdown').textContent,String(digit));}
 e.step(1);assert.equal(m.status,'ended');assert.equal(m.overtime,false);assert.equal(m.result.durationMs,240000);assert.equal(m.result.winnerIds.length,tie?10:1);assert.equal(e.ui.element('finalCountdown').classList.contains('hidden'),true);assert.ok(Object.isFrozen(m.result.rows[0]));
}
pass('Authoritative 5→1 countdown, four-minute FFA expiry, exact ties and damage tiebreak');
{
 const e=make();holdBackground(e);const m=e.context.SAR.startDeathmatch();live(e,m);const p=m.participants[0],v=m.participants[1];p.stats.kills=29;m.startedAt=e.dev.now()-237000;e.context.__tactical.updateFinalCountdown(e.dev.now());assert.equal(e.ui.element('finalCountdown').textContent,'3');damage(e,p,v,250);assert.equal(m.status,'ended');assert.equal(m.endReason,'score');const report=JSON.stringify(m.result);damage(e,p,m.participants[2],250);e.dev.endMatch(m,p.id);assert.equal(JSON.stringify(m.result),report);assert.equal(e.ui.element('finalCountdown').classList.contains('hidden'),true);e.ui.flush();assert.equal(e.context.SAR.getUniverse().modeStats.deathmatch.completedMatches,1);pass('30th kill ends immediately, cancels countdown, ignores late damage and duplicate callbacks');
}
{
 const e=make();e.dev.queueForMatch();const m=e.dev.inspect().state.matches.find(m=>m.hasPlayer);assert.equal(m.limit,60);assert.equal(m.durationMs,300000);live(e,m);m.participants.forEach(a=>{a.dead=true;a.respawnAt=Infinity;});e.step(300);assert.equal(m.overtime,true);pass('Current 60-kill / five-minute TDM and tied overtime remain intact');
}
{
 const e=make();holdBackground(e);const m=e.context.SAR.startCustomMatch({mode:'deathmatch',bots:[]});live(e,m);e.dev.endMatch(m,null,'time');e.ui.flush();const foreground=e.context.SAR.getLastResult(),background=e.dev.inspect().state.matches[0];background.status='active';e.dev.endMatch(background,0,'score');e.ui.flush();assert.deepEqual(e.context.SAR.getLastResult(),foreground);assert.match(e.ui.element('modalContent').innerHTML,/PRACTICE COMPLETE/);pass('Background TDM finalization cannot replace the frozen foreground result or Play Again mode');
}
const base={id:3,team:0,power:82,x:0,y:0,now:10000,remaining:20000,ownScore:45,opponentScore:42,leadingScore:45,ffa:false,hp:.9,ammo:.8,reloading:false,weapon:{mag:40,preferred:900,speed:80,pellets:1},spread:3,target:{id:9,x:700,y:0,hp:200,at:10000,visible:true,reloading:false},enemies:[{id:9,x:700,y:0}],allies:[{id:2,x:80,y:0,hp:180,reloading:true,attacked:true}],intentions:[]};
{
 const leading=T.evaluate({...base,memory:T.memory()}),losing=T.evaluate({...base,ownScore:40,opponentScore:48,leadingScore:48,memory:T.memory()});assert.ok(losing.utilities.PUSH>0);assert.ok(leading.utilities.CHASE<0);assert.ok(leading.utilities.SUPPORT>3);assert.equal(leading.supportId,2);
 const memory=T.memory();for(let i=0;i<3;i++)T.remember(memory,{kind:'death',x:700,y:0,at:9000,tactic:'CHASE',isolated:true,badRange:true});const adapted=T.evaluate({...base,memory});assert.ok(adapted.utilities.FLANK>leading.utilities.FLANK||adapted.utilities.FLANK>0);assert.ok(adapted.utilities.CHASE<leading.utilities.CHASE);
 const ffa=T.evaluate({...base,ffa:true,memory:T.memory(),enemies:[...base.enemies,{id:10,x:-200,y:0},{id:11,x:40,y:300}]});assert.equal(ffa.supportId,undefined);assert.ok(ffa.utilities.RETREAT>0);
 const regen=T.evaluate({...base,regenNear:true,memory:T.memory()});assert.ok(regen.utilities.REGEN_HIDE>0);
 const board=new Map();T.publish(board,{id:2,team:0,power:82,x:80,y:0,ready:true,action:'PUSH',enemies:[{...base.target,name:'visible'}]},10000);assert.equal(T.reports(board,base,10001).length,0);const report=T.reports(board,base,11000)[0];assert.ok(report.reported);assert.equal(report.visible,false);assert.equal(report.vx,0);assert.equal(report.hp,250);assert.equal(T.reports(board,base,13000).length,0);
 pass('Late lead/deficit, covering reload/trade, route learning, FFA third-party danger, regen and delayed uncertain reports');
}
const comparisons=[];
for(const side of [0,1])for(const weapon of ['AR-15','P90']){
 const e=make();holdBackground(e);const roster=Object.entries(e.context.SAR.getProfiles()),high=roster.filter(([,p])=>p.power>=78&&p.power<=88).slice(0,5),low=roster.filter(([,p])=>p.power>=44&&p.power<=56).slice(0,5);assert.equal(high.length,5);assert.equal(low.length,5);
 const sample=(lineup)=>lineup.map(([name,p],index)=>T.evaluate({...base,id:index+1,team:side,power:p.power,weapon:e.context.SAR.getWeapons()[weapon],memory:T.memory()}));
 const highResults=sample(high),lowResults=sample(low),mean=x=>x.reduce((s,r)=>s+r.utilities.SUPPORT,0)/x.length;
 assert.ok(mean(highResults)>mean(lowResults));assert.ok(lowResults.every(r=>r.utilities.SUPPORT>3));comparisons.push({side,weapon,highAverage:high.reduce((s,[,p])=>s+p.power,0)/5,lowAverage:low.reduce((s,[,p])=>s+p.power,0)/5,highSupportUtility:mean(highResults),lowSupportUtility:mean(lowResults)});
}
pass('Repeatable actual high/low roster comparisons, both sides and two weapons; stronger support consistency without invented win rates');
{
 const e=make();const start=performance.now();for(let i=0;i<900;i++)e.step();const duration=performance.now()-start;const rows=e.context.SAR.getActorSnapshots().filter(a=>a.matchId!==null),actions=e.context.SAR.getDiagnostics().actions;assert.ok(rows.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)));assert.ok(Object.keys(actions).length>3);assert.ok(rows.some(a=>Math.hypot(a.vx,a.vy)>10));const w=e.context.SAR.getUniverse();validateWorld(w);pass('30 seconds of actual 40-bot simulation, navigation and revision telemetry validation');comparisons.push({simulationSeconds:30,wallMs:Math.round(duration),actions});
}
fs.writeFileSync(require('node:path').join(__dirname,'tactical-instinct-results.json'),JSON.stringify({checks,comparisons},null,2));
