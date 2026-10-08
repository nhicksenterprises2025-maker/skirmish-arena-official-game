'use strict';
// Isolated real WebGL models: no account, saved world or gameplay loop is opened.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'arena-refined-preview-motion'));
const checks=[],errors=[];let browser;
const fixture=`<!doctype html><meta charset="utf-8"><style>:root{--sky-panel-light:#ececdf}body{margin:20px;background:#ececdf;color:#283d32;font:14px Arial}.row{display:flex;gap:22px}figure{margin:0}canvas{display:block}#operator{width:360px;height:340px}#weapon{width:360px;height:105px}#control{width:360px;height:240px}#rank{width:128px;height:128px}#small-rank{width:32px;height:32px}#sheet{display:none}.card-model-viewer button{padding:8px;margin:4px}</style><div class="row"><div id="lobby"><div id="menu" class="visible"><figure><canvas id="operator"></canvas><figcaption>Lobby operator · feet planted</figcaption></figure><figure><canvas id="weapon"></canvas><figcaption>Separate weapon · full turntable</figcaption></figure></div></div><div><div class="card-model-viewer"><canvas id="control"></canvas><button data-preview-action="left">Left</button><button data-preview-action="reset">Reset</button><button data-preview-action="zoom-in">+</button></div><canvas id="rank" width="256" height="256"></canvas><canvas id="small-rank" width="64" height="64"></canvas></div></div><div id="modal"></div><section id="sarModeEntry" hidden></section><canvas id="sheet" width="500" height="300"></canvas>`;
const server=http.createServer((req,res)=>{const url=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(url==='/fixture'){res.setHeader('content-type','text/html');return res.end(fixture);}const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
function pass(label){checks.push(label);console.log('PASS '+label);}
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 const page=await browser.newPage({viewport:{width:900,height:760}});page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 await page.evaluate(async()=>{
  window.previews=await import('/inspect-25d.mjs');window.models=await import('/models-25d.mjs');await models.ensureModelAssets();
  window.gameplay=models.buildOperator(1,3);models.setOperatorWeapon(gameplay,'AK47');gameplay.group.updateMatrixWorld(true);window.gameplayMatrices=[];gameplay.group.traverse(node=>gameplayMatrices.push(node.matrixWorld.elements.slice()));
  window.op=previews.mountCardPreview(document.querySelector('#operator'),{kind:'operator',skin:3,unarmed:true,lobbyIdle:true,motion:'operator-breathe'});
  window.gun=previews.mountCardPreview(document.querySelector('#weapon'),{kind:'weapon',weapon:'AK47',motion:'weapon-turntable'});
  window.control=previews.mountCardPreview(document.querySelector('#control'),{kind:'weapon',weapon:'AR-15'});
  await previews.paintInspection(document.querySelector('#rank'),{kind:'rank',rankIndex:25});await previews.paintInspection(document.querySelector('#small-rank'),{kind:'rank',rankIndex:25});
 });
 await page.waitForFunction(()=>['operator','weapon','control'].every(id=>document.getElementById(id).dataset.previewReady==='true'));
 const initial=await page.evaluate(()=>({op:op.state(),gun:gun.state(),control:control.state(),diagnostics:previews.previewDiagnostics()}));
 assert.equal(initial.op.unarmed,true);assert.equal(initial.op.rotation,0);assert.equal(initial.op.motion,'operator-breathe');assert.equal(initial.gun.motion,'weapon-turntable');assert.equal(initial.control.motion,null);assert.equal(initial.diagnostics.webglContexts,1);
 await page.locator('#lobby').screenshot({path:path.join(out,'lobby-motion-start.png')});
 const angles=[initial.gun];
 // A complete real 24-second loop, sampled across every octant. No accelerated
 // clock is used for this actual-runtime check.
 for(let i=0;i<8;i++){
  await page.waitForTimeout(3000);const state=await page.evaluate(()=>({op:op.state(),gun:gun.state(),diagnostics:previews.previewDiagnostics()}));angles.push(state.gun);
  assert.equal(state.op.rotation,0);assert.ok(Math.abs(state.op.breathY)<=.120001);assert.ok(Math.abs(state.op.breathScaleY-1)<=.002501);
  const delta=state.gun.motionSeconds-initial.gun.motionSeconds,expected=((initial.gun.rotation+delta*Math.PI*2/24+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  assert.ok(Math.abs(state.gun.rotation-expected)<1e-8,'Rotation follows elapsed time, not frame count');
  if(i===0||i===3||i===7)await page.locator('#lobby').screenshot({path:path.join(out,'lobby-motion-'+(i+1)*3+'s.png')});
 }
 assert.ok(angles.at(-1).motionSeconds-angles[0].motionSeconds>=24);assert.ok(angles.some(value=>value.rotation>2.3)&&angles.some(value=>value.rotation< -2.3));
 const elapsed=angles.at(-1).motionSeconds-initial.gun.motionSeconds,rendered=(await page.evaluate(()=>previews.previewDiagnostics())).motionRenders-initial.diagnostics.motionRenders;assert.ok(rendered/elapsed<=50,'Two animated previews remain within 24 renders/sec each');
 pass('Full real-time 360° turntable; elapsed-time cadence, subtle breathing and one pooled renderer');
 const unchanged=await page.evaluate(()=>{gameplay.group.updateMatrixWorld(true);let index=0,same=true;gameplay.group.traverse(node=>{same&&=node.matrixWorld.elements.every((value,i)=>value===gameplayMatrices[index][i]);index++;});return same;});assert.equal(unchanged,true);assert.equal((await page.evaluate(()=>control.state())).rotation,0);
 pass('Preview motion leaves independent gameplay transforms and other inspection cards unchanged');
 await page.evaluate(()=>document.querySelector('#lobby').style.display='none');await page.waitForFunction(()=>previews.previewDiagnostics().animatedCards===0);await page.waitForTimeout(150);
 const hidden=await page.evaluate(()=>({diagnostics:previews.previewDiagnostics(),seconds:gun.state().motionSeconds}));await page.waitForTimeout(700);
 assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).motionRenders,hidden.diagnostics.motionRenders);assert.equal((await page.evaluate(()=>gun.state())).motionSeconds,hidden.seconds);assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).animationScheduled,false);
 await page.evaluate(()=>document.querySelector('#lobby').style.display='');await page.waitForFunction(()=>previews.previewDiagnostics().animatedCards===2);await page.waitForTimeout(150);
 const resumed=await page.evaluate(()=>gun.state());assert.ok(resumed.motionSeconds-hidden.seconds<.4,'Hidden time must not jump the turntable');
 // Controlled document visibility uses the same browser event as a hidden tab.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);const suspended=await page.evaluate(()=>previews.previewDiagnostics());await page.waitForTimeout(400);assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).motionRenders,suspended.motionRenders);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(renders=>previews.previewDiagnostics().motionRenders>renders,suspended.motionRenders);
 pass('Hidden lobby and hidden document stop preview renders; resume excludes hidden elapsed time');
 for(const screen of ['modal','sarModeEntry']){
  await page.evaluate(id=>{const overlay=document.getElementById(id);if(id==='modal')overlay.classList.add('visible');else overlay.hidden=false;},screen);await page.waitForFunction(()=>previews.previewDiagnostics().animatedCards===0);await page.waitForTimeout(100);
  const covered=await page.evaluate(()=>({draws:previews.previewDiagnostics().motionRenders,seconds:gun.state().motionSeconds}));await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).motionRenders,covered.draws);assert.equal((await page.evaluate(()=>gun.state())).motionSeconds,covered.seconds);
  await page.evaluate(id=>{const overlay=document.getElementById(id);if(id==='modal')overlay.classList.remove('visible');else overlay.hidden=true;},screen);await page.waitForFunction(draws=>previews.previewDiagnostics().motionRenders>draws,covered.draws);assert.ok((await page.evaluate(()=>gun.state())).motionSeconds-covered.seconds<.25);
 }
 pass('Modal and mode-entry screen suspend covered lobby draws and resume without a phase jump');
 const box=await page.locator('#control').boundingBox();await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+190,box.y+100,{steps:4});await page.mouse.up();assert.ok(Math.abs((await page.evaluate(()=>control.state())).rotation)>.9);
 await page.locator('[data-preview-action="reset"]').click();assert.equal((await page.evaluate(()=>control.state())).rotation,0);await page.locator('#control').press('ArrowRight');assert.ok((await page.evaluate(()=>control.state())).rotation>.26);await page.locator('#control').press('Home');assert.equal((await page.evaluate(()=>control.state())).rotation,0);await page.locator('[data-preview-action="zoom-in"]').click();assert.equal((await page.evaluate(()=>control.state())).zoom,1.04);
 pass('Existing drag, keyboard rotation, Reset and zoom controls still work independently');
 await page.evaluate(()=>document.querySelector('#lobby').style.display='none');await page.waitForFunction(()=>previews.previewDiagnostics().animatedCards===0);
 const rank=await page.evaluate(async()=>{const sheet=document.getElementById('sheet'),manifest=await(await fetch('/assets/25d/ranks/manifest.json')).json(),values=[];for(const item of manifest.models){await previews.paintInspection(sheet,{kind:'rank',rankIndex:item.rankIndex});values.push(sheet.toDataURL());}const diag=previews.previewDiagnostics();return{count:manifest.models.length,unique:new Set(values).size,diag,minimumDepth:Math.min(...manifest.models.map(model=>model.dimensions.z)),readable:[...document.getElementById('small-rank').getContext('2d').getImageData(0,0,64,64).data].filter((v,i)=>i%4===3&&v>0).length};});assert.equal(rank.count,26);assert.equal(rank.unique,26);assert.equal(rank.diag.webglContexts,1);assert.ok(rank.diag.staticModels<=3&&rank.diag.thumbnailCount<=48);assert.ok(rank.minimumDepth>7);assert.ok(rank.readable>500);
 await page.locator('#rank').screenshot({path:path.join(out,'rank-dimensional-128px.png')});await page.locator('#small-rank').screenshot({path:path.join(out,'rank-dimensional-32px.png')});
 pass('26 genuine dimensional ranks load/reuse through one context and remain readable at 32px');
 const backgrounds=await page.evaluate(async()=>{
  const sheet=document.getElementById('sheet'),blue=document.createElement('div'),neutral=document.createElement('div');blue.style.setProperty('--sky-panel-light','#DFEBF5');neutral.style.setProperty('--sky-panel-light','#ececdf');document.body.append(blue,neutral);
  function canvas(surface){const result=document.createElement('canvas');result.width=320;result.height=190;surface.append(result);return result;}
  const first=canvas(blue),second=canvas(neutral),repeatBlue=canvas(blue),repeatNeutral=canvas(neutral),badge=canvas(neutral),options={kind:'weapon',weapon:'AK47'};
  const color=target=>[...target.getContext('2d').getImageData(0,0,1,1).data];
  await previews.paintInspection(first,options);await previews.paintInspection(second,options);const hits=previews.previewDiagnostics().cacheHits;await previews.paintInspection(repeatBlue,options);await previews.paintInspection(repeatNeutral,options);await previews.paintInspection(badge,{kind:'rank',rankIndex:25});
  const result={blue:color(first),neutral:color(second),repeatBlue:color(repeatBlue),repeatNeutral:color(repeatNeutral),cacheHits:previews.previewDiagnostics().cacheHits-hits,rankAlpha:color(badge)[3]};blue.remove();neutral.remove();return result;
 });
 assert.deepEqual(backgrounds.blue,[223,235,245,255]);assert.deepEqual(backgrounds.neutral,[236,236,223,255]);assert.deepEqual(backgrounds.repeatBlue,backgrounds.blue);assert.deepEqual(backgrounds.repeatNeutral,backgrounds.neutral);assert.ok(backgrounds.cacheHits>=2);assert.equal(backgrounds.rankAlpha,0);
 pass('Neutral gameplay preview surfaces inherit their own theme; blue/neutral thumbnail caches stay separate and ranks remain transparent');
 await page.evaluate(()=>{control.dispose();window.failed=previews.mountCardPreview(document.getElementById('control'),{kind:'rank',rankIndex:1000,motion:'weapon-turntable'});});await page.waitForFunction(()=>document.getElementById('control').dataset.previewReady==='error');await page.waitForTimeout(100);
 const failed=await page.evaluate(()=>previews.previewDiagnostics());await page.waitForTimeout(350);assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).frames,failed.frames);assert.equal(failed.animationScheduled,false);
 await page.evaluate(()=>previews.mountCardPreview(document.getElementById('control'),{kind:'weapon',weapon:'AK47',motion:'weapon-turntable'}));await page.waitForFunction(()=>document.getElementById('control').dataset.previewReady==='true');assert.equal((await page.evaluate(()=>previews.previewDiagnostics())).mountedCards,3);
 pass('Unavailable preview stops its animation/retry work and an explicit remount recovers once');
 await page.evaluate(()=>{previews.clearCardPreviews();models.disposeModel(gameplay.group);});await page.waitForTimeout(100);const final=await page.evaluate(()=>previews.previewDiagnostics());assert.equal(final.mountedCards,0);assert.equal(final.animatedCards,0);assert.equal(final.pendingCards,0);assert.equal(final.animationScheduled,false);assert.deepEqual(errors,[]);
 const averageRenderMs=final.totalRenderMs/final.renders;assert.ok(averageRenderMs<25,'Average real WebGL preview draw must stay under one 24fps draw budget');
 pass('Bounded render work; complete card/listener cleanup; no browser exceptions');
 fs.writeFileSync(path.join(out,'preview-motion-results.json'),JSON.stringify({ok:true,checks,initial,angles,elapsed,rendered,averageRenderMs,rank,backgrounds,diagnostics:final,errors},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
