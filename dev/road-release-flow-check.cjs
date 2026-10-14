'use strict';
// Production simulation and native event handlers in isolated save worlds.
// Only render-helper access is added; combat, actors and eligibility stay real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__flow={startReload,updateFinalCountdown,updateHud,updateSpectatorHud,matchHudState,isEnemy,startSpectate};window.SAR = {');
const checks=[],metrics={};
const pass=(name,run)=>{run();checks.push(name);console.log('PASS '+name);};
const make=()=>engine({},source);
const held=e=>e.dev.inspect().state.matches.slice(0,4).forEach(m=>m.status='fixture-held');
const entry=(e,mode)=>mode==='deathmatch'?e.context.SAR.startDeathmatch():mode==='custom-tdm'?e.context.SAR.startCustomMatch({mode:'tdm',bots:[{sourceBotId:'random',team:1}]}):mode==='custom-dm'?e.context.SAR.startCustomMatch({mode:'deathmatch',bots:[{sourceBotId:'random'}]}):e.dev.queueForMatch(mode);
const persistent=e=>{const save=e.context.SAR.getUniverse();return Object.fromEntries(Object.entries(save).filter(([key])=>!['config','matchSlots','updatedAt'].includes(key)));};
const exactRecords=(actual,expected,label)=>assert.equal(crypto.createHash('sha256').update(JSON.stringify(actual)).digest('hex'),crypto.createHash('sha256').update(JSON.stringify(expected)).digest('hex'),label);
const actorState=a=>({x:a.x,y:a.y,hp:a.hp,dashUntil:a.dashUntil,cooldown:a.dashCooldownUntil,slots:a.slots.map(s=>({ammo:s.ammo,reserve:s.reserve,reloading:s.reloading,reloadEnd:s.reloadEnd})),stats:{...a.stats},xpEvents:structuredClone(a.xpEvents)});

