import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {buildOperator,animateOperator,ensureModelAssets,ensureCosmeticAssets,disposeModel,WEAPON_VISUALS,cosmeticDiagnostics} from '../models-25d.mjs';

const directory=new URL('../assets/25d/cosmetics/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
const content=JSON.parse(await fs.readFile(new URL('content-manifest.json',directory),'utf8'));
const ids=['field-ranger','metro-unit','frontier','sentinel','nightfall','hazard','vector','obsidian','aegis-prime','specter'];
const originalFetch=globalThis.fetch,originalRandom=Math.random;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async request=>new Response(await fs.readFile(new URL(typeof request==='string'?request:request.url??request.href)));
const signatures=new Set(),headSignatures=new Set(),torsoSignatures=new Set();
let states=0,rotations=0,maxTriangles=0,maxMeshes=0;
const snapshot=extra=>({id:1,x:30,y:50,angle:.8,weapon:'AR-15',vx:0,vy:0,...extra});

function componentBounds(mesh){
 const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
 const parents=new Map(),points=new Map();
 const key=i=>[position.getX(i),position.getY(i),position.getZ(i)].map(n=>Math.round(n*1e4)).join(',');
 const find=k=>{if(!parents.has(k))parents.set(k,k);let p=parents.get(k);if(p!==k){p=find(p);parents.set(k,p);}return p;};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents.set(b,a);};
 const count=index?.count??position.count;
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(n=>index?index.getX(i+n):i+n),keys=ids.map(key);join(keys[0],keys[1]);join(keys[0],keys[2]);for(let j=0;j<3;j++)points.set(keys[j],new THREE.Vector3(position.getX(ids[j]),position.getY(ids[j]),position.getZ(ids[j])).applyMatrix4(mesh.matrixWorld));}
 const boxes=new Map();for(const[k,p]of points){const group=find(k);if(!boxes.has(group))boxes.set(group,new THREE.Box3());boxes.get(group).expandByPoint(p);}return [...boxes.values()];
}
function construction(entity){
 entity.torso.updateMatrixWorld(true);
 const boxes=[];for(const name of ['head','torso'])entity.torso.getObjectByName('cosmetic:'+name).traverse(mesh=>{if(mesh.isMesh)boxes.push(...componentBounds(mesh));});
 const connected=new Set([0]);let added=true;
 while(added){added=false;for(let i=0;i<boxes.length;i++)if(!connected.has(i)&&[...connected].some(j=>boxes[i].clone().expandByScalar(.3).intersectsBox(boxes[j]))){connected.add(i);added=true;}}
 assert.equal(connected.size,boxes.length,'Export contains unsupported components');return boxes.length;
}
function geometryDigest(group){
 const hash=crypto.createHash('sha256');group.traverse(mesh=>{if(mesh.isMesh){hash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));if(mesh.geometry.index)hash.update(Buffer.from(mesh.geometry.index.array.buffer));}});return hash.digest('hex');
}

