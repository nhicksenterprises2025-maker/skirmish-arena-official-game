import * as THREE from './vendor/three.module.js';
import {buildWeapon,buildOperator,setOperatorWeapon,animateOperator,poseUnarmedShowcase,disposeModel,ensureModelAssets,ensureCosmeticAssets,cosmeticKey} from './models-25d.mjs';
import {loadAssetLibrary} from './asset-loader-25d.mjs';

// Presentation only: one on-demand WebGL context copies into ordinary card
// canvases. Each mounted card owns its pose, mesh instance and framing envelope.
let renderer,renderQueue=Promise.resolve(),frame=0,flushing=false,observer,resizeObserver,detachObserver;
const cards=new Map(),pending=new Set(),staticModels=new Map(),thumbnails=new Map(),requests=new WeakMap();
const metrics={renders:0,cacheHits:0,modelBuilds:0,disposedModels:0,frames:0,motionRenders:0,maxFrameMs:0,maxRenderMs:0,totalRenderMs:0};
const rankManifest=new URL('./assets/25d/ranks/manifest.json',import.meta.url);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const normalizedAngle=value=>((value+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;

function visibleBounds(object,view=null){
  const result=new THREE.Box3();object.updateMatrixWorld(true);
  object.traverseVisible(node=>{if(!node.isMesh)return;if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();const matrix=view?new THREE.Matrix4().multiplyMatrices(view,node.matrixWorld):node.matrixWorld;result.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));});
  return result;
}
function copyCanvas(target,source){const g=target.getContext('2d');g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);g.drawImage(source,0,0,target.width,target.height);g.restore();}
function modelKey(options){return JSON.stringify([options.kind,options.weapon,options.skin??0,options.palette??null,!!options.unarmed,options.rankIndex,options.badge,cosmeticKey(options.cosmetic),!!options.lobbyIdle,options.motion??null,options.interactive??null]);}
function releaseEntry(entry){if(!entry)return;disposeModel(entry.pivot);metrics.disposedModels++;}
function currentBackground(canvas){return typeof getComputedStyle==='function'?getComputedStyle(canvas||document.documentElement).getPropertyValue('--sky-panel-light').trim()||'#DFEBF5':'#DFEBF5';}
function ensureRenderer(){
  if(renderer)return renderer;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  return renderer;
}
async function createEntry(options){
  const {kind,weapon,skin=0,palette=null,unarmed=false,rankIndex=0,badge}=options;
  let object,breathing=null;
  if(kind==='rank'){
    const library=await loadAssetLibrary(rankManifest),entry=badge?library.entries.find(value=>value.name===badge):library.entries.find(value=>value.rankIndex===Number(rankIndex));
    if(!entry)throw new Error('Rank badge unavailable: '+(badge??rankIndex));
    object=library.cloneModel(entry.name);
  }else{
    await ensureModelAssets();
    if(kind==='phone')object=(await loadAssetLibrary()).cloneModel('phone-device');
    else if(kind==='operator'){
      if(options.cosmetic)await ensureCosmeticAssets(options.cosmetic);
      const entity=buildOperator(1,skin,palette,options.cosmetic);
      // The rig's face points +X. This existing preview-only pose rotates it
      // -90 degrees toward our +Z camera; zero card rotation is true front.
      if(unarmed)poseUnarmedShowcase(entity,{lobbyIdle:!!options.lobbyIdle});
      else {setOperatorWeapon(entity,weapon);animateOperator(entity,{x:0,y:0,angle:0,vx:0,vy:0,adsBlend:0,weapon,skinIndex:skin},0,0);}
      object=entity.group;
      // This rig is a preview-owned instance. Only its chest/head/arms breathe;
      // feet stay planted and shared gameplay geometry/materials stay untouched.
      if(options.motion==='operator-breathe')breathing={node:entity.torso,y:entity.torso.position.y,scaleY:entity.torso.scale.y};
    }else object=buildWeapon(weapon);
  }
  if(!object)throw new Error('Model unavailable: '+kind);
  object.updateMatrixWorld(true);
  const bounds=visibleBounds(object),center=bounds.getCenter(new THREE.Vector3());
  if(bounds.isEmpty()){disposeModel(object);throw new Error('Model has no visible geometry: '+kind);}
  const pivot=new THREE.Group();object.position.sub(center);pivot.add(object);
  const rank=kind==='rank',scene=new THREE.Scene();scene.add(pivot,new THREE.HemisphereLight(0xf0f4e9,0x384b3d,rank?1.1:1.55));
  const sun=new THREE.DirectionalLight(0xfff1d6,rank?3.1:2.6);sun.position.set(rank?-80:80,150,140);scene.add(sun);
  const rim=new THREE.DirectionalLight(0xc5dfe0,rank?1.25:1.8);rim.position.set(-130,65,-90);scene.add(rim);
  const fill=new THREE.DirectionalLight(0xe6efd7,rank?.3:.65);fill.position.set(-100,5,160);scene.add(fill);
  metrics.modelBuilds++;
  return {key:modelKey(options),scene,pivot,kind,unarmed,breathing,framing:new Map()};
}
function cameraFor(entry,aspect){
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2000);
  camera.position.copy(entry.kind==='rank'?new THREE.Vector3(135,50,500):entry.kind==='phone'?new THREE.Vector3(0,0,500):entry.kind==='operator'?new THREE.Vector3(entry.unarmed?0:110,entry.unarmed?8:55,230):new THREE.Vector3(90,30,250));
  camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const framingKey=aspect.toFixed(4);
  if(!entry.framing.has(framingKey)){
    let span=0;
    // One complete turntable envelope includes every orientation, including
    // zero. Dragging never changes model scale or clips the ends of a rifle.
    const count=entry.kind==='phone'?1:32;
    for(let i=0;i<count;i++){
      entry.pivot.rotation.y=i*Math.PI*2/count;
      const projected=visibleBounds(entry.pivot,camera.matrixWorldInverse);
      span=Math.max(span,2*Math.abs(projected.min.y),2*Math.abs(projected.max.y),2*Math.abs(projected.min.x)/aspect,2*Math.abs(projected.max.x)/aspect);
    }
    entry.framing.set(framingKey,span*(entry.kind==='phone'?1:1.13));
    if(entry.framing.size>8)entry.framing.delete(entry.framing.keys().next().value);
  }
  return {camera,span:entry.framing.get(framingKey)};
}
function renderEntry(canvas,entry,{rotation=0,zoom=1}={}){
  const width=canvas.width,height=canvas.height;if(!width||!height)return;
  const started=performance.now();
  const gl=ensureRenderer(),aspect=width/height,{camera,span}=cameraFor(entry,aspect);
  const viewSpan=span/clamp(Number(zoom)||1,.8,1.08);
  entry.pivot.rotation.y=rotation;
  camera.left=-viewSpan*aspect/2;camera.right=viewSpan*aspect/2;camera.top=viewSpan/2;camera.bottom=-viewSpan/2;camera.updateProjectionMatrix();
  gl.setSize(width,height,false);gl.setClearColor(currentBackground(canvas),entry.kind==='rank'?0:1);gl.render(entry.scene,camera);copyCanvas(canvas,gl.domElement);metrics.renders++;
  const elapsed=performance.now()-started;metrics.maxRenderMs=Math.max(metrics.maxRenderMs,elapsed);metrics.totalRenderMs+=elapsed;
}
function serialize(task){const result=renderQueue.then(task);renderQueue=result.catch(()=>{});return result;}

