'use strict';
const XP=require('../progression.js'),{isDeepStrictEqual}=require('node:util');
const MapPools=require('./map-pools.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),fail=message=>Object.assign(new Error(message),{status:409,code:'SERVER_AUTHORITY_REQUIRED'});
const KEYS=['kills','deaths','assists','damage','taken','shots','hits','headshots','timeAlive','timePlayed'];
const empty=()=>({games:0,wins:0,losses:0,draws:0,...Object.fromEntries(KEYS.map(key=>[key,0]))});
function saveFor(db,userId){const row=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get(userId);return row?JSON.parse(row.save_json):null;}
function baselineFrom(world,userId){
 const legacy=world||{};
 return {version:1,progression:XP.normalize(legacy.progression,legacy),ranked:XP.normalizeRanked(legacy.ranked),
  streaks:Object.fromEntries(XP.STANDARD_MODES.map(mode=>[mode,mode==='tdm'?legacy.playerCareer?.currentWinStreak||0:legacy.modeStats?.[mode]?.player?.currentWinStreak||0])),
  participantId:userId,legacyFields:{playerCareer:clone(legacy.playerCareer??null),playerSeasons:clone(legacy.playerSeasons??null),deathmatchPlayer:clone(legacy.modeStats?.deathmatch?.player??null)}};
}
function ensureBaseline(db,userId,world,now=Date.now()){
 let row=db.prepare('SELECT baseline_json FROM mp_progression_baselines WHERE user_id=?').get(userId);if(row)return JSON.parse(row.baseline_json);
 const source=world??saveFor(db,userId);if(!source)throw Object.assign(fail('Load your authenticated world before entering multiplayer'),{code:'WORLD_NOT_READY'});
 const value=baselineFrom(source,userId);db.prepare('INSERT OR IGNORE INTO mp_progression_baselines(user_id,baseline_json,created_at) VALUES(?,?,?)').run(userId,JSON.stringify(value),now);
 row=db.prepare('SELECT baseline_json FROM mp_progression_baselines WHERE user_id=?').get(userId);return JSON.parse(row.baseline_json);
}
function readRecords(db,userId){return db.prepare('SELECT result_json FROM mp_results WHERE user_id=? AND applied_at>0 ORDER BY applied_at,match_id').all(userId).map(row=>JSON.parse(row.result_json)).filter(row=>row.schema===1&&row.participantId===userId);}
function add(totals,row){totals.games++;if(row.won===true)totals.wins++;else if(row.won===false)totals.losses++;else totals.draws++;for(const key of KEYS)totals[key]+=row.stats[key]||0;}
function project(db,userId,baseline,now=Date.now()){
 const progression=clone(baseline.progression),ranked=clone(baseline.ranked),records=readRecords(db,userId),totals=empty(),byMode=Object.fromEntries(XP.STANDARD_MODES.map(mode=>[mode,empty()])),streaks={...baseline.streaks},weaponTotals={},tournamentWeaponTotals={},balanceMeta={};
 for(const record of records){
  const sourceMode=record.sessionType==='ltm'?'ltm:'+record.ltmDefinition.id:record.mode,xpEligible=record.xpEligible??record.eligible;if(!record.eligible&&!xpEligible)continue;
  if(record.kind==='standard'||record.kind==='ranked')streaks[sourceMode]=record.won===true?(streaks[sourceMode]||0)+1:0;
  if(xpEligible&&!record.abandoned)XP.award(progression,{...record.input,winStreak:record.kind==='official'?0:streaks[sourceMode]});
  if(record.eligible&&record.kind==='ranked'&&typeof record.won==='boolean'){if(record.input.rankedSeasonResets)require('./competitive-progression.cjs').applyResets(db,ranked,userId,record.at,record.input.rankedSeasonResets);XP.awardRanked(ranked,record.input);}
  if(!record.eligible)continue;add(totals,record);add(byMode[sourceMode]??=empty(),record);
  const weapons=record.kind==='official'?tournamentWeaponTotals:weaponTotals;
  for(const [name,raw]of Object.entries(record.weaponStats||{})){
   const target=weapons[name]??={kills:0,deaths:0,games:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
   for(const key of ['kills','deaths','picks','damage','shots','hits','headshots','equippedTime'])target[key]+=Number(raw[key]??raw[key==='kills'?'k':key==='deaths'?'d':key])||0;
   if(raw.picks>0||raw.equippedTime>0)target.games++;
  }
  if(record.kind!=='official'&&record.balance?.fingerprint){
   const key=record.balance.fingerprint,patch=balanceMeta[key]??={balance:clone(record.balance),byMode:{}};
   const distanceProvenance=MapPools.metaProvenance(record.distanceProvenance,record.metaDistanceProvenance||record.distanceProvenance),modeSample=patch.byMode[sourceMode]??={cohorts:{}},revisionKey=JSON.stringify([record.aiRevision||null,record.rulesetRevision||null,distanceProvenance,...(record.modeRulesRevision?[record.modeRulesRevision]:[]),...(record.ltmDefinition?[record.ltmDefinition]:[])]);
   const cohort=modeSample.cohorts[revisionKey]??={...(record.modeRulesRevision?{modeRulesRevision:record.modeRulesRevision}:{}),...(record.ltmDefinition?{ltmDefinition:clone(record.ltmDefinition)}:{}),aiRevision:record.aiRevision||null,rulesetRevision:record.rulesetRevision||null,distanceProvenance,completedMatches:0,meta:{}};cohort.completedMatches++;
   for(const [name,raw]of Object.entries(record.meta||{})){const target=cohort.meta[name]??={name};for(const [metric,value]of Object.entries(raw))if(metric!=='name'&&typeof value==='number'&&Number.isFinite(value))target[metric]=(target[metric]||0)+value;}
   modeSample.currentRevisionKey=revisionKey;modeSample.completedMatches=cohort.completedMatches;modeSample.meta=cohort.meta;modeSample.aiRevision=cohort.aiRevision;modeSample.rulesetRevision=cohort.rulesetRevision;modeSample.distanceProvenance=cohort.distanceProvenance;
  }
 }
 require('./competitive-progression.cjs').applyResets(db,ranked,userId,now);
 const summary=XP.summary(progression,ranked,userId);
 return {schema:1,authoritative:true,participantId:userId,records,totals,byMode,progression,ranked,summary,weaponTotals,tournamentWeaponTotals,balanceMeta,
  ratios:{kd:totals.deaths?totals.kills/totals.deaths:totals.kills?null:0,accuracy:totals.shots?totals.hits/totals.shots:null,winRate:totals.games?totals.wins/totals.games:null},
  policy:{source:'server-resolved human matches',customExcluded:true,legacyWorldPreserved:true},streaks};
}
function projection(db,userId,now=Date.now()){
 const row=db.prepare('SELECT baseline_json FROM mp_progression_baselines WHERE user_id=?').get(userId);
 if(row)return project(db,userId,JSON.parse(row.baseline_json),now);
 const world=saveFor(db,userId);if(!world)return {...project(db,userId,baselineFrom(null,userId),now),pending:true};
 return project(db,userId,ensureBaseline(db,userId,world),now);
}
function statistics(row){
 const raw=row.stats||row,stats=Object.fromEntries(KEYS.map(key=>[key,raw[key]??0]));
 for(const key of KEYS)if(!Number.isFinite(stats[key])||stats[key]<0)throw fail('Resolved match contains invalid '+key);
 for(const key of ['kills','deaths','assists','shots','hits','headshots'])if(!Number.isSafeInteger(stats[key]))throw fail('Resolved match contains non-integer '+key);
 if(stats.hits>stats.shots)throw fail('Resolved accuracy exceeds actual shots');return stats;
}
function applyResult(db,result,match){
 const id=result?.matchId;if(typeof id!=='string'||!Array.isArray(result.rows))throw fail('Resolved multiplayer match is required');
 const persisted=db.prepare('SELECT * FROM mp_matches WHERE id=?').get(id);
 if(!persisted||!['ended','finished','finalized'].includes(persisted.status)||!persisted.result_json||!isDeepStrictEqual(JSON.parse(persisted.result_json),result))throw fail('Rewards require the persisted authoritative match result');
 if(match&&(match.id||match.matchId)!==id)throw fail('Result and match identities differ');
 const users=db.prepare('SELECT user_id FROM mp_participations WHERE match_id=? ORDER BY user_id').all(id).map(row=>row.user_id),rows=new Map();
 for(const row of result.rows){const userId=row.userId||((result.rewards?.rows||[]).some(r=>r.type==='human'&&r.participantId===row.participantId)?row.participantId:null);if(!userId)continue;if(rows.has(userId)||!users.includes(userId))throw fail('Resolved participant is not a unique match member');rows.set(userId,row);}
 if(rows.size!==users.length)throw fail('Resolved multiplayer result is missing a human participant');
 const at=result.endedAtWall||result.rewards?.at||result.at||Date.now(),outputs=[];if(!Number.isFinite(at)||at<=0)throw fail('Resolved completion time is invalid');
 db.exec('SAVEPOINT mp_rewards');let committed=false;try{
  for(const userId of users){
   const old=db.prepare('SELECT applied_at FROM mp_results WHERE match_id=? AND user_id=?').get(id,userId);if(old?.applied_at>0){outputs.push({participantId:userId,applied:false});continue;}
   const row=rows.get(userId),reward=result.rewards?.rows?.find(r=>r.participantId===userId&&r.type==='human')||row,mode=result.mode||reward.mode;
   if(!XP.STANDARD_MODES.includes(mode))throw fail('Resolved match has an unsupported mode');
   const session=result.sessionType||result.rewards?.sessionType,tournamentKind=result.tournament?.tournamentKind||result.context?.tournamentKind,
    kind=session==='ranked'?'ranked':['standard','ltm'].includes(session)?'standard':session==='tournament'&&result.eligible===true&&tournamentKind==='official'?'official':null;
   if(kind==='ranked'&&!['tdm','deathmatch'].includes(mode)||kind==='official'&&mode!=='tdm')throw fail('This mode is not eligible for that competitive queue');
   const abandoned=!!result.abandonedUserIds?.includes(userId)||row.completed===false,
    eligible=!!kind&&result.eligible!==false&&result.practice!==true,xpEligible=!!kind&&!result.practice&&(result.xpEligible??eligible)===true,stats=statistics(reward.stats?reward:row),events=clone(reward.events||row.events||XP.events()),teamOutcome=reward.won??row.won??null,won=abandoned?false:teamOutcome;
   if(![true,false,null].includes(won))throw fail('Resolved match has an invalid outcome');
   const base=ensureBaseline(db,userId,undefined,at),current=project(db,userId,base,at);
   const input={matchId:id,participantId:userId,kind,mode,sessionType:session,...(kind==='ranked'&&Object.keys(current.ranked.participants[userId]?.resets||{}).length?{rankedSeasonResets:clone(Object.values(current.ranked.participants[userId].resets))}:{}),...(result.ltmDefinition?{ltmDefinition:clone(result.ltmDefinition)}:{}),eligible:xpEligible,practice:!!result.practice,at,stats,events,leaders:clone(reward.leaders||{kills:false,assists:false,alive:false}),won,winStreak:kind==='official'?0:won===true?(current.streaks[session==='ltm'?'ltm:'+result.ltmDefinition.id:mode]||0)+1:0,
    ...(kind==='official'?{tournamentId:result.tournamentId||result.rewards?.tournamentId||result.tournament?.tournamentId||result.context?.tournamentId,seriesId:result.seriesId||result.rewards?.seriesId||result.tournament?.seriesId||result.context?.seriesId}:{})};
   if(kind==='official'&&(!input.tournamentId||!input.seriesId))throw fail('Official rewards require actual tournament and series identity');
   const xp=xpEligible&&!abandoned?XP.award(current.progression,input):null,rating=eligible&&kind==='ranked'&&typeof won==='boolean'?XP.awardRanked(current.ranked,input):null;
   const activeParticipation=row.activeParticipation??(stats.shots>0||stats.damage>0||events.dashes>0);
   const record={schema:1,authority:'server-multiplayer',matchId:id,participantId:userId,mapId:result.mapId||null,mapVersion:result.mapVersion||null,mapSelection:clone(result.mapSelection||null),mode,sessionType:session,kind,eligible,xpEligible,ltmDefinition:clone(result.ltmDefinition||null),practice:!!result.practice,at,won,teamOutcome,stats,events,input,xp:xp?.receipt||null,rating:rating?.receipt||null,weaponStats:clone(row.weaponStats||{}),meta:clone(row.meta||{}),balance:clone(result.balance||null),aiRevision:result.aiRevision||null,rulesetRevision:result.rulesetRevision||null,...(result.modeRulesRevision?{modeRulesRevision:result.modeRulesRevision}:{}),distanceProvenance:clone(result.distanceProvenance||null),metaDistanceProvenance:MapPools.metaProvenance(result.distanceProvenance,result.metaDistanceProvenance||result.distanceProvenance),abandoned,completed:!abandoned,activeParticipation:!!activeParticipation,...(typeof row.primary==='string'?{primary:row.primary}:{}),...(typeof row.sidearm==='string'?{sidearm:row.sidearm}:{})};
   const latest=db.prepare('SELECT MAX(applied_at) AS at FROM mp_results WHERE user_id=?').get(userId).at||0,appliedAt=Math.max(at,latest+1);
   db.prepare('INSERT INTO mp_results(match_id,user_id,result_json,applied_at) VALUES(?,?,?,?) ON CONFLICT(match_id,user_id) DO UPDATE SET result_json=excluded.result_json,applied_at=excluded.applied_at WHERE mp_results.applied_at=0').run(id,userId,JSON.stringify(record),appliedAt);
   require('./factions.cjs').recordResult(db,{...record,debug:!!result.debug,replay:!!result.replay});
   outputs.push({participantId:userId,applied:true,xp:record.xp,rating:record.rating});
  }
  require('./weapon-mastery.cjs').applyResult(db,result);
  db.exec('RELEASE mp_rewards');committed=true;
  // Completion credits are a separate existing immutable wallet transaction.
  // Retry this even for an already-applied stats row so a interrupted wallet
  // settlement cannot permanently lose or double-deliver the award.
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ac_wallets'").get()){
   const Wallet=require('./wallet.cjs');for(const userId of users){const record=JSON.parse(db.prepare('SELECT result_json FROM mp_results WHERE match_id=? AND user_id=?').get(id,userId).result_json);if(!record.eligible||!['standard','ranked'].includes(record.kind)||record.abandoned||!record.activeParticipation)continue;
    Wallet.settleVerifiedMatch(db,userId,id,{...record.input,authority:'server-multiplayer',participantType:'human',completed:!record.abandoned,activeParticipation:record.activeParticipation},require('./competitive-progression.cjs').environmentFor(db));
   }
  }
  return outputs;
 }catch(error){if(!committed){db.exec('ROLLBACK TO mp_rewards');db.exec('RELEASE mp_rewards');}throw error;}
}
function ownHumanRows(world,userId){return Object.fromEntries(Object.entries(world?.rankedResults||{}).filter(([,result])=>Array.isArray(result?.rows)&&result.rows.some(row=>row.type==='human'&&row.participantId===userId)));}
function emptyValue(value,depth=0){if(depth>80)return false;return value==null||value===0||value===false||value===''||Array.isArray(value)&&value.length===0||typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(child=>emptyValue(child,depth+1));}
function sameCareerWithEmptyAdditions(next,before,depth=0){
 if(depth>80)return false;
 if(isDeepStrictEqual(next,before))return true;
 if(!next||!before||typeof next!=='object'||typeof before!=='object'||Array.isArray(next)||Array.isArray(before))return false;
 for(const key of Object.keys(before))if(!Object.hasOwn(next,key)||!sameCareerWithEmptyAdditions(next[key],before[key],depth+1))return false;
 return Object.keys(next).filter(key=>!Object.hasOwn(before,key)).every(key=>emptyValue(next[key]));
}
function hasHumanHistory(world){
 const progress=world?.progression;if((progress?.totalXPUnits||0)>0||(progress?.currentLevel||1)>1||Object.keys(progress?.awards||{}).length||(progress?.usedWeapons||[]).length)return true;
 const measured=career=>!!career&&(KEYS.concat(['games','wins','losses','draws','bestKills','bestDamage','bestStreak','currentStreak','currentWinStreak','bestWinStreak']).some(key=>(career[key]||0)>0)||(career.recentMatches||[]).length||Object.values(career.weapons||{}).some(row=>Object.values(row).some(value=>typeof value==='number'&&value!==0)));
 if(measured(world?.playerCareer)||XP.STANDARD_MODES.some(mode=>mode!=='tdm'&&measured(world?.modeStats?.[mode]?.player)))return true;
 if([world?.playerSeasons?.current,...(world?.playerSeasons?.history||[])].filter(Boolean).some(season=>measured(season.stats)))return true;
 // Fresh competitive progression has no receipts and uses the shared ladder's
 // starting rating. Bot MMR is a separate historical field, never a rank seed.
 const startingRating=XP.rankView(0).ratingUnits;
 return Object.keys(world?.rankedResults||{}).length>0||Object.values(world?.ranked?.participants||{}).some(p=>(p.ratingUnits||0)!==startingRating||(p.winStreak||0)>0||Object.keys(p.awards||{}).length>0);
}
function humanMeasurements(patch){
 const result={},walk=(value,path=[])=>{if(path.length>80)return;if(typeof value==='number'){if(value!==0)result[JSON.stringify(path)]=value;return;}if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))walk(child,[...path,key]);};
 const legacy=(sample,path)=>{for(const [name,guns]of Object.entries(sample?.perBot||{}))if(name.startsWith('@human:'))walk(guns,[...path,'perBot',name]);walk(sample?.skillStrata?.human,[...path,'skillStrata','human']);};
 legacy(patch,['patch']);for(const [revision,sample]of Object.entries(patch?.aiSamples||{}))legacy(sample,['ai',revision]);
 for(const [revision,sample]of Object.entries(patch?.participantAnalytics?.samples||{}))for(const mode of XP.STANDARD_MODES){
  const scope=sample?.[mode]?.human;if(!scope)continue;const path=['participants',revision,mode];walk(scope.completedMatches,[...path,'completedMatches']);walk(scope.meta,[...path,'meta']);walk(scope.skillStrata,[...path,'skillStrata']);
  for(const [id,actor]of Object.entries(scope.participants||{}))walk(actor.meta,[...path,'actors',id]);
 }
 return result;
}
function protectHumanMeasurements(submitted,previous){
 const oldPatches=new Map([...(previous.patchArchives||[]),previous.patchState].filter(Boolean).map(patch=>[patch.id,humanMeasurements(patch)]));
 for(const patch of [...(submitted.patchArchives||[]),submitted.patchState].filter(Boolean)){
  const measured=humanMeasurements(patch),before=oldPatches.get(patch.id)||{};if(!isDeepStrictEqual(measured,before))throw fail('Human weapon telemetry is resolved by the multiplayer server');oldPatches.delete(patch.id);
 }
 for(const measured of oldPatches.values())if(Object.keys(measured).length)throw fail('Historical human weapon telemetry cannot be removed');
}
function protectWorld(db,userId,submitted,previous){
 if(!submitted||typeof submitted!=='object'||Array.isArray(submitted))throw fail('A saved game world is required');
 require('./weapon-mastery.cjs').protectWorld(db,userId,submitted,previous?.save||previous||saveFor(db,userId));
 const oldSocial=previous?.save||previous||saveFor(db,userId)||{};for(const key of ['faction','factions','factionMembership'])if(submitted[key]!==undefined&&!isDeepStrictEqual(submitted[key],oldSocial[key]))throw fail('Faction membership is a read-only server ledger');
 const old=previous?.save||previous||saveFor(db,userId);let established=db.prepare('SELECT 1 FROM mp_progression_baselines WHERE user_id=?').get(userId);
 if(!established&&old){ensureBaseline(db,userId,old);established=true;}
 if(!established){
  if(submitted.humanMultiplayer!==undefined)throw fail('Human multiplayer records must originate at the server');
  if(process.env.SAR_REQUIRE_TRUSTED_HISTORY==='1'&&(hasHumanHistory(submitted)||[...(submitted.patchArchives||[]),submitted.patchState].filter(Boolean).some(patch=>Object.keys(humanMeasurements(patch)).length)))throw Object.assign(fail('Existing local progress is preserved on this PC. Importing competitive history requires a verified server migration; a new cloud account cannot submit its own rewards.'),{code:'TRUSTED_HISTORY_REQUIRED'});
  return submitted;
 }
 if(!old)throw fail('The authenticated historical world is unavailable');
 const pairs=[['XP',submitted.progression,old.progression],['player career',submitted.playerCareer,old.playerCareer],['player seasons',submitted.playerSeasons,old.playerSeasons],['Deathmatch career',submitted.modeStats?.deathmatch?.player,old.modeStats?.deathmatch?.player],['ranked rating',submitted.ranked?.participants?.[userId],old.ranked?.participants?.[userId]],['ranked results',ownHumanRows(submitted,userId),ownHumanRows(old,userId)]];
 for(const mode of XP.STANDARD_MODES.filter(mode=>!['tdm','deathmatch'].includes(mode))){const next=submitted.modeStats?.[mode]?.player,before=old.modeStats?.[mode]?.player;if(before===undefined?next!==undefined&&(next.name!==undefined&&next.name!=='YOU'||!emptyValue({...next,name:undefined})):!sameCareerWithEmptyAdditions(next,before))throw fail('Human '+mode+' career is resolved by the multiplayer server');}
 for(const [label,next,before]of pairs)if(!(label==='player career'||label==='Deathmatch career'?sameCareerWithEmptyAdditions(next,before):isDeepStrictEqual(next,before)))throw fail('Human '+label+' is resolved by the multiplayer server');
 protectHumanMeasurements(submitted,old);
 if(submitted.humanMultiplayer!==undefined&&!isDeepStrictEqual(submitted.humanMultiplayer,projection(db,userId))&&!isDeepStrictEqual(submitted.humanMultiplayer,old.humanMultiplayer))throw fail('Human multiplayer records are read-only server projections');
 return submitted;
}
module.exports={applyResult,projection,protectWorld,ensureBaseline};
