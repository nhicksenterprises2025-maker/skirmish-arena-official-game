'use strict';
const Circuit=require('./tournaments.cjs'),{engine}=require('../dev/simulate.cjs');
const {refreshWorldSeason}=require('./world.cjs');
const MapPools=require('./map-pools.cjs');
const Replays=require('./replays.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v8=require('node:v8'),zlib=require('node:zlib');
const runtimes=new WeakMap();
const multiplayerRuntimes=new WeakMap();
function configureMultiplayer(db,runtime){if(runtime)multiplayerRuntimes.set(db,runtime);else multiplayerRuntimes.delete(db);}
const CHECKPOINT_FORMAT='headless-reference-state-v1';
const gamePath=path.join(__dirname,'../game.js');
const CHECKPOINT_BINDING_VERSION=1,MAX_CHECKPOINT_BYTES=16*1024*1024;
const dependencyFiles=['dev/simulate.cjs','tactical-instinct.js','progression.js','match-modes.js','team-presentation.js','distance-units.js','map-data.js','mode-rules.js','weapon-mastery.js'];
function dependencyFingerprints(){return Object.fromEntries(dependencyFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));}
const boundDependencies=dependencyFingerprints();
// Reviewed additions: Audit 9's unused profile projection/accuracy validation,
// and human multiplayer's Ranked Deathmatch registration. The existing TDM,
// tournament and casual combat/reward formulas are unchanged. Mode expansion
// adds inert helpers for old-source TDM matches; exact replay fixtures verify this. Both the loaded
// and current on-disk helpers must equal these exact approved fingerprints.
const dependencyCompatibility={
 'dev/simulate.cjs':{before:['56c2738a6db2970364e7b1a1f41b491eb8a3ad6e35bb110254f888cee2319680','6e3af4e07eee33c18b3d9763f42a46d04bf2df843ad821c004466b8455e3f0ff','c2097272121647ebf0cd464819a2a79c147de0246f8721ced712fa8c178612f7','d55a11f658d80ecc941d9fc75864b9764e69b7b8f68fcedf5f792f743ca05071','eb3b46b5a8bedad3efc0968bc6834b55cef26ad591464155450fbc8ca05dcc90','5fcde9b8df0266498890ff2ba63df90ffe083f5e43b001d2f92b87f61eb016e1'],after:'84d8113da7c890673174d80fc4810e534bf5f5def40246238a18d4187bc4b434'},
 'progression.js':{before:['cc823b8fe9898a26e8aa33bb0631ebd351d19bdbbc69ec5f0554cf3ccab2d7b0','820ff2e3e866d0631a40434b0c0f36ee6b34302490578e55d77dbf03064b2a10','860279abd7620b5a13c5f0458643338a55e7d4541d0b3507c2bc3634579bd5f0','705b0120ce4fa2a6bdca3b4362a94c8d5bbdaaa3693128a6551be3664667fde7','840312cd6a0a9255bc3e0c9bad297ecfd44e2777cb4698b22d4e51169c511173'],after:'6bea410ac7d631895b60cefca93d5f5c2b30ff6efdf6550af331ef989c87851b'},
 'match-modes.js':{before:['9c7aacecabb209d21153c23e51f31508d5d8114de1e35d5db656346af122a20a','fea41f58b5bd66b95cbbaec92e1e4e221efac093fe327168f675d584307d8f65','b67906af309fdb83b69925d98d7ed8a2790bd7475bba41e85b8815454e063bd5'],after:'2449ff8c9e07fbf9f160014297549485e912433d1209104b5cef6bf075c5ff2c'}
};
function checkpointDependencies(checkpoint,gameId,source){
 const current=dependencyFingerprints();let converted=false;
 for(const file of dependencyFiles){
  const saved=checkpoint.dependencies?.[file],bound=boundDependencies[file];
  if(saved===bound&&saved===current[file])continue;
  if(file==='weapon-mastery.js'&&saved===undefined&&!/\bSARWeaponMastery\b/.test(source)&&current[file]===bound){converted=true;continue;}
  if(file==='distance-units.js'&&saved===undefined&&!/\bSARUnits\b/.test(source)&&current[file]===bound){converted=true;continue;}
  if(file==='mode-rules.js'&&saved===undefined&&!/\b(?:MODE_RULES|SARModeRules)\b/.test(source)&&current[file]===bound){converted=true;continue;}
  if(file==='map-data.js'&&saved===undefined&&!/\bSARMaps\b/.test(source)&&current[file]===bound){converted=true;continue;}
  if(file==='distance-units.js'&&checkpoint.dependencies?.['map-data.js']===undefined&&!/\bSARMaps\b/.test(source)&&saved==='0e850c0fe3ae5dd16f0cf510870875f320f8026c0b4ca0ac443dfa1c8e91e375'&&bound==='23ed0490f5238e8f42458028eddb9f7cb6c8eb314c40df44ddf7da20feed2082'&&current[file]===bound){converted=true;continue;}
  const compatibility=dependencyCompatibility[file];
  if(!compatibility||!(Array.isArray(compatibility.before)?compatibility.before:[compatibility.before]).includes(saved)||bound!==compatibility.after||current[file]!==compatibility.after)throw new Error('Tournament checkpoint engine dependencies changed for '+gameId+'; saved game retained');
  converted=true;
 }
 return converted?{...boundDependencies}:checkpoint.dependencies;
}
function aggregateSeries(t,s){return Circuit.isAggregateSeries(s,t);}
function playableSeries(t,s){return Circuit.canPlaySeries(s,t);}
function scheduled(t){return !!t.schedulePolicy;}
function gameContext(db,t,s,hasPlayer,userId){
 const gameId=s.id+':game'+(s.games.length+1),record=t.scheduling?.games?.[gameId],teams=record?.teams||s.teamIds.map(id=>t.teams.find(team=>team.id===id));
 return {...MapPools.tournamentSelection(db,t.id,gameId),tournamentId:t.id,tournamentKind:t.kind,seriesId:s.id,teamIds:s.teamIds,teams,gameId,userId,hasPlayer,...(record?{schedule:publicGame(record)}:{}),...(aggregateSeries(t,s)?{rulesetId:s.rulesetId||t.rulesetId,round:s.round,requiredGames:s.requiredGames,completedGames:s.completedGames,aggregateKills:s.aggregateKills.slice()}: {})};
}
function publicGame(record){return Object.fromEntries(['gameId','seriesId','round','gameNumber','checkInOpenAt','checkInCloseAt','rosterLockAt','countdownAt','matchStartAt','latestEndAt','rostersLockedAt','readyAt','startedAt','finalizedAt','error','replacements'].filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));}
const failure=(message,status=409)=>Object.assign(new Error(message),{status});
function humanGame(db,userId,tournamentId,gameId,now){
 const t=Circuit.advanceScheduled(db,userId,tournamentId,now),record=t.scheduling?.games?.[gameId];
 if(t.status!=='ACTIVE'||!record||record.finalizedAt||record.error)throw failure(record?.error||'The scheduled game is not available');
 if(!record.teams?.some(team=>team.participants.some(p=>p.id===userId&&p.kind==='user')))throw failure('You are not an active participant in this scheduled game',403);
 return {t,record};
}
function authorizedLease(record,userId,options,now,{allowExpired=false}={}){
 const lease=record.lease;if(!lease||lease.owner!=='client:'+userId||lease.clientId!==options.clientId||lease.token!==options.leaseToken||(!allowExpired&&lease.expiresAt<=now))throw failure('This tournament game belongs to another or expired client session');return lease;
}
function ready(db,userId,tournamentId,options,now=Date.now()){
 const multiplayer=multiplayerRuntimes.get(db);if(multiplayer){const {t,record}=humanGame(db,userId,tournamentId,options.gameId,now),entry=multiplayer.getMatch(options.gameId);if(!entry||entry.context?.tournamentId!==tournamentId)throw failure('The authoritative tournament game is not prepared');multiplayer.ready(userId);if(record.readyAt==null&&entry.match.participants.filter(a=>a.isPlayer).every(a=>entry.ready.has(a.userId)))Circuit.markScheduledPrepared(db,t.creatorId,tournamentId,options.gameId,now);return {context:{...gameContext(db,t,t.series.find(s=>s.id===record.seriesId),true,t.creatorId),multiplayer:true},state:multiplayer.snapshot(userId)};}
 const {record}=humanGame(db,userId,tournamentId,options.gameId,now);authorizedLease(record,userId,options,now);
 if(!(options.resume===true&&record.readyAt!=null))Circuit.markScheduledPrepared(db,userId,tournamentId,options.gameId,now);return playContext(db,userId,tournamentId,now,options);
}
function heartbeat(db,userId,tournamentId,options,now=Date.now()){
 const multiplayer=multiplayerRuntimes.get(db);if(multiplayer){const {t,record}=humanGame(db,userId,tournamentId,options.gameId,now),entry=multiplayer.getMatch(options.gameId);if(!entry||entry.context?.tournamentId!==tournamentId)throw failure('The authoritative tournament game is unavailable');advanceMultiplayerGame(db,multiplayer,t,record,entry,now);return {game:publicGame(Circuit.getTournament(db,t.creatorId,tournamentId).scheduling.games[options.gameId]),status:t.status,state:multiplayer.snapshot(userId)};}
 const {record}=humanGame(db,userId,tournamentId,options.gameId,now);authorizedLease(record,userId,options,now);
 Circuit.renewScheduledGame(db,userId,tournamentId,options.gameId,options.leaseToken,now);
 if(record.readyAt!=null&&record.startedAt==null&&now>=record.matchStartAt)Circuit.markScheduledStarted(db,userId,tournamentId,options.gameId,options.leaseToken,now);
 const t=Circuit.getTournament(db,userId,tournamentId);return {game:publicGame(t.scheduling.games[options.gameId]),status:t.status};
}
function validateClientResult(db,userId,tournamentId,seriesId,result,options,now=Date.now()){
 if(multiplayerRuntimes.has(db))throw failure('Tournament damage, results and advancement are resolved by the multiplayer server',403);
 const t=Circuit.getTournament(db,userId,tournamentId);if(!scheduled(t)){const context=playContext(db,userId,tournamentId,now);if(seriesId!==context.seriesId||result?.id!==context.gameId)throw failure('This result belongs to a different tournament game');return;}
 const record=t.scheduling?.games?.[result?.id];if(!record||record.seriesId!==seriesId||!record.teams?.some(team=>team.participants.some(p=>p.id===userId&&p.kind==='user')))throw failure('This result belongs to a different tournament game');
 authorizedLease(record,userId,options,now,{allowExpired:true});if(record.startedAt==null||now<record.matchStartAt)throw failure('The scheduled game has not started');
}