export function paintInspection(canvas,options){
  if(options.motion){mountCardPreview(canvas,options);return Promise.resolve();}
  if(cards.get(canvas)?.options.motion)cards.get(canvas).api.dispose();
  const token={};requests.set(canvas,token);
  return serialize(async()=>{
    if(canvas.isConnected===false||requests.get(canvas)!==token)return;
    const key=modelKey(options),rotation=options.rotation??0,zoom=options.zoom??1;
    const cacheKey=rotation===0&&zoom===1?JSON.stringify([key,canvas.width,canvas.height,currentBackground(canvas)]):null;
    if(cacheKey&&thumbnails.has(cacheKey)){copyCanvas(canvas,thumbnails.get(cacheKey));metrics.cacheHits++;return;}
    let entry=staticModels.get(key);
    if(!entry){entry=await createEntry(options);staticModels.set(key,entry);if(staticModels.size>3){const old=staticModels.keys().next().value;releaseEntry(staticModels.get(old));staticModels.delete(old);}}
    if(canvas.isConnected===false||requests.get(canvas)!==token)return;
    renderEntry(canvas,entry,options);
    if(cacheKey){const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);thumbnails.set(cacheKey,copy);if(thumbnails.size>48)thumbnails.delete(thumbnails.keys().next().value);}
  });
}

