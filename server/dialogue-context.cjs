'use strict';
// Read-only public facts: the same engine queries used by the existing tabs.
const weapons=require('./weapon-dialogue.cjs'),XP=require('../progression.js'),modes=require('../match-modes.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const normalize=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function mentions(text,name){
  const aliases={'Pump Shotgun':['pump'],'LW Tundra':['tundra'],'War Head LMG':['lmg','warhead'],'SR-Aug':['aug']};
  const source=' '+normalize(text)+' ',candidates=[name,...aliases[name]||[]];
  return candidates.some(term=>source.includes(' '+normalize(term)+' ')||source.replace(/ /g,'').includes(normalize(term).replace(/ /g,'')));
}
function queryIntent(event={}){
  const text=String(event.playerReply||event.text||'').toLowerCase(),cohort=/\b(?:human|player)\s+(?:weapon\s+)?meta\b/.test(text)?'human':'bot',mode=/deathmatch|\bffa\b/.test(text)&&!/team deathmatch/.test(text)?'deathmatch':'tdm';
  let kind=/\belo\b/.test(text)?'ranked':/bot leader\s?board|leader\s?board.*(?:tdm|k\s*\/\s*d)/.test(text)?'leaderboard':/\branked\b/.test(text)?'ranked':/leaderboard|leader board/.test(text)?'leaderboard':/\b(?:rank|ranking|place|position)\b/.test(text)&&/\b(?:you|your)\b/.test(text)?'ambiguous-rank':/\bmeta\b|gun score/.test(text)?'weapon-meta':'general';
  const sortMetric=/sorted? (?:by|on) (?:wins|victories)/.test(text)?'wins':/sorted? (?:by|on) kills/.test(text)?'kills':/sorted? (?:by|on) damage/.test(text)?'damage':/sorted? (?:by|on) accuracy/.test(text)?'accuracy':/sorted? (?:by|on) power/.test(text)?'power':'kd';
  const allModes=/\b(?:all|every|combined)\s+(?:(?:eligible|game|available)\s+)?modes\b|\ball-modes\b/.test(text),unsupportedLeaderboardMode=kind==='leaderboard'&&(mode==='deathmatch'||allModes);
  return {kind,mode,cohort,sortMetric,sortDirection:/ascending|lowest first/.test(text)?1:-1,...(unsupportedLeaderboardMode?{requestedMode:allModes?'all modes':'deathmatch',unavailableReason:'The public Bot Leaderboard is lifetime eligible TDM (including Ranked); there is no all-modes aggregate or Deathmatch leaderboard. Ask whether this TDM leaderboard is intended.'}:{})};
}
function measured(stats,aliases=false){const kills=stats?.[aliases?'k':'kills'],deaths=stats?.[aliases?'d':'deaths'];return {kills:Number.isFinite(kills)?kills:null,deaths:Number.isFinite(deaths)?deaths:null,kd:Number.isFinite(kills)&&deaths>0?kills/deaths:null,winRate:null,winRateReason:'Kill/death counts do not provide wins or losses'};}
function shotTime(w,index){const count=w.burstCount||1;return Math.floor(index/count)*w.hitSpeed+(index%count)*(w.burstSpacing||0);}
function ttk(w,damage){const index=Math.ceil(250/damage)-1,reloads=Math.floor(index/w.mag);return reloads*(shotTime(w,w.mag-1)+w.reload)+shotTime(w,index%w.mag);}
function publishedNumericChanges(note,registry){
  // Parse the numeric before/after notation already published by the game.
  // Field labels are generic; weapons and values remain entirely data-driven.
  const fields={'body damage':'damage','combined body damage':'damage','headshot damage':'head','combined headshot damage':'head','projectile speed':'speed','firing interval':'hitSpeed','burst cycle':'hitSpeed','reload':'reload','magazine':'mag','reserve':'reserve','hip fire spread':'spread','hip spread':'spread','walk hip spread':'walkSpread','hip walk spread':'walkSpread','sprint hip spread':'sprintSpread','ads spread':'adsSpread','preferred range':'preferred'};
  return (note?.changes||[]).flatMap(entry=>(entry.items||[]).flatMap(text=>{
    const match=/^([^:]+):\s*(\d+(?:\.\d+)?)(?:[a-z°/%]+)?\s*(?:→|->)\s*(\d+(?:\.\d+)?)/i.exec(text),field=match&&fields[match[1].trim().toLowerCase()];
    if(!field||!registry[entry.weapon]||Number(match[3])!==registry[entry.weapon][field])return [];
    return [{weapon:entry.weapon,field,before:Number(match[2]),after:Number(match[3]),source:'published active balance notes'}];
  }));
}
function publicFacts(world,id,event={},now=Date.now()){
  const entry=Object.entries(world.bots||{}).find(([,bot])=>bot.profile?.id===id);
  if(!entry||!world.activeBotNames?.includes(entry[0]))throw Error('Selected stable bot identity is unavailable');
  const [name,bot]=entry,query=queryIntent(event),current=world.patchState,definitions=weapons.registry(),rows=weapons.publicQueries(world,{...query,sort:{key:query.sortMetric,dir:query.sortDirection}}),index=rows.leaderboard.findIndex(row=>row.name===name);
  const scope={retrievedAt:now,worldUpdatedAt:world.updatedAt||null,patchId:current.id,rulesetRevision:current.rulesetRevision||null,aiRevision:world.aiRevision||null,mode:query.mode,cohort:query.cohort,sortMetric:query.kind==='weapon-meta'?'score':query.sortMetric,source:'last accepted local world',freshness:'Latest persisted snapshot; unsaved live combat is not queried'};
  const weaponRegistry=Object.entries(current.weaponStats||{}).map(([weapon,stats])=>({name:weapon,type:stats.type,role:definitions[weapon]?.role||stats.role||null}));
  const terms=event.playerReply||event.weapon||event.mockContext?.weapon||JSON.stringify(event.changes||[]),relevant=weaponRegistry.filter(w=>mentions(terms,w.name)).map(w=>w.name);
  if(!relevant.length&&current.weaponStats[bot.profile.personality?.favoriteWeapon])relevant.push(bot.profile.personality.favoriteWeapon);
  if(query.kind==='weapon-meta')for(const row of rows.meta.slice(0,3))if(!relevant.includes(row.name))relevant.push(row.name);
  const sample=rows.sample,metaScope={...scope,sortMetric:'score',completedMatches:sample?.completedMatches??0,available:!!sample,rankMethod:'Current Weapon Meta Gun Score, separate primary/sidearm categories; at least five kills/deaths to rank'};
  const selectedWeapons=relevant.slice(0,4).map(weapon=>{
    const stats=current.weaponStats[weapon],r=rows.meta.find(row=>row.name===weapon),m=sample?.meta?.[weapon]||{},personal=sample?.participants?.[id]?.meta?.[weapon],p=personal?{k:personal.kills,d:personal.deaths,...personal}:{},categoryRows=rows.meta.filter(row=>current.weaponStats[row.name]?.type===stats.type&&row.engagements>=5),position=categoryRows.findIndex(row=>row.name===weapon);
    return {name:weapon,role:weaponRegistry.find(w=>w.name===weapon).role,stats:copy(stats),scope:metaScope,mechanics:{maxHP:250,fireIntervalSeconds:stats.hitSpeed,roundsPerMinute:60*(stats.burstCount||1)/stats.hitSpeed,roundsPerBurst:stats.burstCount||1,intraBurstSeconds:stats.burstSpacing||0,projectileSpeedTilesPerSecond:stats.speed,projectileSpeedWorldUnitsPerSecond:stats.speed*70,headshotRequiredForKill:false,oneBodyHitRemainingHP:Math.max(0,250-stats.damage),twoBodyHitsDamage:stats.damage*2,remainingHPAfterTwoBodyHits:Math.max(0,250-stats.damage*2),bodyHits:Math.ceil(250/stats.damage),headHits:Math.ceil(250/stats.head),bodyTTK:ttk(stats,stats.damage),headTTK:ttk(stats,stats.head),preferredTiles:stats.preferred/70,...(weapon==='P90'?{designedRangeTiles:[7,12]}:{})},familiarity:bot.familiarity?.[weapon]??0,currentPatchPersonal:copy(p),currentPatchGlobal:copy(m),computedTelemetry:{personal:measured(p,true),global:measured(m)},category:stats.type,categoryRank:position<0?null:position+1,gunScore:r?.engagements>=5?r.score:null,confidence:r?.confidence??null,rankMethod:metaScope.rankMethod,sampleMatches:sample?.completedMatches??0};
  });
  const participant=world.ranked?.participants?.[id],view=XP.rankView(participant?.ratingUnits||0),receipts=Object.entries(participant?.awards||{}).filter(([,r])=>r.participantId===id).map(([matchId,r])=>({...r,matchId})).sort((a,b)=>(b.at||0)-(a.at||0));
  const ranked={available:true,participantId:id,...view,winStreak:participant?.winStreak||0,games:receipts.length,recentResults:receipts.slice(0,3).map(r=>({matchId:r.matchId,at:r.at,won:r.won,calculatedElo:r.calculatedUnits/100,appliedElo:r.appliedUnits/100,ratingAfter:r.afterUnits/100,rankAfter:XP.rankView(r.afterUnits).rankName})),scope:{...scope,mode:'ranked-tdm',cohort:'bot',sortMetric:null,rulesVersion:1},unplayed:!receipts.length};
  const row=rows.leaderboard[index],leaderboard={available:index>=0&&!query.unavailableReason,position:query.unavailableReason?null:index+1,total:query.unavailableReason?null:rows.leaderboard.length,sortMetric:query.sortMetric,sortDirection:query.sortDirection===1?'ascending':'descending',mode:'tdm (standard and ranked)',cohort:'bot',period:'lifetime',metricValue:row&&!query.unavailableReason?(query.sortMetric==='kd'?(row.deaths?row.kills/row.deaths:row.kills?'infinite':0):row[query.sortMetric]):null,scope:{...scope,mode:'tdm (standard and ranked)',cohort:'bot'},...(query.unavailableReason?{unavailableReason:query.unavailableReason}:{})};
  const change=world.balancePatchHistory?.filter(p=>p.to===current.id||p.to===current.fingerprint).at(-1);
  const publishedNotes=weapons.balanceNotes().find(note=>note.version===current.label)||null;
  const numericChanges=copy(change?.changes||[]);for(const item of publishedNumericChanges(publishedNotes,current.weaponStats))if(!numericChanges.some(saved=>saved.weapon===item.weapon&&saved.field===item.field))numericChanges.push(item);
  return {identity:{botId:id,name},scope,query,leaderboard,ranked,weaponRegistry,weapons:selectedWeapons,weaponMeta:{scope:metaScope,rows:rows.meta.filter(r=>r.engagements>=5).slice(0,6).map(r=>({name:r.name,score:r.score,category:current.weaponStats[r.name]?.type,kills:r.kills,deaths:r.deaths,accuracy:r.accuracy,usage:r.usage,confidence:r.confidence}))},modes:copy(modes.list()),activeBalanceChanges:{to:current.id,changes:numericChanges,publishedNotes,...(change?{from:change.from,at:change.at}:{migrationDiffUnavailable:true}),...(!publishedNotes&&!change?{unavailableReason:'No recorded changes for this patch'}:{})}};
}
module.exports={publicFacts,queryIntent,mentions};