try{
 await ensureModelAssets();
 Math.random=()=>{throw new Error('Presentation consumed simulation RNG');};
 for(let i=0;i<ids.length;i++){
  const operatorId=ids[i],id=operatorId+'.signature',item=manifest.cosmetics[id],style=item.styles.main;
  assert.equal(item.operatorId,operatorId);assert.equal(item.priceAC,i<2?500:i<4?1000:i<7?1500:2500);
  assert.deepEqual(Object.keys(style.attachments).sort(),['head','torso']);assert.equal(style.palette.build,1);
  const binary=await fs.readFile(new URL('../'+style.file,import.meta.url)),hash=crypto.createHash('sha256').update(binary).digest('hex');
  assert.equal(binary.toString('utf8',0,4),'glTF');assert.equal(hash,style.sha256);assert.equal(binary.length,style.bytes);assert(!signatures.has(hash));signatures.add(hash);
  const gltf=JSON.parse(binary.subarray(20,20+binary.readUInt32LE(12)).toString());assert(!gltf.images?.length);assert(!gltf.extensionsRequired?.length);assert(!gltf.animations?.length,'Static attachment export changes gameplay animation');
  const selection={id,operatorId,styleId:'main'};await ensureCosmeticAssets(selection);
  const entity=buildOperator(0,i+8,style.palette,selection),base=buildOperator(0,i+8,style.palette);
  assert.equal(entity.cosmetic.id,id);assert.equal(entity.gunMount.position.distanceTo(base.gunMount.position),0);
  for(let n=0;n<2;n++){assert.deepEqual(entity.arms[n].start,base.arms[n].start);assert.equal(entity.arms[n].lengthA,base.arms[n].lengthA);assert.equal(entity.arms[n].lengthB,base.arms[n].lengthB);assert.deepEqual(entity.legs[n].start,base.legs[n].start);}
  assert(construction(entity)>10);
  const head=entity.torso.getObjectByName('cosmetic:head'),torso=entity.torso.getObjectByName('cosmetic:torso');
  const hh=geometryDigest(head),th=geometryDigest(torso);assert(!headSignatures.has(hh),'Recolored helmet duplicate');assert(!torsoSignatures.has(th),'Recolored armor duplicate');headSignatures.add(hh);torsoSignatures.add(th);
  for(const[part,name]of Object.entries(style.attachments)){const node=entity.torso.getObjectByName('cosmetic:'+part);assert.deepEqual(node.position.toArray(),[0,0,0]);assert.deepEqual(node.scale.toArray(),[1,1,1]);assert.equal(node.quaternion.angleTo(new THREE.Quaternion()),0);assert(name.includes('__'+part));}
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){entity.group.rotation.y=angle;entity.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(head);assert(bounds.max.y>65&&bounds.max.y<67);entity.group.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite)));rotations++;}
  entity.group.rotation.y=0;
  for(const weapon of Object.keys(WEAPON_VISUALS))for(const extra of [{},{vx:140,vy:40},{vx:220,sprinting:true},{ads:true,adsBlend:1},{reloading:true,reloadProgress:.55},{muzzle:true,shotId:3,shotAge:.02},{dead:true}]){
   const actor=snapshot({weapon,...extra}),before=JSON.stringify(actor);animateOperator(entity,actor,2000,1/60);animateOperator(base,actor,2000,1/60);states++;
   assert.equal(JSON.stringify(actor),before);assert.deepEqual(entity.gun.userData.muzzlePosition,base.gun.userData.muzzlePosition);assert.deepEqual(entity.gun.userData.grips,base.gun.userData.grips);for(const arm of entity.arms)assert(arm.glove.position.distanceTo(arm.end)<1e-8);
  }
  maxTriangles=Math.max(maxTriangles,style.triangles);maxMeshes=Math.max(maxMeshes,style.meshes);assert(style.triangles<2200);assert(style.meshes<=13);
  disposeModel(entity.group);disposeModel(base.group);assert(cosmeticDiagnostics().idleItems<=6);item.verified=true;
 }
 const artwork=Object.values(content.content).filter(item=>['profile-icon','profile-banner'].includes(item.kind));
 assert.equal(artwork.filter(item=>item.kind==='profile-icon').length,12);assert.equal(artwork.filter(item=>item.kind==='profile-banner').length,8);
 const artworkHashes=new Set();for(const item of artwork){const bytes=await fs.readFile(new URL('../'+item.file,import.meta.url));assert.equal(bytes.readUInt32BE(0),0x89504e47);assert.equal(bytes.readUInt32BE(16),item.dimensions.width);assert.equal(bytes.readUInt32BE(20),item.dimensions.height);assert.equal(bytes.length,item.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);assert(!artworkHashes.has(item.sha256));artworkHashes.add(item.sha256);item.verified=true;}
 const blend=await fs.readFile(new URL('cosmetic-content.blend',directory));assert(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528);
 const report={ok:true,operators:ids.length,distinctHeadGeometry:headSignatures.size,distinctTorsoGeometry:torsoSignatures.size,icons:12,banners:8,rotationChecks:rotations,rigStateChecks:states,weapons:Object.keys(WEAPON_VISUALS).length,maxTriangles,maxMeshes,cache:cosmeticDiagnostics()};
 for(const[name,value]of [['manifest.json',manifest],['content-manifest.json',content]]){const path=new URL(name,directory),text=JSON.stringify(value,null,2)+'\n';if(await fs.readFile(path,'utf8')!==text)await fs.writeFile(path,text);}
 const buildPath=new URL('content-build-report.json',directory),build=JSON.parse(await fs.readFile(buildPath,'utf8'));build.status='EXPORTED_AND_RUNTIME_RIG_VALIDATED';await fs.writeFile(buildPath,JSON.stringify(build,null,2)+'\n');
 await fs.writeFile(new URL('content-runtime-validation.json',directory),JSON.stringify(report,null,2)+'\n');
 console.log('PASS original Blender exports, connected components, full rotation, all weapon poses, unchanged anchors and snapshots');console.log(JSON.stringify(report));
}finally{globalThis.fetch=originalFetch;Math.random=originalRandom;}