function runtimeMetadata(db,tournamentId){return JSON.parse(db.prepare('SELECT metadata_json FROM tournaments WHERE id=?').get(tournamentId)?.metadata_json||'{}');}
function putCheckpoint(db,tournamentId,gameId,checkpoint){
 const metadata=runtimeMetadata(db,tournamentId);metadata.runtimeGames||={};if(checkpoint)metadata.runtimeGames[gameId]=checkpoint;else delete metadata.runtimeGames[gameId];
 if(!Object.keys(metadata.runtimeGames).length)delete metadata.runtimeGames;
 db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(metadata),tournamentId);
}
function pruneAcknowledgedCheckpoints(db,tournamentId){for(const key of Object.keys(runtimeMetadata(db,tournamentId).runtimeGames||{}))if(db.prepare('SELECT 1 FROM tournament_matches WHERE tournament_id=? AND id=?').get(tournamentId,key))putCheckpoint(db,tournamentId,key,null);}
// These hooks exist only in the headless authoritative engine. V8 preserves
// actor/projectile references, Maps, Sets and Infinity; JSON would corrupt them.
function instrument(source){
 if(!/\}\)\(\);\s*$/.test(source))throw new Error('Tournament engine checkpoint binding is unavailable');
 return source.replace(/\}\)\(\);\s*$/,`window.__TOURNAMENT_CHECKPOINT={capture(){return {state,SAVE,meta,simulationTime,nextActorId,nextShotId,botMetaCache,diagnostics,damageNumbers,routeCache:ROUTE_CACHE,navigation:{ready:NAV_READY,walkable:NAV_WALKABLE,edges:NAV_EDGES,cover:COVER_POINTS}};},restore(v){const savedMatch=v.state.matches.find(m=>m?.context?.gameId);if(typeof activateMap==='function')activateMap(savedMatch?.mapId||'brightfield-blocks',savedMatch?.mapVersion??null);state=v.state;SAVE=v.SAVE;meta=v.meta;simulationTime=v.simulationTime;nextActorId=v.nextActorId;nextShotId=v.nextShotId;botMetaCache=v.botMetaCache;Object.assign(diagnostics,v.diagnostics);damageNumbers.splice(0,damageNumbers.length,...v.damageNumbers);ROUTE_CACHE.clear();for(const [key,value] of v.routeCache)ROUTE_CACHE.set(key,value);NAV_READY=v.navigation.ready;NAV_WALKABLE=v.navigation.walkable;NAV_EDGES=v.navigation.edges;COVER_POINTS.splice(0,COVER_POINTS.length,...v.navigation.cover);}};})();`);
}
function randomFor(e,seed){let current=seed>>>0;e.context.Math.random=()=>{current=(Math.imul(current,1664525)+1013904223)>>>0;return current/4294967296;};return ()=>current;}
function saveCheckpoint(db,e){
 Replays.persistCapture(db,e);
 const payload={source:e.runtimeSource,clockEpoch:e.runtimeClockEpoch,rng:e.runtimeRng(),steps:e.runtimeSteps,snapshot:e.context.__TOURNAMENT_CHECKPOINT.capture()};
 const serialized=v8.serialize(payload),compressed=zlib.deflateSync(serialized,{level:1});
 if(serialized.length>MAX_CHECKPOINT_BYTES)throw new Error('Tournament checkpoint exceeds the supported size for '+e.tournamentMatch.context.gameId);
 putCheckpoint(db,e.tournamentMatch.context.tournamentId,e.tournamentMatch.context.gameId,{format:CHECKPOINT_FORMAT,bindingVersion:CHECKPOINT_BINDING_VERSION,dependencies:e.runtimeDependencies,sourceHash:e.runtimeSourceHash,bytes:serialized.length,data:compressed.toString('base64')});
}
function makeGame(save,context,now,checkpoint){
 let restored=null,dependencies=boundDependencies;if(checkpoint){
  if(checkpoint.format!==CHECKPOINT_FORMAT||checkpoint.bindingVersion!==CHECKPOINT_BINDING_VERSION||!Number.isInteger(checkpoint.bytes)||checkpoint.bytes<=0||checkpoint.bytes>MAX_CHECKPOINT_BYTES||typeof checkpoint.data!=='string'||checkpoint.data.length>MAX_CHECKPOINT_BYTES*1.5)throw new Error('Unsupported tournament checkpoint for '+context.gameId);
  const serialized=zlib.inflateSync(Buffer.from(checkpoint.data,'base64'),{maxOutputLength:MAX_CHECKPOINT_BYTES});if(serialized.length!==checkpoint.bytes)throw new Error('Tournament checkpoint size does not match '+context.gameId);
  restored=v8.deserialize(serialized);const savedMatch=restored.snapshot?.state?.matches?.find(m=>m?.context?.gameId===context.gameId);
  if(typeof restored.source!=='string'||Buffer.byteLength(restored.source)>2*1024*1024||!Number.isFinite(restored.clockEpoch)||!Number.isInteger(restored.steps)||restored.steps<0||!Number.isInteger(restored.rng)||restored.rng<0||restored.rng>0xffffffff||crypto.createHash('sha256').update(restored.source).digest('hex')!==checkpoint.sourceHash||savedMatch?.context.seriesId!==context.seriesId||savedMatch.context.tournamentId!==context.tournamentId||savedMatch.context.teamIds?.some((id,i)=>id!==context.teamIds[i]))throw new Error('Tournament checkpoint identity does not match '+context.gameId);
  dependencies=checkpointDependencies(checkpoint,context.gameId,restored.source);
 }
 const source=restored?.source||fs.readFileSync(gamePath,'utf8'),clockEpoch=restored?.clockEpoch??now-1000;let e;
 e=engine({'sar-persistent-save':JSON.stringify(restored?.snapshot.SAVE||save)},instrument(source),{wallNow:()=>clockEpoch+(e?e.dev.now():1000)});
 e.runtimeSource=source;e.runtimeSourceHash=crypto.createHash('sha256').update(source).digest('hex');e.runtimeDependencies=dependencies;e.runtimeClockEpoch=clockEpoch;e.runtimeSteps=restored?.steps||0;e.runtimeResumed=!!restored;
 e.runtimeRng=randomFor(e,restored?.rng??crypto.createHash('sha256').update(context.gameId).digest().readUInt32LE());
 if(restored){e.context.__TOURNAMENT_CHECKPOINT.restore(restored.snapshot);e.ui.advance(e.dev.now()-1000);e.tournamentMatch=e.dev.inspect().state.matches.find(m=>m?.context?.gameId===context.gameId);}
 else{const state=e.dev.inspect().state;state.matches.forEach(match=>{if(match)match.status='ended';});e.tournamentMatch=e.context.SAR.startTournamentGame(context);state.actors=e.tournamentMatch.participants;}
 return e;
}
function fillBots(db,userId,t,now){
 return Circuit.completeTeams(db,userId,t.id,now);
}
function playContext(db,userId,tournamentId,now=Date.now(),options={}){
 let t=Circuit.getTournament(db,userId,tournamentId);if(scheduled(t))t=Circuit.advanceScheduled(db,userId,tournamentId,now);
 if(t.status!=='ACTIVE')throw failure('Tournament is not active');
 const team=t.teams.find(team=>team.participants.some(p=>p.id===userId)),s=t.series.find(s=>playableSeries(t,s)&&s.teamIds.includes(team?.id));if(!s)throw failure(t.series.some(s=>s.teamIds.includes(team?.id)&&s.status==='awaiting-tie-policy')?'Your series is awaiting an aggregate tie policy':'Your next series is not ready');
 const context=gameContext(db,t,s,true,t.creatorId),multiplayer=multiplayerRuntimes.get(db);if(!scheduled(t)){if(multiplayer){multiplayer.startTournament(context);return {...context,multiplayer:true};}return context;}
 if(options.gameId&&options.gameId!==context.gameId)throw failure('Your scheduled game has changed');
 const record=t.scheduling?.games?.[context.gameId];if(!record?.rostersLockedAt||record.error)throw failure(record?.error||'The scheduled roster is not locked yet');
 if(!record.teams?.some(team=>team.participants.some(p=>p.id===userId&&p.kind==='user')))throw failure('Your tournament slot was replaced at check-in close',403);
 if(!record.checkIns?.[userId])throw failure('Check in before the deadline to play this game');
 if(multiplayer){let entry=multiplayer.getMatch(context.gameId);if(!entry){if(now>=record.countdownAt)throw failure('The scheduled game requires its saved authoritative checkpoint');const clientId='server-multiplayer-'+crypto.createHash('sha256').update(context.gameId).digest('hex').slice(0,24);Circuit.claimScheduledGame(db,t.creatorId,tournamentId,context.gameId,{owner:'client:'+t.creatorId,clientId,ttlMs:60000},now);entry=multiplayer.startTournament(context);}return {...context,multiplayer:true,state:multiplayer.snapshot(userId)};}
 if(now>=record.countdownAt&&(!options.resume||!record.lease||record.lease.owner!=='client:'+userId||(record.lease.expiresAt>now&&record.lease.clientId!==options.clientId)))throw failure('This scheduled game requires its saved in-progress checkpoint');
 const claimed=Circuit.claimScheduledGame(db,userId,tournamentId,context.gameId,{owner:'client:'+userId,clientId:options.clientId,resume:options.resume===true},now);
 const fresh=Circuit.getTournament(db,userId,tournamentId).scheduling.games[context.gameId];return {...context,schedule:publicGame(fresh),leaseToken:fresh.lease?.token||claimed.lease?.token||claimed.token};
}

