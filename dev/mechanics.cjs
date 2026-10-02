const {engine}=require('./simulate.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'..');process.argv[4]=root+'/game.js';
const results=[];function pass(test){results.push({test,result:'PASS'});console.log('PASS',test);}
function pair(e){const {state}=e.dev.inspect(),a=state.actors.find(a=>a.matchId===0&&a.team===0),b=state.actors.find(a=>a.matchId===0&&a.team===1);for(const o of state.actors)if(o!==a&&o!==b)o.dead=true;return [a,b];}
function open(e){for(let y=100;y<2700;y+=80)for(let x=100;x<3900;x+=80)if(!e.dev.collides(x,y)&&!e.dev.collides(x+200,y)&&e.dev.pathClear(x,y,x+200,y))return {x,y};throw Error('No open space');}
function gunValues(text){const a=text.indexOf('const WEAPONS = {')+16,b=text.indexOf('\nconst PRIMARYS',a);return new Function('return '+text.slice(a,b).trim())();}
const currentWeapons=gunValues(fs.readFileSync(root+'/game.js','utf8')),previousWeapons=JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname,'fixtures/balance-7.0.json'),'utf8')).weapons;
for(const name of ['AK47','SMG-9','LR-762','LW Tundra','War Head LMG'])for(const field of ['type','auto','pellets','color','preferred','reserve','mag','falloffStart','falloff','role'])assert.equal(currentWeapons[name][field],previousWeapons[name][field],name+' '+field);pass('Weapon identities, ammunition roles and range parameters outside the authorized balance changes remain intact');
// Expose geometry only to this test harness; the shipped public surface stays read-only.
const src=fs.readFileSync(root+'/game.js','utf8').replace('window.SAR = {','window.__geometry=solids;window.SAR = {');
{
 const e=engine({},src),[a,b]=pair(e);let barrier;
 for(const o of e.context.__geometry){if(o.type!=='rect')continue;const x=o.x-55,y=o.y+o.h*.5,bx=o.x+o.w+55;if(!e.dev.collides(x,y)&&!e.dev.collides(bx,y)&&!e.dev.pointLOS(x,y,{x:bx,y})&&e.dev.pathClear(x,y,x,y+80)){barrier={x,y,bx};break;}}
 assert.ok(barrier);Object.assign(a,{x:barrier.x,y:barrier.y,target:null});Object.assign(b,{x:barrier.bx,y:barrier.y});a.memory.clear();e.dev.selectTarget(a,5000);assert.equal(a.target,null);assert.equal(a.memory.size,0);
 Object.assign(b,{x:a.x,y:a.y+80});e.dev.selectTarget(a,6000);assert.equal(a.target.id,b.id);const observation={x:a.target.x,y:a.target.y,at:a.target.at};Object.assign(b,{x:barrier.bx,y:barrier.y});e.dev.selectTarget(a,6300);assert.equal(a.target.visible,false);assert.deepEqual({x:a.target.x,y:a.target.y,at:a.target.at},observation);assert.notEqual(a.target.x,b.x);Object.assign(b,{x:a.x,y:a.y+80});e.dev.selectTarget(a,7000);assert.ok(a.aiAimReadyAt>=7000+a.traits.reaction*1000);Object.assign(b,{x:barrier.bx,y:barrier.y});e.dev.selectTarget(a,12000);assert.equal(a.target,null);pass('Walls block perception; hidden movement keeps last-seen coordinates; reacquisition waits for reaction; memories expire');
}
{
 const e=engine(),[a]=pair(e);a.target=null;a.hp=60;a.lastDamageAt=1000;a.profile.personality.riskTolerance=.3;a.cover={x:a.x,y:a.y};e.dev.decideBot(a,6000);assert.equal(a.tactic,'REGEN_HIDE');a.hp=120;a.regenActive=true;e.dev.decideBot(a,9000);assert.equal(a.tactic,'REGEN_HIDE');a.hp=250;a.regenActive=false;e.dev.decideBot(a,15000);assert.equal(a.tactic,'REPOSITION');pass('Recovery hiding survives expired target memory and remains active until health recovers');
}
{
 const e=engine({},src.replace('window.__geometry=solids;','window.__geometry=solids;window.__noCover=()=>{chooseCover=()=>null;};')),[a]=pair(e);let p;
 for(let y=100;y<2700&&!p;y+=40)for(let x=100;x<3400;x+=80)if(e.dev.pathClear(x,y,x+800,y)){p={x,y};break;}
 assert.ok(p);Object.assign(a,{...p,currentSlot:0,hp:250});a.slots[0].name='SMG-9';a.slots[0].ammo=42;a.target={x:p.x+800,y:p.y,vx:0,vy:0,hp:250,visible:true,angle:Math.PI,weapon:'AR-15'};a.visibleAllies=[];a.visibleEnemies=[a.target];Object.assign(a.profile.personality,{coverPreference:1,flankPreference:0,dashAggression:0,aggression:.4,riskTolerance:.4});a.dashCooldownUntil=20000;e.context.__noCover();e.dev.decideBot(a,10000);assert.equal(a.tactic,'FIGHT');pass('A peek request with no usable cover falls back to live fighting');
}
{
 const e=engine(),[a,b]=pair(e),m=e.dev.inspect().meta;Object.assign(b,{hp:10,currentSlot:0});b.slots[0].name='Pump Shotgun';e.dev.applyDamage(b,{owner:a,weapon:'AK47',travel:176},80,true,10000);assert.equal(b.hp,0);assert.equal(b.stats.taken,10);assert.equal(a.stats.damage,10);assert.equal(m.AK47.damage,10);assert.equal(m.AK47.kills,1);assert.equal(m['Pump Shotgun'].deaths,1);assert.equal(m.AK47.killDistance,176);assert.equal(m.AK47.headshots,1);pass('Actual HP removed, final damaging gun, held-gun death, final-hit range and headshot kill');
}
{
 const e=engine(),[a,b]=pair(e),p=open(e),m=e.dev.inspect().meta;Object.assign(a,{...p,currentSlot:0,vx:0,vy:0});Object.assign(b,{x:p.x+150,y:p.y,hp:250});a.slots[0]={name:'Pump Shotgun',ammo:5,reserve:30,lastShot:-999,reloading:false,reloadEnd:0};assert.ok(e.dev.fire(a,0,10000));assert.equal(m['Pump Shotgun'].shots,1);assert.equal(e.dev.inspect().state.projectiles.length,8);e.dev.updateProjectiles(.02,10020);e.dev.updateProjectiles(.02,10040);assert.equal(m['Pump Shotgun'].hits,1);assert.ok(m['Pump Shotgun'].damage<=250);assert.equal(a.stats.hits,1);pass('Shotgun: eight real pellets, one trigger pull, one successful trigger pull, no overkill');
}
{
 const e=engine(),[a]=pair(e);a.hp=75;a.lastDamageAt=1000;a.regenActive=false;e.dev.updateHealthRegen(a,.1,7999);assert.equal(a.hp,75);e.dev.updateHealthRegen(a,.1,8000);assert.equal(a.hp,77.5);e.dev.updateHealthRegen(a,10,18000);assert.equal(a.hp,250);assert.equal(a.regenActive,false);assert.ok(e.dev.tryDash(a,1,0,10000));assert.equal(e.dev.tryDash(a,1,0,13999),false);assert.ok(e.dev.tryDash(a,1,0,14000));pass('Regen threshold, seven-second delay, full-health stop, exact four-second dash cooldown');
}
{
 const e=engine(),[a]=pair(e),patch=e.dev.inspect().SAVE.patchState.aiSamples[e.dev.inspect().SAVE.aiRevision],m=patch.meta;const before=e.context.SAR.getWeaponScores().map(r=>r.score);for(const w of Object.values(m))w.picks=10000;assert.deepEqual(e.context.SAR.getWeaponScores().map(r=>r.score),before);pass('Loadout popularity never raises Gun Score');
 // Statistical fixture only: not simulated outcomes. Verify correction of a confounded user mix.
 const mk=(name,kills,deaths)=>({name,kills,deaths,damage:kills*250,shots:(kills+deaths)*10,hits:(kills+deaths)*3,headshots:kills*.3,equippedTime:600,picks:2});
 Object.assign(m['AR-15'],mk('AR-15',40,10));Object.assign(m.AK47,mk('AK47',50,50));Object.assign(m.P90,mk('P90',30,120));patch.skillStrata={'80':{'AR-15':mk('AR-15',40,10),AK47:mk('AK47',40,10)},'20':{AK47:mk('AK47',10,40),P90:mk('P90',30,120)}};
 const r=e.context.SAR.getWeaponScores().find(r=>r.name==='AR-15');assert.equal(r.kd,4);assert.ok(r.skillAdjustedKd<r.kd*.6);pass('Power-standardized Bayesian K/D corrects a high-skill-only sample');
}
fs.writeFileSync(__dirname+'/mechanics-results.json',JSON.stringify({checks:results},null,2));
