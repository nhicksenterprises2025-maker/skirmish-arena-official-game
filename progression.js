(function(root){
 'use strict';
 // Hundredths preserve every supplied reward and the final 13/10 multiplier.
 // totalXPUnits is the single XP balance; all displayed XP is derived from it.
 const SCALE=100,MAX_LEVEL=50,requirements=Object.freeze([100,110,125,150,175,225,275,325,400,475,550,625,700,800,900,1000,1250,1500,1750,2000,2250,2500,2750,3000,3300,3600,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500,9000,9500,10000,10750,11500,12250,13000,14500,16000,17500,19000,21000,23000,25000]);
 const integer=n=>Number.isSafeInteger(n)&&n>=0,clone=x=>JSON.parse(JSON.stringify(x));
 function view(units){if(!integer(units))throw Error('Invalid XP balance');let level=1,current=units;while(level<MAX_LEVEL&&current>=requirements[level-1]*SCALE){current-=requirements[level-1]*SCALE;level++;}return {currentLevel:level,totalXP:units/SCALE,currentXP:current/SCALE,requiredXP:level===MAX_LEVEL?null:requirements[level-1],remainingXP:level===MAX_LEVEL?0:requirements[level-1]-current/SCALE,progress:level===MAX_LEVEL?1:current/(requirements[level-1]*SCALE),maxLevel:level===MAX_LEVEL};}
 function legacyWeapons(world){return [...new Set([world?.playerCareer?.weapons,world?.modeStats?.deathmatch?.player?.weapons].flatMap(rows=>Object.entries(rows||{}).filter(([,r])=>r.shots>0).map(([name])=>name)))].sort();}
 function normalize(raw,world){if(!raw)return {version:1,totalXPUnits:0,currentLevel:1,usedWeapons:legacyWeapons(world),awards:{}};if(raw.version!==1||!integer(raw.totalXPUnits)||!Array.isArray(raw.usedWeapons)||!raw.awards||Array.isArray(raw.awards))throw Error('Unsupported account progression');const p=clone(raw);p.currentLevel=view(p.totalXPUnits).currentLevel;return p;}
 function eligibility(match){if(!match||match.practice)return null;if(match.sessionType==='standard'&&['tdm','deathmatch'].includes(match.mode))return 'standard';if(match.sessionType==='tournament'&&match.context?.tournamentKind==='official'&&match.context.tournamentId)return 'official';return null;}
 function events(){return {soloKills:0,finishingKills:0,dashes:0,bestStreak:0,usedWeapons:[]};}
 function breakdown(r){
  const lines=[],s=r.stats,e=r.events,add=(key,label,units)=>{if(units)lines.push({key,label,units});},tier=(key,value,tiers)=>{for(const [threshold,xp,label]of tiers)if(value>=threshold){add(key,label,xp*SCALE);break;}};
  add('solo','Solo Kills',e.soloKills*300);add('finisher','Finishing Kills',e.finishingKills*100);add('assist','Assisted Kills',s.assists*50);add('dash','Dashes',e.dashes*20);add('death','Deaths',s.deaths*50);
  for(const name of r.firstWeapons)add('weapon:'+name,'First use · '+name,2500);
  tier('combo',Math.min(s.kills,s.assists),[[10,50,'10 Kills + 10 Assists'],[5,15,'5 Kills + 5 Assists']]);
  tier('kd',s.kills/Math.max(1,s.deaths),[[2,60,'2.0 K/D'],[1.5,25,'1.5 K/D']]);
  tier('headshots',s.headshots,[[10,10,'10 Headshots']]);tier('damage',s.damage,[[4000,70,'4K Damage'],[3000,35,'3K Damage'],[2000,15,'2K Damage']]);
  tier('kills',s.kills,[[20,50,'20 Kills'],[15,30,'15 Kills'],[10,20,'10 Kills']]);tier('killStreak',e.bestStreak,[[10,25,'10-Kill Streak'],[5,15,'5-Kill Streak'],[3,10,'3-Kill Streak']]);
  if(r.kind==='standard'&&r.won&&[3,5].includes(r.winStreak))add('winStreak',r.winStreak+'-Game Win Streak',r.winStreak===5?2500:1000);
  if(r.leaders.kills)add('killLeader','Kill Leader',2500);if(r.leaders.assists)add('assistLeader','Assist Leader',500);if(r.leaders.alive)add('aliveLeader','Most Time Alive',1000);
  add('result',r.won?'Win':r.won===false?'Loss':'Draw',r.won?500:r.won===false?250:0);return lines;
 }
 function totals(receipt){const baseUnits=breakdown(receipt).reduce((sum,l)=>sum+l.units,0),units=receipt.kind==='official'?baseUnits*13/10:baseUnits;if(!integer(baseUnits)||!integer(units))throw Error('XP exceeds exact storage range');return {baseUnits,units};}
 function award(p,input){
  if(!['standard','official'].includes(input.kind)||!input.matchId)return null;
  if(Object.hasOwn(p.awards,input.matchId))return {receipt:p.awards[input.matchId],applied:false};
  const firstWeapons=[...new Set(input.events.usedWeapons)].filter(w=>!p.usedWeapons.includes(w)).sort(),before=p.totalXPUnits;
  const receipt={...clone(input),firstWeapons,beforeUnits:before};delete receipt.matchId;Object.assign(receipt,totals(receipt));
  if(!integer(before+receipt.units))throw Error('XP exceeds exact storage range');
  p.awards[input.matchId]=receipt;p.totalXPUnits+=receipt.units;p.currentLevel=view(p.totalXPUnits).currentLevel;p.usedWeapons=[...new Set([...p.usedWeapons,...firstWeapons])].sort();
  return {receipt,applied:true};
 }
 function validate(p,old){
  if(!p){if(old)throw Error('Account XP was removed');return;}
  if(p.version!==1||!integer(p.totalXPUnits)||view(p.totalXPUnits).currentLevel!==p.currentLevel||!Array.isArray(p.usedWeapons)||new Set(p.usedWeapons).size!==p.usedWeapons.length||!p.awards||Array.isArray(p.awards))throw Error('Invalid account progression');
  if(old){if(p.totalXPUnits<old.totalXPUnits||old.usedWeapons.some(w=>!p.usedWeapons.includes(w)))throw Error('Account progression moved backwards');for(const [id,r]of Object.entries(old.awards))if(JSON.stringify(r)!==JSON.stringify(p.awards[id]))throw Error('Applied XP transaction changed');}
  let sum=0;const discoveries=new Set();for(const [id,r]of Object.entries(p.awards)){
   if(id.length>200||!['standard','official'].includes(r.kind)||!['tdm','deathmatch'].includes(r.mode)||!Number.isFinite(r.at)||r.at<=0||![true,false,null].includes(r.won)||!integer(r.winStreak)||!integer(r.beforeUnits))throw Error('Invalid XP transaction');
   for(const key of ['kills','deaths','assists','headshots'])if(!integer(r.stats?.[key]))throw Error('Invalid XP match statistics');for(const key of ['damage','timeAlive'])if(!Number.isFinite(r.stats?.[key])||r.stats[key]<0)throw Error('Invalid XP match measurements');
   for(const key of ['soloKills','finishingKills','dashes','bestStreak'])if(!integer(r.events?.[key]))throw Error('Invalid XP event count');
   if(r.events.soloKills+r.events.finishingKills>r.stats.kills||r.events.bestStreak>r.stats.kills||r.stats.headshots>r.stats.kills||!Array.isArray(r.events.usedWeapons)||new Set(r.events.usedWeapons).size!==r.events.usedWeapons.length||!Array.isArray(r.firstWeapons)||new Set(r.firstWeapons).size!==r.firstWeapons.length)throw Error('XP event counters conflict');
   for(const key of ['kills','assists','alive'])if(typeof r.leaders?.[key]!=='boolean')throw Error('Invalid XP leader result');
   for(const w of r.firstWeapons){if(typeof w!=='string'||!r.events.usedWeapons.includes(w)||!p.usedWeapons.includes(w)||discoveries.has(w))throw Error('Weapon discovery was duplicated');discoveries.add(w);}
   const expected=totals(r);if(expected.units!==r.units||expected.baseUnits!==r.baseUnits||r.beforeUnits!==sum)throw Error('XP transaction does not reconcile');sum+=r.units;
  }if(sum!==p.totalXPUnits)throw Error('XP balance does not reconcile');
 }
 const api={SCALE,MAX_LEVEL,requirements,view,normalize,legacyWeapons,eligibility,events,breakdown,totals,award,validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARProgression=api;
})(typeof window!=='undefined'?window:globalThis);
