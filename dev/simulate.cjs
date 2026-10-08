/* Developer diagnostics: executes the shipped combat/AI engine, never fabricated match results.
   node dev/simulate.cjs [match-count] [output.json] [optional game.js]
   Canvas/DOM are stubbed; movement, decisions, projectiles and telemetry are the real functions. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const gamePath=process.argv[4]||path.resolve(__dirname,'../game.js');
const noop=()=>{},gradient={addColorStop:noop};
class StubEventTarget{
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn,options){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({fn,capture:options===true||options?.capture===true});}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(l=>l.fn!==fn));}
  dispatchEvent(event,capture){event.target??=this;event.currentTarget=this;for(const l of [...(this.listeners.get(event.type)||[])])if(capture===undefined||l.capture===capture)l.fn.call(this,event);return !event.defaultPrevented;}
}
class StubElement extends StubEventTarget{
  constructor(onClassChange=noop){
    super();const classes=new Set(),selected=new Map(),change=()=>onClassChange(this);
    Object.assign(this,{style:{setProperty:noop},dataset:{},children:[],width:280,height:150,clientWidth:280,clientHeight:150,textContent:'',innerHTML:'',getBoundingClientRect:()=>({left:0,top:0,width:280,height:150}),getContext:()=>g,append:noop,appendChild:noop,prepend:noop,remove:noop,insertAdjacentHTML:noop,querySelector:s=>{if(!selected.has(s))selected.set(s,node(onClassChange));return selected.get(s);},querySelectorAll:()=>[]});
    this.classList={add:(...names)=>{let changed=false;for(const c of names)if(!classes.has(c)){classes.add(c);changed=true;}if(changed)change();},remove:(...names)=>{let changed=false;for(const c of names)if(classes.delete(c))changed=true;if(changed)change();},toggle:(c,v)=>{const enabled=v??!classes.has(c);if(enabled)this.classList.add(c);else this.classList.remove(c);return enabled;},contains:c=>classes.has(c)};
    Object.defineProperty(this,'className',{get:()=>[...classes].join(' '),set:value=>{classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));change();}});
  }
  closest(selector){if(selector==='[data-action]'&&this.dataset.action)return this;if(selector==='[data-settings-tab]'&&this.dataset.settingsTab)return this;return null;}
  click(){this.dispatchEvent({type:'click',target:this,preventDefault:noop});}
}
function node(onClassChange){return new StubElement(onClassChange);}
const g=new Proxy({measureText:s=>({width:String(s).length*7}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createPattern:()=>({})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
function engine(storage={},source=fs.readFileSync(gamePath,'utf8'),options={}){
  const sourceHash=require('node:crypto').createHash('sha256').update(source).digest('hex');const data=new Map(Object.entries(storage)),microtasks=[],nodes=new Map(),localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),key:i=>[...data.keys()][i],get length(){return data.size;}};
  const observers=new Set();function notifyClassChange(target){for(const o of observers)if(o.targets.has(target)&&!o.queued){o.queued=true;microtasks.push(()=>{o.queued=false;o.callback([{type:'attributes',attributeName:'class',target}],o);});}}
  class MutationObserver{constructor(callback){this.callback=callback;this.targets=new Set();this.queued=false;}observe(target){this.targets.add(target);observers.add(this);}disconnect(){this.targets.clear();observers.delete(this);}}
  let focused=options.hasFocus??true,wallTime=1000,pointerLockMode=options.pointerLockMode||'sync',lockRequests=0,pendingLocks=[];
  const document=new StubEventTarget();Object.assign(document,{getElementById:id=>{if(!nodes.has(id)){const n=node(notifyClassChange);n.id=id;if(['accountGate','cloudAccountMenu'].includes(id))n.classList.add('hidden');nodes.set(id,n);}return nodes.get(id);},createElement:()=>node(notifyClassChange),querySelectorAll:()=>[],querySelector:()=>null,hidden:false,pointerLockElement:null,hasFocus:()=>focused});
  const canvas=document.getElementById('game');canvas.requestPointerLock=()=>{lockRequests++;const lock=()=>{document.pointerLockElement=canvas;document.dispatchEvent({type:'pointerlockchange'});};if(pointerLockMode==='throw')throw new Error('Pointer lock denied');if(pointerLockMode==='reject')return Promise.reject(new Error('Pointer lock denied'));if(pointerLockMode==='pending')return new Promise((resolve,reject)=>pendingLocks.push({lock,resolve,reject}));lock();};
  document.exitPointerLock=()=>{if(document.pointerLockElement){document.pointerLockElement=null;document.dispatchEvent({type:'pointerlockchange'});}};
  let rng=391377;const math=Object.create(Math);math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const windowEvents=new StubEventTarget(),context={console:{...console,error:noop},document,HTMLElement:StubElement,MutationObserver,localStorage,innerWidth:1440,innerHeight:900,performance:{now:()=>wallTime},Math:math,Date,setInterval:noop,setTimeout:noop,requestAnimationFrame:noop,addEventListener:windowEvents.addEventListener.bind(windowEvents),removeEventListener:windowEvents.removeEventListener.bind(windowEvents),queueMicrotask:fn=>microtasks.push(fn),URL,Blob,TextEncoder,crypto:require('node:crypto').webcrypto,location:{reload:noop,search:'?diagnostics=1'},alert:noop,confirm:()=>false};context.window=context;
  context.SARTactics=options.tactics||require('../tactical-instinct.js');
  context.SARProgression=require('../progression.js');
  context.SARProfileStats=require('../profile-stats.js');
  context.SARUnits=require('../distance-units.js');
  context.SARMatchModes=require('../match-modes.js');
  context.SARTeamPresentation=require('../team-presentation.js');
  const clockEpoch=Date.now()-wallTime;
  // Match-slot deadlines use the authoritative wall clock. Advance that clock
  // alongside accelerated simulation, with an override for restart boundaries.
  context.SARCloud={now:options.wallNow||(()=>clockEpoch+wallTime)};
  if(options.storageAdapter)context.SARStorage=options.storageAdapter;
  source=source.replace(/\r\n/g,'\n').replace('initializeLeague();\nupdateLobbyUi();\npaintLobbyKit();','addKillfeed=()=>{};updateLobbyUi=()=>{};paintLobbyKit=()=>{};\ninitializeLeague();');
  source=source.replace(/\}\)\(\);\s*$/,`window.__DEV={setViewport(width,height){innerWidth=width;innerHeight=height;window.innerWidth=width;window.innerHeight=height;},step(dt){simulationTime+=dt*1000;update(dt,simulationTime);},now:()=>simulationTime,inspect:()=>({state,SAVE,meta,diagnostics}),normalizeSave,exportEnvelope,balanceSnapshot,balanceFingerprint,queueForMatch,selectTarget,decideBot,updateBot,fire,updateProjectiles,applyDamage,killActor,recordEquipped,ensureSeasonFresh,findPath,pathClear,collides,pointLOS,updateHealthRegen,tryDash,createSeason,saveTelemetry,querySolids,respawnActor,startMatch,endMatch,exitGame,weaponMetrics,blankWeaponMeta,input,CONFIG,renderSnapshot:typeof renderSnapshot==='function'?renderSnapshot:()=>null,recordEngagementRange:typeof recordEngagementRange==='function'?recordEngagementRange:()=>null,botTacticalRange:typeof botTacticalRange==='function'?botTacticalRange:()=>null,metaMeasured:typeof metaMeasured==='function'?metaMeasured:()=>null,setMetaKind(kind){if(typeof META_KIND!=='undefined')META_KIND=kind;},currentMetaRows:typeof currentMetaRows==='function'?currentMetaRows:()=>null,visibleMetaRows:typeof visibleMetaRows==='function'?visibleMetaRows:()=>null,metaDetailHtml:typeof metaDetailHtml==='function'?metaDetailHtml:()=>null,navigationStart:typeof navigationStart==='function'?navigationStart:()=>null};})();`);
  new Function(...Object.keys(context),source)(...Object.values(context));
  const initialProfiles=JSON.stringify(context.SAR.getProfiles()),seasonDates=JSON.stringify([context.__DEV.inspect().SAVE.seasons.current.number,context.__DEV.inspect().SAVE.seasons.current.startAt,context.__DEV.inspect().SAVE.seasons.current.endAt]);
  function flush(){let count=0;while(microtasks.length){assert.ok(++count<1000,'DOM observer microtask loop');microtasks.shift()();}}
  const ui={document,canvas,nodes,element:document.getElementById,flush,get lockRequests(){return lockRequests;},setPointerLockMode(mode){pointerLockMode=mode;},resolvePointerLock(success=true){const pending=pendingLocks.shift();assert.ok(pending,'No pending pointer-lock request');if(success){pending.lock();pending.resolve();}else pending.reject(new Error('Pointer lock denied'));},advance(ms){wallTime+=ms;},setFocus(value){focused=value;},setViewport(width,height){context.__DEV.setViewport(width,height);this.dispatch('window','resize');},dispatch(surface,type,properties={}){const target=surface==='canvas'?canvas:surface==='document'?document:windowEvents,event={type,target,preventDefault(){this.defaultPrevented=true;},...properties};if(surface==='canvas'){windowEvents.dispatchEvent(event,true);canvas.dispatchEvent(event);document.dispatchEvent(event);windowEvents.dispatchEvent(event,false);}else target.dispatchEvent(event);return event;},action(action){const target=node();target.dataset.action=action;return this.dispatch('document','click',{target});}};
  return {context,dev:context.__DEV,data,initialProfiles,seasonDates,sourceHash,ui,step(dt=1/30){wallTime+=dt*1000;context.__DEV.step(dt);flush();}};
}
function close(a,b,epsilon=1e-6){assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);}
function validate(e){
  const {state,SAVE,meta,diagnostics:d}=e.dev.inspect(),bots=Object.values(SAVE.bots).filter(b=>SAVE.activeBotNames.includes(b.profile?.name)),careers=bots.map(b=>b.career),sum=(rows,k)=>rows.reduce((n,r)=>n+(r[k]||0),0),weapons=Object.values(meta);
  assert.equal(bots.length,50);assert.equal(state.idleBots.length,10);assert.equal(state.matches.length,4);
  const assigned=new Set();for(const match of state.matches){const p=match.participants.filter(a=>a.matchId===match.id);assert.equal(p.length,10);for(const t of [0,1])assert.equal(p.filter(a=>a.team===t).length,5);for(const a of p){assert.ok(!assigned.has(a.name));assigned.add(a.name);}}
  assert.equal(sum(careers,'kills'),sum(weapons,'kills'));assert.equal(sum(careers,'deaths'),sum(weapons,'deaths'));assert.equal(sum(careers,'kills'),sum(careers,'deaths'));
  close(sum(careers,'damage'),sum(weapons,'damage'),.0001);close(sum(careers,'damage'),sum(careers,'taken'),.0001);close(sum(careers,'timeAlive'),sum(weapons,'equippedTime'),.0001);
  assert.equal(sum(careers,'shots'),sum(weapons,'shots'));assert.equal(sum(careers,'hits'),sum(weapons,'hits'));assert.equal(sum(careers,'headshots'),sum(weapons,'headshots'));
  assert.ok(d.maxStuckDetectionSeconds<1.6);assert.ok(d.botAdsShots>0&&d.buildingEntries>0&&d.buildingExits>0);assert.equal(d.completedKills,d.completedDeaths);assert.equal(d.completedKills,d.matchScoreKills);close(d.completedDamage,d.completedTaken,.0001);assert.equal(d.completedParticipants,d.completedMatches*10);
  assert.equal(sum(careers,'games'),d.completedParticipants);assert.equal(sum(careers,'wins'),d.completedMatches*5);assert.equal(sum(careers,'losses'),d.completedMatches*5);
  for(const w of weapons){assert.ok(w.equippedTime>0&&w.shots>0,w.name+' missing sample');assert.ok(w.hits<=w.shots);assert.ok(w.headshots<=w.kills);assert.equal(w.classifiedKills,w.kills,w.name+' fresh-world kill classification');assert.ok(w.soloKills+w.finisherKills<=w.classifiedKills);assert.ok(w.engagementDistanceN<=w.shots);assert.ok(w.engagementDistanceN>0&&w.engagementDistance>0,w.name+' missing real range sample');}
  const totalTime=sum(weapons,'equippedTime'),definitions=e.context.SAR.getWeapons(),scores=e.context.SAR.getWeaponScores();for(const category of ['primary','sidearm'])close(scores.filter(r=>definitions[r.name].type===category).reduce((n,r)=>n+r.usage,0),1);
  for(const [band,stratum] of Object.entries(SAVE.patchState.skillStrata))for(const w of Object.values(stratum))assert.ok(w.hits<=w.shots,band);
  close(sum(Object.values(SAVE.patchState.skillStrata).flatMap(s=>Object.values(s)),'damage'),sum(weapons,'damage'),.0001);
  for(const a of state.actors){for(const k of ['x','y','hp','vx','vy'])assert.ok(Number.isFinite(a[k]),a.name+' '+k);assert.ok(a.stuckCount<18,a.name+' sustained stuck recovery');}
  const numeric=(o)=>{for(const [k,v] of Object.entries(o)){if(typeof v==='number')assert.ok(Number.isFinite(v),k+' non-finite');else if(v&&typeof v==='object')numeric(v);}};numeric(SAVE);for(const b of bots){assert.ok(b.recentForm>=-10&&b.recentForm<=10);for(const f of Object.values(b.familiarity))assert.ok(f>=0&&f<=100);}const elite=bots.find(b=>b.profile.power===99);if(d.completedMatches>=100)assert.ok(elite.career.deaths>0&&elite.career.losses>0&&elite.career.hits<elite.career.shots);
  assert.equal(JSON.stringify(e.context.SAR.getProfiles()),e.initialProfiles);assert.equal(JSON.stringify([SAVE.seasons.current.number,SAVE.seasons.current.startAt,SAVE.seasons.current.endAt]),e.seasonDates);assert.equal(sum(Object.values(SAVE.seasons.current.stats),'kills'),sum(careers,'kills'));assert.equal(sum(Object.values(SAVE.seasons.current.stats),'deaths'),sum(careers,'deaths'));close(sum(Object.values(SAVE.seasons.current.stats),'damage'),sum(careers,'damage'),.0001);assert.equal(SAVE.seasons.current.endAt-SAVE.seasons.current.startAt,15*86400000);assert.equal(SAVE.schema,17);assert.equal(SAVE.patchArchives.length,0);assert.ok(careers.every(c=>c.games>0));
  return {matches:d.completedMatches,simulatedSeconds:SAVE.patchState.observedSeconds,kills:sum(weapons,'kills'),completedKills:d.completedKills,damage:sum(weapons,'damage'),equippedSeconds:totalTime,minBotGames:Math.min(...careers.map(c=>c.games)),maxBotGames:Math.max(...careers.map(c=>c.games)),phase:e.context.SAR.getSaveInfo().patch,stuckRecoveries:d.stuckRecoveries,maxStuckDetectionSeconds:d.maxStuckDetectionSeconds,maxConsecutiveStuckRecoveries:d.maxConsecutiveStuckRecoveries||0,buildingEntries:d.buildingEntries,buildingExits:d.buildingExits,exitPlans:d.exitPlans,adsShots:d.adsShots,botAdsShots:d.botAdsShots,botAdsSeconds:d.botAdsSeconds,actions:d.actions,weaponSamples:weapons.map(w=>({name:w.name,kills:w.kills,deaths:w.deaths,shots:w.shots,hits:w.hits,minutes:w.equippedTime/60,engagementRangeSamples:w.engagementDistanceN,avgEngagementTiles:w.engagementDistanceN?w.engagementDistance/w.engagementDistanceN/70:null,killRangeSamples:w.killDistanceN,avgKillTiles:w.killDistanceN?w.killDistance/w.killDistanceN/70:null,classifiedKills:w.classifiedKills,soloKills:w.soloKills,finisherKills:w.finisherKills,soloPct:w.classifiedKills?w.soloKills/w.classifiedKills:null,finisherPct:w.classifiedKills?w.finisherKills/w.classifiedKills:null})),scores:e.context.SAR.getWeaponScores(),checks:'all event totals, completed matches, teams, all bots/weapons, finite values, seasons and patch boundaries reconciled'};
}
function migrationTests(){
  const base=engine(),s=JSON.parse(JSON.stringify(base.dev.inspect().SAVE));
  s.schema=13;s.futureWorld={keep:37};s.bots.Ace.profile.power=97;s.bots.Ace.profile.rank=8;s.bots.Ace.profile.personality.aggression=.231;s.bots.Ace.profile.futureCosmetic={id:'retain'};s.bots.Ace.career.futureProgress=17;s.bots.Ace.career.kills=77;s.bots.Ace.recentForm=6;s.bots.Ace.familiarity.AK47=43;
  s.seasons.history=Array.from({length:70},(_,i)=>({number:i+1,winner:{name:'Nova'},futureSeason:i}));s.seasons.current.number=71;s.seasons.current.stats.Ace.kills=44;s.config.futurePreference='retained';delete s.patchState;s.meta.AK47.kills=70;s.meta.AK47.shots=220;
  const accounts=JSON.stringify({noah:{username:'Noah',hash:'hash-preserved',salt:'salt-preserved',createdAt:42,preferences:{theme:'field'}}}),storage={'sar-persistent-save':JSON.stringify(s),'sar-local-accounts-v1':accounts,'sar-local-session-v1':'noah'};
  const migrated=engine(storage),m=migrated.dev.inspect().SAVE;
  assert.equal(m.schema,17);assert.equal(m.bots.Ace.profile.power,97);assert.equal(m.bots.Ace.profile.rank,8);assert.equal(m.bots.Ace.profile.personality.aggression,.231);assert.equal(m.bots.Ace.profile.futureCosmetic.id,'retain');assert.equal(m.bots.Ace.career.futureProgress,17);assert.equal(m.bots.Ace.recentForm,6);assert.equal(m.bots.Ace.familiarity.AK47,43);assert.equal(m.bots.Ace.career.kills,77);assert.equal(m.seasons.current.startAt,s.seasons.current.startAt);assert.equal(m.seasons.current.endAt,s.seasons.current.endAt);assert.equal(m.seasons.current.stats.Ace.kills,44);assert.equal(m.seasons.history.length,70);assert.equal(m.futureWorld.keep,37);assert.equal(m.config.futurePreference,'retained');assert.equal(m.meta.AK47.kills,0);assert.equal(m.patchArchives[0].meta.AK47.kills,70);assert.equal(migrated.data.get('sar-local-accounts-v1'),accounts);assert.equal(migrated.data.get('sar-local-session-v1'),'noah');assert.ok(migrated.data.has('sar-migration-backup'));
  const exportData=migrated.dev.exportEnvelope();assert.equal(exportData.storage['sar-local-accounts-v1'],accounts);
  const again=engine(Object.fromEntries(migrated.data)),a=again.dev.inspect().SAVE;assert.equal(a.patchArchives.length,1);assert.equal(a.bots.Ace.profile.power,97);assert.equal(a.seasons.history.length,70);
  const schema14={...s,schema:14,patchState:m.patchState,patchArchives:m.patchArchives};assert.equal(engine({'sar-persistent-save':JSON.stringify(schema14)}).dev.inspect().SAVE.schema,17);
  // A real numerical edit is fingerprinted and archived without touching career/season/account data.
  const changedSource=fs.readFileSync(gamePath,'utf8').replace("'AK47': { type:'primary', damage:34, spread:4","'AK47': { type:'primary', damage:30, spread:4.2");assert.ok(changedSource!==fs.readFileSync(gamePath,'utf8'),'migration fixture must alter the active AK47 damage and spread');
  const patch=engine(Object.fromEntries(migrated.data),changedSource),ps=patch.dev.inspect().SAVE;assert.equal(ps.patchArchives.length,2);assert.notEqual(ps.patchState.fingerprint,m.patchState.fingerprint);assert.equal(ps.meta.AK47.kills,0);assert.equal(ps.bots.Ace.career.kills,77);assert.equal(ps.balancePatchHistory.at(-1).changes.length,2);
  const future={...s,schema:99};const f=engine({'sar-persistent-save':JSON.stringify(future)});assert.equal(JSON.parse(f.data.get('sar-persistent-save')).schema,99);assert.ok(f.context.SAR.getSaveInfo().writeProtected);
  const corrupt=new Map([['sar-persistent-save','bad data']]);
  assert.throws(()=>engine({},undefined,{storageAdapter:{get:key=>corrupt.get(key)??null,set(key,value){corrupt.set(key,value);return true;}}}),SyntaxError,'invalid saved data stops initialization instead of creating a blank world');
  assert.equal(corrupt.get('sar-persistent-save'),'bad data');assert.equal(corrupt.get('sar-recovery-backup'),'bad data');
  const expired=engine(),es=expired.dev.inspect().SAVE,originalEnd=es.seasons.current.endAt;es.seasons.current.stats.Ace.games=12;es.seasons.current.stats.Ace.kills=27;es.seasons.current.stats.Ace.deaths=7;expired.dev.ensureSeasonFresh(originalEnd+15*86400000+1);assert.equal(es.seasons.current.number,3);assert.equal(es.seasons.current.startAt,originalEnd+15*86400000);assert.equal(es.seasons.history.length,2);assert.equal(es.seasons.history[1].winner.name,'Ace');
  return {passed:true,cases:['fresh schema 17','13 → 14 → 15 → 16 → 17','14 → 15 → 16 → 17','reload idempotence','future and nested fields','fixed identity/Power/personality','career/form/familiarity','70 historical seasons','exact season dates and rollover','accounts/session/preferences','complete export','balance edit archive and clean active patch','future schema write protection','corrupt save recovery']};
}
if(require.main===module){
  const target=Number(process.argv[2]||1000),output=process.argv[3]||path.resolve(__dirname,'simulation-results.json'),start=Date.now(),e=engine(),checkpoints=[];
  console.log('Migrations:',JSON.stringify(migrationTests()));
  let next=10;while(e.dev.inspect().diagnostics.completedMatches<target){e.step();for(const a of e.dev.inspect().state.actors){const d=e.dev.inspect().diagnostics;d.maxConsecutiveStuckRecoveries=Math.max(d.maxConsecutiveStuckRecoveries||0,a.stuckCount||0);if((a.stuckCount||0)>=18)fs.writeFileSync(path.resolve(__dirname,'movement-failure.json'),JSON.stringify({matches:d.completedMatches,actor:{name:a.name,x:a.x,y:a.y,vx:a.vx,vy:a.vy,tactic:a.tactic,reason:a.decisionReason,hp:a.hp,moveGoal:a.moveGoal,navPath:a.navPath,navIndex:a.navIndex,recoveryGoal:a.recoveryGoal,unstick:a.unstickGoal,cover:a.cover,building:a.buildingState,exitPlan:a.exitPlan},connection:e.dev.navigationStart(a.x,a.y),collides:e.dev.collides(a.x,a.y),nearby:[...e.dev.querySolids(a.x-160,a.y-160,a.x+160,a.y+160)]},null,2));assert.ok((a.stuckCount||0)<18,a.name+' prolonged stuck condition');}const n=e.dev.inspect().diagnostics.completedMatches;if(n>=next){console.log(`${n} matches · ${((Date.now()-start)/1000).toFixed(1)}s elapsed · ${Math.round(e.dev.inspect().SAVE.patchState.observedSeconds)}s simulation`);next+=10;}if([100,500,1000,target].includes(n)&&!checkpoints.some(c=>c.matches===n)){const c=validate(e);checkpoints.push(c);fs.writeFileSync(output,JSON.stringify({engine:'shipped game.js, fixed 1/30s physics, seeded RNG; adaptation and seasons retain real wall-clock timestamps',sourceHash:e.sourceHash,wallSeconds:(Date.now()-start)/1000,migrations:migrationTests(),checkpoints},null,2));}}
  console.log('PASS',output);
}
module.exports={engine,validate,migrationTests};












