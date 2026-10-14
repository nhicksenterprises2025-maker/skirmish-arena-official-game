'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite'),Social=require('../social.cjs');
const migrations=['006_overclock_commerce.sql','012_human_multiplayer.sql'].map(file=>fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));
function fixture(file=':memory:'){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,username_key TEXT,password_hash TEXT,disabled_at INTEGER); CREATE TABLE worlds(user_id TEXT PRIMARY KEY,save_json TEXT,revision INTEGER NOT NULL CHECK(revision>=1))');for(const migration of migrations)db.exec(migration);
 for(let n=1;n<=12;n++){const id='u'+n;db.prepare('INSERT INTO users(id,username,username_key,password_hash) VALUES(?,?,?,?)').run(id,'Player_'+n,('Player_'+n).toLowerCase(),'secret-never-public');db.prepare('INSERT INTO worlds(user_id,save_json,revision) VALUES(?,?,1)').run(id,JSON.stringify({config:{skin:n%8},progression:{totalXPUnits:15000},ranked:{participants:{[id]:{ratingUnits:60000}}},private:{token:'not-public'}}));}
 return db;
}
function call(db,id,route,body={},now=100000,method='POST'){
 const url=new URL('/api/social/'+route,'http://localhost');return Social.handle({db,user:{id},method,pathname:url.pathname,body,url,now}).data;
}
function befriends(db,a,b){const request=call(db,a,'friends/request',{userId:b});return call(db,b,'friends/accept',{requestId:request.requestId});}
function addParty(db,leader,member){befriends(db,leader,member);const invite=call(db,leader,'party/invite',{userId:member});return call(db,member,'party/respond',{inviteId:invite.inviteId,accept:true}).party;}
test('Public search and bootstrap expose actual public progression only, with privacy-aware presence',()=>{
 const db=fixture();try{
  const p=Social.publicProfile(db,'u2','u1',100000);assert.equal(p.level,2);assert.equal(p.operator,2);assert.equal(p.rank.rating,600);assert.equal(JSON.stringify(p).includes('secret'),false);assert.equal(JSON.stringify(p).includes('not-public'),false);
  Social.touchPresence(db,'u2','connection:2','Ranked TDM',100000);assert.equal(Social.publicProfile(db,'u2','u1',100000).activity,null);befriends(db,'u1','u2');assert.equal(Social.publicProfile(db,'u2','u1',100000).activity,'Ranked TDM');
  call(db,'u2','privacy',{showActivity:false,showOnline:false});assert.equal(Social.publicProfile(db,'u2','u1',100000).online,false);assert.equal(Social.publicProfile(db,'u2','u1',100000).activity,null);
  const url=new URL('http://localhost/api/social/search?q=Player_1');const found=Social.handle({db,user:{id:'u1'},method:'GET',pathname:url.pathname,url,now:100000}).data.players;assert.equal(found.length,3);assert.ok(found.every(p=>p.username.startsWith('Player_1')));
 }finally{db.close();}
});
test('Requests are idempotent, recipient-authorized, symmetric on accept, and declined/removed safely',()=>{
 const db=fixture();try{
  const r=call(db,'u1','friends/request',{userId:'u2'});assert.equal(call(db,'u1','friends/request',{userId:'u2'}).requestId,r.requestId);
  assert.throws(()=>call(db,'u3','friends/accept',{requestId:r.requestId}),e=>e.status===403);assert.throws(()=>call(db,'u2','friends/request',{userId:'u1'}),e=>e.status===409);
  call(db,'u2','friends/accept',{requestId:r.requestId});call(db,'u2','friends/accept',{requestId:r.requestId});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_friends').get().n,2);
  assert.equal(Social.bootstrap(db,{id:'u1'},100000).friends[0].id,'u2');call(db,'u1','friends/remove',{userId:'u2'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_friends').get().n,0);
  const next=call(db,'u1','friends/request',{userId:'u2'});call(db,'u2','friends/decline',{requestId:next.requestId});assert.equal(Social.bootstrap(db,{id:'u2'},100000).incoming.length,0);
  call(db,'u2','privacy',{allowFriendRequests:false});assert.throws(()=>call(db,'u3','friends/request',{userId:'u2'}),e=>e.status===403);
 }finally{db.close();}
});
test('Two- and five-player parties persist with unique slots, leader authority and ready/mode rules',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-social-')),file=path.join(dir,'social.sqlite');let db=fixture(file);try{
  const party=call(db,'u1','party/create').party;assert.equal(call(db,'u1','party/create').party.id,party.id);
  let added=addParty(db,'u1','u2');assert.equal(added.members.length,2);assert.equal(added.members.filter(m=>m.id==='u2').length,1);
  for(const id of ['u3','u4','u5'])added=addParty(db,'u1',id);assert.equal(added.members.length,5);
  assert.throws(()=>call(db,'u2','party/mode',{mode:'ranked-tdm'}),e=>e.status===403);assert.throws(()=>call(db,'u2','party/remove',{userId:'u3'}),e=>e.status===403);
  call(db,'u2','party/ready',{ready:true});assert.equal(Social.getParty(db,'u2').members.find(m=>m.id==='u2').ready,true);call(db,'u1','party/mode',{mode:'ranked-tdm'});assert.ok(Social.getParty(db,'u1').members.every(m=>!m.ready));
  db.close();db=new DatabaseSync(file);assert.equal(Social.getParty(db,'u2').id,party.id);assert.equal(Social.getParty(db,'u2').mode,'ranked-tdm');assert.equal(Social.getParty(db,'u2').members.length,5);
  Social.setQueue(db,party.id,'queued');assert.throws(()=>call(db,'u1','party/mode',{mode:'casual-tdm'}),e=>e.status===409);call(db,'u2','party/leave');assert.equal(Social.getParty(db,'u1').queueStatus,'idle');
  call(db,'u1','party/leave');assert.equal(Social.getParty(db,'u3').leaderId,'u3');assert.equal(Social.getParty(db,'u2'),null);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Invitation-only and friends-join policies cannot bypass blocks or party capacity',()=>{
 const db=fixture();try{
  const party=call(db,'u1','party/create').party;befriends(db,'u1','u2');assert.throws(()=>call(db,'u2','party/join',{partyId:party.id}),e=>e.status===403);
  call(db,'u1','privacy',{partyJoin:'friends'});call(db,'u2','party/join',{partyId:party.id});assert.throws(()=>call(db,'u3','party/join',{partyId:party.id}),e=>e.status===403);
  call(db,'u2','block',{userId:'u1'});assert.equal(Social.getParty(db,'u2'),null);assert.equal(Social.isBlocked(db,'u1','u2'),true);assert.throws(()=>call(db,'u1','party/invite',{userId:'u2'}),e=>e.status===403);assert.throws(()=>call(db,'u2','friends/request',{userId:'u1'}),e=>e.status===403);
  call(db,'u2','unblock',{userId:'u1'});call(db,'u1','party/mode',{mode:'casual-deathmatch'});for(let n=2;n<=10;n++)addParty(db,'u1','u'+n);assert.equal(Social.getParty(db,'u1').members.length,10);
  assert.throws(()=>call(db,'u1','party/mode',{mode:'casual-tdm'}),e=>e.status===409);befriends(db,'u1','u11');assert.throws(()=>call(db,'u1','party/invite',{userId:'u11'}),e=>e.status===409);
 }finally{db.close();}
});
test('Stale disconnects cannot hide a reconnected player or duplicate persistent membership',()=>{
 const db=fixture();try{
  call(db,'u1','party/create');addParty(db,'u1','u2');Social.touchPresence(db,'u2','old','Lobby',100000);assert.equal(Social.touchPresence(db,'u2','new','Lobby',100050),'old');
  assert.equal(Social.disconnectPresence(db,'u2','old',100100),false);assert.equal(Social.publicProfile(db,'u2','u1',100100).online,true);assert.equal(Social.getParty(db,'u2').members.length,2);
  assert.equal(Social.disconnectPresence(db,'u2','new',100100),true);assert.equal(Social.publicProfile(db,'u2','u1',100100).online,false);Social.touchPresence(db,'u2','third','Lobby',100200);assert.equal(Social.getParty(db,'u2').members.length,2);
 }finally{db.close();}
});
test('Party text and opt-in voice authorization respect scoped mutes, blocks, membership and reports',()=>{
 const db=fixture();try{
  call(db,'u1','party/create');addParty(db,'u1','u2');addParty(db,'u1','u3');const sent=call(db,'u2','chat',{scope:'party',text:'<script> harmless text </script>'},100000);assert.equal(sent.text,'<script> harmless text </script>');
  assert.equal(Social.chat(db,{id:'u1'},{scope:'party'},{now:100000}).messages.length,1);assert.throws(()=>call(db,'u2','chat',{scope:'party',text:'spam'},100100),e=>e.status===429);
  assert.equal(Social.authorizeVoice(db,'u2','u1','party'),true);call(db,'u1','mute',{userId:'u2',scope:'voice',muted:true,volume:.4});assert.equal(Social.authorizeVoice(db,'u2','u1','party'),false);assert.equal(Social.chat(db,{id:'u1'},{scope:'party'}).messages.length,1);
  call(db,'u1','mute',{userId:'u2',scope:'all',muted:true});assert.equal(Social.chat(db,{id:'u1'},{scope:'party'}).messages.length,0);
  const report=call(db,'u3','report',{userId:'u2',reason:'Harassment in party',chatId:sent.id});assert.ok(report.reportId);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mp_reports').get().n,1);
  assert.throws(()=>call(db,'u4','report',{userId:'u2',reason:'Not a member',chatId:sent.id}),e=>e.status===409);
  const party=Social.getParty(db,'u1');Social.setQueue(db,party.id,'playing','match:fake');call(db,'u1','block',{userId:'u2'});assert.equal(Social.getParty(db,'u1').members.length,3);assert.equal(Social.chat(db,{id:'u1'},{scope:'party'}).messages.length,0);assert.equal(Social.authorizeVoice(db,'u2','u3','party'),true);assert.equal(Social.authorizeVoice(db,'u2','u1','party'),false);
 }finally{db.close();}
});
test('Match/team chat is server-membership authorized and Deathmatch never has team chat/voice',()=>{
 const db=fixture();try{
  const put=db.prepare('INSERT INTO mp_matches(id,mode,status,state_json,created_at,updated_at) VALUES(?,?,?,\'{}\',?,?)');put.run('m:tdm','ranked-tdm','playing',100000,100000);put.run('m:dm','casual-deathmatch','playing',100000,100000);
  const member=db.prepare('INSERT INTO mp_participations VALUES(?,?,?,\'{}\')');member.run('m:tdm','u1',0);member.run('m:tdm','u2',0);member.run('m:tdm','u3',1);member.run('m:dm','u4',null);member.run('m:dm','u5',null);
  call(db,'u1','chat',{scope:'team',matchId:'m:tdm',text:'Blue squad'},100000);assert.equal(Social.chat(db,{id:'u2'},{scope:'team',matchId:'m:tdm'}).messages.length,1);assert.equal(Social.chat(db,{id:'u3'},{scope:'team',matchId:'m:tdm'}).messages.length,0);
  assert.equal(Social.authorizeVoice(db,'u1','u2','team',{matchId:'m:tdm'}),true);assert.equal(Social.authorizeVoice(db,'u1','u3','team',{matchId:'m:tdm'}),false);assert.equal(Social.authorizeVoice(db,'u1','u2','match',{matchId:'m:tdm'}),false);
  assert.throws(()=>call(db,'u4','chat',{scope:'team',matchId:'m:dm',text:'No team'}),e=>e.status===400);assert.equal(Social.authorizeVoice(db,'u4','u5','team',{matchId:'m:dm'}),false);
  assert.throws(()=>call(db,'u6','chat',{scope:'match',matchId:'m:tdm',text:'Forged member'}),e=>e.status===403);
  call(db,'u4','chat',{scope:'match',matchId:'m:dm',text:'Good game'});assert.equal(Social.chat(db,{id:'u5'},{scope:'match',matchId:'m:dm'}).messages.length,1);
 }finally{db.close();}
});
test('Social schema is additive and cannot reset worlds, bot identities, progression or credits',()=>{
 const db=fixture();try{
  const before=db.prepare('SELECT * FROM worlds ORDER BY user_id').all();call(db,'u1','party/create');addParty(db,'u1','u2');call(db,'u1','chat',{text:'Ready'});call(db,'u2','block',{userId:'u1'});assert.deepEqual(db.prepare('SELECT * FROM worlds ORDER BY user_id').all(),before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
