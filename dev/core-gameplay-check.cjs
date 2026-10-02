'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const {validateWorld}=require('../server/world.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const exposed=source.replace('window.SAR = {','window.__CORE={TILE,updateOfficialSlots,slotCooldownRemaining,finishBotMatch,updateHud,updateSpectatorHud,renderScoreboard,matchHudState,weaponSheet,updateBurst,makeWeaponState,navigateToward,obstacleSteer,smoothBotMove,resetBrain,ROUTE_CACHE};window.SAR = {');
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[],pass=test=>{checks.push(test);console.log('PASS '+test);};
const make=(storage={},options={})=>engine(storage,exposed,options);
// Transcribed from the 1.9 request. Do not derive expected numbers from the game.
const fields=['damage','head','spread','walkSpread','sprintSpread','adsSpread','falloffStart','falloff','speed','hitSpeed','mag','reserve','reload','pellets','preferred'];
const sheet={
 'AR-15':[28,42,2.7,2.9,3.6,1.5,22,.025,80,.3,40,120,2.1,1,900],
 'AK47':[34,50,4,4.5,5.2,1.6,25,.028,74,.35,36,120,2.75,1,820],
 'SMG-9':[19,29,3.1,3.3,3.7,1.8,11,.043,62,.17,42,144,1.9,1,520],
 'Pump Shotgun':[124,248,6.5,7.5,9,3,3.5,.1,48,1.5,5,30,2.4,8,330],
 'Auto 12':[49,84,7.45,8.5,10,3.4,5,.08,50,.51,10,50,4.6,6,300],
 'LR-762':[63,124,10,12,15,1.2,32,.015,100,.84,10,60,3.2,1,1250],
 'LW Tundra':[121,181,12.2,14,18,1,45,.01,125,1.4,4,25,2.8,1,1500],
 'War Head LMG':[45,65,5.35,5.8,6.2,1.8,24,.02,81,.42,75,225,4.7,1,1000],
 'P90':[25,40,2.2,2.4,2.8,1.2,20,.032,70,.23,36,144,2.2,1,720],
 '9mm':[28,50,4.75,5,5.45,1.1,13,.04,60,.34,16,60,1.5,1,440],
 'X16':[24,34,4,4.4,4.75,1.3,11,.045,58,.19,18,72,1.2,1,390],
 'X-16 Auto':[21,30,4.65,5,5.35,1.5,10,.0475,62,.19,26,104,1.6,1,430],
 'SR-Aug':[23,45,4.5,4.75,5.5,2.2,19,.024,88,.7,39,156,2.4,1,750],
 'SPAS-12':[100,210,5.8,5.925,6.25,1.7,7,.05,75,1,3,12,3.6,12,420]
};
{
 const e=make(),w=e.context.SAR.getWeapons();assert.deepEqual(Object.keys(w).sort(),Object.keys(sheet).sort());
 assert.equal(e.context.__CORE.TILE,70);assert.match(source,/w\.preferred\/TILE/);assert.doesNotMatch(source,/\brangeTiles\s*:/);
 for(const [name,values]of Object.entries(sheet)){fields.forEach((key,i)=>assert.equal(w[name][key],values[i],name+' '+key));const derived=e.context.__CORE.weaponSheet(name);for(const [damage,ttk]of [[w[name].damage,derived.bodyTtk],[w[name].head,derived.headTtk]]){const n=Math.ceil(250/damage)-1,expected=name==='SR-Aug'?Math.floor(n/3)*.7+(n%3)*.065:n*w[name].hitSpeed;assert.ok(Math.abs(ttk-expected)<1e-9,name+' real cadence TTK');}}
 assert.equal(w['SR-Aug'].burstCount,3);assert.equal(w['SR-Aug'].burstSpacing,.065);
 assert.equal(e.context.SAR.getUniverse().patchState.balanceVersion,'8.0');
 fs.writeFileSync(path.join(__dirname,'fixtures/balance-8.0.json'),JSON.stringify({balanceVersion:'8.0',fingerprint:e.dev.balanceFingerprint(),weapons:w},null,2)+'\n');
 pass('All 14 authoritative weapon sheets, derived ranges/STK/TTK, independent AUG rounds and retained pellet counts');
}
function uniqueness(state){const seen=new Set();for(const m of state.matches.filter(Boolean))for(const a of m.participants.filter(a=>!a.sandbox&&!a.isPlayer)){assert.equal(a.matchId,m.id);assert.ok(!seen.has(a.name),a.name+' double booked');seen.add(a.name);}for(const a of state.idleBots){assert.equal(a.matchId,null);assert.ok(!seen.has(a.name));seen.add(a.name);}assert.equal(seen.size,50);}
{
 let clock=Date.now();const options={wallNow:()=>clock},e=make({},options),c=e.context.__CORE,{state,SAVE}=e.dev.inspect(),m=state.matches[0],other=state.matches[1];
 assert.equal(m.limit,60);assert.equal(m.durationMs,300000);e.dev.endMatch(m,0,'score');e.ui.flush();const deadline=SAVE.matchSlots[0].readyAt,oldId=m.matchId;
 assert.equal(deadline-clock,15000);assert.equal(m.status,'cooldown');assert.equal(other.status,'active');uniqueness(state);
 clock+=14999;c.updateOfficialSlots();assert.equal(state.matches[0],m);assert.equal(c.slotCooldownRemaining(m),1);
 const storage={'sar-persistent-save':JSON.stringify(SAVE)},reload=make(storage,options),rs=reload.dev.inspect().state;
 assert.equal(rs.matches[0].status,'cooldown');assert.equal(rs.matches[0].matchId,oldId);uniqueness(rs);
 for(const a of rs.matches[0].participants){const prior=m.participants.find(p=>p.name===a.name);assert.equal(a.x,prior.x);assert.equal(a.y,prior.y);}
 clock++;reload.context.__CORE.updateOfficialSlots();const next=rs.matches[0],generation=reload.dev.inspect().SAVE.matchSlots[0].generation;
 assert.equal(next.status,'active');assert.notEqual(next.matchId,oldId);assert.equal(next.startedAt,reload.dev.now());assert.equal(next.durationMs,300000);uniqueness(rs);
 reload.context.__CORE.finishBotMatch(m);for(let i=0;i<4;i++)reload.context.__CORE.updateOfficialSlots();assert.equal(rs.matches[0],next);assert.equal(reload.dev.inspect().SAVE.matchSlots[0].generation,generation);
 const reopened=make({'sar-persistent-save':JSON.stringify(reload.dev.inspect().SAVE)},options);assert.equal(reopened.dev.inspect().state.matches[0].matchId,next.matchId);assert.equal(reopened.dev.inspect().SAVE.matchSlots[0].generation,generation);uniqueness(reopened.dev.inspect().state);
 pass('15,000 ms per-slot deadline survives restart; 14,999 ms cannot restart; duplicate callbacks/reconnect cannot consume a second replacement');
}
{
 let clock=Date.now();const e=make({},{wallNow:()=>clock}),{state,SAVE}=e.dev.inspect(),m=state.matches[0],a=m.participants[0],v=m.participants.find(b=>b.team!==a.team);
 m.score[a.team]=58;v.hp=1;e.dev.applyDamage(v,{owner:a,weapon:'AR-15',travel:70},28,false,e.dev.now());assert.equal(m.score[a.team],59);assert.equal(m.status,'active');
 v.dead=false;v.hp=1;e.dev.applyDamage(v,{owner:a,weapon:'AR-15',travel:70},28,false,e.dev.now());assert.equal(m.score[a.team],60);assert.equal(m.status,'cooldown');const result=m.result,completed=SAVE.patchState.completedMatches;
 e.dev.endMatch(m,1-a.team);assert.equal(m.result,result);assert.equal(SAVE.patchState.completedMatches,completed);
 const observer=state.matches[1].participants[0],before=observer.career.timePlayed;e.step(1/30);assert.ok(observer.career.timePlayed>before);assert.equal(state.matches[0],m);
 for(const other of state.matches.slice(1,4))e.dev.endMatch(other,0);e.ui.flush();e.dev.queueForMatch();assert.equal(state.queued,true);assert.equal(state.playerMatchId,null);uniqueness(state);
 clock+=15000;e.context.__CORE.updateOfficialSlots();assert.equal(state.matches.filter(x=>x.hasPlayer).length,1);assert.equal(state.queued,false);uniqueness(state);
 pass('Real 59th/60th lethal hits enforce target60 exactly once; other slots progress during cooldown and a queued human takes only one replacement');
}
{
 const e=make(),c=e.context.__CORE;const m=e.context.SAR.startDeathmatch(),p=m.participants.find(a=>a.isPlayer);m.status='active';m.startedAt=e.dev.now();
 assert.equal(m.participants.length,10);assert.equal(m.limit,30);assert.equal(m.durationMs,240000);
 Object.assign(p.stats,{kills:9,deaths:2,damage:600});Object.assign(m.participants.find(a=>a!==p).stats,{kills:10,deaths:3,damage:800});
 c.updateHud(e.dev.now());assert.equal(e.ui.element('hudModeLabel').textContent,'DEATHMATCH');assert.equal(e.ui.element('hudTargetLabel').textContent,'30 KILLS');assert.equal(e.ui.element('hudIdentityHeading').textContent,'YOUR PLACEMENT');assert.equal(e.ui.element('teamLabel').textContent,'#2 / 10');assert.match(e.ui.element('teamScoreLabel').innerHTML,/LEADER 10/);assert.doesNotMatch(e.ui.element('teamScoreLabel').innerHTML,/GREEN|BLUE|TEAM/);
 c.renderScoreboard();assert.equal(e.ui.element('scoreGroupHeading').textContent,'Place');assert.doesNotMatch(e.ui.element('scoreRows').innerHTML,/GREEN|BLUE/);
 e.dev.exitGame();e.dev.queueForMatch();const t=e.dev.inspect().state.matches.find(m=>m.hasPlayer);c.updateHud(e.dev.now());assert.equal(e.ui.element('hudModeLabel').textContent,'5V5 TDM');assert.equal(e.ui.element('hudTargetLabel').textContent,'60 KILLS');assert.equal(e.ui.element('hudIdentityHeading').textContent,'YOUR TEAM');assert.match(e.ui.element('teamScoreLabel').innerHTML,/GREEN/);assert.equal(t.durationMs,300000);
 pass('Shared HUD switches FFA kills/placement/leader/30 target and scoreboard back to unchanged team presentation with target 60');
}
{
 const e=make(),m=e.context.SAR.startCustomMatch({mode:'tdm',player:true,bots:[]});assert.equal(m.limit,60);m.status='active';e.dev.endMatch(m,null,'time');e.ui.flush();assert.equal(e.dev.inspect().state.matches[m.id],undefined);assert.equal(m.cooldownUntil,undefined);
 pass('Custom/practice inherits TDM 60 while remaining outside automated cooldown scheduling');
}
{
 const e=make(),c=e.context.__CORE,a=e.dev.inspect().state.actors[0];c.resetBrain(a);Object.assign(a,{x:2160,y:1440,vx:0,vy:0});c.ROUTE_CACHE.clear();let now=e.dev.now(),reversals=0,last=0;
 for(let i=0;i<180;i++){now+=1000/30;const goal={x:i<8?2370:2430,y:1440},dir=c.navigateToward(a,goal,now);if(dir.x&&last&&dir.x*last<0)reversals++;if(dir.x)last=dir.x;c.smoothBotMove(a,dir.x,dir.y,255,1/30);assert.equal(e.dev.collides(a.x,a.y),false);}
 assert.equal(reversals,0);assert.ok(Math.hypot(a.x-2430,a.y-1440)<22);pass('Moving-endpoint regression: zero steering reversals, correct arrival and no collision');
}
if(process.argv[2]){
 const oldEngine=engine({},fs.readFileSync(process.argv[2],'utf8'));for(let i=0;i<900;i++)oldEngine.step();const before=clone(oldEngine.dev.inspect().SAVE);
 const migrated=make({'sar-persistent-save':JSON.stringify(before)}),after=migrated.dev.inspect().SAVE,archived=after.patchArchives.at(-1);
 for(const key of ['playerCareer','playerSeasons','seasons','modeStats'])assert.deepEqual(after[key],before[key],key+' preserved');
 for(const [name,bot]of Object.entries(before.bots)){assert.deepEqual(after.bots[name].profile,bot.profile);assert.deepEqual(after.bots[name].familiarity,bot.familiarity);for(const key of ['kills','deaths','damage','games','wins','losses'])assert.equal(after.bots[name].career[key],bot.career[key]);}
 for(const key of ['id','fingerprint','weaponStats','meta','perBot','skillStrata','aiSamples','completedMatches','observedSeconds'])assert.deepEqual(archived[key],before.patchState[key],key+' archived intact');
 assert.equal(after.patchState.balanceVersion,'8.0');assert.equal(after.patchState.completedMatches,0);assert.equal(after.patchArchives.length,before.patchArchives.length+1);for(const m of Object.values(after.patchState.meta)){assert.equal(m.kills,0);assert.equal(m.damage,0);assert.equal(m.shots,0);}
 validateWorld(clone(after),{save:before});const repeat=make({'sar-persistent-save':JSON.stringify(after)});assert.equal(repeat.dev.inspect().SAVE.patchArchives.length,after.patchArchives.length);assert.equal(repeat.dev.inspect().SAVE.patchState.id,after.patchState.id);
 pass('Actual 1.8 world archives Balance7 and both AI samples once; lifetime records, personalities, familiarity, modes and seasons survive Balance8');
}
fs.writeFileSync(path.join(__dirname,'core-gameplay-results.json'),JSON.stringify({ok:true,checks},null,2));
