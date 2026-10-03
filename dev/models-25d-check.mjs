import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {buildOperator,buildWeapon,WEAPON_VISUALS,animateOperator,setOperatorWeapon,setOperatorPresentation,disposeModel,ensureModelAssets} from '../models-25d.mjs';

// Exercise the shipped Blender attachments as well as the procedural base.
// Node's file adapter is test-only; production continues using local HTTP.
const fetchOriginal=globalThis.fetch,progressOriginal=globalThis.ProgressEvent;
globalThis.ProgressEvent=class extends Event{constructor(type,fields){super(type);Object.assign(this,fields);}};
globalThis.fetch=async(request,options)=>{const url=new URL(typeof request==='string'?request:request.url??request.href);if(url.protocol!=='file:')return fetchOriginal(request,options);const bytes=await fs.readFile(url);return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
try{await ensureModelAssets();}finally{globalThis.fetch=fetchOriginal;globalThis.ProgressEvent=progressOriginal;}

const names=Object.keys(WEAPON_VISUALS);
test('view perspective changes only independent team overlays, leaving shared operator outfits untouched',()=>{
  const first=buildOperator(0,1),second=buildOperator(0,1),palette=JSON.stringify(first.colors);
  const materials=[];first.group.traverse(node=>{if(node.isMesh&&node!==first.ring&&node!==first.spawnRing)materials.push([node,node.material]);});
  assert.equal(first.ring.material,second.ring.material);
  setOperatorPresentation(first,{color:'#f08a87'});
  assert.equal(first.ring.material.color.getHexString(),'f08a87');assert.equal(first.spawnRing.material.color.getHexString(),'f08a87');
  assert.equal(second.ring.material.color.getHexString(),'79c5f3');assert.equal(second.spawnRing.material.color.getHexString(),'79c5f3');
  assert.equal(JSON.stringify(first.colors),palette);for(const [node,material] of materials)assert.equal(node.material,material);
  setOperatorPresentation(first,{color:'#79c5f3'});assert.equal(first.ring.material,second.ring.material);
  disposeModel(first.group);disposeModel(second.group);
});
const actor=(weapon='AR-15',extra={})=>({id:1,x:500,y:600,angle:0,team:0,weapon,hp:250,maxHP:250,vx:0,vy:0,shotId:1,shotAge:99,...extra});
const frame=(entity,value,now=1000,dt=1/60)=>{animateOperator(entity,value,now,dt);entity.group.updateMatrixWorld(true);return entity;};
function finiteTransforms(object){
  object.traverse(value=>{
    for(const component of value.matrixWorld.elements)assert.ok(Number.isFinite(component),value.name+' contains a non-finite transform');
    if(value.isMesh){
      assert.ok(value.geometry.attributes.position.count>0,'empty mesh');
      for(const component of value.geometry.attributes.position.array)assert.ok(Number.isFinite(component),'non-finite model vertex');
    }
  });
}
function meshCount(object){let count=0;object.traverse(value=>{if(value.isMesh)count++;});return count;}

test('all fourteen distinct weapon models have real muzzle apertures, feeds and optimized geometry',()=>{
  assert.equal(names.length,14);assert.ok(names.includes('X-16 Auto'));assert.ok(names.includes('SR-Aug'));
  const signatures=new Set();
  for(const name of names){
    const weapon=buildWeapon(name);weapon.updateMatrixWorld(true);finiteTransforms(weapon);
    assert.ok(weapon.userData.blenderDetails,'missing shipped detail kit: '+name);
    assert.ok(weapon.userData.moving.mag||weapon.userData.moving.shell,'feed missing: '+name);
    assert.ok(weapon.userData.muzzlePosition.x>=34);assert.equal(weapon.userData.muzzlePosition.z,0);
    assert.ok(meshCount(weapon)<=30,name+' has excessive draw calls');
    const bounds=new THREE.Box3().setFromObject(weapon),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x>30&&size.y>10&&size.z>4,name+' is not volumetric');
    signatures.add([name,weapon.userData.spec.class,weapon.userData.muzzleX].join(':'));
    disposeModel(weapon);
  }
  assert.equal(signatures.size,14);
});

test('operator skin palette is respected and both hands meet each weapon grip',()=>{
  for(const name of names){
    const entity=buildOperator(1,3,{body:'#6a5642',vest:'#314b3e',accent:'#aab688',pants:'#556149',skin:'#b89a79',build:1.1});
    frame(entity,actor(name));finiteTransforms(entity.group);
    assert.equal(entity.colors.body,'#6a5642');assert.ok(entity.labelHeight>65);
    assert.ok(meshCount(entity.group)<=80,name+' operator exceeds optimized mesh budget: '+meshCount(entity.group));
    for(const arm of entity.arms){
      assert.ok(arm.start.distanceTo(arm.end)<arm.lengthA+arm.lengthB,name+' hand is outside arm reach');
      assert.ok(arm.glove.position.distanceTo(arm.end)<1e-6,name+' hand detached');
    }
    disposeModel(entity.group);
  }
});

test('walk, sprint and strafe produce articulated feet and smooth stance changes',()=>{
  const entity=buildOperator(0,0);frame(entity,actor());
  const first=entity.legs.map(value=>value.foot.position.clone());
  for(let i=1;i<=45;i++)frame(entity,actor('AR-15',{x:500+i*3,vy:75,vx:180,sprinting:true,visual:{move:1.2,sprint:1,turn:0,lower:.6}}),1000+i*16);
  assert.ok(entity.legs.some((value,i)=>value.foot.position.distanceTo(first[i])>3));
  assert.ok(entity.torso.rotation.z<-.08,'sprint stance did not lean');
  assert.ok(entity.lower.rotation.y<-.1,'directional movement did not turn hips');
  for(let i=0;i<60;i++)frame(entity,actor('AR-15',{x:635,visual:{move:0,turn:0,lower:0}}),2000+i*16);
  assert.ok(entity.animation.moving<.01,'motion did not settle');
  assert.ok(Math.abs(entity.torso.rotation.z)<.01,'sprint lowering did not recover');
  finiteTransforms(entity.group);disposeModel(entity.group);
});

