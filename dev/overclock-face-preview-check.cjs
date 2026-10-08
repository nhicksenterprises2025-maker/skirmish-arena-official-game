'use strict';
// Isolated actual-model face comparisons. Uses no account, inventory or saves.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'overclock-faces'));
const phase=process.argv.includes('--before')?'before':'after',errors=[];
const html='<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#edf3f8;color:#203644;font:14px Arial}h1{font-size:20px}.board{display:grid;grid-template-columns:repeat(8,160px);gap:6px}figure{margin:0;background:#dfebf5}canvas{display:block;width:160px;height:190px}figcaption{padding:8px;font-size:11px;min-height:30px}</style><h1>Operator faces / shared runtime models</h1><div id="board" class="board"></div>';
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(name==='/fixture'){res.setHeader('content-type','text/html');return res.end(html);}let file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(phase==='before'&&(name==='/models-25d.mjs'||name.startsWith('/assets/25d/cosmetics/'))){const original=path.join(out,'before-assets',path.basename(name));if(fs.existsSync(original))file=original;}fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
let browser;
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1360,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 const result=await page.evaluate(async()=>{
  const T=await import('/vendor/three.module.js'),models=await import('/models-25d.mjs');await models.ensureModelAssets();
  const operators=['urban-assault','woodland-scout','desert-runner','blue-strike','crimson-guard','steel-recon','ranger-elite','night-ops'],catalog=await(await fetch('/assets/25d/cosmetics/manifest.json')).json();
  const gl=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});gl.setSize(320,380,false);gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.08;
  const scene=new T.Scene();scene.background=new T.Color('#DFEBF5');scene.add(new T.HemisphereLight(0xf0f4e9,0x384b3d,1.55));
  for(const [color,power,at]of[[0xfff1d6,2.6,[80,150,140]],[0xc5dfe0,1.8,[-130,65,-90]],[0xe6efd7,.65,[-100,5,160]]]){const light=new T.DirectionalLight(color,power);light.position.set(...at);scene.add(light);}
  const camera=new T.OrthographicCamera(-18,18,21.375,-21.375,.1,1000);camera.position.set(0,59,200);camera.lookAt(0,55,0);
  const board=document.querySelector('#board');let rendered=0,maxCalls=0,maxTriangles=0;const palettes=[];
  for(const base of [false,true])for(const angle of [0,.6,Math.PI/2])for(const [skin,operatorId]of operators.entries()){
   const selection=base?null:{id:operatorId+'.helmet-off',operatorId,styleId:'main'};if(selection)await models.ensureCosmeticAssets(selection);
   const palette=catalog.cosmetics[operatorId+'.helmet-off'].styles.main.palette,entity=models.buildOperator(0,skin,palette,selection);models.poseUnarmedShowcase(entity);entity.group.rotation.y+=angle;
   scene.add(entity.group);gl.render(scene,camera);maxCalls=Math.max(maxCalls,gl.info.render.calls);maxTriangles=Math.max(maxTriangles,gl.info.render.triangles);
   const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=320;canvas.height=380;canvas.getContext('2d').drawImage(gl.domElement,0,0);caption.textContent=operatorId+' / '+(base?'base / ':'')+(angle===0?'front':angle<1?'three-quarter':'profile');figure.append(canvas,caption);board.append(figure);
   if(angle===0)palettes.push({operatorId,skin:entity.colors.skin});rendered++;scene.remove(entity.group);models.disposeModel(entity.group);
  }
  gl.dispose();gl.forceContextLoss();return{rendered,maxCalls,maxTriangles,palettes};
 });
 assert.equal(result.rendered,48);assert.deepEqual(errors,[]);
 await page.locator('#board').screenshot({path:path.join(out,'operator-faces-'+phase+'.png')});
 await page.evaluate(async()=>{
  const preview=await import('/inspect-25d.mjs'),operators=['urban-assault','woodland-scout','desert-runner','blue-strike','crimson-guard','steel-recon','ranger-elite','night-ops'],catalog=await(await fetch('/assets/25d/cosmetics/manifest.json')).json();
  const board=document.querySelector('#board');board.replaceChildren();
  for(const base of [true,false])for(const [skin,operatorId]of operators.entries()){
   const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=320;canvas.height=380;caption.textContent=operatorId+' / '+(base?'base':'helmet off');figure.append(canvas,caption);board.append(figure);
   await preview.paintInspection(canvas,{kind:'operator',skin,palette:catalog.cosmetics[operatorId+'.helmet-off'].styles.main.palette,unarmed:true,cosmetic:base?null:{id:operatorId+'.helmet-off',operatorId,styleId:'main'}});
  }
 });
 await page.locator('#board').screenshot({path:path.join(out,'operator-preview-scale-'+phase+'.png')});
 fs.writeFileSync(path.join(out,'operator-faces-'+phase+'.json'),JSON.stringify({ok:true,...result,errors},null,2));
 console.log('PASS '+phase+': 48 actual shared-model closeups plus 16 normal card-size previews; eight identities/front/three-quarter/profile; no browser errors');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
