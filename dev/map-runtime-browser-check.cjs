'use strict';
// Real Edge, production HTTP/WebSocket, shipped physics/renderer and GLB files.
// Disposable authenticated accounts; no owner saves, native install or source interception.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),WebSocket=createRequire(path.join(__dirname,'../server/index.cjs'))('ws');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const Maps=require('../map-data.js'),Pools=require('../server/map-pools.cjs'),output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-map-runtime'));
const Modes=require('../match-modes.js'),selectedModes=process.env.SAR_MAP_RUNTIME_MODES?.split(',')||['casual-tdm','casual-deathmatch','ranked-tdm','ranked-deathmatch','custom-tdm','custom-deathmatch'];
fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[],measurements=[],contexts=[],protocol=[],customRequests=[],originalPools=process.env.SAR_MAP_POOLS,originalTrust=process.env.SAR_TRUST_PROXY;
process.env.SAR_TRUST_PROXY='1';
let app,browser,page,timer,base,serial=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pass=label=>{checks.push(label);fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({checks,measurements},null,2));console.log('PASS '+label);};
const fixtureWorld=require('./simulate.cjs').engine().context.SAR.getUniverse();

async function accountContext(label){
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});contexts.push(context);
 const response=await context.request.post(base+'/api/auth/signup',{data:{username:'maps_'+label.slice(0,9)+'_'+crypto.randomBytes(4).toString('hex'),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base,'x-forwarded-for':'127.0.0.'+(2+(++serial)%240)}});
 assert.equal(response.status(),201,(await response.json()).error);return {context,account:(await response.json()).account};
}

async function rendered(label){
 const fixture=await accountContext(label);
 await fixture.context.addInitScript(()=>{
  let view;
  const stroke=CanvasRenderingContext2D.prototype.stroke,fillRect=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.id==='game3dMap'&&[.8,1.6].some(width=>Math.abs(width-this.lineWidth)<.001))window.__mapMarkers?.push({color:this.fillStyle,lineWidth:this.lineWidth});return stroke.apply(this,args);};
  CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.id==='game3dMap')window.__mapRectangles?.push({color:this.fillStyle,args});return fillRect.apply(this,args);};
  Object.defineProperty(window,'SAR25D',{configurable:true,get:()=>view,set(value){view=value;if(!value?.render)return;const render=value.render;value.render=function(snapshot){window.__mapFrame=snapshot;window.__mapMarkers=[];window.__mapRectangles=[];return render.call(this,snapshot);};}});
 });
 const target=page=await fixture.context.newPage();target.on('pageerror',error=>errors.push(error.stack||error.message));target.on('console',message=>{if(message.type()==='error')errors.push(message.text());});target.on('websocket',socket=>socket.on('framesent',frame=>{let message;try{message=JSON.parse(String(frame.payload));}catch{return;}if(message.type==='custom')customRequests.push(message.data.config);}));
 await target.goto(base+'/?diagnostics=1');await target.bringToFront();await target.waitForFunction(()=>window.SAR&&SARCloud.state.loaded&&SARMultiplayer.state().connected&&SAR25D?.diagnostics().assetState==='ready'&&!document.getElementById('sarBoot'),null,{timeout:45000});
 await target.evaluate(()=>SARFullscreen.setAutoEnter(false));return {...fixture,page:target};
}

async function protocolHuman(label){
 const fixture=await accountContext(label),response=await fixture.context.request.put(base+'/api/world',{data:{baseRevision:0,save:fixtureWorld},headers:{origin:base,'x-forwarded-for':'127.0.0.'+(2+serial%240)}});assert.equal(response.status(),200);
 const cookie=(await fixture.context.cookies(base)).map(value=>value.name+'='+value.value).join(';'),ws=new WebSocket(base.replace('http','ws')+'/api/multiplayer/socket',{headers:{cookie,origin:base}}),pending=new Map();let id=0;
 ws.on('message',raw=>{const event=JSON.parse(raw),entry=pending.get(event.id);if(!entry)return;pending.delete(event.id);event.type==='error'?entry.reject(Error(event.data.error)):entry.resolve(event.data);});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const client={...fixture,ws,action(type,data={}){const requestId='map-fixture:'+ ++id;ws.send(JSON.stringify({id:requestId,type,data}));return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject});setTimeout(()=>{if(pending.delete(requestId))reject(Error(type+' timed out'));},12000).unref();});}};protocol.push(client);return client;
}

