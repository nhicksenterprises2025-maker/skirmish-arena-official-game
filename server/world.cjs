'use strict';
const {engine}=require('../dev/simulate.cjs');
const {validateProgression,validateRankedProgression,validateRewardOwnership,validateTournamentProgression}=require('./progression.cjs');
const {upsertWorldTables,botId}=require('./db.cjs');
const {isDeepStrictEqual}=require('node:util');
const DistanceUnits=require('../distance-units.js');
const {statSync}=require('node:fs');
const weaponSource=require.resolve('../game.js');
const MAX_WORLD_BYTES=8*1024*1024;
const SEASON_MS=15*24*60*60*1000;
let trustedBalance=null,trustedWeaponStamp=null;
function balance(){const info=statSync(weaponSource),stamp=info.mtimeMs+':'+info.size;if(!trustedBalance||stamp!==trustedWeaponStamp){trustedBalance=JSON.stringify(engine().dev.balanceSnapshot());trustedWeaponStamp=stamp;}return trustedBalance;}
const fail=(status,message,code=status===409?'SAVE_REJECTED':undefined)=>Object.assign(new Error(message),{status,...(code?{code}:{})});
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=(rows,key)=>rows.reduce((n,r)=>n+(Number(r?.[key])||0),0);
const CAREER_COUNTS=['games','wins','losses','kills','deaths','assists','shots','hits','headshots'];
const CAREER_TOTALS=[...CAREER_COUNTS,'damage','taken','timeAlive'];
const META_COUNTS=['picks','kills','deaths','shots','hits','headshots','killDistanceN','engagementDistanceN','classifiedKills','soloKills','finisherKills'];
const META_TOTALS=[...META_COUNTS,'damage','killDistance','engagementDistance','equippedTime'];
const WEAPON_TOTALS=['k','d','picks','damage','shots','hits','headshots','equippedTime'];
function counters(row,keys,integers=[],required=true){
  if(!isRecord(row))throw fail(400,'A statistics record is missing');
  for(const key of keys){
    const value=row[key];if(value===undefined&&!required)continue;
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||(integers.includes(key)&&!Number.isInteger(value)))throw fail(400,'Invalid statistics counter: '+key);
  }
}
function monotonic(next,old,keys,label){
  for(const key of keys)if(Number(next?.[key]||0)+1e-6<Number(old?.[key]||0))throw fail(409,label+' moved backwards');
}
function reconcile(a,b,label){if(Math.abs(a-b)>Math.max(.0001,Math.abs(b)*1e-9))throw fail(409,label+' disagree');}
function validateCareer(career,weaponKey){
  counters(career,CAREER_TOTALS,CAREER_COUNTS);
  counters(career,['timePlayed'],[],false);
  if(career.wins+career.losses>career.games||career.hits>career.shots||career.headshots>career.kills)throw fail(400,'Career counters conflict');
  if(!isRecord(career[weaponKey]))throw fail(400,'Career weapon history is missing');
  for(const stats of Object.values(career[weaponKey])){
    counters(stats,WEAPON_TOTALS,['k','d','picks','shots','hits','headshots']);
    counters(stats,['games'],['games'],false);
    if(stats.hits>stats.shots||stats.headshots>stats.k)throw fail(400,'Career weapon counters conflict');
  }
}
function validateMeta(row,required=true,aliases=false){
  const keys=aliases?META_TOTALS.map(k=>k==='kills'?'k':k==='deaths'?'d':k):META_TOTALS;
  const ints=aliases?META_COUNTS.map(k=>k==='kills'?'k':k==='deaths'?'d':k):META_COUNTS;
  counters(row,keys,ints,required);
  const kills=row[aliases?'k':'kills']||0;
  if((row.hits||0)>(row.shots||0)||(row.headshots||0)>kills||(row.killDistanceN||0)>kills||(row.classifiedKills||0)>kills||(row.soloKills||0)+(row.finisherKills||0)>(row.classifiedKills||0)||(row.engagementDistanceN||0)>(row.shots||0))throw fail(400,'Weapon telemetry counters conflict');
}
function patchActorTotals(world,name,weapon,key){
  let total=0;for(const patch of [...world.patchArchives,world.patchState])total+=Number(patch.perBot?.[name]?.[weapon]?.[key]||0);return total;
}
function compareWeaponDeltas(world,old,name,nextCareer,oldCareer,weaponKey){
  const weapons=new Set([...Object.keys(oldCareer[weaponKey]||{}),...Object.keys(nextCareer[weaponKey]||{})]);
  for(const weapon of weapons){
    const next=nextCareer[weaponKey]?.[weapon],prior=oldCareer[weaponKey]?.[weapon]||{};if(!next)throw fail(409,'Career weapon history was removed');
    monotonic(next,prior,WEAPON_TOTALS.concat(['games']),'Career weapon totals');
    if(Number(next.games||0)-Number(prior.games||0)>nextCareer.games-oldCareer.games)throw fail(409,'Weapon game count exceeds completed career games');
    for(const key of WEAPON_TOTALS){
      const delta=Number(next[key]||0)-Number(prior[key]||0),measured=patchActorTotals(world,name,weapon,key)-patchActorTotals(old,name,weapon,key);
      reconcile(delta,measured,'Career and measured weapon deltas');
    }
  }
}
function seasonTotals(world,name,key,player=false){
  const seasons=player?world.playerSeasons:world.seasons;if(!seasons)return 0;
  return [seasons.current,...(seasons.history||[])].reduce((total,season)=>total+Number((player?season.stats:season.stats?.[name])?.[key]||0),0);
}
function compareSeasonDeltas(world,old,name,nextCareer,oldCareer,player=false){
  for(const key of CAREER_TOTALS)reconcile(Number(nextCareer[key]||0)-Number(oldCareer[key]||0),seasonTotals(world,name,key,player)-seasonTotals(old,name,key,player),'Career and season measurements');
}
function compareMatchHistory(next,old,nextCareer,oldCareer,limit){
  if(!Array.isArray(next)||!Array.isArray(old))throw fail(400,'Recent match history is missing');
  const games=nextCareer.games-oldCareer.games;
  if(games===0){if(!isDeepStrictEqual(next,old))throw fail(409,'Match history changed without a completed game');return;}
  const expected=Math.min(limit,old.length+games),newCount=Math.min(games,limit),retained=expected-newCount;
  if(next.length!==expected||!isDeepStrictEqual(next.slice(0,retained),old.slice(old.length-retained)))throw fail(409,'Recent completed match history was not preserved');
  const newRows=next.slice(retained);
  for(const row of newRows){
    counters(row,['kills','deaths','damage'],['kills','deaths']);
    if(typeof row.won!=='boolean'||!Number.isFinite(row.at)||row.at<=0||row.at>Date.now()+5*60000||row.kills>nextCareer.kills||row.deaths>nextCareer.deaths||row.damage>nextCareer.damage+.0001)throw fail(409,'A recent match result conflicts with the career');
  }
  const wins=newRows.filter(row=>row.won).length,losses=newRows.length-wins;
  if(games<=limit){reconcile(nextCareer.wins-oldCareer.wins,wins,'Career wins and recorded match results');reconcile(nextCareer.losses-oldCareer.losses,losses,'Career losses and recorded match results');}
  else if(wins>nextCareer.wins-oldCareer.wins||losses>nextCareer.losses-oldCareer.losses)throw fail(409,'Recorded recent results exceed career wins/losses');
}

