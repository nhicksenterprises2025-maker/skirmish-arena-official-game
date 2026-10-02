import * as THREE from './vendor/three.module.js';

// All solid footprints come from the simulation. Small details are surface dressing,
// never extra obstacles. Static geometry is merged by material and district cell.
const colours={grass:0x799c59,road:0x626d68,curb:0xc0c2ad,walk:0xcbd0ba,trim:0xe1deca,wood:0x9f8053,metal:0x455951};
function random(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const materials=new Map();
function material(colour,roughness=.88){const key=colour+':'+roughness;if(!materials.has(key)){const m=new THREE.MeshStandardMaterial({color:colour,roughness,metalness:.025});m.userData.sarShared=true;materials.set(key,m);}return materials.get(key);}
function texture(kind){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d'),r=random(kind==='grass'?14891:33843);
  g.fillStyle=kind==='grass'?'#91ac70':kind==='road'?'#818983':'#d1cdb8';g.fillRect(0,0,512,512);
  for(let i=0;i<(kind==='grass'?6200:4800);i++){const x=r()*512,y=r()*512;g.fillStyle=kind==='grass'?(i%3?'rgba(42,77,29,.09)':'rgba(225,230,153,.14)'):(i%3?'rgba(20,41,34,.11)':'rgba(249,243,205,.12)');if(kind==='grass')g.fillRect(x,y,1,2+r()*6);else g.fillRect(x,y,1+r()*2,1+r()*2);}
  if(kind==='grass'){g.fillStyle='rgba(187,170,99,.08)';for(let i=0;i<22;i++){g.beginPath();g.ellipse(r()*512,r()*512,8+r()*28,6+r()*16,r()*3,0,Math.PI*2);g.fill();}g.fillStyle='rgba(45,76,39,.035)';for(let y=0;y<512;y+=128)g.fillRect(0,y,512,64);}
  if(kind==='road'){g.strokeStyle='rgba(33,47,41,.2)';g.lineWidth=.6;for(let i=0;i<28;i++){let x=r()*512,y=r()*512;g.beginPath();g.moveTo(x,y);for(let j=0;j<5;j++){x+=(r()-.5)*24;y+=r()*12;g.lineTo(x,y);}g.stroke();}}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,1);t.anisotropy=4;return t;
}
function mesh(parent,geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cube(parent,w,h,d,colour,x,y,z){return mesh(parent,new THREE.BoxGeometry(Math.max(.1,w),Math.max(.1,h),Math.max(.1,d)),typeof colour==='number'?material(colour):colour,x,y,z);}
function transparentCopy(mat){const m=mat.clone();m.transparent=true;m.depthWrite=true;delete m.userData.sarShared;return m;}

class StaticBatch {
  constructor(parent){this.parent=parent;this.groups=new Map();}
  add(geo,mat,x,y,z,rotation=0){
    // Slightly larger districts amortize the additional surface details while
    // retaining bounded spatial batches for the follow camera's frustum culling.
    const key=Math.floor(x/1024)+','+Math.floor(z/1024)+','+mat.uuid;let b=this.groups.get(key);if(!b){b={mat,position:[],normal:[],uv:[],index:[],vertices:0};this.groups.set(key,b);}
    const matrix=new THREE.Matrix4().makeRotationY(rotation);matrix.setPosition(x,y,z);geo.applyMatrix4(matrix);
    b.position.push(...geo.attributes.position.array);b.normal.push(...geo.attributes.normal.array);b.uv.push(...(geo.attributes.uv?.array||new Float32Array(geo.attributes.position.count*2)));
    if(geo.index)for(const i of geo.index.array)b.index.push(i+b.vertices);else for(let i=0;i<geo.attributes.position.count;i++)b.index.push(i+b.vertices);
    b.vertices+=geo.attributes.position.count;geo.dispose();
  }
  box(w,h,d,col,x,y,z,rotation=0){this.add(new THREE.BoxGeometry(Math.max(.1,w),Math.max(.1,h),Math.max(.1,d)),typeof col==='number'?material(col):col,x,y,z,rotation);}
  finish(){for(const b of this.groups.values()){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geo.setIndex(b.index);geo.computeBoundingSphere();mesh(this.parent,geo,b.mat,0,0,0);}this.groups.clear();}
}
const inside=(a,b,pad=0)=>a.x>b.x-pad&&a.x<b.x+b.w+pad&&a.y>b.y-pad&&a.y<b.y+b.h+pad;
function mergeFixedGroup(group){
  group.updateMatrixWorld(true);const meshes=group.children.filter(o=>o.isMesh),batch=new StaticBatch(group);
  for(const m of meshes){const geo=m.geometry.clone();geo.applyMatrix4(m.matrixWorld);batch.add(geo,m.material,0,0,0);group.remove(m);m.geometry.dispose();}
  batch.finish();
}

export function buildEnvironment(scene,snapshot){
  const {world,geometry}=snapshot,root=new THREE.Group();root.name='Brightfield Blocks';scene.add(root);
  const staticRoot=new THREE.Group();root.add(staticRoot);const batch=new StaticBatch(staticRoot),houses=[],trees=[],assetSlots=[];
  const grassTex=texture('grass'),asphaltTex=texture('road');
  const grass=new THREE.MeshStandardMaterial({color:0xa4b58b,map:grassTex,roughness:1});grassTex.repeat.set((world.w+1500)/360,(world.h+1500)/360);
  const ground=cube(root,world.w+1800,4,world.h+1800,grass,world.w/2,-4,world.h/2);ground.castShadow=false;
  const asphalt=new THREE.MeshStandardMaterial({color:0x919b95,map:asphaltTex,roughness:.95});asphaltTex.repeat.set(6,3);
  const roadPoint=(x,z)=>geometry.roads.some(r=>x>=r.x&&x<=r.x+r.w&&z>=r.y&&z<=r.y+r.h);
  for(const road of geometry.roads){
    const horizontal=road.w>road.h,length=horizontal?road.w:road.h;
    batch.box(road.w,1,road.h,asphalt,road.x+road.w/2,.1,road.y+road.h/2);
    for(const side of [-1,1]){
      for(let p=0;p<length;p+=64){
        const x=horizontal?road.x+p+32:road.x+(side>0?road.w+17:-17),z=horizontal?road.y+(side>0?road.h+17:-17):road.y+p+32;
        if(roadPoint(x,z))continue;
        batch.box(horizontal?62:30,3.5,horizontal?30:62,colours.walk,x,1,z);
        batch.box(horizontal?64:5,6,horizontal?5:64,(p%192===0?0xb4b8a1:colours.curb),horizontal?x:road.x+(side>0?road.w+2:-2),3,horizontal?road.y+(side>0?road.h+2:-2):z);
        if(p%256===0){batch.box(horizontal?18:8,.4,horizontal?8:18,0x3f4f48,horizontal?x:road.x+(side>0?road.w-8:8),1.1,horizontal?road.y+(side>0?road.h-8:8):z);}
      }
    }
    for(let p=45;p<length-35;p+=118){const x=horizontal?road.x+p:road.x+road.w/2,z=horizontal?road.y+road.h/2:road.y+p;
      if(geometry.roads.some(r=>r!==road&&inside({x,y:z},r,30)))continue;
      batch.box(horizontal?53:3,.3,horizontal?3:53,0xdfd9af,x,1,z);
    }
    // Flush maintenance patches and narrow shoulder bands enrich the tarmac
    // without adding a single obstacle or obscuring center-line navigation.
    for(let p=172+Math.floor(road.x+road.y)%113;p<length-70;p+=281+p%97){const side=p%2?.72:.26,x=horizontal?road.x+p:road.x+road.w*side,z=horizontal?road.y+road.h*side:road.y+p;
      if(geometry.roads.some(r=>r!==road&&inside({x,y:z},r,35)))continue;
      batch.box(horizontal?51:25,.12,horizontal?25:51,0x46544b,x,.75,z);
      batch.box(horizontal?52:1,.14,horizontal?1:52,0x3d4b43,x,.88,z+(horizontal?12:0));
    }
  }
  // Zebra crossings sit on approach edges; intersecting roads remain open.
  for(const h of geometry.roads.filter(r=>r.w>r.h))for(const v of geometry.roads.filter(r=>r.h>r.w)){
    if(v.x>h.x+h.w||v.x+v.w<h.x||h.y>v.y+v.h||h.y+h.h<v.y)continue;
    for(let x=v.x+14;x<v.x+v.w-10;x+=21){batch.box(11,.35,28,0xdedcca,x,1.2,h.y+18);batch.box(11,.35,28,0xdedcca,x,1.2,h.y+h.h-18);}
  }
  for(const s of geometry.surfaces||[]) {
    batch.box(s.w,1.5,s.h,s.kind==='driveway'?0xb8b9a5:((Math.floor(s.x+s.y)%3)===0?0xc5cab2:colours.walk),s.x+s.w/2,1,s.y+s.h/2);
    const horizontal=s.w>s.h;
    for(let p=0;p<(horizontal?s.w:s.h);p+=48)batch.box(horizontal?.8:s.w,.25,horizontal?s.h:.8,0x929d85,s.x+(horizontal?p:s.w/2),2,s.y+(horizontal?s.h/2:p));
  }
  const tones=[0xa8b397,0x9badb1,0xc1ab86,0xaca99b],roofTones=[0x627064,0x657779,0x897a62,0x777969];
  for(const floor of geometry.floors){
    const base=new THREE.Group(),roof=new THREE.Group(),wallRoot=new THREE.Group(),fadeMaterials=[];root.add(base,wallRoot,roof);
    cube(base,floor.w,5,floor.h,0xc7c5ae,floor.x+floor.w/2,2,floor.y+floor.h/2);
    cube(base,floor.w-42,1,floor.h-42,tones[floor.tone%4],floor.x+floor.w/2,5,floor.y+floor.h/2);
    // Plank seams and a central woven rug reveal the walkable interior when cut away.
    for(let x=floor.x+26;x<floor.x+floor.w-22;x+=32)batch.box(.6,.4,floor.h-44,0x8c9783,x,5.7,floor.y+floor.h/2);
    batch.box(floor.w*.34,.5,floor.h*.34,0x6f8578,floor.x+floor.w/2,5.8,floor.y+floor.h/2);
    const colour=tones[floor.tone%4],upperMat=transparentCopy(material(colour)),trimMat=transparentCopy(material(colours.trim)),glass=transparentCopy(material(0x476762,.36));
    fadeMaterials.push(upperMat,trimMat,glass);
    for(const solid of geometry.solids.filter(s=>s.kind==='building'&&s.owner===floor.id)){
      cube(base,solid.w,24,solid.h,colour,solid.x+solid.w/2,16,solid.y+solid.h/2);
      const wall=cube(wallRoot,solid.w,67,solid.h,upperMat,solid.x+solid.w/2,61.5,solid.y+solid.h/2);
      const horizontal=solid.w>solid.h,len=horizontal?solid.w:solid.h;
      // Siding seams and projecting window/trim geometry respect actual wall segments.
      for(let y=36;y<93;y+=13)cube(wallRoot,solid.w+.3,.7,solid.h+.3,upperMat,wall.position.x,y,wall.position.z);
      cube(wallRoot,solid.w+5,5,solid.h+5,trimMat,wall.position.x,96,wall.position.z);
      // Foundation courses and corner pilasters add readable construction at
      // tactical scale. Every upper detail belongs to the same cutaway group.
      cube(base,solid.w+.8,2,solid.h+.8,0x929781,wall.position.x,9,wall.position.z);
      for(const end of [6,len-6]){const px=horizontal?solid.x+end:wall.position.x,pz=horizontal?wall.position.z:solid.y+end;cube(wallRoot,horizontal?5:solid.w+1,64,horizontal?solid.h+1:5,trimMat,px,62,pz);}
      for(let p=42;p<len-26;p+=83){
        const x=horizontal?solid.x+p:solid.x+solid.w/2,z=horizontal?solid.y+solid.h/2:solid.y+p;
        for(const side of [-1,1]){
          const wx=horizontal?x:x+side*(solid.w/2+.6),wz=horizontal?z+side*(solid.h/2+.6):z;
          cube(wallRoot,horizontal?38:2,29,horizontal?2:38,trimMat,wx,62,wz);
          cube(wallRoot,horizontal?30:2.4,21,horizontal?2.4:30,glass,wx+(horizontal?0:side*.5),62,wz+(horizontal?side*.5:0));
          cube(wallRoot,horizontal?2:3,23,horizontal?3:2,trimMat,wx+(horizontal?0:side*1.1),62,wz+(horizontal?side*1.1:0));
          cube(wallRoot,horizontal?39:5,3,horizontal?5:39,trimMat,wx,47,wz);
          cube(wallRoot,horizontal?29:3.1,1.4,horizontal?3.1:29,trimMat,wx+(horizontal?0:side*1.2),62,wz+(horizontal?side*1.2:0));
          for(const shutter of [-1,1]){
            const sx=wx+(horizontal?shutter*23:side*1),sz=wz+(horizontal?side*1:shutter*23);
            cube(wallRoot,horizontal?7:2.7,29,horizontal?2.7:7,glass,sx,62,sz);
            for(const sy of [54,61,68])cube(wallRoot,horizontal?6:3,1.2,horizontal?3:6,upperMat,sx,sy,sz);
          }
        }
      }
    }
    // Gabled roof made from an actual triangular profile, with ridge and tile courses.
    const roofMat=transparentCopy(material(roofTones[floor.tone%4])),roofMats=[roofMat];
    const w=floor.w+24,d=floor.h+24,x=floor.x+floor.w/2,z=floor.y+floor.h/2,eave=101,rise=54;
    const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,rise);shape.closePath();
    const roofGeo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});roofGeo.translate(x,eave,z-d/2);
    mesh(roof,roofGeo,roofMat,0,0,0);
    const trim=transparentCopy(material(0xd0d0b8));roofMats.push(trim);cube(roof,w+3,5,d+3,trim,x,eave,z);
    cube(roof,8,6,d+3,roofMat,x,eave+rise,z);
    for(let sx=-w/2+22;sx<w/2;sx+=26){const y=eave+rise*(1-Math.abs(sx)/(w/2))+1.2;cube(roof,1.3,1.6,d,roofMat,x+sx,y,z);}
    for(let rz=-d/2+28;rz<d/2;rz+=28){for(const side of [-1,1]){const line=cube(roof,w/2+3,.8,1,roofMat,x+side*w/4,eave+rise/2+1,z+rz);line.rotation.z=-side*Math.atan2(rise,w/2);}}
    cube(roof,25,38,26,trim,x-floor.w*.24,eave+42,z-floor.h*.23);cube(roof,29,4,30,roofMat,x-floor.w*.24,eave+62,z-floor.h*.23);
    for(const side of [-1,1]){
      cube(roof,5,5,d+9,trim,x+side*(w/2+1),eave-2,z);
      const rake=cube(roof,Math.hypot(w/2,rise),3,4,trim,x+side*w/4,eave+rise/2,z-d/2-1);rake.rotation.z=-side*Math.atan2(rise,w/2);
      cube(wallRoot,3.5,82,3.5,trimMat,x+side*(floor.w/2+3),54,z+floor.h/2-8);
    }
    // Gable vent and attic louvers, batched into the existing two roof finishes.
    for(const end of [-1,1]){cube(roof,29,18,2,trim,x,eave+19,z+end*(d/2+.7));for(let y=0;y<4;y++)cube(roof,23,1.5,2.5,roofMat,x,eave+13+y*4,z+end*(d/2+1.1));}
    const porchExit=floor.exits?.find(e=>e.id===floor.front)||floor.exits?.[0];
    if(porchExit){
      const px=porchExit.x+porchExit.dx*27,pz=porchExit.y+porchExit.dy*27;
      cube(roof,porchExit.dx?41:96,4,porchExit.dy?41:96,trim,px,99,pz);
      cube(roof,porchExit.dx?40:93,3,porchExit.dy?40:93,roofMat,px,102,pz);
      for(const side of [-1,1]){const lx=porchExit.x+porchExit.dy*side*71+porchExit.dx*3,lz=porchExit.y+porchExit.dx*side*71+porchExit.dy*3;
        cube(wallRoot,porchExit.dx?5:8,12,porchExit.dy?5:8,trimMat,lx,77,lz);
        cube(wallRoot,porchExit.dx?5.3:5,7,porchExit.dy?5.3:5,glass,lx+porchExit.dx*.3,77,lz+porchExit.dy*.3);
      }
    }
    mergeFixedGroup(wallRoot);mergeFixedGroup(roof);mergeFixedGroup(base);
    for(const exit of floor.exits||[]){
      batch.box(exit.dx?46:132,5,exit.dy?46:132,0xb8bda5,exit.x+exit.dx*24,3,exit.y+exit.dy*24);
      batch.box(exit.dx?30:116,2,exit.dy?30:116,0xd2d3bb,exit.x+exit.dx*57,1.5,exit.y+exit.dy*57);
      // Flush door threshold remains inside the existing porch footprint.
      const px=exit.x+exit.dx*6,pz=exit.y+exit.dy*6;
      batch.box(exit.dx?4:58,1,exit.dy?4:58,0x6e7d6e,px,6,pz);
    }
    houses.push({floor,roof,wallRoot,roofMats,fadeMaterials,opacity:1});
    // Low flowerbeds are ground dressing, outside doors and existing collision.
    for(let p=45;p<floor.w-38;p+=32){const px=floor.x+p,pz=floor.y+floor.h+34;
      if((floor.exits||[]).some(e=>Math.hypot(e.x-px,e.y-pz)<99)||roadPoint(px,pz))continue;
      batch.box(26,1,14,0x8e936a,px,1,pz);batch.box(27,2.5,1.6,0x929781,px,1.8,pz+8);for(let j=0;j<3;j++)batch.add(new THREE.IcosahedronGeometry(2.4,0),material(j===1?0xc99569:0xd7c993),px-7+j*7,3,pz);
    }
    const front=floor.exits?.find(e=>e.id===floor.front)||floor.exits?.[0];
    if(front){
      const fence=geometry.solids.filter(o=>o.kind==='fence'&&Math.hypot(o.x+o.w/2-front.x,o.y+o.h/2-front.y)<floor.w+floor.h).sort((a,b)=>Math.hypot(a.x+a.w/2-front.x,a.y+a.h/2-front.y)-Math.hypot(b.x+b.w/2-front.x,b.y+b.h/2-front.y))[0];
      if(fence){const horizontal=fence.w>fence.h;assetSlots.push({name:'mailbox',x:fence.x+fence.w/2,z:fence.y+fence.h/2,rotation:horizontal?0:Math.PI/2,scale:.7});}
    }
  }
  for(const solid of geometry.solids){
    if(solid.kind==='building')continue;
    const cx=solid.type==='circle'?solid.x:solid.x+solid.w/2,cz=solid.type==='circle'?solid.y:solid.y+solid.h/2;
    if(solid.kind==='tree'){
      const t=new THREE.Group();root.add(t);const canopy=new THREE.Group();t.add(canopy);
      cube(t,13,49,13,0x75664c,cx,25,cz);
      const leaf=transparentCopy(material(0x4e7c44)),leaf2=transparentCopy(material(0x698c48));
      for(const [dx,y,dz,r,m] of [[0,78,0,solid.r*1.05,leaf],[-solid.r*.68,65,7,solid.r*.72,leaf2],[solid.r*.64,70,-9,solid.r*.73,leaf]])mesh(canopy,new THREE.IcosahedronGeometry(r,1),m,cx+dx,y,cz+dz);
      // Smaller asymmetric lobes break the spherical silhouette while sharing
      // the same fade materials, so occupants remain readable under the canopy.
      for(const [dx,dz,sy] of [[-.65,-.45,88],[.55,.4,91],[.1,-.5,105]])mesh(canopy,new THREE.IcosahedronGeometry(solid.r*.48,0),leaf2,cx+solid.r*dx,sy,cz+solid.r*dz);
      for(const side of [-1,1]){const branch=cube(t,7,33,7,0x75664c,cx+side*8,46,cz+side*3);branch.rotation.z=side*.48;}
      mergeFixedGroup(canopy);
      mergeFixedGroup(t);
      trees.push({x:cx,z:cz,r:solid.r,canopy,materials:[leaf,leaf2],opacity:1});
      batch.add(new THREE.CylinderGeometry(solid.r*.55,solid.r*.7,1,12),material(0x6d7754),cx,.5,cz);
    }else if(solid.type==='circle'){
      batch.add(new THREE.IcosahedronGeometry(solid.r,1),material(solid.kind==='bush'?0x557c44:0x969d87),cx,solid.kind==='bush'?solid.r*.75:solid.r*.45,cz);
      if(solid.kind==='bush')batch.add(new THREE.IcosahedronGeometry(solid.r*.6,1),material(0x6d914e),cx-8,solid.r,cz+4);
    }else if(solid.kind==='fence'||solid.kind==='perimeter'){
      const horizontal=solid.w>solid.h,len=horizontal?solid.w:solid.h,height=solid.kind==='perimeter'?40:37;
      // Lower plinth signals the complete authoritative collision footprint.
      batch.box(solid.w,5,solid.h,0x7d7254,cx,2.5,cz);
      for(let p=0;p<len;p+=18){const x=horizontal?solid.x+p+6:cx,z=horizontal?cz:solid.y+p+6;batch.box(horizontal?11:solid.w,height,horizontal?solid.h:11,colours.wood,x,height/2,z);}
      for(const y of [12,29])batch.box(solid.w+2,4,solid.h+2,0x806d4b,cx,y,cz);
      for(let p=0;p<len;p+=90){const x=horizontal?solid.x+p+4:cx,z=horizontal?cz:solid.y+p+4;batch.box(horizontal?9:solid.w+2,height+5,horizontal?solid.h+2:9,0x806d4b,x,(height+5)/2,z);batch.box(horizontal?12:solid.w+5,3,horizontal?solid.h+5:12,0xb49a6d,x,height+5,z);}
    }else if(['car','bench','utility','crate'].includes(solid.kind)){
      const name={car:'parked_car',bench:'bench',utility:'utility_box',crate:'crate'}[solid.kind];
      const fallback=new THREE.Group();root.add(fallback);const height={car:38,bench:24,utility:51,crate:56}[solid.kind];
      cube(fallback,solid.w,height,solid.h,solid.kind==='crate'?0x957549:solid.kind==='car'?0x577976:colours.metal,cx,height/2,cz);
      if(solid.kind==='crate'){for(const x of [-.35,.35])batch.box(6,height+2,solid.h+2,0xc2a46b,cx+solid.w*x,height/2,cz);batch.box(solid.w+2,5,solid.h+2,0xb39a69,cx,height-6,cz);}
      assetSlots.push({name,x:cx,z:cz,width:solid.w,depth:solid.h,fallback});
      if(solid.kind==='utility')assetSlots.push({name:'streetlamp',x:cx,z:cz,scale:.7});
    }else{
      batch.box(solid.w,solid.kind==='interior'?32:45,solid.h,0x929480,cx,solid.kind==='interior'?21:23,cz);
    }
  }
  // Outside the arena: continuous landscape and complete neighbouring houses,
  // so following a player to the edge never exposes a flat unfinished rectangle.
  for(const o of geometry.outerWorld||[]){
    if(o.kind==='house'){batch.box(o.w,85,o.h,tones[o.tone%4],o.x+o.w/2,43,o.y+o.h/2);batch.box(o.w+18,14,o.h+18,roofTones[o.tone%4],o.x+o.w/2,94,o.y+o.h/2);}
    else if(o.kind==='tree')batch.add(new THREE.IcosahedronGeometry(o.r,1),material(0x537c48),o.x,66,o.y);
    else if(o.kind==='car')batch.box(o.w,29,o.h,0x7e9185,o.x+o.w/2,15,o.y+o.h/2);
  }
  for(const d of geometry.decor||[]){batch.add(new THREE.IcosahedronGeometry(d.s||2,0),material([0xd4c98a,0xd9bea0,0xbfcda4,0x809b5b][d.t%4]),d.x,1.8,d.y);}
  batch.finish();
  function update(s,dt){
    const alive=s.actors.filter(a=>!a.dead),blend=1-Math.exp(-dt*11);
    for(const h of houses){
      const occupied=alive.some(a=>inside(a,h.floor,105));h.opacity+=(Number(!occupied)-h.opacity)*blend;
      const roofOpacity=h.opacity<.035?0:h.opacity;h.roof.visible=roofOpacity>0;for(const m of h.roofMats){m.opacity=roofOpacity;m.depthWrite=roofOpacity>.96;}
      // Upper wall cutaway also opens the viewing side while preserving its plinth.
      for(const m of h.fadeMaterials){m.opacity=.19+.81*h.opacity;m.depthWrite=h.opacity>.96;}
      h.wallRoot.traverse(o=>{if(o.isMesh)o.castShadow=h.opacity>.8;});h.roof.traverse(o=>{if(o.isMesh)o.castShadow=h.opacity>.8;});
    }
    for(const t of trees){const hidden=alive.some(a=>Math.hypot(a.x-t.x,a.y-(t.z+30))<t.r+40);t.opacity+=((hidden?0.23:1)-t.opacity)*blend;for(const m of t.materials){m.opacity=t.opacity;m.depthWrite=t.opacity>.96;}t.canopy.traverse(o=>{if(o.isMesh)o.castShadow=t.opacity>.8;});}
  }
  function installAssets(library){
    let installed=0;const grouped=new Map();
    for(const slot of assetSlots){const d=library.dimensions(slot.name);if(!d)continue;
      const scale=slot.scale||1,key=slot.name+':'+Math.floor(slot.x/1000)+':'+Math.floor(slot.z/1000);
      if(!grouped.has(key))grouped.set(key,{name:slot.name,placements:[]});
      grouped.get(key).placements.push({x:slot.x,y:0,z:slot.z,rotationY:slot.rotation||0,scale:{x:slot.width?slot.width/d.x:scale,y:slot.width?Math.min(slot.width/d.x,slot.depth/d.z):scale,z:slot.depth?slot.depth/d.z:scale}});
      if(slot.fallback){root.remove(slot.fallback);slot.fallback.traverse(o=>{if(o.geometry)o.geometry.dispose();});}installed++;
    }
    for(const {name,placements} of grouped.values())library.addInstances(name,placements,root);
    return installed;
  }
  return {root,update,installAssets,houses,trees,assetSlots,stats:{houses:houses.length,staticMeshes:staticRoot.children.length,assetSlots:assetSlots.length}};
}
