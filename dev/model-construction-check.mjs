import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {buildWeapon,buildOperator,animateOperator,ensureModelAssets,WEAPON_VISUALS,disposeModel} from '../models-25d.mjs';

// Load the actual exported assets, without a browser or a substitute model.
const originalFetch=globalThis.fetch;
globalThis.ProgressEvent=class extends Event {constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return originalFetch(request);const bytes=await fs.readFile(url);return new Response(bytes);};
const library=await ensureModelAssets();globalThis.fetch=originalFetch;
for(const entry of library.entries.filter(e=>e.attachments))for(const key of Object.keys(entry.attachments)){
  const node=library.cloneAttachment(entry.name,key);
  assert.equal(node.position.length(),0);assert.equal(node.quaternion.angleTo(new THREE.Quaternion()),0);
  assert.deepEqual(node.scale.toArray(),[1,1,1]);
}

// A vertical section through a real mount must be solid from its receiver to
// its sight. Winding-aware union handles overlapping closed, batched meshes.
const doubleSided=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function solidSection(object,x,z,floor){
  object.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(x,150,z),new THREE.Vector3(0,-1,0));
  const events=[];
  object.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible)return;
    const material=mesh.material;mesh.material=doubleSided;
    const hits=ray.intersectObject(mesh,false);mesh.material=material;
    const unique=[];
    for(const hit of hits){
      const normal=hit.face.normal.clone().transformDirection(mesh.matrixWorld);
      if(Math.abs(normal.y)<1e-6||hit.point.y<floor)continue;
      if(unique.some(e=>Math.abs(e.y-hit.point.y)<1e-5&&e.delta===Math.sign(normal.y)))continue;
      unique.push({y:hit.point.y,delta:Math.sign(normal.y)});
    }
    events.push(...unique);
  });
  events.sort((a,b)=>b.y-a.y);let depth=0,top=0;const spans=[];
  for(const event of events){if(depth===0&&event.delta>0)top=event.y;depth+=event.delta;if(depth===0)spans.push([event.y,top]);}
  if(depth>0)spans.push([floor,top]);
  return spans;
}
for(const[name,x,low,high]of[
  ['AR-15',9,3,12],['SMG-9',16,3,12],['LR-762',8,3,12],
  ['LW Tundra',4,3,11],['LW Tundra',27,3,11],['Auto 12',10,6,14],['War Head LMG',8,6,14],
  ['SR-Aug',26,2,13],['P90',38,3,14],['SPAS-12',-2,2,10],
  ['AK47',12,4,6],['FAL',-.5,4,9],['FAL',58,2,10],['9mm',3,6,8],['X16',3,6,7.5],['X-16 Auto',3,6,8],
  ['Pump Shotgun',45,2,4.5]
]){
  const weapon=buildWeapon(name),spans=solidSection(weapon,x,.2,35+low);
  assert(spans.some(([bottom,top])=>bottom<=35+low+.05&&top>=35+high-.05),`${name}: unsupported upper component; sections ${JSON.stringify(spans)}`);
  disposeModel(weapon);
}

let poses=0;
for(let skin=0;skin<8;skin++)for(const name of Object.keys(WEAPON_VISUALS)){
  const entity=buildOperator(0,skin);
  for(const mode of ['idle','walk','ads','fire','reload'])for(let i=0;i<=24;i++){
    const actor={x:i*2,y:0,angle:i*Math.PI/12,weapon:name,vx:mode==='walk'?175:0,vy:0,adsBlend:mode==='ads'?1:0,shotId:mode==='fire'?i:0,shotAge:mode==='fire'?.05:99,muzzle:mode==='fire',reloading:mode==='reload',reloadProgress:i/24};
    animateOperator(entity,actor,i*16,1/60);entity.group.updateMatrixWorld(true);
    for(const arm of entity.arms){
      assert(arm.glove.position.distanceTo(arm.end)<1e-6,`${name}: detached hand`);
      assert(arm.start.distanceTo(arm.end)<arm.lengthA+arm.lengthB,`${name}: unreachable hand`);
    }
    entity.group.traverse(node=>{for(const v of node.matrixWorld.elements)assert(Number.isFinite(v));});
    for(const node of Object.values(entity.gun.userData.moving).filter(Boolean))assert.equal(node.parent,entity.gun.userData.body);
    poses++;
  }
  disposeModel(entity.group);
}
doubleSided.dispose();
console.log(`PASS real mesh contact sections for all 15 weapons; identity attachment transforms; ${poses} poses across 8 operators, 15 guns, 360 degrees, idle/walk/ADS/fire/reload.`);
