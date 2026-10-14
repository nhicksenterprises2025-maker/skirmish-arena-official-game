'use strict';
const MapPools=require('./map-pools.cjs'),XP=require('../progression.js');
// Network bot growth is derived once from unique authoritative match records.
// The legacy client background league remains a separate preserved source.
const clone=x=>JSON.parse(JSON.stringify(x)),cache=new WeakMap();
const COUNTERS=['kills','deaths','assists','damage','taken','shots','hits','headshots','timeAlive','timePlayed'];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const blank=name=>({name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0,timePlayed:0,weaponUsage:{}});
function addMetrics(target,source){for(const [key,value]of Object.entries(source||{}))if(key!=='name'&&typeof value==='number'&&Number.isFinite(value))target[key]=(target[key]||0)+value;}
function weapons(career,samples){career.weaponUsage??={};for(const [name,sample]of Object.entries(samples||{})){
 const target=career.weaponUsage[name]??={k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
 for(const key of ['k','d','picks','damage','shots','hits','headshots','equippedTime'])target[key]=(target[key]||0)+(Number(sample[key]??sample[key==='k'?'kills':key==='d'?'deaths':key])||0);
 if(sample.picks>0||sample.equippedTime>0)target.games=(target.games||0)+1;
 }}
function projection(db,ownerId){
 const world=db.prepare('SELECT revision,save_json FROM worlds WHERE user_id=?').get(ownerId);if(!world)return {schema:1,ownerId,bots:{},balanceMeta:{},pending:true};
 const stamp=db.prepare("SELECT count(*) AS n,max(updated_at) AS at FROM mp_matches WHERE status IN ('ended','finished','finalized')").get(),key=JSON.stringify([ownerId,world.revision,stamp.n,stamp.at]);let saved=cache.get(db);if(saved?.key===key)return clone(saved.value);
 const base=JSON.parse(world.save_json),bots={},byId=new Map(),balanceMeta={};
 for(const [name,raw]of Object.entries(base.bots||{})){
  if(!raw.profile?.id)continue;const bot={name,sourceBotId:raw.profile.id,profile:clone(raw.profile),career:clone(raw.career||blank(name)),deathmatchCareer:clone(base.modeStats?.deathmatch?.bots?.[name]||blank(name)),modeCareers:Object.fromEntries(XP.STANDARD_MODES.filter(mode=>!['tdm','deathmatch'].includes(mode)).map(mode=>[mode,clone(base.modeStats?.[mode]?.bots?.[name]||blank(name))])),familiarity:clone(raw.familiarity||{}),recentForm:raw.recentForm||0,recentMatches:clone(raw.recentMatches||[]),records:[],unverifiedFamiliarity:[],network:{career:blank(name),deathmatchCareer:blank(name),modeCareers:Object.fromEntries(XP.STANDARD_MODES.filter(mode=>!['tdm','deathmatch'].includes(mode)).map(mode=>[mode,blank(name)])),familiarity:{},form:{multiplier:1,offset:0},recentMatches:[]}};bots[name]=bot;byId.set(raw.profile.id,bot);
 }
 for(const stored of db.prepare("SELECT id,result_json FROM mp_matches WHERE status IN ('ended','finished','finalized') AND result_json IS NOT NULL ORDER BY updated_at,id").all()){
  const result=JSON.parse(stored.result_json);if(result.matchId!==stored.id||result.botOwnerId!==ownerId||!['standard','ltm'].includes(result.sessionType)||result.eligible!==true||result.practice||!XP.STANDARD_MODES.includes(result.mode))continue;
  const rows=(result.rows||[]).filter(row=>!row.userId&&row.sourceBotId&&(row.botOwnerId||result.botOwnerId)===ownerId);if(!rows.length)continue;const ids=new Set();
  const sourceMode=result.sessionType==='ltm'?'ltm:'+result.ltmDefinition.id:result.mode;let sample=null;if(result.balance?.fingerprint){const distanceProvenance=MapPools.metaProvenance(result.distanceProvenance,result.metaDistanceProvenance||result.distanceProvenance),patch=balanceMeta[result.balance.fingerprint]??={balance:clone(result.balance),byMode:{}},mode=patch.byMode[sourceMode]??={cohorts:{}},revisionKey=JSON.stringify([result.aiRevision||null,result.rulesetRevision||null,distanceProvenance,...(result.modeRulesRevision?[result.modeRulesRevision]:[]),...(result.ltmDefinition?[result.ltmDefinition]:[])]);
   sample=mode.cohorts[revisionKey]??={...(result.modeRulesRevision?{modeRulesRevision:result.modeRulesRevision}:{}),...(result.ltmDefinition?{ltmDefinition:clone(result.ltmDefinition)}:{}),aiRevision:result.aiRevision||null,rulesetRevision:result.rulesetRevision||null,distanceProvenance,completedMatches:0,meta:{},perBot:{},skillStrata:{}};sample.completedMatches++;Object.assign(mode,{currentRevisionKey:revisionKey,completedMatches:sample.completedMatches,meta:sample.meta,perBot:sample.perBot,skillStrata:sample.skillStrata,aiRevision:sample.aiRevision,rulesetRevision:sample.rulesetRevision,distanceProvenance:sample.distanceProvenance});
  }
  for(const row of rows){if(ids.has(row.sourceBotId))throw Error('Duplicate authoritative bot participation');ids.add(row.sourceBotId);const bot=byId.get(row.sourceBotId);if(!bot)throw Error('Authoritative bot result does not belong to the persistent roster');
   const stats=row.stats||row,career=result.sessionType==='ltm'?(bot.modeCareers[sourceMode]??=blank(bot.name)):result.mode==='tdm'?bot.career:result.mode==='deathmatch'?bot.deathmatchCareer:bot.modeCareers[result.mode],won=row.won??result.rewards?.rows?.find(r=>r.participantId===row.sourceBotId)?.won??null;
   const delta=result.sessionType==='ltm'?(bot.network.modeCareers[sourceMode]??=blank(bot.name)):result.mode==='tdm'?bot.network.career:result.mode==='deathmatch'?bot.network.deathmatchCareer:bot.network.modeCareers[result.mode];
   for(const target of [career,delta]){target.games=(target.games||0)+1;const outcome=won===true?'wins':won===false?'losses':'draws';target[outcome]=(target[outcome]||0)+1;for(const key of COUNTERS)target[key]=(target[key]||0)+(Number(stats[key])||0);weapons(target,row.weaponStats);}
   for(const [weapon,after]of Object.entries(row.familiarity?.after||{})){
    const before=row.familiarity.before?.[weapon];if(!Number.isFinite(before)||!Number.isFinite(after)||before<0||before>100||after<before||after>100)throw Error('Invalid authoritative bot learning measurement');
    const learnedFraction=before===100?0:clamp((after-before)/(100-before),0,1),current=clamp(Number(bot.familiarity[weapon])||0,0,100),prior=bot.network.familiarity[weapon]||0;bot.familiarity[weapon]=clamp(current+(100-current)*learnedFraction,0,100);bot.network.familiarity[weapon]=clamp(prior+(1-prior)*learnedFraction,0,1);
   }
   if(!row.familiarity)bot.unverifiedFamiliarity.push(stored.id);
   const record={matchId:stored.id,mapId:result.mapId||null,mapVersion:result.mapVersion||null,mode:result.mode,sessionType:result.sessionType,eligible:true,at:result.endedAtWall||result.rewards?.at||0,won,...Object.fromEntries(COUNTERS.map(key=>[key,Number(stats[key])||0])),weapons:clone(row.weaponStats||{}),patchId:result.balance?.id||null,...(result.modeRulesRevision?{modeRulesRevision:result.modeRulesRevision}:{}),...(result.ltmDefinition?{ltmDefinition:clone(result.ltmDefinition)}:{}),aiRevision:result.aiRevision||null,primary:Object.entries(row.weaponStats||{}).sort((a,b)=>(b[1].equippedTime||0)-(a[1].equippedTime||0))[0]?.[0]||null};
   bot.records.push(record);if(result.mode==='tdm'&&result.sessionType==='standard'){const momentum=clamp((stats.kills-stats.deaths)/Math.max(3,stats.kills+stats.deaths)*8+(won===true?2:-2),-10,10);bot.recentForm=clamp(bot.recentForm*.76+momentum*.24,-10,10);bot.network.form.multiplier*=.76;bot.network.form.offset=bot.network.form.offset*.76+momentum*.24;bot.recentMatches.push(clone(record));bot.network.recentMatches.push(clone(record));}
   if(sample){const identity=sample.perBot[bot.name]??={},band=String(Math.floor((bot.profile.power-20)/20)*20+20),strata=sample.skillStrata[band]??={};for(const [weapon,raw]of Object.entries(row.meta||{})){addMetrics(sample.meta[weapon]??={name:weapon},raw);addMetrics(identity[weapon]??={name:weapon},raw);addMetrics(strata[weapon]??={name:weapon},raw);}}
  }
 }
 for(const bot of Object.values(bots)){bot.records=bot.records.slice(-30);bot.recentMatches=bot.recentMatches.slice(-20);bot.network.recentMatches=bot.network.recentMatches.slice(-20);bot.unverifiedFamiliarity=bot.unverifiedFamiliarity.slice(-30);}
 const value={schema:1,authoritative:true,ownerId,bots,balanceMeta,policy:{source:'unique server-resolved casual matches',customExcluded:true,officialExcluded:true,legacyWorldPreserved:true}};cache.set(db,{key,value});return clone(value);
}
function applyToWorld(db,ownerId,save){
 const projected=projection(db,ownerId),world=clone(save);if(projected.pending)return world;
 for(const [name,bot]of Object.entries(projected.bots)){const original=world.bots?.[name];if(!original||original.profile.id!==bot.sourceBotId)continue;Object.assign(original,{career:clone(bot.career),familiarity:clone(bot.familiarity),recentForm:bot.recentForm,recentMatches:clone(bot.recentMatches)});if(world.modeStats?.deathmatch?.bots)world.modeStats.deathmatch.bots[name]=clone(bot.deathmatchCareer);for(const [mode,career]of Object.entries(bot.modeCareers))if(world.modeStats?.[mode]?.bots)world.modeStats[mode].bots[name]=clone(career);}
 const patch=projected.balanceMeta[world.patchState?.fingerprint];if(patch){for(const mode of ['tdm','deathmatch']){const data=patch.byMode[mode],revision=world.aiRevision,target=world.patchState.participantAnalytics?.samples?.[revision]?.[mode]?.bot,cohort=Object.values(data?.cohorts||{}).find(c=>c.aiRevision===revision&&c.rulesetRevision===world.patchState?.rulesetRevision&&JSON.stringify(c.distanceProvenance??null)===JSON.stringify(target?.distanceProvenance??null));if(!cohort||!target)continue;
  target.completedMatches+=cohort.completedMatches;for(const [weapon,raw]of Object.entries(cohort.meta))addMetrics(target.meta[weapon]??={name:weapon},raw);for(const [band,guns]of Object.entries(cohort.skillStrata)){target.skillStrata[band]??={};for(const [weapon,raw]of Object.entries(guns))addMetrics(target.skillStrata[band][weapon]??={name:weapon},raw);}target.participants??={};for(const [name,guns]of Object.entries(cohort.perBot)){const id=world.bots[name]?.profile?.id;if(!id)continue;const actor=target.participants[id]??={participantId:id,type:'bot',meta:{}};for(const [weapon,raw]of Object.entries(guns))addMetrics(actor.meta[weapon]??={name:weapon},raw);}
 }}return world;
}
module.exports={projection,applyToWorld};
