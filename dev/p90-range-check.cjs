/* P90 decisions and shot-distance observations from the real shipped AI.
   The observer only reads values immediately before telemetry records them. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),sourceHash=crypto.createHash('sha256').update(source).digest('hex'),checks=[];
function pass(test,detail){checks.push({test,result:'PASS',detail});console.log('PASS',test,detail||'');}
function lane(e,separation){for(let y=100;y<2700;y+=40)for(let x=100;x<3900-separation;x+=40)if(!e.dev.collides(x,y)&&!e.dev.collides(x+separation,y)&&e.dev.pathClear(x,y,x+separation,y))return {x,y};throw Error('No clear firing lane '+separation);}
const positions=[];
for(const tiles of [3,10,19]){
 const e=engine(),a=e.dev.inspect().state.actors.find(a=>a.matchId===0&&a.team===0),p=lane(e,tiles*70);
 Object.assign(a,{...p,hp:250,currentSlot:0,target:{x:p.x+tiles*70,y:p.y,hp:250,vx:0,vy:0,angle:Math.PI,weapon:'AR-15',visible:true,at:10000},visibleAllies:[],cover:null,exitPlan:null,actionUntil:0,dashCooldownUntil:20000,matchVariance:0});
 a.visibleEnemies=[a.target];a.slots[0]={name:'P90',ammo:36,reserve:144,lastShot:-999,reloading:false,reloadEnd:0};
 Object.assign(a.profile.personality,{aggression:0,patience:0,coverPreference:0,flankPreference:0,dashAggression:0,riskTolerance:.5,retreatThreshold:.3});a.traits.confidence=.5;
 e.dev.decideBot(a,10000);const distanceBefore=Math.hypot(a.target.x-a.x,a.target.y-a.y),distanceAfterGoal=Math.hypot(a.target.x-a.moveGoal.x,a.target.y-a.moveGoal.y);
 if(tiles<4)assert.ok(distanceAfterGoal>distanceBefore,'Close P90 should open distance, found '+JSON.stringify({tiles,tactic:a.tactic,goal:a.moveGoal,distanceBefore,distanceAfterGoal}));
 if(tiles>18){assert.ok(distanceAfterGoal<distanceBefore,'Far P90 should approach');assert.ok(distanceAfterGoal>=7*70&&distanceAfterGoal<=12*70,'P90 push should retain ideal stand-off');}
 if(tiles===10)assert.equal(a.tactic,'FIGHT');
 positions.push({tiles,tactic:a.tactic,distanceBeforeTiles:distanceBefore/70,goalDistanceTiles:distanceAfterGoal/70});
}
pass('P90 backs away below4tiles, fights at10tiles, and approaches above18tiles',positions);
const pursuits=[];for(const [tiles,hp,dashReady] of [[10,39,false],[10,250,true],[12,250,true]]){
 const e=engine(),a=e.dev.inspect().state.actors.find(a=>a.matchId===0&&a.team===0),p=lane(e,tiles*70);
 Object.assign(a,{...p,hp:250,currentSlot:0,target:{x:p.x+tiles*70,y:p.y,hp,vx:0,vy:0,angle:Math.PI,weapon:'AR-15',visible:true,at:10000},visibleAllies:[],cover:null,exitPlan:null,actionUntil:0,dashCooldownUntil:dashReady?0:20000,dashExecuteAt:0,matchVariance:0});a.visibleEnemies=[a.target];a.slots[0]={name:'P90',ammo:36,reserve:144,lastShot:-999,reloading:false,reloadEnd:0};
 // This low-health fixture represents confirmed personal damage, not a read of
 // the live opponent's private HP. Unknown-health targets cannot justify a chase.
 Object.assign(a.target,{healthEstimated:true,healthConfidence:hp<40?.85:0,observedDamage:250-hp});
 Object.assign(a.profile.personality,{aggression:0,patience:0,coverPreference:0,flankPreference:0,dashAggression:dashReady?1:0,chasePreference:1,riskTolerance:.5,retreatThreshold:.3});a.traits.confidence=.5;e.dev.decideBot(a,10000);
 const distance=Math.hypot(a.target.x-a.moveGoal.x,a.target.y-a.moveGoal.y)/70;
 if(hp<40){assert.equal(a.tactic,'CHASE');assert.ok(distance>=7&&distance<=12,'Weak target chase must retain ideal range');}
 if(dashReady&&tiles===10){assert.notEqual(a.tactic,'DASH_ATTACK');assert.ok(a.dashUntil<=10000,'Dash landing below7tiles must be rejected');}
 if(dashReady&&tiles===12){assert.equal(a.tactic,'DASH_ATTACK');assert.ok(a.dashUntil>10000);assert.ok(tiles-260/70>=7);}
 pursuits.push({tiles,targetHp:hp,dashReady,tactic:a.tactic,goalDistanceTiles:distance,dashing:a.dashUntil>10000});
}
pass('P90 chases retain7–12tile stand-off and attack dashes cannot land below7tiles',pursuits);
for(const [tiles,tactic,allowed] of [[5,'FIGHT',true],[10,'FIGHT',true],[16,'FIGHT',true],[16.01,'FIGHT',false],[18,'HOLD',true],[18,'PEEK',true],[18.01,'HOLD',false]]){
 const e=engine(),a=e.dev.inspect().state.actors.find(a=>a.matchId===0&&a.team===0),p=lane(e,tiles*70);
 Object.assign(a,{...p,hp:250,currentSlot:0,target:{x:p.x+tiles*70,y:p.y,hp:250,vx:0,vy:0,angle:Math.PI,weapon:'AR-15',visible:true,at:10000},visibleAllies:[],cover:null,coverState:'PEEKING_LEFT',tactic,moveGoal:null,nextThink:1e12,nextDecision:1e12,nextAim:1e12,aiAimReadyAt:0,aiAim:0,aimNoise:0,aimPoint:{x:p.x+tiles*70,y:p.y},dashUntil:0});
 a.slots[0]={name:'P90',ammo:36,reserve:144,lastShot:-999,reloading:false,reloadEnd:0};e.dev.updateBot(a,1/60,10000);assert.equal(e.dev.inspect().meta.P90.shots,allowed?1:0,'fire gate '+tiles+' '+tactic);
}
pass('Actual P90 AI fires at5–16tiles, permits holding/peeking through18tiles and rejects farther engagements');
const instrumented=source.replace('actorMeta(a,weapon).engagementDistance+=distance;','if(weapon===\'P90\')window.__p90Samples.push({tiles:distance/TILE,tactic:a.tactic});actorMeta(a,weapon).engagementDistance+=distance;');
assert.notEqual(instrumented,source);
const observed=engine({},instrumented.replace('window.SAR = {','window.__p90Samples=[];window.SAR = {')),start=Date.now();let maxConsecutiveRecoveries=0;
for(let i=0;i<18000;i++){observed.step();for(const a of observed.dev.inspect().state.actors){maxConsecutiveRecoveries=Math.max(maxConsecutiveRecoveries,a.stuckCount||0);assert.ok((a.stuckCount||0)<18,a.name+' sustained stuck condition');}}
const samples=observed.context.__p90Samples,meta=observed.dev.inspect().meta.P90;
assert.ok(samples.length>100,'P90 must have a real observed sample');assert.equal(samples.length,meta.engagementDistanceN);
const count=p=>samples.filter(p).length,inside=count(s=>s.tiles>=5&&s.tiles<=16),ideal=count(s=>s.tiles>=7&&s.tiles<=12),close=count(s=>s.tiles<4),far=count(s=>s.tiles>18),outside=count(s=>s.tiles<5||s.tiles>16);
assert.equal(far,0,'P90 fire gate must reject over18tile engagements');
assert.equal(meta.classifiedKills,meta.kills);assert.ok(observed.dev.inspect().diagnostics.maxStuckDetectionSeconds<1.6);
const aggregate={simulatedSeconds:600,wallSeconds:(Date.now()-start)/1000,completedMatches:observed.dev.inspect().diagnostics.completedMatches,samples:samples.length,avgEngagementTiles:meta.engagementDistance/meta.engagementDistanceN/70,avgKillTiles:meta.killDistanceN?meta.killDistance/meta.killDistanceN/70:null,idealFraction:ideal/samples.length,acceptableFraction:inside/samples.length,outsideAcceptableFraction:outside/samples.length,under4Fraction:close/samples.length,over18Fraction:far/samples.length,maxTiles:Math.max(...samples.map(s=>s.tiles)),minTiles:Math.min(...samples.map(s=>s.tiles)),tactics:samples.reduce((a,s)=>(a[s.tactic]=(a[s.tactic]||0)+1,a),{})};
aggregate.maxConsecutiveRecoveries=maxConsecutiveRecoveries;aggregate.maxStuckDetectionSeconds=observed.dev.inspect().diagnostics.maxStuckDetectionSeconds;
pass('600seconds of live AI P90 trigger pulls remain under18tiles and reconcile with telemetry without sustained movement failure',aggregate);
fs.writeFileSync(path.join(__dirname,'p90-range-results.json'),JSON.stringify({result:'PASS',sourceHash,checks,aggregate},null,2));
