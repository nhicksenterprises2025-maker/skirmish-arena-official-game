import * as THREE from './vendor/three.module.js';
import {buildWeapon,buildOperator,setOperatorWeapon,animateOperator,poseUnarmedShowcase,disposeModel,ensureModelAssets} from './models-25d.mjs';
import {loadAssetLibrary} from './asset-loader-25d.mjs';

// One on-demand renderer; inspections reuse presentation meshes and never tick a match.
let renderer,inspection;
const thumbnails=new Map();
function visibleBounds(object,view=null){
  const result=new THREE.Box3();object.updateMatrixWorld(true);
  object.traverseVisible(node=>{if(!node.isMesh)return;if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();const matrix=view?new THREE.Matrix4().multiplyMatrices(view,node.matrixWorld):node.matrixWorld;result.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));});
  return result;
}
function copyCanvas(target,source){const g=target.getContext('2d');g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);g.drawImage(source,0,0,target.width,target.height);g.restore();}
export async function paintInspection(canvas,{kind,weapon,skin=0,palette=null,rotation=0,unarmed=false}){
  await ensureModelAssets();
  if(canvas.isConnected===false)return;
  renderer??=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  const width=canvas.width,height=canvas.height;
  const interactive=canvas.id==='inspectionCanvas'||rotation!==0;
  const cacheKey=rotation===0?JSON.stringify([kind,weapon,skin,palette,unarmed,width,height,interactive]):null;
  if(cacheKey&&thumbnails.has(cacheKey)){copyCanvas(canvas,thumbnails.get(cacheKey));return;}
  renderer.setSize(width,height,false);renderer.setClearColor(typeof getComputedStyle==='function'?getComputedStyle(document.documentElement).getPropertyValue('--sky-panel-light').trim()||'#DFEBF5':'#DFEBF5',1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const modelKey=JSON.stringify([kind,weapon,skin,palette,unarmed]);
  if(!inspection||inspection.key!==modelKey){
  if(inspection)disposeModel(inspection.pivot);
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xf0f4e9,0x384b3d,1.55));
  const sun=new THREE.DirectionalLight(0xfff1d6,2.6);sun.position.set(80,150,140);scene.add(sun);
  const rim=new THREE.DirectionalLight(0xc5dfe0,1.8);rim.position.set(-130,65,-90);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xe6efd7,.65);fill.position.set(-100,5,160);scene.add(fill);
  let object,entity;
  if(kind==='phone')object=(await loadAssetLibrary()).cloneModel('phone-device');
  else if(kind==='operator'){
    entity=buildOperator(1,skin,palette);if(unarmed)poseUnarmedShowcase(entity);else {setOperatorWeapon(entity,weapon);
    animateOperator(entity,{x:0,y:0,angle:0,vx:0,vy:0,adsBlend:0,weapon,skinIndex:skin},0,0);}
    object=entity.group;
  }else object=buildWeapon(weapon);
  object.updateMatrixWorld(true);
  const bounds=visibleBounds(object),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const pivot=new THREE.Group();object.position.sub(center);pivot.add(object);scene.add(pivot);
  inspection={key:modelKey,scene,pivot,size,framing:new Map()};
  }
  const {scene,pivot,size}=inspection;pivot.rotation.y=rotation;
  const aspect=width/height,camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2000);
  camera.position.copy(kind==='phone'?new THREE.Vector3(0,0,500):kind==='operator'?new THREE.Vector3(unarmed?0:110,unarmed?8:55,230):new THREE.Vector3(90,30,250));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  // A centered turntable with one fixed framing envelope avoids size pumping
  // during drag. The existing mesh/rig is reused for consecutive rotation frames.
  const framingKey=aspect+':'+interactive;
  if(!inspection.framing.has(framingKey)){
    let span=0;
    for(let i=0;i<(interactive?16:1);i++){
      pivot.rotation.y=interactive?i*Math.PI/8:rotation;
      const projected=visibleBounds(pivot,camera.matrixWorldInverse),extent=projected.getSize(new THREE.Vector3());
      span=Math.max(span,extent.y,extent.x/aspect);
    }
    inspection.framing.set(framingKey,span*(kind==='phone'?1:1.1));
  }
  const span=inspection.framing.get(framingKey);pivot.rotation.y=rotation;
  camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  renderer.render(scene,camera);copyCanvas(canvas,renderer.domElement);
  if(cacheKey){const copy=document.createElement('canvas');copy.width=width;copy.height=height;copy.getContext('2d').drawImage(canvas,0,0);thumbnails.set(cacheKey,copy);if(thumbnails.size>32)thumbnails.delete(thumbnails.keys().next().value);}
}