function readWorld(db,userId){
  const row=db.prepare('SELECT revision,schema_version,save_json,updated_at FROM worlds WHERE user_id=?').get(userId);
  return row?{revision:row.revision,schema:row.schema_version,save:JSON.parse(row.save_json),updatedAt:row.updated_at}:null;
}
function migrateLocalWorld(raw){
  if(!isRecord(raw))throw fail(400,'Local save is not a game world');
  validateValue(raw);if(Buffer.byteLength(JSON.stringify(raw))>MAX_WORLD_BYTES)throw fail(413,'Local save exceeds size limit');
  const e=engine({'sar-persistent-save':JSON.stringify(raw)});
  if(e.context.SAR.getSaveInfo().writeProtected)throw fail(409,'This save was created by a newer game version');
  return JSON.parse(JSON.stringify(e.dev.inspect().SAVE));
}
function validateValue(value,depth=0){
  if(depth>80)throw fail(400,'Save nesting is too deep');
  if(typeof value==='number'&&!Number.isFinite(value))throw fail(400,'Save contains non-finite values');
  if(Array.isArray(value)){if(value.length>100000)throw fail(400,'Save array exceeds limit');for(const part of value)validateValue(part,depth+1);}
  else if(isRecord(value)){for(const [key,part] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw fail(400,'Save contains an unsafe property');validateValue(part,depth+1);}}
}
function patchTotals(world,key){
  const patches=[...(world.patchArchives||[]),world.patchState].filter(Boolean),ids=new Set();
  let total=0;
  for(const patch of patches){if(ids.has(patch.id))continue;ids.add(patch.id);total+=count(Object.values(patch.meta||{}),key);}
  return total;
}
function careerTotals(world,key){
  const botCount=count(Object.values(world.bots||{}).map(b=>b.career||{}),key);
  return botCount+(Number(world.playerCareer?.[key])||0);
}
function validateDistanceMetadata(world,old){
  const validate=(row,prior)=>{
    if(prior?.distanceProvenance&&!isDeepStrictEqual(row?.distanceProvenance,prior.distanceProvenance))throw fail(409,'Recorded distance calibration cannot change');
    if(row?.distanceProvenance===undefined)return; // Historical unknown scale remains unknown.
    const p=row.distanceProvenance;let expected;
    try{expected=DistanceUnits.worldProvenance(DistanceUnits.mapCalibration(p?.mapId));}catch{throw fail(400,'Unknown distance calibration');}
    if(!isDeepStrictEqual(p,expected))throw fail(400,'Invalid distance calibration or source units');
  };
  const patch=world.patchState,prior=old?.patchState?.id===patch?.id?old.patchState:null;
  validate(patch,prior);
  for(const [id,sample] of Object.entries(patch?.aiSamples||{}))validate(sample,prior?.aiSamples?.[id]);
  for(const [id,sample] of Object.entries(patch?.participantAnalytics?.samples||{}))for(const mode of ['tdm','deathmatch'])for(const cohort of ['human','bot'])validate(sample?.[mode]?.[cohort],prior?.participantAnalytics?.samples?.[id]?.[mode]?.[cohort]);
}
function validateWorld(world,previous=null){
  if(!isRecord(world)||!Number.isInteger(world.schema)||world.schema<17||world.schema>17)throw fail(400,'Unsupported game save schema');
  const serialized=JSON.stringify(world);if(Buffer.byteLength(serialized)>MAX_WORLD_BYTES)throw fail(413,'Game save exceeds size limit');
  validateValue(world);validateDistanceMetadata(world,previous?.save);validateProgression(world,previous?.save);
  if(!Array.isArray(world.activeBotNames)||world.activeBotNames.length!==50||new Set(world.activeBotNames).size!==50)throw fail(400,'Expected 50 stable active bots');
  if(!isRecord(world.bots)||!isRecord(world.patchState)||!isRecord(world.patchState.meta)||!isRecord(world.seasons?.current)||!Array.isArray(world.seasons.history)||!Array.isArray(world.patchArchives)||!Array.isArray(world.balancePatchHistory))throw fail(400,'Game save is incomplete');
  const submittedBalance=JSON.stringify(world.patchState.weaponStats),publishedBalance=balance();
  // An already-installed PWA must checkpoint its real old-patch progress before
  // activating the new build. Only this account's exact persisted balance can
  // continue; a fresh universe or arbitrary old/new sheet is never trusted.
  const continuesStoredBalance=!!previous&&world.patchState.fingerprint===previous.save.patchState.fingerprint&&submittedBalance===JSON.stringify(previous.save.patchState.weaponStats);
  if(submittedBalance!==publishedBalance&&!continuesStoredBalance)throw fail(409,'Weapon balance snapshot does not match the published game build or this account’s persisted patch');
  const weaponNames=Object.keys(world.patchState.weaponStats);
  if(weaponNames.some(name=>!isRecord(world.patchState.meta[name])))throw fail(400,'Current patch lacks weapon telemetry');
  const expectedFingerprint='b-'+[...submittedBalance].reduce((h,ch)=>Math.imul(h^ch.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
  if(!Number.isInteger(world.patchState.generation)||world.patchState.generation<1||world.patchState.fingerprint!==expectedFingerprint||world.patchState.id!==expectedFingerprint+'-'+world.patchState.generation)throw fail(409,'Current patch identity is invalid');
  counters(world.patchState,['completedMatches','observedSeconds'],['completedMatches']);
  validateCareer(world.playerCareer,'weapons');
  counters(world.playerCareer,['bestKills','bestDamage','bestStreak','currentStreak'],['bestKills','bestStreak','currentStreak']);
  counters(world.playerCareer,['bestWinStreak','currentWinStreak'],['bestWinStreak','currentWinStreak'],false);
  const botIds=new Set();
  for(const name of world.activeBotNames){
    const b=world.bots[name];if(!isRecord(b?.profile)||!isRecord(b.career))throw fail(400,'An active bot profile is missing');
    const id=botId(name,b);if(!/^[a-z0-9_]{4,32}$/i.test(id)||b.profile.name!==name||botIds.has(id))throw fail(400,'Bot IDs must be valid and unique');botIds.add(id);
    if(!Number.isFinite(b.profile.power)||b.profile.power<0||b.profile.power>100)throw fail(400,'Bot Power is invalid');
    validateCareer(b.career,'weaponUsage');
    for(const match of b.recentMatches||[]){if(!match.social)continue;const s=match.social;if(typeof s.matchId!=='string'||s.matchId.length>180||![0,1].includes(s.team)||!Array.isArray(s.teammates)||!Array.isArray(s.opponents)||s.teammates.length>4||s.opponents.length>5||new Set([...s.teammates,...s.opponents]).size!==s.teammates.length+s.opponents.length||[...s.teammates,...s.opponents].some(other=>other===name||!world.activeBotNames.includes(other)))throw fail(400,'Invalid completed social match facts');}
    if(!isRecord(b.familiarity)||!Number.isFinite(b.recentForm)||b.recentForm<-10||b.recentForm>10||Object.values(b.familiarity).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>100))throw fail(400,'Bot Form or familiarity is invalid');
  }
  const season=world.seasons.current;
  if(!Number.isInteger(season.number)||season.number<1||!Number.isFinite(season.startAt)||season.startAt<=0||season.endAt-season.startAt!==SEASON_MS||!isRecord(season.stats))throw fail(400,'Season window is invalid');
  const seasonNumbers=new Set([season.number]);
  for(const archived of world.seasons.history){if(!isRecord(archived)||!Number.isInteger(archived.number)||seasonNumbers.has(archived.number)||archived.number>=season.number)throw fail(400,'Season archive identity is invalid');seasonNumbers.add(archived.number);}
  for(const name of world.activeBotNames){counters(season.stats[name],CAREER_TOTALS,CAREER_COUNTS);if(season.stats[name].wins+season.stats[name].losses>season.stats[name].games)throw fail(400,'Season result counters conflict');}
  const playerSeason=world.playerSeasons?.current;
  if(!isRecord(playerSeason)||!Array.isArray(world.playerSeasons.history)||playerSeason.number!==season.number||playerSeason.startAt!==season.startAt||playerSeason.endAt!==season.endAt)throw fail(400,'Player season does not match the league deadline');
  counters(playerSeason.stats,CAREER_TOTALS,CAREER_COUNTS);
  for(const [weapon,m] of Object.entries(world.patchState.meta)){
    if(!weaponNames.includes(weapon))throw fail(400,'Unexpected weapon telemetry');
    validateMeta(m);
  }
  if(!isRecord(world.patchState.perBot)||!isRecord(world.patchState.skillStrata))throw fail(400,'Measured patch samples are missing');
  for(const [name,guns] of Object.entries(world.patchState.perBot)){
    if(!isRecord(world.bots[name]?.profile)&&name!=='@human:YOU')throw fail(400,'Unknown actor in patch telemetry');
    if(!isRecord(guns))throw fail(400,'Actor weapon measurements are invalid');
    for(const [weapon,stats] of Object.entries(guns)){if(!weaponNames.includes(weapon))throw fail(400,'Unexpected measured weapon');validateMeta(stats,false,true);}
  }
  for(const [band,guns] of Object.entries(world.patchState.skillStrata)){
    if(!/^(human|[0-9]{1,3})$/.test(band)||!isRecord(guns))throw fail(400,'Measured Power-band telemetry is invalid');
    for(const [weapon,stats] of Object.entries(guns)){if(!weaponNames.includes(weapon))throw fail(400,'Unexpected measured weapon');validateMeta(stats,false);}
  }
  const patchIds=new Set([world.patchState.id]);
  for(const archived of world.patchArchives){if(!isRecord(archived)||typeof archived.id!=='string'||patchIds.has(archived.id))throw fail(400,'Patch archives must have unique identities');patchIds.add(archived.id);}
  if(previous){
    const old=previous.save;
    if(world.activeBotNames.join('|')!==old.activeBotNames.join('|'))throw fail(409,'Bot roster changed; keep the current cloud revision');
    if(!isDeepStrictEqual(Object.keys(world.bots).sort(),Object.keys(old.bots).sort()))throw fail(409,'Permanent bot records were added or removed');
    for(const name of world.activeBotNames){
      const a=world.bots[name],b=old.bots[name];
      if(botId(name,a)!==botId(name,b)||a.profile.power!==b.profile.power||a.profile.rank!==b.profile.rank||a.profile.archetype!==b.profile.archetype||!isDeepStrictEqual(a.profile.personality,b.profile.personality))throw fail(409,'A permanent bot identity, Power or personality changed');
      monotonic(a.career,b.career,CAREER_TOTALS.concat(['timePlayed']),'Bot lifetime totals');
      compareWeaponDeltas(world,old,name,a.career,b.career,'weaponUsage');
      compareSeasonDeltas(world,old,name,a.career,b.career);
      compareMatchHistory(a.recentMatches||[],b.recentMatches||[],a.career,b.career,20);
    }
    for(const [name,prior] of Object.entries(old.bots))if(!world.activeBotNames.includes(name)&&!isDeepStrictEqual(world.bots[name],prior))throw fail(409,'Retired bot history changed');
    monotonic(world.playerCareer,old.playerCareer,CAREER_TOTALS.concat(['timePlayed','bestKills','bestDamage','bestStreak','bestWinStreak']),'Player lifetime totals');
    compareWeaponDeltas(world,old,'@human:YOU',world.playerCareer,old.playerCareer,'weapons');
    compareSeasonDeltas(world,old,'YOU',world.playerCareer,old.playerCareer,true);
    compareMatchHistory(world.playerCareer.recentMatches||[],old.playerCareer.recentMatches||[],world.playerCareer,old.playerCareer,30);
    const priorSeason=old.seasons.current;
    if(season.number<priorSeason.number)throw fail(409,'Season number moved backwards');
    if(season.number===priorSeason.number&&(season.startAt!==priorSeason.startAt||season.endAt!==priorSeason.endAt))throw fail(409,'An active season deadline changed');
    for(const prior of old.seasons.history){const next=world.seasons.history.find(s=>s.number===prior.number);if(!isDeepStrictEqual(next,prior))throw fail(409,'Finalized season history changed');}
    for(const prior of old.playerSeasons?.history||[]){const next=world.playerSeasons.history.find(s=>s.number===prior.number);if(!isDeepStrictEqual(next,prior))throw fail(409,'Finalized player season history changed');}
    if(season.number>priorSeason.number){
      if(Date.now()<season.startAt||season.startAt!==priorSeason.startAt+(season.number-priorSeason.number)*SEASON_MS)throw fail(409,'Season rollover does not match server time');
      for(let number=priorSeason.number;number<season.number;number++){
        const archived=world.seasons.history.find(s=>s.number===number),startAt=priorSeason.startAt+(number-priorSeason.number)*SEASON_MS;
        if(!archived||archived.startAt!==startAt||archived.endAt!==startAt+SEASON_MS||archived.finalizedAt!==archived.endAt)throw fail(409,'Previous season was not preserved');
      }
    }
    const continuing=season.number===priorSeason.number?season:world.seasons.history.find(s=>s.number===priorSeason.number);
    for(const name of world.activeBotNames)monotonic(continuing.stats?.[name],priorSeason.stats[name],CAREER_TOTALS,'Season totals');
    const continuingPlayer=season.number===priorSeason.number?playerSeason:world.playerSeasons.history.find(s=>s.number===priorSeason.number);
    if(!continuingPlayer||continuingPlayer.startAt!==priorSeason.startAt||continuingPlayer.endAt!==priorSeason.endAt)throw fail(409,'Previous player season was not preserved');
    monotonic(continuingPlayer.stats,old.playerSeasons?.current?.stats,CAREER_TOTALS,'Player season totals');
    for(const prior of old.patchArchives){const next=world.patchArchives.find(p=>p.id===prior.id);if(!isDeepStrictEqual(next,prior))throw fail(409,'Archived patch telemetry changed');}
    if(!old.balancePatchHistory.every((record,index)=>isDeepStrictEqual(world.balancePatchHistory[index],record)))throw fail(409,'Balance change history changed');
    let active=world.patchState;
    if(world.patchState.id!==old.patchState.id){
      active=world.patchArchives.find(p=>p.id===old.patchState.id);
      if(!active||active.fingerprint!==old.patchState.fingerprint||!isDeepStrictEqual(active.weaponStats,old.patchState.weaponStats))throw fail(409,'Previous patch telemetry was not archived');
      // The existing Meta archive/restart action deliberately opens a new sample
      // of the same balance patch. Its entire previous sample remains archived;
      // all career/season/actor deltas still have to reconcile below.
      const manualRestart=world.patchState.reason==='manual sample restart'&&active.reason==='manual sample restart'&&Number.isFinite(active.endedAt)&&active.endedAt>=Number(old.patchState.startedAt||0);
      if((world.patchState.fingerprint===old.patchState.fingerprint&&!manualRestart)||world.patchState.generation!==old.patchState.generation+1)throw fail(409,'Patch telemetry cannot reset without a balance change or an archived manual sample restart');
    }
    monotonic(active,old.patchState,['completedMatches','observedSeconds'],'Patch observation totals');
    for(const weapon of Object.keys(old.patchState.meta)){
      if(!isRecord(active.meta?.[weapon]))throw fail(409,'Previous patch weapon telemetry was removed');
      validateMeta(active.meta[weapon],false);
      monotonic(active.meta[weapon],old.patchState.meta[weapon],META_TOTALS,'Weapon telemetry');
    }
    for(const [careerKey,patchKey] of [['kills','kills'],['deaths','deaths'],['damage','damage'],['taken','damage'],['shots','shots'],['hits','hits'],['headshots','headshots'],['timeAlive','equippedTime']]){
      const deltaCareer=careerTotals(world,careerKey)-careerTotals(old,careerKey);
      const deltaPatch=patchTotals(world,patchKey)-patchTotals(old,patchKey);
      reconcile(deltaCareer,deltaPatch,'Career and weapon telemetry deltas');
    }
    const completed=world.patchState.completedMatches-old.patchState.completedMatches+(world.patchState.id!==old.patchState.id?active.completedMatches:0);
    // Every completed 5v5 contributes ten career games and five wins/losses.
    reconcile(careerTotals(world,'games')-careerTotals(old,'games'),completed*10,'Career and completed match totals');
    reconcile(careerTotals(world,'wins')-careerTotals(old,'wins'),completed*5,'Career wins and completed matches');
    reconcile(careerTotals(world,'losses')-careerTotals(old,'losses'),completed*5,'Career losses and completed matches');
    for(const [name,guns] of Object.entries(old.patchState.perBot||{}))for(const [weapon,stats] of Object.entries(guns))monotonic(active.perBot?.[name]?.[weapon],stats,META_TOTALS.map(k=>k==='kills'?'k':k==='deaths'?'d':k),'Actor patch measurements');
    for(const [band,guns] of Object.entries(old.patchState.skillStrata||{}))for(const [weapon,stats] of Object.entries(guns))monotonic(active.skillStrata?.[band]?.[weapon],stats,META_TOTALS,'Power-band measurements');
    const measuredWeapons=new Set([...weaponNames,...Object.keys(old.patchState.meta)]);
    for(const weapon of measuredWeapons)for(const key of META_TOTALS.filter(k=>!['killDistance','killDistanceN'].includes(k))){
      // A newly published weapon has no fabricated baseline in the previous patch.
      // Retired weapons still reconcile against their preserved archived samples.
      const metaDelta=Number(active.meta?.[weapon]?.[key]||0)-Number(old.patchState.meta[weapon]?.[key]||0)+(world.patchState.id!==old.patchState.id?Number(world.patchState.meta[weapon]?.[key]||0):0);
      const alias=key==='kills'?'k':key==='deaths'?'d':key;
      const actorDelta=count(Object.values(active.perBot||{}).map(g=>g[weapon]),alias)-count(Object.values(old.patchState.perBot||{}).map(g=>g[weapon]),alias)+(world.patchState.id!==old.patchState.id?count(Object.values(world.patchState.perBot||{}).map(g=>g[weapon]),alias):0);
      const strataDelta=count(Object.values(active.skillStrata||{}).map(g=>g[weapon]),key)-count(Object.values(old.patchState.skillStrata||{}).map(g=>g[weapon]),key)+(world.patchState.id!==old.patchState.id?count(Object.values(world.patchState.skillStrata||{}).map(g=>g[weapon]),key):0);
      reconcile(metaDelta,actorDelta,'Weapon and actor measurements');reconcile(metaDelta,strataDelta,'Weapon and Power-band measurements');
    }
  }
  validateModeScopes(world,previous);
  validateParticipantAnalytics(world,previous?.save);
  validateRankedProgression(world,previous?.save);
  return serialized;
}
function validateParticipantAnalytics(world,old){
 const analytics=world.patchState.participantAnalytics;
 const previous=old?.patchState?.participantAnalytics;
 if(!analytics){if(previous)throw fail(409,'Participant analytics were removed');return;}
 if(analytics.schema!==1||analytics.coverage!=='prospective-skyline'||!Number.isFinite(analytics.startedAt)||!isRecord(analytics.legacy?.tdm)||!isRecord(analytics.legacy?.deathmatch)||!isRecord(analytics.samples))throw fail(400,'Invalid participant analytics schema');
 const samePatch=old?.patchState.id===world.patchState.id;
 if(samePatch&&previous&&(analytics.startedAt!==previous.startedAt||!isDeepStrictEqual(analytics.legacy,previous.legacy)))throw fail(409,'Participant analytics coverage changed');
 const names=Object.keys(world.patchState.weaponStats),botIds=new Set(Object.entries(world.bots).map(([name,b])=>botId(name,b)));
 const scopes={tdm:[],deathmatch:[]};
 for(const [revision,sample] of Object.entries(analytics.samples)){
  if(!isRecord(sample)||typeof sample.rulesetRevision!=='string')throw fail(400,'Missing participant analytics ruleset');
  const prior=samePatch?previous?.samples?.[revision]:null;
  if(prior&&sample.rulesetRevision!==prior.rulesetRevision)throw fail(409,'Participant analytics ruleset changed');
  for(const mode of ['tdm','deathmatch'])for(const type of ['human','bot']){
   const scope=sample[mode]?.[type],before=prior?.[mode]?.[type];
   if(!isRecord(scope?.meta)||!isRecord(scope.skillStrata)||!isRecord(scope.participants))throw fail(400,'Invalid participant cohort');
   counters(scope,['completedMatches'],['completedMatches']);
   if(before)monotonic(scope,before,['completedMatches'],'Participant cohort games');
   if(Object.keys(scope.meta).length!==names.length)throw fail(400,'Incomplete participant weapon sample');
   for(const [name,row] of Object.entries(scope.meta)){if(!names.includes(name)||row.name!==name)throw fail(400,'Unexpected participant weapon');validateMeta(row);if(before)monotonic(row,before.meta?.[name],META_TOTALS,'Participant weapon measurements');}
   for(const [id,actor] of Object.entries(scope.participants)){
    if(!id||id.length>180||actor.participantId!==id||actor.type!==type||!isRecord(actor.meta)||(type==='bot'?!botIds.has(id):botIds.has(id)))throw fail(400,'Invalid stable participant identity');
    const former=before?.participants?.[id];
    if(former&&(former.type!==actor.type||former.participantId!==actor.participantId))throw fail(409,'Participant identity changed');
    for(const [name,row] of Object.entries(actor.meta)){if(!names.includes(name)||row.name!==name)throw fail(400,'Invalid participant weapon record');validateMeta(row);if(former)monotonic(row,former.meta?.[name],META_TOTALS,'Participant actor measurements');}
    for(const name of Object.keys(former?.meta||{}))if(!actor.meta[name])throw fail(409,'Participant weapon record was removed');
   }
   for(const id of Object.keys(before?.participants||{}))if(!scope.participants[id])throw fail(409,'Participant identity was removed');
   for(const [band,guns] of Object.entries(scope.skillStrata)){
    if((type==='human'?band!=='human':!/^[0-9]{1,3}$/.test(band))||!isRecord(guns))throw fail(400,'Invalid participant Power band');
    for(const [name,row] of Object.entries(guns)){if(!names.includes(name))throw fail(400,'Invalid participant band weapon');validateMeta(row);if(before)monotonic(row,before.skillStrata?.[band]?.[name],META_TOTALS,'Participant band measurements');}
   }
   for(const [name,row] of Object.entries(scope.meta))for(const key of META_TOTALS){
    reconcile(row[key],count(Object.values(scope.participants).map(a=>a.meta[name]),key),'Cohort and participant measurements');
    reconcile(row[key],count(Object.values(scope.skillStrata).map(g=>g[name]),key),'Cohort and Power-band measurements');
   }
   scopes[mode].push(scope);
  }
  if(prior&&revision!==world.aiRevision&&!isDeepStrictEqual(sample,prior))throw fail(409,'Historical participant sample changed');
 }
 for(const revision of Object.keys(samePatch&&previous?.samples||{}))if(!analytics.samples[revision])throw fail(409,'Participant revision history was removed');
 for(const mode of ['tdm','deathmatch']){
  const combined=mode==='tdm'?world.patchState.meta:world.modeStats?.deathmatch?.meta||{};
  for(const [name,row] of Object.entries(analytics.legacy[mode])){if(!names.includes(name))throw fail(400,'Invalid legacy participant weapon');validateMeta(row);}
  for(const name of names)for(const key of META_TOTALS)reconcile(Number(combined[name]?.[key]||0),Number(analytics.legacy[mode][name]?.[key]||0)+count(scopes[mode].map(s=>s.meta[name]),key),'Combined and participant '+mode+' measurements');
 }
 if(samePatch&&previous){
  // Reconcile prospective TDM actor deltas against the independently retained
  // exact combat records. Identity comes from profile IDs, never display names.
  const identityNames=new Map(Object.entries(world.bots).map(([name,b])=>[botId(name,b),name]));
  for(const type of ['human','bot'])for(const name of names)for(const key of META_TOTALS){
   const alias=key==='kills'?'k':key==='deaths'?'d':key;
   const scoped=(source)=>Object.values(source?.samples||{}).reduce((sum,s)=>sum+Number(s.tdm?.[type]?.meta?.[name]?.[key]||0),0);
   const recorded=(patch)=>count(Object.entries(patch.perBot).filter(([actor])=>type==='human'?actor==='@human:YOU':identityNames.has(botId(actor,world.bots[actor]))).map(([,guns])=>guns[name]),alias);
   reconcile(scoped(analytics)-scoped(previous),recorded(world.patchState)-recorded(old.patchState),'Participant cohort and actor deltas');
  }
  for(const type of ['human','bot'])for(const name of names)for(const alias of WEAPON_TOTALS){
   const key=alias==='k'?'kills':alias==='d'?'deaths':alias;
   const scoped=source=>Object.values(source?.samples||{}).reduce((sum,s)=>sum+Number(s.deathmatch?.[type]?.meta?.[name]?.[key]||0),0);
   const recorded=save=>{const dm=save.modeStats?.deathmatch;return type==='human'?Number(dm?.player?.weapons?.[name]?.[alias]||0):count(Object.values(dm?.bots||{}).map(c=>c.weaponUsage?.[name]),alias);};
   reconcile(scoped(analytics)-scoped(previous),recorded(world)-recorded(old),'Deathmatch participant cohort and career deltas');
  }
 }
}
function validateModeScopes(world,previous){
 const old=previous?.save,patch=world.patchState;
 if(old?.patchState?.id===patch.id&&old.patchState.aiSamples&&!patch.aiSamples)throw fail(409,'AI revision measurements were removed');
 if(patch.aiSamples){
  if(!isRecord(patch.aiSamples))throw fail(400,'Invalid AI revision samples');
  const samples=Object.values(patch.aiSamples);
  for(const [revision,sample] of Object.entries(patch.aiSamples)){
   if(sample.revision!==revision||!isRecord(sample.meta)||!isRecord(sample.perBot)||!isRecord(sample.skillStrata))throw fail(400,'Invalid AI revision measurement');
   counters(sample,['completedMatches','observedSeconds'],['completedMatches']);for(const row of Object.values(sample.meta))validateMeta(row);
   const prior=old?.patchState.id===patch.id?old.patchState.aiSamples?.[revision]:null;
   if(prior){monotonic(sample,prior,['completedMatches','observedSeconds'],'AI revision totals');for(const [weapon,row] of Object.entries(prior.meta))monotonic(sample.meta[weapon],row,META_TOTALS,'AI revision weapon totals');if(revision!==world.aiRevision&&!isDeepStrictEqual(sample,prior))throw fail(409,'Historical AI revision changed');}
  }
  for(const [weapon,row] of Object.entries(patch.meta))for(const key of META_TOTALS)reconcile(count(samples.map(s=>s.meta[weapon]),key),row[key],'AI revision and balance samples');
  for(const key of ['completedMatches','observedSeconds'])reconcile(count(samples,key),patch[key],'AI revision and patch totals');
 }
 const dm=world.modeStats?.deathmatch,prior=old?.modeStats?.deathmatch;
 if(prior&&!dm)throw fail(409,'Deathmatch history was removed');if(!dm)return;
 if(!isRecord(dm.bots)||!isRecord(dm.meta)||!Array.isArray(dm.recentMatches))throw fail(400,'Invalid Deathmatch record');
 validateCareer(dm.player,'weapons');for(const [name,career] of Object.entries(dm.bots)){if(!world.bots[name])throw fail(400,'Unknown Deathmatch identity');validateCareer(career,'weaponUsage');}
 counters(dm,['completedMatches'],['completedMatches']);
 const careers=[dm.player,...Object.values(dm.bots)];reconcile(count(careers,'games'),dm.completedMatches*10,'Deathmatch games');
 const ids=new Set();for(const result of dm.recentMatches){if(result.mode!=='deathmatch'||result.sessionType!=='standard'||result.eligible!==true||!result.matchId||ids.has(result.matchId)||result.rows?.length!==10)throw fail(400,'Invalid Deathmatch result identity');ids.add(result.matchId);const former=prior?.recentMatches.find(r=>r.matchId===result.matchId);if(former&&!isDeepStrictEqual(former,result))throw fail(409,'Finalized Deathmatch result changed');}
 for(const row of Object.values(dm.meta))validateMeta(row);
 for(const [careerKey,metaKey] of [['kills','kills'],['deaths','deaths'],['damage','damage'],['taken','damage'],['shots','shots'],['hits','hits'],['headshots','headshots'],['timeAlive','equippedTime']])reconcile(count(careers,careerKey),count(Object.values(dm.meta),metaKey),'Deathmatch career and weapon measurements');
 for(const [weapon,row] of Object.entries(dm.meta))for(const [key,alias] of [['kills','k'],['deaths','d'],['damage','damage'],['shots','shots'],['hits','hits'],['headshots','headshots'],['equippedTime','equippedTime']])reconcile(row[key],count([dm.player.weapons[weapon],...Object.values(dm.bots).map(c=>c.weaponUsage[weapon])],alias),'Deathmatch per-weapon measurements');
 if(prior){monotonic(dm,prior,['completedMatches'],'Deathmatch completions');for(const [name,career] of [['@player',dm.player],...Object.entries(dm.bots)]){const before=name==='@player'?prior.player:prior.bots[name];if(before){monotonic(career,before,CAREER_TOTALS.concat('timePlayed'),'Deathmatch career');const key=name==='@player'?'weapons':'weaponUsage';for(const [w,row] of Object.entries(before[key]))monotonic(career[key][w],row,WEAPON_TOTALS.concat('games'),'Deathmatch weapon history');}}for(const name of Object.keys(prior.bots))if(!dm.bots[name])throw fail(409,'Deathmatch bot history was removed');for(const [w,row] of Object.entries(prior.meta))monotonic(dm.meta[w],row,META_TOTALS,'Deathmatch meta');}
}

function writeWorld(db,userId,world,baseRevision,{importing=false,originalSave=null}={}){
  const now=Date.now(),previous=readWorld(db,userId);
  if(previous&&importing)throw fail(409,'This account already has cloud progress');
  if((previous?.revision||0)!==baseRevision)throw fail(409,'Cloud save changed on another session','REVISION_CONFLICT');
  const saveJson=validateWorld(world,previous),revision=baseRevision+1;
  validateRewardOwnership(userId,world,previous?.save);
  validateTournamentProgression(db,userId,world,previous?.save);
  db.exec('BEGIN IMMEDIATE');
  try{
    if(importing&&originalSave)db.prepare('INSERT INTO world_backups(user_id,revision,save_json,reason,created_at) VALUES(?,?,?,?,?)').run(userId,0,JSON.stringify(originalSave),'original local save before schema migration',now);
    const rankedMigration=previous&&previous.save.ranked===undefined&&world.ranked!==undefined;
    if(previous&&(rankedMigration||baseRevision%30===0||previous.save.patchState?.id!==world.patchState.id||previous.save.patchState?.completedMatches!==world.patchState.completedMatches||previous.save.seasons.current.number!==world.seasons.current.number)){
      db.prepare('INSERT INTO world_backups(user_id,revision,save_json,reason,created_at) VALUES(?,?,?,?,?)').run(userId,previous.revision,JSON.stringify(previous.save),rankedMigration?'before ranked progression migration':'before cloud revision '+revision,now);
    }
    db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,schema_version=excluded.schema_version,save_json=excluded.save_json,updated_at=excluded.updated_at,season_start_at=excluded.season_start_at,season_end_at=excluded.season_end_at').run(userId,revision,world.schema,saveJson,now,world.seasons.current.startAt,world.seasons.current.endAt);
    upsertWorldTables(db,userId,world,now);require('./bot-relationships.cjs').recordRelationships(db,userId,previous?.save||null,world,now);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {revision,updatedAt:now,serverNow:now};
}
function blankSeasonStats(name){return {name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0};}
function seasonWinner(world,season){
  const played=world.activeBotNames.map(name=>season.stats[name]).filter(row=>row?.games>0);
  if(!played.length)return null;
  const qualified=played.filter(row=>row.games>=10),rows=qualified.length?qualified:played;
  const kd=row=>row.deaths>0?row.kills/row.deaths:row.kills>0?999:0;
  rows.sort((a,b)=>kd(b)-kd(a)||b.wins-a.wins||b.kills-a.kills||b.damage-a.damage||a.name.localeCompare(b.name));
  const row=rows[0];return {name:row.name,kd:row.deaths>0?row.kills/row.deaths:row.kills,zeroDeaths:row.deaths===0&&row.kills>0,games:row.games,wins:row.wins,losses:row.losses,kills:row.kills,deaths:row.deaths,damage:row.damage};
}
function refreshWorldSeason(db,userId,now=Date.now()){
  const previous=readWorld(db,userId);if(!previous||now<previous.save.seasons.current.endAt)return previous;
  // Keep the persisted balance while rolling deadlines. A cached PWA may still
  // need to checkpoint it before activating an update; the new client archives
  // that patch when it applies the current published sheet.
  const world=previous.save;
  // Deadlines are stored in the database and advanced by the server, including when
  // every client is closed. No combat or historical telemetry is reconstructed.
  while(now>=world.seasons.current.endAt){
    const current=world.seasons.current;current.winner=seasonWinner(world,current);current.finalizedAt=current.endAt;
    world.seasons.history.unshift(current);
    world.seasons.current={number:current.number+1,startAt:current.endAt,endAt:current.endAt+SEASON_MS,winner:null,finalizedAt:null,stats:Object.fromEntries(world.activeBotNames.map(name=>[name,blankSeasonStats(name)]))};
    if(world.playerSeasons){world.playerSeasons.history.unshift(world.playerSeasons.current);world.playerSeasons.current={number:current.number+1,startAt:current.endAt,endAt:current.endAt+SEASON_MS,stats:blankSeasonStats('YOU')};}
  }
  writeWorld(db,userId,world,previous.revision);
  return readWorld(db,userId);
}
module.exports={readWorld,refreshWorldSeason,migrateLocalWorld,validateWorld,writeWorld,MAX_WORLD_BYTES,fail};
