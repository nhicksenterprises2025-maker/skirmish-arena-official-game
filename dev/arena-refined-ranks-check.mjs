import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {zstdDecompressSync} from 'node:zlib';
import * as THREE from '../vendor/three.module.js';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';

const require=createRequire(import.meta.url),{ranks}=require('../progression.js');
const manifestURL=new URL('../assets/25d/ranks/manifest.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(manifestURL,'utf8'));
const report=JSON.parse(await fs.readFile(new URL('build-report.json',manifestURL),'utf8'));
const originalFetch=globalThis.fetch,originalProgressEvent=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{
  const url=new URL(typeof request==='string'?request:request.url??request.href);
  return url.protocol==='file:'?new Response(await fs.readFile(url)):originalFetch(request,options);
};
let library;
try{library=await loadAssetLibrary(manifestURL);}
finally{globalThis.fetch=originalFetch;globalThis.ProgressEvent=originalProgressEvent;}

assert.equal(report.rankCount,26);assert.equal(manifest.models.length,ranks.length);
assert.equal(report.blender,'5.2.2 LTS');
const source=await fs.readFile(new URL('blue-circuit-ranks.blend',manifestURL));
const blend=source.readUInt32LE(0)===0xfd2fb528?zstdDecompressSync(source):source;
assert.equal(blend.toString('ascii',0,7),'BLENDER','Editable source remains a genuine Blender file');
const materials=new Set(),depths=[];let formedFaces=0,triangles=0;
for(const [index,rank]of ranks.entries()){
  const entry=manifest.models[index];
  assert.equal(entry.rankName,rank.name);assert.equal(entry.rankIndex,index);assert.equal(entry.threshold,rank.threshold);
  assert.match(entry.construction,/formed enamel/);
  const model=library.cloneModel(entry.name),control=library.cloneModel(entry.name);
  model.updateMatrixWorld(true);control.updateMatrixWorld(true);
  const otherMatrices=[];control.traverse(node=>otherMatrices.push([...node.matrixWorld.elements]));
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert(size.z>=7.85&&size.z<10,'Physical relief must remain compact: '+entry.name);depths.push(size.z);
  let draws=0,formed=false;
  model.traverse(node=>{
    if(!node.isMesh)return;draws++;materials.add(node.material);
    assert(node.geometry.userData.sarShared&&node.material.userData.sarShared);
    const positions=node.geometry.attributes.position,normals=node.geometry.attributes.normal;
    triangles+=(node.geometry.index?.count??positions.count)/3;
    assert(normals,'Export includes real surface normals');
    for(let i=0;i<positions.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      const normal=new THREE.Vector3().fromBufferAttribute(normals,i);
      assert(p.toArray().every(Number.isFinite));assert(Math.abs(normal.length()-1)<.002);
      // Every shield's enamel fan has an actual raised center at (0,4.5,3.45),
      // not a painted depth effect or a different image at each viewing angle.
      if(node.material.name==='rank_navy'&&Math.abs(p.x)<.05&&Math.abs(p.y-4.5)<.05&&p.z>3.4)formed=true;
    }
  });
  assert(formed,'Formed enamel face absent from actual exported geometry: '+entry.name);formedFaces++;
  assert(draws<=4,'No per-detail draw proliferation');
  for(let step=0;step<32;step++){
    model.rotation.y=step*Math.PI*2/32;model.updateMatrixWorld(true);control.updateMatrixWorld(true);
    let i=0;control.traverse(node=>assert.deepEqual([...node.matrixWorld.elements],otherMatrices[i++],'Inspection rotation must not mutate another instance'));
    const turned=new THREE.Box3().setFromObject(model);
    assert(!turned.isEmpty()&&turned.min.toArray().concat(turned.max.toArray()).every(Number.isFinite));
  }
}
assert.equal(materials.size,4,'All ranks reuse four shared PBR finishes');
assert.equal(triangles,report.triangles);assert(report.glbBytes<1_500_000);
console.log(JSON.stringify({status:'PASS',groups:5,ranks:ranks.length,formedFaces,rotations:ranks.length*32,
  minDepth:Math.min(...depths),maxDepth:Math.max(...depths),triangles,sharedMaterials:materials.size,
  checks:['canonical ranked ladder and thresholds','genuine editable Blender source and exported formed shield faces',
    'compact physical relief with valid normals','832 rotations preserve independent preview transforms',
    'four shared finishes, unchanged maximum four draws and compact export']},null,2));
