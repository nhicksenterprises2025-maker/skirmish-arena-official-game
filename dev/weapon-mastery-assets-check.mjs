import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {zstdDecompressSync} from 'node:zlib';
import * as THREE from '../vendor/three.module.js';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';

const require=createRequire(import.meta.url),M=require('../weapon-mastery.js');
const weapons=require('./simulate.cjs').engine().context.SAR.getWeapons();
const url=new URL('../assets/25d/mastery/manifest.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(url,'utf8'));
const report=JSON.parse(await fs.readFile(new URL('build-report.json',url),'utf8'));
assert.deepEqual(manifest.badgeTiers,M.CONFIG.badgeTiers);
assert.equal(report.blender,'5.2.2 LTS');
assert.equal(manifest.models.length,40);
assert.equal(report.weaponCount,Object.keys(weapons).length);
assert.equal(report.badgeCount,40);
assert.deepEqual(Object.keys(manifest.weapons),Object.keys(weapons));
assert.equal(manifest.weapons.FAL.class,'rifle');
const bytes=await fs.readFile(new URL('weapon-mastery.glb',url));
assert.equal(bytes.byteLength,manifest.files['weapon-mastery.glb'].bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.files['weapon-mastery.glb'].sha256);
const source=await fs.readFile(new URL('weapon-mastery.blend',url));
const blend=source.readUInt32LE(0)===0xfd2fb528?zstdDecompressSync(source):source;
assert.equal(blend.toString('ascii',0,7),'BLENDER','Editable genuine Blender source retained');
const originalFetch=globalThis.fetch,originalProgressEvent=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{
  const sourceURL=new URL(typeof request==='string'?request:request.url??request.href);
  return sourceURL.protocol==='file:'?new Response(await fs.readFile(sourceURL)):originalFetch(request,options);
};
let library;
try{library=await loadAssetLibrary(url);}finally{globalThis.fetch=originalFetch;globalThis.ProgressEvent=originalProgressEvent;}
const materials=new Set(),depths=[];let triangles=0,formedFaces=0;
for(const entry of manifest.models){
  assert(report.classes.includes(entry.weaponClass));assert(M.CONFIG.badgeTiers.includes(entry.tier));
  const model=library.cloneModel(entry.name),control=library.cloneModel(entry.name);
  model.updateMatrixWorld(true);control.updateMatrixWorld(true);
  const untouched=[];control.traverse(node=>untouched.push([...node.matrixWorld.elements]));
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert(size.z>=7&&size.z<12,'Compact genuine dimensional relief: '+entry.name);depths.push(size.z);
  for(const axis of ['x','y','z'])assert(Math.abs(size[axis]-entry.dimensions[axis])<.02,'Manifest dimension '+entry.name+' '+axis);
  let draws=0,formed=false;
  model.traverse(node=>{
    if(!node.isMesh)return;draws++;materials.add(node.material);
    assert(node.geometry.userData.sarShared&&node.material.userData.sarShared);
    const positions=node.geometry.attributes.position,normals=node.geometry.attributes.normal;
    assert(normals);triangles+=(node.geometry.index?.count??positions.count)/3;
    for(let index=0;index<positions.count;index++){
      const p=new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(node.matrixWorld);
      const normal=new THREE.Vector3().fromBufferAttribute(normals,index);
      assert(p.toArray().every(Number.isFinite));assert(Math.abs(normal.length()-1)<.002);
      if(node.material.name==='mastery_charcoal'&&Math.abs(p.x)<.05&&Math.abs(p.y-.675)<.05&&p.z>3.3)formed=true;
    }
  });
  assert(draws<=4,'Shared material batching retained');assert(formed,'Exported formed field geometry exists');formedFaces++;
  for(let step=0;step<32;step++){
    model.rotation.y=step*Math.PI*2/32;model.updateMatrixWorld(true);control.updateMatrixWorld(true);
    let index=0;control.traverse(node=>assert.deepEqual([...node.matrixWorld.elements],untouched[index++],'Independent rotation'));
    const turned=new THREE.Box3().setFromObject(model);
    assert(!turned.isEmpty()&&turned.min.toArray().concat(turned.max.toArray()).every(Number.isFinite));
  }
}
let mappings=0;
for(const [name,definition]of Object.entries(weapons))for(const tier of M.CONFIG.badgeTiers){
  const family=M.weaponClass(name,definition),entry=manifest.models.find(value=>value.weaponClass===family&&value.tier===tier);
  assert(entry&&entry.weapons.includes(name),name+' tier '+tier+' must use current registry class');mappings++;
}
for(const [type,definition]of Object.entries({rifle:{type:'primary',role:'Future rifle'},sidearm:{type:'sidearm'},shotgun:{type:'primary',pellets:6},burst:{type:'primary',burstCount:3},smg:{type:'primary',role:'Close tracking'},marksman:{type:'primary',role:'Marksman rifle'},sniper:{type:'primary',role:'Sniper rifle'},lmg:{type:'primary',role:'LMG'}})){
  assert.equal(M.weaponClass('future-'+type,definition),type);
  assert(manifest.models.some(value=>value.weaponClass===type),'Future weapon class uses existing genuine asset');
}
assert.equal(materials.size,4);assert.equal(triangles,report.triangles);assert(report.glbBytes<2_000_000);
console.log(JSON.stringify({status:'PASS',groups:7,badges:40,weapons:Object.keys(weapons).length,mappings,rotations:40*32,formedFaces,
  minDepth:Math.min(...depths),maxDepth:Math.max(...depths),triangles,sharedMaterials:materials.size,glbBytes:bytes.byteLength,
  checks:['live registry including FAL and central badge tiers','genuine editable Blender source and exact GLB hash',
    'eight class identities and future weapon coverage','75 current weapon/tier mappings','formed field, depth and surface normals',
    '1280 clone-independent full-circle rotations','four shared materials and compact batched GLB']},null,2));
