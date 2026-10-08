import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/addons/loaders/GLTFLoader.js';
import {buildWeapon,buildOperator,setOperatorWeapon,animateOperator,disposeModel,ensureModelAssets,WEAPON_VISUALS} from '../models-25d.mjs';

const originalFetch=globalThis.fetch;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return originalFetch(request);return new Response(await fs.readFile(url));};
const library=await ensureModelAssets();
const out=process.env.SAR_TEST_OUTPUT;
const report={ok:true,checks:[],poses:0,magazineVertices:0};
function pass(label){report.checks.push(label);console.log('PASS '+label);}
const fal=buildWeapon('FAL'),data=fal.userData;
assert.equal(data.blenderDetails,'weapon-detail-fal');assert.equal(data.spec.cycle,.26);
assert.equal(data.muzzleX,76);assert.deepEqual(data.grips.rear.toArray(),[4,29,4]);assert.deepEqual(data.grips.support.toArray(),[29,34,-3]);
assert(data.moving.mag&&data.moving.bolt&&!data.moving.pump&&!data.moving.slide&&!data.moving.shell);
const entry=library.entries.find(value=>value.weapon==='FAL');assert.deepEqual(Object.keys(entry.attachments),['body','mag','bolt']);
for(const part of ['body','mag','bolt']){
  const clone=library.cloneAttachment(entry.name,part);assert.equal(clone.position.length(),0);assert.deepEqual(clone.scale.toArray(),[1,1,1]);assert.equal(clone.quaternion.angleTo(new THREE.Quaternion()),0);
  assert.equal((part==='body'?data.body:data.moving[part]).getObjectByName(entry.attachments[part]).parent,part==='body'?data.body:data.moving[part]);
}
pass('FAL has dedicated geometry, physical 76-unit muzzle, reachable hand anchors and identity body/magazine/bolt detail attachments');

const mag=data.moving.mag,shell=mag.children.find(mesh=>mesh.isMesh&&mesh.material.color.getHex()===0x3b4a48),detail=library.cloneAttachment(entry.name,'mag'),ray=new THREE.Raycaster(),point=new THREE.Vector3();
detail.updateMatrixWorld(true);mag.updateMatrixWorld(true);
detail.traverse(mesh=>{if(!mesh.isMesh||mesh.material.name!=='recess')return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){
  point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(mag.matrixWorld);
  ray.set(new THREE.Vector3(point.x,point.y,10),new THREE.Vector3(0,0,-1));assert(ray.intersectObject(shell,false).length,'magazine stamping vertex outside feed');report.magazineVertices++;
}});
assert(report.magazineVertices>0);pass('Blender stamping is seated within the straight magazine face');

for(let skin=0;skin<8;skin++)for(const mode of ['idle','walk','sprint','ads','fire','reload','dash','hit','death']){
  const entity=buildOperator(1,skin);setOperatorWeapon(entity,'FAL');
  const magRest=entity.gun.userData.moving.mag.userData.restPosition.clone(),boltRest=entity.gun.userData.moving.bolt.userData.restPosition.clone();
  for(let turn=0;turn<=72;turn++){
    const actor={x:turn,y:0,angle:turn*Math.PI/36,weapon:'FAL',vx:['walk','sprint'].includes(mode)?175:0,vy:0,sprinting:mode==='sprint',adsBlend:mode==='ads'?1:0,shotId:mode==='fire'?turn:0,shotAge:mode==='fire'?.06:99,recoil:mode==='fire'?.7:0,muzzle:mode==='fire',reloading:mode==='reload',reloadProgress:turn/72,dashing:mode==='dash',hit:mode==='hit'?1:0,dead:mode==='death'};
    animateOperator(entity,actor,turn*16,1/60);entity.group.updateMatrixWorld(true);
    for(const arm of entity.arms){assert(arm.start.distanceTo(arm.end)<arm.lengthA+arm.lengthB,`${skin}/${mode}/${turn}/${arm.side}: ${arm.start.distanceTo(arm.end)} >= ${arm.lengthA+arm.lengthB}`);assert(arm.glove.position.distanceTo(arm.end)<1e-6);}
    for(const mechanism of Object.values(entity.gun.userData.moving).filter(Boolean))assert.equal(mechanism.parent,entity.gun.userData.body);
    entity.group.traverse(node=>{for(const value of node.matrixWorld.elements)assert(Number.isFinite(value));});
    if(mode==='fire')assert(entity.gun.userData.moving.bolt.position.x<boltRest.x-.5);
    if(mode==='reload'&&turn===20)assert(entity.gun.userData.moving.mag.position.y<magRest.y-10);
    if(mode==='reload'&&turn===20){
      const weapon=entity.gun.userData,target=weapon.handling.mag.clone().applyMatrix4(weapon.moving.mag.matrix).applyMatrix4(weapon.body.matrix).add(entity.gunMount.position);
      assert(entity.arms.find(arm=>arm.side===-1).glove.position.distanceTo(target)<1e-6,'FAL reload hand leaves magazine anchor');
    }
    report.poses++;
  }
  disposeModel(entity.group);
}
pass(`${report.poses} FAL poses cover all eight operators, 360 degrees, idle/walk/sprint/ADS/fire/reload/dash/hit/death with attached hands and mechanisms`);
disposeModel(fal);

