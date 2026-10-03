import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import * as THREE from '../vendor/three.module.js';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';
const require=createRequire(import.meta.url),{ranks}=require('../progression.js');
const manifestURL=new URL('../assets/25d/ranks/manifest.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(manifestURL,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.models.length,ranks.length);assert.equal(ranks.length,26);
assert.equal(manifest.upAxis,'Y');assert.equal(manifest.frontAxis,'+Z');
assert.match(manifest.generator,/Blender 5\.2\.2 LTS/);
assert.match(manifest.rankSource,/progression\.js/);
const glb=await fs.readFile(new URL('blue-circuit-ranks.glb',manifestURL));
const info=manifest.files['blue-circuit-ranks.glb'];
assert.equal(sha(glb),info.sha256);assert.equal(glb.length,info.bytes);
assert(glb.length<1_500_000,'Rank library must remain compact');
const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'));
assert.equal(gltf.materials.length,4);assert(!gltf.images?.length);
assert(!gltf.extensionsRequired?.some(value=>/draco|meshopt|basisu/i.test(value)));
const fetchOriginal=globalThis.fetch,progressOriginal=globalThis.ProgressEvent;
const fetched=[];
globalThis.ProgressEvent=class extends Event {constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{
  const url=new URL(typeof request==='string'?request:request.url??request.href);
  if(url.protocol!=='file:')return fetchOriginal(request,options);
  fetched.push(url.pathname);return new Response(await fs.readFile(url));
};
let library;
try {
  const first=loadAssetLibrary(manifestURL),second=loadAssetLibrary(manifestURL);
  assert.equal(first,second,'Cards share a single rank load');library=await first;
}finally{globalThis.fetch=fetchOriginal;globalThis.ProgressEvent=progressOriginal;}
assert.equal(fetched.filter(value=>value.endsWith('.glb')).length,1);
assert(!fetched.some(value=>/brightfield|live-circuit-details/.test(value)),'Ranks load independently of gameplay assets');
let triangles=0,meshes=0,thumbBytes=0;
const signatures=new Set(),thumbHashes=new Set();
for(const [index,rank]of ranks.entries()){
  const entry=manifest.models[index];
  assert.equal(entry.rankIndex,index);assert.equal(entry.rankName,rank.name);assert.equal(entry.threshold,rank.threshold);
  assert.equal(entry.name,'rank-badge-'+rank.name.toLowerCase().replaceAll(' ','-'));
  const expected=rank.name.match(/ (I{1,3})$/);assert.equal(entry.division,expected?expected[1].length:0);
  const model=library.cloneModel(entry.name);assert(model);model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  for(const axis of ['x','y','z'])assert(Math.abs(size[axis]-entry.dimensions[axis])<.03,entry.name+' dimensions');
  assert(size.z>3&&size.z<10,'Crest has physical depth without oversized protrusions');
  let count=0,signature='';
  model.traverse(node=>{if(!node.isMesh)return;count++;meshes++;
    assert(node.geometry.userData.sarShared&&node.material.userData.sarShared);
    assert(node.geometry.attributes.normal);for(const value of node.geometry.attributes.position.array)assert(Number.isFinite(value));
    signature+=sha(Buffer.from(node.geometry.attributes.position.array.buffer));
    triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
  });
  assert(count<=4,entry.name+' is batched per material');assert(!signatures.has(signature),entry.name+' must have distinct modeled geometry');signatures.add(signature);
  const other=library.cloneModel(entry.name),rest=other.quaternion.clone();model.rotation.y=Math.PI*.6;
  assert.equal(other.quaternion.angleTo(rest),0,'Preview transforms are isolated');
  const png=await fs.readFile(new URL(entry.thumbnail,manifestURL));thumbBytes+=png.length;
  assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),192);assert.equal(png.readUInt32BE(20),192);
  assert.equal(sha(png),entry.thumbnailSha256);thumbHashes.add(sha(png));
}
assert.equal(thumbHashes.size,26,'Each actual-model thumbnail is distinct');
const source=await fs.stat(new URL('blue-circuit-ranks.blend',manifestURL));assert(source.size>10_000,'Editable source is retained');
console.log(JSON.stringify({status:'PASS',groups:4,ranks:ranks.length,meshes,triangles,glbBytes:glb.length,thumbnailBytes:thumbBytes,
  checks:['exact canonical registry and Roman divisions','real GLB geometry, dimensions, hashes and budgets','lazy memoized shared resources with independent transforms','26 same-asset thumbnails and editable Blender source']},null,2));
