'use strict';
// Actual shared model + exported attachments, isolated from owner accounts/saves.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'arena-refined-magazine'));
const phase=process.argv.includes('--before')?'before':'after',errors=[];
const html='<!doctype html><meta charset="utf-8"><style>body{margin:16px;background:#ecece2;color:#28352f;font:14px Arial}h1{font-size:20px}.board{display:grid;grid-template-columns:repeat(4,300px);gap:8px}figure{margin:0;background:#e2e5dc}canvas{display:block;width:300px;height:280px}figcaption{padding:8px;font-size:12px}#poses canvas{height:360px}</style><h1>AK47 — shared runtime magazine</h1><div id="board" class="board"></div><h1>AK47 — unchanged rig and animation</h1><div id="poses" class="board"></div>';
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(name==='/fixture'){res.setHeader('content-type','text/html');return res.end(html);}
  let file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(phase==='before'&&name==='/models-25d.mjs')file=process.env.SAR_AK_BASELINE;
  if(!file)return res.writeHead(404).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
let browser;
(async()=>{try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1268,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  const result=await page.evaluate(async()=>{
    const T=await import('/vendor/three.module.js'),models=await import('/models-25d.mjs');await models.ensureModelAssets();
    const gl=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});gl.setSize(600,560,false);gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.08;
    const scene=new T.Scene();scene.background=new T.Color('#e2e5dc');scene.add(new T.HemisphereLight(0xf0f4e9,0x384b3d,1.55));
    for(const [color,power,at]of[[0xfff1d6,2.6,[80,150,140]],[0xc5dfe0,1.8,[-130,65,-90]],[0xe6efd7,.65,[-100,5,160]]]){const light=new T.DirectionalLight(color,power);light.position.set(...at);scene.add(light);}
    const camera=new T.OrthographicCamera(-18,18,16.8,-16.8,.1,1000),weapon=models.buildWeapon('AK47');scene.add(weapon);
    let closeups=0,orientations=0,maxCalls=0,maxTriangles=0;const samples=[];
    const capture=(parent,label)=>{const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=gl.domElement.width;canvas.height=gl.domElement.height;canvas.getContext('2d').drawImage(gl.domElement,0,0);caption.textContent=label;figure.append(canvas,caption);parent.append(figure);};
    for(let degrees=0;degrees<360;degrees+=5){
      weapon.rotation.y=degrees*Math.PI/180;weapon.updateMatrixWorld(true);
      const center=new T.Box3().setFromObject(weapon.userData.moving.mag).getCenter(new T.Vector3());
      camera.position.copy(center).add(new T.Vector3(0,4,180));camera.lookAt(center);gl.render(scene,camera);
      maxCalls=Math.max(maxCalls,gl.info.render.calls);maxTriangles=Math.max(maxTriangles,gl.info.render.triangles);orientations++;
      const pixels=new Uint8Array(gl.domElement.width*gl.domElement.height*4);gl.getContext().readPixels(0,0,gl.domElement.width,gl.domElement.height,gl.getContext().RGBA,gl.getContext().UNSIGNED_BYTE,pixels);samples.push({degrees,content:pixels.some((n,i)=>i%4!==3&&n<100)});
      if(degrees%45===0){capture(document.querySelector('#board'),degrees+'° / magazine ribs and reinforcement');closeups++;}
    }
    scene.remove(weapon);models.disposeModel(weapon);
    gl.setSize(600,720,false);camera.left=-60;camera.right=60;camera.top=72;camera.bottom=-72;camera.updateProjectionMatrix();camera.position.set(135,80,210);camera.lookAt(18,37,0);
    const poses=[];
    for(const mode of ['idle','walk','ads','fire','reload-.2','reload-.3','reload-.6','reload-.9']){
      const reload=mode.startsWith('reload'),progress=reload?Number(mode.split('-')[1]):0,entity=models.buildOperator(0,5);models.setOperatorWeapon(entity,'AK47');
      const actor={id:1,x:0,y:0,angle:0,vx:mode==='walk'?175:0,vy:0,weapon:'AK47',hp:250,maxHP:250,adsBlend:mode==='ads'?1:0,shotId:2,shotAge:mode==='fire'?.04:99,muzzle:mode==='fire',reloading:reload,reloadProgress:progress};
      models.animateOperator(entity,actor,1400,1/60);entity.group.updateMatrixWorld(true);scene.add(entity.group);gl.render(scene,camera);capture(document.querySelector('#poses'),mode);
      const mag=entity.gun.userData.moving.mag;poses.push({mode,magVisible:mag.visible,detailAttached:mag.getObjectByName('weapon-detail-ak47__mag').parent===mag,finite:mag.matrixWorld.elements.every(Number.isFinite),handConnected:entity.arms.every(arm=>arm.glove.position.distanceTo(arm.end)<1e-6)});
      scene.remove(entity.group);models.disposeModel(entity.group);
    }
    gl.dispose();gl.forceContextLoss();return{closeups,orientations,maxCalls,maxTriangles,samples,poses};
  });
  assert.equal(result.closeups,8);assert.equal(result.orientations,72);assert(result.samples.every(sample=>sample.content));assert(result.poses.every(pose=>pose.detailAttached&&pose.finite&&pose.handConnected));assert.deepEqual(errors,[]);
  await page.locator('#board').screenshot({path:path.join(out,'ak-magazine-'+phase+'.png')});await page.locator('#poses').screenshot({path:path.join(out,'ak-animation-'+phase+'.png')});
  fs.writeFileSync(path.join(out,'ak-runtime-'+phase+'.json'),JSON.stringify({status:'PASS',...result,errors},null,2));
  console.log('PASS '+phase+': 72 actual WebGL orientations, 8 closeups, idle/movement/ADS/fire/four reload states, no page errors; max '+result.maxCalls+' draws / '+result.maxTriangles+' triangles');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
