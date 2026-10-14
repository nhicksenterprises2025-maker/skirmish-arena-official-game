import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {buildOperator,buildWeapon,poseVictoryPresentation,poseUnarmedShowcase,animateOperator,ensureModelAssets,ensureCosmeticAssets,ensureVictoryPoseAssets,disposeModel,WEAPON_VISUALS,cosmeticDiagnostics} from '../models-25d.mjs';
const manifest=JSON.parse(await fs.readFile(new URL('../assets/25d/cosmetics/manifest.json',import.meta.url),'utf8'));
const poses=['quiet-confidence','arms-folded','weapon-rest','champion-stance','tactical-ready','over-the-shoulder'],operators=['field-ranger','metro-unit','frontier','sentinel','nightfall','hazard','vector','obsidian','aegis-prime','specter'];
const fetchOriginal=globalThis.fetch,progressOriginal=globalThis.ProgressEvent,randomOriginal=Math.random;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>{const url=new URL(typeof request==='string'?request:request.url??request.href);return new Response(await fs.readFile(url));};
let states=0,checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 await ensureModelAssets();for(const pose of poses)await ensureVictoryPoseAssets(pose);
 Math.random=()=>{throw Error('Victory presentation consumed simulation randomness');};
 const signatures=new Set();for(const pose of poses){const entity=buildOperator(0,0);poseVictoryPresentation(entity,pose);signatures.add(JSON.stringify([entity.torso.rotation.z,entity.arms.map(arm=>arm.end.toArray()),entity.legs.map(leg=>leg.end.toArray()),entity.gunMount.position.toArray(),entity.gun?.userData.body.rotation.z]));disposeModel(entity.group);}assert.equal(signatures.size,6);pass('Six authored poses have distinct articulated silhouettes and use no simulation randomness');
 for(const [index,operatorId]of operators.entries()){
  const cosmetic={id:operatorId+'.signature',operatorId,styleId:'main'};await ensureCosmeticAssets(cosmetic);const palette=manifest.cosmetics[cosmetic.id].styles.main.palette;
  for(const weapon of Object.keys(WEAPON_VISUALS)){
   const combat=buildOperator(0,index+8,palette,cosmetic),actor={id:1,x:250,y:500,angle:1.2,weapon,hp:250,maxHP:250,vx:0,vy:0},snapshot=JSON.stringify(actor);animateOperator(combat,actor,1000,1/60);
   const combatBefore=JSON.stringify([combat.arms.map(arm=>arm.end.toArray()),combat.gunMount.position.toArray(),combat.gun.userData.muzzlePosition.toArray()]);
   for(const pose of poses){
    const entity=buildOperator(0,index+8,palette,cosmetic),canonical=buildWeapon(weapon);poseVictoryPresentation(entity,pose,weapon);entity.group.updateMatrixWorld(true);
    for(const arm of entity.arms){assert.ok(arm.start.distanceTo(arm.end)<arm.lengthA+arm.lengthB,operatorId+' '+weapon+' '+pose+' reach');assert.ok(arm.glove.position.distanceTo(arm.end)<1e-8,'Hand detached');assert.ok(arm.lower.position.distanceTo(arm.knee.position.clone().add(arm.end).multiplyScalar(.5))<1e-8,'Forearm detached');}
    if(entity.gun){assert.deepEqual(entity.gun.userData.muzzlePosition,canonical.userData.muzzlePosition);assert.deepEqual(entity.gun.userData.grips,canonical.userData.grips);for(const arm of entity.arms){const anchor=entity.gun.userData.grips[arm.side===1?'rear':'support'].clone();anchor.y-=35;anchor.applyMatrix4(entity.gun.userData.body.matrix).add(entity.gunMount.position);assert.ok(anchor.distanceTo(arm.glove.position)<1e-8,'Hand off actual weapon grip');}}
    assert.equal(entity.ring.visible,false);entity.group.traverse(node=>assert.ok(node.matrixWorld.elements.every(Number.isFinite),'Nonfinite pose'));
    assert.equal(JSON.stringify(actor),snapshot);assert.equal(JSON.stringify([combat.arms.map(arm=>arm.end.toArray()),combat.gunMount.position.toArray(),combat.gun.userData.muzzlePosition.toArray()]),combatBefore,'Shared gameplay instance changed');states++;disposeModel(entity.group);disposeModel(canonical);
   }
   disposeModel(combat.group);
  }
 }
 pass(states+' real exported-operator pose states: all ten operators × six poses × all fifteen weapons, attached hands and unchanged combat instance');
 for(const pose of ['black-ice','aegis','monarch']){await ensureVictoryPoseAssets(pose);const current=buildOperator(0,0),old=buildOperator(0,0);old.cosmeticLobbyPose=pose;poseUnarmedShowcase(old,{lobbyIdle:true});poseVictoryPresentation(current,pose);assert.deepEqual(current.arms.map(arm=>arm.end),old.arms.map(arm=>arm.end));disposeModel(current.group);disposeModel(old.group);}pass('Previously earned signature victory poses retain their original hand positions');
 const bad=buildOperator(0,0);assert.throws(()=>poseVictoryPresentation(bad,'missing'),/not loaded/);disposeModel(bad.group);assert.ok(cosmeticDiagnostics().idleItems<=6);pass('Unknown pose fails explicitly; preview assets remain bounded after disposal');
 const bytes=await fs.readFile(new URL('../assets/25d/cosmetics/victory-poses.json',import.meta.url));console.log(JSON.stringify({ok:true,checks,states,poseBytes:bytes.length,poseSha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
}finally{globalThis.fetch=fetchOriginal;globalThis.ProgressEvent=progressOriginal;Math.random=randomOriginal;}
