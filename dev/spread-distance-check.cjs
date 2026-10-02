'use strict';
// Execute the shipped aiming/firing functions with repeatable random draws.
// A near and far cursor along the same bearing must produce identical angular samples.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const injected=source.replace('window.SAR = {','window.__SPREAD={effectiveSpreadDeg,updateCrosshairVisual,updatePlayer,updateAds,updateBurst,makeWeaponState,getPlayer,worldToScreen,screenToWorld};window.SAR = {');
const official={
 'AR-15':[2.70,2.90,3.60,1.50],AK47:[4,4.5,5.2,1.6],'SMG-9':[3.1,3.3,3.7,1.8],
 'Pump Shotgun':[6.5,7.5,9,3],'Auto 12':[7.45,8.5,10,3.4],'LR-762':[10,12,15,1.2],
 'LW Tundra':[12.2,14,18,1],'War Head LMG':[5.35,5.8,6.2,1.8],P90:[2.2,2.4,2.8,1.2],
 '9mm':[4.75,5,5.45,1.1],X16:[4,4.4,4.75,1.3],'X-16 Auto':[4.65,5,5.35,1.5],
 'SR-Aug':[4.5,4.75,5.5,2.2],'SPAS-12':[5.8,5.925,6.25,1.7]
};
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`),checks=[];
const pass=test=>{checks.push(test);console.log('PASS '+test);};
let samples=0;
function fixture(){
 const e=engine({},injected);e.dev.queueForMatch();e.ui.flush();const d=e.context.__SPREAD,a=d.getPlayer(),{state}=e.dev.inspect();assert.ok(a);state.matches[a.matchId].status='active';state.paused=false;e.dev.CONFIG.viewMode='CLASSIC';
 let lane;for(let y=100;y<2000&&!lane;y+=80)for(let x=100;x<3500&&!lane;x+=80)if(!e.dev.collides(x,y)&&e.dev.pathClear(x,y,x+200,y))lane={x,y};assert.ok(lane);Object.assign(a,lane,{dead:false,currentSlot:0,dashUntil:-1});
 // Both aim points fit on screen at this existing camera zoom. No zoom enters spread or reticle size.
 Object.assign(state.camera,{x:a.x+1000,y:a.y,zoom:.4});
 const cross=e.context.document.getElementById('crosshair'),props=new Map();cross.style.setProperty=(k,v)=>props.set(k,v);return {e,d,a,state,cross,props};
}
function distribution(name,mode,tiles,human=true,bearing=.12){
 const f=fixture(),{e,d,state,cross,props}=f,w=e.context.SAR.getWeapons()[name];let a=f.a;a.slots[0]=d.makeWeaponState(name);
 e.dev.input.keys.clear();if(mode!=='stationary'&&mode!=='ADS')e.dev.input.keys.add('KeyD');if(mode==='sprint')e.dev.input.keys.add('ShiftLeft');if(mode==='ADS'||mode==='walk-ADS')e.dev.input.keys.add('MouseRight');
 a.adsBlend=mode==='ADS'?1:mode==='walk-ADS'?.5:0;const target=d.worldToScreen(a.x+Math.cos(bearing)*tiles*70,a.y+Math.sin(bearing)*tiles*70);assert.ok(target.x>=0&&target.x<=1440&&target.y>=0&&target.y<=900);
 const world=d.screenToWorld(target.x,target.y);near(Math.hypot(world.x-a.x,world.y-a.y),tiles*70,1e-7);
 // Move through the actual relative-mouse handler, then through player aim calculation.
 e.ui.dispatch('document','mousemove',{movementX:target.x-e.dev.input.aimX,movementY:target.y-e.dev.input.aimY});
 // Sensitivity affects cursor movement only; place the exact target after testing the handler.
 e.dev.input.aimX=target.x;e.dev.input.aimY=target.y;d.updatePlayer(a,0,e.dev.now());near(a.angle,bearing,1e-9);
 if(!human){const bot=state.actors.find(b=>!b.isPlayer&&b.matchId===a.matchId&&b.team===a.team);Object.assign(bot,{x:a.x,y:a.y,dead:false,angle:a.angle,vx:a.vx,vy:a.vy,sprinting:a.sprinting,ads:a.ads,adsBlend:a.adsBlend,dashUntil:-1,currentSlot:0});bot.slots[0]=d.makeWeaponState(name);a=bot;}
 const expected=mode==='stationary'?w.spread:mode==='sprint'?w.sprintSpread:mode==='ADS'?w.adsSpread:mode==='walk-ADS'?(w.walkSpread+w.adsSpread)/2:w.walkSpread;
 near(d.effectiveSpreadDeg(a),expected);d.updateCrosshairVisual(a);near(Number(cross.dataset.spread),expected,.00005);const gap=props.get('--gap');assert.equal(gap,(Math.min(60,Math.max(4,3+expected*3))).toFixed(2)+'px');
 const angles=[];
 for(let i=0;i<64;i++){
  a.slots[0]=d.makeWeaponState(name);state.projectiles=[];const now=e.dev.now()+1000+i*2000;assert.equal(e.dev.fire(a,a.angle,now),true);
  if(w.burstCount){d.updateBurst(a,now+65);d.updateBurst(a,now+130);assert.equal(state.projectiles.length,3);assert.deepEqual(state.projectiles.map(p=>p.born),[now,now+65,now+130]);}
  else assert.equal(state.projectiles.length,w.pellets);
  for(const p of state.projectiles){const offset=Math.atan2(p.vy,p.vx)-a.angle;assert.ok(Math.abs(offset)<=expected*Math.PI/360+1e-10,name+' '+mode+' outside authoritative cone');angles.push(offset);samples++;}
  near(d.effectiveSpreadDeg(a),expected);d.updateCrosshairVisual(a);assert.equal(props.get('--gap'),gap,'repeated fire adds no reticle bloom');
 }
 assert.ok(Math.max(...angles)>expected*Math.PI/360*.65&&Math.min(...angles)<-expected*Math.PI/360*.65,name+' samples both sides of the cone');
 return {angles,gap,spread:expected};
}
for(const [name,values] of Object.entries(official)){
 const f=fixture(),{a,d,e}=f,w=e.context.SAR.getWeapons()[name];assert.deepEqual([w.spread,w.walkSpread,w.sprintSpread,w.adsSpread],values);a.slots[0]=d.makeWeaponState(name);
 for(const speed of [0,8,27,28]){a.vx=speed;a.vy=0;a.sprinting=false;a.adsBlend=0;near(d.effectiveSpreadDeg(a),w.spread);}
 a.vx=29;near(d.effectiveSpreadDeg(a),w.walkSpread);a.sprinting=true;near(d.effectiveSpreadDeg(a),w.sprintSpread);a.sprinting=false;near(d.effectiveSpreadDeg(a),w.walkSpread);a.vx=0;near(d.effectiveSpreadDeg(a),w.spread);
 for(const walking of [false,true])for(const ads of [0,.25,.5,.75,1]){a.vx=walking?180:0;a.adsBlend=ads;near(d.effectiveSpreadDeg(a),(walking?w.walkSpread:w.spread)*(1-ads)+w.adsSpread*ads);}
 for(const mode of ['stationary','walk','sprint','ADS','walk-ADS']){
  const close=distribution(name,mode,2),far=distribution(name,mode,30),bot=distribution(name,mode,30,false);
  near(close.spread,far.spread);assert.equal(close.gap,far.gap);assert.equal(close.angles.length,far.angles.length);for(let i=0;i<close.angles.length;i++){near(close.angles[i],far.angles[i]);near(close.angles[i],bot.angles[i]);}
 }
}
pass('All 14 weapons: exact four states, immediate movement changes, near-stationary threshold and existing ADS interpolation');
pass('2-tile versus 30-tile aim: identical angular samples and crosshair gaps for every weapon/state; bots use the same dispersion');
pass('Shotgun pellets stay independently inside the supplied cone; all SR-Aug rounds independently use it at 0/65/130 ms; repeated fire adds no bloom');
{
 const {e,d,a,state}=fixture();a.slots[0]=d.makeWeaponState('LR-762');a.vx=180;a.sprinting=false;a.adsBlend=.5;const gapByZoom=[];const cross=e.context.document.getElementById('crosshair'),props=new Map();cross.style.setProperty=(k,v)=>props.set(k,v);
 for(const zoom of [.4,1,1.4]){state.camera.zoom=zoom;for(const point of [[100,100],[1300,800],[720,450]]){[e.dev.input.aimX,e.dev.input.aimY]=point;d.updateCrosshairVisual(a);gapByZoom.push(props.get('--gap'));}}assert.equal(new Set(gapByZoom).size,1);pass('Crosshair gap is independent of cursor position and camera zoom while following the actual ADS-interpolated angle');
 const victim=state.actors.find(b=>b.matchId===a.matchId&&b.team!==a.team);for(const b of state.actors)if(b!==a&&b!==victim)b.dead=true;victim.x=a.x+120;victim.y=a.y;
 for(const human of [true,false])for(const [offset,damage] of [[0,42],[12,28],[30,0]]){
  const owner=human?a:state.actors.find(b=>!b.isPlayer&&b.matchId===a.matchId&&b.team===a.team);Object.assign(owner,{x:a.x,y:a.y,dead:false,currentSlot:0});owner.slots[0]=d.makeWeaponState('AR-15');state.projectiles=[];victim.dead=false;victim.hp=250;e.dev.fire(owner,0,e.dev.now()+2000);Object.assign(state.projectiles[0],{x:a.x+30,y:a.y+offset,vx:1000,vy:0,travel:30});e.dev.updateProjectiles(.14,e.dev.now()+2200);near(250-victim.hp,damage);
 }
 pass('Original physical head/body/miss collision produces 42/28/0 AR-15 damage for humans and bots');
}
const output={result:'PASS',checks,weapons:14,projectileSamples:samples};
{
 const e=engine({},injected),baseline=require('./fixtures/balance-8.0.json');assert.deepEqual(e.context.SAR.getWeapons(),baseline.weapons);assert.equal(e.dev.balanceFingerprint(),baseline.fingerprint);
 for(let i=0;i<60;i++)e.step();const before=e.context.SAR.getUniverse(),after=e.dev.normalizeSave(before);
 assert.deepEqual(after.patchState,before.patchState);assert.deepEqual(after.patchArchives,before.patchArchives);assert.deepEqual(after.balancePatchHistory,before.balancePatchHistory);assert.deepEqual(after.bots,before.bots);assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.seasons,before.seasons);assert.deepEqual(after.playerSeasons,before.playerSeasons);
 pass('Balance8 constants/fingerprint remain stable after activation; normalization preserves active telemetry, archives, bot profiles/careers/familiarity and seasons without another patch reset');
 output.balanceFingerprint=baseline.fingerprint;output.noTelemetryReset=true;
}
fs.writeFileSync(path.join(__dirname,'spread-distance-results.json'),JSON.stringify(output,null,2));
