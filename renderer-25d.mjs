import * as THREE from './vendor/three.module.js';
import {buildEnvironment} from './environment-25d.mjs';
import {buildOperator,animateOperator,setOperatorWeapon,setOperatorPresentation,disposeModel} from './models-25d.mjs';
import {loadAssetLibrary} from './asset-loader-25d.mjs';

// Presentation only: one watched match, driven by the authoritative snapshot.
// No simulation timers, new colliders or extra telemetry are introduced here.
const clamp=THREE.MathUtils.clamp;
function overlay(id,z){const c=document.createElement('canvas');c.id=id;c.style.cssText=`position:fixed;inset:0;z-index:${z};pointer-events:none;display:none`;document.body.appendChild(c);return c;}
function round(g,x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r);}
export function createRenderer(snapshot){
  const theme=getComputedStyle(document.documentElement),uiColors={panel:theme.getPropertyValue('--sky-surface-dark').trim()||'#192C40',border:theme.getPropertyValue('--sky-border-dark').trim()||'#37556F',text:theme.getPropertyValue('--sky-text-dark').trim()||'#F0F7FC'};
  const canvas=overlay('game3d',1);canvas.setAttribute('aria-label','Brightfield Blocks dimensional battlefield');
  const labels=overlay('game3dLabels',3),mini=overlay('game3dMap',6);mini.style.inset='auto';
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(1.5,devicePixelRatio||1));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x97ad83);scene.fog=new THREE.Fog(0x97ad83,3200,7000);
  const camera=new THREE.OrthographicCamera(-800,800,500,-500,1,9000);
  scene.add(new THREE.HemisphereLight(0xe9f2ec,0x65775f,2.1));
  const sun=new THREE.DirectionalLight(0xffefda,2.35);sun.castShadow=true;
  sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.near=100;sun.shadow.camera.far=4300;sun.shadow.bias=-.00045;sun.shadow.normalBias=2.4;
  scene.add(sun,sun.target);
  const environment=buildEnvironment(scene,snapshot),actorRoot=new THREE.Group();scene.add(actorRoot);
  const actors=new Map(),shotRoot=new THREE.Group(),particleRoot=new THREE.Group();scene.add(shotRoot,particleRoot);
  const shotGeometry=new THREE.CylinderGeometry(1.4,1.4,1,5),shotMaterial=new THREE.MeshBasicMaterial({color:0xffe9a4}),shots=[];
  const particleGeometry=new THREE.IcosahedronGeometry(1,0),particleMaterials=new Map(),particles=[];
  const ray=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3(),projected=new THREE.Vector3();
  let width=innerWidth,height=innerHeight,active=false,lastTime=null,assetState='loading',assetCount=0,lastSnapshot=snapshot,frames=0,frameCost=0;
  loadAssetLibrary().then(lib=>{assetCount=environment.installAssets(lib);assetState='ready';}).catch(error=>{assetState='procedural fallback';console.warn('Blender prop library unavailable; procedural battlefield retained.',error.message);});
  function resize(w,h){width=Math.max(1,w);height=Math.max(1,h);renderer.setSize(width,height,false);const ratio=Math.min(2,devicePixelRatio||1);labels.width=Math.round(width*ratio);labels.height=Math.round(height*ratio);labels.style.width=width+'px';labels.style.height=height+'px';}
  function cameraAt(s){
    const aspect=width/height,span=s.tactical?Math.max(s.world.w+260,(s.world.h+260)*aspect):clamp(width*1.05,950,1800)/(s.zoom||1),halfH=span/(2*aspect);
    camera.left=-span/2;camera.right=span/2;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
    const fx=s.tactical?s.world.w/2:s.focus.x,fz=s.tactical?s.world.h/2:s.focus.y;
    camera.position.set(fx,1500,fz+850);camera.lookAt(fx,0,fz);camera.updateMatrixWorld();
    const shadowSpan=s.tactical?2600:Math.min(1700,span*.8+160);
    sun.position.set(fx-700,1800,fz-650);sun.target.position.set(fx,0,fz);sun.target.updateMatrixWorld();
    Object.assign(sun.shadow.camera,{left:-shadowSpan,right:shadowSpan,top:shadowSpan,bottom:-shadowSpan});sun.shadow.camera.updateProjectionMatrix();
  }
  function miniMap(s){
    if(s.mode==='menu'){mini.style.display='none';return;}
    const full=!!s.fullMap,w=full?Math.min(width-30,690):Math.min(190,width*.23),h=full?Math.min(height-30,455):Math.min(142,width*.172),ratio=Math.min(2,devicePixelRatio||1);
    const pw=Math.round(w*ratio),ph=Math.round(h*ratio);if(mini.width!==pw)mini.width=pw;if(mini.height!==ph)mini.height=ph;
    mini.style.width=w+'px';mini.style.height=h+'px';mini.style.left=full?'50%':'12px';mini.style.top=full?'50%':'75px';mini.style.transform=full?'translate(-50%,-50%)':'none';mini.style.display='block';
    const g=mini.getContext('2d');g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,w,h);g.fillStyle=uiColors.panel;round(g,0,0,w,h,6);g.fill();g.strokeStyle=uiColors.border;g.lineWidth=1;round(g,.5,.5,w-1,h-1,5.5);g.stroke();
    const pad=full?25:12,sx=(w-pad*2)/s.world.w,sy=(h-pad*2)/s.world.h;g.fillStyle='#819f61';g.fillRect(pad,pad,w-pad*2,h-pad*2);
    g.fillStyle='#737f78';for(const r of s.geometry.roads)g.fillRect(pad+r.x*sx,pad+r.y*sy,r.w*sx,r.h*sy);
    g.fillStyle='#d2d5c0';for(const f of s.geometry.floors)g.fillRect(pad+f.x*sx,pad+f.y*sy,f.w*sx,f.h*sy);
    g.fillStyle='#526b4c';for(const t of s.geometry.solids.filter(o=>o.type==='circle')){g.beginPath();g.arc(pad+t.x*sx,pad+t.y*sy,Math.max(.9,t.r*sx),0,Math.PI*2);g.fill();}
    for(const a of s.actors){if(a.dead||a.mapVisible===false)continue;const p=a.presentation,x=pad+a.x*sx,y=pad+a.y*sy,r=full?4:2.7;g.beginPath();if(p.side==='red'){g.moveTo(x,y-r);g.lineTo(x+r,y);g.lineTo(x,y+r);g.lineTo(x-r,y);g.closePath();}else g.arc(x,y,r,0,Math.PI*2);g.fillStyle=p.color;g.fill();g.strokeStyle=p.isFocus?'#f0f7fc':'#101c2a';g.lineWidth=p.isFocus?1.6:.8;g.stroke();}
    g.strokeStyle=uiColors.border;g.lineWidth=1;g.strokeRect(pad,pad,w-pad*2,h-pad*2);g.fillStyle=uiColors.text;g.font='700 '+(full?11:8)+'px system-ui';g.fillText(full?'BRIGHTFIELD BLOCKS / TACTICAL MAP':'BRIGHTFIELD',pad,full?18:10);
    if(!full){g.textAlign='right';g.fillStyle='#afbf9d';g.fillText('N',w-pad,10);g.textAlign='start';}
  }
  function drawLabels(s){
    const g=labels.getContext('2d'),ratio=labels.width/width;g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,width,height);
    if(s.mode==='menu'||s.fullMap)return;
    const placed=[],scale=clamp(width/(camera.right-camera.left),.68,1.15),barW=s.tactical?34:Math.round(48*scale),fontSize=s.tactical?9:10;
    const sorted=s.actors.filter(a=>!a.dead).sort((a,b)=>Number(b.isPlayer||b.id===s.focusActorId)-Number(a.isPlayer||a.id===s.focusActorId));
    for(const a of sorted){
      const entity=actors.get(a.id);if(!entity?.group.visible)continue;
      projected.set(a.x,(entity.labelHeight||68)+8+entity.group.position.y,a.y).project(camera);if(Math.abs(projected.x)>1.07||Math.abs(projected.y)>1.07||projected.z<-1||projected.z>1)continue;
      const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height,p=a.presentation,friend=p.relation==='self'||p.relation==='ally'||p.isFocus,health=clamp(a.hp/(a.maxHP||250),0,1),team=p.color;
      const name=(p.relation==='self'?'YOU':a.name||'OPERATOR')+(s.perspective.mode==='deathmatch'?(p.isFocus?' ◉':''):(p.side==='blue'?' · B':' · R'));g.font=`700 ${fontSize}px ui-monospace,Consolas,monospace`;const labelW=Math.max(barW,g.measureText(name).width+13),left=x-labelW/2,top=y-21;
      const overlap=placed.some(p=>Math.abs(p.x-x)<(p.w+labelW)*.5&&Math.abs(p.y-y)<26);g.globalAlpha=(overlap&&!a.isPlayer)?0.6:1;
      g.fillStyle=p.isFocus?'#192c40':'rgba(16,28,42,.88)';round(g,left,top,labelW,16,2);g.fill();g.fillStyle=team;g.fillRect(left,top,2,16);g.fillStyle=friend?'#f0f7fc':'#faecec';g.textAlign='center';g.fillText(name,x+.5,top+11.5);
      g.fillStyle='rgba(16,29,24,.9)';round(g,x-barW/2-1,y-3,barW+2,7,1.5);g.fill();g.fillStyle=health<=.3?'#ef8070':team;g.fillRect(x-barW/2,y-2,Math.max(0,barW*health),4);
      if(a.isPlayer){g.strokeStyle='#ecf0d5';g.lineWidth=.7;g.strokeRect(x-barW/2-1,y-3,barW+2,7);}
      if(a.reloading){g.fillStyle='#2d3a31';g.fillRect(x-barW/2,y+6,barW,2);g.fillStyle='#e0c484';g.fillRect(x-barW/2,y+6,barW*clamp(a.reloadProgress,0,1),2);}
      placed.push({x,y,w:labelW});g.globalAlpha=1;
    }
    g.save();g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=3.5;
    for(const n of s.damageNumbers||[]){
      projected.set(n.x,100,n.y).project(camera);if(Math.abs(projected.x)>1.07||Math.abs(projected.y)>1.07||projected.z<-1||projected.z>1)continue;
      const x=(projected.x*.5+.5)*width+n.offsetX,y=(-projected.y*.5+.5)*height-12-n.rise;
      g.globalAlpha=n.alpha;g.font=`${n.killing?800:700} ${n.head?19:17}px ui-monospace,Consolas,monospace`;
      g.strokeStyle='rgba(16,29,24,.94)';g.strokeText(n.text,x,y);g.fillStyle=n.head?'#f3ce8a':'#f4f4e7';g.fillText(n.text,x,y);
    }
    g.restore();
  }
  function updateShots(s){
    while(shots.length<s.projectiles.length){const mesh=new THREE.Mesh(shotGeometry,shotMaterial);shotRoot.add(mesh);shots.push(mesh);}
    shots.forEach((m,i)=>{m.visible=i<s.projectiles.length;if(!m.visible)return;const p=s.projectiles[i],length=p.weapon==='LW Tundra'?25:p.weapon==='Pump Shotgun'?9:16;m.position.set(p.x,29,p.y);m.scale.set(1,length,1);m.rotation.set(0,-(p.angle||0),Math.PI/2);});
    const display=(s.particles||[]).slice(-160);
    while(particles.length<display.length){const m=new THREE.Mesh(particleGeometry,shotMaterial);particleRoot.add(m);particles.push(m);}
    particles.forEach((m,i)=>{m.visible=i<display.length;if(!m.visible)return;const p=display[i],alpha=1-p.age/p.life;if(alpha<=0){m.visible=false;return;}const key=p.color||'#d6c08a';if(!particleMaterials.has(key))particleMaterials.set(key,new THREE.MeshBasicMaterial({color:key}));m.material=particleMaterials.get(key);m.position.set(p.x,p.type==='casing'?7:18+alpha*7,p.y);m.scale.setScalar(Math.max(.7,(p.size||2)*alpha));});
  }
  function render(s){
    const started=performance.now();lastSnapshot=s;
    if(!active){active=true;lastTime=null;canvas.style.display=labels.style.display='block';document.querySelector('#game').style.opacity='0';}
    const time=s.time??performance.now(),dt=lastTime===null?1/60:clamp((time-lastTime)/1000,0,.06);lastTime=time;
    cameraAt(s);environment.update(s,dt);const seen=new Set();
    for(const a of s.actors){
      seen.add(a.id);let e=actors.get(a.id);
      if(!e){e=buildOperator(a.team,a.skin,a.skinPalette);actors.set(a.id,e);actorRoot.add(e.group);}
      setOperatorPresentation(e,a.presentation);
      if(e.gunName!==a.weapon)setOperatorWeapon(e,a.weapon);
      animateOperator(e,a,time,dt);
      // The visible interior floor is six units above the lawn. Keep boots on
      // that surface while preserving the simulation's horizontal position.
      e.group.position.y=s.geometry.floors.some(f=>a.x>f.x&&a.x<f.x+f.w&&a.y>f.y&&a.y<f.y+f.h)?6:0;
    }
    for(const [id,e] of actors)if(!seen.has(id)){actorRoot.remove(e.group);disposeModel(e.group);actors.delete(id);}
    updateShots(s);renderer.render(scene,camera);drawLabels(s);miniMap(s);frames++;frameCost+=(performance.now()-started-frameCost)/Math.min(frames,120);
  }
  function hide(){active=false;lastTime=null;canvas.style.display=labels.style.display=mini.style.display='none';document.querySelector('#game').style.opacity='1';}
  function screenToWorld(x,y){if(!active)return null;ray.setFromCamera(new THREE.Vector2(x/width*2-1,-y/height*2+1),camera);if(!ray.ray.intersectPlane(groundPlane,hit))return null;return {x:clamp(hit.x,0,snapshot.world.w),y:clamp(hit.z,0,snapshot.world.h)};}
  function diagnostics(){return {active,assetState,assetCount,actors:actors.size,labels:active&&lastSnapshot.mode!=='menu',view:environment.stats,roofs:environment.houses.map(h=>({id:h.floor.id,opacity:+h.opacity.toFixed(3)})),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,averageFrameCostMs:+frameCost.toFixed(2),pixelRatio:renderer.getPixelRatio(),watchedMatch:lastSnapshot.matchId};}
  resize(width,height);return {render,resize,hide,screenToWorld,diagnostics};
}