async function topology(target,map,label){
 const observed=await target.evaluate(()=>{const frame=window.__mapFrame,canvas=document.getElementById('game3dMap');return {mapId:frame.mapId,mapVersion:frame.mapVersion,world:frame.world,roads:frame.geometry.roads.length,floors:frame.geometry.floors.length,hidden:frame.actors.filter(a=>!a.dead&&a.mapVisible===false).length,expectedMarkers:frame.actors.filter(a=>!a.dead&&a.mapVisible!==false).length,markers:window.__mapMarkers.length,roadPaint:window.__mapRectangles.filter(rect=>rect.color==='#737f78').length,floorPaint:window.__mapRectangles.filter(rect=>rect.color==='#d2d5c0').length,canvas:{width:canvas.width,height:canvas.height,cssWidth:parseFloat(canvas.style.width),cssHeight:parseFloat(canvas.style.height)},renderer:SAR25D.diagnostics()};});
 assert.equal(observed.mapId,map.id);assert.equal(observed.mapVersion,map.revision);assert.deepEqual(observed.world,map.world);assert.equal(observed.markers,observed.expectedMarkers,'Minimap must omit hidden/dead actors');assert.equal(observed.roadPaint,observed.roads);assert.equal(observed.floorPaint,observed.floors);
 assert.ok(observed.renderer.drawCalls>0&&observed.renderer.triangles>0);assert.ok(observed.renderer.assetCount>0);assert.equal(observed.renderer.assetState,'ready');assert.ok(observed.renderer.environmentCount<=3);assert.equal(observed.renderer.mapId,map.id);assert.deepEqual(observed.renderer.world,map.world);
 measurements.push({label,...observed});return observed;
}

async function shot(target,name){await wait(250);await target.screenshot({path:path.join(output,name+'.png')});}
async function expansionSpectatorViews(map){
 for(const mode of ['gun-game','domination','hardpoint']){
  const fixture=await rendered('observer_'+mode),target=fixture.page;await target.evaluate(()=>SARMultiplayer.disconnect());
  await target.locator('.menu-grid [data-action="play"]').click();await target.locator('[data-action="play-custom"]').click();await target.locator('#customMap').selectOption(map.id);await target.locator('#customMode').selectOption(mode);await target.locator('#customPlayer').uncheck();
  for(let n=0;n<8;n++){await target.locator('#customBot'+n).selectOption('random');await target.locator('#customTeam'+n).selectOption(String(n<4?0:1));}await target.locator('[data-action="start-custom"]').click();
  await target.waitForFunction(()=>SAR.getState().mode==='spectate'&&!SARModeEntry.isVisible(),null,{timeout:15000});await target.waitForFunction(()=>window.__mapFrame?.mode==='spectate');
  assert.equal(await target.locator('#modeObjectiveHud').isVisible(),false);assert.equal(await target.locator('#spectatorObjectiveHud').isVisible(),true);assert.equal(await target.evaluate(()=>window.__mapFrame.matchMode),mode);await topology(target,map,'spectator-'+mode);
  const text=await target.locator('#spectatorObjectiveHud').innerText();if(mode==='gun-game')assert.match(text,/TIER \d+ \/ 15/);else if(mode==='domination')assert.equal(await target.locator('#spectatorObjectiveHud .mode-zone').count(),3);else assert.match(text,/NEXT .*\d+s/);
  await target.keyboard.press('m');await target.waitForFunction(()=>window.__mapFrame.fullMap);await shot(target,map.id+'-'+mode+'-spectator-map');await target.keyboard.press('m');await shot(target,map.id+'-'+mode+'-spectator');await fixture.context.close();pass(map.name+': '+mode+' Custom spectator follows real bots with mode HUD and objective minimap/full-map');
 }
}

