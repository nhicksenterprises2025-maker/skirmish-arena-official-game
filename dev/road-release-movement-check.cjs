'use strict';
// Same player input, dash and swept collision functions; only test exports are added.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__MovementPass={getPlayer,updatePlayer,moveWithCollision,collides,tryDash,updateDashMotion,PLAYER_SPEED,ACTOR_RADIUS,DASH_DISTANCE,DASH_DURATION_MS,DASH_COOLDOWN_MS,WORLD};window.SAR = {');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function launched(){const e=engine({},source);e.dev.queueForMatch();e.ui.flush();const api=e.context.__MovementPass,p=api.getPlayer();e.dev.inspect().state.matches[p.matchId].status='active';for(const a of e.dev.inspect().state.actors)if(a!==p)a.dead=true;return {e,api,p};}
function lane(api){for(let y=100;y<api.WORLD.h-600;y+=40)for(let x=100;x<api.WORLD.w-600;x+=40){let clear=true;for(let dy=0;dy<=400;dy+=20)for(let dx=0;dx<=400;dx+=20)if(api.collides(x+dx,y+dy))clear=false;if(clear)return{x:x+60,y:y+60};}throw Error('No clear movement square');}
check('Keyboard press/release stays responsive; diagonal walking has no speed advantage and sprint uses existing multiplier',()=>{
 const {e,api,p}=launched(),at=lane(api);Object.assign(p,at);e.ui.dispatch('window','keydown',{code:'KeyD'});api.updatePlayer(p,.1,10000);assert.ok(Math.abs(p.x-at.x-api.PLAYER_SPEED*.1)<1e-8);assert.equal(p.y,at.y);
 e.ui.dispatch('window','keyup',{code:'KeyD'});const stopped={x:p.x,y:p.y};api.updatePlayer(p,.1,10100);assert.deepEqual({x:p.x,y:p.y},stopped);assert.equal(p.vx,0);assert.equal(p.vy,0);
 Object.assign(p,at);e.ui.dispatch('window','keydown',{code:'KeyD'});e.ui.dispatch('window','keydown',{code:'KeyS'});api.updatePlayer(p,.1,10200);assert.ok(Math.abs(Math.hypot(p.x-at.x,p.y-at.y)-api.PLAYER_SPEED*.1)<1e-8);
 Object.assign(p,at);e.ui.dispatch('window','keydown',{code:'ShiftLeft'});api.updatePlayer(p,.1,10300);assert.ok(Math.abs(Math.hypot(p.x-at.x,p.y-at.y)-api.PLAYER_SPEED*1.48*.1)<1e-8);assert.equal(p.sprinting,true);
});
check('Same one-second normal travel at 30/60/120 steps; input release has no unintended coast',()=>{
 const distances=[];for(const rate of [30,60,120]){const {e,api,p}=launched(),at=lane(api);Object.assign(p,at);e.dev.input.keys.add('KeyD');for(let i=0;i<rate;i++)api.updatePlayer(p,1/rate,10000+i*1000/rate);distances.push(p.x-at.x);assert.ok(!api.collides(p.x,p.y));e.dev.input.keys.clear();api.updatePlayer(p,1/rate,11000);assert.equal(p.vx,0);}
 for(const d of distances)assert.ok(Math.abs(d-285)<1e-7);
});
check('Swept normal/dash movement cannot tunnel through thin solids; diagonal contact can slide along a wall',()=>{
 const {api,p}=launched();let wall=null;
 for(let y=100;y<api.WORLD.h-100&&!wall;y+=20)for(let x=100;x<api.WORLD.w-300;x+=20)if(!api.collides(x,y)&&api.collides(x+20,y)&&!api.collides(x,y+20)&&!api.collides(x,y+40)){wall={x,y};break;}
 assert.ok(wall);Object.assign(p,wall);api.moveWithCollision(p,400,0);assert.ok(p.x<wall.x+20);assert.ok(!api.collides(p.x,p.y));
 Object.assign(p,wall);api.moveWithCollision(p,80,40);assert.ok(p.y>wall.y+20);assert.ok(!api.collides(p.x,p.y));
 Object.assign(p,wall);assert.equal(api.tryDash(p,1,0,10000),true);api.updateDashMotion(p,.15,10001);assert.ok(!api.collides(p.x,p.y));assert.ok(p.x<wall.x+20);
});
check('Dash preserves exact distance and cooldown; a fresh press before cooldown cannot retrigger',()=>{
 const {api,p}=launched(),at=lane(api);Object.assign(p,at);assert.equal(api.tryDash(p,1,0,10000),true);api.updateDashMotion(p,api.DASH_DURATION_MS/1000,10001);assert.ok(Math.abs(p.x-at.x-api.DASH_DISTANCE)<1e-7);assert.equal(api.tryDash(p,1,0,10000+api.DASH_COOLDOWN_MS-1),false);assert.equal(api.tryDash(p,1,0,10000+api.DASH_COOLDOWN_MS),true);
});
console.log(JSON.stringify({ok:true,checks:count}));
