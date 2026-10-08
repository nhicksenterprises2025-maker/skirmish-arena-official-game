(function(root){
 'use strict';
 // Hundredths preserve every supplied reward and the final 13/10 multiplier.
 // totalXPUnits is the single XP balance; all displayed XP is derived from it.
 const SCALE=100,MAX_LEVEL=50,requirements=Object.freeze([100,110,125,150,175,225,275,325,400,475,550,625,700,800,900,1000,1250,1500,1750,2000,2250,2500,2750,3000,3300,3600,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500,9000,9500,10000,10750,11500,12250,13000,14500,16000,17500,19000,21000,23000,25000]);
 const XP_RULES_VERSION=2,RANKED_RULES_VERSION=1;
 const ranks=Object.freeze([['Beginner I',0],['Beginner II',100],['Beginner III',200],['Rookie I',350],['Rookie II',500],['Rookie III',650],['Trainer I',850],['Trainer II',1050],['Trainer III',1250],['Challenger I',1500],['Challenger II',1750],['Challenger III',2000],['Veteran I',2350],['Veteran II',2700],['Veteran III',3000],['Elite Veteran I',3400],['Elite Veteran II',3800],['Pro I',4250],['Pro II',4700],['Master I',5200],['Master II',5700],['Grandmaster I',6300],['Grandmaster II',6900],['Champion',7750],['Legend',8750],['Ascendant',10000]].map(([name,threshold])=>Object.freeze({name,threshold,thresholdUnits:threshold*SCALE})));
 const integer=n=>Number.isSafeInteger(n)&&n>=0,clone=x=>JSON.parse(JSON.stringify(x)),record=x=>!!x&&typeof x==='object'&&!Array.isArray(x),identity=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!['__proto__','constructor','prototype'].includes(id);
 const transactionKey=(participantId,matchId,track)=>JSON.stringify([participantId,matchId,track]);
 function validateAccuracy(stats){if(stats?.shots===undefined&&stats?.hits===undefined)return;if(!integer(stats?.shots)||!integer(stats?.hits)||stats.hits>stats.shots)throw Error('Invalid resolved match accuracy');}
 function view(units){if(!integer(units))throw Error('Invalid XP balance');let level=1,current=units;while(level<MAX_LEVEL&&current>=requirements[level-1]*SCALE){current-=requirements[level-1]*SCALE;level++;}return {currentLevel:level,totalXP:units/SCALE,currentXP:current/SCALE,requiredXP:level===MAX_LEVEL?null:requirements[level-1],remainingXP:level===MAX_LEVEL?0:requirements[level-1]-current/SCALE,progress:level===MAX_LEVEL?1:current/(requirements[level-1]*SCALE),maxLevel:level===MAX_LEVEL};}
 function legacyWeapons(world){return [...new Set([world?.playerCareer?.weapons,world?.modeStats?.deathmatch?.player?.weapons].flatMap(rows=>Object.entries(rows||{}).filter(([,r])=>r.shots>0).map(([name])=>name)))].sort();}
 function normalize(raw,world){if(!raw)return {version:1,totalXPUnits:0,currentLevel:1,usedWeapons:legacyWeapons(world),awards:{}};if(raw.version!==1||!integer(raw.totalXPUnits)||!Array.isArray(raw.usedWeapons)||!raw.awards||Array.isArray(raw.awards))throw Error('Unsupported account progression');const p=clone(raw);p.currentLevel=view(p.totalXPUnits).currentLevel;return p;}
 function eligibility(match){if(!match||match.practice)return null;/* Tournament eligible=false excludes ordinary statistics, not its authorized XP. */if(match.sessionType==='tournament'&&match.context?.tournamentKind==='official'&&match.context.tournamentId)return 'official';if(match.eligible===false)return null;if(match.sessionType==='standard'&&['tdm','deathmatch'].includes(match.mode))return 'standard';if(match.sessionType==='ranked'&&match.mode==='tdm'&&match.eligible===true)return 'ranked';return null;}
 function events(){return {soloKills:0,finishingKills:0,dashes:0,bestStreak:0,usedWeapons:[]};}
 function breakdown(r){
  const lines=[],s=r.stats,e=r.events,add=(key,label,units)=>{if(units)lines.push({key,label,units});},tier=(key,value,tiers)=>{for(const [threshold,xp,label]of tiers)if(value>=threshold){add(key,label,xp*SCALE);break;}};
  add('solo','Solo Kills',e.soloKills*300);add('finisher','Finishing Kills',e.finishingKills*100);add('assist','Assisted Kills',s.assists*50);add('dash','Dashes',e.dashes*20);add('death','Deaths',s.deaths*50);
  for(const name of r.firstWeapons)add('weapon:'+name,'First use · '+name,2500);
  tier('combo',Math.min(s.kills,s.assists),[[10,50,'10 Kills + 10 Assists'],[5,15,'5 Kills + 5 Assists']]);
  tier('kd',s.kills/Math.max(1,s.deaths),[[2,60,'2.0 K/D'],[1.5,25,'1.5 K/D']]);
  tier('headshots',s.headshots,[[10,10,'10 Headshots']]);tier('damage',s.damage,[...((r.rulesVersion||1)>=2?[[5000,100,'5K Damage']]:[]),[4000,70,'4K Damage'],[3000,35,'3K Damage'],[2000,15,'2K Damage']]);
  tier('kills',s.kills,[[20,50,'20 Kills'],[15,30,'15 Kills'],[10,20,'10 Kills']]);tier('killStreak',e.bestStreak,[[10,25,'10-Kill Streak'],[5,15,'5-Kill Streak'],[3,10,'3-Kill Streak']]);
  if(['standard','ranked'].includes(r.kind)&&r.won&&[3,5].includes(r.winStreak))add('winStreak',r.winStreak+'-Game Win Streak',r.winStreak===5?2500:1000);
  if(r.leaders.kills)add('killLeader','Kill Leader',2500);if(r.leaders.assists)add('assistLeader','Assist Leader',500);if(r.leaders.alive)add('aliveLeader','Most Time Alive',1000);
  add('result',r.won?'Win':r.won===false?'Loss':'Draw',r.won?500:r.won===false?250:0);return lines;
 }
 function totals(receipt){const baseUnits=breakdown(receipt).reduce((sum,l)=>sum+l.units,0);if(!integer(baseUnits))throw Error('XP exceeds exact storage range');const units=receipt.kind==='official'?Number((BigInt(baseUnits)*13n+5n)/10n):baseUnits;if(!integer(units))throw Error('XP exceeds exact storage range');return {baseUnits,units};}
 function award(p,input){
  if(!['standard','official','ranked'].includes(input.kind)||!identity(input.matchId)||input.practice||input.eligible===false)return null;
  if(input.sessionType&&input.sessionType!==({standard:'standard',official:'tournament',ranked:'ranked'}[input.kind]))return null;
  if(input.kind==='ranked'&&(input.mode!=='tdm'||input.eligible!==true||input.sessionType!=='ranked'))return null;
  if(Object.hasOwn(p.awards,input.matchId))return {receipt:p.awards[input.matchId],applied:false};
  const firstWeapons=[...new Set(input.events.usedWeapons)].filter(w=>!p.usedWeapons.includes(w)).sort(),before=p.totalXPUnits;
  const receipt={...clone(input),rulesVersion:XP_RULES_VERSION,sessionType:input.sessionType||({standard:'standard',official:'tournament',ranked:'ranked'}[input.kind]),eligible:true,practice:false,firstWeapons,beforeUnits:before};delete receipt.matchId;
  if(input.participantId!==undefined){if(!identity(input.participantId))throw Error('Invalid XP participant identity');receipt.track='xp';receipt.transactionKey=transactionKey(input.participantId,input.matchId,'xp');}
  Object.assign(receipt,totals(receipt));
  if(!integer(before+receipt.units))throw Error('XP exceeds exact storage range');
  p.awards[input.matchId]=receipt;p.totalXPUnits+=receipt.units;p.currentLevel=view(p.totalXPUnits).currentLevel;p.usedWeapons=[...new Set([...p.usedWeapons,...firstWeapons])].sort();
  return {receipt,applied:true};
 }
 function validate(p,old){
  if(!p){if(old)throw Error('Account XP was removed');return;}
  if(p.version!==1||!integer(p.totalXPUnits)||view(p.totalXPUnits).currentLevel!==p.currentLevel||!Array.isArray(p.usedWeapons)||new Set(p.usedWeapons).size!==p.usedWeapons.length||!p.awards||Array.isArray(p.awards))throw Error('Invalid account progression');
  if(old){if(p.totalXPUnits<old.totalXPUnits||old.usedWeapons.some(w=>!p.usedWeapons.includes(w)))throw Error('Account progression moved backwards');for(const [id,r]of Object.entries(old.awards))if(JSON.stringify(r)!==JSON.stringify(p.awards[id]))throw Error('Applied XP transaction changed');}
  let sum=0;const discoveries=new Set();for(const [id,r]of Object.entries(p.awards)){
   if(!identity(id)||!['standard','official','ranked'].includes(r.kind)||!['tdm','deathmatch'].includes(r.mode)||!Number.isFinite(r.at)||r.at<=0||![true,false,null].includes(r.won)||!integer(r.winStreak)||!integer(r.beforeUnits)||![1,2].includes(r.rulesVersion||1))throw Error('Invalid XP transaction');
   if(r.rulesVersion===2&&(r.sessionType!==({standard:'standard',official:'tournament',ranked:'ranked'}[r.kind])||r.eligible!==true||r.practice!==false||r.kind==='ranked'&&r.mode!=='tdm'))throw Error('Invalid XP eligibility');
   if(r.participantId!==undefined&&(!identity(r.participantId)||r.track!=='xp'||r.transactionKey!==transactionKey(r.participantId,id,'xp')))throw Error('Invalid XP transaction identity');
   for(const key of ['kills','deaths','assists','headshots'])if(!integer(r.stats?.[key]))throw Error('Invalid XP match statistics');for(const key of ['damage','timeAlive'])if(!Number.isFinite(r.stats?.[key])||r.stats[key]<0)throw Error('Invalid XP match measurements');validateAccuracy(r.stats);
   for(const key of ['soloKills','finishingKills','dashes','bestStreak'])if(!integer(r.events?.[key]))throw Error('Invalid XP event count');
   if(r.events.soloKills+r.events.finishingKills>r.stats.kills||r.events.bestStreak>r.stats.kills||r.stats.headshots>r.stats.kills||!Array.isArray(r.events.usedWeapons)||new Set(r.events.usedWeapons).size!==r.events.usedWeapons.length||!Array.isArray(r.firstWeapons)||new Set(r.firstWeapons).size!==r.firstWeapons.length)throw Error('XP event counters conflict');
   for(const key of ['kills','assists','alive'])if(typeof r.leaders?.[key]!=='boolean')throw Error('Invalid XP leader result');
   for(const w of r.firstWeapons){if(typeof w!=='string'||!r.events.usedWeapons.includes(w)||!p.usedWeapons.includes(w)||discoveries.has(w))throw Error('Weapon discovery was duplicated');discoveries.add(w);}
   const expected=totals(r);if(expected.units!==r.units||expected.baseUnits!==r.baseUnits||r.beforeUnits!==sum)throw Error('XP transaction does not reconcile');sum+=r.units;
  }if(sum!==p.totalXPUnits)throw Error('XP balance does not reconcile');
 }
 function rankView(units){
  if(!integer(units))throw Error('Invalid ranked rating');let index=0;while(index+1<ranks.length&&units>=ranks[index+1].thresholdUnits)index++;
  const rank=ranks[index],next=ranks[index+1]||null;return {ratingUnits:units,rating:units/SCALE,rankIndex:index,rankName:rank.name,threshold:rank.threshold,nextRank:next?.name||null,nextThreshold:next?.threshold??null,remaining:next?(next.thresholdUnits-units)/SCALE:0,progress:next?(units-rank.thresholdUnits)/(next.thresholdUnits-rank.thresholdUnits):1,maxRank:!next};
 }
 function normalizeRanked(raw){if(raw===undefined||raw===null)return {version:1,participants:{}};if(raw.version!==1||!record(raw.participants))throw Error('Unsupported ranked progression');const result=clone(raw);validateRanked(result);return result;}
 function rankedBreakdown(r){
  // The ranked schedule is half the XP schedule except deaths and first use.
  // Ranked streaks come only from this ledger, never from casual career streaks.
  return breakdown({...r,kind:'ranked',rulesVersion:2,firstWeapons:[]}).filter(line=>line.key!=='result'||r.won===true).map(line=>({...line,units:line.key==='death'?-r.stats.deaths*25:line.units/2}));
 }
 function rankedTotals(r){
  if(typeof r.won!=='boolean')throw Error('Ranked result must resolve a win or loss');
  const lines=rankedBreakdown(r),performanceUnits=lines.filter(line=>line.key!=='result').reduce((sum,line)=>sum+line.units,0);
  if(!Number.isSafeInteger(performanceUnits))throw Error('Ranked performance exceeds exact storage range');
  // 0 or less net performance = -31; 100+ ELO performance = -19.
  // Deaths are already included here; they are never charged a second time.
  const lossStrength=Math.max(0,Math.min(10000,performanceUnits)),calculatedUnits=r.won?lines.reduce((sum,line)=>sum+line.units,0):-3100+Number((BigInt(lossStrength)*1200n+5000n)/10000n);
  if(!Number.isSafeInteger(calculatedUnits))throw Error('Ranked result exceeds exact storage range');
  return {performanceUnits,calculatedUnits};
 }
 function awardRanked(store,input){
  if(input.kind!=='ranked'||input.sessionType!=='ranked'||input.mode!=='tdm'||input.eligible!==true||input.practice)return null;
  if(!identity(input.participantId)||!identity(input.matchId))throw Error('Invalid ranked participant or match identity');
  if(typeof input.won!=='boolean')throw Error('Ranked result must resolve a win or loss');
  const previous=store.participants[input.participantId]||{ratingUnits:0,winStreak:0,awards:{}};
  if(Object.hasOwn(previous.awards,input.matchId))return {receipt:previous.awards[input.matchId],applied:false};
  const receipt={...clone(input),rulesVersion:RANKED_RULES_VERSION,track:'ranked',transactionKey:transactionKey(input.participantId,input.matchId,'ranked'),practice:false,beforeUnits:previous.ratingUnits,winStreakBefore:previous.winStreak,winStreak:input.won?previous.winStreak+1:0};delete receipt.matchId;
  Object.assign(receipt,rankedTotals(receipt));receipt.afterUnits=Math.max(0,receipt.beforeUnits+receipt.calculatedUnits);receipt.appliedUnits=receipt.afterUnits-receipt.beforeUnits;
  if(!integer(receipt.afterUnits)||!integer(receipt.winStreak))throw Error('Ranked progression exceeds exact storage range');
  validateRankedReceipt(input.participantId,input.matchId,receipt);
  previous.awards[input.matchId]=receipt;previous.ratingUnits=receipt.afterUnits;previous.winStreak=receipt.winStreak;store.participants[input.participantId]=previous;
  return {receipt,applied:true};
 }
 function validateRankedReceipt(participantId,matchId,r){
  if(!identity(participantId)||!identity(matchId)||r.participantId!==participantId||r.rulesVersion!==1||r.track!=='ranked'||r.transactionKey!==transactionKey(participantId,matchId,'ranked')||r.kind!=='ranked'||r.sessionType!=='ranked'||r.mode!=='tdm'||r.eligible!==true||r.practice!==false||typeof r.won!=='boolean'||!Number.isFinite(r.at)||r.at<=0||!integer(r.beforeUnits)||!integer(r.afterUnits)||!integer(r.winStreakBefore)||!integer(r.winStreak))throw Error('Invalid ranked transaction');
  for(const key of ['kills','deaths','assists','headshots'])if(!integer(r.stats?.[key]))throw Error('Invalid ranked match statistics');
  for(const key of ['damage','timeAlive'])if(!Number.isFinite(r.stats?.[key])||r.stats[key]<0)throw Error('Invalid ranked match measurements');validateAccuracy(r.stats);
  for(const key of ['soloKills','finishingKills','dashes','bestStreak'])if(!integer(r.events?.[key]))throw Error('Invalid ranked event count');
  if(r.events.soloKills+r.events.finishingKills>r.stats.kills||r.events.bestStreak>r.stats.kills||r.stats.headshots>r.stats.kills||!Array.isArray(r.events.usedWeapons)||new Set(r.events.usedWeapons).size!==r.events.usedWeapons.length)throw Error('Ranked event counters conflict');
  for(const key of ['kills','assists','alive'])if(typeof r.leaders?.[key]!=='boolean')throw Error('Invalid ranked leader result');
  const expected=rankedTotals(r);
  if(r.performanceUnits!==expected.performanceUnits||r.calculatedUnits!==expected.calculatedUnits||r.afterUnits!==Math.max(0,r.beforeUnits+r.calculatedUnits)||r.appliedUnits!==r.afterUnits-r.beforeUnits||r.winStreak!==(r.won?r.winStreakBefore+1:0))throw Error('Ranked transaction does not reconcile');
 }
 function validateRanked(store,old){
  if(!store){if(old)throw Error('Ranked progression was removed');return;}
  if(store.version!==1||!record(store.participants))throw Error('Invalid ranked progression');
  if(old)for(const id of Object.keys(old.participants))if(!Object.hasOwn(store.participants,id))throw Error('Ranked participant was removed');
  for(const [id,p]of Object.entries(store.participants)){
   if(!identity(id)||!integer(p.ratingUnits)||!integer(p.winStreak)||!record(p.awards))throw Error('Invalid ranked participant');
   const prior=old?.participants[id];if(prior)for(const [matchId,r]of Object.entries(prior.awards))if(JSON.stringify(r)!==JSON.stringify(p.awards[matchId]))throw Error('Applied ranked transaction changed');
   let rating=0,streak=0;for(const [matchId,r]of Object.entries(p.awards)){validateRankedReceipt(id,matchId,r);if(r.beforeUnits!==rating||r.winStreakBefore!==streak)throw Error('Ranked history does not reconcile');rating=r.afterUnits;streak=r.winStreak;}
   if(rating!==p.ratingUnits||streak!==p.winStreak)throw Error('Ranked balance does not reconcile');
  }
 }
 function summary(p,ranked,participantId){const account=p||normalize(null),rankedParticipant=ranked?.participants?.[participantId];return {xp:{...view(account.totalXPUnits),totalXPUnits:account.totalXPUnits},ranked:{...rankView(rankedParticipant?.ratingUnits||0),participantId:participantId||null,winStreak:rankedParticipant?.winStreak||0,games:Object.keys(rankedParticipant?.awards||{}).length}};}
 function rewardBreakdown(xpReceipt,rankedReceipt){return {xp:xpReceipt?{rulesVersion:xpReceipt.rulesVersion||1,lines:breakdown(xpReceipt),...totals(xpReceipt),multiplier:xpReceipt.kind==='official'?1.3:1}:null,ranked:rankedReceipt?{rulesVersion:rankedReceipt.rulesVersion,lines:rankedBreakdown(rankedReceipt),...rankedTotals(rankedReceipt),appliedUnits:rankedReceipt.appliedUnits,before:rankView(rankedReceipt.beforeUnits),after:rankView(rankedReceipt.afterUnits),lossBand:rankedReceipt.won?null:{minimum:-31,maximum:-19,performanceTarget:100}}:null};}
 const api={SCALE,MAX_LEVEL,XP_RULES_VERSION,RANKED_RULES_VERSION,requirements,ranks,view,normalize,legacyWeapons,eligibility,events,breakdown,totals,award,validate,transactionKey,rankView,normalizeRanked,rankedBreakdown,rankedTotals,awardRanked,validateRanked,summary,rewardBreakdown};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARProgression=api;
})(typeof window!=='undefined'?window:globalThis);
