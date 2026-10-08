import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {buildOperator,animateOperator,poseUnarmedShowcase,ensureModelAssets,ensureCosmeticAssets,cosmeticDiagnostics,disposeModel,WEAPON_VISUALS,setOperatorPresentation} from '../models-25d.mjs';
const url=new URL('../assets/25d/cosmetics/manifest.json',import.meta.url),manifest=JSON.parse(await fs.readFile(url,'utf8'));
const operators=['urban-assault','woodland-scout','desert-runner','blue-strike','crimson-guard','steel-recon','ranger-elite','night-ops'];
const fetchOriginal=globalThis.fetch,randomOriginal=Math.random,fetched=[];
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>{const u=new URL(typeof request==='string'?request:request.url??request.href);fetched.push(u.pathname);return new Response(await fs.readFile(u));};
let checks=0,appearanceCount=0,poseCount=0,maxMeshes=0,maxTriangles=0,maxBaseMeshes=0,maxBaseTriangles=0;
const pass=message=>{checks++;console.log('PASS '+message);};
try{
 assert.equal(Object.keys(manifest.cosmetics).length,35);await ensureModelAssets();
 assert(!fetched.some(path=>path.includes('/cosmetics/')),'Wardrobe loaded at boot');
 const blend=await fs.readFile(new URL('../assets/25d/cosmetics/overclock-collection.blend',import.meta.url));assert(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528,'Editable Blender source format');
 pass('35 canonical products, editable Blender source, no wardrobe load with base assets');
 Math.random=()=>{throw new Error('Cosmetic presentation consumed gameplay randomness');};
 for(const [id,item] of Object.entries(manifest.cosmetics)){
  assert(id.startsWith(item.operatorId+'.'));assert(operators.includes(item.operatorId));
  const bytes=await fs.readFile(new URL('../'+item.styles.main.file,import.meta.url));
  assert.equal(bytes.toString('utf8',0,4),'glTF');
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert(!gltf.images?.length);assert(!gltf.extensionsRequired?.length);
  const signature=crypto.createHash('sha256').update(bytes).digest('hex');
  assert(bytes.length<160000*Object.keys(item.styles).length,'Per-item library too large');
  for(const [styleId,style] of Object.entries(item.styles)){
   appearanceCount++;assert.equal(style.sha256,signature);assert.equal(style.bytes,bytes.length);assert(style.meshes<=13);assert(style.triangles<1800);
   const selection={id,operatorId:item.operatorId,styleId};await ensureCosmeticAssets(selection);
   const skin=operators.indexOf(item.operatorId),basePalette=manifest.cosmetics[item.operatorId+'.helmet-off'].styles.main.palette,entity=buildOperator(0,skin,basePalette,selection),base=buildOperator(0,skin,basePalette);
   assert.deepEqual(entity.cosmetic,selection);assert.equal(entity.cosmeticLobbyPose,item.lobbyPose);
   for(let i=0;i<2;i++){assert.deepEqual(entity.arms[i].start,base.arms[i].start);assert.equal(entity.arms[i].lengthA,base.arms[i].lengthA);assert.equal(entity.arms[i].lengthB,base.arms[i].lengthB);assert.deepEqual(entity.legs[i].start,base.legs[i].start);}
   assert.deepEqual(entity.gunMount.position,base.gunMount.position);assert.equal(entity.ring.material,base.ring.material);
   poseUnarmedShowcase(entity,{lobbyIdle:true});assert.equal(entity.gunMount.visible,false);
   entity.group.updateMatrixWorld(true);const head=new THREE.Box3().setFromObject(entity.helmet);assert(head.max.y>65&&head.max.y<67,'Head silhouette changed height');
   if(id.endsWith('helmet-off'))assert(!styleId.includes('helmet'),'Helmet off has completed head export');
   setOperatorPresentation(entity,{color:'#f08a87'});assert.equal(entity.ring.material.color.getHexString(),'f08a87');
   // Every weapon shares exact hand/muzzle anchors through the existing states.
   for(const weapon of Object.keys(WEAPON_VISUALS)){
    for(const extra of [{},{vx:160,vy:35},{vx:220,sprinting:true},{ads:true,adsBlend:1},{reloading:true,reloadProgress:.45},{muzzle:true,shotId:2,shotAge:.02},{dead:true}]){
     const actor={id:1,x:30,y:40,angle:1,weapon,vx:0,vy:0,...extra},before=JSON.stringify(actor);
     animateOperator(entity,actor,1000,1/60);animateOperator(base,actor,1000,1/60);poseCount++;entity.group.updateMatrixWorld(true);
     assert.equal(JSON.stringify(actor),before,'Presentation mutated gameplay snapshot');
     assert.deepEqual(entity.gun.userData.muzzlePosition,base.gun.userData.muzzlePosition);assert.deepEqual(entity.gun.userData.grips,base.gun.userData.grips);
     for(const arm of entity.arms)assert(arm.glove.position.distanceTo(arm.end)<1e-8,'Detached hand');
     entity.group.traverse(node=>{assert(node.matrixWorld.elements.every(Number.isFinite));});
    }
    let meshes=0,triangles=0;entity.group.traverse(node=>{if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});maxMeshes=Math.max(maxMeshes,meshes);maxTriangles=Math.max(maxTriangles,triangles);
    let baseMeshes=0,baseTriangles=0;base.group.traverse(node=>{if(node.isMesh){baseMeshes++;baseTriangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});maxBaseMeshes=Math.max(maxBaseMeshes,baseMeshes);maxBaseTriangles=Math.max(maxBaseTriangles,baseTriangles);
    assert(meshes<=85,'Appearance draw budget exceeded');
   }
   disposeModel(entity.group);disposeModel(base.group);
   assert(cosmeticDiagnostics().idleItems<=6,'Unbounded wardrobe cache');
  }
 }
 assert.equal(appearanceCount,38);pass('38 exported styles: exact hashes, decoder-free compact geometry and finished head height');
 pass(poseCount+' actual rig poses: all 14 weapons, idle/run/sprint/ADS/fire/reload/death, unchanged anchors and snapshots');
 await assert.rejects(ensureCosmeticAssets({id:'blue-strike.black-ice',operatorId:'night-ops',styleId:'main'}),/incompatible/);
 await assert.rejects(ensureCosmeticAssets({id:'blue-strike.black-ice',operatorId:'blue-strike',styleId:'invented'}),/incompatible/);
 const s={id:'blue-strike.black-ice',operatorId:'blue-strike',styleId:'main'},start=fetched.length;
 await Promise.all([ensureCosmeticAssets(s),ensureCosmeticAssets(s)]);assert(fetched.slice(start).filter(p=>p.endsWith('.glb')).length<=1);
 pass('Compatibility/style checks, deduplicated fetches, six-idle-item bounded shared resource cache');
 const report={ok:true,checks,products:35,appearances:appearanceCount,rigPoses:poseCount,maxMeshes,maxTriangles,maxBaseMeshes,maxBaseTriangles,cache:cosmeticDiagnostics()};
 await fs.writeFile(new URL('../assets/25d/cosmetics/runtime-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{globalThis.fetch=fetchOriginal;Math.random=randomOriginal;}
