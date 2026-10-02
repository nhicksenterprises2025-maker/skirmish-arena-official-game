'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/LICENSES.json'),'utf8')),checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function wav(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');let format,data;
 for(let at=12;at+8<=bytes.length;){const id=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4);if(id==='fmt ')format={type:bytes.readUInt16LE(at+8),channels:bytes.readUInt16LE(at+10),rate:bytes.readUInt32LE(at+12),bits:bytes.readUInt16LE(at+22)};if(id==='data')data=bytes.subarray(at+8,at+8+length);at+=8+length+(length%2);}
 assert.deepEqual(format,{type:1,channels:1,rate:24000,bits:16});assert.ok(data);const samples=Float64Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);return samples;
}
const sources=new Map(manifest.sources.map(s=>[s.id,s])),samples=new Map(),fireEntries=[],handling=[];
for(const [id,asset] of Object.entries(manifest.assets)){
 const bytes=fs.readFileSync(path.join(root,'assets/audio',asset.file));assert.equal(hash(bytes),asset.sha256,id);assert.equal(bytes.length,asset.bytes,id);
 assert.ok(sources.has(asset.source),id);for(const c of asset.components||[])assert.ok(sources.has(c.source),id+' component license');
 if(asset.file.endsWith('.wav')){const decoded=wav(bytes),peak=decoded.reduce((n,x)=>Math.max(n,Math.abs(x)),0);assert.ok(peak>0&&peak<.98,id);assert.ok(Math.abs(decoded.length/24000-asset.duration)<.00006,id+' duration');assert.ok(Math.abs(peak-asset.peak)<.00006,id+' actual decoded peak');samples.set(id,decoded);}
}
for(const source of sources.values()){assert.equal(source.license,'CC0-1.0');assert.ok(source.sourceURL&&source.licenseURL&&source.author);const original=fs.readFileSync(path.join(root,'assets/audio',source.filename));assert.equal(hash(original),source.sha256,source.id+' original retained');}
pass('Every runtime asset has exact bytes, accurate PCM duration/peak, licensed component provenance; all retained CC0 originals remain unchanged');
const fireSets=new Set(),sourceGuns=new Set(),sequences=new Set();
for(const [name,w] of Object.entries(manifest.weapons)){
 assert.equal(w.fire.length,4,name+' four authored recording variations');assert.ok(w.fireGain>=.5&&w.fireGain<=.8,name+' bounded class mix');
 const takes=w.fire.map(id=>{const c=manifest.assets[id].components[0];return c.member+':'+c.startSeconds;});assert.equal(new Set(takes).size,4,name+' separate source recording cuts');
 const hashes=w.fire.map(id=>manifest.assets[id].sha256),set=hashes.slice().sort().join(':');assert.equal(new Set(hashes).size,w.fire.length);assert.ok(!fireSets.has(set),name);fireSets.add(set);
 const gun=new Set(w.fire.map(id=>manifest.assets[id].originalMember.split('/')[1]));assert.equal(gun.size,1);const firearm=[...gun][0];assert.ok(!sourceGuns.has(firearm),name+' distinct source firearm');sourceGuns.add(firearm);
 for(const id of w.fire){const pcm=samples.get(id),peak=pcm.reduce((n,v)=>Math.max(n,Math.abs(v)),0),onset=pcm.findIndex(v=>Math.abs(v)>peak*.2)/24;assert.ok(onset>=0&&onset<4,id+' attack must begin within four ms of its authoritative event');fireEntries.push({name,id,source:manifest.assets[id].originalMember,attackMs:Math.round(onset*100)/100});}
 const events=w.handling==='shell'?['shell-insert','reload-ready']:['mag-out','mag-in','reload-ready'];
 assert.deepEqual(Object.keys(w.handlingEvents),events,name+' complete authoritative reload phases');
 const sequence=events.map(type=>w.handlingEvents[type].map(id=>manifest.assets[id].sha256).join(':')).join('|');assert.ok(!sequences.has(sequence),name+' full reload sequence');sequences.add(sequence);
 for(const type of events){assert.equal(w.handlingEvents[type].length,3,name+' '+type+' three variations');assert.equal(new Set(w.handlingEvents[type].map(id=>manifest.assets[id].sha256)).size,3);for(const id of w.handlingEvents[type]){const asset=manifest.assets[id];assert.ok(asset.components.length>=2);assert.ok(asset.duration<=.37,name+' bounded handling phase');assert.ok(!/pitch|stretch/.test(asset.processing.replace('Unpitched','')));handling.push(id);}}
}
assert.equal(fireSets.size,14);assert.equal(sourceGuns.size,14);assert.equal(sequences.size,14);
assert.equal(manifest.audioIdentityVersion,'fieldcraft-1');assert.equal(fireEntries.length,56);assert.equal(new Set(handling).size,120);assert.ok(Object.values(manifest.assets).reduce((n,a)=>n+a.bytes,0)<4*1024*1024,'runtime audio stays below four MB');
for(const name of ['SMG-9','P90','X16','X-16 Auto'])assert.ok(manifest.weapons[name].masteringProfile.tailSeconds<.18,name+' compact fire tail');assert.ok(manifest.weapons['LW Tundra'].masteringProfile.tailSeconds>.5,'sniper natural report remains distinct');
pass('All 14 weapons have four real firing cuts and three variations per reload phase, with distinct class mastering and a bounded runtime size');
function correlation(a,b){
 // Compare actual PCM waveforms, allowing +/- 8 ms alignment. Similar envelopes
 // from two loud reports do not count as duplicate recordings.
 let best=0;const limit=2400;
 for(let lag=-192;lag<=192;lag+=12){let dot=0,aa=0,bb=0;for(let i=192;i<Math.min(limit,a.length-192,b.length-192);i++){const x=a[i],y=b[i+lag];dot+=x*y;aa+=x*x;bb+=y*y;}best=Math.max(best,Math.abs(dot/Math.sqrt(aa*bb||1)));}return best;
}
const similarities=[];
for(let i=0;i<fireEntries.length;i++)for(let j=i+1;j<fireEntries.length;j++){
 const a=fireEntries[i],b=fireEntries[j];if(a.name===b.name)continue;assert.notEqual(manifest.assets[a.id].sha256,manifest.assets[b.id].sha256);const similarity=correlation(samples.get(a.id),samples.get(b.id));assert.ok(similarity<.75,a.id+' / '+b.id+' near-identical PCM');similarities.push({a:a.id,b:b.id,correlation:Math.round(similarity*100000)/100000});
}
similarities.sort((a,b)=>b.correlation-a.correlation);
pass('Cross-weapon firing clips contain no exact or near-identical PCM recordings after transient-alignment comparison');
async function manager(){
 const callbacks=new Map(),started=[],storage=new Map();let context;
 class Param{constructor(){this.value=0;}setTargetAtTime(v){this.value=v;}}
 class Node{constructor(){this.gain=new Param();this.pan=new Param();this.playbackRate=new Param();}connect(node){this.output=node;}disconnect(){}start(){started.push(this);}stop(){this.onended?.();}}
 class Context{constructor(){context=this;this.state='suspended';this.currentTime=0;this.destination=new Node();}createGain(){return new Node();}createDynamicsCompressor(){const n=new Node();for(const k of ['threshold','knee','ratio','attack','release'])n[k]=new Param();return n;}createStereoPanner(){return new Node();}createBufferSource(){return new Node();}async decodeAudioData(bytes){return {id:new TextDecoder().decode(bytes),duration:.2};}async resume(){this.state='running';}async suspend(){this.state='suspended';}}
 const document={hidden:false,addEventListener(t,f){callbacks.set(t,f);}},window={AudioContext:Context,addEventListener(t,f){callbacks.set(t,f);},requestIdleCallback:f=>setImmediate(f)};
 const byFile=new Map(Object.entries(manifest.assets).map(([id,a])=>['assets/audio/'+a.file,id]));
 const sandbox={window,document,console,crypto:crypto.webcrypto,Uint32Array,setTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:async url=>({ok:true,json:async()=>manifest,arrayBuffer:async()=>new TextEncoder().encode(byFile.get(url)||'unknown').buffer})};
 vm.runInNewContext(fs.readFileSync(path.join(root,'audio.js'),'utf8'),sandbox);const audio=window.SARAudio;await audio.ready;await callbacks.get('pointerdown')();audio.setView({active:true,matchId:2,x:0,y:0});await new Promise(r=>setImmediate(r));
 for(const [weapon,w] of Object.entries(manifest.weapons)){
  const played=[];for(let i=0;i<8;i++){const at=started.length;audio.emit({type:'shot',weapon,matchId:2,x:0,y:0});assert.equal(started.length-at,1);const node=started[at];assert.ok(w.fire.includes(node.buffer.id));assert.ok(node.playbackRate.value>=.996&&node.playbackRate.value<=1.004);played.push(node.buffer.id);node.onended?.();}
  assert.equal(new Set(played.slice(0,4)).size,4,weapon+' full first shuffle bag');assert.equal(new Set(played.slice(4,8)).size,4,weapon+' full second shuffle bag');for(let i=1;i<played.length;i++)assert.notEqual(played[i],played[i-1],weapon+' no repetition at bag boundary');
  for(const [type,ids] of Object.entries(w.handlingEvents)){const played=[];for(let i=0;i<3;i++){const index=started.length;audio.emit({type,weapon,actorId:1,matchId:2,x:0,y:0});assert.equal(started.length-index,1);assert.ok(ids.includes(started[index].buffer.id),weapon+' '+type+' actual routed buffer');played.push(started[index].buffer.id);started[index].onended?.();}assert.equal(new Set(played).size,3,weapon+' '+type+' cycles all takes');}
 }
 pass('The actual mixer cycles every firing and handling take before reuse, never repeats at shuffle boundaries, and preserves short per-round attacks');
 const ambientNode=started.find(node=>node.buffer.id==='ambience_wind'),ambientBus=ambientNode.output.output,duckBus=ambientBus.output;assert.equal(ambientBus.gain.value,.25,'saved ambience preference is separate from ducking');assert.ok(duckBus.gain.value<1,'nearby fire briefly reduces ambience');context.currentTime=1;audio.flush();assert.equal(duckBus.gain.value,1,'ambience recovers after fire');
 let feedbackAt=started.length;for(let i=0;i<12;i++)audio.emit({type:'resolved-hit',ownerId:1,feedbackId:5,targetId:2,head:i===4,killing:i===11});audio.flush();assert.equal(started.length-feedbackAt,2,'one head and one kill cue for twelve pellets');assert.ok(manifest.events['head-hit'].assets.includes(started[feedbackAt].buffer.id));assert.equal(started[feedbackAt+1].buffer.id,'kill_confirm');assert.equal(duckBus.gain.value,.55);assert.equal(ambientBus.gain.value,.25);context.currentTime=2;audio.flush();assert.equal(duckBus.gain.value,1);
 audio.emit({type:'resolved-hit',ownerId:1,feedbackId:5,targetId:2,head:true,killing:true});audio.flush();assert.equal(started.length-feedbackAt,2,'no repeated pellet cue in later frames');
 const uiAt=started.length;audio.emit({type:'message'});assert.equal(started.length-uiAt,1,'one Phone alert per delivered event');assert.equal(started[uiAt].buffer.id,'message_received');assert.equal(started[uiAt].playbackRate.value,1);assert.ok(manifest.assets.kill_confirm.duration<.18);assert.ok(manifest.assets.message_received.duration<.2);
 pass('Brief head/kill feedback coalesces real pellets, Phone delivery gets one soft alert, and ambience ducks/rebounds without changing saved volumes');
 const {engine}=require('./simulate.cjs'),gameSource=fs.readFileSync(path.join(root,'game.js'),'utf8');
 const exposed=gameSource.replace('window.SAR = {','window.__audioPhases={makeWeaponState,startReload,updateHandlingAudio,finishReload};window.SAR = {');
 const e=engine({},exposed),a=e.dev.inspect().state.actors[0],resolved=[];e.context.SARAudio={emit:event=>resolved.push(event),flush(){}};Object.assign(a,{dead:false,currentSlot:0,matchId:2,x:0,y:0});
 for(const [weapon,w] of Object.entries(e.context.SAR.getWeapons())){
  a.slots[0]=e.context.__audioPhases.makeWeaponState(weapon);const s=a.slots[0];s.ammo=0;resolved.length=0;
  e.context.__audioPhases.startReload(a,10000);assert.equal(s.reloadEnd,10000+w.reload*1000);e.context.__audioPhases.updateHandlingAudio(a,s,10000+w.reload*1000*.8);e.context.__audioPhases.finishReload(s,a);
  const phases=resolved.filter(event=>manifest.weapons[weapon].handlingEvents[event.type]);assert.ok(phases.length>=2,weapon+' authoritative phase events');
  for(const event of phases){assert.equal(event.weapon,weapon,weapon+' actual equipped weapon');const at=started.length;audio.emit(event);assert.equal(started.length-at,1);assert.ok(manifest.weapons[weapon].handlingEvents[event.type].includes(started[at].buffer.id));started[at].onended?.();}
  assert.equal(phases.filter(event=>event.type==='reload-ready').length,1);assert.equal(s.ammo,w.mag,'existing reload result');
  if(w.pellets>1&&manifest.weapons[weapon].handling==='shell')assert.ok(!phases.some(event=>event.type==='mag-out'||event.type==='mag-in'));
 }
 pass('All 14 real reload paths resolve the equipped weapon, route each phase to its identity, and retain original reload duration, ammo result and shotgun shell behavior');
 const at=started.length;audio.emit({type:'mag-out',matchId:2,x:0,y:0});assert.equal(started[at].buffer.id,manifest.events['mag-out'].assets[0]);audio.setVolume('SFX',0);let count=started.length;audio.emit({type:'mag-in',weapon:'P90',matchId:2,x:0,y:0});assert.equal(started.length,count);assert.equal(JSON.parse(storage.get('sar.audio.volumes.v1')).SFX,0);audio.setVolume('SFX',.7);audio.emit({type:'mag-in',weapon:'P90',matchId:0,x:0,y:0});assert.equal(started.length,count);
 audio.setVolume('WEAPONS',0);count=started.length;audio.emit({type:'shot',weapon:'SR-Aug',matchId:2,x:0,y:0});assert.equal(started.length,count);assert.ok(audio.getDiagnostics().maxVoices<=47);document.hidden=true;await callbacks.get('visibilitychange')();assert.equal(context.state,'suspended');assert.equal(audio.getDiagnostics().failures.length,0);
 pass('Weapon-specific handling retains shared mixer, category mute persistence, active-match filtering, voice bounds and focus-loss behavior');
 const result={result:'PASS',checks,fireVariants:fireEntries.length,sourceFirearms:sourceGuns.size,uniqueReloadSequences:sequences.size,newHandlingClips:new Set(handling).size,maxAttackMs:Math.max(...fireEntries.map(e=>e.attackMs)),highestCrossWeaponCorrelations:similarities.slice(0,8),runtimeAssets:Object.keys(manifest.assets).length,runtimeBytes:Object.values(manifest.assets).reduce((n,a)=>n+a.bytes,0),diagnostics:audio.getDiagnostics()};fs.writeFileSync(path.join(__dirname,'audio-identity-results.json'),JSON.stringify(result,null,2)+'\n');
}
manager().catch(error=>{console.error(error);process.exitCode=1;});