async function rendererContract(){
 const fixture=await rendered('renderer'),target=fixture.page;
 await target.waitForFunction(()=>SAR.getState().matches.slice(0,4).some(match=>match?.status==='active'),null,{timeout:15000});await target.evaluate(()=>SAR.watchMatch(SAR.getState().matches.find(match=>match?.status==='active').id));
 const observed=await target.evaluate(()=>{
  const view=SAR25D,snapshot=structuredClone(window.__mapFrame),actor=snapshot.actors.find(actor=>!actor.dead),worldBefore=JSON.stringify(SAR.getUniverse()),operator=()=>view.diagnostics().operators.find(row=>row.id===actor.id),before=operator();
  const changed=structuredClone(snapshot),changedActor=changed.actors.find(row=>row.id===actor.id);changedActor.skinPalette={...changedActor.skinPalette,body:'#486350'};view.render(changed);const paletteKey=operator().key;
  view.render(snapshot);const restoredKey=operator().key;
  const dead=structuredClone(snapshot),deadActor=dead.actors.find(row=>row.id===actor.id);Object.assign(deadActor,{dead:true,deadTime:.05,mapVisible:false,renderVisible:true});dead.time+=16;view.render(dead);const visibleDeath=operator().visible;
  for(let n=1;n<=24;n++){dead.time=snapshot.time+16+n*60;view.render(dead);}const fadedDeath=operator().visible;
  const hidden=structuredClone(snapshot);Object.assign(hidden.actors.find(row=>row.id===actor.id),{dead:false,mapVisible:false,renderVisible:false});view.render(hidden);const hiddenLive=operator().visible;
  view.render(snapshot);return {beforeKey:before.key,paletteKey,restoredKey,visibleDeath,fadedDeath,hiddenLive,restoredVisible:operator().visible,sameRenderer:SAR25D===view,worldUnchanged:JSON.stringify(SAR.getUniverse())===worldBefore,canvasCount:document.querySelectorAll('#game3d').length};
 });
 assert.notEqual(observed.paletteKey,observed.beforeKey);assert.equal(observed.restoredKey,observed.beforeKey);assert.equal(observed.visibleDeath,true);assert.equal(observed.fadedDeath,false);assert.equal(observed.hiddenLive,false);assert.equal(observed.restoredVisible,true);assert.equal(observed.sameRenderer,true);assert.equal(observed.worldUnchanged,true);assert.equal(observed.canvasCount,1);
 measurements.push({label:'renderer-cache-and-visibility',...observed});await shot(target,'renderer-cache-visibility-restored');await fixture.context.close();pass('Actual renderer rebuilds reused actor IDs when palette changes, preserves the short visible death/fade, hides unobserved live actors and restores one unchanged simulation');
}

async function roomView(target,map,entry,actor){
 const snapshot=await target.evaluate(()=>window.__mapFrame),floors=snapshot.geometry.floors,nearest=floors.slice().sort((a,b)=>Math.hypot(actor().x-a.x-a.w/2,actor().y-a.y-a.h/2)-Math.hypot(actor().x-b.x-b.w/2,actor().y-b.y-b.h/2))[0],goal={x:nearest.x+nearest.w/2,y:nearest.y+nearest.h/2};
 const route=entry.e.dev.findPath(actor().x,actor().y,goal.x,goal.y);let waypoint=0,held=[];const deadline=Date.now()+10000;
 while(Date.now()<deadline&&!actor().dead){
  const point=route[waypoint]||goal,dx=point.x-actor().x,dy=point.y-actor().y;
  if(Math.hypot(dx,dy)<20&&waypoint<route.length){waypoint++;continue;}
  if(Math.hypot(goal.x-actor().x,goal.y-actor().y)<32)break;
  const keys=[...(Math.abs(dx)>14?[dx>0?'d':'a']:[]),...(Math.abs(dy)>14?[dy>0?'s':'w']:[])];
  for(const key of held.filter(key=>!keys.includes(key)))await target.keyboard.up(key);for(const key of keys.filter(key=>!held.includes(key)))await target.keyboard.down(key);held=keys;await wait(100);
 }
 for(const key of held)await target.keyboard.up(key);await wait(450);
 const captured=!actor().dead&&actor().x>nearest.x+24&&actor().x<nearest.x+nearest.w-24&&actor().y>nearest.y+24&&actor().y<nearest.y+nearest.h-24&&await target.evaluate(()=>SAR25D.diagnostics().roofs.some(roof=>roof.opacity<.2));
 measurements.push({label:'trusted-player-room-view',mapId:map.id,captured,goal,position:{x:actor().x,y:actor().y},waypoints:route.length});
 if(captured)await shot(target,map.id+'-player-room');
}

