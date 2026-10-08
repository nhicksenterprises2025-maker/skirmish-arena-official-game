import * as THREE from './vendor/three.module.js';
import './team-presentation.js';
import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';
import {loadAssetLibrary} from './asset-loader-25d.mjs';
import {readyCosmetic,attachCosmetic} from './cosmetics-25d.mjs';
export {ensureCosmeticAssets,cosmeticKey,cosmeticDiagnostics} from './cosmetics-25d.mjs';

let detailLibrary;
export function ensureModelAssets(){return loadAssetLibrary().then(library=>(detailLibrary=library));}
function attachDetails(parent,name,part,palette){
  if(!parent)return;
  const detail=detailLibrary?.cloneAttachment(name,part);if(!detail)return;
  const colors=detailLibrary.entries.find(entry=>entry.name===name)?.paletteMaterials;
  detail.traverse(mesh=>{if(!mesh.isMesh)return;mesh.geometry.userData.sarShared=true;
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const tinted=mats.map(source=>{source.userData.sarShared=true;const key=colors?.[source.name];if(!key||!palette)return source;return material(palette[key]);});mesh.material=Array.isArray(mesh.material)?tinted:tinted[0];
  });parent.add(detail);
}

// Presentation assets only. Forward is +X, height is +Y, game Y maps to world Z.
// All dimensions are game pixels. Shared primitive resources survive actor removal.
const geometryCache = new Map(), materialCache = new Map();
const TAU = Math.PI * 2, up = new THREE.Vector3(0, 1, 0);
const temp = {a:new THREE.Vector3(),b:new THREE.Vector3(),d:new THREE.Vector3(),n:new THREE.Vector3(),p:new THREE.Vector3(),q:new THREE.Quaternion()};
const clamp = (n,lo=0,hi=1) => Math.max(lo,Math.min(hi,n));
const smooth = (a,b,k,dt) => a+(b-a)*(1-Math.exp(-k*dt));
const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const smoothAngle = (a,b,k,dt) => a+angleDelta(b,a)*(1-Math.exp(-k*dt));
const sharedGeometry = (key,make) => {
  if(!geometryCache.has(key)){const geometry=make();geometry.userData.sarShared=true;geometryCache.set(key,geometry);}
  return geometryCache.get(key);
};
function material(color,roughness=.84,metalness=.03){
  const key=String(color)+':'+roughness+':'+metalness;
  if(!materialCache.has(key)){
    const value=new THREE.MeshStandardMaterial({color,roughness,metalness});
    value.userData.sarShared=true;materialCache.set(key,value);
  }
  return materialCache.get(key);
}
function roundedBox(w,h,d,r=.8){
  r=Math.min(r,w*.2,h*.2,d*.2);
  return sharedGeometry(['rounded',w,h,d,r].join(':'),()=>{
    const shape=new THREE.Shape();
    shape.moveTo(-w/2+r,-h/2+r);shape.lineTo(w/2-r,-h/2+r);
    shape.lineTo(w/2-r,h/2-r);shape.lineTo(-w/2+r,h/2-r);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-r*2,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:1,steps:1,curveSegments:1});
    geometry.translate(0,0,-d/2+r);return geometry;
  });
}
function sphere(r=1,segments=10,rings=6){return sharedGeometry(['sphere',r,segments,rings].join(':'),()=>new THREE.SphereGeometry(r,segments,rings));}
function cylinder(radius,height,sides=10){return sharedGeometry(['cylinder',radius,height,sides].join(':'),()=>new THREE.CylinderGeometry(radius,radius,height,sides));}
function mesh(parent,geometry,mat,x=0,y=0,z=0){
  const value=new THREE.Mesh(geometry,mat);value.position.set(x,y,z);value.castShadow=true;value.receiveShadow=true;parent.add(value);return value;
}
function box(parent,w,h,d,color,x,y,z,r=.8){return mesh(parent,roundedBox(w,h,d,r),typeof color==='object'?color:material(color),x,y,z);}
function ball(parent,rx,ry,rz,color,x,y,z){const value=mesh(parent,sphere(),material(color),x,y,z);value.scale.set(rx,ry,rz);return value;}
function rod(parent,r,length,color,x,y,z){return mesh(parent,cylinder(r,length),typeof color==='object'?color:material(color,.58,.28),x,y,z);}
function barrel(parent,start,end,radius=2,color=0x26363b,y=0,z=0){const value=rod(parent,radius,end-start,color,(start+end)/2,y,z);value.rotation.z=-Math.PI/2;return value;}
function silhouette(parent,key,points,depth,color,holes=[]){
  const geometry=sharedGeometry('profile:'+key,()=>{
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    for(const [x,y,r] of holes){const hole=new THREE.Path();hole.absarc(x,y,r,0,TAU,true);shape.holes.push(hole);}
    const value=new THREE.ExtrudeGeometry(shape,{depth:depth-1.2,bevelEnabled:true,bevelSize:.6,bevelThickness:.6,bevelSegments:1,steps:1,curveSegments:8});
    value.translate(0,0,-depth/2+.6);return value;
  });
  return mesh(parent,geometry,material(color));
}
function detailing(parent,x,end,y,z=0,rows=1){
  for(let p=x;p<end;p+=7)for(let row=0;row<rows;row++)box(parent,3,1.5,.35,0x132127,p,y-row*3,z,.25);
}
function rail(parent,start,end,y,width=5){
  box(parent,end-start,1.3,width,0x46545a,(start+end)/2,y,0,.25);
  // Broad grooves remain readable at the normal tactical camera distance.
  for(let p=start+2;p<end-1;p+=5)box(parent,1.2,.6,width+.2,0x1b272c,p,y+.8,0,.15);
}
function optic(parent,x,length=17,y=10,frontMount=x+length-4){
  box(parent,length,5.8,7.4,0x22333a,x+length/2,y,0,1.25);
  box(parent,4,3,5,0x1c2a30,x+4,y-4,0,.4);box(parent,4,3,5,0x1c2a30,frontMount,y-4,0,.4);
  const lens=mesh(parent,cylinder(2.3,.5,10),material(0x72a7aa,.22,.48),x+length+.2,y,0);lens.rotation.z=Math.PI/2;
  box(parent,3,2,4,0x4d6667,x+length*.5,y+3.6,0,.4);
}
function stock(parent,start,end,color=0x45564c,height=10){
  silhouette(parent,'stock:'+start+':'+end+':'+height,[
    [start,4],[end,2],[end,-3],[start+3,-height/2-2],[start,-height/2-2]
  ],8,color);
  box(parent,3,height+3,10,0x19292c,start-1,-1,0,.7);
  box(parent,end-start-5,1,5,0x6f7b68,(start+end)/2,2.3,0,.2);
}
function grip(parent,x,height=15,color=0x354740,width=7){
  const value=new THREE.Group();value.position.set(x,-5,0);value.rotation.z=-.12;parent.add(value);
  box(value,width,height,7,color,0,-height/2,0,1);
  for(let y=-3;y>-height;y-=6)box(value,width+.2,.8,7.2,0x22322e,0,y,0,.2);
  return value;
}
function triggerGuard(parent,x,width=11){
  const guard=mesh(parent,sharedGeometry('guard',()=>new THREE.TorusGeometry(4.5,.65,4,12,Math.PI*1.7)),material(0x1b2b2f),x,-7.2,0);
  guard.rotation.z=Math.PI*.65;guard.scale.set(width/9,1,1);
  box(parent,1.2,3.3,1.4,0x7b8980,x,-7,0,.25);
}
function magazine(parent,x,height=14,width=9,color=0x394b47){
  const group=new THREE.Group();group.position.set(x,-5,0);parent.add(group);
  box(group,width,height,7.5,color,0,-height/2,0,.8);
  for(let p=-width/2+2;p<width/2;p+=3)box(group,.6,height-3,.3,0x1f302c,p,-height/2,3.9,.1);
  box(group,width+1,2,8.5,0x24362f,0,-height,0,.4);return group;
}
function pin(parent,x,y,z=5){const value=rod(parent,.75,.4,0x93a098,x,y,z);value.rotation.x=Math.PI/2;}

