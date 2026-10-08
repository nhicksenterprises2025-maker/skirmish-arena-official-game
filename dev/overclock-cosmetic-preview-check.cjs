'use strict';
// Isolated real WebGL/export verification; no account, wallet or world mutation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'overclock-cosmetics'),errors=[];
let browser;
const html=`<!doctype html><meta charset="utf-8"><style>:root{--sky-panel-light:#DFEBF5}body{margin:16px;background:#edf3f8;font:14px Arial;color:#203644}.board{display:grid;grid-template-columns:repeat(6,200px);gap:8px}figure{margin:0;background:#dfebf5}canvas{display:block;width:200px;height:256px}figcaption{padding:9px;height:37px;font-size:12px}#probe{width:192px;height:256px}#controls{display:flex;gap:12px}.card-model-viewer{width:200px}</style><div id="controls"><div class="card-model-viewer"><canvas id="first"></canvas><button data-preview-action="left">Left</button><button data-preview-action="reset">Reset</button></div><div class="card-model-viewer"><canvas id="second"></canvas></div></div><canvas id="probe" width="192" height="256"></canvas><div id="board" class="board"></div>`;
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(name==='/fixture'){res.setHeader('content-type','text/html');return res.end(html);}const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1280,height:950}});page.on('pageerror',error=>errors.push(error.message));
 const requests=[];page.on('request',req=>requests.push(req.url()));await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 await page.evaluate(async()=>{window.preview=await import('/inspect-25d.mjs');window.models=await import('/models-25d.mjs');window.catalog=await(await fetch('/assets/25d/cosmetics/manifest.json')).json();window.operators=['urban-assault','woodland-scout','desert-runner','blue-strike','crimson-guard','steel-recon','ranger-elite','night-ops'];window.options=(id,styleId='main')=>({kind:'operator',skin:operators.indexOf(catalog.cosmetics[id].operatorId),unarmed:true,lobbyIdle:true,cosmetic:{id,operatorId:catalog.cosmetics[id].operatorId,styleId}});first=preview.mountCardPreview(document.querySelector('#first'),options('blue-strike.black-ice'));second=preview.mountCardPreview(document.querySelector('#second'),options('urban-assault.helmet-off'));});
 await page.waitForFunction(()=>document.querySelector('#first').dataset.previewReady==='true'&&document.querySelector('#second').dataset.previewReady==='true');
 assert.equal(new Set(requests.filter(url=>url.includes('/cosmetics/')&&url.endsWith('.glb'))).size,2,'Catalog warmed unowned wardrobe');
 await page.locator('[data-preview-action="left"]').click();assert.notEqual((await page.evaluate(()=>first.state())).rotation,0);assert.equal((await page.evaluate(()=>second.state())).rotation,0);await page.locator('[data-preview-action="reset"]').click();
 console.log('PASS Lazy per-item loads, independent rotation/reset, front-facing unarmed signatures');
 const check=await page.evaluate(async()=>{
  const canvas=document.querySelector('#probe'),failures=[];let styles=0,frames=0;
  for(const [id,item]of Object.entries(catalog.cosmetics))for(const styleId of Object.keys(item.styles)){
   styles++;
   for(let a=0;a<24;a++){
    await preview.paintInspection(canvas,{...options(id,styleId),rotation:a*Math.PI/12});frames++;
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,w=canvas.width,h=canvas.height,bg=[data[0],data[1],data[2]];let edge=false,content=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,changed=Math.abs(data[i]-bg[0])+Math.abs(data[i+1]-bg[1])+Math.abs(data[i+2]-bg[2])>24;if(changed)content++;if(changed&&(x<2||y<2||x>=w-2||y>=h-2))edge=true;}
    if(edge||content<500)failures.push({id,styleId,a,edge,content});
   }
  }
  return {styles,frames,failures,cache:models.cosmeticDiagnostics(),preview:preview.previewDiagnostics()};
 });assert.deepEqual(check.failures,[]);assert.equal(check.styles,38);console.log('PASS All 38 actual exported appearances: 912 rendered orientations through 360 degrees');
 for(const tier of ['standard','collection']){
  await page.evaluate(async tier=>{const board=document.querySelector('#board');board.replaceChildren();for(const[id,item]of Object.entries(catalog.cosmetics)){if((item.priceAC===500)!==(tier==='standard'))continue;for(const styleId of Object.keys(item.styles)){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=200;canvas.height=256;caption.textContent=id+' / '+styleId;figure.append(canvas,caption);board.append(figure);await preview.paintInspection(canvas,options(id,styleId));}}},tier);
  await page.locator('#board').screenshot({path:path.join(out,tier+'-appearance-board.png')});
 }
 const gameCamera=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),gl=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});gl.setSize(200,150,false);gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.08;
  const scene=new T.Scene();scene.background=new T.Color('#97ad83');scene.add(new T.HemisphereLight(0xe9f2ec,0x65775f,2.1));const sun=new T.DirectionalLight(0xffefda,2.35);sun.position.set(-60,200,150);scene.add(sun);
  const camera=new T.OrthographicCamera(-95,95,71.25,-71.25,1,9000);camera.position.set(0,1500,850);camera.lookAt(0,0,0);
  const board=document.querySelector('#board');board.replaceChildren();let count=0,maxCalls=0,maxTriangles=0;
  for(const [id,item]of Object.entries(catalog.cosmetics))for(const styleId of Object.keys(item.styles)){
   const selection={id,operatorId:item.operatorId,styleId};await models.ensureCosmeticAssets(selection);const entity=models.buildOperator(0,operators.indexOf(item.operatorId),null,selection);
   models.animateOperator(entity,{id:1,x:-20,y:0,angle:0,weapon:item.operatorId==='steel-recon'?'SR-Aug':'AR-15',vx:0,vy:0},1000,1/60);scene.add(entity.group);gl.render(scene,camera);
   maxCalls=Math.max(maxCalls,gl.info.render.calls);maxTriangles=Math.max(maxTriangles,gl.info.render.triangles);
   const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=200;canvas.height=150;canvas.style.height='150px';canvas.getContext('2d').drawImage(gl.domElement,0,0);caption.textContent=id+' / '+styleId;figure.append(canvas,caption);board.append(figure);scene.remove(entity.group);models.disposeModel(entity.group);count++;
  }
  gl.dispose();gl.forceContextLoss();return{count,maxCalls,maxTriangles,camera:'Same 1500:850 orthographic game angle; normal actor scale; no simulation'};
 });assert.equal(gameCamera.count,38);await page.locator('#board').screenshot({path:path.join(out,'game-camera-appearance-board.png')});console.log('PASS All 38 exported appearances at the normal orthographic game-camera angle and scale');
 const idle=await page.evaluate(()=>{preview.clearCardPreviews();return preview.previewDiagnostics().renders;});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>preview.previewDiagnostics().renders),idle);assert.deepEqual(errors,[]);
 const report={ok:true,...check,gameCamera,errors};fs.writeFileSync(path.join(out,'cosmetic-preview-check.json'),JSON.stringify(report,null,2));console.log('PASS Closed previews release references and schedule no idle rendering');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
