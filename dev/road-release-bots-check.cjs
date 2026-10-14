'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs');
const {engine}=require('./simulate.cjs'),T=require('../tactical-instinct.js');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8').replace('window.SAR = {','window.__BOT_PASS={solids,makeWeaponState,resetBrain,navigateToward,obstacleSteer,smoothBotMove,diagnostics};window.SAR = {');
function pair(){
 const e=engine({},source),state=e.dev.inspect().state,a=state.matches[0].participants[0],b=state.matches[0].participants.find(o=>o.team!==a.team);
 for(const o of state.actors)if(o!==a&&o!==b){o.dead=true;o.respawnAt=Infinity;}
 return {e,a,b,state,kit:e.context.__BOT_PASS};
}
function freeze(a,target,now=10000){
 Object.assign(a,{nextThink:Infinity,nextDecision:Infinity,nextAim:Infinity,aiAimReadyAt:0,aimPoint:{x:target.x,y:target.y},aimNoise:0,tactic:'FIGHT',moveGoal:{x:a.x,y:a.y}});
 a.aiAim=a.angle=Math.atan2(target.y-a.y,target.x-a.x);a.slots[0]={name:'AR-15',ammo:40,reserve:120,lastShot:-999,reloading:false};a.currentSlot=0;
}
function wallCase(){
 const q=pair(),{e,a,b,kit}=q,wall=kit.solids.find(o=>o.type==='rect'&&!e.dev.collides(o.x-55,o.y+o.h*.5)&&!e.dev.collides(o.x+o.w+55,o.y+o.h*.5)&&!e.dev.pointLOS(o.x-55,o.y+o.h*.5,{x:o.x+o.w+55,y:o.y+o.h*.5})&&e.dev.pathClear(o.x-55,o.y+o.h*.5,o.x-55,o.y+o.h*.5+80));
 assert.ok(wall);Object.assign(a,{x:wall.x-55,y:wall.y+wall.h*.5});Object.assign(b,{x:a.x,y:a.y+80,spawnFlash:0});e.dev.selectTarget(a,10000);assert.equal(a.target.id,b.id);freeze(a,b);
 return {...q,wall};
}
test('Current Balance9 registry and persistent bot personalities remain intact',()=>{
 const e=engine({},source),world=e.context.SAR.getUniverse(),profiles=e.context.SAR.getProfiles();
 assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');assert.equal(world.patchState.balanceVersion,'9.0');assert.equal(Object.keys(e.context.SAR.getWeapons()).length,15);assert.equal(Object.keys(profiles).length,50);
 assert.deepEqual([...new Set(Object.values(profiles).map(p=>p.archetype))].sort(),['Anchor','Flanker','Flex','Marksman','Rusher']);
});
test('A newly hidden target cannot trigger another shot between perception ticks',()=>{
 const {e,a,b,wall}=wallCase(),observation={x:a.target.x,y:a.target.y,at:a.target.at};Object.assign(b,{x:wall.x+wall.w+55,y:a.y});
 assert.equal(e.dev.pointLOS(a.x,a.y,b),false);assert.equal(e.dev.pointLOS(a.x,a.y,a.target),true);e.dev.updateBot(a,1/60,10016);
 assert.equal(a.stats.shots,0);assert.equal(a.target.visible,false);assert.deepEqual({x:a.target.x,y:a.target.y,at:a.target.at},observation);assert.equal(a.visibleEnemies.some(o=>o.id===b.id),false);
 e.dev.selectTarget(a,10030);assert.deepEqual({x:a.target.x,y:a.target.y,at:a.target.at},observation);Object.assign(b,{x:a.x,y:a.y+80});e.dev.selectTarget(a,10040);assert.ok(a.aiAimReadyAt>=10040+a.traits.reaction*1000);
});
test('A dead cached target cannot consume ammunition before perception refresh',()=>{
 const {e,a,b}=wallCase();b.dead=true;b.deathAt=10001;e.dev.updateBot(a,1/60,10016);assert.equal(a.stats.shots,0);assert.equal(a.slots[0].ammo,40);
});
test('Visible targets still receive real projectiles with reaction gating',()=>{
 const {e,a,b}=wallCase();a.aiAimReadyAt=10200;e.dev.updateBot(a,1/60,10016);assert.equal(a.stats.shots,0);e.dev.updateBot(a,1/60,10201);
 assert.equal(a.stats.shots,1);assert.equal(a.slots[0].ammo,39);assert.equal(e.dev.inspect().state.projectiles.filter(p=>p.owner===a).length,1);assert.equal(e.dev.pointLOS(a.x,a.y,b),true);
});
test('Perception never adopts exact enemy HP or coordinates after LOS is lost',()=>{
 const {e,a,b,wall}=wallCase();assert.equal(a.target.hp,250);b.hp=17;e.dev.selectTarget(a,10100);assert.equal(a.target.hp,250);e.dev.applyDamage(b,{owner:a,weapon:'AR-15',travel:80},10,false,10110);e.dev.selectTarget(a,10120);assert.equal(a.target.hp,240);
 const observed={x:a.target.x,y:a.target.y,at:a.target.at};Object.assign(b,{x:wall.x+wall.w+55,y:a.y,hp:2});e.dev.selectTarget(a,10300);assert.equal(a.target.visible,false);assert.deepEqual({x:a.target.x,y:a.target.y,at:a.target.at},observed);assert.equal(a.target.vx,0);assert.equal(a.target.vy,0);assert.notEqual(a.target.hp,2);e.dev.selectTarget(a,15000);assert.equal(a.target,null);
});
test('An irrecoverably empty primary switches to its armed sidearm at range',()=>{
 const {e,a,b,kit}=pair();Object.assign(a,{x:2160,y:1440});Object.assign(b,{x:2960,y:1440,spawnFlash:0});e.dev.selectTarget(a,10000);assert.equal(a.target.id,b.id);freeze(a,b);a.tactic='HOLD';a.slots[0].ammo=0;a.slots[0].reserve=0;a.slots[1]=kit.makeWeaponState('X16');
 const magazine=e.context.SAR.getWeapons().X16.mag;e.dev.updateBot(a,1/60,10016);assert.equal(a.currentSlot,1);assert.equal(a.slots[1].ammo,magazine-1);assert.equal(a.stats.shots,1);
});
test('A reloadable distant primary retains the established reload policy',()=>{
 const {e,a,b,kit}=pair();Object.assign(a,{x:2160,y:1440});Object.assign(b,{x:2960,y:1440,spawnFlash:0});e.dev.selectTarget(a,10000);freeze(a,b);a.slots[0].ammo=0;a.slots[1]=kit.makeWeaponState('X16');
 e.dev.updateBot(a,1/60,10016);assert.equal(a.currentSlot,0);assert.equal(a.slots[0].reloading,true);assert.equal(a.slots[1].ammo,e.context.SAR.getWeapons().X16.mag);
});
test('Completely empty weapons produce no fake shots or invalid state',()=>{
 const {e,a,b}=wallCase();for(const slot of a.slots){slot.ammo=0;slot.reserve=0;}e.dev.updateBot(a,1/60,10016);assert.equal(a.stats.shots,0);assert.equal(e.dev.inspect().state.projectiles.length,0);assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
});
const base={id:3,team:0,power:55,style:'Rusher',personality:{chasePreference:.5},x:0,y:0,now:10000,remaining:150000,duration:300000,targetScore:60,ownScore:25,opponentScore:25,leadingScore:25,ffa:false,hp:.9,ammo:.8,reloading:false,weapon:{mag:40,damage:28,preferred:900,speed:80,pellets:1},spread:3,dashReady:true,target:{id:9,x:600,y:0,hp:45,at:10000,visible:true,confidence:1,healthConfidence:.85},enemies:[{id:9,x:600,y:0}],allies:[],intentions:[]};
test('Finishing remains personality-distinct and rejects unsafe pursuits at every Power tier',()=>{
 for(const power of [28,55,85]){const samples={};for(const style of ['Rusher','Marksman','Flanker','Anchor','Flex']){const s={...base,power,style,memory:T.memory()},finish=T.chaseAssessment(s);assert.ok(finish.utility>0);samples[style]=finish.utility;
 for(const overrides of [{hp:.18},{ammo:.05},{reloading:true},{target:{...base.target,hp:250,healthConfidence:0}},{target:{...base.target,at:5000,visible:false}}])assert.equal(T.chaseAssessment({...s,...overrides}).utility,0);}
 assert.ok(samples.Rusher>samples.Anchor&&samples.Anchor>samples.Marksman);}
});
test('Time, score, ammo and regen awareness remain contextual; FFA never invents teammate tactics',()=>{
 const assess=o=>T.evaluate({...base,memory:T.memory(),...o}),ahead=assess({remaining:12000,ownScore:55,opponentScore:44,leadingScore:55}),behind=assess({remaining:12000,ownScore:44,opponentScore:55,leadingScore:55});assert.ok((behind.utilities.PUSH||0)>(ahead.utilities.PUSH||0));assert.ok(behind.utilities.CHASE>ahead.utilities.CHASE);
 assert.ok(assess({regenNear:true}).utilities.REGEN_HIDE>0);assert.ok(assess({ammo:.15,target:{...base.target,visible:false}}).utilities.RELOAD>0);
 const ffa=assess({ffa:true,enemies:[...base.enemies,{id:10,x:-200,y:0},{id:11,x:40,y:300}],allies:[{id:2,x:80,y:50,hp:180,reloading:true,attacked:true}]});for(const key of ['SUPPORT','REGROUP','WAIT_SUPPORT'])assert.equal(ffa.utilities[key],undefined);assert.equal(ffa.supportId,undefined);assert.equal(ffa.intention,null);assert.ok(ffa.utilities.RETREAT>0);
});
test('Action commitment avoids micro-switches but yields immediately to danger',()=>{
 const memory=T.memory();let action='PUSH',changes=[];for(let i=0;i<30;i++){const now=10000+i*350,result=T.chooseAction({PUSH:3.5+(i%2?.05:0),RETREAT:3.5+(i%2?0:.05)},{current:action,power:85,memory,now,hp:.8,ammo:.8,pressure:0,targetId:9},()=>.5);if(result.action!==action)changes.push(now);action=result.action;}
 assert.ok(changes.length<8);assert.ok(changes.slice(1).every((time,i)=>time-changes[i]>=650));const danger=T.chooseAction({PUSH:2,RETREAT:6},{current:'PUSH',power:85,memory:{...memory,commitUntil:999999,lastTarget:9},now:21000,hp:.1,ammo:.8,pressure:3,targetId:9},()=>.5);assert.equal(danger.action,'RETREAT');assert.equal(danger.emergency,true);
});
test('Actual four-slot 120-second combat keeps 40 bots moving, using buildings and distinct actions without body penetrations',()=>{
 const e=engine({},source),initialProfiles=e.context.SAR.getProfiles(),balance=e.context.SAR.getWeapons();let maxStuck=0,bodyChecks=0;
 for(let tick=0;tick<3600;tick++){e.step();for(const a of e.dev.inspect().state.actors){assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));maxStuck=Math.max(maxStuck,a.stuckCount||0);if(tick%30===0&&!a.dead&&a.matchId!==null){assert.equal(e.dev.collides(a.x,a.y),false,a.name+' collision');bodyChecks++;}}}
 const d=e.context.SAR.getDiagnostics(),slots=e.dev.inspect().state.matches;assert.equal(slots.filter(m=>m.mode==='tdm').length,2);assert.equal(slots.filter(m=>m.mode==='deathmatch').length,2);assert.ok(d.buildingEntries>0&&d.buildingExits>0);assert.ok(d.botAdsShots>0);assert.ok(Object.keys(d.actions).length>5);assert.ok(maxStuck<18);assert.deepEqual(e.context.SAR.getProfiles(),initialProfiles);assert.deepEqual(e.context.SAR.getWeapons(),balance);assert.ok(bodyChecks>4000);
 console.log('BOT_RUNTIME '+JSON.stringify({seconds:120,bodyChecks,maxConsecutiveRecoveries:maxStuck,buildingEntries:d.buildingEntries,buildingExits:d.buildingExits,adsShots:d.botAdsShots,actions:d.actions}));
});
