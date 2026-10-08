'use strict';
// Real local WebGL/inspection models in an account-free verification surface.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'arena-refined-fal-model')),baseline=process.env.SAR_MODEL_BASELINE;
const errors=[],checks=[];let browser;
const fixture='<!doctype html><meta charset="utf-8"><style>:root{--sky-panel-light:#ececdf}body{margin:12px;background:#ececdf;color:#283d32;font:14px Arial}h1{font-size:18px;font-weight:600}#sheet{display:grid;grid-template-columns:repeat(4,310px);gap:12px}figure{margin:0}canvas{width:310px;height:190px;display:block}figcaption{font-size:13px;margin:6px 0}#runtime{width:640px;height:460px}</style><h1 id="title">Weapon verification</h1><div id="sheet"></div><canvas id="runtime" width="1280" height="920"></canvas>';
const server=http.createServer((req,res)=>{const url=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(url==='/fixture'){res.setHeader('content-type','text/html');return res.end(fixture);}const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
function pass(label){checks.push(label);console.log('PASS '+label);}
async function weaponSheet(page,names,filename){
 await page.evaluate(async names=>{document.getElementById('sheet').replaceChildren();document.getElementById('runtime').style.display='none';for(const name of names){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),label=document.createElement('figcaption');canvas.width=620;canvas.height=380;label.textContent=name;figure.append(canvas,label);document.getElementById('sheet').append(figure);await inspection.paintInspection(canvas,{kind:'weapon',weapon:name});}},names);
 await page.locator('body').screenshot({path:path.join(out,filename)});
}
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 const context=await browser.newContext({viewport:{width:1310,height:900},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 if(baseline){
  await context.route('**/*',async route=>{const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=path.resolve(baseline,relative);if(file.startsWith(path.resolve(baseline)+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:path.extname(file)==='.mjs'?'text/javascript':path.extname(file)==='.json'?'application/json':'model/gltf-binary',body:fs.readFileSync(file)});return route.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');await page.evaluate(async()=>{window.inspection=await import('/inspect-25d.mjs');window.models=await import('/models-25d.mjs');await models.ensureModelAssets();});
  const beforeNames=await page.evaluate(()=>Object.keys(models.WEAPON_VISUALS));assert.equal(beforeNames.length,14);assert(!beforeNames.includes('FAL'));await weaponSheet(page,beforeNames,'before-existing-weapons.png');await context.unroute('**/*');
 }
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');await page.evaluate(async()=>{window.inspection=await import('/inspect-25d.mjs');window.models=await import('/models-25d.mjs');window.THREE=await import('/vendor/three.module.js');await models.ensureModelAssets();});
 const names=await page.evaluate(()=>Object.keys(models.WEAPON_VISUALS));assert.equal(names.length,15);assert(names.includes('FAL'));await weaponSheet(page,names,'after-all-weapons.png');pass('All fifteen real inspection assets load, including separate FAL; fourteen-weapon baseline archived');
 await page.evaluate(async()=>{document.getElementById('title').textContent='FAL · full 360° inspection';document.getElementById('sheet').replaceChildren();for(let i=0;i<8;i++){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),label=document.createElement('figcaption');canvas.width=620;canvas.height=380;label.textContent=(i*45)+'°';figure.append(canvas,label);document.getElementById('sheet').append(figure);await inspection.paintInspection(canvas,{kind:'weapon',weapon:'FAL',rotation:i*Math.PI/4});}});
 await page.locator('body').screenshot({path:path.join(out,'fal-360.png')});pass('FAL real inspection renderer covers every 45-degree view');
 await page.evaluate(()=>{document.getElementById('sheet').replaceChildren();const canvas=document.createElement('canvas');canvas.id='turntable';canvas.style.width='900px';canvas.style.height='430px';document.getElementById('sheet').append(canvas);window.falTurntable=inspection.mountCardPreview(canvas,{kind:'weapon',weapon:'FAL',motion:'weapon-turntable'});document.getElementById('title').textContent='FAL · real-time turntable';});
 await page.waitForFunction(()=>document.getElementById('turntable').dataset.previewReady==='true');
 const angles=[await page.evaluate(()=>falTurntable.state())];
 for(let i=0;i<8;i++){await page.waitForTimeout(3000);angles.push(await page.evaluate(()=>falTurntable.state()));if([1,3,7].includes(i))await page.locator('body').screenshot({path:path.join(out,'fal-turntable-'+(i+1)*3+'s.png')});}
 assert(angles.at(-1).motionSeconds-angles[0].motionSeconds>=24);assert(angles.some(value=>value.rotation>2.3)&&angles.some(value=>value.rotation< -2.3));
 await page.evaluate(()=>falTurntable.dispose());pass('Existing FAL turntable completes a genuine 24-second runtime 360-degree loop');
 const capture=await page.evaluate(async()=>{
  document.getElementById('sheet').replaceChildren();document.getElementById('runtime').style.display='';
  const THREE=window.THREE,renderer=new THREE.WebGLRenderer({canvas:document.getElementById('runtime'),antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,920,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#ececdf');scene.add(new THREE.HemisphereLight(0xeef0df,0x43553c,2.3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(80,180,120);scene.add(light);
  const camera=new THREE.OrthographicCamera(-105,105,76,-76,.1,800);camera.position.set(125,95,170);camera.lookAt(10,33,0);
  const actor=models.buildOperator(1,3);models.setOperatorWeapon(actor,'FAL');scene.add(actor.group);const results=[];
  const modes=['idle','walk','sprint','ADS','fire','reload-out','reload-hidden','reload-in','bolt-charge','dash','hit','death'];
  for(let i=0;i<modes.length;i++){
   const mode=modes[i],reloads={'reload-out':.28,'reload-hidden':.44,'reload-in':.70,'bolt-charge':.91},reload=reloads[mode];
   actor.state.initialized=false;
   for(let j=0;j<36;j++)models.animateOperator(actor,{x:0,y:0,angle:0,weapon:'FAL',vx:['walk','sprint'].includes(mode)?160:0,vy:0,sprinting:mode==='sprint',adsBlend:mode==='ADS'?1:0,shotId:mode==='fire'?j:0,shotAge:mode==='fire'?.06:99,recoil:mode==='fire'?.75:0,muzzle:mode==='fire',reloading:reload!==undefined,reloadProgress:reload??0,dashing:mode==='dash',hit:mode==='hit'?1:0,dead:mode==='death'},i*1000+j*16,1/60);
   actor.group.visible=true;renderer.render(scene,camera);const figure=document.createElement('figure'),canvas=document.createElement('canvas'),label=document.createElement('figcaption');canvas.width=640;canvas.height=460;canvas.getContext('2d').drawImage(renderer.domElement,0,0,640,460);label.textContent=mode;figure.append(canvas,label);document.getElementById('sheet').append(figure);
   results.push({mode,mag:actor.gun.userData.moving.mag.position.toArray(),magVisible:actor.gun.userData.moving.mag.visible,bolt:actor.gun.userData.moving.bolt.position.toArray(),muzzle:actor.muzzle.visible,hands:actor.arms.every(arm=>arm.glove.position.distanceTo(arm.end)<1e-6)});
  }
  document.getElementById('runtime').style.display='none';document.getElementById('title').textContent='FAL · runtime poses';models.disposeModel(actor.group);renderer.dispose();return results;
 });
 assert(capture.every(item=>item.hands));assert(capture.find(item=>item.mode==='fire').muzzle);assert(!capture.find(item=>item.mode==='reload-hidden').magVisible);await page.locator('body').screenshot({path:path.join(out,'fal-runtime-poses.png')});pass('Actual rig renders idle/movement/sprint/ADS/fire/reload phases/bolt handling/dash/hit/death with attached hands');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'fal-browser-results.json'),JSON.stringify({ok:true,names,checks,angles,capture,errors},null,2)+'\n');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
