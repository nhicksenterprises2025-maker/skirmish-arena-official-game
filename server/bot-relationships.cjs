'use strict';
const {botId}=require('./db.cjs');
// These measured relationships belong to the persistent competitors. They do
// not create messages, queue work, call services or modify combat personalities.
function seasonRanks(world){
  const rows=Object.values(world?.seasons?.current?.stats||{}).filter(row=>row.games>=10),kd=row=>row.deaths?row.kills/row.deaths:row.kills?999:0;
  rows.sort((a,b)=>kd(b)-kd(a)||b.wins-a.wins||b.kills-a.kills||b.damage-a.damage||a.name.localeCompare(b.name));return Object.fromEntries(rows.map((row,i)=>[row.name,i+1]));
}
function recordRelationships(db,userId,oldWorld,world,now){
  if(!oldWorld)return;
  const before=seasonRanks(oldWorld),after=seasonRanks(world);
  for(const name of world.activeBotNames){
    const old=oldWorld.bots[name],next=world.bots[name];if(!old||!next)continue;
    const id=botId(name,next),fresh=next.recentMatches.filter(match=>!old.recentMatches.some(previous=>previous.at===match.at&&previous.kills===match.kills&&previous.deaths===match.deaths));
    for(const match of fresh){if(!match.social)continue;for(const other of match.social.teammates){const otherBot=world.bots[other],peer=otherBot?.recentMatches.find(value=>value.social?.matchId===match.social.matchId);if(!peer||peer.social.team!==match.social.team||peer.won!==match.won)continue;db.prepare('INSERT INTO bot_relationships(user_id,bot_id,other_bot_id,friendship,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,bot_id,other_bot_id) DO UPDATE SET friendship=MIN(100,bot_relationships.friendship+excluded.friendship),updated_at=excluded.updated_at').run(userId,id,botId(other,otherBot),match.won?.2:.05,now);}}
    if(before[name]&&after[name]&&fresh.length)for(const other of world.activeBotNames.filter(value=>value!==name&&after[value]&&Math.abs(after[value]-after[name])<=1).slice(0,2))db.prepare('INSERT INTO bot_relationships(user_id,bot_id,other_bot_id,rivalry,updated_at) VALUES(?,?,?,0.2,?) ON CONFLICT(user_id,bot_id,other_bot_id) DO UPDATE SET rivalry=MIN(100,bot_relationships.rivalry+0.2),updated_at=excluded.updated_at').run(userId,id,botId(other,world.bots[other]),now);
  }
}
module.exports={recordRelationships,seasonRanks};
