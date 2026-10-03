'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const injected=source.replace('window.SAR = {','window.__FIVE={effectiveSpreadDeg,updateCrosshairVisual,updateAds,updateBurst,makeWeaponState,weaponSheet,loadoutCard,spectatorAction,settingsTabs,debugOwner,debugEnabled,renderSettingsModal,damageNumbers};window.SAR = {');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const e=engine({},injected),d=e.context.__FIVE,{state,SAVE,meta}=e.dev.inspect(),weapons=e.context.SAR.getWeapons();state.paused=true;
const actor=state.actors.find(a=>a.matchId===0);actor.currentSlot=0;actor.dead=false;actor.dashUntil=-1;actor.vx=actor.vy=0;actor.adsBlend=0;actor.sprinting=false;
for(const [name,w] of Object.entries(weapons)){
 actor.slots[0]=d.makeWeaponState(name);delete actor.spreadWeapon;actor.vx=actor.vy=0;actor.sprinting=false;actor.adsBlend=0;
 near(d.effectiveSpreadDeg(actor),w.spread);actor.vx=180;near(d.effectiveSpreadDeg(actor),w.walkSpread);
 actor.sprinting=true;near(d.effectiveSpreadDeg(actor),w.sprintSpread);
 actor.sprinting=false;actor.vx=0;actor.adsBlend=.5;near(d.effectiveSpreadDeg(actor),(w.spread+w.adsSpread)/2);
 actor.sprinting=false;actor.vx=0;actor.adsBlend=1;near(d.effectiveSpreadDeg(actor),w.adsSpread);d.updateCrosshairVisual(actor);near(Number(e.context.document.getElementById('crosshair').dataset.spread),w.adsSpread,.0001);
 // Actual generated angles use the same full cone, for bots and humans.
 let lane;for(let y=100;y<2000&&!lane;y+=80)for(let x=100;x<3000&&!lane;x+=80)if(!e.dev.collides(x,y)&&e.dev.pathClear(x,y,x+100,y))lane={x,y};assert.ok(lane);Object.assign(actor,lane);
 for(const [spreadMode,speed,sprint,ads,expected] of [['stationary',0,false,0,w.spread],['walking',180,false,0,w.walkSpread],['sprinting',300,true,0,w.sprintSpread],['ADS',0,false,1,w.adsSpread]])for(const isPlayer of [false,true]){
   actor.isPlayer=isPlayer;actor.vx=speed;actor.sprinting=sprint;actor.adsBlend=ads;delete actor.spreadWeapon;let widest=0;
   for(let n=0;n<32;n++){actor.slots[0]=d.makeWeaponState(name);state.projectiles=[];e.dev.fire(actor,0,e.dev.now()+2000);assert.ok(state.projectiles.length,name+' '+spreadMode);for(const p of state.projectiles){const angle=Math.abs(Math.atan2(p.vy,p.vx))*180/Math.PI;assert.ok(angle<=expected/2+1e-7,name+' '+spreadMode);widest=Math.max(widest,angle);}}
   assert.ok(widest>expected*.25,name+' '+spreadMode+' actually uses the cone width');
 }
 actor.isPlayer=false;
}
console.log('PASS all 14 weapons: exact stationary/walk/sprint/ADS constants, ADS interpolation, real player/bot projectile cones, and matching crosshair.');
actor.slots=[d.makeWeaponState('SR-Aug'),d.makeWeaponState('9mm')];actor.currentSlot=0;actor.angle=0;actor.isPlayer=true;actor.adsBlend=1;state.projectiles=[];
const start=e.dev.now()+3000,pulls=meta['SR-Aug'].shots;
assert.equal(e.dev.fire(actor,0,start),true);assert.equal(state.projectiles.length,1);d.updateBurst(actor,start+64);assert.equal(state.projectiles.length,1);
actor.angle=.4;d.updateBurst(actor,start+65);assert.equal(state.projectiles.length,2);actor.angle=-.4;d.updateBurst(actor,start+130);assert.equal(state.projectiles.length,3);
assert.deepEqual(state.projectiles.map(p=>p.born),[start,start+65,start+130]);assert.equal(new Set(state.projectiles.map(p=>p.shot)).size,1);assert.equal(new Set(state.projectiles.map(p=>p.feedbackId)).size,3);
for(const p of state.projectiles){assert.equal(p.damage,23);assert.equal(p.head,45);}assert.equal(actor.slots[0].ammo,36);assert.equal(meta['SR-Aug'].shots,pulls+1);
const victim=state.actors.find(a=>a.matchId===actor.matchId&&a.team!==actor.team);victim.dead=false;victim.hp=63;d.damageNumbers.length=0;
for(const p of state.projectiles)e.dev.applyDamage(victim,p,23,false,p.born);
assert.equal(victim.hp,0);assert.deepEqual(d.damageNumbers.map(n=>n.amount),[23,23,17]);assert.equal(new Set(d.damageNumbers.map(n=>n.offsetX)).size,3);assert.equal(d.damageNumbers.at(-1).killing,true);
assert.equal(e.dev.fire(actor,0,start+699),false);assert.equal(e.dev.fire(actor,0,start+700),true);assert.equal(meta['SR-Aug'].shots,pulls+2);
actor.currentSlot=1;d.updateBurst(actor,start+765);assert.equal(actor.slots[0].pendingBurst,null,'switching weapons cancels remaining rounds');
near(d.weaponSheet('SR-Aug').bodyTtk,2.165);near(d.weaponSheet('SR-Aug').headTtk,.83);assert.equal(weapons['SR-Aug'].pellets,1);assert.equal(weapons['SR-Aug'].burstCount,3);assert.equal(weapons['9mm'].walkSpread,5);assert.equal(weapons['9mm'].sprintSpread,5.45);
console.log('PASS SR-Aug: independent timed projectiles, one trigger-pull record, individual damage feedback, repeat cadence, cancel-on-switch, and real burst TTK.');
for(const n of Object.keys(weapons)){assert.ok(SAVE.playerCareer.weapons[n]);for(const bot of Object.values(SAVE.bots)){assert.ok(bot.career.weaponUsage[n]);assert.ok(n in bot.familiarity);}}
const html=d.loadoutCard('SR-Aug',e.dev.currentMetaRows()),basic=html.split('<details')[0];assert.ok(!basic.includes('Calculated RPM')&&!basic.includes('Hip Walk Spread'));assert.ok(basic.includes('Body TTK')&&basic.includes('Headshot TTK'));assert.ok(html.includes('ADVANCED STATS')&&html.includes('Intra-burst spacing'));
state.mode='spectate';state.spectateMatchId=0;state.spectateActorId=state.actors.find(a=>a.matchId===0).id;
for(let i=0;i<4;i++){assert.equal(state.spectateMatchId,i);d.spectatorAction('next-match');}assert.equal(state.spectateMatchId,0);const selected=state.spectateActorId;d.spectatorAction('next-bot');assert.notEqual(state.spectateActorId,selected);d.spectatorAction('previous-bot');assert.equal(state.spectateActorId,selected);d.spectatorAction('blue');assert.equal(state.actors.find(a=>a.id===state.spectateActorId).team,1);d.spectatorAction('red');assert.equal(state.actors.find(a=>a.id===state.spectateActorId).team,0);d.spectatorAction('tactical');assert.equal(e.dev.CONFIG.spectatorCamera,'TACTICAL');d.spectatorAction('follow');assert.equal(e.dev.CONFIG.spectatorCamera,'FOLLOW');
for(const username of ['another','Noahhicks719','noahhicks719']){e.context.SARCloud={state:{account:{id:'test',username}}};assert.equal(d.debugOwner(),username==='noahhicks719');const tabs=d.settingsTabs('game');assert.ok(!tabs.includes('DEVELOPER / DEBUG'));assert.deepEqual([...tabs.matchAll(/data-settings-tab="([^"]+)"/g)].map(match=>match[1]),['game','audio','account','about']);}
e.context.localStorage.setItem('sar.debug.panel.test','true');assert.equal(d.debugEnabled(),false);assert.equal(e.context.localStorage.getItem('sar.debug.panel.test'),'true','previous preference remains intact but cannot expose a public panel');e.context.SARCloud.state.account.username='other';assert.equal(d.debugEnabled(),false);
console.log('PASS complete dynamic weapon integration, compact/advanced Loadout, four matches, bot/team/camera controls, internal exact-case owner identity and four public Settings tabs without Debug.');
