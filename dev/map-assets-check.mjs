import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {loadAssetLibrary} from '../asset-loader-25d.mjs';
import {buildEnvironment} from '../environment-25d.mjs';
const require=createRequire(import.meta.url),maps=require('../map-data.js');
const {engine}=require('./simulate.cjs');
const originalFetch=globalThis.fetch,originalProgressEvent=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return originalFetch(request,options);const bytes=await fs.readFile(url);return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
let library;
try{library=await loadAssetLibrary();}finally{globalThis.fetch=originalFetch;globalThis.ProgressEvent=originalProgressEvent;}

test('three immutable map identities retain Brightfield and an isotropic meter calibration',()=>{
 assert.equal(maps.schema,1);assert.equal(maps.list().length,3);assert.equal(maps.get('missing'),null);assert.equal(maps.get('__proto__'),null);assert.equal(maps.get('constructor'),null);
 const brightfield=maps.get('brightfield-blocks');assert.equal(brightfield.permanent,true);assert.deepEqual(brightfield.world,{w:4320,h:2880});assert.equal(brightfield.layout,null);
 for(const map of maps.list()){
  assert.ok(Object.isFrozen(map));assert.ok(Object.isFrozen(map.world));assert.equal(map.grid.cellWorld,32);assert.equal(map.grid.tileAreaM2,2);
  assert.equal(map.world.w/map.grid.columns,map.world.h/map.grid.rows);assert.equal(map.world.w/map.grid.columns,32);
  assert.equal(map.metersPerWorldUnit,Math.SQRT2/32);assert.ok(Math.abs(map.metersPerWorldUnit**2*32**2-2)<1e-12);
  assert.ok(map.revision);assert.ok(map.name);if(map.layout)assert.ok(Object.isFrozen(map.layout.cover));
 }
 assert.notEqual(maps.get('foundry-crossing').theme,maps.get('relay-fields').theme);
 assert.ok(maps.get('foundry-crossing').world.w<maps.get('relay-fields').world.w);
});

test('authored maps have valid roads, buildings, cover and team/FFA spawn distributions',()=>{
 for(const map of maps.list().filter(value=>value.layout)){
  const {world,layout}=map,bounded=r=>r.x>=24&&r.y>=24&&r.x+r.w<=world.w-24&&r.y+r.h<=world.h-24;
  assert.equal(layout.buildings.length,6);assert.ok(layout.roads.length>=6);assert.equal(layout.spawns.length,32);
  for(const road of layout.roads){assert.ok(road.w>0&&road.h>0);assert.ok(road.x>=0&&road.y>=0&&road.x+road.w<=world.w&&road.y+road.h<=world.h);}
  for(const [x,y,w,h,front,tone,label] of layout.buildings){assert.ok(bounded({x,y,w,h}));assert.ok(['north','south','east','west'].includes(front));assert.ok(Number.isInteger(tone)&&tone>=0&&tone<4);assert.ok(label);}
  for(const cover of layout.cover){assert.ok(cover.type==='rect'||cover.type==='circle');if(cover.type==='rect')assert.ok(bounded(cover));else assert.ok(bounded({x:cover.x-cover.r,y:cover.y-cover.r,w:cover.r*2,h:cover.r*2}));}
  assert.equal(new Set(layout.spawns.map(p=>p.x+','+p.y)).size,32);
  for(const team of [0,1])assert.ok(layout.spawns.filter(p=>p.team===team).length>=5);
  assert.ok(layout.spawns.some(p=>p.team===undefined));
  for(const p of layout.spawns){assert.ok(p.x>48&&p.y>48&&p.x<world.w-48&&p.y<world.h-48);}
 }
});