async function spectatorViews(fixture){
 const target=fixture.page;await target.waitForFunction(()=>SAR.getState().matches.slice(0,4).every(m=>m?.status==='active'),null,{timeout:16000});
 const slots=await target.evaluate(()=>SAR.getState().matches.slice(0,4)),seen=new Set();
 for(const slot of slots){
  if(seen.has(slot.mapId))continue;seen.add(slot.mapId);const map=Maps.get(slot.mapId);await target.evaluate(id=>SAR.watchMatch(id),slot.id);
  await target.waitForFunction(id=>SAR25D.diagnostics().mapId===id,map.id);
  if(!await target.locator('[data-spectator="tactical"]').isVisible())await target.locator('#spectatorHud details summary').click();
  await target.locator('[data-spectator="tactical"]').click();await target.waitForFunction(()=>window.__mapFrame?.tactical);await wait(200);
  await topology(target,map,'spectator-tactical');await shot(target,map.id+'-tactical');await target.keyboard.press('m');await target.waitForFunction(()=>window.__mapFrame?.fullMap);await topology(target,map,'spectator-full-map');await shot(target,map.id+'-full-map');await target.keyboard.press('m');
  await target.locator('[data-spectator="25d"]').click();await target.waitForFunction(()=>!window.__mapFrame?.tactical);await wait(250);await shot(target,map.id+'-follow');
  let room=false;
  for(let turn=0;turn<12;turn++){
   const inside=await target.evaluate(()=>{const f=window.__mapFrame,a=f.actors.find(a=>a.id===f.focusActorId);return !!a&&!a.dead&&f.geometry.floors.some(room=>a.x>room.x+24&&a.x<room.x+room.w-24&&a.y>room.y+24&&a.y<room.y+room.h-24);});
   if(inside){await wait(450);const roofs=await target.evaluate(()=>SAR25D.diagnostics().roofs);if(roofs.some(roof=>roof.opacity<.2)){room=true;await shot(target,map.id+'-room');break;}}
   await target.locator('[data-spectator="next-bot"]').click();await wait(120);
  }
  measurements.push({label:'room-view',mapId:map.id,captured:room});
 }
 assert.equal(seen.size,3,'Normal background rotation should expose all three registered maps across four slots');
 await target.keyboard.press('Escape');await target.waitForFunction(()=>SAR.getState().mode==='menu');
 pass('Actual spectator buttons switch between all three cached map environments; tactical/full-map topology and filtered markers match the shipped snapshots');
}

