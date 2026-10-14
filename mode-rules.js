(function(root){
 'use strict';
 const REVISION='mode-expansion-1',ltms=new Map();
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 const RULES=freeze({
  'gun-game':{scoreLimit:0,durationMs:480000,killsPerTier:1,suicideTierPenalty:0,joinInProgress:false,tiePolicy:'highest-tier-draw'},
  domination:{scoreLimit:200,durationMs:600000,captureSeconds:8,maxCapturers:2,scoreTickMs:1000,pointsPerZone:1,joinInProgress:true},
  hardpoint:{scoreLimit:250,durationMs:600000,scoreTickMs:1000,pointsPerTick:1,rotationMs:60000,earlyRotationMs:12000,joinInProgress:true}
 });
 const clone=value=>JSON.parse(JSON.stringify(value));
 function weaponOrder(registry){
  const names=Object.keys(registry||{}).filter(n=>registry[n]&&['primary','sidearm'].includes(registry[n].type));
  if(!names.length)throw Error('Gun Game requires the current weapon registry.');
  return names.sort((a,b)=>(registry[a].type==='primary'?0:1)-(registry[b].type==='primary'?0:1)||registry[a].preferred-registry[b].preferred||a.localeCompare(b,'en'));
 }
 function initialize(match,weapons,map,now){
  if(!RULES[match.mode])return;
  const definition=match.ltmDefinition||match.context?.ltmDefinition,settings={...RULES[match.mode],...(definition?.rules||{})};delete settings.baseMode;
  match.modeRulesRevision=REVISION;match.modeState={revision:REVISION,rules:settings,elapsedMs:0,scoreElapsedMs:0};
  match.limit=settings.scoreLimit;match.durationMs=settings.durationMs;
  if(match.mode==='gun-game'){
   match.modeState.weaponOrder=weaponOrder(weapons).filter(n=>!definition||definition.allowedLoadouts.includes(n));if(!match.modeState.weaponOrder.length)throw Error('Gun Game has no eligible weapon tier.');match.limit=match.modeState.weaponOrder.length*settings.killsPerTier;
   for(const a of match.participants){a.gunTier=0;a.gunTierKills=0;}return;
  }
  const locations=map?.objectives?.[match.mode];if(!Array.isArray(locations)||locations.length<(match.mode==='domination'?3:2))throw Error('Arena has no authored '+match.mode+' objectives.');
  match.objectives=locations.map(p=>({...p,owner:null,progress:0,capturingTeam:null,contested:false,active:match.mode==='domination',nextAt:null}));
  if(match.mode==='hardpoint'){match.modeState.pointIndex=0;match.objectives[0].active=true;match.objectives[0].nextAt=now+settings.rotationMs;}
 }
 function occupants(match,actors,zone){
  const counts=[0,0];for(const a of actors){if(!match.participants.includes(a)||a.matchId!==match.id||a.dead||a.hp<=0||a.objectiveEligible===false||a.disconnected===true||![0,1].includes(a.team)||!Number.isFinite(a.x)||!Number.isFinite(a.y))continue;
   if(Math.hypot(a.x-zone.x,a.y-zone.y)<=zone.radius)counts[a.team]++;}return counts;
 }
 function tick(match,actors,dt,now){
  if(match.status!=='active'||!match.modeState||!RULES[match.mode])return null;
  const s=match.modeState,r=s.rules;let remaining=Math.max(0,dt*1000);
  if(match.mode==='gun-game'){s.elapsedMs+=remaining;return null;}
  // Divide at authoritative tick/rotation boundaries so a slow frame cannot
  // retroactively score newly captured or newly rotated points.
  while(remaining>1e-7){
   const segment=Math.min(remaining,r.scoreTickMs-s.scoreElapsedMs,match.mode==='hardpoint'?r.rotationMs-s.elapsedMs%r.rotationMs:Infinity),seconds=segment/1000;
   for(const z of match.objectives){if(!z.active)continue;const counts=occupants(match,actors,z);z.contested=counts[0]>0&&counts[1]>0;
   if(match.mode==='hardpoint'){z.owner=z.contested?null:counts[0]>0?0:counts[1]>0?1:null;continue;}
   if(z.contested)continue;
   const team=counts[0]>0?0:counts[1]>0?1:null;
   if(team===null||team===z.owner){z.progress=Math.max(0,z.progress-seconds/r.captureSeconds);if(!z.progress)z.capturingTeam=null;continue;}
   if(z.capturingTeam!==team){z.progress=0;z.capturingTeam=team;}
   z.progress=Math.min(1,z.progress+seconds*Math.min(counts[team],r.maxCapturers)/r.captureSeconds);
   if(z.progress>=1-1e-9){z.owner=team;z.progress=0;z.capturingTeam=null;}
  }
   s.elapsedMs+=segment;s.scoreElapsedMs+=segment;remaining-=segment;
   if(s.scoreElapsedMs>=r.scoreTickMs-1e-7){s.scoreElapsedMs=0;for(const z of match.objectives){if(z.active&&z.owner!==null&&(match.mode!=='hardpoint'||!z.contested))match.score[z.owner]+=match.mode==='domination'?r.pointsPerZone:r.pointsPerTick;}}
   if(match.score.some(score=>score>=match.limit)){const winner=match.score[0]===match.score[1]?null:match.score[0]>match.score[1]?0:1;return {winner,reason:'score'};}
   if(match.mode==='hardpoint'){
    const index=Math.floor((s.elapsedMs+1e-7)/r.rotationMs)%match.objectives.length;s.pointIndex=index;
    for(let i=0;i<match.objectives.length;i++){const z=match.objectives[i],active=i===index;if(z.active!==active){z.owner=null;z.contested=false;z.progress=0;}z.active=active;z.nextAt=active?now-remaining+r.rotationMs-s.elapsedMs%r.rotationMs:null;}
   }
  }return null;
 }
 function onKill(match,killer,victim,weapon){
  if(match.mode!=='gun-game'||match.status!=='active'||!killer||killer.abandoned===true||killer===victim||killer.matchId!==match.id||victim.matchId!==match.id||!match.participants.includes(killer)||!match.participants.includes(victim))return null;
  const s=match.modeState;if(weapon!==s.weaponOrder[killer.gunTier])return null;
  killer.gunTierKills++;if(killer.gunTierKills<s.rules.killsPerTier)return null;
  if(killer.gunTier===s.weaponOrder.length-1)return {winner:killer.id,reason:'final-tier'};
  killer.gunTier++;killer.gunTierKills=0;return {advance:true};
 }
 function gunLeaders(match,actors){const rows=actors.filter(a=>a.matchId===match.id&&a.abandoned!==true);if(!rows.length)return [];const best=Math.max(...rows.map(a=>a.gunTier||0)),kills=Math.max(...rows.filter(a=>(a.gunTier||0)===best).map(a=>a.gunTierKills||0));return rows.filter(a=>(a.gunTier||0)===best&&(a.gunTierKills||0)===kills).map(a=>a.id);}
 function validateLTM(raw,{weapons,maps}){
  const modes=['tdm','deathmatch','gun-game','domination','hardpoint'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!/^[-a-z0-9]{1,48}$/.test(raw.id)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80||typeof raw.description!=='string'||raw.description.length>500)throw Error('Invalid limited-time mode identity.');
  const activeFrom=typeof raw.activeFrom==='string'?Date.parse(raw.activeFrom):NaN,activeUntil=typeof raw.activeUntil==='string'?Date.parse(raw.activeUntil):NaN;if(!Number.isFinite(activeFrom)||!Number.isFinite(activeUntil)||activeUntil<=activeFrom)throw Error('Invalid limited-time mode dates.');
  if(!Array.isArray(raw.mapPool)||!raw.mapPool.length||new Set(raw.mapPool).size!==raw.mapPool.length||raw.mapPool.some(id=>!maps.get(id)))throw Error('Invalid limited-time map pool.');
  if(!raw.rules||!modes.includes(raw.rules.baseMode)||!Number.isInteger(raw.teamSize)||raw.teamSize<1||raw.teamSize>5||(['deathmatch','gun-game'].includes(raw.rules.baseMode)&&raw.teamSize!==1))throw Error('Invalid limited-time participation rules.');
  const rules=clone(raw.rules),bounds={scoreLimit:[1,10000],durationMs:[30000,3600000],captureSeconds:[1,120],scoreTickMs:[250,10000],rotationMs:[10000,600000],killsPerTier:[1,10]};
  const permitted={tdm:['scoreLimit','durationMs'],deathmatch:['scoreLimit','durationMs'],'gun-game':['durationMs','killsPerTier'],domination:['scoreLimit','durationMs','captureSeconds','scoreTickMs'],hardpoint:['scoreLimit','durationMs','scoreTickMs','rotationMs']};
  for(const [key,value]of Object.entries(rules)){if(key==='baseMode')continue;if(!permitted[rules.baseMode].includes(key)||!bounds[key]||!Number.isFinite(value)||value<bounds[key][0]||value>bounds[key][1]||(key!=='captureSeconds'&&!Number.isInteger(value)))throw Error('Invalid limited-time rule: '+key);}
  if(!Array.isArray(raw.allowedLoadouts)||!raw.allowedLoadouts.length||new Set(raw.allowedLoadouts).size!==raw.allowedLoadouts.length||raw.allowedLoadouts.some(name=>!Object.hasOwn(weapons,name)))throw Error('Invalid limited-time loadout registry.');
  if(typeof raw.xpEligible!=='boolean'||typeof raw.statEligible!=='boolean')throw Error('Limited-time eligibility must be explicit.');
  return freeze({id:raw.id,name:raw.name.trim(),description:raw.description,activeFrom:new Date(activeFrom).toISOString(),activeUntil:new Date(activeUntil).toISOString(),mapPool:raw.mapPool.slice(),teamSize:raw.teamSize,rules,allowedLoadouts:raw.allowedLoadouts.slice(),xpEligible:raw.xpEligible,statEligible:raw.statEligible,revision:REVISION});
 }
 function registerLTM(config,registry){const value=validateLTM(config,registry);if(ltms.has(value.id))throw Error('Duplicate limited-time mode.');ltms.set(value.id,value);return value;}
 const api={REVISION,RULES,weaponOrder,initialize,tick,onKill,gunLeaders,validateLTM,registerLTM,getLTM:id=>ltms.get(id)||null,listLTMs:()=>[...ltms.values()],activeLTMs:(now=Date.now())=>[...ltms.values()].filter(d=>now>=Date.parse(d.activeFrom)&&now<Date.parse(d.activeUntil))};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARModeRules=api;
})(typeof window!=='undefined'?window:globalThis);