test('Blender map parts use independent ground-centered instances fitted to every collision footprint',()=>{
 let placements=0;
 for(const map of maps.list().filter(value=>value.layout))for(const cover of map.layout.cover.filter(value=>value.asset)){
  const dimensions=library.dimensions(cover.asset);assert.ok(dimensions,cover.asset+' not exported');
  const rotated=cover.w<cover.h,w=rotated?cover.h:cover.w,d=rotated?cover.w:cover.h;
  const parent=new THREE.Group(),object=library.addInstances(cover.asset,[{x:cover.x+cover.w/2,y:0,z:cover.y+cover.h/2,rotationY:rotated?Math.PI/2:0,scale:{x:w/dimensions.x,y:Math.min(w/dimensions.x,d/dimensions.z),z:d/dimensions.z}}],parent);
  object.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-cover.w)<.03,cover.asset+' width differs from authoritative solid');assert.ok(Math.abs(size.z-cover.h)<.03,cover.asset+' depth differs from authoritative solid');
  assert.ok(Math.abs(bounds.min.y)<.03,cover.asset+' floats above ground');assert.ok(size.y>15&&size.y<200);
  object.traverse(node=>{if(node.isInstancedMesh){assert.ok(node.userData.assetShared);assert.equal(node.count,1);assert.ok(node.instanceMatrix.array.every(Number.isFinite));node.dispose();}});placements++;
 }
 assert.ok(placements>=25);
});

test('map landmarks keep seated geometry and finite transforms throughout full inspection',async()=>{
 const report=JSON.parse(await fs.readFile(new URL('../assets/25d/map-ecosystem-build-report.json',import.meta.url),'utf8'));
 assert.equal(report.blender,'5.2.2 LTS');assert.equal(report.assets,6);assert.ok(report.triangles<5000);assert.ok(report.glbBytes<250000);
 for(const name of ['foundry_press','foundry_rack','foundry_workbench','relay_mast','relay_generator','relay_barrier']){
  const first=library.cloneModel(name),second=library.cloneModel(name);assert.ok(first&&second);assert.notEqual(first,second);
  const sizes=library.dimensions(name);for(let degree=0;degree<=360;degree+=15){first.rotation.y=degree*Math.PI/180;first.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(first);assert.ok(Math.abs(box.min.y)<.03);assert.ok(Math.abs(box.max.y-sizes.y)<.03);first.traverse(node=>assert.ok(node.matrixWorld.elements.every(Number.isFinite)));}
 }
});

test('both authored maps render the actual engine geometry with efficient GLB placement and working room cutaways',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={createElement(){return {width:512,height:512,getContext(){return new Proxy({},{get:(object,key)=>object[key]||(()=>{}),set:(object,key,value)=>(object[key]=value,true)});}};}};
 try{
  for(const map of maps.list().filter(value=>value.layout)){
   const e=engine({},undefined,{mapId:map.id}),snapshot=e.dev.renderSnapshot(),before=JSON.stringify(snapshot.geometry),worldBefore=JSON.stringify(e.context.SAR.getUniverse()),scene=new THREE.Scene(),env=buildEnvironment(scene,snapshot);
   assert.equal(env.root.name,map.name);assert.equal(env.houses.length,6);assert.equal(env.installAssets(library),env.assetSlots.length);assert.ok(env.assetSlots.some(slot=>slot.name.startsWith(map.theme+'_')));
   let meshes=0,vertices=0;
   env.root.traverse(node=>{assert.equal(node.matrixAutoUpdate,false);assert.equal(node.matrixWorldAutoUpdate,false);assert.ok(node.matrixWorld.elements.every(Number.isFinite));if(node.isMesh){meshes++;vertices+=node.geometry.attributes.position.count;assert.ok(node.geometry.attributes.position.array.every(Number.isFinite));}});
   assert.ok(meshes<600,map.id+' exceeds static draw budget');assert.ok(vertices<200000,map.id+' exceeds vertex budget');
   for(const house of env.houses){
    const occupant={x:house.floor.x+house.floor.w/2,y:house.floor.y+house.floor.h/2,dead:false};
    for(let tick=0;tick<80;tick++)env.update({...snapshot,actors:[occupant]},1/60);
    assert.equal(house.roof.visible,false);assert.ok(house.fadeMaterials.every(m=>m.opacity<.2&&!m.depthWrite));
    for(let tick=0;tick<100;tick++)env.update({...snapshot,actors:[]},1/60);
    assert.equal(house.roof.visible,true);assert.ok(house.roofMats.every(m=>m.opacity>.999));
   }
   assert.equal(JSON.stringify(snapshot.geometry),before);assert.equal(JSON.stringify(e.context.SAR.getUniverse()),worldBefore);
   for(const p of map.layout.spawns)assert.equal(e.dev.collides(p.x,p.y),false,map.id+' has a blocked spawn');
  }
 }finally{globalThis.document=originalDocument;}
});
