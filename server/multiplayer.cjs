'use strict';
const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const Social=require('./social.cjs'),Runtime=require('./multiplayer-runtime.cjs');
const Rewards=require('./multiplayer-progression.cjs');
const Competitive=require('./competitive-progression.cjs');
const Mastery=require('./weapon-mastery.cjs');
const Factions=require('./factions.cjs');
const BotProjection=require('./bot-multiplayer-projection.cjs');
const Circuit=require('./tournaments.cjs');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function createMultiplayer({server,db,authenticate,originAllowed,options={},commerceEnvironment=Competitive.environmentFor(db)}){
 Competitive.setEnvironment(db,commerceEnvironment);
 Competitive.configure(db);
 Mastery.configure(db);
 const peers=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});let broadcastTimer,heartbeatTimer,closing=false,closePromise;
 const runtime=Runtime.createRuntime({db,backgroundLeases:true,...options,onResult(result,match){
  if(match.context?.tournamentId){const context=match.context;Circuit.recordGame(db,context.userId||match.ownerId,context.tournamentId,context.seriesId,{id:result.matchId,matchId:result.matchId,mode:'tdm',sessionType:'tournament',eligible:false,aiRevision:result.aiRevision,balanceVersion:result.balanceVersion,balanceFingerprint:result.balanceFingerprint,score:result.score,winnerTeamId:context.teamIds[result.winner],duration:result.durationMs/1000,stats:result.rows.map(row=>({participantId:row.participantId,...row.stats,weaponStats:row.weaponStats})),mapId:result.mapId||'brightfield-blocks',mapVersion:result.mapVersion,mapSelection:result.mapSelection,calibrationId:result.calibrationId,distanceUnit:'world-unit'},result.endedAtWall);}
  Rewards.applyResult(db,result,match);options.onResult?.(result,match);
 },onChange(change){
  for(const id of change.userIds||[]){const party=Social.getParty(db,id);if(party)Social.setQueue(db,party.id,change.type==='queue'?'queued':change.type==='match-created'?'playing':'idle',change.type==='match-created'?change.matchId:null);}
  for(const peer of peers.values()){peer.socialDirty=true;if(['match-created','match-ended'].includes(change.type))peer.botsDirty=true;}
 }});
 function send(peer,type,data,id){
  if(peer.ws.readyState!==1)return false;
  // Superseded frames may be skipped; acknowledgements must never disappear
  // behind presentation traffic. Close a persistently stalled connection so the
  // existing reconnect path can recover instead of growing an unbounded queue.
  if(peer.ws.bufferedAmount>4*1024*1024){peer.ws.close(1013,'Connection too slow; reconnect');return false;}
  if(type==='snapshot'&&peer.ws.bufferedAmount>1024*1024)return false;
  peer.ws.send(JSON.stringify({type,data,...(id?{id}:{})}));return true;
 }
 function botProgression(){const owner=runtime.rosterOwnerId();return owner?BotProjection.projection(db,owner):null;}
 function state(user){const snapshot=runtime.snapshot(user);return {...snapshot,social:Social.bootstrap(db,user,Date.now()),factions:Factions.snapshot(db,user.id),progression:Rewards.projection(db,user.id),competitive:Competitive.snapshot(db,user.id,Date.now(),commerceEnvironment),mastery:Mastery.snapshot(db,user.id,Date.now(),commerceEnvironment),botProgression:botProgression()};}
 function socialChanged(){
  for(const queue of runtime.queues())if(queue.id!==queue.leaderId){const party=Social.getParty(db,queue.leaderId);if(!party||party.queueStatus!=='queued'||queue.members.some(member=>!party.members.some(p=>p.id===member.id)))runtime.cancelQueue(queue.leaderId);}
  for(const peer of peers.values())peer.socialDirty=true;
 }
 function iceConfig(){
  // TURN credentials remain on the server. Expiring HMAC credentials, never a
  // durable secret, are handed to authenticated callers when TURN is configured.
  const urls=String(process.env.SAR_TURN_URLS||'').split(',').map(v=>v.trim()).filter(v=>/^(turn|turns):/.test(v));
  const iceServers=[];if(urls.length&&process.env.SAR_TURN_SECRET){const username=Math.floor(Date.now()/1000+3600)+':skirmish';iceServers.push({urls,username,credential:crypto.createHmac('sha1',process.env.SAR_TURN_SECRET).update(username).digest('base64')});}
  if(process.env.SAR_STUN_URL)iceServers.push({urls:[process.env.SAR_STUN_URL]});
  return {iceServers,relayConfigured:urls.length>0,voiceDefault:'disabled',scopes:['party','team']};
 }
 function action(user,type,body={}){
  if(closing)throw fail(503,'Server is shutting down; reconnect shortly.');
  if(['queue','custom'].includes(type)){const group=Social.getParty(db,user.id),members=group?.members||[{id:user.id}];if(group&&group.leaderId!==user.id)throw fail(403,'Only the party leader can queue.');if(group&&members.some(member=>member.ready!==true))throw fail(409,'Every party member must be ready.');if(members.some(member=>!peers.has(member.id)))throw fail(409,'Every party member must be connected before queuing.');for(const member of members){const previous=runtime.activeFor(member.id);if(previous&&['ended','cancelled'].includes(previous.match.status))runtime.leave(member.id);}}
  if(type==='queue'){const party=Social.getParty(db,user.id);return runtime.queue(user,body.mode||party?.mode||'casual-tdm',party);}
  if(type==='cancel-queue')return runtime.cancelQueue(user);
  if(type==='map-vote')return runtime.mapVote(user,body);
  if(type==='custom')return runtime.custom(user,body.config||body,Social.getParty(db,user.id));
  if(type==='ready')return runtime.ready(user);
  if(type==='leave')return runtime.leave(user);
  if(type==='input')return runtime.input(user,body);
  if(type==='ping')return {clientTime:body.clientTime,serverNow:Date.now()};
  if(type==='background')return runtime.background(user,body,peers.get(user.id)?.id);
  const routes={'friend-search':['GET','/search'],'chat-history':['GET','/chat'],privacy:['POST','/privacy'],chat:['POST','/chat'],mute:['POST','/mute'],report:['POST','/report'],block:['POST','/block'],unblock:['POST','/unblock']};
  for(const [prefix,path]of [['friend','/friends'],['party','/party']])if(!routes[type]&&type.startsWith(prefix+'-'))routes[type]=['POST',path+'/'+type.slice(prefix.length+1)];
  const route=routes[type];if(!route)throw fail(400,'Unsupported multiplayer action');
  const url=new URL('/api/social'+route[1],'http://localhost');for(const [key,value]of Object.entries(body))if(typeof value!=='object')url.searchParams.set(key,String(value));
  if(type==='chat'||type==='chat-history'){const match=runtime.activeFor(user.id);if(body.scope!=='party')body={...body,matchId:match?.id};}
  const response=Social.handle({db,user,method:route[0],pathname:url.pathname,body,url,now:Date.now()});if(!response)throw fail(404,'Social action unavailable');
  if(type==='chat')for(const peer of peers.values())try{const room=Social.chat(db,peer.user,{scope:body.scope||'party',matchId:body.matchId,after:response.data.id-1});if(room.messages.some(row=>row.id===response.data.id))send(peer,'chat',room);}catch(error){if(!error.status)throw error;}
  // Changes to roster membership, including a block, invalidate a queued group.
  socialChanged();return response.data;
 }
 server.on('upgrade',(req,socket,head)=>{
  try{if(closing)throw fail(503,'Server is shutting down');if(new URL(req.url,'http://localhost').pathname!=='/api/multiplayer/socket')throw fail(404,'Not found');if(!originAllowed(req))throw fail(403,'Origin rejected');const user=authenticate(req);if(!user)throw fail(401,'Sign in required');
   wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req,user));
  }catch(error){socket.end('HTTP/1.1 '+(error.status||400)+' Rejected\r\nConnection: close\r\n\r\n');}
 });
 wss.on('connection',(ws,req,user)=>{
  const id=crypto.randomUUID(),old=peers.get(user.id),peer={ws,req,user,id,alive:true,socialDirty:true,windowAt:Date.now(),count:0};peers.set(user.id,peer);runtime.connect(user,id);old?.ws.close(4001,'Account connected elsewhere');
  Social.touchPresence(db,user.id,id,'Lobby',Date.now());send(peer,'state',state(user));
  ws.on('pong',()=>{peer.alive=true;});
  ws.on('message',data=>{
   if(closing||peers.get(user.id)!==peer)return;
   let message;try{if(Date.now()-peer.windowAt>=1000){peer.windowAt=Date.now();peer.count=0;}if(++peer.count>90)throw fail(429,'Input rate exceeded');message=JSON.parse(data.toString());if(!message||typeof message.type!=='string'||typeof message.data!=='object'||Array.isArray(message.data))throw fail(400,'Invalid multiplayer message');
    if(!authenticate(req))throw fail(401,'Your session expired');
    if(message.type==='voice'){
     const body=message.data,target=peers.get(body.to),scope=body.scope||'party',entry=runtime.activeFor(user.id);
     if(!target||!Social.authorizeVoice(db,user.id,body.to,scope,{matchId:entry?.id}))throw fail(403,'Voice connection unavailable');
     for(const key of ['ready','sessionId'])if(body[key]!==undefined&&(typeof body[key]!=='string'||!/^[A-Za-z0-9:_-]{1,80}$/.test(body[key])))throw fail(400,'Invalid voice session');
     if(body.description&&(!['offer','answer','rollback'].includes(body.description.type)||typeof body.description.sdp!=='string'||body.description.sdp.length>12000))throw fail(400,'Invalid voice offer');
     if(body.candidate&&typeof body.candidate.candidate!=='string')throw fail(400,'Invalid voice candidate');
     send(target,'voice',{from:user.id,scope,ready:body.ready,sessionId:body.sessionId,description:body.description,candidate:body.candidate});send(peer,'response',{ok:true},message.id);return;
    }
    const result=action(user,message.type,message.data);if(message.id)send(peer,'response',result,message.id);
   }catch(error){send(peer,'error',{error:error.status?error.message:'Multiplayer service error',code:error.code,status:error.status||500},message?.id);if(!error.status)console.error('Multiplayer action:',error.stack);}
  });
  ws.on('close',()=>{runtime.disconnect(user,id);Social.disconnectPresence(db,user.id,id,Date.now());if(peers.get(user.id)===peer)peers.delete(user.id);});
  ws.on('error',error=>console.warn('Multiplayer connection:',error.code||error.message));
 });
 broadcastTimer=setInterval(()=>{for(const peer of peers.values())try{
  const entry=runtime.activeFor(peer.user.id),at=Date.now();
  if(['ended','cancelled'].includes(entry?.match.status)&&!peer.socialDirty&&!peer.botsDirty&&at-(peer.lastEndedSnapshotAt||0)<1000)continue;
  const snapshot=runtime.snapshot(peer.user),match=snapshot.match;
  if(match){snapshot.match={...match,userId:peer.user.id,team:snapshot.roster.find(a=>a.userId===peer.user.id)?.team,roster:snapshot.roster,voicePeers:snapshot.roster.filter(a=>a.userId&&a.userId!==peer.user.id&&Social.authorizeVoice(db,peer.user.id,a.userId,'team',{matchId:match.id})).map(a=>a.userId)};}
  if(peer.socialDirty)peer.socialDirty=!send(peer,'social',{social:Social.bootstrap(db,peer.user,Date.now()),factions:Factions.snapshot(db,peer.user.id),progression:Rewards.projection(db,peer.user.id),competitive:Competitive.snapshot(db,peer.user.id,Date.now(),commerceEnvironment),mastery:Mastery.snapshot(db,peer.user.id,Date.now(),commerceEnvironment)});
  if(peer.botsDirty)peer.botsDirty=!send(peer,'bot-progression',botProgression());
  if(send(peer,'snapshot',snapshot)&&['ended','cancelled'].includes(match?.status))peer.lastEndedSnapshotAt=at;
 }catch(error){console.error('Multiplayer snapshot:',error.message);}},1000/15);broadcastTimer.unref();
 heartbeatTimer=setInterval(()=>{for(const peer of peers.values()){if(!peer.alive||!authenticate(peer.req)){peer.ws.terminate();continue;}peer.alive=false;peer.ws.ping();Social.touchPresence(db,peer.user.id,peer.id,runtime.activeFor(peer.user.id)?'In match':'Lobby',Date.now());}},25000);heartbeatTimer.unref();
 function close(){
  if(closePromise)return closePromise;
  closing=true;clearInterval(broadcastTimer);clearInterval(heartbeatTimer);
  closePromise=new Promise((resolve,reject)=>{
   // Freeze and checkpoint the simulation while its database is still open.
   runtime.close();
   const deadline=setTimeout(()=>{for(const ws of wss.clients)ws.terminate();},5000);deadline.unref();
   for(const ws of wss.clients)ws.close(1001,'Server closing');
   // Presence/disconnect close handlers finish before the database may close.
   wss.close(error=>{clearTimeout(deadline);if(error)reject(error);else resolve();});
  });return closePromise;
 }
 server.on('close',close);
 return {runtime,state,action,iceConfig,close,socialChanged,protectWorld:(user,save,previous)=>Rewards.protectWorld(db,user.id,save,previous)};
}
module.exports={createMultiplayer};
