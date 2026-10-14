'use strict';
// Combat lifecycle edges in the shipped simulation; all worlds/accounts are isolated.
// The additional accessors exist only in this in-memory source, never in the game.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__COMBAT_QUALITY={makeWeaponState,startReload,finishReload,updateBurst,updatePlayer,damageAtRange,get solids(){return solids;},WEAPONS};window.SAR = {');
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function fixture(){
 const e=engine({},source,{mapId:process.env.SAR_TEST_MAP_ID||'brightfield-blocks'});e.dev.queueForMatch();e.ui.flush();
 const {state}=e.dev.inspect(),match=state.matches.find(m=>m.hasPlayer),owner=match.participants.find(a=>a.isPlayer),victim=match.participants.find(a=>a.team!==owner.team);
 match.status='active';match.limit=1000;
 for(const a of state.actors){a.dead=true;a.respawnAt=1e12;}
 let lane;
 for(let y=100;y<2200&&!lane;y+=60)for(let x=100;x<3300&&!lane;x+=60)if(!e.dev.collides(x,y)&&e.dev.pathClear(x,y,x+350,y))lane={x,y};
 assert.ok(lane);Object.assign(owner,lane,{dead:false,currentSlot:0,hp:250,vx:0,vy:0,angle:0,spawnFlash:0});
 Object.assign(victim,{x:lane.x+150,y:lane.y,dead:false,hp:250,vx:0,vy:0,spawnFlash:0});
 state.projectiles=[];state.particles=[];
 const api=e.context.__COMBAT_QUALITY;
 owner.slots=[api.makeWeaponState('FAL'),api.makeWeaponState('9mm')];
 return {e,state,match,owner,victim,api};
}
{
 const {e,owner,victim}=fixture();
 victim.hp=75;victim.lastDamageAt=1000;victim.regenActive=false;
 e.dev.updateHealthRegen(victim,.1,7999);assert.equal(victim.hp,75);
 e.dev.updateHealthRegen(victim,1,8000);assert.equal(victim.hp,100);assert.equal(victim.regenActive,true);
 e.dev.updateHealthRegen(victim,.1,8100);assert.equal(victim.hp,102.5,'active regeneration continues above its entry threshold');
 e.dev.applyDamage(victim,{owner,weapon:'FAL',travel:150},35,false,8200);
 assert.equal(victim.hp,67.5);assert.equal(victim.regenActive,false);
 e.dev.updateHealthRegen(victim,.1,15199);assert.equal(victim.hp,67.5);
 e.dev.updateHealthRegen(victim,.1,15200);assert.equal(victim.hp,70);
 e.dev.updateHealthRegen(victim,100,115200);assert.equal(victim.hp,250);assert.equal(victim.regenActive,false);
 victim.hp=76;victim.lastDamageAt=1000;e.dev.updateHealthRegen(victim,10,20000);assert.equal(victim.hp,76);
 victim.dead=true;victim.hp=0;victim.regenActive=true;e.dev.updateHealthRegen(victim,10,30000);assert.equal(victim.hp,0);assert.equal(victim.regenActive,false);
 pass('250 HP recovery: exact threshold/delay, damage restarts the full delay, active recovery reaches its ceiling, dead actors never heal');
}
{
 const {e,owner,victim,match}=fixture(),now=10000;
 victim.hp=10;e.dev.applyDamage(victim,{owner,weapon:'FAL',travel:150},500,true,now);
 assert.equal(victim.hp,0);assert.equal(victim.dead,true);assert.equal(victim.respawnAt,now+1900);
 assert.equal(owner.stats.damage,10);assert.equal(owner.stats.kills,1);assert.equal(victim.stats.deaths,1);assert.equal(match.score[owner.team],1);
 e.dev.applyDamage(victim,{owner,weapon:'FAL',travel:150},500,true,now+1);e.dev.killActor(victim,owner,'FAL',true,150,now+1);
 assert.equal(owner.stats.kills,1);assert.equal(victim.stats.deaths,1);assert.equal(match.score[owner.team],1);
 e.dev.respawnActor(victim,false);assert.equal(victim.hp,250);assert.equal(victim.dead,false);assert.equal(victim.damageLedger.size,0);assert.equal(victim.damageByWeapon.size,0);assert.equal(victim.lastDamageAt,0);assert.equal(victim.regenActive,false);
 pass('Killing damage is clamped, repeated death callbacks cannot duplicate kills/score, and respawn restores health with a fresh contribution ledger');
}
{
 const {e,owner,api}=fixture(),s=owner.slots[0],w=api.WEAPONS.FAL;
 s.ammo=3;s.reserve=5;api.startReload(owner,1000);assert.equal(s.reloading,true);assert.equal(s.reloadEnd,1000+w.reload*1000);
 assert.equal(e.dev.fire(owner,0,s.reloadEnd-1),false);assert.equal(s.ammo,3);
 owner.currentSlot=1;assert.equal(e.dev.fire(owner,0,2000),true,'sidearm remains usable during primary reload');
 api.finishReload(s,owner);assert.equal(s.ammo,8);assert.equal(s.reserve,0);assert.equal(s.reloading,false);
 owner.currentSlot=0;api.startReload(owner,10000);assert.equal(s.reloading,false,'empty reserve cannot start a phantom reload');
 s.ammo=w.mag;s.reserve=80;api.startReload(owner,11000);assert.equal(s.reloading,false,'full magazine cannot start a reload');
 owner.dead=true;s.ammo=1;api.startReload(owner,12000);assert.equal(s.reloading,false,'dead actors cannot reload');
 pass('Reload preserves ammunition/reserve, blocks firing until completion, permits weapon switching, and rejects full/empty-reserve/dead reloads');
}
{
 const {e,owner,victim,api}=fixture(),s=owner.slots[0],w=api.WEAPONS.FAL;
 victim.dead=true;s.ammo=3;s.reserve=40;api.startReload(owner,e.dev.now());owner.currentSlot=1;
 e.step(w.reload-.001);assert.equal(s.ammo,3);assert.equal(s.reloading,true);
 e.step(.002);assert.equal(s.ammo,w.mag);assert.equal(s.reserve,23);assert.equal(s.reloading,false);
 pass('The real update loop finishes a holstered primary reload at its configured deadline without an early refill');
}
{
 const {e,state,owner,api}=fixture(),s=owner.slots[0];s.ammo=1;s.reserve=4;
 e.ui.dispatch('canvas','mousedown',{button:0});
 assert.equal(state.projectiles.length,1);assert.equal(s.ammo,0);
 for(let i=0;i<60;i++)api.updatePlayer(owner,1/60,1000+i*20);
 assert.equal(state.projectiles.length,1,'holding a semi-auto FAL cannot emit repeated bullets');
 e.ui.dispatch('window','mouseup',{button:0});
 e.step(.3); // A new press after the real semi-auto firing interval.
 e.ui.dispatch('canvas','mousedown',{button:0});assert.equal(s.reloading,true,'a fresh empty-magazine trigger starts reload');
 e.ui.dispatch('window','mouseup',{button:0});
 pass('Shipped mouse handlers fire one FAL projectile per press; holding fire does not repeat, and an empty trigger starts reload');
}
{
 for(const stop of ['reload','switch','death','match end']){
  const {e,state,owner,api,match}=fixture();owner.slots[0]=api.makeWeaponState('SR-Aug');
  assert.equal(e.dev.fire(owner,0,10000),true);assert.equal(state.projectiles.length,1);
  if(stop==='reload')api.startReload(owner,10001);
  if(stop==='switch')owner.currentSlot=1;
  if(stop==='death')owner.dead=true;
  if(stop==='match end')match.status='cooldown';
  api.updateBurst(owner,10130);assert.equal(state.projectiles.length,1,stop+' must cancel pending rounds');assert.equal(owner.slots[0].pendingBurst,null);
 }
 const {e,state,owner,api}=fixture();owner.slots[0]=api.makeWeaponState('SR-Aug');owner.slots[0].ammo=2;
 e.dev.fire(owner,0,10000);api.updateBurst(owner,10130);assert.equal(state.projectiles.length,2);assert.equal(owner.slots[0].ammo,0);assert.equal(owner.slots[0].pendingBurst,null);assert.equal(owner.stats.shots,1);
 pass('SR-Aug pending rounds cancel on reload/switch/death/match end, cannot create ammunition, and remain one trigger-pull sample');
}
{
 const {e,state,owner,victim,api}=fixture();
 owner.slots[0]=api.makeWeaponState('AR-15');e.dev.fire(owner,0,10000);
 const p=state.projectiles[0];Object.assign(p,{x:owner.x+30,y:owner.y+12,vx:5600,vy:0,travel:30});
 e.dev.updateProjectiles(.1,10100);assert.equal(state.projectiles.length,0);assert.equal(victim.hp,222,'swept collision must not tunnel through an actor at low FPS');
 victim.hp=250;state.projectiles=[];owner.slots[0]=api.makeWeaponState('AR-15');e.dev.fire(owner,0,11000);
 const head=state.projectiles[0];Object.assign(head,{x:owner.x+30,y:owner.y+7.3,vx:5600,vy:0,travel:30});
 e.dev.updateProjectiles(.1,11100);assert.equal(victim.hp,222,'a near-head body trajectory remains body damage');
 victim.hp=250;state.projectiles=[];owner.slots[0]=api.makeWeaponState('AR-15');e.dev.fire(owner,0,12000);
 Object.assign(state.projectiles[0],{x:owner.x+30,y:owner.y+7.1,vx:5600,vy:0,travel:30});
 e.dev.updateProjectiles(.1,12100);assert.equal(victim.hp,208,'the physical head boundary uses the projectile path, not randomness');
 pass('Swept projectiles do not tunnel through actors during slow frames; physical head boundary distinguishes adjacent head/body trajectories');
}
{
 const {e,state,owner,victim,api}=fixture();let barrier;
 for(const r of api.solids){
  if(r.type!=='rect')continue;
  const x=r.x-55,y=r.y+r.h*.5,bx=r.x+r.w+55;
  if(!e.dev.collides(x,y)&&!e.dev.collides(bx,y)&&!e.dev.pointLOS(x,y,{x:bx,y})){barrier={x,y,bx,edge:r.x};break;}
 }
 assert.ok(barrier);Object.assign(owner,{x:barrier.x,y:barrier.y,angle:0});Object.assign(victim,{x:barrier.bx,y:barrier.y});
 owner.slots[0]=api.makeWeaponState('FAL');e.dev.fire(owner,0,10000);
 e.dev.updateProjectiles(1,11000);assert.equal(victim.hp,250);assert.equal(state.projectiles.length,0);assert.equal(owner.stats.hits,0);
 owner.x=barrier.edge-21.5;assert.equal(e.dev.collides(owner.x,owner.y),false);
 owner.slots[0]=api.makeWeaponState('FAL');e.dev.fire(owner,0,12000);assert.equal(state.projectiles.length,0,'a muzzle touching a wall cannot originate beyond the obstacle');
 pass('Swept wall collision wins before a hidden actor, and close-wall muzzle obstruction cannot shoot through cover');
}
{
 const {e,api}=fixture();
 for(const [name,w]of Object.entries(api.WEAPONS)){
  const p={weapon:name,damage:w.damage/w.pellets,head:w.head/w.pellets,travel:70*w.falloffStart};
  near(api.damageAtRange(p,false),p.damage);near(api.damageAtRange(p,true),p.head);
  p.travel+=70;near(api.damageAtRange(p,false),p.damage*Math.max(.45,1-w.falloff));
  p.travel=70*10000;near(api.damageAtRange(p,false),p.damage*.45);
 }
 pass('All current weapons keep exact falloff start, legacy world-distance slope and floor without unit double conversion');
}
console.log(`${checks} combat lifecycle groups passed`);
