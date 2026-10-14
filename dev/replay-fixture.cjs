'use strict';
// Isolated test databases only. Runs the shipped authoritative engine to its
// actual score/time result; never fabricates a replay or applies account rewards.
const {createRuntime}=require('../server/multiplayer-runtime.cjs'),Replays=require('../server/replays.cjs');
function recordMatch(db,owner,{mode='casual-tdm',members=[owner],at=Date.now(),mapId=null}={}){
 let clock=at;const MapPools=require('../server/map-pools.cjs'),priorMap=db.prepare("SELECT configuration_json FROM map_pool_config WHERE id='active'").get();
 if(mapId){const config=MapPools.configuration(db);config.pools[mode.startsWith('ranked-')?'ranked':'casual']=[mapId];db.prepare("INSERT INTO map_pool_config(id,configuration_json,updated_at) VALUES('active',?,?) ON CONFLICT(id) DO UPDATE SET configuration_json=excluded.configuration_json,updated_at=excluded.updated_at").run(JSON.stringify(config),clock);}
 const runtime=createRuntime({db,now:()=>clock,manual:true,casualWaitMs:0,mapVoteMs:0,maxSteps:24000});
 try{
  for(const id of members){const existing=runtime.activeFor(id);if(existing){if(!['ended','cancelled'].includes(existing.match.status))throw Error('Replay fixture requires no live match');runtime.leave(id);}}
  const party=members.length>1?{id:'replay-fixture-party',leaderId:owner,members:members.map(id=>({id,ready:true}))}:undefined;
  if(mode.startsWith('ranked-'))for(const id of members)runtime.queue(id,mode);else runtime.queue(owner,mode,party);const entry=runtime.activeFor(owner);if(!entry)throw Error('Authoritative replay match did not allocate');
  for(const id of members)runtime.ready(id);clock+=3000;runtime.step(clock);clock+=3034;runtime.step(clock);
  const ranked=mode.startsWith('ranked-'),routes=new Map();let step=0;
  while(entry.match.status!=='ended'&&clock<at+900000){
   if(ranked)for(const a of entry.match.participants){const enemies=entry.match.participants.filter(b=>!b.dead&&b.id!==a.id&&(mode.endsWith('deathmatch')||b.team!==a.team)).sort((b,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y)),target=enemies[0];if(!target||a.dead)continue;const distance=Math.hypot(a.x-target.x,a.y-target.y),visible=entry.e.dev.pointLOS(a.x,a.y,target),shoot=visible&&distance<1100;let direction={x:0,y:0};if(!shoot){let route=routes.get(a.id);if(!route||step%5===0||route.target!==target.id){route={target:target.id,points:entry.e.dev.findPath(a.x,a.y,target.x,target.y)};routes.set(a.id,route);}while(route.points[0]&&Math.hypot(a.x-route.points[0].x,a.y-route.points[0].y)<28)route.points.shift();const goal=route.points[0]||target,length=Math.hypot(goal.x-a.x,goal.y-a.y)||1;direction={x:(goal.x-a.x)/length,y:(goal.y-a.y)/length};}const slot=a.slots[a.currentSlot],weapon=entry.e.context.SAR.getWeapons()[slot.name];runtime.input(a.userId,{seq:step+1,moveX:direction.x,moveY:direction.y,aim:Math.atan2(target.y-a.y,target.x-a.x),fire:shoot&&(weapon.auto||step%2===0),ads:shoot,reload:slot.ammo===0});}
   clock+=ranked?200:10000;runtime.step(clock);step++;
  }if(entry.match.status!=='ended')throw Error('Authoritative replay match did not complete');
  const row=Replays.list(db,owner).replays.find(row=>row.matchId===entry.id);if(!row)throw Error('Authoritative replay was not persisted');runtime.leave(owner);return {row,replay:Replays.watch(db,owner,row.id).replay,result:entry.result};
 }finally{runtime.close();if(mapId){if(priorMap)db.prepare("UPDATE map_pool_config SET configuration_json=? WHERE id='active'").run(priorMap.configuration_json);else db.prepare("DELETE FROM map_pool_config WHERE id='active'").run();}}
}
module.exports={recordMatch};