if(process.env.SAR_MODEL_BASELINE){
  const base=process.env.SAR_MODEL_BASELINE;
  const bytes=await fs.readFile(path.join(base,'assets/25d/live-circuit-details.glb'));
  const before=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const currentBytes=await fs.readFile(new URL('../assets/25d/live-circuit-details.glb',import.meta.url));
  const current=await new GLTFLoader().parseAsync(currentBytes.buffer.slice(currentBytes.byteOffset,currentBytes.byteOffset+currentBytes.byteLength),'');
  function signature(root){const rows=[];root.updateMatrixWorld(true);root.traverse(node=>{if(!node.isMesh)return;rows.push({name:node.name,position:node.position.toArray(),rotation:node.quaternion.toArray(),scale:node.scale.toArray(),positions:Array.from(node.geometry.attributes.position.array),normals:Array.from(node.geometry.attributes.normal.array),indices:node.geometry.index?Array.from(node.geometry.index.array):null,finish:node.material.name,color:node.material.color.toArray(),roughness:node.material.roughness,metalness:node.material.metalness});});return rows;}
  for(const root of before.scene.children)assert.deepEqual(signature(current.scene.getObjectByName(root.name)),signature(root),root.name+' existing export changed');
  const oldManifest=JSON.parse(await fs.readFile(path.join(base,'assets/25d/manifest.json'),'utf8'));
  for(const old of oldManifest.models)assert.deepEqual(library.entries.find(e=>e.name===old.name),old,old.name+' manifest contract changed');
  pass('All sixteen prior Blender assets retain byte-identical geometry/material arrays and their complete manifest contracts');
  const oldText=await fs.readFile(path.join(base,'models-25d.mjs'),'utf8');
  const rewritten=oldText.replace(/(['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>quote+new URL(relative,new URL('../models-25d.mjs',import.meta.url)).href+quote);
  const old=await import('data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64'));await old.ensureModelAssets();
  const cycles={AK47:.35,'LR-762':.77,'LW Tundra':1.4,'War Head LMG':.42,P90:.23,'9mm':.27,'SR-Aug':.70};
  for(const name of Object.keys(old.WEAPON_VISUALS)){
    assert.deepEqual(WEAPON_VISUALS[name],{...old.WEAPON_VISUALS[name],cycle:cycles[name]??old.WEAPON_VISUALS[name].cycle});
    const previous=old.buildWeapon(name),present=buildWeapon(name);assert.deepEqual(signature(present),signature(previous),name+' prior runtime art changed');old.disposeModel(previous);disposeModel(present);
  }
  pass('All fourteen prior weapon constructions and muzzle/grip anchors remain exact; only supplied presentation cycles change');
  report.hashes={before:crypto.createHash('sha256').update(bytes).digest('hex'),after:crypto.createHash('sha256').update(currentBytes).digest('hex')};
}
globalThis.fetch=originalFetch;
if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'fal-model-results.json'),JSON.stringify(report,null,2)+'\n');}