// Batch the many small machining / uniform details by material. Articulation and
// weapon mechanisms stay independent, while fixed details cost one draw per finish.
function batchStatic(parent,key,excluded=new Set()){
  parent.updateWorldMatrix(true,true);
  const inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert(),byMaterial=new Map();
  parent.traverse(value=>{
    if(!value.isMesh||Array.isArray(value.material))return;
    for(let cursor=value;cursor&&cursor!==parent;cursor=cursor.parent)if(excluded.has(cursor))return;
    if(!byMaterial.has(value.material))byMaterial.set(value.material,[]);
    byMaterial.get(value.material).push(value);
  });
  for(const [finish,values] of byMaterial){
    if(values.length<2)continue;
    const geometry=sharedGeometry('batch:'+key+':'+finish.uuid,()=>{
      const transformed=values.map(value=>{
        const source=value.geometry.index?value.geometry.toNonIndexed():value.geometry.clone();
        source.clearGroups();source.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,value.matrixWorld));return source;
      });
      const merged=mergeGeometries(transformed,false);transformed.forEach(value=>value.dispose());return merged;
    });
    for(const value of values)value.removeFromParent();
    const combined=mesh(parent,geometry,finish);combined.name='batched:'+key;
  }
}

export const WEAPON_VISUALS=Object.freeze({
  'AR-15':{class:'rifle',muzzle:62,recoil:4.2,cycle:.30,support:30,rear:5},
  AK47:{class:'rifle',muzzle:62,recoil:5.3,cycle:.35,support:29,rear:4},
  FAL:{class:'rifle',muzzle:76,recoil:5.8,cycle:.26,support:29,rear:4},
  'SMG-9':{class:'smg',muzzle:48,recoil:2.5,cycle:.17,support:26,rear:5},
  'SPAS-12':{class:'shotgun',muzzle:69,recoil:7,cycle:1,support:30,rear:4},
  'Pump Shotgun':{class:'pump',muzzle:72,recoil:8.2,cycle:1.5,support:31,rear:3},
  'Auto 12':{class:'shotgun',muzzle:66,recoil:6.1,cycle:.51,support:30,rear:4},
  'LR-762':{class:'marksman',muzzle:75,recoil:5.3,cycle:.77,support:31,rear:4},
  'LW Tundra':{class:'sniper',muzzle:84,recoil:9.1,cycle:1.4,support:31,rear:4},
  'War Head LMG':{class:'lmg',muzzle:77,recoil:7.2,cycle:.42,support:31,rear:4},
  P90:{class:'smg',muzzle:58,recoil:2.7,cycle:.23,support:29,rear:9},
  '9mm':{class:'pistol',muzzle:38,recoil:4,cycle:.27,support:10,rear:10},
  X16:{class:'pistol',muzzle:34,recoil:3,cycle:.19,support:9,rear:9},
  'SR-Aug':{class:'burst-rifle',muzzle:62,recoil:3.8,cycle:.70,support:30,rear:5},
  'X-16 Auto':{class:'auto-pistol',muzzle:42,recoil:3.3,cycle:.19,support:10,rear:10}
});

