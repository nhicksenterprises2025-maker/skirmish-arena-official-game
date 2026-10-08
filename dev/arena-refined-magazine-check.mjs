import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {buildWeapon,buildOperator,setOperatorWeapon,animateOperator,disposeModel,ensureModelAssets,WEAPON_VISUALS} from '../models-25d.mjs';

// Exercise the shipped GLB and shared construction, without replacing the model.
const fetchOriginal=globalThis.fetch,progressOriginal=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return fetchOriginal(request);const bytes=await fs.readFile(url);return new Response(bytes);};
const library=await ensureModelAssets();
globalThis.fetch=fetchOriginal;globalThis.ProgressEvent=progressOriginal;

const report={checks:[],poses:0,vertexSamples:0};
function pass(name){report.checks.push(name);console.log('PASS '+name);}
const weapon=buildWeapon('AK47'),mag=weapon.userData.moving.mag;
const shell=mag.children.find(node=>node.isMesh&&node.material.color.getHex()===0x344747);
const ribs=mag.children.find(node=>node.isMesh&&node.material.color.getHex()===0x1e302f);
assert(shell&&ribs,'original magazine and stamped detail finishes retained');
mag.updateMatrixWorld(true);
const ray=new THREE.Raycaster(),point=new THREE.Vector3(),surface=[];
for(let index=0;index<ribs.geometry.attributes.position.count;index++){
  point.fromBufferAttribute(ribs.geometry.attributes.position,index).applyMatrix4(ribs.matrixWorld);
  ray.set(new THREE.Vector3(point.x,point.y,10),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(shell,false)[0];
  assert(hit,`rib vertex ${index} lies outside the actual magazine silhouette`);
  surface.push(hit.point.z);report.vertexSamples++;
}
const bounds=new THREE.Box3().setFromObject(ribs),face=new THREE.Box3().setFromObject(shell).max.z;
assert(bounds.min.z<face-.03&&bounds.max.z>face+.03,'rib depth must intersect the side rather than float above it');
assert(Math.max(...surface)-Math.min(...surface)<.05,'detail footprint stays on the flat magazine face');
pass('All stamped rib vertices remain within the real curved magazine; their depth overlaps the metal face');

const detail=mag.getObjectByName('weapon-detail-ak47__mag');assert(detail,'actual exported magazine attachment retained');
assert.equal(detail.parent,mag);assert.equal(detail.position.length(),0);assert.deepEqual(detail.scale.toArray(),[1,1,1]);
const source=library.cloneAttachment('weapon-detail-ak47','mag');
source.updateMatrixWorld(true);source.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(mag.matrixWorld);
    ray.set(new THREE.Vector3(point.x,point.y,10),new THREE.Vector3(0,0,-1));
    assert(ray.intersectObject(shell,false)[0],`exported reinforcement vertex ${i} lies outside magazine`);
  }
});
pass('Existing Blender reinforcement GLB is correctly seated with identity attachment transforms; export preserved');

const ribLocal=ribs.matrix.clone(),detailLocal=detail.matrix.clone();
for(const mode of ['idle','walk','ads','fire','reload'])for(let turn=0;turn<=72;turn++){
  const entity=buildOperator(0,5);setOperatorWeapon(entity,'AK47');
  const actor={id:1,x:0,y:0,angle:turn*Math.PI/36,vx:mode==='walk'?175:0,vy:0,weapon:'AK47',hp:250,maxHP:250,adsBlend:mode==='ads'?1:0,shotId:turn,shotAge:mode==='fire'?.04:99,muzzle:mode==='fire',reloading:mode==='reload',reloadProgress:turn/72};
  animateOperator(entity,actor,turn*40,1/60);entity.group.updateMatrixWorld(true);
  const current=entity.gun.userData.moving.mag;
  const currentRib=current.children.find(node=>node.isMesh&&node.material.color.getHex()===0x1e302f),currentDetail=current.getObjectByName('weapon-detail-ak47__mag');
  assert(currentRib.matrix.equals(ribLocal));assert(currentDetail.matrix.equals(detailLocal));
  assert.equal(currentRib.parent,current);assert.equal(currentDetail.parent,current);
  assert.equal(entity.gun.userData.muzzleX,WEAPON_VISUALS.AK47.muzzle);
  for(const v of current.matrixWorld.elements)assert(Number.isFinite(v));
  for(const arm of entity.arms)assert(arm.glove.position.distanceTo(arm.end)<1e-6);
  report.poses++;disposeModel(entity.group);
}
pass('365 real operator poses cover a full turn with idle, movement, ADS, fire and reload; both detail layers follow the magazine and hands stay connected');

if(process.env.SAR_AK_BASELINE){
  const baseline=await fs.readFile(process.env.SAR_AK_BASELINE,'utf8');
  const moduleText=baseline.replace(/(['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>quote+new URL(relative,new URL('../models-25d.mjs',import.meta.url)).href+quote);
  const original=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));await original.ensureModelAssets();
  assert.deepEqual(WEAPON_VISUALS,original.WEAPON_VISUALS);
  const previous=original.buildWeapon('AK47');
  const beforeMag=previous.userData.moving.mag;beforeMag.updateMatrixWorld(true);
  const beforeShell=beforeMag.children.find(node=>node.isMesh&&node.material.color.getHex()===0x344747),beforeRib=beforeMag.children.find(node=>node.isMesh&&node.material.color.getHex()===0x1e302f);
  let outsideVertices=0;
  for(let index=0;index<beforeRib.geometry.attributes.position.count;index++){
    point.fromBufferAttribute(beforeRib.geometry.attributes.position,index).applyMatrix4(beforeRib.matrixWorld);
    ray.set(new THREE.Vector3(point.x,point.y,10),new THREE.Vector3(0,0,-1));
    if(!ray.intersectObject(beforeShell,false)[0])outsideVertices++;
  }
  const gap=new THREE.Box3().setFromObject(beforeRib).min.z-new THREE.Box3().setFromObject(beforeShell).max.z;
  assert(outsideVertices>0&&gap>.1,'baseline must reproduce the reported detached ribs');
  report.baselineFault={outsideVertices,gap};
  assert.deepEqual(weapon.userData.muzzlePosition.toArray(),previous.userData.muzzlePosition.toArray());
  for(const grip of ['rear','support'])assert.deepEqual(weapon.userData.grips[grip].toArray(),previous.userData.grips[grip].toArray());
  assert.deepEqual(mag.userData.restPosition.toArray(),previous.userData.moving.mag.userData.restPosition.toArray());
  disposeModel(previous);
  pass('Every visual weapon timing constant, AK muzzle/hand anchor and articulated magazine rest pose matches the recovered pre-audit source');
}
disposeModel(weapon);disposeModel(source);
const bytes=await fs.readFile(new URL('../assets/25d/live-circuit-details.glb',import.meta.url));
report.glb={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};report.status='PASS';
if(process.env.SAR_TEST_OUTPUT){await fs.mkdir(process.env.SAR_TEST_OUTPUT,{recursive:true});await fs.writeFile(new URL('magazine-geometry-results.json','file:///'+process.env.SAR_TEST_OUTPUT.replace(/\\/g,'/')+'/'),JSON.stringify(report,null,2)+'\n');}
