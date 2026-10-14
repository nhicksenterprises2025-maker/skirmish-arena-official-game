'use strict';
const crypto=require('node:crypto'),XP=require('../progression.js');
const Modes=require('../match-modes.js'),ModeRules=require('../mode-rules.js');
const MODES=new Set([...Modes.permanent().flatMap(m=>['casual-'+m.mode,'custom-'+m.mode]),'ranked-tdm','ranked-deathmatch']);
const fail=(status,message,code='SOCIAL_REJECTED')=>Object.assign(new Error(message),{status,code});
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
const parsed=value=>{try{return JSON.parse(value);}catch{return null;}};
const stamp=now=>Number.isFinite(now)?now:Date.now();
function transaction(db,work){db.exec('SAVEPOINT mp_social');try{const value=work();db.exec('RELEASE mp_social');return value;}catch(error){db.exec('ROLLBACK TO mp_social');db.exec('RELEASE mp_social');throw error;}}
function userExists(db,id){if(!identity(id)||!db.prepare('SELECT 1 FROM users WHERE id=? AND disabled_at IS NULL').get(id))throw fail(404,'Player not found');return id;}
function isBlocked(db,a,b){return !!db.prepare('SELECT 1 FROM mp_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(a,b,b,a);}
function canInteract(db,a,b){return a!==b&&!isBlocked(db,a,b);}
function friends(db,a,b){return !!db.prepare('SELECT 1 FROM mp_friends WHERE user_id=? AND friend_id=?').get(a,b);}
function privacy(db,id){const row=db.prepare('SELECT * FROM mp_privacy WHERE user_id=?').get(id);return {showOnline:row?!!row.show_online:true,showActivity:row?!!row.show_activity:true,allowFriendRequests:row?!!row.allow_friend_requests:true,partyJoin:row?.party_join||'invite'};}
function sameParty(db,a,b){return !!db.prepare('SELECT 1 FROM mp_party_members a JOIN mp_party_members b ON a.party_id=b.party_id WHERE a.user_id=? AND b.user_id=?').get(a,b);}
function publicProfile(db,id,viewerId=id,now=Date.now()){
 const row=db.prepare('SELECT id,username FROM users WHERE id=? AND disabled_at IS NULL').get(id);if(!row)return null;
 // Select only public fields; never send a save, account secrets, or a session.
 const fields=db.prepare(`SELECT json_extract(save_json,'$.progression.totalXPUnits') AS xp,
 json_extract(save_json,'$.config.skin') AS skin,
 json_extract(save_json,?) AS rating FROM worlds WHERE user_id=?`).get('$.ranked.participants.'+JSON.stringify(id)+'.ratingUnits',id);
 const p=privacy(db,id),present=db.prepare('SELECT activity,connected,last_seen_at FROM mp_presence WHERE user_id=?').get(id),allowed=viewerId===id||friends(db,viewerId,id)||sameParty(db,viewerId,id);
 const online=!isBlocked(db,viewerId,id)&&p.showOnline&&!!present?.connected&&now-present.last_seen_at<90000;
 const network=db.prepare('SELECT 1 FROM mp_progression_baselines WHERE user_id=?').get(id)?require('./multiplayer-progression.cjs').projection(db,id).summary:null;
 const rank=network?.ranked||XP.rankView(Number.isSafeInteger(fields?.rating)&&fields.rating>=0?fields.rating:0);
 const party=db.prepare('SELECT p.id,p.leader_id,p.queue_status FROM mp_parties p JOIN mp_party_members m ON m.party_id=p.id WHERE m.user_id=?').get(id);
 const partyId=party&&party.queue_status==='idle'&&online&&p.showActivity&&allowed&&privacy(db,party.leader_id).partyJoin==='friends'&&friends(db,viewerId,party.leader_id)&&!db.prepare('SELECT user_id FROM mp_party_members WHERE party_id=?').all(party.id).some(m=>isBlocked(db,viewerId,m.user_id))?party.id:null;
 let operator=Number.isInteger(fields?.skin)?fields.skin:0;try{require('./wallet.cjs').operatorAppearance(db,id,operator,require('./competitive-progression.cjs').environmentFor(db));}catch(error){if(['NOT_OWNED','UNKNOWN_OPERATOR'].includes(error.code))operator=0;else throw error;}
 return {...row,level:network?.xp.currentLevel??XP.view(Number.isSafeInteger(fields?.xp)&&fields.xp>=0?fields.xp:0).currentLevel,operator,profileIcon:null,...require('./competitive-progression.cjs').publicEquipment(db,id),faction:require('./factions.cjs').publicIdentity(db,id),rank,online,activity:online&&allowed&&p.showActivity?present.activity:null,partyId};
}
function getParty(db,userId,now=Date.now()){
 const party=db.prepare('SELECT p.* FROM mp_parties p JOIN mp_party_members m ON m.party_id=p.id WHERE m.user_id=?').get(userId);if(!party)return null;
 const members=db.prepare('SELECT user_id,ready,joined_at FROM mp_party_members WHERE party_id=? ORDER BY joined_at,user_id').all(party.id).map(m=>({...publicProfile(db,m.user_id,userId,now),ready:!!m.ready,joinedAt:m.joined_at}));
 const invites=party.leader_id===userId?db.prepare("SELECT * FROM mp_party_invites WHERE party_id=? AND state='pending' AND expires_at>? ORDER BY created_at").all(party.id,now).filter(i=>!isBlocked(db,userId,i.recipient_id)).map(i=>({id:i.id,user:publicProfile(db,i.recipient_id,userId,now),expiresAt:i.expires_at})):[];
 return {id:party.id,leaderId:party.leader_id,mode:party.mode,queueStatus:party.queue_status,matchId:party.match_id,members,invites};
}
function setQueue(db,partyId,status,matchId=null,now=Date.now()){
 if(!['idle','queued','matched','playing'].includes(status))throw fail(400,'Invalid queue state');
 db.prepare('UPDATE mp_parties SET queue_status=?,match_id=?,updated_at=? WHERE id=?').run(status,matchId,now,partyId);
}
function touchPresence(db,userId,connectionId,activity='Lobby',now=Date.now()){
 userExists(db,userId);if(!identity(connectionId))throw fail(400,'Invalid connection identity');
 const previous=db.prepare('SELECT connection_id,connected FROM mp_presence WHERE user_id=?').get(userId);
 db.prepare('INSERT INTO mp_presence(user_id,connection_id,activity,connected,last_seen_at) VALUES(?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET connection_id=excluded.connection_id,activity=excluded.activity,connected=1,last_seen_at=excluded.last_seen_at').run(userId,connectionId,String(activity||'Lobby').slice(0,80),now);
 return previous?.connected&&previous.connection_id!==connectionId?previous.connection_id:null;
}
function disconnectPresence(db,userId,connectionId,now=Date.now()){
 return db.prepare('UPDATE mp_presence SET connected=0,last_seen_at=? WHERE user_id=? AND connection_id=?').run(now,userId,connectionId).changes>0;
}
function currentParty(db,userId){const row=db.prepare('SELECT p.* FROM mp_parties p JOIN mp_party_members m ON m.party_id=p.id WHERE m.user_id=?').get(userId);if(!row)throw fail(409,'Join or create a party first');return row;}
function leaderParty(db,userId){const party=currentParty(db,userId);if(party.leader_id!==userId)throw fail(403,'Only the party leader can do that');return party;}
function editableParty(party){if(party.queue_status!=='idle')throw fail(409,'Cancel the queue before changing the party');}
function createParty(db,userId,now){
 const existing=getParty(db,userId,now);if(existing)return existing;
 const id='party:'+crypto.randomUUID();db.prepare('INSERT INTO mp_parties(id,leader_id,created_at,updated_at) VALUES(?,?,?,?)').run(id,userId,now,now);
 db.prepare('INSERT INTO mp_party_members(party_id,user_id,ready,joined_at) VALUES(?,?,0,?)').run(id,userId,now);return getParty(db,userId,now);
}
function leaveParty(db,userId,now){
 const party=currentParty(db,userId);if(['matched','playing'].includes(party.queue_status))throw fail(409,'Leave the match before changing party membership');
 db.prepare('DELETE FROM mp_party_members WHERE user_id=?').run(userId);setQueue(db,party.id,'idle',null,now);
 const next=db.prepare('SELECT user_id FROM mp_party_members WHERE party_id=? ORDER BY joined_at,user_id LIMIT 1').get(party.id);
 if(!next)db.prepare('DELETE FROM mp_parties WHERE id=?').run(party.id);
 else if(party.leader_id===userId)db.prepare('UPDATE mp_parties SET leader_id=?,updated_at=? WHERE id=?').run(next.user_id,now,party.id);
 return null;
}
function joinParty(db,userId,partyId,now,inviteId=null){
 const existing=getParty(db,userId,now);if(existing){if(existing.id===partyId)return existing;throw fail(409,'Leave your current party first');}
 const party=db.prepare('SELECT * FROM mp_parties WHERE id=?').get(partyId);if(!party)throw fail(404,'Party no longer exists');editableParty(party);
 const members=db.prepare('SELECT user_id FROM mp_party_members WHERE party_id=?').all(partyId);
 if(members.length>=10)throw fail(409,'Party is full');if(members.some(m=>isBlocked(db,userId,m.user_id)))throw fail(403,'This party is unavailable');
 const invite=db.prepare("SELECT * FROM mp_party_invites WHERE party_id=? AND recipient_id=? AND state='pending' AND expires_at>?").get(partyId,userId,now);
 if(inviteId&&invite?.id!==inviteId)throw fail(403,'Invitation is not valid');
 if(!invite&&!(privacy(db,party.leader_id).partyJoin==='friends'&&friends(db,userId,party.leader_id)))throw fail(403,'This party requires an invitation');
 db.prepare('INSERT INTO mp_party_members(party_id,user_id,ready,joined_at) VALUES(?,?,0,?)').run(partyId,userId,now);
 if(invite)db.prepare("UPDATE mp_party_invites SET state='accepted',updated_at=? WHERE id=?").run(now,invite.id);
 db.prepare('UPDATE mp_parties SET updated_at=? WHERE id=?').run(now,partyId);return getParty(db,userId,now);
}
function bootstrap(db,user,now){
 const id=user.id,list=(sql)=>db.prepare(sql).all(id).filter(r=>!isBlocked(db,id,r.other_id)).map(r=>({id:r.id,state:r.state,createdAt:r.created_at,user:publicProfile(db,r.other_id,id,now)}));
 return {self:publicProfile(db,id,id,now),friends:db.prepare('SELECT friend_id FROM mp_friends WHERE user_id=? ORDER BY created_at DESC').all(id).filter(r=>!isBlocked(db,id,r.friend_id)).map(r=>publicProfile(db,r.friend_id,id,now)),
 incoming:list("SELECT id,state,created_at,sender_id AS other_id FROM mp_friend_requests WHERE recipient_id=? AND state='pending' ORDER BY created_at DESC"),
 outgoing:list("SELECT id,state,created_at,recipient_id AS other_id FROM mp_friend_requests WHERE sender_id=? AND state='pending' ORDER BY created_at DESC"),
 blocked:db.prepare('SELECT blocked_id FROM mp_blocks WHERE user_id=? ORDER BY created_at DESC').all(id).map(r=>publicProfile(db,r.blocked_id,id,now)).filter(Boolean),privacy:privacy(db,id),party:getParty(db,id,now),
 mutes:db.prepare('SELECT muted_id AS userId,scope,muted,volume FROM mp_chat_mutes WHERE user_id=?').all(id).map(r=>({...r,muted:!!r.muted})),
 partyInvites:db.prepare("SELECT i.*,p.leader_id,p.mode FROM mp_party_invites i JOIN mp_parties p ON p.id=i.party_id WHERE i.recipient_id=? AND i.state='pending' AND i.expires_at>? ORDER BY i.created_at DESC").all(id,now).filter(r=>!isBlocked(db,id,r.sender_id)).map(r=>({id:r.id,partyId:r.party_id,mode:r.mode,sender:publicProfile(db,r.sender_id,id,now),expiresAt:r.expires_at})),serverNow:now};
}
function room(db,userId,payload={}){
 const scope=payload.scope||'party';if(scope==='party'){const party=currentParty(db,userId);return {scope,id:party.id,team:null};}
 if(!['match','team'].includes(scope))throw fail(400,'Choose party, match, or team chat');
 const row=payload.matchId?db.prepare('SELECT m.*,p.team FROM mp_matches m JOIN mp_participations p ON p.match_id=m.id WHERE p.user_id=? AND m.id=?').get(userId,payload.matchId):db.prepare("SELECT m.*,p.team FROM mp_matches m JOIN mp_participations p ON p.match_id=m.id WHERE p.user_id=? AND m.status NOT IN ('finished','cancelled','abandoned') ORDER BY m.created_at DESC LIMIT 1").get(userId);
 if(!row)throw fail(403,'You are not in that match');
 if(scope==='team'&&(!Modes.isTeam(row.mode.replace(/^(casual|custom|ranked)-/,''))&&!row.mode.startsWith('ltm:')||row.mode.startsWith('ltm:')&&!Modes.isTeam(JSON.parse(row.state_json||'{}').context?.ltmDefinition?.rules?.baseMode)||row.team===null))throw fail(400,'Deathmatch has no team chat');
 return {scope,id:row.id,team:scope==='team'?row.team:null};
}
function muted(db,a,b,scope,channel='text'){return !!db.prepare("SELECT 1 FROM mp_chat_mutes WHERE user_id=? AND muted_id=? AND muted=1 AND scope IN ('all',?,?)").get(a,b,scope,channel);}
function chat(db,user,payload={},context={}){
 const now=stamp(context.now),r=room(db,user.id,payload);
 if(payload.text!==undefined){
  if(typeof payload.text!=='string')throw fail(400,'Chat must contain text');const text=payload.text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim();if(!text||text.length>500)throw fail(400,'Chat must be 1–500 characters');
  const recent=db.prepare('SELECT created_at FROM mp_chat WHERE sender_id=? ORDER BY id DESC LIMIT 1').get(user.id);
  if(recent&&now-recent.created_at<600)throw fail(429,'Please wait before sending another message','CHAT_RATE_LIMIT');
  if(db.prepare('SELECT COUNT(*) AS n FROM mp_chat WHERE sender_id=? AND created_at>?').get(user.id,now-10000).n>=10)throw fail(429,'Chat is being sent too quickly','CHAT_RATE_LIMIT');
  const result=db.prepare('INSERT INTO mp_chat(scope,scope_id,team,sender_id,body,created_at) VALUES(?,?,?,?,?,?)').run(r.scope,r.id,r.team,user.id,text,now);
  return {id:Number(result.lastInsertRowid),scope:r.scope,scopeId:r.id,team:r.team,sender:publicProfile(db,user.id,user.id,now),text,createdAt:now};
 }
 const after=Number.isSafeInteger(Number(payload.after))?Math.max(0,Number(payload.after)):0;
 const rows=db.prepare('SELECT * FROM mp_chat WHERE scope=? AND scope_id=? AND id>? AND (team IS NULL OR team=?) ORDER BY id DESC LIMIT 100').all(r.scope,r.id,after,r.team).reverse();
 return {scope:r.scope,scopeId:r.id,messages:rows.filter(m=>!isBlocked(db,user.id,m.sender_id)&&!muted(db,user.id,m.sender_id,r.scope)).map(m=>({id:m.id,scope:m.scope,scopeId:m.scope_id,team:m.team,sender:publicProfile(db,m.sender_id,user.id,now),text:m.body,createdAt:m.created_at})),cursor:rows.at(-1)?.id||after};
}
function authorizeVoice(db,senderId,recipientId,scope='party',context={}){
 if(senderId===recipientId||isBlocked(db,senderId,recipientId)||muted(db,recipientId,senderId,'voice','voice')||muted(db,recipientId,senderId,scope,'voice'))return false;
 try{const a=room(db,senderId,{scope,matchId:context.matchId}),b=room(db,recipientId,{scope,matchId:context.matchId});return ['party','team'].includes(scope)&&a.id===b.id&&a.team===b.team;}catch{return false;}
}
function handle({db,user,method,pathname,body={},url,now=Date.now()}){
 if(!pathname.startsWith('/api/social/'))return null;if(!user?.id)throw fail(401,'Sign in to use multiplayer');userExists(db,user.id);now=stamp(now);
 if(method==='POST'&&(!body||typeof body!=='object'||Array.isArray(body)))throw fail(400,'Social actions require an object');
 const route=pathname.slice('/api/social/'.length),id=user.id,result=(data,status=200)=>({status,data});
 if(method==='GET'){
  if(route==='bootstrap')return result(bootstrap(db,user,now));
  if(route==='search'){const query=String(url?.searchParams?.get('q')||'').trim();if(query.length<2)return result({players:[]});if(query.length>24)throw fail(400,'Search is too long');const term=query.toLocaleLowerCase('en-US').replace(/[\\%_]/g,'\\$&');return result({players:db.prepare("SELECT id FROM users WHERE disabled_at IS NULL AND id<>? AND username_key LIKE ? ESCAPE '\\' ORDER BY username_key LIMIT 25").all(id,term+'%').filter(r=>!isBlocked(db,id,r.id)).map(r=>publicProfile(db,r.id,id,now))});}
  if(route==='chat')return result(chat(db,user,{scope:url?.searchParams?.get('scope')||'party',after:url?.searchParams?.get('after')||0,matchId:url?.searchParams?.get('matchId')||undefined},{now}));
  throw fail(404,'Social endpoint not found');
 }
 if(method!=='POST')throw fail(405,'Method not allowed');
 return transaction(db,()=>{
  if(route==='friends/request'){
   const target=userExists(db,body.userId);if(!canInteract(db,id,target))throw fail(403,'Friend request is unavailable');if(!privacy(db,target).allowFriendRequests)throw fail(403,'This player is not accepting requests');
   if(friends(db,id,target))return result({alreadyFriends:true});
   const reverse=db.prepare("SELECT id FROM mp_friend_requests WHERE sender_id=? AND recipient_id=? AND state='pending'").get(target,id);if(reverse)throw fail(409,'Accept this player’s incoming request');
   let request=db.prepare("SELECT id FROM mp_friend_requests WHERE sender_id=? AND recipient_id=? AND state='pending'").get(id,target);
   if(!request){if(db.prepare("SELECT COUNT(*) AS n FROM mp_friend_requests WHERE sender_id=? AND state='pending'").get(id).n>=50)throw fail(429,'Too many pending friend requests');request={id:'friend:'+crypto.randomUUID()};db.prepare("INSERT INTO mp_friend_requests(id,sender_id,recipient_id,state,created_at,updated_at) VALUES(?,?,?,'pending',?,?)").run(request.id,id,target,now,now);}return result({requestId:request.id},201);
  }
  if(route==='friends/accept'||route==='friends/decline'){
   const request=db.prepare('SELECT * FROM mp_friend_requests WHERE id=?').get(String(body.requestId||''));if(!request||request.recipient_id!==id)throw fail(403,'That request is not yours');
   if(request.state!=='pending')return result({state:request.state});
   const accept=route.endsWith('accept');if(accept&&!canInteract(db,id,request.sender_id))throw fail(403,'This request is unavailable');
   db.prepare('UPDATE mp_friend_requests SET state=?,updated_at=? WHERE id=?').run(accept?'accepted':'declined',now,request.id);
   if(accept){const put=db.prepare('INSERT OR IGNORE INTO mp_friends(user_id,friend_id,created_at) VALUES(?,?,?)');put.run(id,request.sender_id,now);put.run(request.sender_id,id,now);}return result({state:accept?'accepted':'declined'});
  }
  if(route==='friends/remove'){userExists(db,body.userId);db.prepare('DELETE FROM mp_friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(id,body.userId,body.userId,id);return result({removed:true});}
  if(route==='block'){
   const target=userExists(db,body.userId);if(id===target)throw fail(400,'Cannot block yourself');db.prepare('INSERT OR IGNORE INTO mp_blocks(user_id,blocked_id,created_at) VALUES(?,?,?)').run(id,target,now);
   db.prepare('DELETE FROM mp_friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(id,target,target,id);
   db.prepare("UPDATE mp_friend_requests SET state='blocked',updated_at=? WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)").run(now,id,target,target,id);
   db.prepare("UPDATE mp_party_invites SET state='blocked',updated_at=? WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)").run(now,id,target,target,id);
   // An idle/queued party cannot be used to evade a block. Active gameplay is
   // retained, with voice and chat filtering enforced separately.
   if(sameParty(db,id,target)){const p=currentParty(db,id);if(!['matched','playing'].includes(p.queue_status)){if(p.leader_id===id){db.prepare('DELETE FROM mp_party_members WHERE user_id=?').run(target);setQueue(db,p.id,'idle',null,now);}else leaveParty(db,id,now);}}
   return result({blocked:true});
  }
  if(route==='unblock'){db.prepare('DELETE FROM mp_blocks WHERE user_id=? AND blocked_id=?').run(id,String(body.userId||''));return result({blocked:false});}
  if(route==='privacy'){
   const old=privacy(db,id),p={...old};for(const [key,value]of Object.entries(body))if(['showOnline','showActivity','allowFriendRequests'].includes(key)){if(typeof value!=='boolean')throw fail(400,'Privacy values must be on or off');p[key]=value;}
   if(body.partyJoin!==undefined){if(!['invite','friends'].includes(body.partyJoin))throw fail(400,'Choose friends or invitation-only parties');p.partyJoin=body.partyJoin;}
   db.prepare('INSERT INTO mp_privacy(user_id,show_online,show_activity,allow_friend_requests,party_join,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET show_online=excluded.show_online,show_activity=excluded.show_activity,allow_friend_requests=excluded.allow_friend_requests,party_join=excluded.party_join,updated_at=excluded.updated_at').run(id,Number(p.showOnline),Number(p.showActivity),Number(p.allowFriendRequests),p.partyJoin,now);return result({privacy:p});
  }
  if(route==='party/create')return result({party:createParty(db,id,now)},201);
  if(route==='party/invite'){
   const target=userExists(db,body.userId),party=leaderParty(db,id);editableParty(party);if(!canInteract(db,id,target))throw fail(403,'Invitation unavailable');
   const members=db.prepare('SELECT user_id FROM mp_party_members WHERE party_id=?').all(party.id);if(members.some(m=>isBlocked(db,target,m.user_id)))throw fail(403,'Invitation unavailable');if(members.length>=10)throw fail(409,'Party is full');
   if(!friends(db,id,target))throw fail(403,'Add this player as a friend before inviting');
   let invite=db.prepare("SELECT id FROM mp_party_invites WHERE party_id=? AND recipient_id=? AND state='pending'").get(party.id,target);
   if(invite)db.prepare('UPDATE mp_party_invites SET expires_at=?,updated_at=? WHERE id=?').run(now+600000,now,invite.id);
   else{invite={id:'invite:'+crypto.randomUUID()};db.prepare('INSERT INTO mp_party_invites(id,party_id,sender_id,recipient_id,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(invite.id,party.id,id,target,now+600000,now,now);}return result({inviteId:invite.id},201);
  }
  if(route==='party/respond'){
   const invite=db.prepare('SELECT * FROM mp_party_invites WHERE id=?').get(String(body.inviteId||''));if(!invite||invite.recipient_id!==id)throw fail(403,'That invitation is not yours');
   if(body.accept===false){db.prepare("UPDATE mp_party_invites SET state='declined',updated_at=? WHERE id=? AND state='pending'").run(now,invite.id);return result({party:getParty(db,id,now)});}
   if(body.accept!==true)throw fail(400,'Accept or decline the invitation');if(invite.state==='accepted'&&getParty(db,id,now)?.id===invite.party_id)return result({party:getParty(db,id,now)});
   if(invite.state!=='pending'||invite.expires_at<=now)throw fail(409,'Invitation expired');return result({party:joinParty(db,id,invite.party_id,now,invite.id)});
  }
  if(route==='party/join')return result({party:joinParty(db,id,String(body.partyId||''),now)});
  if(route==='party/leave')return result({party:leaveParty(db,id,now)});
  if(route==='party/remove'){
   const party=leaderParty(db,id);editableParty(party);if(body.userId===id)throw fail(400,'Use Leave Party to leave');db.prepare('DELETE FROM mp_party_members WHERE party_id=? AND user_id=?').run(party.id,String(body.userId||''));return result({party:getParty(db,id,now)});
  }
  if(route==='party/ready'){
   const party=currentParty(db,id);editableParty(party);if(typeof body.ready!=='boolean')throw fail(400,'Ready must be on or off');db.prepare('UPDATE mp_party_members SET ready=? WHERE user_id=?').run(Number(body.ready),id);return result({party:getParty(db,id,now)});
  }
  if(route==='party/mode'){
   const party=leaderParty(db,id);editableParty(party);const limited=typeof body.mode==='string'&&body.mode.startsWith('ltm:')?ModeRules.activeLTMs(now).find(d=>d.id===body.mode.slice(4)):null;if(!MODES.has(body.mode)&&!limited)throw fail(400,'Unknown multiplayer mode');
   if((limited?Modes.isTeam(limited.rules.baseMode):Modes.isTeam(body.mode.replace(/^(casual|custom|ranked)-/,'')))&&db.prepare('SELECT COUNT(*) AS n FROM mp_party_members WHERE party_id=?').get(party.id).n>(limited?.teamSize||5))throw fail(409,'Party exceeds this mode’s team size');
   db.prepare('UPDATE mp_parties SET mode=?,updated_at=? WHERE id=?').run(body.mode,now,party.id);db.prepare('UPDATE mp_party_members SET ready=0 WHERE party_id=?').run(party.id);return result({party:getParty(db,id,now)});
  }
  if(route==='chat')return result(chat(db,user,body,{now}),201);
  if(route==='mute'){
   const target=userExists(db,body.userId),scope=body.scope||'all';if(id===target)throw fail(400,'Cannot mute yourself');if(!['all','party','match','team','text','voice'].includes(scope))throw fail(400,'Invalid mute scope');
   if(body.muted!==undefined&&typeof body.muted!=='boolean')throw fail(400,'Mute must be on or off');const volume=body.volume===undefined?1:Number(body.volume);if(!Number.isFinite(volume)||volume<0||volume>2)throw fail(400,'Volume must be between 0 and 2');
   db.prepare('INSERT INTO mp_chat_mutes(user_id,muted_id,scope,muted,volume,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,muted_id,scope) DO UPDATE SET muted=excluded.muted,volume=excluded.volume,updated_at=excluded.updated_at').run(id,target,scope,body.muted===false?0:1,volume,now);return result({muted:body.muted!==false,volume});
  }
  if(route==='report'){
   const target=userExists(db,body.userId),reason=String(body.reason||'').trim();if(id===target||reason.length<3||reason.length>500)throw fail(400,'Describe the issue in 3–500 characters');
   let chatId=null;if(body.chatId!==undefined){const message=db.prepare('SELECT * FROM mp_chat WHERE id=? AND sender_id=?').get(Number(body.chatId),target);if(!message)throw fail(404,'Chat message not found');const access=room(db,id,{scope:message.scope,matchId:message.scope==='party'?undefined:message.scope_id});if(access.id!==message.scope_id||message.team!==null&&message.team!==access.team)throw fail(403,'That message is not available');chatId=message.id;}
   if(db.prepare('SELECT COUNT(*) AS n FROM mp_reports WHERE reporter_id=? AND created_at>?').get(id,now-60000).n>=5)throw fail(429,'Too many reports in a short time');
   const reportId='report:'+crypto.randomUUID();db.prepare('INSERT INTO mp_reports(id,reporter_id,reported_id,reason,chat_id,created_at) VALUES(?,?,?,?,?,?)').run(reportId,id,target,reason,chatId,now);return result({reportId},201);
  }
  throw fail(404,'Social endpoint not found');
 });
}
module.exports={handle,bootstrap,getParty,setQueue,touchPresence,disconnectPresence,isBlocked,canInteract,publicProfile,chat,authorizeVoice,MODES};
