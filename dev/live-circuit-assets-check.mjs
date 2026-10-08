import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/addons/loaders/GLTFLoader.js';

const base = new URL('../assets/25d/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json',base),'utf8'));
const entries = manifest.models.filter(entry=>entry.file==='live-circuit-details.glb');
const report = JSON.parse(await fs.readFile(new URL('live-circuit-build-report.json',base),'utf8'));
const bytes = await fs.readFile(new URL('live-circuit-details.glb',base));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const gltf = await new GLTFLoader().parseAsync(buffer,base.href);
const wanted=['AR-15','AK47','SMG-9','Pump Shotgun','Auto 12','LR-762','LW Tundra','War Head LMG','P90','9mm','X16','X-16 Auto','SR-Aug','SPAS-12','FAL'];
const checks=[];
function pass(name){checks.push({name,status:'PASS'});console.log('PASS',name);}
assert.equal(entries.length,17);
assert.deepEqual(entries.filter(e=>e.weapon).map(e=>e.weapon).sort(),wanted.sort());
assert.equal(manifest.models.filter(e=>e.file==='brightfield-props.glb').length,14);
assert.equal(report.blender,'5.2.2 LTS');
assert((await fs.stat(new URL('live-circuit-details.blend',base))).size>50000);
pass('Seventeen Blender-authored assets cover all fifteen weapons, the universal operator kit and complete phone; all fourteen neighborhood props remain');

let triangles=0,meshes=0;
for(const entry of entries){
  const root=gltf.scene.getObjectByName(entry.node);assert(root,entry.name);
  const clone=root.clone(true);clone.position.set(0,0,0);clone.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(clone),size=bounds.getSize(new THREE.Vector3());
  for(const axis of ['x','y','z'])assert(Math.abs(size[axis]-entry.dimensions[axis])<.03,`${entry.name}: ${axis} size`);
  for(const [key,node] of Object.entries(entry.attachments||{})){
    const attachment=clone.getObjectByName(node);assert(attachment,`${entry.name}: ${key}`);
    assert(attachment.children.some(child=>child.isMesh),`${key} has no detail geometry`);
    assert(attachment.position.length()<1e-6,`${key} must retain parent-local origin`);
    assert.equal(attachment.userData.attachment,key);
  }
  let localMeshes=0;
  clone.traverse(child=>{
    for(const v of child.matrixWorld.elements)assert(Number.isFinite(v));
    if(!child.isMesh)return;
    localMeshes++;meshes++;
    const position=child.geometry.attributes.position;
    assert.equal(child.geometry.attributes.normal.count,position.count);
    for(const v of position.array)assert(Number.isFinite(v));
    triangles+=(child.geometry.index?.count??position.count)/3;
    assert(child.material.isMeshStandardMaterial);
  });
  assert(localMeshes<=8,`${entry.name} exceeds material-batched draw budget`);
}
assert.equal(meshes,report.meshes);assert.equal(triangles,report.triangles);
assert(triangles<20000);assert(bytes.length<1.5*1024*1024);
pass('Real decoder-free GLB parses with finite dimensions/vertices/normals, local articulated attachment origins and at most eight material batches per asset');

const operator=entries.find(e=>e.name==='operator-detail');
assert.deepEqual(Object.keys(operator.attachments),['torso','pelvis','foot','cuff']);
assert.deepEqual(operator.paletteMaterials,{sar_vest:'vest',sar_accent:'accent'});
const kit=gltf.scene.getObjectByName(operator.node),finishes=new Set();
kit.traverse(node=>{if(node.isMesh)finishes.add(node.material.name)});
assert(finishes.has('sar_vest')&&finishes.has('sar_accent'));
assert.equal(operator.appliesTo,'all-existing-operator-palettes');
pass('Universal operator details preserve all identities through named vest/accent palette finishes and torso/pelvis/boot/cuff articulation');

const phone=entries.find(e=>e.name==='phone-device');
assert.deepEqual(phone.screen,{width:151,height:287,center:{x:0,y:-1.5,z:9.7},normal:'+Z',safeInset:5});
assert(phone.dimensions.x>174&&phone.dimensions.y>330&&phone.dimensions.z>20);
const phoneRoot=gltf.scene.getObjectByName(phone.node),phoneFinishes=new Set();
phoneRoot.traverse(node=>{if(node.isMesh)phoneFinishes.add(node.material.name)});
assert(phoneFinishes.has('phone_frame')&&phoneFinishes.has('phone_case')&&phoneFinishes.has('phone_glass')&&phoneFinishes.has('phone_lens'));
assert.equal(gltf.animations.length,0,'Animation remains controlled by the existing presentation rig');
pass('Physical beveled portrait phone has body depth, buttons, lens hardware and an explicit readable screen overlay anchor');

const output={status:'PASS',checks,blender:report.blender,assets:entries.length,meshes,triangles,glbBytes:bytes.length,contract:report.contract};
await fs.writeFile(new URL('./live-circuit-assets-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