test('aim wraps across pi without spinning the operator and ADS raises the weapon',()=>{
  const entity=buildOperator(0,0);frame(entity,actor('P90',{angle:Math.PI-.01}));
  const yaw=entity.group.rotation.y;
  frame(entity,actor('P90',{angle:-Math.PI+.01,ads:true,adsBlend:1}),1016);
  assert.ok(Math.abs(entity.group.rotation.y-yaw)<.05,'aim took the long rotation across pi');
  for(let i=0;i<45;i++)frame(entity,actor('P90',{angle:-Math.PI+.01,ads:true,adsBlend:1}),1032+i*16);
  assert.ok(entity.gun.userData.body.position.y>36.5);disposeModel(entity.group);
});

test('pump, sniper bolt and pistol slides react to actual firing timestamps',()=>{
  for(const [name,part,age] of [['Pump Shotgun','pump',.45],['LW Tundra','bolt',.5],['9mm','slide',.055],['X16','slide',.055],['X-16 Auto','slide',.055]]){
    const entity=buildOperator(0,0);frame(entity,actor(name));
    const node=entity.gun.userData.moving[part],base=node.position.x;
    frame(entity,actor(name,{shotId:2,shotAge:age,recoil:.7,muzzle:true}),1020);
    assert.ok(node.position.x<base-.8,name+' mechanism did not cycle');
    assert.equal(entity.muzzle.visible,true);assert.ok(entity.gun.userData.body.position.x<0,'weapon did not recoil');
    frame(entity,actor(name,{shotId:2,shotAge:3,recoil:0,muzzle:false}),4000);
    assert.ok(Math.abs(node.position.x-base)<1e-6,name+' mechanism did not return');
    assert.equal(entity.muzzle.visible,false);disposeModel(entity.group);
  }
});

test('magazine reload leaves the grip and returns, with P90 lifting its top feed',()=>{
  for(const name of names){
    const entity=buildOperator(0,0);frame(entity,actor(name));
    const magazine=entity.gun.userData.moving.mag;
    if(!magazine){
      frame(entity,actor(name,{reloading:true,reloadProgress:.28}),1100);
      assert.equal(entity.gun.userData.moving.shell.visible,true,'pump shells were not inserted');
      frame(entity,actor(name,{reloading:false}),1500);assert.equal(entity.gun.userData.moving.shell.visible,false);
      disposeModel(entity.group);continue;
    }
    const rest=magazine.position.clone();
    frame(entity,actor(name,{reloading:true,reloadProgress:.28}),1100);
    if(name==='P90')assert.ok(magazine.position.y>rest.y+8);
    else assert.ok(magazine.position.y<rest.y-10);
    frame(entity,actor(name,{reloading:true,reloadProgress:.44}),1200);assert.equal(magazine.visible,false);
    frame(entity,actor(name,{reloading:true,reloadProgress:.85}),1400);assert.equal(magazine.visible,true);
    frame(entity,actor(name,{reloading:false}),1500);assert.ok(magazine.position.distanceTo(rest)<1e-6);
    finiteTransforms(entity.group);disposeModel(entity.group);
  }
});

test('dash, hit, death and respawn transitions remain visible and grounded',()=>{
  const entity=buildOperator(0,0);frame(entity,actor());
  for(let i=0;i<10;i++)frame(entity,actor('AR-15',{dashing:true,spawn:0}),1100+i*16);
  assert.ok(entity.torso.rotation.z<-.12);
  for(let i=0;i<5;i++)frame(entity,actor('AR-15',{dashing:true,hit:1}),1270+i*16);
  assert.ok(entity.hitRing.material.opacity>.3);assert.ok(entity.torso.position.x<-.5,'hit did not move torso');
  frame(entity,actor('AR-15',{dead:true}),1400);assert.equal(entity.group.visible,true,'death disappears before falling');
  for(let i=0;i<50;i++)frame(entity,actor('AR-15',{dead:true}),1420+i*16);
  assert.ok(entity.pose.rotation.z<-1.3,'operator did not collapse');
  for(let i=0;i<40;i++)frame(entity,actor('AR-15',{dead:true}),2300+i*16);
  assert.equal(entity.group.visible,false);
  frame(entity,actor('AR-15',{x:100,y:120,spawn:1}),3200);
  assert.equal(entity.group.visible,true);assert.ok(Math.abs(entity.pose.rotation.z)<1e-6);assert.ok(entity.spawnRing.visible);
  assert.ok(entity.pose.scale.x<1);assert.deepEqual([entity.group.position.x,entity.group.position.z],[100,120]);
  finiteTransforms(entity.group);disposeModel(entity.group);
});

test('weapon swaps and actor disposal preserve resources shared by surviving actors',()=>{
  const first=buildOperator(0,0),second=buildOperator(0,0);
  frame(first,actor());frame(second,actor());
  const geometry=first.gun.userData.body.children.find(value=>value.isMesh&&value.geometry.userData.sarShared).geometry;
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
  setOperatorWeapon(first,'X-16 Auto');assert.equal(disposed,0);
  assert.equal(first.gunName,'X-16 Auto');assert.equal(first.gunMount.children.length,1);
  disposeModel(first.group);assert.equal(disposed,0);
  frame(second,actor('AR-15',{x:503,vx:180}));finiteTransforms(second.group);
  assert.equal(disposed,0);disposeModel(second.group);
});