pass('Keyboard and mouse dash plus reload cannot mutate countdown actors; active controls still work in every human mode',()=>{
 for(const mode of ['tdm','ranked-tdm','deathmatch','custom-tdm','custom-dm'])for(const mouse of [false,true]){
  const e=make(),m=entry(e,mode),p=m.participants.find(a=>a.isPlayer);e.ui.flush();assert.equal(m.status,'countdown');assert.equal(e.ui.document.pointerLockElement,e.ui.canvas);
  p.slots[0].ammo--;const before=actorState(p),xp=JSON.stringify(e.context.SAR.getProgression());if(mouse)e.dev.CONFIG.binds.dash='MouseMiddle';
  if(mouse)e.ui.dispatch('canvas','mousedown',{button:1});else e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.dash});
  e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.reload});assert.deepEqual(actorState(p),before,mode+(mouse?' mouse':' keyboard'));
  assert.equal(e.dev.tryDash(p,1,0,e.dev.now()),false);e.context.__flow.startReload(p,e.dev.now());assert.deepEqual(actorState(p),before);assert.equal(JSON.stringify(e.context.SAR.getProgression()),xp);
  e.ui.dispatch('window','keyup',{code:e.dev.CONFIG.binds.reload});if(mouse)e.ui.dispatch('canvas','mouseup',{button:1});else e.ui.dispatch('window','keyup',{code:e.dev.CONFIG.binds.dash});
  // Starting a dash in the last countdown frame must not carry into FIGHT.
  e.step(2.99);const last=actorState(p);if(mouse)e.ui.dispatch('canvas','mousedown',{button:1});else e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.dash});assert.deepEqual(actorState(p),last);e.step(.01);assert.equal(m.status,'active');assert.equal(p.dashCooldownUntil,0);
  if(mouse)e.ui.dispatch('canvas','mouseup',{button:1});else e.ui.dispatch('window','keyup',{code:e.dev.CONFIG.binds.dash});
  if(mouse)e.ui.dispatch('canvas','mousedown',{button:1});else e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.dash});e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.reload});assert.ok(p.dashCooldownUntil>e.dev.now());assert.equal(p.slots[0].reloading,true);
 }
});
pass('Captured aim and weapon selection remain available before FIGHT without firing, damage or movement',()=>{
 const e=make(),m=e.dev.queueForMatch(),p=m.participants.find(a=>a.isPlayer);e.ui.flush();const before={x:p.x,y:p.y,hp:p.hp,shots:p.stats.shots},aim=e.dev.input.aimX;
 e.ui.dispatch('document','mousemove',{movementX:25,movementY:10});assert.ok(e.dev.input.aimX>aim);e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.sidearm});assert.equal(p.currentSlot,1);
 e.ui.dispatch('canvas','mousedown',{button:0});e.ui.dispatch('window','keydown',{code:e.dev.CONFIG.binds.moveUp});e.step(.8);assert.deepEqual({x:p.x,y:p.y,hp:p.hp,shots:p.stats.shots},before);assert.equal(e.dev.inspect().state.projectiles.filter(projectile=>projectile.matchId===m.id).length,0);
});
pass('Final five-second countdown shows 5→1 in TDM, Ranked, Deathmatch and Custom; overtime/results hide it',()=>{
 for(const mode of ['tdm','ranked-tdm','deathmatch','custom-tdm','custom-dm']){
  const e=make(),m=entry(e,mode),overlay=e.ui.element('finalCountdown');e.step(3);m.participants.forEach(a=>{a.dead=true;a.respawnAt=Infinity;});
  for(const digit of [5,4,3,2,1]){m.startedAt=e.dev.now()-m.durationMs+digit*1000;e.context.__flow.updateFinalCountdown(e.dev.now());assert.equal(overlay.classList.contains('hidden'),false);assert.equal(overlay.textContent,String(digit));}
  m.overtime=true;e.context.__flow.updateFinalCountdown(e.dev.now());assert.equal(overlay.classList.contains('hidden'),true);m.overtime=false;
  e.dev.endMatch(m,m.mode==='deathmatch'?m.participants[0].id:0,'time');e.ui.flush();assert.equal(overlay.classList.contains('hidden'),true);
 }
});
pass('Custom play, shots, damage, dash, reload, death, respawn and finalization never write any official save record',()=>{
 for(const mode of ['tdm','deathmatch']){
  const e=make(),creditReports=[];e.context.SARCommerce={recordMatch:id=>creditReports.push(id)};held(e);const before=persistent(e),controlStorage=Object.fromEntries(e.data),m=e.context.SAR.startCustomMatch({mode,bots:[{sourceBotId:'random',team:1}]}),p=m.participants.find(a=>a.isPlayer),enemy=m.participants.find(a=>!a.isPlayer);e.step(3);for(const a of m.participants){a.nextThink=a.nextDecision=a.nextAim=Infinity;}
  e.dev.tryDash(p,1,0,e.dev.now());e.dev.fire(p,p.angle,e.dev.now());p.slots[p.currentSlot].ammo--;e.context.__flow.startReload(p,e.dev.now());e.step(.5);
  e.dev.applyDamage(enemy,{owner:p,weapon:p.slots[0].name,travel:100},250,true,e.dev.now());e.dev.respawnActor(enemy);e.dev.applyDamage(p,{owner:enemy,weapon:enemy.slots[0].name,travel:100},250,false,e.dev.now());e.dev.respawnActor(p);
  e.dev.endMatch(m,mode==='tdm'?0:p.id,'time');const result=JSON.stringify(m.result);e.dev.endMatch(m,mode==='tdm'?1:enemy.id,'score');e.ui.flush();assert.equal(JSON.stringify(m.result),result);
  exactRecords(persistent(e),before,'All persistent records except explicitly saved custom setup and background-slot snapshots remain exact');assert.equal(e.context.SAR.getState().actors,50);assert.match(e.ui.element('modalContent').innerHTML,/Session statistics only/);assert.deepEqual(creditReports,[]);
  assert.equal(m.result.xp,null);assert.equal(m.result.ranked,null);const reload=engine(Object.fromEntries(e.data),source),controlReload=engine(controlStorage,source);exactRecords(persistent(reload),persistent(controlReload),'Restart retains exact custom exclusions while both fresh background leagues register their legitimate weapon picks');
 }
});
pass('Mode-specific human and spectator HUD keeps TDM team scores separate from Deathmatch placement/leader',()=>{
 const e=make();for(const id of [0,1,2,3]){e.context.__flow.startSpectate(id);e.context.__flow.updateSpectatorHud(e.dev.now());const m=e.dev.inspect().state.matches[id],focus=m.participants[0],hud=e.context.__flow.matchHudState(m,focus,e.dev.now());assert.equal(hud.ffa,m.mode==='deathmatch');if(hud.ffa){assert.match(hud.score,/LEADER/);assert.doesNotMatch(hud.score,/BLUE|RED|TEAM/);}else{assert.doesNotMatch(hud.score,/LEADER/);assert.equal(hud.total,0);}}
 e.dev.exitGame();for(const mode of ['tdm','ranked-tdm','deathmatch','custom-tdm','custom-dm']){const m=entry(e,mode);e.context.__flow.updateHud(e.dev.now());const ffa=m.mode==='deathmatch';assert.equal(e.ui.element('hud').dataset.mode,m.mode);assert.equal(e.ui.element('hudIdentityHeading').textContent,ffa?'YOUR PLACEMENT':'YOUR TEAM');assert.equal(e.ui.element('hudScoreHeading').textContent,ffa?'KILLS / LEADER':'SCORE');e.dev.exitGame();}
});
pass('Seeded TDM/Deathmatch spawn stress keeps living enemies off respawn points with unchanged collision and team identities',()=>{
 const e=make();let nearest=Infinity,samples=0;for(let tick=0;tick<900;tick++){e.step();if(tick%60)continue;for(const m of e.dev.inspect().state.matches.slice(0,4)){const a=m.participants[tick%10],team=a.team;for(let trial=0;trial<20;trial++){e.dev.respawnActor(a);samples++;assert.equal(a.team,team);assert.equal(e.dev.collides(a.x,a.y),false);assert.equal(a.hp,250);for(const enemy of m.participants.filter(b=>!b.dead&&e.context.__flow.isEnemy(a,b))){const distance=Math.hypot(a.x-enemy.x,a.y-enemy.y);nearest=Math.min(nearest,distance);assert.ok(distance>115,'Existing spawn safety clearance: '+distance);}}}}
 metrics.spawns={samples,minimumEnemyDistanceWorld:nearest};
});
const report={result:'PASS',groups:checks.length,checks,metrics,scope:'Real production simulation and event handlers with DOM/canvas stubs; this is not native/graphical runtime evidence.'};
if(process.env.SAR_TEST_OUTPUT){fs.mkdirSync(path.dirname(process.env.SAR_TEST_OUTPUT),{recursive:true});fs.writeFileSync(process.env.SAR_TEST_OUTPUT,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({result:report.result,groups:report.groups,metrics}));