// Meshes follow the established Canvas silhouettes, with actual volumetric feeds,
// stocks and optics. Moving mechanisms are separate nodes used by the pose rig.
export function buildWeapon(name){
  const spec=WEAPON_VISUALS[name]||WEAPON_VISUALS['AR-15'];
  const group=new THREE.Group(),body=new THREE.Group();group.name='weapon:'+name;body.position.y=35;group.add(body);
  const steel=0x35474e,edge=0x17272d,polymer=0x43594f;
  let mag=null,pump=null,bolt=null,slide=null,shell=null;
  if(spec.class.includes('pistol')){
    const compact=name==='X16',auto=name==='X-16 Auto',end=compact?30:auto?35:34;
    silhouette(body,'frame:'+name,[[1,0],[end-3,0],[end-3,-4],[19,-5],[16,-18],[6,-17],[8,-3]],7,compact?0x293940:auto?0x43564e:0x50635a);
    grip(body,11,compact?12:auto?17:14,compact?0x293a40:polymer,compact?7.5:9);
    triggerGuard(body,21,compact?9:11);
    slide=new THREE.Group();body.add(slide);
    box(slide,end,compact?8:9.5,compact?7.5:8.5,compact?0x3d4c56:auto?0x64726e:0x75817c,end/2,3,0,1);
    for(const z of [-1,1]){
      detailing(slide,3,12,4,z*(compact?3.9:4.4));
      box(slide,7,2.5,.4,edge,22,4,z*(compact?3.85:4.35),.2);
    }
    const sightY=compact?7.5:8.2;
    box(slide,2,2,3,edge,3,sightY,0,.35);box(slide,2,2,2.5,edge,end-3,sightY,0,.3);
    barrel(body,end-2,spec.muzzle-2,2,edge,3);
    box(body,3,5.7,6,edge,spec.muzzle-2,3,0,.4);
    if(auto){
      box(body,8,6,8.5,edge,38,3,0,.5);
      detailing(body,36,42,4,4.4);box(body,8,3,5,0x2b4140,28,-4.2,0,.5);
      box(body,1,1,3,0xa6c7b4,32,-4.2,0,.2);
    }
    mag=magazine(body,11,auto?18:8,5.5,0x263936);mag.position.y=-15;
    pin(body,11,-2,3.6);pin(body,19,-2,3.6);
  }else if(name==='P90'){
    silhouette(body,'p90-body',[[-20,5],[-11,9],[27,8],[40,3],[40,-5],[32,-11],[21,-11],[17,-17],[5,-16],[-1,-9],[-17,-8]],10,0x4c6561,[[10,-8,3.6],[28,-5.7,2.4]]);
    box(body,8,12,11,0x29453f,-16,-1,0,2);
    box(body,19,1.8,10.7,0x769080,-3,4,0,.4);
    barrel(body,38,56,2,edge);box(body,3,6,6,edge,56.5,0,0,.5);
    mag=new THREE.Group();mag.position.set(10,10.1,0);body.add(mag);
    box(mag,42,4.5,8.5,0x8f9981,0,0,0,1.1);
    box(mag,35,2,6.8,0xb5b89b,0,1.8,0,.45);
    for(let x=-15;x<17;x+=4)box(mag,2.2,.8,5,0xb49b60,x,3,0,.2);
    // The sight tower seats on the forward receiver, clear of the removable top feed.
    box(body,8,6,7,steel,36,5.5,0,.65);rail(body,34,49,8);optic(body,34,15,14);pin(body,-3,-1,5.1);pin(body,34,-1,5.1);
  }else if(name==='SR-Aug'){
    silhouette(body,'aug-bullpup',[[-24,6],[-4,7],[13,3],[39,3],[40,-4],[16,-6],[12,-19],[5,-19],[3,-6],[-23,-9]],10,0x6d7959,[[17,-8,4]]);
    box(body,8,15,11,edge,-22,-1,0,1);barrel(body,39,60,2,edge);box(body,3,6,6,steel,61,0,0,.5);
    mag=magazine(body,-8,18,7,0x394638);grip(body,11,17,0x46543f);triggerGuard(body,21);
    // Cast carry-handle legs connect the existing optic bridge to the bullpup receiver.
    box(body,4,5.5,6,steel,1,6,0,.5);box(body,4,6,6,steel,26,5.5,0,.5);
    optic(body,12,18,13);box(body,32,2,8,steel,12,9,0,.4);detailing(body,25,39,4,5);pin(body,-11,1);pin(body,32,0);
  }else if(name==='AK47'){
    stock(body,-25,-5,0x9c683e,12);
    box(body,34,11,9,steel,12,0,0,1.1);box(body,22,9,10,0x9b613e,38,0,0,1);
    box(body,21,1.5,7,0xb18050,38,5,0,.4);barrel(body,47,60,2.1,edge);
    box(body,3,7,6,edge,61,0,0,.5);grip(body,7,15,0x865331);triggerGuard(body,18);
    mag=new THREE.Group();body.add(mag);
    silhouette(mag,'ak-mag',[[22,-5],[30,-5],[31,-12],[34,-19],[40,-26],[33,-29],[26,-22],[23,-14]],7,0x344747);
    // Stamped ribs follow the curved feed body and seat into its side surface.
    // Keep them on this articulated magazine, including during removal/return.
    const ribPath=[[24,-8],[25,-14],[28,-21],[32,-26]];
    for(let t=0;t<3;t++)for(let i=1;i<ribPath.length;i++){
      const [ax,ay]=ribPath[i-1],[bx,by]=ribPath[i],dx=bx-ax,dy=by-ay;
      const rib=box(mag,.75,Math.hypot(dx,dy)+.3,.38,0x1e302f,(ax+bx)/2+t*2.7,(ay+by)/2,3.55,.08);
      rib.rotation.z=Math.atan2(-dx,dy);
    }
    box(body,27,2,7,0x546259,12,6,0,.35);
    bolt=box(body,8,1.7,2,0x89978c,17,2,5,.4);pin(body,2,-1,4.6);pin(body,27,-1,4.6);
    box(body,2,7,3,edge,52,4,0,.3);
  }else if(name==='FAL'){
    // Fixed-stock battle-rifle proportions, a straight box feed and iron sights.
    // Each sight/gas fitting intersects its receiver or barrel support.
    silhouette(body,'fal-stock',[[-32,4],[-8,3],[-5,1],[-5,-3],[-27,-10],[-32,-10]],8,0x43554b);
    box(body,3,16,10,edge,-32,-3,0,.7);
    box(body,34,10.5,9.5,steel,11,0,0,1);
    box(body,29,2.5,8.6,0x53615e,10.5,5,0,.5);
    grip(body,4,15,0x3a4d43);triggerGuard(body,16,12);
    mag=magazine(body,23,19,10,0x3b4a48);
    silhouette(body,'fal-handguard',[[27,4.5],[51,3],[53,0],[51,-4],[27,-5]],9.2,0x4d6151);
    barrel(body,50,73.5,1.85,edge);
    barrel(body,29,58,1.15,0x5b6c65,4.2);
    const regulator=rod(body,2.1,4,0x6d7c72,54,4.2,0);regulator.rotation.z=-Math.PI/2;
    box(body,4,8,5,steel,58,3.3,0,.5);
    box(body,3,5.5,2.8,edge,58,8.1,0,.3);
    box(body,4.5,3.5,6,steel,-.5,7.1,0,.45);
    barrel(body,72.5,76,2.65,edge);
    for(const side of [-1,1])for(const x of [73.5,75])box(body,.8,2.2,.35,0x708078,x,0,side*2.6,.1);
    bolt=new THREE.Group();bolt.position.set(16,2,4.75);body.add(bolt);
    box(bolt,9,2.6,.7,0x7f9087,0,0,.25,.3);
    for(const side of [-1,1])pin(body,25,-1,side*4.85);
  }else if(name==='SPAS-12'){
    box(body,4,7,7,0x425550,-2,6,0,.6);pin(body,-2,6,3.6);
    box(body,43,3,9,0x74817a,-4,10,0,.6);box(body,3,19,9,0x425550,-24,2,0,.6);
    box(body,31,12,10,0x43565a,10,0,0,1.2);grip(body,4,17,polymer);triggerGuard(body,16);
    barrel(body,24,67,2,edge,2);barrel(body,24,61,2,0x617268,-3);
    box(body,28,10,11,0x4e6258,40,1,0,1);detailing(body,29,52,4,5.6,1);
    box(body,3,6,6,edge,67.5,2,0,.5);pin(body,0,0);pin(body,21,0);
    shell=new THREE.Group();shell.position.set(13,-8,6);body.add(shell);
    barrel(shell,-3,4,1.7,0xab583b);barrel(shell,-4,-2,1.8,0xc0a56c);
  }else if(name==='Pump Shotgun'){
    stock(body,-26,-3,0x5e6d54,11);box(body,27,9,9,0x4b595e,8,0,0,1.1);
    grip(body,2,10,polymer);triggerGuard(body,12);
    barrel(body,20,70,2,0x30444b,2);barrel(body,20,65,1.9,0x65736b,-3.2);
    pump=new THREE.Group();pump.position.x=37;body.add(pump);
    box(pump,24,9,11,0x697361,0,-2,0,1.3);
    for(let x=-9;x<=9;x+=3.5)box(pump,1,9.2,11.2,0x374a3d,x,-2,0,.15);
    box(body,2,3,2,0x5e6c5a,65,5,0,.2);box(body,3,6,6,edge,70.5,2,0,.4);
    box(body,9,3,.5,edge,11,0,4.7,.5);pin(body,0,0,4.6);pin(body,20,0,4.6);
    shell=new THREE.Group();shell.position.set(10,-8,6);body.add(shell);
    barrel(shell,-3,4,1.7,0xad5739);barrel(shell,-4,-2,1.8,0xc1a46b);
  }else if(name==='Auto 12'){
    stock(body,-22,-3,0x526961,13);box(body,36,15,11,0x4b6068,13,0,0,1.5);
    grip(body,5,16,polymer);triggerGuard(body,17);
    box(body,22,11,10,0x364d55,40,0,0,1);detailing(body,31,50,3,5.3,1);
    rail(body,0,50,7.3);optic(body,6,16,13.3);barrel(body,49,64,2.5,edge);box(body,3,7,7,edge,64.5,0,0,.6);
    mag=new THREE.Group();mag.position.set(23,-12,0);body.add(mag);
    const drum=rod(mag,10.5,8,0x2f4445,0,-3,0);drum.rotation.x=Math.PI/2;
    const rim=rod(mag,8.1,8.4,0x5a7266,0,-3,0);rim.rotation.x=Math.PI/2;
    const hub=rod(mag,5.8,8.8,0x2c4142,0,-3,0);hub.rotation.x=Math.PI/2;
    pin(body,3,0,5.6);pin(body,28,0,5.6);bolt=box(body,9,2,2,0x8a9b98,17,2,6,.4);
  }else if(name==='LW Tundra'){
    silhouette(body,'tundra-stock',[[-30,5],[-6,4],[17,1],[40,1],[40,-4],[13,-5],[7,-16],[-3,-14],[-1,-5],[-26,-8]],8,0x7b9690);
    box(body,3,16,10,edge,-30,-1,0,.7);box(body,13,3,9,0x536e63,-20,5.1,0,.6);
    box(body,37,8,9,0x7b8f92,15,1,0,1.1);barrel(body,33,81,2,0x3d535a);box(body,3.5,6,6,edge,82,0,0,.4);
    rail(body,-2,31,4.8);optic(body,0,38,10.8,27);mag=magazine(body,23,9,9,0x3c5350);
    bolt=new THREE.Group();bolt.position.set(15,1,5.1);body.add(bolt);
    box(bolt,12,2,2,0xaeb8ad,0,0,0,.4);const handle=rod(bolt,.8,7,edge,3,-3,1);handle.rotation.z=.35;ball(bolt,1.7,1.7,1.7,edge,4,-6,1);
    triggerGuard(body,9);pin(body,-4,0,4.1);pin(body,31,0,4.6);
  }else if(name==='War Head LMG'){
    stock(body,-29,-6,0x817954,14);box(body,41,16,12,0x57644d,14,0,0,1.3);
    grip(body,5,16,polymer);triggerGuard(body,17);box(body,23,12,11,0x687256,45,0,0,1.1);
    detailing(body,35,55,3,5.8,1);rail(body,-1,55,7.8);optic(body,4,16,13.8);
    barrel(body,54,75,2.6,0x354940);box(body,3,8,8,0x243932,75.5,0,0,.5);
    mag=new THREE.Group();mag.position.set(24,-14,0);body.add(mag);
    box(mag,22,17,13,0x4c5d40,0,0,0,1);box(mag,17,12,1,0x7e8659,0,0,7,.5);
    for(let x=13;x<33;x+=3.5)box(body,2,4.2,3.5,0xc7ad66,x,-6,6.5,.4);
    const bipod=new THREE.Group();bipod.position.set(61,-3,0);body.add(bipod);
    for(const side of [-1,1]){const leg=rod(bipod,.9,17,0x2c4135,3,-6,side*4);leg.rotation.x=side*.42;leg.rotation.z=.35;}
    bolt=box(body,12,2,2,0x263936,17,4,6.5,.4);pin(body,1,1,6.1);pin(body,31,1,6.1);
  }else{
    const ar=name==='AR-15',smg=name==='SMG-9';
    if(smg){
      for(const z of [-3,3])barrel(body,-17,-2,.9,0x748781,0,z);
      box(body,3,13,10,0x2e4540,-18,0,0,.6);box(body,33,11,10,0x4d6267,13,0,0,1.4);
      box(body,10,9,9,0x344c53,35,0,0,.9);detailing(body,32,39,1,4.8);
      grip(body,7,13,polymer);triggerGuard(body,17,10);mag=magazine(body,24,18,6,0x3e554e);
      rail(body,0,39,5.3);optic(body,12,12,11.3);barrel(body,39,46,2,edge);box(body,3,6,6,edge,47,0,0,.5);
    }else{
      stock(body,ar?-24:-27,-5,ar?0x43554b:0x657751,12);
      barrel(body,-14,-4,1.5,0x738277);box(body,32,11,10,ar?0x42575a:0x61765a,11,0,0,1.1);
      grip(body,4,15,ar?polymer:0x485d3f);triggerGuard(body,16);
      mag=magazine(body,23,15,ar?10:11,ar?0x354a48:0x42553f);
      const end=ar?48:54;box(body,end-27,10,10,ar?0x41565d:0x66775b,(27+end)/2,0,0,1);
      detailing(body,30,end-1,2,5.3,1);rail(body,-1,end,5.3);
      optic(body,ar?5:4,ar?17:27,11.3);barrel(body,end,spec.muzzle-2,2,edge);box(body,3,6,6,edge,spec.muzzle-1.5,0,0,.4);
    }
    bolt=box(body,9,1.8,2,0x83948d,16,1,5.5,.3);pin(body,2,-1,5.1);pin(body,26,-1,5.1);
  }
  // The aperture stays dark even under the warm key light.
  const aperture=mesh(body,cylinder(spec.class.includes('pistol')?1.1:1.55,.5,8),material(0x0d1c21),spec.muzzle+.1,spec.class.includes('pistol')?3:name==='Pump Shotgun'?2:0,0);aperture.rotation.z=Math.PI/2;
  const flash=mesh(body,sharedGeometry('flash',()=>new THREE.ConeGeometry(4.5,15,5)),new THREE.MeshBasicMaterial({color:0xffe8a7,transparent:true,opacity:.94,depthWrite:false}),spec.muzzle+7,spec.class.includes('pistol')?3:name==='Pump Shotgun'?2:0,0);
  flash.rotation.z=-Math.PI/2;flash.castShadow=false;flash.visible=false;
  const moving={mag,pump,bolt,slide,shell};
  for(const value of Object.values(moving))if(value)value.userData.restPosition=value.position.clone();
  if(shell)shell.visible=false;
  group.userData={...group.userData,spec,name,body,moving,flash,muzzleX:spec.muzzle,muzzlePosition:new THREE.Vector3(spec.muzzle,35+aperture.position.y,0),
    grips:{rear:new THREE.Vector3(spec.rear,29,4),support:new THREE.Vector3(spec.support,34,-3)}};
  if(name==='FAL')group.userData.handling={mag:new THREE.Vector3(0,-4,-3.8),charge:new THREE.Vector3(4,1.7,-5.5)};
  const add=()=>{if(group.userData.disposed)return;const entry=detailLibrary.entries.find(entry=>entry.weapon===name);if(!entry)return;for(const part of Object.keys(entry.attachments))attachDetails(part==='body'?body:moving[part],entry.name,part);group.userData.blenderDetails=entry.name;};
  if(detailLibrary)add();else ensureModelAssets().then(add).catch(error=>console.warn('Weapon details:',error.message));
  const dynamic=new Set([flash,...Object.values(moving).filter(Boolean)]);
  batchStatic(body,'weapon:'+name,dynamic);
  for(const [part,value] of Object.entries(moving))if(value?.isGroup)batchStatic(value,'weapon:'+name+':'+part);
  return group;
}

