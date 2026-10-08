import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {buildEnvironment} from '../environment-25d.mjs';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';
import * as THREE from '../vendor/three.module.js';
const require=createRequire(import.meta.url),{engine}=require('./simulate.cjs');
globalThis.document={createElement(){return {width:512,height:512,getContext(){return new Proxy({},{get:(object,key)=>object[key]||(()=>{}),set:(object,key,value)=>(object[key]=value,true)});}};}};
const e=engine(),snapshot=e.dev.renderSnapshot(),before=JSON.stringify(e.context.SAR.getUniverse()),geometryBefore=JSON.stringify(snapshot.geometry),scene=new THREE.Scene();
const env=buildEnvironment(scene,snapshot),checks=[];
function pass(name){checks.push({name,status:'PASS'});console.log('PASS',name);}
function assertFixedMatrices(root){
  let count=0;
  root.traverse(node=>{
    assert.equal(node.matrixAutoUpdate,false);assert.equal(node.matrixWorldAutoUpdate,false);
    const local=new THREE.Matrix4().compose(node.position,node.quaternion,node.scale),world=node.parent?new THREE.Matrix4().multiplyMatrices(node.parent.matrixWorld,local):local;
    for(let i=0;i<16;i++){assert.ok(Math.abs(node.matrix.elements[i]-local.elements[i])<1e-8,'stale local placement');assert.ok(Math.abs(node.matrixWorld.elements[i]-world.elements[i])<1e-8,'stale parent/world placement');}
    count++;
  });return count;
}
const initialFixedNodes=assertFixedMatrices(env.root),initialMatrices=new Map();env.root.traverse(node=>initialMatrices.set(node,node.matrixWorld.clone()));
assert.equal(env.houses.length,snapshot.geometry.floors.length);assert.equal(env.houses.length,12);
assert.ok(env.houses.every(h=>h.roof.children.length===2&&h.wallRoot.children.length<=3));
let meshes=0,vertices=0;env.root.updateMatrixWorld(true);env.root.traverse(m=>{if(!m.isMesh)return;meshes++;vertices+=m.geometry.attributes.position.count;assert.ok([...m.matrixWorld.elements].every(Number.isFinite));assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));assert.ok(m.geometry.boundingSphere?.radius>=0||!m.geometry.boundingSphere);});
assert.ok(meshes<1185,'Detailed environment must stay below the previous 1,185-mesh draw budget');
assert.ok(vertices<330000,'Environment detail exceeds the measured static geometry budget');
pass('12 houses have dimensional pitched roofs and batched wall/window materials; geometry and transforms are finite');
const vacant={...snapshot,actors:[]};for(let i=0;i<100;i++)env.update(vacant,1/60);
for(const h of env.houses){assert.ok(h.opacity>.999);assert.ok(h.roof.visible);const center={x:h.floor.x+h.floor.w/2,y:h.floor.y+h.floor.h/2,dead:false};
  for(let i=0;i<80;i++)env.update({...snapshot,actors:[center]},1/60);
  assert.ok(h.opacity<.001);assert.equal(h.roof.visible,false);assert.ok(h.fadeMaterials.every(m=>m.opacity<.2&&!m.depthWrite));
  for(let i=0;i<100;i++)env.update(vacant,1/60);assert.ok(h.roof.visible);assert.ok(h.roofMats.every(m=>m.opacity>.999&&m.depthWrite));
}
pass('Every building cuts away roofs and upper walls for occupants and restores them after departure');
const tree=env.trees[0];for(let i=0;i<80;i++)env.update({...snapshot,actors:[{x:tree.x,y:tree.z+30,dead:false}]},1/60);assert.ok(tree.materials.every(m=>m.opacity<.24&&!m.depthWrite));
pass('Overlapping foliage fades to keep actors readable');
const camera=new THREE.OrthographicCamera(-800,800,500,-500,1,9000);
for(const [x,z,span] of [[500,500,950],[2400,1800,1800],[snapshot.world.w/2,snapshot.world.h/2,snapshot.world.w+260]]){
  camera.position.set(x,1500,z+850);camera.lookAt(x,0,z);camera.left=-span/2;camera.right=span/2;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);assertFixedMatrices(env.root);
  for(const [node,matrix] of initialMatrices)assert.ok(node.matrixWorld.equals(matrix),'camera/cutaway changed fixed world placement');
}
assert.ok(env.trees[0].materials.every(m=>m.opacity<.24));
pass('Frozen map matrices preserve exact placement through follow/tactical camera changes and animated cutaways');
// Exercise the actual asynchronously loaded GLB instance path, not a replacement asset stub.
const originalFetch=globalThis.fetch,originalProgressEvent=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return originalFetch(request,options);const bytes=await readFile(url);return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
let library;try{library=await loadAssetLibrary();}finally{globalThis.fetch=originalFetch;globalThis.ProgressEvent=originalProgressEvent;}
const installed=env.installAssets(library);assert.equal(installed,env.assetSlots.length);assert.ok(installed>40);
assertFixedMatrices(env.root);let instanceMeshes=0;
env.root.traverse(node=>{if(!node.isInstancedMesh)return;instanceMeshes++;assert.ok(node.boundingBox&&!node.boundingBox.isEmpty());assert.ok(Number.isFinite(node.boundingSphere.radius)&&node.boundingSphere.radius>0);const matrix=new THREE.Matrix4();for(let i=0;i<node.count;i++){node.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}});
assert.ok(instanceMeshes>0);const installedBounds=new THREE.Box3().setFromObject(env.root);
scene.updateMatrixWorld(true);assertFixedMatrices(env.root);assert.ok(new THREE.Box3().setFromObject(env.root).equals(installedBounds),'installed bounds drifted');
pass('Shipped GLB instances resolve parent/world matrices before freezing; instance bounds remain finite and stable');
assert.equal(JSON.stringify(e.context.SAR.getUniverse()),before);assert.equal(JSON.stringify(snapshot.geometry),geometryBefore);
pass('Presentation adds no collision, pathing, telemetry or career mutations');
assert.ok(env.assetSlots.length>40);for(const slot of env.assetSlots)assert.ok(Number.isFinite(slot.x)&&Number.isFinite(slot.z));
pass('Blender placements cover existing crates, vehicles, benches and utilities with finite transforms');
const result={status:'PASS',checks,meshes,vertices,initialFixedNodes,installed,instanceMeshes,stats:env.stats};writeFileSync(new URL('./environment-25d-results.json',import.meta.url),JSON.stringify(result,null,2));