function canvasSize(canvas){const bounds=canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2);const width=Math.max(1,Math.round(bounds.width*scale)),height=Math.max(1,Math.round(bounds.height*scale));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;}
function inViewport(canvas){const bounds=canvas.getBoundingClientRect();return bounds.width>0&&bounds.height>0&&bounds.bottom>0&&bounds.right>0&&bounds.top<window.innerHeight&&bounds.left<window.innerWidth;}
function queueCard(card){if(card.disposed||card.failed)return;card.dirty=true;if(card.visible&&!document.hidden){pending.add(card);schedule();}}
const MOTION_INTERVAL=1000/24;
function lobbyCovered(card){
  const menu=card.canvas.closest?.('#menu');
  return !!menu&&(!menu.classList.contains('visible')||document.getElementById('modal')?.classList.contains('visible')||document.getElementById('sarModeEntry')?.hidden===false);
}
const moving=card=>!!card.options.motion&&card.visible&&!card.disposed&&!card.failed&&!card.drag&&!lobbyCovered(card);
function schedule(){if(!frame&&!flushing&&!document.hidden&&(pending.size||[...cards.values()].some(moving)))frame=requestAnimationFrame(flush);}
function applyMotion(card,now){
  if(!moving(card)){card.lastMotion=null;return;}
  if(card.lastMotion!==null)card.motionSeconds+=Math.max(0,now-card.lastMotion)/1000;
  card.lastMotion=now;
  if(now-card.lastMotionRender>=MOTION_INTERVAL||!card.entry){pending.add(card);card.lastMotionRender=now;}
}
function motionPose(card){
  const breath=card.entry?.breathing;
  if(breath){const wave=Math.sin(card.motionSeconds*Math.PI*2/4.8);breath.node.position.y=breath.y+wave*.12;breath.node.scale.y=breath.scaleY*(1+wave*.0025);}
  return {rotation:card.rotation+(card.options.motion==='weapon-turntable'?card.motionSeconds*Math.PI*2/24:0),zoom:card.zoom};
}
async function flush(now){
  frame=0;flushing=true;const started=performance.now();metrics.frames++;
  for(const card of cards.values())applyMotion(card,now);
  // Limit first-time mesh construction to two visible cards per frame.
  const batch=[...pending].slice(0,2);for(const card of batch)pending.delete(card);
  await serialize(async()=>{
    for(const card of batch){
      if(card.disposed||!card.canvas.isConnected||!card.visible||document.hidden)continue;
      try{
        if(!card.entry){
          const generation=card.generation,entry=await createEntry(card.options);
          if(card.disposed||generation!==card.generation){releaseEntry(entry);continue;}
          card.entry=entry;
        }
        if(!card.canvas.isConnected||!card.visible||document.hidden)continue;
        canvasSize(card.canvas);renderEntry(card.canvas,card.entry,motionPose(card));card.dirty=false;
        if(card.options.motion){metrics.motionRenders++;card.canvas.dataset.previewMotionSeconds=card.motionSeconds.toFixed(3);card.canvas.dataset.previewRotation=String(Math.round(normalizedAngle(motionPose(card).rotation)*180/Math.PI));}
        card.canvas.dataset.previewReady='true';card.canvas.removeAttribute('aria-busy');
      }catch(error){
        card.failed=true;card.dirty=false;pending.delete(card);
        card.canvas.dataset.previewReady='error';card.canvas.removeAttribute('aria-busy');
        card.canvas.dispatchEvent(new CustomEvent('previewerror',{bubbles:true,detail:{message:error.message}}));
        const g=card.canvas.getContext('2d');g.clearRect(0,0,card.canvas.width,card.canvas.height);g.fillStyle='#35473c';g.font='14px Inter, sans-serif';g.fillText('Model unavailable',14,28);console.warn('Card model preview:',error.message);
      }
    }
  });
  metrics.maxFrameMs=Math.max(metrics.maxFrameMs,performance.now()-started);flushing=false;schedule();
}
function sweep(){for(const card of cards.values())if(!card.canvas.isConnected)card.api.dispose();}
function visibilityChanged(){for(const card of cards.values())card.lastMotion=null;if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;pending.clear();}else for(const card of cards.values()){card.visible=inViewport(card.canvas);if(card.visible&&(card.dirty||card.options.motion))queueCard(card);}}
function setupObservers(){
  if(observer||detachObserver)return;
  if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(entries=>{for(const item of entries){const card=cards.get(item.target);if(!card)continue;card.visible=item.isIntersecting;card.lastMotion=null;if(card.visible&&(card.dirty||card.options.motion))queueCard(card);else if(!card.visible)pending.delete(card);}});
  if(typeof ResizeObserver!=='undefined')resizeObserver=new ResizeObserver(entries=>{for(const item of entries){const card=cards.get(item.target);if(card)queueCard(card);}});
  const watchedScreens=new WeakSet();
  const watchScreens=()=>{for(const id of ['menu','modal','sarModeEntry']){const element=document.getElementById(id);if(element&&!watchedScreens.has(element)){watchedScreens.add(element);detachObserver.observe(element,{attributes:true,attributeFilter:['class','hidden']});}}};
  detachObserver=new MutationObserver(records=>{sweep();watchScreens();if(records.some(record=>record.type==='attributes'))for(const card of cards.values())if(card.options.motion){card.lastMotion=null;if(moving(card))queueCard(card);else pending.delete(card);}});
  detachObserver.observe(document.body,{childList:true,subtree:true});watchScreens();
  document.addEventListener('visibilitychange',visibilityChanged);
}
function stopObservers(){if(cards.size)return;observer?.disconnect();resizeObserver?.disconnect();detachObserver?.disconnect();observer=resizeObserver=detachObserver=null;document.removeEventListener('visibilitychange',visibilityChanged);if(frame)cancelAnimationFrame(frame);frame=0;pending.clear();renderer?.renderLists.dispose();}