const defaultSkins=[
  {body:0x3e5550,vest:0x293c36,accent:0x8eaa82,pants:0x4e5c49,skin:0xbfa486},
  {body:0x626d4e,vest:0x414d38,accent:0xb2b484,pants:0x606649,skin:0xc6a485},
  {body:0x55616b,vest:0x36434d,accent:0x8eabb3,pants:0x414e55,skin:0xb99375},
  {body:0x766452,vest:0x554738,accent:0xc6ae81,pants:0x6b6050,skin:0xc1a086}
];
function segment(parent,radius,length,color){return rod(parent,radius,length,material(color),0,0,0);}
function joint(parent,rx,ry,rz,color){return ball(parent,rx,ry,rz,color,0,0,0);}
function fittedFaceCover(parent,color){
  // A continuous cheek-to-chin wrap replaces the old rectangular mouth block.
  // This is only the visible cloth surface; physical head regions stay in game.js.
  const geometry=sharedGeometry('operator-fitted-face-cover',()=>{
    const positions=[],indices=[],rings=[[47.8,10.4,3.8,5.7],[49.6,11.6,3.8,7.8],[52,10.9,3.8,9.0]];
    for(const[y,front,back,width]of rings)for(const[x,z]of[[front,0],[front-1.15,width*.65],[front-3.4,width],[back,width*.85],[back,-width*.85],[front-3.4,-width],[front-1.15,-width*.65]])positions.push(x,y,z);
    const count=7;
    for(let row=0;row<rings.length-1;row++)for(let i=0;i<count;i++){const a=row*count+i,b=row*count+(i+1)%count,c=b+count,d=a+count;indices.push(a,d,b,b,d,c);}
    for(let i=1;i<count-1;i++){indices.push(0,i,i+1);const top=(rings.length-1)*count;indices.push(top,top+i+1,top+i);}
    const value=new THREE.BufferGeometry(),uv=[];for(let i=0;i<positions.length;i+=3)uv.push((positions[i+2]+9)/18,(positions[i+1]-47.8)/4.2);
    value.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));value.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));value.setIndex(indices);value.computeVertexNormals();return value;
  });
  return mesh(parent,geometry,material(color));
}
function twoBone(parent,start,lengthA,lengthB,width,colorA,colorB){
  const upper=segment(parent,width,lengthA,colorA),lower=segment(parent,width*.85,lengthB,colorB),knee=joint(parent,width*1.13,width*.9,width*1.13,colorB);
  return {start:new THREE.Vector3(...start),lengthA,lengthB,upper,lower,knee,end:new THREE.Vector3(),bend:new THREE.Vector3(1,0,0)};
}
function alignSegment(node,from,to){
  temp.d.subVectors(to,from);const length=temp.d.length();node.position.copy(from).add(to).multiplyScalar(.5);
  if(length>.0001)node.quaternion.setFromUnitVectors(up,temp.d.multiplyScalar(1/length));
}
function poseLimb(limb,end,bend){
  temp.d.subVectors(end,limb.start);const length=clamp(temp.d.length(),.01,limb.lengthA+limb.lengthB-.02);temp.d.normalize();
  const along=(limb.lengthA*limb.lengthA-limb.lengthB*limb.lengthB+length*length)/(2*length);
  const rise=Math.sqrt(Math.max(0,limb.lengthA*limb.lengthA-along*along));
  temp.n.copy(bend).addScaledVector(temp.d,-bend.dot(temp.d));
  if(temp.n.lengthSq()<.001)temp.n.set(0,0,1);temp.n.normalize();
  temp.p.copy(limb.start).addScaledVector(temp.d,along).addScaledVector(temp.n,rise);
  temp.q.set(0,0,0,1);limb.knee.position.copy(temp.p);alignSegment(limb.upper,limb.start,temp.p);alignSegment(limb.lower,temp.p,end);limb.end.copy(end);
}
export function buildOperator(team=0,skin=0,palette=null,cosmetic=null){
  const appearance=readyCosmetic(cosmetic);
  const colors={...defaultSkins[Math.abs(skin)%defaultSkins.length],...(palette||{}),...(appearance?.palette||{})};
  const teamColor=globalThis.SARTeamPresentation.COLORS[team===0?'blue':'red'],group=new THREE.Group(),pose=new THREE.Group(),lower=new THREE.Group(),torso=new THREE.Group();
  group.name='tactical-operator';group.add(pose);pose.add(lower,torso);
  const shadow=mesh(group,sharedGeometry('operator-shadow',()=>new THREE.CircleGeometry(27,24)),sharedShadow(),0,.5,0);shadow.rotation.x=-Math.PI/2;shadow.scale.set(1,.78,1);shadow.castShadow=false;shadow.receiveShadow=false;
  const ring=mesh(group,sharedGeometry('operator-team-ring',()=>new THREE.RingGeometry(27.5,28.8,32)),sharedBasic(teamColor),0,1,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
  const pelvis=box(lower,17,9,25,colors.pants,-2,23,0,2);
  box(lower,19,3,27,0x24362e,-2,27,0,.6);box(lower,3,3.5,7,0x98a48d,8,27,0,.5);
  const legs=[];
  for(const side of [-1,1]){
    const limb=twoBone(lower,[-2,24,side*8.5],12,12,4.6,colors.pants,colors.pants);
    const kneePlate=box(lower,3.5,6.5,8,colors.vest,0,13,side*8.5,1.1);
    const foot=box(lower,12,5.5,8,0x23342e,2,3,side*8.5,1.4);
    box(foot,8,.7,6,0x566957,0,2.6,0,.3);
    legs.push({...limb,foot,kneePlate,side});
  }
  let helmet;
  if(!appearance){
  // Rounded shoulders and separate rig/backpack preserve the Canvas operator shape.
  const build=clamp(Number(colors.build)||1,.8,1.25);
  box(torso,19,23,27*build,colors.body,-1,38,0,3);
  box(torso,7,22,25,colors.vest,-13,37,0,1.8);
  box(torso,4.5,20,24,colors.vest,10.5,37,0,1.6);
  for(const z of [-6.5,6.5]){
    box(torso,5,9,6.6,colors.body,14,32,z,.8);box(torso,5.4,2,7,colors.vest,14.5,37,z,.4);
  }
  for(const side of [-1,1]){
    box(torso,9,3,4.5,0x1d302b,0,48,side*10.5,.8);
    box(torso,7,11,4,colors.vest,-2,34,side*15,.9);
  }
  box(torso,1.2,4.5,11,0xc6baa0,13,43,0,.3);
  ball(torso,5.9,4.7,7.1,colors.skin,2,48,0);
  ball(torso,9.2,8,10.2,colors.skin,.4,54.8,0);
  fittedFaceCover(torso,colors.vest);
  helmet=ball(torso,12,8,13,colors.body,-1,58,0);
  const helmetRim=mesh(torso,cylinder(12.1,2.8,14),material(colors.vest),-1,54,0);helmetRim.scale.z=1.06;
  box(torso,2.8,6.2,19.2,0x1c353a,10.8,55.5,0,1.2);
  for(const side of [-1,1]){
    const lens=box(torso,.65,3.8,7.5,material(0x6f999c,.25,.3),12.35,55.7,side*4.8,.55);
    lens.rotation.y=-side*.055;
  }
  box(torso,.85,2.5,2.1,0x1c353a,12.25,55.1,0,.4);
  box(torso,.55,.65,14,0xb3cbc2,12.72,57.25,0,.2);
  for(const side of [-1,1])box(torso,7,9,4,0x253d33,-2,53,side*13.8,1.5);
  // Small silhouette cues distinguish the existing kit families without changing
  // the common rig, operator height or palette/team identification.
  const kit=Math.abs(skin)%4;
  if(kit===0){
    box(torso,3.2,8,6.4,colors.vest,-9,44,-14,.7);
    box(torso,2.2,2.2,4.8,colors.accent,-9,49,-14,.45);
    const radioAntenna=rod(torso,.35,10,0x263b31,-9,53,-14);radioAntenna.rotation.z=-.12;
  }else if(kit===1){
    for(const z of [-7,0,7])box(torso,3.5,5.5,4.8,colors.vest,-17.9,27,z,.65);
    box(torso,3.7,1.3,20,colors.accent,-18,29.5,0,.3);
  }else if(kit===2){
    for(const side of [-1,1]){const strap=box(torso,1.4,18,1.1,colors.accent,-17.2,39,side*7,.25);strap.rotation.z=side*.18;}
    box(torso,3.5,4,6,colors.vest,11.8,61.5,0,.65);
  }else{
    box(torso,12,4.3,20,colors.body,1,48,0,1.25);
    for(const z of [-7,0,7])box(torso,1.2,4.6,1,colors.accent,7.2,46,z,.2);
  }
  }
  const gunMount=new THREE.Group();gunMount.position.set(14,0,0);torso.add(gunMount);
  const arms=[];
  for(const side of [-1,1]){
    const limb=twoBone(torso,[4,43,side*17],21,24,4.4,colors.body,colors.body);
    limb.bend.set(-.6,-.8,side*.7);
    const glove=box(torso,6,5.5,6,0x263b31,23,34,side*4,1.3);
    const cuff=box(torso,3,5,6.5,colors.vest,20,34,side*4,.65);
    const shoulder=ball(torso,5,6,5,colors.body,4,43,side*17);
    arms.push({...limb,glove,cuff,shoulder,side});
  }
  const hitMaterial=new THREE.MeshBasicMaterial({color:0xffd7a6,transparent:true,opacity:0,depthWrite:false});
  const hitRing=mesh(group,sharedGeometry('operator-hit-ring',()=>new THREE.RingGeometry(29,31,28)),hitMaterial,0,2,0);hitRing.rotation.x=-Math.PI/2;hitRing.castShadow=false;
  const spawnMaterial=new THREE.MeshBasicMaterial({color:teamColor,transparent:true,opacity:0,depthWrite:false});
  const spawnRing=mesh(group,sharedGeometry('operator-spawn-ring',()=>new THREE.RingGeometry(30,31.5,36)),spawnMaterial,0,2.2,0);spawnRing.rotation.x=-Math.PI/2;spawnRing.castShadow=false;
  const bodyKey='operator:'+skin+':'+JSON.stringify(colors)+(appearance?':cosmetic:'+cosmetic.id+':'+(cosmetic.styleId||'main'):'');
  const moving=new Set([gunMount,...arms.flatMap(arm=>[arm.upper,arm.lower,arm.knee,arm.glove,arm.cuff])]);
  batchStatic(torso,bodyKey,moving);
  for(const leg of legs)batchStatic(leg.foot,'operator:foot');
  const add=()=>{if(group.userData.disposed)return;if(!appearance)attachDetails(torso,'operator-detail','torso',colors);attachDetails(lower,'operator-detail','pelvis',colors);for(const leg of legs)attachDetails(leg.foot,'operator-detail','foot',colors);for(const arm of arms)attachDetails(arm.cuff,'operator-detail','cuff',colors);if(!appearance)batchStatic(torso,bodyKey+':fieldcraft',moving);group.userData.blenderDetails='operator-detail';};
  if(detailLibrary)add();else ensureModelAssets().then(add).catch(error=>console.warn('Operator details:',error.message));
  const entity={group,pose,lower,torso,pelvis,helmet,legs,arms,gunMount,gunName:null,gun:null,muzzle:null,shadow,ring,hitRing,spawnRing,
    state:{initialized:false,yaw:0,phase:0,move:0,sprint:0,ads:0,dash:0,hit:0,dead:0,lastDead:false,spawn:1,lastX:0,lastY:0,lastShot:null,shotAge:99,recoil:0,reload:0},colors};
  if(appearance)attachCosmetic(entity,cosmetic);
  return entity;
}
function sideLens(side){return side*5;}
export function setOperatorPresentation(entity,presentation){
  if(!presentation||entity.presentationColor===presentation.color)return;
  entity.presentationColor=presentation.color;
  // Ring materials are shared. Swap the cached overlay material rather than
  // mutating it (which would recolor every operator sharing the old material).
  entity.ring.material=sharedBasic(presentation.color);
  entity.spawnRing.material.color.set(presentation.color);
}
function sharedBasic(color){
  const key='basic:'+color;
  if(!materialCache.has(key)){const value=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false});value.userData.sarShared=true;materialCache.set(key,value);}
  return materialCache.get(key);
}
function sharedShadow(){
  const key='shadow';
  if(!materialCache.has(key)){const value=new THREE.MeshBasicMaterial({color:0x20382c,transparent:true,opacity:.21,depthWrite:false});value.userData.sarShared=true;materialCache.set(key,value);}
  return materialCache.get(key);
}
export function setOperatorWeapon(entity,name){
  if(entity.gunName===name&&entity.gun)return entity.gun;
  if(entity.gun){entity.gunMount.remove(entity.gun);disposeModel(entity.gun);}
  entity.gun=buildWeapon(name);entity.gunName=name;entity.gunMount.add(entity.gun);entity.muzzle=entity.gun.userData.flash;
  entity.state.shotAge=99;entity.state.lastShot=null;entity.state.recoil=0;return entity.gun;
}
function magazineOffset(progress){
  if(progress<.13||progress>.92)return 0;
  if(progress<.31)return (progress-.13)/.18;
  if(progress<.59)return 1;
  if(progress<.83)return 1-(progress-.59)/.24;
  return 0;
}

