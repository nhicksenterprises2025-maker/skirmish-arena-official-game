'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{engine}=require('./simulate.cjs');
const output=[];
function scenario(side,weapon,lower=[25,40],upper=[78,89]){
 const e=engine(),{state}=e.dev.inspect(),roster=Object.entries(e.context.SAR.getProfiles()),high=roster.filter(([,p])=>p.power>=upper[0]&&p.power<=upper[1]).slice(0,5),low=roster.filter(([,p])=>p.power>=lower[0]&&p.power<=lower[1]).slice(0,5),names=[...high,...low].map(([n])=>n),actors=names.map(n=>state.actors.find(a=>a.name===n)),teamsByActor={};
 actors.forEach((a,i)=>teamsByActor[a.id]=i<5?side:1-side);state.matches.forEach(m=>m.status='fixture-held');state.actors=actors;state.idleBots=[];
 const m=e.dev.startMatch(0,actors,false,{mode:'tdm',sessionType:'custom',teamsByActor});const original=e.context.SAR.getWeapons();for(const a of actors){a.sandbox=true;a.slots[0]={name:weapon,ammo:original[weapon].mag,reserve:original[weapon].reserve,lastShot:-999,reloadEnd:0,reloading:false};}
 const counters=Object.fromEntries(actors.map(a=>[a.id,{name:a.name,power:a.profile.power,support:0,waits:0,decisions:0,maxWaitMs:0,longestStationaryMs:0,shots:0,damage:0,kills:0,deaths:0}])),last=new Map();
 for(let i=0;i<1800&&m.status==='active';i++){e.step();for(const a of actors){const sample=counters[a.id],prior=last.get(a.id)||{actionUntil:0,waitSince:e.dev.now(),stillSince:e.dev.now()};if(prior.actionUntil!==a.actionUntil){sample.decisions++;if(a.tactic==='SUPPORT')sample.support++;if(a.tactic==='WAIT_SUPPORT')sample.waits++;}if(a.tactic!=='WAIT_SUPPORT')prior.waitSince=e.dev.now();else sample.maxWaitMs=Math.max(sample.maxWaitMs,e.dev.now()-prior.waitSince);if(a.dead||Math.hypot(a.vx,a.vy)>15)prior.stillSince=e.dev.now();else sample.longestStationaryMs=Math.max(sample.longestStationaryMs,e.dev.now()-prior.stillSince);prior.actionUntil=a.actionUntil;last.set(a.id,prior);}}
 for(const a of actors)Object.assign(counters[a.id],{shots:a.stats.shots,damage:a.stats.damage,kills:a.stats.kills,deaths:a.stats.deaths});
 const summarize=list=>list.map(([name])=>Object.values(counters).find(a=>a.name===name));const highRows=summarize(high),lowRows=summarize(low);assert.ok(lowRows.every(r=>r.decisions>0));assert.ok(lowRows.some(r=>r.damage>0));assert.ok(Object.values(counters).every(r=>r.maxWaitMs<3000),'No permanent readiness wait');assert.deepEqual(e.context.SAR.getWeapons(),original);return {side,weapon,seconds:e.dev.now()/1000,score:m.score,high:highRows,low:lowRows,actions:e.context.SAR.getDiagnostics().actions};
}
for(const [lower,upper]of [[[25,40],[78,89]],[[25,40],[48,62]],[[48,62],[78,89]]])for(const side of [0,1])for(const weapon of ['AR-15','P90'])output.push(scenario(side,weapon,lower,upper));
const repeat=scenario(0,'AR-15');assert.deepEqual(repeat,output[0],'Seeded lineup scenario is repeatable');
{
 const e=engine(),{state}=e.dev.inspect(),a=state.actors.find(a=>a.matchId===0&&a.team===0),b=state.actors.find(a=>a.matchId===0&&a.team===1);for(const o of state.actors)if(o!==a&&o!==b)o.dead=true;Object.assign(a,{x:200,y:200});Object.assign(b,{x:3500,y:2000,hp:1});e.dev.selectTarget(a,e.dev.now());assert.equal(a.visibleEnemies.length,0);assert.equal(a.target,null);assert.equal(a.memory.has(b.id),false);assert.equal(state.matches[0].teamIntentions.size,0);
}
fs.writeFileSync(path.join(__dirname,'tactical-lineup-results.json'),JSON.stringify({result:'PASS',note:'Actual seeded simulation, no win-rate target. Same roster groups swap sides and weapons; utility quality and observed support are separate measurements.',scenarios:output},null,2));
console.log('PASS twelve 60-second low/mid/high lineup simulations, swapped sides/equipment, exact repeat, competent low-Power combat and bounded support waits; hidden enemy omitted');
