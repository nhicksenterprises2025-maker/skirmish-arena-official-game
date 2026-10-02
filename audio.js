(() => {
  'use strict';
  // All assets, variations and canonical weapon/event mappings live in LICENSES.json.
  // The game emits resolved events; this manager owns loading, mixing and playback.
  const KEY='sar.audio.volumes.v1',defaults={MASTER:.8,WEAPONS:.75,SFX:.7,UI:.5,AMBIENCE:.25};
  let volumes={...defaults};try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');for(const key of Object.keys(defaults))if(Number.isFinite(saved[key]))volumes[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
  let manifest=null,context=null,master=null,ambienceDuck=null,duckUntil=0,view={active:false,matchId:null,x:0,y:0},unlocked=false,ambientLoading=false;
  const buses=new Map(),buffers=new Map(),loads=new Map(),variations=new Map(),voices=new Set(),ambient=new Map(),feedback=new Map(),heardHits=new Map(),lastEvent=new Map();
  const limits={WEAPONS:20,SFX:18,UI:6,AMBIENCE:3},stats={played:0,dropped:0,maxVoices:0,failures:[],decoded:0,events:{},playedByEvent:{}};
  const random=()=>{const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0]/4294967296;};
  function failure(message){if(stats.failures.includes(message))return;stats.failures.push(message);console.warn('[Audio] '+message);}
  function getContext(){
    if(context)return context;const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)return null;
    try{context=new Constructor({latencyHint:'interactive'});master=context.createGain();master.gain.value=volumes.MASTER;
      const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=6;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.08;
      master.connect(limiter);limiter.connect(context.destination);
      ambienceDuck=context.createGain();ambienceDuck.gain.value=1;ambienceDuck.connect(master);
      for(const name of Object.keys(limits)){const gain=context.createGain();gain.gain.value=volumes[name];gain.connect(name==='AMBIENCE'?ambienceDuck:master);buses.set(name,gain);}
      return context;
    }catch(error){failure('Audio device unavailable: '+error.message);return null;}
  }
  async function load(id){
    if(buffers.has(id))return buffers.get(id);if(loads.has(id))return loads.get(id);
    const asset=manifest?.assets[id];if(!asset)return null;
    const pending=(async()=>{try{const c=getContext();if(!c)return null;const response=await fetch('assets/audio/'+asset.file);if(!response.ok)throw Error('HTTP '+response.status);const buffer=await c.decodeAudioData(await response.arrayBuffer());buffers.set(id,buffer);stats.decoded++;return buffer;}catch(error){failure(asset.file+': '+error.message);return null;}finally{loads.delete(id);}})();loads.set(id,pending);return pending;
  }
  async function preload(ids){let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<ids.length)await load(ids[cursor++]);}));}
  const ready=new Promise(resolve=>{
    const init=async()=>{try{const response=await fetch('assets/audio/LICENSES.json');if(!response.ok)throw Error('HTTP '+response.status);manifest=await response.json();await preload(Object.keys(manifest.assets).filter(id=>manifest.assets[id].critical));resolve(true);}catch(error){failure('Sound manifest unavailable: '+error.message);resolve(false);}};
    if(window.requestIdleCallback)window.requestIdleCallback(init,{timeout:500});else setTimeout(init,0);
  });
  function stop(voice){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();voices.delete(voice);}
  function choose(key,ids){
    if(!ids.length)return null;let state=variations.get(key);if(!state){state={bag:[],previous:null};variations.set(key,state);}
    if(!state.bag.length){state.bag=ids.slice();for(let i=state.bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[state.bag[i],state.bag[j]]=[state.bag[j],state.bag[i]];}const end=state.bag.length-1;if(end>0&&state.bag[end]===state.previous)[state.bag[0],state.bag[end]]=[state.bag[end],state.bag[0]];}
    const id=state.bag.pop();state.previous=id;return id;
  }
  function duckAmbience(amount,duration){if(!ambienceDuck||!context)return;ambienceDuck.gain.setTargetAtTime(amount,context.currentTime,.025);duckUntil=Math.max(duckUntil,context.currentTime+duration);}
  function play(key,definition,event={}){
    const c=context;if(!unlocked||!c||c.state!=='running'||document.hidden)return null;
    const category=definition.category||'SFX',bus=buses.get(category);if(!bus||volumes.MASTER<=0||volumes[category]<=0)return null;
    let attenuation=1,pan=0;
    if(definition.spatial){if(!view.active||event.matchId!==view.matchId)return null;const dx=(event.x??view.x)-view.x,dy=(event.y??view.y)-view.y,distance=Math.hypot(dx,dy);if(distance>1800)return null;attenuation=1/(1+(distance/420)**2);pan=Math.max(-.9,Math.min(.9,dx/700));}
    const id=choose(key,definition.assets),buffer=buffers.get(id);if(!buffer){if(id)void load(id);stats.dropped++;return null;}
    const priority=definition.priority||0,categoryVoices=[...voices].filter(v=>v.category===category);
    if(categoryVoices.length>=limits[category]||voices.size>=47){const candidates=categoryVoices.length>=limits[category]?categoryVoices:[...voices].filter(v=>v.category!=='AMBIENCE');const oldest=candidates.filter(v=>v.priority<=priority).sort((a,b)=>a.priority-b.priority||a.at-b.at)[0];if(!oldest){stats.dropped++;return null;}stop(oldest);}
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.loop=!!definition.loop;
    source.playbackRate.value=definition.loop||category==='UI'?1:1+(random()-.5)*(definition.rateVariation??.012);
    gain.gain.value=(definition.gain??.5)*attenuation*(definition.loop?1:.97+random()*.06);source.connect(gain);
    let stereo=null;if(definition.spatial&&c.createStereoPanner){stereo=c.createStereoPanner();stereo.pan.value=pan;gain.connect(stereo);stereo.connect(bus);}else gain.connect(bus);
    const voice={source,gain,pan:stereo,category,priority,at:c.currentTime,id};voices.add(voice);source.onended=()=>{source.disconnect();gain.disconnect();stereo?.disconnect();voices.delete(voice);};source.start();stats.played++;stats.playedByEvent[key]=(stats.playedByEvent[key]||0)+1;stats.maxVoices=Math.max(stats.maxVoices,voices.size);return voice;
  }
  function emit(event){
    if(!event?.type||!manifest)return;stats.events[event.type]=(stats.events[event.type]||0)+1;
    if(event.type==='shot'){const weapon=manifest.weapons[event.weapon];if(weapon){const voice=play('shot:'+event.weapon,{assets:weapon.fire,category:'WEAPONS',gain:weapon.fireGain??.66,rateVariation:weapon.rateVariation,spatial:true,priority:2},event);if(voice&&Math.hypot((event.x??view.x)-view.x,(event.y??view.y)-view.y)<500)duckAmbience(.68,.22);}return;}
    if(event.type==='resolved-hit'){
      // Coalesce same-shell pellets for one readable cue, preferring real head / kill results.
      const key=event.ownerId+':'+event.feedbackId+':'+event.targetId,existing=feedback.get(key);
      if(existing){existing.head||=event.head;existing.killing||=event.killing;}else feedback.set(key,{...event});return;
    }
    const base=manifest.events[event.type];if(!base)return;
    // Authoritative handling events already mark their weapon and reload phase.
    // Reuse that timing, routing only the recorded phase identity here.
    const handling=manifest.weapons[event.weapon]?.handlingEvents?.[event.type];
    const definition=handling?{...base,assets:handling,gain:base.gain*(manifest.weapons[event.weapon].handlingGain??1)}:base;
    const time=context?.currentTime||0,key=event.type+':'+(event.actorId??'ui'),minimum=event.type==='ui-hover'?.07:event.type==='dry-fire'?.22:event.type.startsWith('impact-')?.03:0;
    if(minimum&&time-(lastEvent.get(key)??-Infinity)<minimum)return;lastEvent.set(key,time);play(handling?event.type+':'+event.weapon:event.type,definition,event);
  }
  function flush(){
    const now=context?.currentTime||0;if(duckUntil&&now>=duckUntil){ambienceDuck?.gain.setTargetAtTime(1,now,.15);duckUntil=0;}for(const [key,entry] of heardHits)if(now-entry.at>4)heardHits.delete(key);
    for(const [key,hit] of feedback){const previous=heardHits.get(key);if(!previous||hit.head&&!previous.head){const type=hit.head?'head-hit':'body-hit';if(play(type,manifest.events[type],hit))duckAmbience(.55,.25);}if(hit.killing&&!previous?.killing)play('kill',manifest.events.kill,hit);heardHits.set(key,{head:hit.head||previous?.head,killing:hit.killing||previous?.killing,at:now});}feedback.clear();
  }
  async function startAmbience(){
    if(ambientLoading||!view.active||!unlocked||!manifest||volumes.AMBIENCE<=0||volumes.MASTER<=0)return;
    ambientLoading=true;try{for(const type of ['ambience-wind','ambience-suburb','ambience-traffic']){if(ambient.has(type))continue;const def=manifest.events[type];await load(def.assets[0]);if(!view.active||document.hidden||!unlocked)break;const voice=play(type,def);if(voice)ambient.set(type,voice);}}finally{ambientLoading=false;}
  }
  function stopAmbience(){for(const voice of ambient.values())stop(voice);ambient.clear();duckUntil=0;if(ambienceDuck&&context)ambienceDuck.gain.setTargetAtTime(1,context.currentTime,.05);}
  function setView(next){const changed=next.active!==view.active||next.matchId!==view.matchId;view={...view,...next};if(changed&&!view.active){stopAmbience();for(const voice of [...voices])if(voice.category==='WEAPONS'||voice.category==='SFX')stop(voice);feedback.clear();}if(view.active)void startAmbience();}
  function setVolume(category,value){if(!(category in defaults))return;volumes[category]=Math.max(0,Math.min(1,Number(value)||0));const c=getContext(),gain=category==='MASTER'?master:buses.get(category);if(c&&gain)gain.gain.setTargetAtTime(volumes[category],c.currentTime,.015);try{localStorage.setItem(KEY,JSON.stringify(volumes));}catch{}if(!volumes.AMBIENCE||!volumes.MASTER)stopAmbience();else void startAmbience();}
  function settingsHtml(){return '<div class="settings-section"><h3>Audio</h3>'+Object.keys(defaults).map(key=>'<label class="audio-volume"><span>'+key+'</span><input type="range" min="0" max="100" value="'+Math.round(volumes[key]*100)+'" data-audio-volume="'+key+'" aria-label="'+key+' volume"><output>'+Math.round(volumes[key]*100)+'%</output></label>').join('')+'</div>';}
  async function unlock(){unlocked=true;const c=getContext();if(!c)return;try{if(c.state!=='running')await c.resume();await ready;void startAmbience();}catch(error){failure('Could not resume audio: '+error.message);}}
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true});
  document.addEventListener('pointerover',event=>{const target=event.target.closest?.('button');if(target&&!target.disabled&&!target.contains(event.relatedTarget))emit({type:'ui-hover'});},{passive:true});
  document.addEventListener('click',event=>{const target=event.target.closest?.('button');if(!target||target.disabled)return;const back=/back|close|return|cancel|resume|menu/.test(target.dataset.action||target.dataset.socialAction||target.textContent.toLowerCase());emit({type:back?'ui-back':'ui-click'});},{capture:true,passive:true});
  document.addEventListener('input',event=>{const key=event.target.dataset?.audioVolume;if(!key)return;setVolume(key,Number(event.target.value)/100);if(event.target.nextElementSibling)event.target.nextElementSibling.textContent=Math.round(volumes[key]*100)+'%';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){setView({...view,active:false});void context?.suspend();}});
  window.addEventListener('blur',()=>{setView({...view,active:false});void context?.suspend();});
  window.addEventListener('focus',()=>{if(unlocked&&!document.hidden)void context?.resume().catch(()=>{});});
  window.SARAudio={emit,flush,setView,setVolume,settingsHtml,ready,getVolumes:()=>({...volumes}),getDiagnostics:()=>({...stats,events:{...stats.events},voices:voices.size,buffers:buffers.size,contextState:context?.state||'uninitialized',ambient:ambient.size})};
})();
