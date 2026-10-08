import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

// Real shipped Three/model/GLB construction must not consume the random stream
// used by gameplay. No WebGL or simulation substitute is needed for allocations.
const require=createRequire(import.meta.url),{engine}=require('./simulate.cjs');
const game=engine(),snapshot=game.dev.renderSnapshot(),saved=JSON.stringify(game.context.SAR.getUniverse());
const originalRandom=Math.random,originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalProgressEvent=globalThis.ProgressEvent;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
assert.equal(typeof globalThis.crypto?.getRandomValues,'function','Supported runtime must provide Web Crypto');
// Initialize Node's HTTP response adapter before guarding application randomness.
new Response(new Uint8Array());
globalThis.document={createElement(){return {width:512,height:512,getContext(){return new Proxy({},{get:(object,key)=>object[key]||(()=>{}),set:(object,key,value)=>(object[key]=value,true)});}};}};
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return originalFetch(request,options);const bytes=await readFile(url);return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
let randomCalls=0;
Math.random=()=>{randomCalls++;throw Error('Presentation advanced the gameplay random stream');};
try{
  const THREE=await import('../vendor/three.module.js');
  const {buildWeapon,buildOperator,setOperatorWeapon,animateOperator,disposeModel,ensureModelAssets,WEAPON_VISUALS}=await import('../models-25d.mjs');
  const {buildEnvironment}=await import('../environment-25d.mjs');
  const {loadAssetLibrary}=await import('../asset-loader-25d.mjs');
  // Covers fresh module initialization as well as every subsequent allocation.
  const uuids=new Set();
  function remember(id){assert.match(id,uuidPattern);assert.ok(!uuids.has(id),'Duplicate presentation UUID');uuids.add(id);}
  for(let i=0;i<10000;i++)remember(THREE.MathUtils.generateUUID());
  const geometry=new THREE.BoxGeometry(1,2,3),material=new THREE.MeshStandardMaterial({color:0x456789});remember(geometry.uuid);remember(material.uuid);
  const pool=new THREE.Group();remember(pool.uuid);
  for(let i=0;i<180;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i,2,3);pool.add(mesh);remember(mesh.uuid);}
  pool.updateMatrixWorld(true);assert.equal(pool.children[179].matrixWorld.elements[12],179);
  console.log('PASS valid unique UUIDs and real pooled Mesh/Material/BufferGeometry allocations leave Math.random untouched');

  const library=await ensureModelAssets(),rankLibrary=await loadAssetLibrary(new URL('../assets/25d/ranks/manifest.json',import.meta.url));
  let assetCount=0;
  for(const assets of [library,rankLibrary])for(const name of assets.names){
    const object=assets.cloneModel(name);object.updateMatrixWorld(true);remember(object.uuid);
    const bounds=new THREE.Box3().setFromObject(object);assert.ok(!bounds.isEmpty());assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));assetCount++;
  }
  console.log('PASS all '+assetCount+' shipped scenery, detail, Phone and rank models load/clone without gameplay RNG');

  function transforms(object){object.updateMatrixWorld(true);const result=[];object.traverse(node=>{assert.ok(node.matrixWorld.elements.every(Number.isFinite));if(node.isMesh)assert.ok(node.geometry.attributes.position.count>0);result.push(node.matrixWorld.elements.slice());});return result;}
  for(const name of Object.keys(WEAPON_VISUALS)){
    const first=buildWeapon(name),second=buildWeapon(name);assert.deepEqual(transforms(first),transforms(second));
    assert.ok(first.userData.blenderDetails);assert.deepEqual(first.userData.muzzlePosition,second.userData.muzzlePosition);assert.deepEqual(first.userData.grips,second.userData.grips);
    remember(first.uuid);remember(second.uuid);disposeModel(first);disposeModel(second);
  }
  for(let skin=0;skin<8;skin++){
    const first=buildOperator(0,skin),second=buildOperator(0,skin),weapon=Object.keys(WEAPON_VISUALS)[skin];
    for(const entity of [first,second]){setOperatorWeapon(entity,weapon);for(let i=0;i<24;i++)animateOperator(entity,{x:100+i*2,y:120,angle:.2,weapon,vx:120,vy:0,shotId:1+(i>8?1:0),shotAge:i/60,adsBlend:i/24,reloading:i>12,reloadProgress:i>12?(i-12)/12:0},1000+i*1000/60,1/60);}
    assert.deepEqual(transforms(first.group),transforms(second.group));assert.deepEqual(first.colors,second.colors);remember(first.group.uuid);remember(second.group.uuid);
    disposeModel(first.group);disposeModel(second.group);
  }
  console.log('PASS all 14 weapons and eight operator variants preserve identical poses, grips and muzzle anchors across independent allocations');

  const scene=new THREE.Scene(),environment=buildEnvironment(scene,snapshot);assert.equal(environment.installAssets(library),environment.assetSlots.length);
  for(let i=0;i<24;i++)environment.update(snapshot,1/60);
  transforms(environment.root);assert.equal(JSON.stringify(game.context.SAR.getUniverse()),saved);assert.equal(randomCalls,0);
  console.log('PASS actual map textures, cutaways and installed GLB groups use no gameplay RNG or simulation/save mutations');
}finally{
  Math.random=originalRandom;globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.ProgressEvent=originalProgressEvent;
}
