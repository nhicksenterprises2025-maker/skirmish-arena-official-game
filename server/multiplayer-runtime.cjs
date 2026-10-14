'use strict';
// Multiplayer executes the shipped simulation. Only input, transport, checkpoint
// and finalization bindings are replaced inside the server's private instance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const {engine}=require('../dev/simulate.cjs'),{readWorld}=require('./world.cjs');
const Lifecycle=require('./tournament-lifecycle.cjs');
const Catalog=require('./commerce-catalog.cjs'),Wallet=require('./wallet.cjs');
const BotProjection=require('./bot-multiplayer-projection.cjs');
const MapPools=require('./map-pools.cjs');
const Replays=require('./replays.cjs');
const Modes=require('../match-modes.js'),ModeRules=require('../mode-rules.js'),Maps=require('../map-data.js');
const Tactics=require('../tactical-instinct.js');
const FORMAT='multiplayer-reference-state-v1',MAX_BYTES=16*1024*1024,STEP_MS=1000/30,TERMINAL_KEEP_MS=10*60000;
const GAME=path.join(__dirname,'../game.js');
const DEPENDENCIES=['dev/simulate.cjs','tactical-instinct.js','progression.js','match-modes.js','team-presentation.js','distance-units.js','map-data.js','mode-rules.js','weapon-mastery.js'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const dependencies=()=>Object.fromEntries(DEPENDENCIES.map(file=>[file,hash(fs.readFileSync(path.join(__dirname,'..',file)))]));
const LEGACY_SIMULATE='c2097272121647ebf0cd464819a2a79c147de0246f8721ced712fa8c178612f7',MAP_SIMULATE='d55a11f658d80ecc941d9fc75864b9764e69b7b8f68fcedf5f792f743ca05071';
const LEGACY_UNITS='0e850c0fe3ae5dd16f0cf510870875f320f8026c0b4ca0ac443dfa1c8e91e375',MAP_UNITS='23ed0490f5238e8f42458028eddb9f7cb6c8eb314c40df44ddf7da20feed2082';
function checkpointDependencies(saved,bound,source){
 if(!saved||Object.keys(saved).some(file=>!DEPENDENCIES.includes(file)))return false;
 const oldMap=saved['map-data.js']===undefined&&!/\bSARMaps\b/.test(source),oldModes=saved['mode-rules.js']===undefined&&!/\b(?:MODE_RULES|SARModeRules)\b/.test(source);
 const compatible={'dev/simulate.cjs':[MAP_SIMULATE,...(oldMap?[LEGACY_SIMULATE]:[])],'progression.js':['705b0120ce4fa2a6bdca3b4362a94c8d5bbdaaa3693128a6551be3664667fde7'],'match-modes.js':['b67906af309fdb83b69925d98d7ed8a2790bd7475bba41e85b8815454e063bd5']};
 return DEPENDENCIES.every(file=>saved[file]===bound[file]||file==='dev/simulate.cjs'&&['eb3b46b5a8bedad3efc0968bc6834b55cef26ad591464155450fbc8ca05dcc90','5fcde9b8df0266498890ff2ba63df90ffe083f5e43b001d2f92b87f61eb016e1'].includes(saved[file])&&bound[file]==='84d8113da7c890673174d80fc4810e534bf5f5def40246238a18d4187bc4b434'||file==='progression.js'&&saved[file]==='840312cd6a0a9255bc3e0c9bad297ecfd44e2777cb4698b22d4e51169c511173'&&bound[file]==='6bea410ac7d631895b60cefca93d5f5c2b30ff6efdf6550af331ef989c87851b'||file==='weapon-mastery.js'&&saved[file]===undefined&&!/\bSARWeaponMastery\b/.test(source)||oldModes&&(file==='mode-rules.js'||compatible[file]?.includes(saved[file]))||oldMap&&(file==='map-data.js'||file==='dev/simulate.cjs'&&saved[file]===LEGACY_SIMULATE||file==='distance-units.js'&&saved[file]===LEGACY_UNITS&&bound[file]===MAP_UNITS));
}
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const aliases={tdm:'casual-tdm',deathmatch:'casual-deathmatch',rankedtdm:'ranked-tdm',rankeddeathmatch:'ranked-deathmatch',custom:'custom-tdm'};
function policy(id,{at=Date.now(),ltmDefinition=null,allowInactive=false}={}){
 id=aliases[id]||id;if(typeof id!=='string')throw fail('Choose an available multiplayer mode',400);const custom=id.startsWith('custom-'),ranked=id.startsWith('ranked-'),limited=id.startsWith('ltm:'),tournament=id==='tournament';
 const definition=limited?ltmDefinition||ModeRules.getLTM(id.slice(4)):null;
 if(limited&&(!definition||id!=='ltm:'+definition.id||!allowInactive&&(at<Date.parse(definition.activeFrom)||at>=Date.parse(definition.activeUntil))))throw fail('This limited-time mode is unavailable',400);
 const mode=limited?definition.rules.baseMode:tournament?'tdm':id.replace(/^(casual|custom|ranked)-/,'');
 if(Modes.get(mode)?.mode!==mode||!limited&&!tournament&&!/^(casual|custom|ranked)-/.test(id)||ranked&&!['tdm','deathmatch'].includes(mode))throw fail('Choose an available multiplayer mode',400);
 const teamMode=Modes.isTeam(mode),teamSize=limited?definition.teamSize:teamMode?5:1;
 return {id,mode,sessionType:limited?'ltm':ranked?'ranked':custom?'custom':tournament?'tournament':'standard',ranked,custom,teamMode,teamSize,size:teamMode?2*teamSize:10,ltmDefinition:definition,pool:limited?'ltm':custom?'custom':ranked?'ranked':tournament?'tournament':'casual'};
}
function instrument(source){
 if(!/\}\)\(\);\s*$/.test(source))throw Error('Multiplayer simulation bindings unavailable');
 const hooks=`
let mpCurrent=null,mpKillfeed=[];const mpOriginalPlayer=updatePlayer,mpOriginalAction=actionDown,mpOriginalScreen=screenToWorld,mpOriginalRespawn=respawnActor,mpOriginalPrepare=prepareActorForMatch,mpOriginalDamageNumber=recordDamageNumber;
initializeLeague=()=>{};updateOfficialSlots=()=>{};updateLobbyUi=()=>{};updateCrosshairVisual=()=>{};gameplayMouseActive=()=>true;
visibleMatchId=()=>4;
// The existing resolver and pellet grouping supply private feedback for each
// human. One host's presentation preference cannot suppress another's events.
recordDamageNumber=(victim,p,actual,isHead,now)=>{const other=damageNumbers.filter(n=>n.ownerId!==p.owner.id),setting=CONFIG.damageNumbers;for(let i=damageNumbers.length-1;i>=0;i--)if(damageNumbers[i].ownerId!==p.owner.id)damageNumbers.splice(i,1);CONFIG.damageNumbers=true;try{mpOriginalDamageNumber(victim,p,actual,isHead,now);const key=p.feedbackId===undefined?victim.id:victim.id+':'+p.feedbackId,entry=p.shot?.damageNumbers?.get(key);if(entry)entry.mpFeedbackId=p.owner.id+':'+victim.id+':'+(p.feedbackId??p.shot.id);}finally{CONFIG.damageNumbers=setting;damageNumbers.push(...other);}};
addKillfeed=(killer,victim,weapon,head)=>{mpKillfeed.push({id:nextShotId+':'+victim.id+':'+gameNow(),killerId:killer.id,killer:killer.name,victimId:victim.id,victim:victim.name,weapon,head,at:gameNow()});mpKillfeed=mpKillfeed.slice(-12);};
actionDown=action=>{if(!mpCurrent)return mpOriginalAction(action);const i=mpCurrent.mpInput||{};return action==='moveRight'?i.moveX>0:action==='moveLeft'?i.moveX<0:action==='moveDown'?i.moveY>0:action==='moveUp'?i.moveY<0:!!i[action];};
screenToWorld=(x,y)=>mpCurrent?{x:mpCurrent.x+Math.cos(mpCurrent.mpInput?.aim||0)*1000,y:mpCurrent.y+Math.sin(mpCurrent.mpInput?.aim||0)*1000}:mpOriginalScreen(x,y);
function mpLoadout(a,fn){const primary=CONFIG.primary,sidearm=CONFIG.sidearm,skin=CONFIG.skin;CONFIG.primary=a.mpLoadout?.primary||primary;CONFIG.sidearm=a.mpLoadout?.sidearm||sidearm;CONFIG.skin=a.skinIndex;try{return fn();}finally{CONFIG.primary=primary;CONFIG.sidearm=sidearm;CONFIG.skin=skin;}}
prepareActorForMatch=(a,id,team)=>a.isPlayer?mpLoadout(a,()=>mpOriginalPrepare(a,id,team)):mpOriginalPrepare(a,id,team);
respawnActor=(a,initial)=>a.isPlayer?mpLoadout(a,()=>mpOriginalRespawn(a,initial)):mpOriginalRespawn(a,initial);
updatePlayer=(a,dt,now)=>{mpCurrent=a;const i=a.mpInput||{},before={x:a.x,y:a.y,shots:a.stats.shots,slot:a.currentSlot,reload:currentWeaponState(a).reloading,dash:a.dashCooldownUntil};input.mouseDown=!!i.fire;input.fullMap=false;try{if(i.slot===0||i.slot===1)a.currentSlot=i.slot;if(i.dashPending){i.dashPending=false;const d=dashDirectionFromPlayer(a);tryDash(a,d.x,d.y,now);}mpOriginalPlayer(a,dt,now);if(i.fire&&!currentWeapon(a).auto&&!a.mpFireHeld&&!a.dead)fire(a,a.angle,now);a.mpFireHeld=!!i.fire;if(a.x!==before.x||a.y!==before.y||a.stats.shots>before.shots||a.currentSlot!==before.slot||!before.reload&&currentWeaponState(a).reloading||a.dashCooldownUntil>before.dash)a.mpActiveParticipation=true;}finally{mpCurrent=null;input.mouseDown=false;}};
endMatch=(m,winner,reason='score')=>{if(!m||m.status!=='active'||m.result||!matchUsesCurrentBalance(m))return;m.status='ended';m.winner=m.practice?null:winner;m.endReason=reason;m.endedAt=gameNow();m.rewardResult=rewardSnapshot(m);m.result=snapshotResult(m);for(const a of m.participants){a.vx=a.vy=0;a.target=null;}};
window.__MULTIPLAYER={
 capture(){return {state,SAVE,meta,simulationTime,nextActorId,nextShotId,botMetaCache,diagnostics,damageNumbers,mpKillfeed,routeCache:ROUTE_CACHE,navigation:{ready:NAV_READY,walkable:NAV_WALKABLE,edges:NAV_EDGES,cover:COVER_POINTS}};},
 restore(v){const savedMatch=v.state.matches[4];if(typeof activateMap==='function')activateMap(savedMatch?.mapId||'brightfield-blocks',savedMatch?.mapVersion??null);state=v.state;SAVE=v.SAVE;meta=v.meta;simulationTime=v.simulationTime;nextActorId=v.nextActorId;nextShotId=v.nextShotId;botMetaCache=v.botMetaCache;mpKillfeed=v.mpKillfeed||[];Object.assign(diagnostics,v.diagnostics);damageNumbers.splice(0,damageNumbers.length,...v.damageNumbers);ROUTE_CACHE.clear();for(const [key,value] of v.routeCache)ROUTE_CACHE.set(key,value);NAV_READY=v.navigation.ready;NAV_WALKABLE=v.navigation.walkable;NAV_EDGES=v.navigation.edges;COVER_POINTS.splice(0,COVER_POINTS.length,...v.navigation.cover);},
 create(humans,bots,context){state.matches=[];state.actors=[];state.idleBots=[];state.projectiles=[];state.particles=[];state.running=false;state.mode='menu';state.paused=false;state.leagueStarted=true;
 const actors=humans.map(spec=>{const a=makeActor(spec.name,true,999,true);a.participantId=spec.id;a.userId=spec.id;a.mpLoadout=spec.loadout;a.mpCosmetic=spec.cosmetic;a.mpVictoryPose=spec.victoryPose;a.skinIndex=spec.skinIndex;a.mpInput={seq:-1,moveX:0,moveY:0,aim:0};return a;});
 for(const spec of bots){const index=BOT_NAMES.indexOf(spec.name),a=makeActor(spec.name,false,index,true);a.sourceBotId=a.profile.id;a.botOwnerId=spec.ownerId;a.mpFamiliarityStart=cloneData(botData(a).familiarity);if(context.sessionType==='custom'){const difficulty=spec.difficulty||context.config?.difficulty;a.customDifficulty=Object.hasOwn(TACTICS.presets,difficulty)?difficulty:'Medium';a.execution=TACTICS.presets[a.customDifficulty];}actors.push(a);}
 state.actors=actors;const teamsByActor={};actors.forEach((a,i)=>{teamsByActor[a.id]=context.teams[i];});
 const m=startMatch(4,actors,false,{...context,teamsByActor,shuffle:false});m.eligible=context.eligible;m.xpEligible=context.xpEligible;m.networkMode=context.networkMode;m.status='preparing';m.hasPlayer=false;return m;},
 countdown(m){beginMatchCountdown(m);},
 snapshot(m,viewerId){const player=m.participants.find(a=>a.userId===viewerId),visible=a=>a===player||isAlly(a,player)||!a.dead&&player&&!player.dead&&hasLOS(player,a),now=gameNow();return {now,objectives:cloneData(m.objectives||[]),modeState:cloneData(m.modeState||null),modeRulesRevision:m.modeRulesRevision||null,roster:m.participants.map(a=>({id:a.id,userId:a.userId||null,participantId:a.participantId,name:a.name,isPlayer:a.isPlayer,team:a.team,dead:a.dead,skinIndex:a.skinIndex,victoryPose:a.mpVictoryPose||null,sourceBotId:a.sourceBotId||null,gunTier:a.gunTier??null,gunTierKills:a.gunTierKills??null,abandoned:a.abandoned===true,...cloneData(a.stats)})),actors:m.participants.filter(visible).map(a=>({id:a.id,userId:a.userId||null,participantId:a.participantId,name:a.name,isPlayer:a.isPlayer,botOwnerId:a.botOwnerId||null,sourceBotId:a.sourceBotId||null,team:a.team,x:a.x,y:a.y,vx:a.vx,vy:a.vy,angle:a.angle,hp:a.hp,dead:a.dead,skinIndex:a.skinIndex,cosmetic:a.mpCosmetic||null,victoryPose:a.mpVictoryPose||null,sprinting:a.sprinting,ads:a.ads,adsBlend:a.adsBlend,spread:effectiveSpreadDeg(a),currentSlot:a.currentSlot,slots:cloneData(a.slots),stats:cloneData(a.stats),gunTier:a.gunTier??null,gunTierKills:a.gunTierKills??null,visual:cloneData(a.visual),muzzleUntil:a.muzzleUntil,recoil:a.recoil,hitFlash:a.hitFlash,spawnFlash:a.spawnFlash,respawnAt:a.respawnAt,dashUntil:a.dashUntil,dashCooldownUntil:a.dashCooldownUntil,lastDamageAt:a.lastDamageAt,regenActive:a.regenActive,presentationShotId:a.presentationShotId||null,profile:a.profile?{id:a.profile.id,power:a.profile.power,archetype:a.profile.archetype}:null,ack:a.mpInput?.seq??null})),projectiles:state.projectiles.filter(p=>p.matchId===m.id&&player&&pointLOS(player.x,player.y,p)).map(p=>({matchId:p.matchId,x:p.x,y:p.y,px:p.px,py:p.py,vx:p.vx,vy:p.vy,weapon:p.weapon,ownerId:p.owner.id,feedbackId:p.feedbackId})),particles:state.particles.filter(p=>p.matchId===m.id&&player&&pointLOS(player.x,player.y,p)).map(p=>({...p})),damageNumbers:damageNumbers.filter(n=>n.matchId===m.id&&n.ownerId===player?.id&&now-n.born<n.life).map(n=>{const target=m.participants.find(a=>a.id===n.targetId&&!a.dead&&visible(a)),progress=clamp((now-n.born)/n.life,0,1);return {id:n.mpFeedbackId||n.ownerId+':'+n.targetId+':'+n.born+':'+n.offsetX,ownerId:n.ownerId,targetId:n.targetId,x:target?.x??n.x,y:target?.y??n.y,text:String(Number(n.amount.toFixed(1))),amount:n.amount,head:n.head,killing:n.killing,offsetX:n.offsetX,rise:26*progress,alpha:1-progress};}),countdown:matchCountdownSnapshot(m),balanceFingerprint:m.balanceFingerprint};},
 result(m){const r=cloneData(m.result);return {...r,mapId:m.mapId||'brightfield-blocks',mapVersion:m.mapVersion||null,mapSelection:cloneData(m.context?.mapSelection||null),eligible:m.eligible,xpEligible:m.xpEligible??m.eligible,ltmDefinition:cloneData(m.context?.ltmDefinition||null),modeState:cloneData(m.modeState||null),objectives:cloneData(m.objectives||[]),modeRulesRevision:m.modeRulesRevision||null,aiRevision:m.aiRevision||AI_REVISION,rulesetRevision:m.rulesetRevision||RULESET_REVISION,balance:{id:SAVE.patchState.id,version:m.balanceVersion||SAVE.patchState.balanceVersion,fingerprint:m.balanceFingerprint},distanceProvenance:cloneData(DISTANCE_UNITS.worldProvenance(DISTANCE_UNITS.mapCalibration(m.mapId||'brightfield-blocks'))),rewards:cloneData(m.rewardResult),rows:r.rows.map(row=>{const a=m.participants.find(a=>a.id===row.id),reward=m.rewardResult.rows.find(r=>r.participantId===a.participantId);return {...row,skinIndex:a.skinIndex,operatorId:SKINS[a.skinIndex]?.id||null,skinPalette:cloneData(SKINS[a.skinIndex]||{}),cosmetic:cloneData(a.mpCosmetic||null),victoryPose:a.mpVictoryPose||'quiet-confidence',userId:a.userId||null,botOwnerId:a.botOwnerId||null,sourceBotId:a.sourceBotId||null,activeParticipation:a.mpActiveParticipation===true,...(!a.isPlayer?{familiarity:{before:cloneData(a.mpFamiliarityStart||{}),after:cloneData(botData(a).familiarity)}}:{}),stats:cloneData(a.stats),won:reward?.won??null,leaders:cloneData(reward?.leaders||{}),weaponStats:cloneData(a.matchWeaponStats||{}),weaponUsage:cloneData(a.weaponUsage||{}),meta:cloneData(a.tournamentMeta||{}),events:cloneData(a.xpEvents||XP.events())};})};},
 getMatch:()=>state.matches[4],killfeed:()=>mpKillfeed.slice()
};`;
 return source.replace(/\}\)\(\);\s*$/,hooks+'})();');
}
function makeEngine(save,now,saved){
 let restored=null,source=fs.readFileSync(GAME,'utf8'),bound=dependencies(),epoch=now-1000;
 if(saved){
  if(saved.format!==FORMAT||!Number.isInteger(saved.bytes)||saved.bytes<=0||saved.bytes>MAX_BYTES||typeof saved.data!=='string'||saved.data.length>MAX_BYTES*1.5)throw Error('Unsupported multiplayer checkpoint');
  const bytes=zlib.inflateSync(Buffer.from(saved.data,'base64'),{maxOutputLength:MAX_BYTES});if(bytes.length!==saved.bytes)throw Error('Multiplayer checkpoint length mismatch');restored=v8.deserialize(bytes);
  if(typeof restored.source!=='string'||Buffer.byteLength(restored.source)>2*1024*1024||hash(restored.source)!==saved.sourceHash||!checkpointDependencies(saved.dependencies,bound,restored.source)||!Number.isFinite(restored.epoch)||!Number.isInteger(restored.rng))throw Error('Multiplayer checkpoint engine identity mismatch; saved match retained');
  source=restored.source;epoch=restored.epoch;
 }
 let e;e=engine({'sar-persistent-save':JSON.stringify(restored?.snapshot.SAVE||save)},instrument(source),{wallNow:()=>epoch+(e?e.dev.now():1000)});
 let rng=(restored?.rng??crypto.randomBytes(4).readUInt32LE())>>>0;e.context.Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 e.mp={source,epoch,dependencies:bound,rng:()=>rng,hooks:e.context.__MULTIPLAYER};if(restored){e.mp.hooks.restore(restored.snapshot);e.ui.advance(e.dev.now()-1000);}return e;
}
function checkpoint(e){
 const bytes=v8.serialize({source:e.mp.source,epoch:e.mp.epoch,rng:e.mp.rng(),snapshot:e.mp.hooks.capture()});if(bytes.length>MAX_BYTES)throw Error('Multiplayer checkpoint exceeds supported size');
 return {format:FORMAT,sourceHash:hash(e.mp.source),dependencies:e.mp.dependencies,bytes:bytes.length,data:zlib.deflateSync(bytes,{level:1}).toString('base64')};
}
function validateInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('Invalid gameplay input',400);
  const allowed=new Set(['seq','moveX','moveY','aim','ads','sprint','fire','reload','dash','slot','ready']);for(const key of Object.keys(value))if(!allowed.has(key))throw fail('Only gameplay intent may be submitted',400);
 if(!Number.isSafeInteger(value.seq)||value.seq<0||value.seq>Number.MAX_SAFE_INTEGER-1)throw fail('Invalid input sequence',400);
 for(const key of ['moveX','moveY','aim'])if(value[key]!==undefined&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||(key!=='aim'&&Math.abs(value[key])>1)||(key==='aim'&&Math.abs(value[key])>Math.PI*4)))throw fail('Invalid '+key,400);
 for(const key of ['ads','sprint','fire','reload','dash','ready'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw fail('Invalid '+key,400);
 if(value.slot!==undefined&&value.slot!==0&&value.slot!==1)throw fail('Invalid weapon slot',400);
 return {seq:value.seq,moveX:value.moveX||0,moveY:value.moveY||0,aim:value.aim||0,ads:value.ads===true,sprint:value.sprint===true,fire:value.fire===true,reload:value.reload===true,dash:value.dash===true,...(value.slot===undefined?{}:{slot:value.slot}),ready:value.ready===true};
}
function createRuntime({db,now=Date.now,manual=false,casualWaitMs=10000,mapVoteMs=6000,ltmDefinitions=null,graceMs=45000,preparationTimeoutMs=30000,maxSteps=120,onResult=()=>{},onChange=()=>{},botOwnerId=process.env.SAR_BOT_OWNER_ID||null,backgroundLeases=false,backgroundLeaseMs=6000}={}){
 if(!db)throw TypeError('A multiplayer database is required');
 if(!Number.isInteger(backgroundLeaseMs)||backgroundLeaseMs<1000||backgroundLeaseMs>30000)throw TypeError('A bounded background lease duration is required');
 if(!Number.isInteger(mapVoteMs)||mapVoteMs<0||mapVoteMs>6000)throw TypeError('A map vote must be bounded to six seconds');
 const mapPools=MapPools.configuration(db);
 let definitions=ltmDefinitions;if(definitions===null){try{definitions=JSON.parse(process.env.SAR_LTM_DEFINITIONS||'[]');}catch{throw TypeError('SAR_LTM_DEFINITIONS must be a JSON array');}}
 if(!Array.isArray(definitions)||definitions.length>24)throw TypeError('A bounded limited-time definition array is required');
 const weapons=definitions.length?engine().context.SAR.getWeapons():null,limitedModes=new Map();for(const raw of definitions){const d=ModeRules.validateLTM(raw,{weapons,maps:Maps});if(limitedModes.has(d.id))throw TypeError('Duplicate limited-time definition');if(!d.mapPool.some(id=>mapPools.pools.ltm.includes(id)))throw TypeError('Limited-time mode has no map in the current LTM pool');limitedModes.set(d.id,d);const old=ModeRules.getLTM(d.id);if(!old)ModeRules.registerLTM(d,{weapons,maps:Maps});else if(JSON.stringify(old)!==JSON.stringify(d))throw TypeError('Limited-time identity already describes different rules');}
 const policyFor=(id,options={})=>{const limited=typeof id==='string'&&id.startsWith('ltm:'),definition=limited?(options.ltmDefinition||limitedModes.get(id.slice(4))):null;if(limited&&!definition)throw fail('This limited-time mode is unavailable',400);return policy(id,{at:now(),...options,...(limited?{ltmDefinition:definition}:{})});};
 const poolsFor=p=>p.ltmDefinition?{...mapPools,pools:{...mapPools.pools,ltm:mapPools.pools.ltm.filter(id=>p.ltmDefinition.mapPool.includes(id))}}:mapPools;
 const activeLimited=()=>[...limitedModes.values()].filter(d=>now()>=Date.parse(d.activeFrom)&&now()<Date.parse(d.activeUntil)).map(clone);
 const matches=new Map(),membership=new Map(),queues=new Map(),connections=new Map(),botUsage=new Map();let closed=false,timer,owner=botOwnerId,backgroundLease=null,canonicalBotIds=null;
 const priorNamespace=db.prepare('SELECT state_json FROM mp_matches ORDER BY created_at,id LIMIT 1').get();if(!owner&&priorNamespace)owner=JSON.parse(priorNamespace.state_json).ownerId||null;
 function userInfo(user){const id=typeof user==='string'?user:user?.id;if(typeof id!=='string'||!id||!db.prepare('SELECT 1 FROM users WHERE id=? AND disabled_at IS NULL').get(id))throw fail('Account unavailable',401);const row=db.prepare('SELECT id,username FROM users WHERE id=?').get(id);return {...row,...(typeof user==='object'?user:{}),id};}
 function persist(entry){
  Replays.persistCapture(db,entry.e);
  const at=now(),state={version:1,id:entry.id,mode:entry.policy.id,ownerId:entry.ownerId,botIds:entry.match.participants.filter(a=>!a.isPlayer).map(a=>a.sourceBotId),createdAt:entry.createdAt,prepareUntil:entry.prepareUntil,prepareDeadline:entry.prepareDeadline,ready:[...entry.ready],disconnected:[...entry.disconnected],abandoned:[...entry.abandoned],context:entry.context||null,mapSelection:entry.mapSelection,checkpoint:checkpoint(entry.e)};
  db.prepare('INSERT INTO mp_matches(id,mode,status,state_json,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,state_json=excluded.state_json,result_json=excluded.result_json,updated_at=excluded.updated_at').run(entry.id,entry.policy.id,entry.match.status,JSON.stringify(state),entry.result?JSON.stringify(entry.result):null,entry.createdAt,at);
  for(const a of entry.match.participants.filter(a=>a.isPlayer))db.prepare('INSERT INTO mp_participations(match_id,user_id,team,state_json) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET state_json=excluded.state_json').run(entry.id,a.userId,a.team,JSON.stringify({actorId:a.id,ready:entry.ready.has(a.userId),abandoned:entry.abandoned.has(a.userId),disconnectedAt:entry.disconnected.get(a.userId)??null,seq:a.mpInput?.seq??-1}));
  entry.persistedAt=at;
 }
 function retireSettledCheckpoint(id,at,entry){
  const row=db.prepare("SELECT state_json,result_json,updated_at FROM mp_matches WHERE id=? AND status='ended'").get(id);
  if(!row?.result_json||at-row.updated_at<=TERMINAL_KEEP_MS||db.prepare('SELECT 1 FROM mp_participations p LEFT JOIN mp_results r ON r.match_id=p.match_id AND r.user_id=p.user_id WHERE p.match_id=? AND (r.applied_at IS NULL OR r.applied_at<=0)').get(id))return false;
  const saved=JSON.parse(row.state_json),checkpoint=saved.checkpoint;if(typeof checkpoint?.data!=='string')return false;
  // A finalized VM is a disposable reconnect cache. Keep the game record,
  // configuration and engine identity; pending receipts still need its full
  // recoverable state. Cancelled/live games never enter this path.
  try{
   let snapshot=entry?.e.mp.hooks.capture();
   if(!snapshot){
    if(checkpoint.format!==FORMAT||!Number.isInteger(checkpoint.bytes)||checkpoint.bytes<=0||checkpoint.bytes>MAX_BYTES||checkpoint.data.length>MAX_BYTES*1.5)throw Error('Unsupported terminal checkpoint');
    const bytes=zlib.inflateSync(Buffer.from(checkpoint.data,'base64'),{maxOutputLength:MAX_BYTES});if(bytes.length!==checkpoint.bytes)throw Error('Terminal checkpoint length mismatch');
    const restored=v8.deserialize(bytes);if(typeof restored.source!=='string'||hash(restored.source)!==checkpoint.sourceHash)throw Error('Terminal checkpoint engine identity mismatch');snapshot=restored.snapshot;
   }
   const match=snapshot?.state?.matches?.find(match=>match?.matchId===id);if(!match||match.status!=='ended')throw Error('Terminal checkpoint match identity mismatch');
   saved.terminal={match:clone(Object.fromEntries(['matchId','context','mode','sessionType','eligible','practice','networkMode','aiRevision','rulesetRevision','balanceVersion','balanceFingerprint','appVersion','mapId','mapVersion','calibrationId','distanceUnit','score','limit','durationMs','startedAt','endedAt','winner','endReason','modeState','objectives','modeRulesRevision','xpEligible','masteryRevision'].filter(key=>match[key]!==undefined).map(key=>[key,match[key]]))),config:clone(snapshot.SAVE.config),weaponConfiguration:clone(snapshot.SAVE.patchState.weaponStats),participants:match.participants.map(actor=>clone({actorId:actor.id,participantId:actor.participantId,userId:actor.userId||null,sourceBotId:actor.sourceBotId||null,botOwnerId:actor.botOwnerId||null,name:actor.name,team:actor.team,skinIndex:actor.skinIndex,loadout:actor.mpLoadout||null,cosmetic:actor.mpCosmetic||null,victoryPose:actor.mpVictoryPose||'quiet-confidence',customDifficulty:actor.customDifficulty||null,slots:actor.slots}))};
   saved.checkpoint={...checkpoint,retiredAt:at};delete saved.checkpoint.data;
   return db.prepare("UPDATE mp_matches SET state_json=? WHERE id=? AND status='ended' AND state_json=? AND result_json=? AND updated_at=? AND NOT EXISTS (SELECT 1 FROM mp_participations p LEFT JOIN mp_results r ON r.match_id=p.match_id AND r.user_id=p.user_id WHERE p.match_id=mp_matches.id AND (r.applied_at IS NULL OR r.applied_at<=0))").run(JSON.stringify(saved),id,row.state_json,row.result_json,row.updated_at).changes===1;
  }catch(error){console.error('Terminal multiplayer checkpoint '+id+' retained: '+error.message);return false;}
 }
 for(const row of db.prepare("SELECT * FROM mp_matches WHERE status NOT IN ('ended','cancelled') ORDER BY created_at,id").all()){
  try{const saved=JSON.parse(row.state_json);if(saved.version!==1||saved.id!==row.id)throw Error('Multiplayer checkpoint match identity mismatch');const e=makeEngine(null,now(),saved.checkpoint),match=e.mp.hooks.getMatch();if(match?.matchId!==row.id)throw Error('Multiplayer checkpoint simulation identity mismatch');
   MapPools.registered(match.mapId||'brightfield-blocks',match.mapVersion??undefined);const entry={id:row.id,policy:policyFor(saved.mode,{ltmDefinition:saved.context?.ltmDefinition||null,allowInactive:true}),ownerId:saved.ownerId,createdAt:saved.createdAt,prepareUntil:saved.prepareUntil,prepareDeadline:saved.prepareDeadline,ready:new Set(saved.ready||[]),disconnected:new Map(saved.disconnected||[]),abandoned:new Set(saved.abandoned||[]),context:saved.context,mapSelection:saved.mapSelection,e,match,persistedAt:now()};matches.set(row.id,entry);owner??=entry.ownerId;try{Replays.begin(db,e,match,entry.ownerId,{resumed:true,date:entry.createdAt});}catch(error){console.warn('Replay unavailable: '+error.message);}
   for(const a of match.participants.filter(a=>a.isPlayer)){if(membership.has(a.userId))throw Error('Duplicate saved multiplayer participation');membership.set(a.userId,row.id);entry.disconnected.set(a.userId,now());a.disconnected=true;a.objectiveEligible=false;a.mpInput={...a.mpInput,moveX:0,moveY:0,fire:false,ads:false,sprint:false,dashPending:false,reload:false};}
  }catch(error){console.error('Multiplayer checkpoint '+row.id+': '+error.message);throw error;}
 }
 // A process exit between committing a final result and applying its receipts
 // resumes the same finalizer, never a new simulation or a client report.
 for(const row of db.prepare("SELECT m.* FROM mp_matches m JOIN replay_captures c ON c.match_id=m.id WHERE m.status='ended' AND m.result_json IS NOT NULL").all())try{const saved=JSON.parse(row.state_json),e=makeEngine(null,now(),saved.checkpoint),m=e.mp.hooks.getMatch();Replays.begin(db,e,m,saved.ownerId,{resumed:true,date:saved.createdAt});Replays.finish(db,e,m,JSON.parse(row.result_json));}catch(error){console.warn('Finished replay recovery retained: '+error.message);}
 for(const row of db.prepare("SELECT m.* FROM mp_matches m WHERE m.status='ended' AND m.result_json IS NOT NULL AND EXISTS(SELECT 1 FROM mp_results r WHERE r.match_id=m.id AND r.applied_at=0)").all()){
  const saved=JSON.parse(row.state_json),result=JSON.parse(row.result_json);onResult(result,{id:row.id,policy:policyFor(row.mode,{ltmDefinition:saved.context?.ltmDefinition||null,allowInactive:true}),ownerId:saved.ownerId,context:saved.context,result});
 }
 for(const row of db.prepare('SELECT * FROM mp_queue_entries ORDER BY created_at,id').all()){
  const saved=JSON.parse(row.state_json);let p;try{p=policyFor(saved.mode);}catch(error){if(saved.mode?.startsWith('ltm:')){db.prepare('DELETE FROM mp_queue_entries WHERE id=?').run(row.id);continue;}throw error;}const members=(saved.members||[]).map(member=>({...userInfo(member.id),mpGroup:row.id}));
  if(!members.length||p.custom||p.id==='tournament'||members.some(member=>membership.has(member.id)))db.prepare('DELETE FROM mp_queue_entries WHERE id=?').run(row.id);
  else queues.set(row.id,{id:row.id,leaderId:saved.leaderId,members,policy:p,createdAt:row.created_at,persistedParty:saved.persistedParty===true,mapVote:saved.mapVote||null});
 }
 for(const row of db.prepare('SELECT created_at,result_json FROM mp_matches WHERE result_json IS NOT NULL ORDER BY created_at').all())for(const participant of JSON.parse(row.result_json).rows||[])if(participant.sourceBotId)botUsage.set((participant.botOwnerId||JSON.parse(row.result_json).botOwnerId)+':'+participant.sourceBotId,row.created_at);
 for(const row of db.prepare("SELECT id FROM mp_matches WHERE status='ended' AND result_json IS NOT NULL AND updated_at<? AND json_type(state_json,'$.checkpoint.data')='text'").all(now()-TERMINAL_KEEP_MS))retireSettledCheckpoint(row.id,now());
 for(const entry of matches.values())for(const a of entry.match.participants.filter(a=>!a.isPlayer))botUsage.set(entry.ownerId+':'+a.sourceBotId,entry.createdAt);
 function persistQueue(q){db.prepare('INSERT INTO mp_queue_entries(id,state_json,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at').run(q.id,JSON.stringify({version:1,mode:q.policy.id,leaderId:q.leaderId,members:q.members.map(m=>({id:m.id})),persistedParty:q.persistedParty===true,mapVote:q.mapVote}),q.createdAt,now());}
 function activeFor(user){const id=typeof user==='string'?user:user?.id;return matches.get(membership.get(id));}
 function poolOwner(){owner??=db.prepare('SELECT user_id FROM worlds ORDER BY user_id LIMIT 1').get()?.user_id||null;return owner;}
 function liveBackground(){return backgroundLeases&&backgroundLease?.ready&&backgroundLease.leaseUntil>now()&&connections.get(poolOwner())===backgroundLease.connectionId?backgroundLease:null;}
 function backgroundState(user){
  const id=typeof user==='string'?user:user?.id,ownerId=poolOwner(),required=backgroundLeases&&id===ownerId,live=liveBackground();
  return {serverNow:now(),poolOwnerId:ownerId,required,ready:required?!!live:true,leaseUntil:required?(live?.leaseUntil||0):null,grantedBotIds:required?(live?.slots.flatMap(slot=>slot.botIds)||[]):[],blockedBotIds:required?(backgroundLease?.blockedBotIds||[]):[],grantedSlots:required?(live?.slots.map(slot=>({...slot,botIds:slot.botIds.slice()}))||[]):[],blockedSlotIds:required?(backgroundLease?.blockedSlotIds||[]):[]};
 }
 function backgroundReservations(){
  const hard=new Set([...matches.values()].filter(entry=>!['ended','cancelled'].includes(entry.match.status)).flatMap(entry=>entry.match.participants.filter(a=>!a.isPlayer).map(a=>a.sourceBotId))),future=new Set();
  for(const row of db.prepare("SELECT starts_at,status,bracket_json,metadata_json FROM tournaments WHERE user_id=? AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED')").all(poolOwner())){
   const meta=JSON.parse(row.metadata_json||'{}'),ids=new Set(meta.scheduling?.reservations||[]);if(row.status==='ACTIVE')for(const team of JSON.parse(row.bracket_json||'{}').teams||[])for(const person of team.participants||[])if(person.kind==='bot')ids.add(person.id);
   const target=row.status==='ACTIVE'||row.starts_at<=now()?hard:future;for(const id of ids)target.add(id);
  }return {hard,future};
 }
 function background(user,payload,connectionId){
  const person=userInfo(user);if(!backgroundLeases||person.id!==poolOwner())throw fail('Only the shared roster owner may coordinate background matches',403);
  if(!connectionId||connections.get(person.id)!==connectionId)throw fail('The current game connection must coordinate its background roster',403);
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['ready','slots'].includes(key))||payload.ready!==true||!Array.isArray(payload.slots)||payload.slots.length>4)throw fail('A ready roster of at most four background slots is required',400);
  if(!canonicalBotIds){const world=readWorld(db,person.id);if(!world)throw fail('The shared persistent roster is unavailable');canonicalBotIds=new Set(world.save.activeBotNames.map(name=>world.save.bots[name].profile.id));}
  const requested=[],seenSlots=new Set(),seenBots=new Set();for(const slot of payload.slots){
   if(!slot||typeof slot!=='object'||Array.isArray(slot)||Object.keys(slot).some(key=>!['slotId','matchId','botIds'].includes(key))||!Number.isInteger(slot.slotId)||slot.slotId<0||slot.slotId>3||seenSlots.has(slot.slotId)||typeof slot.matchId!=='string'||!slot.matchId||slot.matchId.length>160||/[\x00-\x1f\x7f]/.test(slot.matchId)||!Array.isArray(slot.botIds)||slot.botIds.length>10)throw fail('Invalid background slot',400);
   seenSlots.add(slot.slotId);for(const id of slot.botIds){if(typeof id!=='string'||!canonicalBotIds.has(id)||seenBots.has(id))throw fail('Background slots require unique current persistent bots',400);seenBots.add(id);}requested.push({slotId:slot.slotId,matchId:slot.matchId,botIds:slot.botIds.slice()});
  }
  const previous=liveBackground(),{hard,future}=backgroundReservations(),granted=[],blocked=[];
  for(const slot of requested){const prior=previous?.slots.find(old=>old.slotId===slot.slotId),same=prior&&prior.matchId===slot.matchId&&prior.botIds.length===slot.botIds.length&&slot.botIds.every(id=>prior.botIds.includes(id));
   // An already granted match may drain during the seven-minute event lead.
   // A new roster/match cannot use future-reserved bots, and active participants
   // always take precedence over an old local background grant.
   if(slot.botIds.some(id=>hard.has(id)||future.has(id)&&!same))blocked.push(slot);else granted.push(slot);
  }
  backgroundLease={connectionId,ready:true,leaseUntil:now()+backgroundLeaseMs,slots:granted,blockedSlotIds:blocked.map(slot=>slot.slotId),blockedBotIds:blocked.flatMap(slot=>slot.botIds)};return backgroundState(person.id);
 }
 function blockedBots(ownerId,excludingTournament){
  const reserved=Lifecycle.externalReservations(db,ownerId,excludingTournament||''),used=new Set([...matches.values()].filter(e=>!['ended','cancelled'].includes(e.match.status)).flatMap(e=>e.match.participants.filter(a=>!a.isPlayer).map(a=>a.sourceBotId||a.profile.id)));
  for(const id of used)reserved.add(id);return reserved;
 }
 function botRoster(count,ownerId,requested=[],excludingTournament){
  if(!count)return [];const world=readWorld(db,ownerId);if(!world)throw fail('The persistent bot roster is unavailable');const reserved=blockedBots(ownerId,excludingTournament),names=world.save.activeBotNames||Object.keys(world.save.bots);
  if(backgroundLeases&&ownerId===poolOwner()&&connections.has(ownerId)){const live=liveBackground();if(!live&&backgroundLease?.handshakeUntil>now())throw fail('Waiting for the current background roster');if(live)for(const slot of live.slots)for(const id of slot.botIds)reserved.add(id);}
  const pool=names.filter(name=>world.save.bots[name]?.profile?.id&&!reserved.has(world.save.bots[name].profile.id)).sort((a,b)=>(botUsage.get(ownerId+':'+world.save.bots[a].profile.id)||0)-(botUsage.get(ownerId+':'+world.save.bots[b].profile.id)||0)||world.save.bots[a].profile.id.localeCompare(world.save.bots[b].profile.id));
  let selected;if(requested.length){
   if(requested.some(slot=>!slot||typeof slot!=='object'||Array.isArray(slot)||slot.team!==undefined&&slot.team!==0&&slot.team!==1||slot.difficulty!==undefined&&!Object.hasOwn(Tactics.presets,slot.difficulty)))throw fail('Invalid custom bot slot',400);
   selected=Array(requested.length);const claimed=new Set();for(let i=0;i<requested.length;i++){const slot=requested[i];if(slot.sourceBotId==='random')continue;const name=pool.find(name=>name===slot.name||world.save.bots[name].profile.id===slot.sourceBotId);if(!name||claimed.has(name))throw fail('A selected persistent bot is already reserved');selected[i]=name;claimed.add(name);}
   for(let i=0;i<requested.length;i++)if(!selected[i]){const name=pool.find(name=>!claimed.has(name));if(!name)throw fail('Waiting for available persistent bots');selected[i]=name;claimed.add(name);}
  }else selected=pool.slice(0,count);
  if(selected.length<count)throw fail('Waiting for available persistent bots');return selected.slice(0,count).map((name,index)=>({name,ownerId,...(requested[index]?.difficulty?{difficulty:requested[index].difficulty}:{})}));
 }
 function people(user,party){
  const leader=userInfo(user),members=Array.isArray(party?.members)?party.members.map(member=>userInfo(member.id||member.userId||member)): [leader];
  if(party&&party.leaderId!==leader.id)throw fail('Only the party leader can queue',403);if(new Set(members.map(m=>m.id)).size!==members.length)throw fail('Duplicate party member');
  if(party&&members.some(member=>party.members.find(p=>(p.id||p.userId)===member.id)?.ready!==true))throw fail('Every party member must be ready');
  for(const person of members){if(!readWorld(db,person.id))throw fail('Every human must finish loading an authenticated saved world before matchmaking');if(activeFor(person)||[...queues.values()].some(q=>q.members.some(p=>p.id===person.id)))throw fail('A party member is already queued or in a match');}return members;
 }
 function loadout(person,save){
  const world=readWorld(db,person.id);if(!world)throw fail('Finish loading your authenticated saved world before matchmaking');const config=world.save.config,registered=save.patchState.weaponStats,primary=config?.primary||'AR-15',sidearm=config?.sidearm||'9mm',skinIndex=config?.skin??0;
  if(registered[primary]?.type!=='primary'||registered[sidearm]?.type!=='sidearm')throw fail('Choose a registered primary weapon and sidearm before matchmaking',400);
  if(!Number.isInteger(skinIndex)||skinIndex<0||skinIndex>=Catalog.operators.length)throw fail('Choose a registered operator before matchmaking',400);
  const env=require('./competitive-progression.cjs').environmentFor(db),cosmetic=Wallet.operatorAppearance(db,person.id,skinIndex,env),victoryPose=Wallet.contentSelections(db,person.id,env)['victory-pose'].pose;
  return {id:person.id,name:person.username,skinIndex,cosmetic,victoryPose,loadout:{primary,sidearm}};
 }
 function allocate(p,members,{context=null,config=null,explicitBots=null,mapChoice=null}={}){
  if(members.some(person=>!readWorld(db,person.id)))throw fail('Every human must finish loading an authenticated saved world before matchmaking');
  owner??=db.prepare('SELECT user_id FROM worlds ORDER BY user_id LIMIT 1').get()?.user_id||members[0].id;const host=context?.botOwnerId||owner,world=readWorld(db,host);if(!world)throw fail('Your authenticated world must finish loading before matchmaking');
  const id=context?.gameId||'match:mp:'+crypto.randomUUID(),humans=members.map(person=>loadout(person,world.save));let bots;
  if(explicitBots)bots=botRoster(explicitBots.length,host,explicitBots,context?.tournamentId);
  else if(p.ranked)bots=[];
  else if(p.custom&&Array.isArray(config?.bots))bots=botRoster(config.bots.length,host,config.bots);
  else bots=botRoster(Math.max(0,p.size-humans.length),host);
  if(humans.length+bots.length>10)throw fail('A match supports at most ten participants',400);if(humans.length===0||p.ranked&&humans.length!==10)throw fail('This mode requires ten human participants');
  const groups=members.map(p=>p.mpGroup||p.id),teams=Array(humans.length+bots.length).fill(0);if(p.teamMode){
   const grouped=new Map();groups.forEach((group,index)=>{if(!grouped.has(group))grouped.set(group,[]);grouped.get(group).push(index);});const counts=[0,0];
   for(const group of [...grouped.values()].sort((a,b)=>b.length-a.length)){let team=counts[0]<=counts[1]?0:1;if(counts[team]+group.length>p.teamSize)team=1-team;if(counts[team]+group.length>p.teamSize)throw fail('Parties do not fit the available team slots');for(const i of group)teams[i]=team;counts[team]+=group.length;}
   for(let i=humans.length;i<teams.length;i++){const team=counts[0]<=counts[1]?0:1;teams[i]=team;counts[team]++;}
  }else teams.forEach((_,i)=>teams[i]=i);
  if(p.custom&&p.teamMode&&config&&(Array.isArray(config.bots)||config.playerTeam===0||config.playerTeam===1)){humans.forEach((_,i)=>teams[i]=config.playerTeam===1?1:0);const counts=[teams.slice(0,humans.length).filter(t=>t===0).length,teams.slice(0,humans.length).filter(t=>t===1).length];bots.forEach((_,i)=>{const team=Array.isArray(config.bots)?config.bots[i]?.team===1?1:0:counts[0]<=counts[1]?0:1;teams[humans.length+i]=team;counts[team]++;});if(counts.some(count=>count>p.teamSize))throw fail('Each custom team supports '+p.teamSize+' participants',400);}
  if(context?.teams){const assigned=new Map(context.teams.flatMap((team,index)=>team.participants.map(person=>[person.id,index])));humans.forEach((h,i)=>teams[i]=assigned.get(h.id)??teams[i]);bots.forEach((bot,i)=>teams[humans.length+i]=assigned.get(world.save.bots[bot.name].profile.id)??teams[humans.length+i]);}
  const pools=poolsFor(p),pool=p.pool,chosen=context?.mapId?MapPools.selection({...mapPools,pools:{...mapPools.pools,tournament:[context.mapId]}},pool,context.mapId):MapPools.selection(pools,pool,config?.mapId||mapChoice||MapPools.candidates(pools,pool,MapPools.previousMultiplayer(db,pool))[0]);if(context?.mapVersion!==undefined)MapPools.registered(chosen.mapId,context.mapVersion);
  if(p.ltmDefinition){for(const human of humans){for(const slot of ['primary','sidearm'])if(!p.ltmDefinition.allowedLoadouts.includes(human.loadout[slot])){const replacement=p.ltmDefinition.allowedLoadouts.find(name=>world.save.patchState.weaponStats[name]?.type===slot);human.loadout[slot]=replacement||p.ltmDefinition.allowedLoadouts[0];}}}
  const createdAt=now(),e=makeEngine(BotProjection.applyToWorld(db,host,world.save),createdAt),match=e.mp.hooks.create(humans,bots,{...context,...chosen,mode:p.mode,sessionType:p.sessionType,gameId:id,networkMode:p.id,eligible:!p.custom&&(p.id!=='tournament'||context?.tournamentKind==='official')&&(!p.ltmDefinition||p.ltmDefinition.statEligible),xpEligible:!p.custom&&(!p.ltmDefinition||p.ltmDefinition.xpEligible),...(p.ltmDefinition?{ltmDefinition:p.ltmDefinition}:{}),teams,...(config?{config}:{})});
  if(p.custom)match.practice=!p.teamMode?match.participants.length<2:new Set(teams).size<2;
  const entry={id,policy:p,ownerId:host,createdAt,prepareUntil:createdAt+3000,prepareDeadline:context?.schedule?.matchStartAt||createdAt+preparationTimeoutMs,ready:new Set(),disconnected:new Map(),abandoned:new Set(),context:p.ltmDefinition?{...context,ltmDefinition:p.ltmDefinition}:context,mapSelection:context?.mapSelection||chosen.mapSelection,e,match};
  for(const person of members)membership.set(person.id,id);for(const a of match.participants.filter(a=>!a.isPlayer))botUsage.set(host+':'+a.sourceBotId,createdAt);matches.set(id,entry);MapPools.remember(db,mapPools);try{Replays.begin(db,e,match,host,{date:createdAt});}catch(error){console.warn('Replay unavailable: '+error.message);}persist(entry);onChange({type:'match-created',matchId:id,userIds:members.map(m=>m.id),mode:p.id});return entry;
 }
 function finish(entry){
  if(entry.result)return;entry.result=entry.e.mp.hooks.result(entry.match);entry.result.metaDistanceProvenance=MapPools.metaProvenance(entry.result.distanceProvenance,entry.e.dev.inspect().SAVE.patchState.distanceProvenance);entry.result.networkMode=entry.policy.id;entry.result.botOwnerId=entry.ownerId;entry.result.abandonedUserIds=[...entry.abandoned];for(const row of entry.result.rows)row.completed=!row.userId||!entry.abandoned.has(row.userId);entry.result.tournament=entry.context?Object.fromEntries(['tournamentId','tournamentKind','seriesId','gameId','teamIds','rulesetId','round','requiredGames'].filter(key=>entry.context[key]!==undefined).map(key=>[key,clone(entry.context[key])])):null;persist(entry);
  for(const a of entry.match.participants.filter(a=>a.isPlayer)){
   db.prepare('INSERT OR IGNORE INTO mp_results(match_id,user_id,result_json,applied_at) VALUES(?,?,?,0)').run(entry.id,a.userId,JSON.stringify(entry.result));
  }
  Replays.finish(db,entry.e,entry.match,entry.result);onResult(entry.result,entry);onChange({type:'match-ended',matchId:entry.id,userIds:entry.match.participants.filter(a=>a.isPlayer).map(a=>a.userId)});
 }
 function queue(user,mode,party){
  const p=policyFor(mode);if(p.custom||p.id==='tournament')throw fail('Use the match setup for this mode',400);const members=people(user,party);if(members.length>(p.teamMode?p.teamSize:p.size))throw fail('This party is too large for the mode');
  const pools=poolsFor(p),previous=MapPools.previousMultiplayer(db,p.pool),options=p.ranked?[]:MapPools.candidates(pools,p.pool,previous,2),existingVote=[...queues.values()].find(q=>q.policy.id===p.id&&q.mapVote)?.mapVote;
  const ballot=!p.ranked&&options.length>1&&mapVoteMs>0&&casualWaitMs>0?{...(existingVote?{id:existingVote.id,deadline:existingVote.deadline,options:existingVote.options.slice()}:{id:'vote:'+crypto.randomUUID(),deadline:now()+Math.min(mapVoteMs,casualWaitMs),options}),votes:{}}:null;
  const id=party?.id||members[0].id,q={id,leaderId:userInfo(user).id,members:members.map(m=>({...m,mpGroup:id})),policy:p,createdAt:now(),persistedParty:!!party&&!!db.prepare('SELECT 1 FROM mp_parties WHERE id=?').get(id),mapVote:ballot};queues.set(id,q);persistQueue(q);onChange({type:'queue',userIds:members.map(m=>m.id),mode:p.id});tryQueues();return snapshot(user);
 }
 function mapVote(user,{voteId,mapId}={}){
  const id=userInfo(user).id,q=[...queues.values()].find(q=>q.members.some(member=>member.id===id)),ballot=q?.mapVote;
  if(!ballot||ballot.id!==voteId||now()>=ballot.deadline)throw fail('This map vote has closed');if(typeof mapId!=='string'||!ballot.options.includes(mapId)||!poolsFor(q.policy).pools[q.policy.pool].includes(mapId))throw fail('Choose an eligible map',400);
  ballot.votes[id]=mapId;persistQueue(q);return snapshot(user);
 }
 function ballotSnapshot(q,id){
  const ballot=q.mapVote;if(!ballot)return null;const options=ballot.options.filter(mapId=>poolsFor(q.policy).pools[q.policy.pool].includes(mapId)),counts=Object.fromEntries(options.map(mapId=>[mapId,0]));
  for(const other of queues.values())if(other.mapVote?.id===ballot.id)for(const member of other.members){const chosen=other.mapVote.votes?.[member.id];if(Object.hasOwn(counts,chosen))counts[chosen]++;}
  return {id:ballot.id,deadline:ballot.deadline,options:options.map(mapId=>{const map=MapPools.registered(mapId);return {id:mapId,name:map.name,revision:map.revision};}),counts,currentVote:ballot.votes?.[id]||null,selectedMapId:null};
 }
 function cancelQueue(user){const id=userInfo(user).id,q=[...queues.values()].find(q=>q.members.some(m=>m.id===id));if(!q)return snapshot(user);if(q.leaderId!==id)throw fail('Only the party leader can cancel the queue',403);queues.delete(q.id);db.prepare('DELETE FROM mp_queue_entries WHERE id=?').run(q.id);onChange({type:'queue-cancelled',userIds:q.members.map(m=>m.id)});return snapshot(user);}
 function tryQueues(){
  // Revalidate immediately before allocation. HTTP social actions and another
  // window can change a persisted party without passing through the socket.
  for(const q of [...queues.values()])if(q.persistedParty){const party=db.prepare('SELECT leader_id,queue_status FROM mp_parties WHERE id=?').get(q.id),members=db.prepare('SELECT user_id,ready FROM mp_party_members WHERE party_id=?').all(q.id),ids=new Set(q.members.map(m=>m.id));
   const blocked=members.some(a=>members.some(b=>a.user_id!==b.user_id&&db.prepare('SELECT 1 FROM mp_blocks WHERE user_id=? AND blocked_id=?').get(a.user_id,b.user_id)));
   if(!party||party.leader_id!==q.leaderId||party.queue_status!=='queued'||members.length!==q.members.length||members.some(member=>!ids.has(member.user_id)||member.ready!==1)||blocked)cancelQueue(q.leaderId);
  }
  for(const q of [...queues.values()])if(q.policy.ltmDefinition&&(now()<Date.parse(q.policy.ltmDefinition.activeFrom)||now()>=Date.parse(q.policy.ltmDefinition.activeUntil)))cancelQueue(q.leaderId);
  for(const id of [...new Set([...queues.values()].map(q=>q.policy.id))]){
   const pending=[...queues.values()].filter(q=>q.policy.id===id).sort((a,b)=>a.createdAt-b.createdAt);if(!pending.length)continue;let selected=[],members=[],counts=[0,0];
   for(const q of pending){if(members.length+q.members.length>q.policy.size)continue;if(q.policy.teamMode){let team=counts[0]<=counts[1]?0:1;if(counts[team]+q.members.length>q.policy.teamSize)team=1-team;if(counts[team]+q.members.length>q.policy.teamSize)continue;counts[team]+=q.members.length;}selected.push(q);members.push(...q.members);}
   const p=pending[0].policy;if(members.length<p.size&&(p.ranked||now()-pending[0].createdAt<casualWaitMs))continue;
   const ballot=selected[0].mapVote;if(ballot&&now()<ballot.deadline)continue;const available=MapPools.candidates(poolsFor(p),p.pool,MapPools.previousMultiplayer(db,p.pool));
   const ballotCounts=Object.fromEntries(available.map(mapId=>[mapId,0]));for(const q of selected)for(const member of q.members){const chosen=q.mapVote?.votes?.[member.id];if(Object.hasOwn(ballotCounts,chosen))ballotCounts[chosen]++;}const chosen=available.slice().sort((a,b)=>ballotCounts[b]-ballotCounts[a])[0];
   try{allocate(p,members,{mapChoice:chosen});for(const q of selected){queues.delete(q.id);db.prepare('DELETE FROM mp_queue_entries WHERE id=?').run(q.id);}}catch(error){if(error.status!==409)throw error;for(const q of selected)q.waitReason=error.message;}
  }
 }
 function custom(user,config={},party){if(!config||typeof config!=='object'||Array.isArray(config))throw fail('A custom match configuration is required',400);const p=policyFor('custom-'+(config.mode||'tdm')),members=people(user,party);if(members.length>(p.teamMode?p.teamSize:p.size))throw fail('This party is too large for the custom match');allocate(p,members.map(m=>({...m,mpGroup:party?.id||m.id})),{config});return snapshot(user);}
 function input(user,payload){
  const id=userInfo(user).id,entry=activeFor(id);if(!entry)throw fail('No active multiplayer match');if(entry.abandoned.has(id))throw fail('This match was abandoned');const value=validateInput(payload),a=entry.match.participants.find(a=>a.userId===id);
  if(value.seq<=(a.mpInput?.seq??-1))return {accepted:false,ack:a.mpInput?.seq};const previous=a.mpInput||{};a.mpInput={...value,dashPending:previous.dashPending||value.dash&&!previous.dash,receivedAt:now()};if(value.ready)entry.ready.add(id);return {accepted:true,ack:value.seq};
 }
 function ready(user){const id=userInfo(user).id,entry=activeFor(id);if(!entry)throw fail('No prepared multiplayer match');if(entry.abandoned.has(id))throw fail('This match was abandoned');entry.ready.add(id);persist(entry);return snapshot(id);}
 function connect(user,connectionId){const id=userInfo(user).id;if(typeof connectionId!=='string'||!connectionId||connectionId.length>120)throw fail('Invalid connection',400);const prior=connections.get(id);connections.set(id,connectionId);if(backgroundLeases&&id===poolOwner()&&prior!==connectionId)backgroundLease={connectionId,ready:false,handshakeUntil:now()+backgroundLeaseMs,leaseUntil:0,slots:[],blockedBotIds:[],blockedSlotIds:[]};const entry=activeFor(id);if(entry&&!entry.abandoned.has(id)){entry.disconnected.delete(id);const a=entry.match.participants.find(a=>a.userId===id);if(a){a.disconnected=false;a.objectiveEligible=true;}}return {replaced:prior&&prior!==connectionId?prior:null,state:snapshot(id)};}
 function disconnect(user,connectionId){const id=typeof user==='string'?user:user?.id;if(connections.get(id)!==connectionId)return false;connections.delete(id);if(id===poolOwner())backgroundLease=null;const entry=activeFor(id);if(entry&&!['ended','cancelled'].includes(entry.match.status)){entry.disconnected.set(id,now());const a=entry.match.participants.find(a=>a.userId===id);a.disconnected=true;a.objectiveEligible=false;a.mpInput={...a.mpInput,moveX:0,moveY:0,fire:false,ads:false,sprint:false,dashPending:false,reload:false};persist(entry);}return true;}
 function abandon(entry,id){if(entry.abandoned.has(id))return;entry.abandoned.add(id);const a=entry.match.participants.find(a=>a.userId===id);if(a){a.mpInput={...a.mpInput,moveX:0,moveY:0,fire:false,ads:false,sprint:false,dashPending:false,reload:false};a.abandoned=true;a.objectiveEligible=false;a.disconnected=true;a.dead=true;a.deathAt=entry.e.dev.now();a.respawnAt=Infinity;a.vx=a.vy=0;}onChange({type:'abandoned',userIds:[id],matchId:entry.id});}
 function leave(user){const id=userInfo(user).id,entry=activeFor(id);if(!entry)return snapshot(id);if(['ended','cancelled'].includes(entry.match.status)){membership.delete(id);return snapshot(id);}abandon(entry,id);entry.disconnected.set(id,now()-graceMs);persist(entry);return snapshot(id);}
 function snapshot(user){
  const id=typeof user==='string'?user:user?.id,entry=activeFor(id);if(!entry){const q=[...queues.values()].find(q=>q.members.some(m=>m.id===id));return {replayWarning:db.prepare('SELECT warning FROM replay_preferences WHERE user_id=?').get(id)?.warning||null,state:q?'queued':'lobby',serverNow:now(),mapPools:clone(mapPools),ltms:activeLimited(),background:backgroundState(id),reservations:reservations(id),queue:q?{mode:q.policy.id,since:q.createdAt,players:[...queues.values()].filter(other=>other.policy.id===q.policy.id).reduce((n,q)=>n+q.members.length,0),needed:q.policy.size,reason:q.waitReason||null,mapVote:ballotSnapshot(q,id)}:null};}
  const m=entry.match,frame=entry.e.mp.hooks.snapshot(m,id);return {replayWarning:db.prepare('SELECT warning FROM replay_preferences WHERE user_id=?').get(id)?.warning||null,state:m.status,serverNow:now(),mapPools:clone(mapPools),ltms:activeLimited(),background:backgroundState(id),reservations:reservations(id),match:{id:entry.id,matchId:entry.id,mode:m.mode,networkMode:entry.policy.id,sessionType:m.sessionType,eligible:m.eligible,xpEligible:m.xpEligible??m.eligible,ltmDefinition:clone(m.context?.ltmDefinition||null),modeRulesRevision:m.modeRulesRevision||null,practice:!!m.practice,status:m.status,mapId:m.mapId,mapVersion:m.mapVersion,mapSelection:clone(entry.mapSelection||null),score:m.score.slice(),limit:m.limit,durationMs:m.durationMs,startedAt:m.startedAt,endedAt:m.endedAt,winner:m.winner,remainingMs:Math.max(0,m.durationMs-(frame.now-m.startedAt)),countdownUntil:m.countdownUntil??null,countdownStartedAt:m.countdownStartedAt??null,readyCount:entry.ready.size,humanCount:m.participants.filter(a=>a.isPlayer).length,prepareUntil:entry.prepareUntil,prepareDeadline:entry.prepareDeadline,aiRevision:m.aiRevision,rulesetRevision:m.rulesetRevision,balanceVersion:m.balanceVersion,balanceFingerprint:m.balanceFingerprint,appVersion:m.appVersion},...frame,killfeed:entry.e.mp.hooks.killfeed(),localActorId:m.participants.find(a=>a.userId===id)?.id??null,abandoned:entry.abandoned.has(id),result:entry.result?clone(entry.result):null};
 }
 function step(at=now()){
  if(closed)return;tryQueues();for(const entry of matches.values()){
   const m=entry.match;if(['ended','cancelled'].includes(m.status)){if(entry.result&&at-(entry.lastResultAttempt||0)>=1000){entry.lastResultAttempt=at;onResult(entry.result,entry);}if(at-(entry.persistedAt||entry.createdAt)>TERMINAL_KEEP_MS&&!db.prepare('SELECT 1 FROM mp_results WHERE match_id=? AND applied_at=0').get(entry.id)){if(m.status==='ended')retireSettledCheckpoint(entry.id,at,entry);for(const a of m.participants.filter(a=>a.isPlayer))if(membership.get(a.userId)===entry.id)membership.delete(a.userId);matches.delete(entry.id);}continue;}
   for(const [id,disconnectedAt] of entry.disconnected)if(at-disconnectedAt>=graceMs&&!entry.abandoned.has(id))abandon(entry,id);
   for(const a of m.participants.filter(a=>a.isPlayer)){if(entry.abandoned.has(a.userId)||at-(a.mpInput?.receivedAt||0)>500)a.mpInput={...a.mpInput,moveX:0,moveY:0,fire:false,ads:false,sprint:false,reload:false,dashPending:false};}
   if(m.status==='preparing'){
    const humans=m.participants.filter(a=>a.isPlayer);if(at>=entry.prepareUntil&&humans.every(a=>entry.ready.has(a.userId))){const due=Math.max(0,Math.floor((at-(entry.e.mp.epoch+entry.e.dev.now()))/STEP_MS));for(let n=0;n<due;n++){entry.e.step(1/30);Replays.sample(db,entry.e,m);}entry.e.mp.hooks.countdown(m);persist(entry);}
    else if(at>=entry.prepareDeadline){m.status='cancelled';Replays.discard(db,entry.e);m.endReason='preparation-timeout';m.endedAt=entry.e.dev.now();persist(entry);onChange({type:'match-cancelled',matchId:entry.id,userIds:humans.map(a=>a.userId),reason:'Required match preparation did not finish'});}continue;
   }
   const due=Math.max(0,Math.floor((at-(entry.e.mp.epoch+entry.e.dev.now())+.001)/STEP_MS));for(let n=0;n<Math.min(maxSteps,due)&&['countdown','active'].includes(m.status);n++){entry.e.step(1/30);Replays.sample(db,entry.e,m);}
   if(m.status==='ended')finish(entry);else if(at-(entry.persistedAt||0)>=1000)persist(entry);
  }
 }
 function startTournament(context,save){
  if(!context?.gameId||!context.tournamentId||!Array.isArray(context.teams)||context.teams.length!==2)throw fail('Invalid scheduled tournament context',400);
  if(matches.has(context.gameId))return matches.get(context.gameId);
  const peopleSpecs=context.teams.flatMap(team=>team.participants).filter(p=>p.kind==='user').map(p=>userInfo(p.id));for(const person of peopleSpecs){const prior=activeFor(person);if(prior&&['ended','cancelled'].includes(prior.match.status))membership.delete(person.id);else if(prior)throw fail('A tournament participant is already in a match');}
  const bots=context.teams.flatMap(team=>team.participants).filter(p=>p.kind!=='user').map(p=>({sourceBotId:p.id,name:p.name}));return allocate(policy('tournament'),peopleSpecs,{context:{...context,botOwnerId:context.userId||owner},explicitBots:bots});
 }
 function getMatch(id){return matches.get(id)||null;}
 function reservations(userId){return [...matches.values()].filter(entry=>entry.ownerId===userId&&!['ended','cancelled'].includes(entry.match.status)).map(entry=>({id:entry.id,status:'ACTIVE',scheduling:{reservations:entry.match.participants.filter(a=>!a.isPlayer).map(a=>a.sourceBotId)}}));}
 function cancelTournament(tournamentId){let count=0;for(const entry of matches.values())if(entry.context?.tournamentId===tournamentId&&!['ended','cancelled'].includes(entry.match.status)){entry.match.status='cancelled';Replays.discard(db,entry.e);entry.match.endReason='tournament-cancelled';persist(entry);onChange({type:'match-cancelled',matchId:entry.id,userIds:entry.match.participants.filter(a=>a.isPlayer).map(a=>a.userId),reason:'The tournament was cancelled'});count++;}return count;}
 function close(){if(closed)return;closed=true;if(timer)clearInterval(timer);for(const entry of matches.values())persist(entry);connections.clear();}
 if(!manual){timer=setInterval(()=>{try{step();}catch(error){console.error('Multiplayer runtime:',error.message);}},1000/30);timer.unref();}
 return {queue,cancelQueue,mapVote,custom,input,ready,connect,disconnect,leave,snapshot,step,close,startTournament,getMatch,reservations,cancelTournament,activeFor,background,backgroundState,rosterOwnerId:()=>poolOwner(),activeMatches:()=>[...matches.values()],queues:()=>[...queues.values()]};
}
module.exports={createRuntime,validateInput,policy,FORMAT};