function advanceMultiplayerGame(db,multiplayer,t,record,entry,now){
 if(!record||record.finalizedAt||record.error||entry.match.status==='cancelled')return;
 if(record.readyAt==null&&entry.match.participants.filter(a=>a.isPlayer).every(a=>entry.ready.has(a.userId)))Circuit.markScheduledPrepared(db,t.creatorId,t.id,record.gameId,now);
 const fresh=Circuit.getTournament(db,t.creatorId,t.id).scheduling.games[record.gameId];
 if(fresh.lease&&fresh.lease.expiresAt<=now+10000)Circuit.claimScheduledGame(db,t.creatorId,t.id,record.gameId,{owner:'client:'+t.creatorId,clientId:'server-multiplayer-'+crypto.createHash('sha256').update(record.gameId).digest('hex').slice(0,24),ttlMs:60000,resume:true},now);
 const current=Circuit.getTournament(db,t.creatorId,t.id).scheduling.games[record.gameId];
 if(current.readyAt!=null&&current.startedAt==null&&now>=current.matchStartAt)Circuit.markScheduledStarted(db,t.creatorId,t.id,record.gameId,current.lease.token,now);
}

function advanceScheduledGames(db,rt,userId,event,save,now,budget){
 let t=Circuit.advanceScheduled(db,userId,event.id,now);if(t.status!=='ACTIVE'){for(const [key,e] of rt.games)if(e.tournamentMatch.context.tournamentId===t.id){e.tournamentMatch.status='cancelled';Replays.discard(db,e);rt.games.delete(key);}return;}
 // Every ready pairing uses the same absolute clock. Four quarterfinals may
 // prepare/run concurrently; an early result waits for its next fixed window.
 for(const s of t.series.filter(s=>playableSeries(t,s))){
  const key=s.id+':game'+(s.games.length+1),record=t.scheduling.games[key];
  const multiplayer=multiplayerRuntimes.get(db),humanEntry=multiplayer?.getMatch(key);if(humanEntry){try{advanceMultiplayerGame(db,multiplayer,t,record,humanEntry,now);}catch(error){Circuit.markScheduledError(db,userId,t.id,key,'MULTIPLAYER_RUNTIME_FAILED: '+String(error.message).slice(0,180),now);}continue;}
  if(!record||!record.rostersLockedAt||record.error||record.finalizedAt||record.teams?.some(team=>team.participants.some(p=>p.kind==='user')))continue;
  let e=rt.games.get(key);
  try{
   Circuit.claimScheduledGame(db,userId,t.id,key,{owner:'server'},now);
   let fresh=Circuit.getTournament(db,userId,t.id).scheduling.games[key];
   if(!e){
    e=makeGame(save,gameContext(db,t,s,false),now,runtimeMetadata(db,t.id).runtimeGames?.[key]);
    rt.games.set(key,e);try{Replays.begin(db,e,e.tournamentMatch,userId,{resumed:e.runtimeResumed,date:record.checkInOpenAt||now});}catch(error){console.warn('Replay unavailable: '+error.message);}saveCheckpoint(db,e);
   }
   if(fresh.readyAt==null){Circuit.markScheduledPrepared(db,userId,t.id,key,now);fresh=Circuit.getTournament(db,userId,t.id).scheduling.games[key];}
   if(now>=fresh.matchStartAt&&fresh.startedAt==null)Circuit.markScheduledStarted(db,userId,t.id,key,fresh.lease.token,now);
   // The persisted engine clock is also the elapsed-time cursor. Repeated
   // ticks at the same timestamp cannot advance a scheduled match twice.
   const due=Math.max(0,Math.floor((now-(e.runtimeClockEpoch+e.dev.now())+0.0001)*30/1000));
   for(let n=0;n<Math.min(budget,due)&&['countdown','active'].includes(e.tournamentMatch.status);n++){e.step(1/30);e.runtimeSteps++;Replays.sample(db,e,e.tournamentMatch);}
   saveCheckpoint(db,e);
   if(e.tournamentMatch.tournamentResult){Replays.finish(db,e,e.tournamentMatch,e.tournamentMatch.tournamentResult);Circuit.recordGame(db,userId,t.id,s.id,e.tournamentMatch.tournamentResult,now,{masteryAuthority:'server-simulation'});putCheckpoint(db,t.id,key,null);rt.games.delete(key);}
  }catch(error){
   // Retain the exact checkpoint and identify this game's failing stage. A
   // broken pairing cannot silently allocate a fresh match or block the others.
   Circuit.markScheduledError(db,userId,t.id,key,'GAME_RUNTIME_FAILED: '+String(error.message).slice(0,180),now);
   console.error('Scheduled tournament '+key+': '+error.message);
  }
 }
}
function advance(db,{now=Date.now(),budget=90}={}){
 let rt=runtimes.get(db);if(!rt){rt={games:new Map(),worlds:new Map(),stopped:false};runtimes.set(db,rt);}if(rt.stopped)return;
 for(const [key,e] of rt.games){const row=db.prepare('SELECT deleted_at,status FROM tournaments WHERE id=?').get(e.tournamentMatch.context.tournamentId);if(!row||row.deleted_at||['COMPLETED','CANCELLED'].includes(row.status)||db.prepare('SELECT 1 FROM tournament_matches WHERE id=?').get(key)){e.tournamentMatch.status='cancelled';Replays.discard(db,e);rt.games.delete(key);if(row&&row.status!=='CANCELLED')putCheckpoint(db,e.tournamentMatch.context.tournamentId,key,null);}}
 for(const row of db.prepare('SELECT user_id FROM worlds').all()){
  let cached=rt.worlds.get(row.user_id);if(!cached||now-cached.at>=30000||now>=cached.save.seasons.current.endAt){const world=refreshWorldSeason(db,row.user_id,now);if(!world)continue;cached={at:now,save:world.save};rt.worlds.set(row.user_id,cached);Circuit.scheduleOfficial(db,row.user_id,cached.save.seasons.current,now);}
  const save=cached.save;
  for(const candidate of db.prepare("SELECT id FROM tournaments WHERE user_id=? AND kind IN ('official','custom') AND starts_at>? AND starts_at<=? AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED') ORDER BY starts_at,id").all(row.user_id,now,now+7*60000))Circuit.prepareReservations(db,row.user_id,candidate.id,now);
  for(const rowT of db.prepare("SELECT id FROM tournaments WHERE user_id=? AND kind IN ('official','custom') AND starts_at<=? AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED') ORDER BY starts_at").all(row.user_id,now)){
   let t=Circuit.getTournament(db,row.user_id,rowT.id);
   pruneAcknowledgedCheckpoints(db,t.id);
   if(t.kind==='custom'&&t.status!=='ACTIVE')t=Circuit.advanceCustom(db,row.user_id,t.id,now);
   if(scheduled(t)){advanceScheduledGames(db,rt,row.user_id,t,save,now,budget);continue;}
   if(t.status!=='ACTIVE'){t=fillBots(db,row.user_id,t,now);if(t.teams.length!==8||t.teams.some(team=>team.participants.length!==5))continue;try{t=Circuit.startTournament(db,row.user_id,t.id,now);}catch{continue;}}
   const s=t.series.find(s=>playableSeries(t,s)&&!s.teamIds.some(id=>t.teams.find(team=>team.id===id).participants.some(p=>p.kind==='user')));if(!s)continue;
   const key=s.id+':game'+(s.games.length+1);let e=rt.games.get(key);
   if(!e){e=makeGame(save,gameContext(db,t,s,false),now,runtimeMetadata(db,t.id).runtimeGames?.[key]);rt.games.set(key,e);try{Replays.begin(db,e,e.tournamentMatch,row.user_id,{resumed:e.runtimeResumed,date:now});}catch(error){console.warn('Replay unavailable: '+error.message);}saveCheckpoint(db,e);}
   // Preparation is authoritative match state too. Advance its existing
   // countdown without allowing combat until the engine enters active play.
   for(let n=0;n<budget&&['countdown','active'].includes(e.tournamentMatch.status);n++){e.step(1/30);e.runtimeSteps++;Replays.sample(db,e,e.tournamentMatch);}
   // Keep the resolved checkpoint until the one transactional finalizer has
   // acknowledged it. A restart after a failed delivery resends the same game.
   saveCheckpoint(db,e);
   if(e.tournamentMatch.tournamentResult){Replays.finish(db,e,e.tournamentMatch,e.tournamentMatch.tournamentResult);Circuit.recordGame(db,row.user_id,t.id,s.id,e.tournamentMatch.tournamentResult,now,{masteryAuthority:'server-simulation'});putCheckpoint(db,t.id,key,null);rt.games.delete(key);}
  }
 }
}
function start(db){
 let rt=runtimes.get(db);if(rt?.timer)return rt.stop;if(!rt){rt={games:new Map(),worlds:new Map(),stopped:false};runtimes.set(db,rt);}rt.stopped=false;
 let stopped=false,running=false;const tick=()=>{if(stopped||running||!db.isOpen)return;running=true;try{advance(db);}catch(e){console.error('Tournament progression:',e.message);}finally{running=false;}};
 const timer=setInterval(tick,250);timer.unref();rt.timer=timer;rt.stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);rt.timer=null;rt.stop=null;rt.stopped=true;rt.games.clear();};setImmediate(tick);return rt.stop;
}
function cancel(db,tournamentId){const rt=runtimes.get(db);let count=multiplayerRuntimes.get(db)?.cancelTournament(tournamentId)||0;if(rt)for(const [key,e] of rt.games)if(e.tournamentMatch.context.tournamentId===tournamentId){e.tournamentMatch.status='cancelled';Replays.discard(db,e);rt.games.delete(key);count++;}const metadata=runtimeMetadata(db,tournamentId);if(metadata.runtimeGames){delete metadata.runtimeGames;db.prepare('UPDATE tournaments SET metadata_json=? WHERE id=?').run(JSON.stringify(metadata),tournamentId);}return count;}
function activeGames(db){return [...(runtimes.get(db)?.games.values()||[])].map(e=>({tournamentId:e.tournamentMatch.context.tournamentId,gameId:e.tournamentMatch.context.gameId,status:e.tournamentMatch.status,score:e.tournamentMatch.score.slice(),elapsedMs:e.dev.now()-e.tournamentMatch.startedAt,steps:e.runtimeSteps,resumed:e.runtimeResumed,sourceHash:e.runtimeSourceHash})).concat((multiplayerRuntimes.get(db)?.activeMatches()||[]).filter(entry=>entry.context?.tournamentId&&!['ended','cancelled'].includes(entry.match.status)).map(entry=>({tournamentId:entry.context.tournamentId,gameId:entry.id,status:entry.match.status,score:entry.match.score.slice(),elapsedMs:entry.e.dev.now()-entry.match.startedAt,authoritative:true,sourceHash:entry.e.sourceHash})));}
function presentationGames(db,tournamentId){
 return [...(runtimes.get(db)?.games.values()||[])].filter(e=>{
  const m=e.tournamentMatch;return m.context.tournamentId===tournamentId&&['countdown','active'].includes(m.status)&&!db.prepare('SELECT 1 FROM tournament_matches WHERE tournament_id=? AND id=?').get(tournamentId,m.context.gameId);
 }).map(e=>{const m=e.tournamentMatch,now=e.dev.now();return {tournamentId,seriesId:m.context.seriesId,gameId:m.context.gameId,status:m.status,score:m.score.slice(),elapsedMs:m.status==='countdown'?0:Math.max(0,now-m.startedAt),countdownRemainingMs:m.status==='countdown'?Math.max(0,m.countdownUntil-now):0,stats:m.participants.map(a=>({participantId:a.participantId,...Object.fromEntries(['kills','deaths','assists','damage','shots','hits','headshots'].map(key=>[key,a.stats[key]]))}))};}).concat((multiplayerRuntimes.get(db)?.activeMatches()||[]).filter(entry=>entry.context?.tournamentId===tournamentId&&!['ended','cancelled'].includes(entry.match.status)).map(entry=>{const m=entry.match,now=entry.e.dev.now();return {tournamentId,seriesId:entry.context.seriesId,gameId:entry.id,status:m.status,score:m.score.slice(),elapsedMs:m.status==='active'?Math.max(0,now-m.startedAt):0,countdownRemainingMs:m.status==='countdown'?Math.max(0,m.countdownUntil-now):0,stats:m.participants.map(a=>({participantId:a.participantId,...Object.fromEntries(['kills','deaths','assists','damage','shots','hits','headshots'].map(key=>[key,a.stats[key]]))}))};}));
}
module.exports={configureMultiplayer,cancel,activeGames,presentationGames,advance,start,fillBots,playContext,ready,heartbeat,validateClientResult,publicGame};