// now is in milliseconds and dt in seconds, matching game.js snapshots.
// Animation consumes observed simulation events; it never changes weapons/HP/pathing.
export function poseUnarmedShowcase(entity,{lobbyIdle=false}={}){
  entity.gunMount.visible=false;entity.ring.visible=false;entity.hitRing.visible=false;entity.spawnRing.visible=false;
  entity.group.rotation.y=-Math.PI/2;entity.torso.rotation.set(0,0,0);entity.torso.position.set(0,0,0);
  for(const leg of entity.legs){temp.b.set(2,3.2,leg.side*9);poseLimb(leg,temp.b,leg.bend);leg.foot.position.copy(temp.b);leg.kneePlate.position.copy(leg.knee.position);leg.kneePlate.position.x+=4.2;leg.kneePlate.quaternion.copy(leg.upper.quaternion);}
  for(const arm of entity.arms){temp.b.set(7,14,arm.side*17.5);poseLimb(arm,temp.b,new THREE.Vector3(-1,-.1,arm.side*.02));arm.glove.position.copy(temp.b);arm.glove.rotation.set(0,0,-.1);arm.cuff.position.copy(temp.b).addScaledVector(temp.d,-2.3);arm.cuff.quaternion.copy(arm.lower.quaternion);}
  // Included signature poses are lobby/inspection-only. Combat animation never
  // reads them, and the on-demand preview does not acquire an idle render loop.
  if(lobbyIdle&&entity.cosmeticLobbyPose){
    const pose=entity.cosmeticLobbyPose;
    for(const arm of entity.arms){
      if(pose==='black-ice')temp.b.set(9,27,arm.side*14);
      else if(pose==='aegis')temp.b.set(12,24,arm.side*4);
      else temp.b.set(arm.side===1?9:7,arm.side===1?32:14,arm.side*16);
      poseLimb(arm,temp.b,new THREE.Vector3(-1,-.2,arm.side*.4));arm.glove.position.copy(temp.b);arm.cuff.position.copy(temp.b).addScaledVector(temp.d,-2.3);arm.cuff.quaternion.copy(arm.lower.quaternion);
    }
  }
  return entity;
}
export function animateOperator(entity,actor,now,dt=1/60){
  dt=clamp(Number(dt)||1/60,.0001,.075);
  const state=entity.state,visual=actor.visual||{},position=entity.group.position;
  setOperatorWeapon(entity,actor.weapon||'AR-15');
  if(!state.initialized){state.lastX=actor.x;state.lastY=actor.y;state.yaw=-(visual.turn??actor.angle??0);state.initialized=true;state.spawn=actor.spawn?0:1;}
  const dx=actor.x-state.lastX,dz=actor.y-state.lastY,distance=Math.hypot(dx,dz),teleport=distance>100;
  const vx=Number.isFinite(actor.vx)?actor.vx:teleport?0:dx/dt,vz=Number.isFinite(actor.vy)?actor.vy:teleport?0:dz/dt;
  const speed=Math.hypot(vx,vz),rawMove=Number.isFinite(visual.move)?visual.move:clamp(speed/175,0,1.4);
  state.move=smooth(state.move,actor.dead?0:rawMove,11,dt);
  state.sprint=smooth(state.sprint,actor.sprinting||visual.sprint>.5?1:0,8,dt);
  state.ads=smooth(state.ads,actor.adsBlend??(actor.ads?1:0),11,dt);
  state.dash=smooth(state.dash,actor.dashing||visual.dash>.2?1:0,14,dt);
  const targetYaw=-(visual.turn??actor.angle??0);
  state.yaw=teleport?targetYaw:smoothAngle(state.yaw,targetYaw,state.ads>0.5?25:18,dt);
  position.set(actor.x,0,actor.y);entity.group.rotation.y=state.yaw;
  if(!teleport)state.phase+=distance/(22+state.sprint*8);
  state.lastX=actor.x;state.lastY=actor.y;
  const dead=!!actor.dead;
  if(dead&&!state.lastDead)state.dead=0;
  if(!dead&&state.lastDead){state.dead=0;state.spawn=0;state.recoil=0;state.shotAge=99;}
  state.lastDead=dead;
  if(dead)state.dead+=dt;else state.spawn=clamp(state.spawn+dt*3.3);
  entity.group.visible=!dead||state.dead<1.1;
  const fall=dead?clamp(state.dead/.62):0,fallEase=fall*fall*(3-2*fall);
  entity.pose.rotation.set(fallEase*.24,0,-fallEase*1.45);
  entity.pose.position.set(0,fallEase*10,0);
  const spawnScale=.72+.28*state.spawn;entity.pose.scale.setScalar(spawnScale);
  entity.ring.visible=!dead;entity.shadow.scale.set(1+fallEase*.65,.78,1);
  const gait=Math.sin(state.phase),bob=(1-Math.cos(state.phase*2))*.5*state.move*(.65+state.sprint*.8);
  const targetLean=-state.sprint*.13-state.dash*.27+clamp(visual.lean||0,-.1,.1)+state.hit*.055;
  entity.torso.rotation.z=smooth(entity.torso.rotation.z,targetLean,9,dt);
  entity.torso.position.y=bob-state.dash*3;
  entity.torso.position.x=-state.hit*1.6-state.recoil*.75;
  entity.torso.rotation.x=smooth(entity.torso.rotation.x,gait*state.move*.025+state.hit*.035,10,dt);
  const forwardX=Math.cos(-state.yaw),forwardZ=Math.sin(-state.yaw),moveX=(vx*forwardX+vz*forwardZ)/(speed||1),moveZ=(-vx*forwardZ+vz*forwardX)/(speed||1);
  const stride=(6+state.sprint*4)*Math.min(state.move,1.25)*(1-state.dash*.35);
  const lowerTurn=visual.lower===undefined?(speed>28?angleDelta(Math.atan2(vz,vx),-state.yaw):0):angleDelta(visual.lower,-state.yaw);
  entity.lower.rotation.y=smoothAngle(entity.lower.rotation.y,-clamp(lowerTurn,-.5,.5)*(1-state.ads*.65),8,dt);
  for(const leg of entity.legs){
    const phase=state.phase+(leg.side===1?Math.PI:0),step=Math.sin(phase),lift=Math.pow(Math.max(0,Math.cos(phase)),1.5)*state.move*(3.8+state.sprint*2.7);
    temp.b.set(2+step*stride*moveX,3.2+lift,leg.side*8.5+step*stride*moveZ);
    poseLimb(leg,temp.b,leg.bend);
    leg.foot.position.copy(temp.b);leg.foot.rotation.z=-Math.max(0,step)*state.move*.16;
    leg.foot.rotation.y=-clamp(Math.atan2(moveZ,moveX),-.32,.32)*state.move;
    leg.kneePlate.position.copy(leg.knee.position);leg.kneePlate.position.x+=4.2;leg.kneePlate.quaternion.copy(leg.upper.quaternion);
  }
  // Events can come from an exact shot timestamp/counter or the existing flash.
  const shotToken=actor.shotId??actor.shotCounter??actor.lastShot;
  let fired=false;
  if(shotToken!==undefined&&shotToken!==null){
    if(state.lastShot!==null&&shotToken!==state.lastShot)fired=true;
    state.lastShot=shotToken;
  }else if(actor.muzzle&&!state.lastMuzzle)fired=true;
  if(fired){state.shotAge=0;state.recoil=1;}
  state.lastMuzzle=!!actor.muzzle;
  state.shotAge=Number.isFinite(actor.shotAge)?Math.max(0,actor.shotAge):state.shotAge+dt;
  state.recoil=Math.max(Number(actor.recoil)||0,state.recoil*Math.exp(-dt*13));
  state.hit=smooth(state.hit,clamp(Number(actor.hit)||0),actor.hit?40:12,dt);
  const gun=entity.gun,weapon=gun.userData,spec=weapon.spec,mechanisms=weapon.moving;
  const reload=actor.reloading?clamp(actor.reloadProgress||0):0,drop=magazineOffset(reload);
  state.reload=smooth(state.reload,actor.reloading?1:0,14,dt);
  const kick=state.recoil*spec.recoil;
  weapon.body.position.set(-kick,35-state.sprint*3-state.dash*3-state.reload*2+state.ads*1.8,0);
  weapon.body.rotation.set(0,state.sprint*.2+state.reload*.21,-state.sprint*.24-state.dash*.16-state.reload*.18+state.recoil*(spec.class==='sniper'?.07:.035));
  entity.gunMount.position.y=-bob*(.5+state.ads*.35);
  weapon.body.rotation.x+=gait*state.move*.015*(1-state.ads*.8);
  weapon.flash.visible=!dead&&!!actor.muzzle;
  if(weapon.flash.visible){weapon.flash.scale.setScalar(.75+Math.sin(now*.18)*.18+state.recoil*.35);weapon.flash.rotation.x=now*.04;}
  if(mechanisms.mag){
    mechanisms.mag.position.copy(mechanisms.mag.userData.restPosition);
    mechanisms.mag.rotation.set(0,0,0);mechanisms.mag.visible=true;
    if(nameIs(entity.gunName,'P90')){
      mechanisms.mag.position.y+=drop*13;mechanisms.mag.position.x-=drop*5;mechanisms.mag.rotation.z=drop*.16;
    }else{
      mechanisms.mag.position.y-=drop*18;mechanisms.mag.position.z+=drop*7;mechanisms.mag.rotation.z=-drop*.32;
      // Keep the FAL box feed in the support hand's reach throughout removal.
      if(nameIs(entity.gunName,'FAL')){mechanisms.mag.position.y+=drop*5;mechanisms.mag.position.x-=drop*6;}
    }
    // The outgoing magazine leaves the grip, and a fresh magazine is inserted.
    if(reload>.34&&reload<.55)mechanisms.mag.visible=false;
  }
  if(mechanisms.slide){
    mechanisms.slide.position.copy(mechanisms.slide.userData.restPosition);
    const cycle=state.shotAge<.11?Math.sin(state.shotAge/.11*Math.PI):0;
    const charging=reload>.78?Math.sin((reload-.78)/.22*Math.PI):0;
    mechanisms.slide.position.x-=(cycle+charging)*(spec.class==='auto-pistol'?4.4:3.6);
  }
  if(mechanisms.pump){
    mechanisms.pump.position.copy(mechanisms.pump.userData.restPosition);
    const cycle=clamp((state.shotAge-.12)/.8);
    mechanisms.pump.position.x-=Math.sin(cycle*Math.PI)*9;
  }
  if(mechanisms.bolt){
    mechanisms.bolt.position.copy(mechanisms.bolt.userData.restPosition);
    const cycle=spec.class==='sniper'?Math.sin(clamp((state.shotAge-.15)/.9)*Math.PI)*7:state.shotAge<.12?Math.sin(state.shotAge/.12*Math.PI)*2:0;
    const charging=reload>.8?Math.sin((reload-.8)/.2*Math.PI)*6:0;
    mechanisms.bolt.position.x-=cycle+charging;
    if(spec.class==='sniper')mechanisms.bolt.rotation.x=-Math.sin(clamp(state.shotAge/.3)*Math.PI)*.65;
  }
  if(mechanisms.shell){mechanisms.shell.visible=reload>.12&&reload<.86;mechanisms.shell.position.y=-9+Math.sin(reload*Math.PI*8)*4;mechanisms.shell.position.z=5+Math.cos(reload*Math.PI*8)*2;}
  // Hands are transformed from the actual weapon grip anchors, including recoil,
  // sprint lower/raise and magazine handling, rather than fixed floating arms.
  weapon.body.updateMatrix();
  for(const arm of entity.arms){
    const gripKey=arm.side===1?'rear':'support',anchor=weapon.grips[gripKey];
    temp.b.copy(anchor);temp.b.y-=35;temp.b.applyMatrix4(weapon.body.matrix);temp.b.add(entity.gunMount.position);
    if(actor.reloading&&arm.side===-1){
      if(weapon.handling){
        mechanisms.mag.updateMatrix();temp.p.copy(weapon.handling.mag).applyMatrix4(mechanisms.mag.matrix);
        temp.p.lerp(weapon.handling.charge,clamp((reload-.78)/.1));
        temp.p.applyMatrix4(weapon.body.matrix).add(entity.gunMount.position);
        temp.b.lerp(temp.p,clamp(reload/.13)*(1-clamp((reload-.94)/.06)));
      }else{
        const pistol=spec.class.includes('pistol'),handling=Math.sin(reload*Math.PI);
        temp.b.x+=(pistol?-6:-15)*handling;temp.b.y-=10*handling;temp.b.z-=4*handling;
        if(nameIs(entity.gunName,'P90'))temp.b.y+=22*handling;
      }
    }
    poseLimb(arm,temp.b,arm.bend);
    arm.glove.position.copy(temp.b);arm.glove.rotation.copy(weapon.body.rotation);
    arm.cuff.position.copy(temp.b).addScaledVector(temp.d,-2.3);arm.cuff.quaternion.copy(arm.lower.quaternion);
  }
  entity.hitRing.material.opacity=state.hit*.7;entity.hitRing.visible=state.hit>.015&&!dead;
  const spawn=Math.max(1-state.spawn,actor.spawn?clamp(Number(actor.spawn)||1):0);
  entity.spawnRing.material.opacity=spawn*.65;entity.spawnRing.scale.setScalar(1+(1-spawn)*.65);entity.spawnRing.visible=spawn>.02&&!dead;
  entity.labelHeight=68+bob;entity.animation={moving:state.move,sprint:state.sprint,ads:state.ads,reload,dead,deathProgress:fall,shotAge:state.shotAge};
  return entity;
}
const nameIs=(name,wanted)=>name===wanted;

export function disposeModel(object){
  object.userData.disposed=true;
  const geometries=new Set(),materials=new Set();
  object.traverse(child=>{
    child.userData.releaseCosmetic?.();
    if(child.geometry&&!child.geometry.userData?.sarShared)geometries.add(child.geometry);
    const list=Array.isArray(child.material)?child.material:[child.material];
    for(const value of list)if(value&&!value.userData?.sarShared)materials.add(value);
  });
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
}

// Only call once the complete 2.5D renderer has been destroyed. Individual actor
// removal / weapon swaps use disposeModel and must leave these caches intact.
export function disposeModelCache(){
  geometryCache.forEach(value=>value.dispose());materialCache.forEach(value=>value.dispose());
  geometryCache.clear();materialCache.clear();
}
