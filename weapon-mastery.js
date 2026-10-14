(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SARWeaponMastery=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 const CONFIG=freeze({revision:'mastery-1',thresholds:[0,250,650,1250,2100,3200,4600,6400,8600,11200],actions:{damage:.02,kills:20,headshots:10,activeEquippedSecond:.2,activeTimeCombatCap:.25,meaningfulWin:25},meaningful:{damage:125,kills:1,equippedSeconds:15},badgeTiers:[1,3,5,7,10],challenges:[
  {id:'first-kills',name:'Proven Aim',metric:'kills',target:25,xp:100},
  {id:'headshots',name:'Precision',metric:'headshots',target:10,xp:100},
  {id:'damage',name:'Pressure',metric:'damage',target:5000,xp:150},
  {id:'streak',name:'Three in a Life',metric:'bestStreak',target:3,xp:100},
  {id:'wins',name:'Reliable Kit',metric:'meaningfulWins',target:5,xp:150}
 ]});
 const num=v=>Number.isFinite(v)&&v>=0?v:0;
 function level(xp){xp=num(xp);let index=0;while(index+1<CONFIG.thresholds.length&&xp>=CONFIG.thresholds[index+1])index++;const cap=index===CONFIG.thresholds.length-1,into=xp-CONFIG.thresholds[index],next=cap?0:CONFIG.thresholds[index+1]-CONFIG.thresholds[index];return {level:index+1,totalXp:xp,lifetimeXP:xp,xpIntoLevel:cap?0:into,xpForNext:next,xpRequired:next,progress:cap?1:Math.min(1,into/next)};}
 function actions(raw={},won=false){const kills=num(raw.kills??raw.k),deaths=num(raw.deaths??raw.d),headshots=num(raw.headshots),damage=num(raw.damage),shots=num(raw.shots),hits=num(raw.hits),equippedTime=num(raw.equippedTime),bestStreak=num(raw.masteryBestStreak),combat=damage*CONFIG.actions.damage+kills*CONFIG.actions.kills+headshots*CONFIG.actions.headshots,
  activeEquippedTime=Math.min(equippedTime,hits*2+damage/25),activeXp=Math.min(activeEquippedTime*CONFIG.actions.activeEquippedSecond,combat*CONFIG.actions.activeTimeCombatCap),meaningfulWins=won===true&&equippedTime>=CONFIG.meaningful.equippedSeconds&&(damage>=CONFIG.meaningful.damage||kills>=CONFIG.meaningful.kills)?1:0;
  return {xp:Math.floor(combat+activeXp+meaningfulWins*CONFIG.actions.meaningfulWin),stats:{kills,deaths,headshots,damage,shots,hits,equippedTime,activeEquippedTime,bestStreak,meaningfulWins,games:combat>0||equippedTime>0||shots>0||deaths>0?1:0}};
 }
 function weaponView(name,state={}){const view=level(state.totalXp||0),stats={kills:0,deaths:0,headshots:0,damage:0,shots:0,hits:0,equippedTime:0,activeEquippedTime:0,bestStreak:0,meaningfulWins:0,games:0,...state.stats},completed=state.completed||{},challenges=CONFIG.challenges.map(c=>({...c,value:Math.min(c.target,num(stats[c.metric])),completed:!!completed[c.id],completedAt:completed[c.id]?.at||null}));return {name,...view,stats,challenges,badges:CONFIG.badgeTiers.map(tier=>({id:'badge:'+name+':'+tier,name:name+' · Tier '+tier,type:'mastery-badge',tier,earned:view.totalXp>0&&view.level>=tier,payload:{weapon:name,tier}}))};}
 function weaponClass(name,def={}){const role=String(def.role||'').toLowerCase();return def.type==='sidearm'?'sidearm':(def.pellets||1)>1?'shotgun':def.burstCount>1?'burst':role.includes('sniper')?'sniper':role.includes('marksman')?'marksman':role.includes('lmg')?'lmg':role.includes('smg')||role.includes('tracking')?'smg':'rifle';}
 return {CONFIG,level,actions,weaponView,weaponClass};
});