async function playOne(map,mode){
 const fixture=await rendered(map.id.replaceAll('-','_')+'_'+mode.replaceAll('-','_')),target=fixture.page,ranked=mode.startsWith('ranked-'),companions=[],limited=mode.startsWith('ltm:')?JSON.parse(process.env.SAR_LTM_DEFINITIONS||'[]').find(item=>'ltm:'+item.id===mode):null,baseMode=limited?.rules.baseMode||mode.replace(/^(casual|custom|ranked)-/,''),definition=Modes.get(ranked?mode:baseMode),ffa=Modes.isFFA(baseMode),expansion=['gun-game','domination','hardpoint'].includes(baseMode);
 assert.ok(definition,'Runtime fixture requires a registered queue mode');
 if(ranked)for(let n=0;n<9;n++)companions.push(await protocolHuman('ranked_'+serial+'_'+n));
 if(!limited)await target.locator('.menu-grid [data-action="play"]').click();
 const action=ranked?(mode==='ranked-tdm'?'play-ranked':'play-ranked-deathmatch'):'play-'+baseMode;
 if(mode.startsWith('custom-')){
  await target.locator('[data-action="play-custom"]').click();await target.locator('#customMap').selectOption(map.id);await target.locator('#customMode').selectOption(baseMode);
  for(let n=0;n<(expansion?9:1);n++){await target.locator('#customBot'+n).selectOption('random');await target.locator('#customTeam'+n).selectOption(String(n<4&&expansion?0:1));}await target.locator('[data-action="start-custom"]').click();
 }else if(limited){
  assert.ok(await target.evaluate(id=>SARMultiplayer.state().ltms?.some(item=>item.id===id),limited.id));await target.locator('[data-mp-mode]').selectOption(mode);assert.match(await target.locator('.mp-map-summary').innerText(),new RegExp(map.name));await target.locator('[data-mp-action="queue"]').click();
 }else{
  for(const companion of companions)await companion.action('queue',{mode});await target.locator('[data-action="'+action+'"]').click();
 }
 await target.waitForSelector('#sarModeEntry:not([hidden])');await target.waitForFunction(()=>SARMultiplayer.state().match?.id||document.querySelector('#modal.visible #modalContent h2')?.textContent==='Queue unavailable',null,{timeout:30000});
 assert.ok(await target.evaluate(()=>SARMultiplayer.state().match?.id),await target.locator('#modalContent').innerText());
 if(limited){await target.waitForFunction(name=>document.querySelector('#sarModeTitle')?.textContent.toLowerCase()===name.toLowerCase(),limited.name,{timeout:5000});await shot(target,map.id+'-configured-ltm-entry');}
 const id=await target.evaluate(()=>SARMultiplayer.state().match.id);for(const companion of companions)await companion.action('ready');
 await target.waitForFunction(()=>SAR.getState().mode==='play'&&!SARModeEntry.isVisible(),null,{timeout:30000});await target.waitForFunction(()=>SARMultiplayer.state().match.status==='active',null,{timeout:15000});
 const entry=app.multiplayer.runtime.getMatch(id);assert.equal(entry.match.mapId,map.id);assert.equal(entry.match.mapVersion,map.revision);assert.equal(entry.match.mode,baseMode);assert.equal(entry.match.sessionType,mode.startsWith('custom-')?'custom':ranked?'ranked':limited?'ltm':'standard');
 if(expansion){assert.equal(entry.match.participants.length,limited&&!ffa?limited.teamSize*2:10);if(!ffa)for(const team of [0,1])assert.equal(entry.match.participants.filter(actor=>actor.team===team).length,limited?.teamSize||5);}
 if(ranked){assert.equal(entry.match.participants.length,10);assert.ok(entry.match.participants.every(a=>a.isPlayer));}
 await target.waitForFunction(id=>SAR25D.diagnostics().mapId===id,map.id);await topology(target,map,mode);
 const label=await target.locator('#hudModeLabel').innerText(),heading=await target.locator('#hudIdentityHeading').innerText();assert.ok(label.toLowerCase().includes(limited?limited.name.toLowerCase():baseMode==='tdm'?'tdm':definition.label.toLowerCase()));assert.equal(heading,ffa?'YOUR PLACEMENT':'YOUR TEAM');
 const modeHud=target.locator('#modeObjectiveHud');assert.equal(await modeHud.isVisible(),expansion);
 if(baseMode==='gun-game'){assert.match(await modeHud.innerText(),/TIER 1 \/ 15/);assert.equal(entry.match.participants[0].gunTier,0);assert.equal(entry.match.objectives?.length||0,0);}
 if(['domination','hardpoint'].includes(baseMode)){
  const expected=baseMode==='domination'?3:5;assert.equal(entry.match.objectives.length,expected);assert.equal(await target.evaluate(()=>window.__mapFrame.objectives.length),expected);
  if(baseMode==='domination')assert.equal(await modeHud.locator('.mode-zone').count(),3);else assert.match(await modeHud.innerText(),/NEXT .*\d+s/);
 }
 const actor=()=>entry.match.participants.find(a=>a.userId===fixture.account.id),start={x:actor().x,y:actor().y,shots:actor().stats.shots};
 await target.locator('#game').click({position:{x:700,y:350}});await target.keyboard.down('d');await wait(350);await target.keyboard.up('d');await target.mouse.down();await wait(400);await target.mouse.up();await wait(150);
 assert.ok(Math.hypot(actor().x-start.x,actor().y-start.y)>1,'Trusted input must move the authoritative actor');assert.ok(actor().stats.shots>start.shots,'Trusted firing must resolve into real shots');
 await target.keyboard.press('m');await target.waitForFunction(()=>window.__mapFrame?.fullMap);await topology(target,map,mode+'-full-map');await target.keyboard.press('m');await shot(target,map.id+'-'+mode);
 if(mode==='custom-tdm')await roomView(target,map,entry,actor);
 if(mode.startsWith('custom-'))assert.equal(entry.match.eligible,false);measurements.push({label:'authoritative-input',mapId:map.id,mode,matchId:id,participants:entry.match.participants.length,distance:Math.hypot(actor().x-start.x,actor().y-start.y),shots:actor().stats.shots-start.shots});
 if(expansion){
  // Accelerate this disposable server's timer; real results still resolve
  // through normal authoritative finalization, never through client injection.
  const before=await target.evaluate(()=>structuredClone(SARMultiplayer.state().progression));entry.match.durationMs=1;
  await target.waitForFunction(()=>document.querySelector('#modalContent')?.dataset.view==='results',null,{timeout:10000});assert.equal(entry.match.status,'ended');assert.equal(entry.result.mode,baseMode);
  const after=await target.evaluate(()=>structuredClone(SARMultiplayer.state().progression));if(mode.startsWith('custom-')){const protectedProjection=value=>({...Object.fromEntries(['totals','byMode','progression','ranked','summary','weaponTotals','tournamentWeaponTotals','balanceMeta','ratios','streaks'].map(key=>[key,value?.[key]])),eligibleRecords:value?.records?.filter(record=>record.eligible)});assert.deepEqual(protectedProjection(after),protectedProjection(before),'Custom finalization must not change projected XP/rating/mastery/credits, eligible records or combat statistics');}
  await shot(target,map.id+'-'+mode+'-results');await target.locator('[data-action="close-result"]').click();await target.waitForFunction(()=>SAR.getState().mode==='menu');measurements.push({label:'normal-authoritative-finalization',mode,mapId:map.id,fixtureTimerAccelerated:true,customProjectionUnchanged:mode.startsWith('custom-'),resultMode:entry.result.mode});
  if(process.env.SAR_MODE_CAPTURE_PROFILES&&mode.startsWith('casual-')){
   await target.locator('#menu [data-action="rank-inspect"]').click();await target.locator('.profile-stat-tabs [data-action="profile-'+baseMode+'"]').click();await target.waitForFunction(mode=>document.getElementById('modalContent').dataset.view==='mode-profile-'+mode,baseMode);
   assert.equal(await target.locator('[data-action="profile-'+baseMode+'"]').getAttribute('aria-current'),'page');assert.match(await target.locator('#modalContent').innerText(),/Custom and practice are excluded/);assert.equal(after.byMode[baseMode].games,1);assert.equal(await target.locator('.career-group dl>div').filter({has:target.locator('dt',{hasText:/^GAMES$/})}).locator('dd').innerText(),'1');await shot(target,map.id+'-'+baseMode+'-profile');measurements.push({label:'actual-mode-profile',mode:baseMode,eligibleGames:after.byMode[baseMode].games});await target.locator('#closeModal').click();
  }
  if(limited){
   assert.equal(after.records.find(record=>record.matchId===id).sessionType,'ltm');if(!limited.xpEligible)assert.deepEqual(after.progression,before.progression);assert.deepEqual(after.ranked,before.ranked);
   await target.locator('[data-mp-action="online-profile"]').click();const games=async label=>target.locator('.mp-record-modes section').filter({has:target.locator('h3',{hasText:label})}).locator('dl>div').filter({has:target.locator('dt',{hasText:/^GAMES$/})}).locator('dd').innerText();assert.equal(await games(/^CASUAL DOMINATION$/),'0');assert.equal(await games(/^LIMITED-TIME MODES$/),limited.statEligible?'1':'0');await shot(target,map.id+'-configured-ltm-record');await target.locator('#closeModal').click();
  }
 }else{await target.keyboard.press('Escape');await target.locator('#pause [data-action="exit"]').click();await target.waitForFunction(()=>SAR.getState().mode==='menu');}
 for(const companion of companions){await companion.action('leave');companion.ws.close();await companion.context.close();}
 await fixture.context.close();pass(map.name+': '+mode+' loads the real map, correct HUD, minimap/full-map and authoritative movement/firing');
}

