(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    const playback=root.SARReplayPlayback=api.create({begin:canEnter=>root.SAR.beginReplayView(canEnter),end:()=>root.SAR.finishReplayView(),account:()=>root.SARCloud?.state?.account?.id,weapons:()=>root.SAR25D?.weaponNames?.(),now:()=>performance.now(),size:()=>({w:innerWidth,h:innerHeight}),notify:state=>root.dispatchEvent(new CustomEvent('sar:replay-state',{detail:state}))});
    let drag=null;
    document.addEventListener('keydown',event=>{
      if(!playback.state().active||event.target.closest('input,select,textarea,dialog'))return;
      if(event.code==='Escape'){event.preventDefault();event.stopPropagation();playback.close();void root.SARReplaysUI?.open();return;}
      if(event.target.closest('button'))return;
      if(playback.state().camera==='free'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code)){event.preventDefault();const step=70;playback.moveCamera(event.code==='ArrowLeft'?-step:event.code==='ArrowRight'?step:0,event.code==='ArrowUp'?-step:event.code==='ArrowDown'?step:0);}
    },true);
    document.addEventListener('mousedown',event=>{if(playback.state().active&&playback.state().camera==='free'&&event.button===0&&event.target.id==='game'){document.activeElement?.blur?.();drag={x:event.clientX,y:event.clientY};event.preventDefault();}});
    document.addEventListener('mousemove',event=>{if(!drag)return;if(!playback.state().active||playback.state().camera!=='free'){drag=null;return;}const scale=Math.max(950,Math.min(1800,innerWidth*1.05))/(innerWidth*(playback.snapshot().zoom||1));playback.moveCamera((drag.x-event.clientX)*scale,(drag.y-event.clientY)*scale);drag={x:event.clientX,y:event.clientY};});
    document.addEventListener('mouseup',()=>{drag=null;});root.addEventListener('blur',()=>{drag=null;});
  }
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const SCHEMA=1,PRESENTATION='snapshot-25d-1',clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function decode(previous,frame){
    if(frame.snapshot)return frame.snapshot;
    const delta=frame.delta,snapshot={...previous,...delta};
    if(delta?.actors&&previous?.actors?.length===delta.actors.length&&previous.actors.every((actor,i)=>actor.id===delta.actors[i].id))snapshot.actors=delta.actors.map((actor,i)=>({...previous.actors[i],...actor}));
    return snapshot;
  }
  function supported(record,availableWeapons){
    const fail=error=>({supported:false,error});
    if(record?.schemaVersion!==SCHEMA||record?.metadata?.presentationVersion!==PRESENTATION)return fail('This replay uses an unsupported recording version.');
    if(typeof record.id!=='string'||!record.id||typeof record.metadata.map?.id!=='string'||typeof record.metadata.map?.revision!=='string'||!record.metadata.weaponConfiguration)return fail('This replay is missing its original rules or map.');
    const duration=record.metadata.durationMs,frames=record.frames,geometry=record.geometry;
    if(!Number.isFinite(duration)||duration<0||duration>7200000||!Array.isArray(frames)||!frames.length||frames.length>72000)return fail('This replay has incomplete recording data.');
    if(!geometry||!['roads','floors','solids','surfaces','decor','outerWorld'].every(key=>Array.isArray(geometry[key])&&geometry[key].length<50000))return fail('This replay is missing its original map.');
    let previous=-1,snapshot=null,keyAt=0,segmentFrames=0;
    for(const frame of frames){
      if(!frame||(!frame.snapshot&&!frame.delta)||frame.snapshot&&frame.delta||frame.delta&&typeof frame.delta!=='object')return fail('This replay has incomplete frame data.');
      if(frame.delta?.actors&&!Array.isArray(frame.delta.actors)||frame.delta?.actors?.some(actor=>!actor||typeof actor!=='object'))return fail('This replay has incomplete actor data.');
      if(frame.snapshot){keyAt=frame.at;segmentFrames=0;}
      else if(!snapshot||frame.at-keyAt>6000||++segmentFrames>120)return fail('This replay is missing a required reconstruction frame.');
      const s=decode(snapshot,frame);snapshot=s;
      if(!Number.isFinite(frame?.at)||frame.at<0||frame.at<previous||frame.at>duration||!s||!Number.isFinite(s.time)||!Number.isFinite(s.world?.w)||!Number.isFinite(s.world?.h)||s.world.w<=0||s.world.h<=0||s.world.w>20000||s.world.h>20000||!Array.isArray(s.actors)||s.actors.length>100||!Array.isArray(s.projectiles)||s.projectiles.length>5000)return fail('This replay has incomplete frame data.');
      for(const actor of s.actors)if(!actor||!Object.hasOwn(record.metadata.weaponConfiguration,actor.weapon)||availableWeapons&&!availableWeapons.includes(actor.weapon)||![actor.x,actor.y,actor.angle,actor.hp].every(Number.isFinite)||!actor.presentation||!actor.skinPalette)return fail('This replay uses an unsupported operator or weapon presentation.');
      previous=frame.at;
    }
    if(frames[0].at!==0||frames.at(-1).at!==duration)return fail('This replay is missing its beginning or end.');
    if(!Array.isArray(record.events)||record.events.length>100000||record.events.some(event=>!Number.isFinite(event?.at)||event.at<0||event.at>duration))return fail('This replay has incomplete timeline data.');
    return {supported:true,error:null};
  }
  function create({begin=async()=>{},end=()=>{},account=()=>null,weapons=()=>null,now=()=>Date.now(),size=()=>({w:1440,h:900}),notify=()=>{}}={}){
    let record=null,position=0,playing=false,rate=1,cameraMode='follow',actorId=null,free=null,last=null,lastNotify=-Infinity,generation=0,pending=false,revision=0,owner=null,keys=[],cacheKey=-1,cache=new Map(),shots=new Map(),timeline=[];
    function state(){const actor=record?frameAt(index(position)).actors.find(a=>a.id===actorId):null;return {active:!!record,pending,playing,position,duration:record?.metadata.durationMs||0,speed:rate,camera:cameraMode,actorId,actorName:actor?.name||null,metadata:record?.metadata||null,events:timeline};}
    function emit(){lastNotify=now();notify(state());}
    function index(at){let lo=0,hi=record.frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(record.frames[mid].at<=at)lo=mid;else hi=mid-1;}return lo;}
    function frameAt(i){
      if(cache.has(i))return cache.get(i);
      let lo=0,hi=keys.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(keys[mid]<=i)lo=mid;else hi=mid-1;}const key=keys[lo];
      if(cacheKey!==key){cacheKey=key;cache.clear();cache.set(key,record.frames[key].snapshot);}
      let j=key,previous=cache.get(key);for(const [at,snapshot]of cache)if(at>j&&at<=i){j=at;previous=snapshot;}
      while(j<i){j++;previous=decode(previous,record.frames[j]);cache.set(j,previous);}return previous;
    }
    function changePosition(value){position=clamp(Number(value)||0,0,record.metadata.durationMs);last=now();revision++;emit();}
    async function open(value,{canEnter=()=>true}={}){
      if(typeof canEnter!=='function')throw Error('Replay readiness guard must be a function.');
      const check=supported(value,weapons());if(!check.supported)throw Error(check.error);
      if(record||pending)throw Error('A replay is already open.');
      const attempt=++generation,requestedOwner=account();pending=true;
      try{const entered=await begin(canEnter);if(entered===false)return false;if(attempt!==generation){end();return false;}if(requestedOwner!==account()){end();throw Error('Your account changed while this replay was loading.');}const ready=supported(value,weapons());if(!ready.supported){end();throw Error(ready.error);}record=value;keys=value.frames.flatMap((frame,i)=>frame.snapshot?[i]:[]);cacheKey=-1;cache.clear();shots.clear();timeline=[];for(const event of value.events){if(event.type==='shot'){if(!shots.has(event.actorId))shots.set(event.actorId,[]);shots.get(event.actorId).push(event);}else timeline.push(event);}for(const events of shots.values())events.sort((a,b)=>a.at-b.at);owner=requestedOwner;position=0;playing=false;rate=1;cameraMode='follow';actorId=value.frames[0].snapshot.actors[0]?.id??null;free=null;last=now();revision++;pending=false;emit();return true;}
      finally{pending=false;}
    }
    function close(){++generation;if(!record&&!pending)return;const opened=!!record;record=null;cache.clear();shots.clear();timeline=[];keys=[];playing=false;last=null;if(opened)end();emit();}
    function tick(time=now()){
      if(!record)return;if(owner!==account()){close();return;}const elapsed=last===null?0:Math.max(0,time-last);last=time;
      if(playing){position=clamp(position+elapsed*rate,0,record.metadata.durationMs);if(position===record.metadata.durationMs)playing=false;}
      if(time-lastNotify>=100)emit();
    }
    function snapshot(){
      if(!record)return null;
      const i=index(position),a=record.frames[i],b=record.frames[i+1],fraction=b?clamp((position-a.at)/(b.at-a.at||1),0,1):0,s=frameAt(i),next=b?frameAt(i+1):null,nextActors=new Map((next?.actors||[]).map(actor=>[actor.id,actor]));
      const mix=(x,y)=>x+(y-x)*fraction,angle=(x,y)=>x+Math.atan2(Math.sin(y-x),Math.cos(y-x))*fraction;
      const actors=s.actors.map(actor=>{
        const next=nextActors.get(actor.id),value={...actor,presentation:{...actor.presentation},visual:{...actor.visual},mapVisible:!actor.dead,renderVisible:actor.renderVisible!==false};
        // Death, spawn and teleports are resolved events, never interpolated through.
        if(next&&actor.dead===next.dead&&Math.hypot(next.x-actor.x,next.y-actor.y)<120){
          for(const key of ['x','y','vx','vy','adsBlend','reloadProgress','reloadRemaining','deadTime','respawnRemaining','respawnProgress','shotAge'])if(Number.isFinite(actor[key])&&Number.isFinite(next[key]))value[key]=mix(actor[key],next[key]);
          value.angle=angle(actor.angle,next.angle);
          for(const key of ['phase','move','sprint','bob','settle'])if(Number.isFinite(actor.visual?.[key])&&Number.isFinite(next.visual?.[key]))value.visual[key]=mix(actor.visual[key],next.visual[key]);
          for(const key of ['turn','lower'])if(Number.isFinite(actor.visual?.[key])&&Number.isFinite(next.visual?.[key]))value.visual[key]=angle(actor.visual[key],next.visual[key]);
        }
        const events=shots.get(actor.id);
        if(events?.length&&events[0].at<=position){
          let lo=0,hi=events.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(events[mid].at<=position)lo=mid;else hi=mid-1;}const event=events[lo];
          if(event.weapon===value.weapon){const age=(position-event.at)/1000,window=Math.min((value.fireInterval||.3)*.82,value.weapon==='War Head LMG'?.38:.24),phase=age/window;
            value.shotAge=age;value.shotId=event.shotId;value.muzzle=!value.dead&&age<.065;value.muzzleFlash=value.dead?0:clamp(1-age/.065,0,1);value.recoil=value.dead||phase>1?0:phase<.13?Math.sin(phase/.13*Math.PI/2):Math.pow(1-(phase-.13)/.87,2);
          }
        }
        value.presentation.isFocus=value.id===actorId;return value;
      });
      const focus=actors.find(actor=>actor.id===actorId)||actors[0],{w,h}=size(),tactical=cameraMode==='tactical',point=cameraMode==='free'?free||focus:focus,world=s.world;
      const presentation=root.SARTeamPresentation?.create({mode:record.metadata.mode,participants:actors,followId:focus?.id,followTeam:!tactical});
      if(presentation)for(const actor of actors)actor.presentation=presentation.actor(actor);
      const fit=Math.max(1,w/(world.w+300),h/(world.h+300)),zoom=fit;
      return {...s,time:b?mix(s.time,next.time):s.time,world:{...world},map:{...record.metadata.map},mapId:record.metadata.map.id,mapVersion:record.metadata.map.revision,geometry:record.geometry,weaponConfiguration:record.metadata.weaponConfiguration,
        mode:'replay',actors,focus:{x:point?.x??world.w/2,y:point?.y??world.h/2},focusActorId:actorId,focusTeam:focus?.team??null,tactical,zoom,fullMap:false,hudMinimapTop:75,hudMinimapBottom:h-110,damageNumbers:[],
        objectives:presentation?(s.objectives||[]).map(zone=>({...zone,presentation:presentation.team(zone.owner),capturingPresentation:presentation.team(zone.capturingTeam)})):s.objectives,
        replay:{id:record.id,presentationVersion:PRESENTATION,revision,position,paused:!playing},perspective:{mode:record.metadata.mode,kind:presentation?.kind||'spectator',label:presentation?.perspectiveLabel||'REPLAY'}};
    }
    return {open,close,tick,snapshot,state,diagnostics:()=>({cachedFrames:cache.size,recordedFrames:record?.frames.length||0,keyframes:keys.length}),supported:value=>supported(value,weapons()),
      play(){if(record){if(position>=record.metadata.durationMs)changePosition(0);playing=true;last=now();emit();}},
      pause(){if(record){tick();playing=false;emit();}},
      restart(){if(record){playing=false;changePosition(0);}},
      seek(value){if(record)changePosition(value);},
      speed(value){if(![.5,1,2].includes(Number(value)))throw Error('Replay speed must be 0.5, 1 or 2.');if(record){tick();rate=Number(value);emit();}},
      cyclePlayer(direction=1){if(!record)return;const actors=frameAt(index(position)).actors;if(!actors.length)return;const indexNow=actors.findIndex(actor=>actor.id===actorId);actorId=actors[(indexNow+(direction<0?-1:1)+actors.length)%actors.length].id;emit();},
      camera(value){if(!['follow','tactical','free'].includes(value))throw Error('Unsupported replay camera.');if(record){if(value==='free')free={...snapshot().focus};cameraMode=value;emit();}},
      moveCamera(dx,dy){if(record&&cameraMode==='free'){const world=record.frames[0].snapshot.world;free.x=clamp(free.x+(Number(dx)||0),0,world.w);free.y=clamp(free.y+(Number(dy)||0),0,world.h);emit();}}
    };
  }
  return {SCHEMA,PRESENTATION,supported,create};
});