export function mountCardPreview(canvas,options){
  const existing=cards.get(canvas),safeOptions={...options,...(options.kind==='operator'?{unarmed:true}:{})};
  if(existing){if(existing.failed||modelKey(existing.options)!==modelKey(safeOptions)){existing.generation++;releaseEntry(existing.entry);existing.entry=null;existing.options=safeOptions;existing.api.reset();}return existing.api;}
  setupObservers();
  const card={canvas,options:safeOptions,entry:null,generation:0,rotation:0,zoom:1,motionSeconds:0,lastMotion:null,lastMotionRender:-Infinity,visible:inViewport(canvas),dirty:true,failed:false,disposed:false,drag:null,listeners:[]};
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);card.listeners.push(()=>target.removeEventListener(type,handler));};
  const update=()=>{canvas.dataset.previewRotation=String(Math.round(card.rotation*180/Math.PI));canvas.dataset.previewZoom=card.zoom.toFixed(2);queueCard(card);};
  card.api={
    rotateBy(radians){card.rotation=normalizedAngle(card.rotation+radians);update();},
    zoomBy(amount){card.zoom=clamp(card.zoom+amount,.8,1.08);update();},
    reset(){card.rotation=0;card.zoom=1;card.failed=false;card.lastMotion=null;update();},
    state(){return {rotation:normalizedAngle(motionPose(card).rotation),zoom:card.zoom,visible:card.visible,ready:!!card.entry,unarmed:!!card.options.unarmed,motion:card.options.motion??null,motionSeconds:card.motionSeconds,breathY:card.entry?.breathing?.node.position.y??0,breathScaleY:card.entry?.breathing?.node.scale.y??1};},
    dispose(){if(card.disposed)return;card.disposed=true;if(card.drag&&canvas.hasPointerCapture?.(card.drag.id))canvas.releasePointerCapture(card.drag.id);card.drag=null;pending.delete(card);cards.delete(canvas);observer?.unobserve(canvas);resizeObserver?.unobserve(canvas);for(const remove of card.listeners)remove();releaseEntry(card.entry);card.entry=null;stopObservers();}
  };
  cards.set(canvas,card);canvas.setAttribute('aria-busy','true');
  const interactive=options.interactive??!options.motion;
  if(interactive){
  canvas.tabIndex=canvas.tabIndex<0?0:canvas.tabIndex;
  // Only horizontal touch movement is captured; wheel and vertical scrolling
  // remain native. Capture begins on the preview canvas, never Equip/Select.
  canvas.style.touchAction='pan-y';
  listen(canvas,'pointerdown',event=>{if(event.button!==0)return;card.drag={id:event.pointerId,x:event.clientX,y:event.clientY,rotating:false};canvas.focus({preventScroll:true});});
  listen(canvas,'pointermove',event=>{const drag=card.drag;if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.rotating){if(Math.abs(dx)<4)return;if(event.pointerType==='touch'&&Math.abs(dy)>Math.abs(dx)){card.drag=null;return;}drag.rotating=true;canvas.setPointerCapture?.(event.pointerId);}card.api.rotateBy(dx*.012);drag.x=event.clientX;drag.y=event.clientY;});
  const endDrag=event=>{if(card.drag?.id===event.pointerId){if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);card.drag=null;}};
  listen(canvas,'pointerup',endDrag);listen(canvas,'pointercancel',endDrag);listen(canvas,'lostpointercapture',()=>{card.drag=null;});
  const actions={left:()=>card.api.rotateBy(-Math.PI/12),right:()=>card.api.rotateBy(Math.PI/12),reset:()=>card.api.reset(),'zoom-in':()=>card.api.zoomBy(.04),'zoom-out':()=>card.api.zoomBy(-.04)};
  listen(canvas,'keydown',event=>{const action=({ArrowLeft:'left',ArrowRight:'right',Home:'reset','+':'zoom-in','=':'zoom-in','-':'zoom-out'})[event.key];if(action){event.preventDefault();actions[action]();}});
  for(const button of canvas.closest('.card-model-viewer')?.querySelectorAll('[data-preview-action]')||[]){const action=actions[button.dataset.previewAction];if(action)listen(button,'click',event=>{event.preventDefault();action();});}
  }
  observer?.observe(canvas);resizeObserver?.observe(canvas);update();return card.api;
}

export function clearCardPreviews(root=null){for(const card of [...cards.values()])if(!root||root===card.canvas||root.contains(card.canvas))card.api.dispose();}
export function previewDiagnostics(){return {...metrics,webglContexts:renderer?1:0,mountedCards:cards.size,visibleCards:[...cards.values()].filter(card=>card.visible).length,animatedCards:[...cards.values()].filter(moving).length,residentCardModels:[...cards.values()].filter(card=>card.entry).length,pendingCards:pending.size,staticModels:staticModels.size,thumbnailCount:thumbnails.size,animationScheduled:!!frame||flushing};}