(async()=>{try{
 browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const map of Maps.list().filter(map=>!process.env.SAR_MAP_RUNTIME_MAP||map.id===process.env.SAR_MAP_RUNTIME_MAP)){
  process.env.SAR_MAP_POOLS=JSON.stringify({revision:'map-runtime-fixture-1',pools:Object.fromEntries(Pools.POOLS.map(pool=>[pool,[map.id]]))});
  app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:'),multiplayerOptions:{manual:true,casualWaitMs:200,mapVoteMs:0,preparationTimeoutMs:45000}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
  timer=setInterval(()=>{try{app.multiplayer.runtime.step();}catch(error){errors.push(error.stack);}},33);
  if(process.env.SAR_MAP_RUNTIME_SPECTATOR_ONLY)await expansionSpectatorViews(map);
  else if(!process.env.SAR_MAP_RUNTIME_RENDERER_ONLY){
   if(map.id==='brightfield-blocks'&&!process.env.SAR_MAP_RUNTIME_SKIP_SPECTATOR){const fixture=await rendered('spectator');await spectatorViews(fixture);await fixture.context.close();}
   for(const mode of selectedModes)await playOne(map,mode);
  }
  if(map.id==='relay-fields'||process.env.SAR_MAP_RUNTIME_RENDERER_ONLY)await rendererContract();
  clearInterval(timer);timer=null;app.stopTournaments();await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();app=null;
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'map-runtime-results.json'),JSON.stringify({ok:true,checks,errors,measurements,customRequests,method:'Real Edge; fresh authenticated disposable account/worlds; production shared simulation and renderer; nine protocol humans for each Ranked queue. Expansion fixtures accelerate their disposable server match timer after real movement/firing to exercise normal result delivery and release the persistent bot pool; no result is injected. Renderer instrumentation observes existing snapshots/draw calls without changing data or methods. Custom Random uses the real shared eligible bot pool; room views navigate via trusted keys along the real pathfinder. No owner account, deployment or native installation. Reticle verdict remains unverified: existing daemon bridge points at unrelated project.'},null,2));
 }catch(error){console.error(error.stack);process.exitCode=1;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'map-runtime-results.json'),JSON.stringify({ok:false,checks,errors,measurements,customRequests,error:error.stack,state:await page?.evaluate(()=>({focus:{focused:document.hasFocus(),hidden:document.hidden,active:document.activeElement?.id},entry:window.SARModeEntry?.state(),boot:window.SARBoot?.getState(),game:window.SAR?.getState(),multiplayer:window.SARMultiplayer?.state(),renderer:window.SAR25D?.diagnostics()})).catch(()=>null)},null,2));}
 finally{clearInterval(timer);for(const client of protocol)client.ws.close();await browser?.close();if(app){app.stopTournaments();await app.multiplayer.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}if(originalPools===undefined)delete process.env.SAR_MAP_POOLS;else process.env.SAR_MAP_POOLS=originalPools;if(originalTrust===undefined)delete process.env.SAR_TRUST_PROXY;else process.env.SAR_TRUST_PROXY=originalTrust;}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
