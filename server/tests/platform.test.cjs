'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createDatabase,botId,upsertWorldTables,LATEST_DB_SCHEMA}=require('../db.cjs');
const {createServer}=require('../index.cjs');
const {engine}=require('../../dev/simulate.cjs');
const {readWorld,migrateLocalWorld,validateWorld,writeWorld,refreshWorldSeason}=require('../world.cjs');
const {processEvents,replyToBot,botContext,tournamentEvent}=require('../messages.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const previousOllama=process.env.SAR_OLLAMA_URL;
process.env.SAR_OLLAMA_URL='http://127.0.0.1:1';
test.after(()=>{if(previousOllama===undefined)delete process.env.SAR_OLLAMA_URL;else process.env.SAR_OLLAMA_URL=previousOllama;});
const SEASON_MS=15*86400000;
function seedUser(db,id='user-test'){
  db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'not-a-login-hash',Date.now(),Date.now());return id;
}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
async function stop(server){await new Promise(resolve=>server.close(resolve));}
async function request(base,route,{method='GET',body,cookie,headers={}}={}){
  const response=await fetch(base+route,{method,headers:{...(body!==undefined||['POST','PUT'].includes(method)?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const raw=await response.text();return {status:response.status,body:raw?(String(response.headers.get('content-type')).includes('application/json')?JSON.parse(raw):raw):null,cookie:response.headers.get('set-cookie'),headers:response.headers};
}
function sessionFor(db,userId){const token=crypto.randomBytes(32).toString('base64url'),now=Date.now();db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),userId,now,now+86400000,now);return 'sar_session='+token;}
function oldLocalSave(){
  const save=copy(engine().dev.inspect().SAVE);save.schema=16;delete save.patchState.aiSamples;delete save.aiRevision;delete save.modeStats;
  delete save.patchState.participantAnalytics; // Actual pre-SKYLINE saves have combined history only.
  delete save.playerCareer;delete save.playerSeasons;delete save.config.viewMode;
  for(const bot of Object.values(save.bots)){
    delete bot.profile.id;delete bot.career.timePlayed;
    for(const row of Object.values(bot.career.weaponUsage))delete row.games;
  }
  for(const row of [...Object.values(save.patchState.meta),...Object.values(save.patchState.skillStrata).flatMap(Object.values)])for(const key of ['engagementDistance','engagementDistanceN','classifiedKills','soloKills','finisherKills'])delete row[key];
  save.bots.Ace.profile.power=97;save.bots.Ace.profile.rank=8;save.bots.Ace.profile.personality.aggression=.231;
  save.bots.Ace.career.kills=77;save.bots.Ace.career.weaponUsage['AR-15'].k=77;
  save.patchState.meta['AR-15'].kills=77;save.meta=save.patchState.meta;
  save.bots.Ace.recentForm=6;save.bots.Ace.familiarity.AK47=43;
  save.futureWorld={keep:37};save.config.futurePreference='retain';
  const prior=copy(save.seasons.current);prior.startAt-=SEASON_MS;prior.endAt-=SEASON_MS;prior.finalizedAt=prior.endAt;prior.winner={name:'Ace',games:10,wins:7,losses:3,kills:77,deaths:10,damage:9000,kd:7.7,zeroDeaths:false};
  save.seasons.current.number=2;save.seasons.history=[prior];
  save.patchArchives=[{id:'historical-unverified',reason:'original local archive',meta:{'AR-15':{kills:12,deaths:8,shots:100,hits:15,damage:1000}}}];
  return save;
}

function precedingBalanceSource(){
  // Use the actual preceding weapon sheet with the current schema17 save engine.
  // This models the cloud world already stored by the installed1.5.0 build.
  const current=fs.readFileSync(path.join(__dirname,'../../game.js'),'utf8'),prior=fs.readFileSync(path.join(__dirname,'../../dev/fixtures/game-1.3.0.js'),'utf8');
  const start='const WEAPONS = ',end='const PRIMARYS';
  return (current.slice(0,current.indexOf(start))+prior.slice(prior.indexOf(start),prior.indexOf(end))+current.slice(current.indexOf(end))).replace("version:'WEAPON BALANCE UPDATE 4.0'","version:'WEAPON BALANCE UPDATE 3.0'");
}

function seedStoredWorld(db,id,save,revision=7){
  // A pre-existing database row is a fixture, not a request to publish old balance.
  const now=Date.now();db.prepare('INSERT INTO worlds(user_id,revision,schema_version,save_json,updated_at,season_start_at,season_end_at) VALUES(?,?,?,?,?,?,?)').run(id,revision,save.schema,JSON.stringify(save),now,save.seasons.current.startAt,save.seasons.current.endAt);
  upsertWorldTables(db,id,save,now);
}

test('published weapon additions migrate an existing 11-weapon cloud world into 14 without losing data or accepting forged measurements',async()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'balance-migration-user'),cookie=sessionFor(db,id),app=createServer({db}),base=await listen(app.server);
  try{
    const oldEngine=engine({},precedingBalanceSource());for(let i=0;i<500;i++)oldEngine.step();const old=copy(oldEngine.dev.inspect().SAVE);assert.equal(Object.keys(old.patchState.weaponStats).length,11);
    old.futureWorld={preserved:913};old.bots.Ace.profile.customCosmetic={owned:true};old.config.sidearm='X16';seedStoredWorld(db,id,old);
    const messageId=crypto.randomUUID();db.prepare('INSERT INTO messages(id,user_id,bot_id,direction,type,body,created_at,source) VALUES(?,?,?,?,?,?,?,?)').run(messageId,id,'bot_0001','bot','PLAYER_REPLY','Keep this conversation.',Date.now(),'test');
    const fetched=await request(base,'/api/world',{cookie});assert.equal(fetched.status,200);assert.deepEqual(fetched.body.world.save,old);assert.equal(fetched.body.world.revision,7);
    const nextEngine=engine({'sar-persistent-save':JSON.stringify(fetched.body.world.save)}),next=copy(nextEngine.dev.inspect().SAVE);assert.equal(Object.keys(next.patchState.weaponStats).length,14);assert.equal(next.patchState.weaponStats['X-16 Auto'].damage,21);assert.equal(next.patchState.generation,old.patchState.generation+1);
    assert.deepEqual(next.patchArchives.at(-1).meta,old.patchState.meta);assert.deepEqual(next.patchArchives.at(-1).perBot,old.patchState.perBot);assert.deepEqual(next.patchArchives.at(-1).skillStrata,old.patchState.skillStrata);assert.deepEqual(next.patchArchives.at(-1).weaponStats,old.patchState.weaponStats);
    assert.equal(next.patchArchives.at(-1).meta['X-16 Auto'],undefined,'new weapon gets no invented old samples');assert.equal(next.patchState.meta['X-16 Auto'].kills,0);assert.equal(next.patchState.meta['X-16 Auto'].shots,0);
    assert.deepEqual(next.seasons,old.seasons);assert.deepEqual(next.playerCareer.kills,old.playerCareer.kills);assert.deepEqual(next.futureWorld,old.futureWorld);assert.equal(next.config.sidearm,'X16');
    for(const name of old.activeBotNames){assert.deepEqual(next.bots[name].profile,old.bots[name].profile);assert.equal(next.bots[name].career.kills,old.bots[name].career.kills);assert.equal(next.bots[name].career.damage,old.bots[name].career.damage);assert.equal(next.bots[name].recentForm,old.bots[name].recentForm);for(const weapon of Object.keys(old.bots[name].familiarity))assert.equal(next.bots[name].familiarity[weapon],old.bots[name].familiarity[weapon]);}
    const rejected=mutate=>{const forged=copy(next);mutate(forged);assert.throws(()=>writeWorld(db,id,forged,7),error=>error.status===400||error.code==='SAVE_REJECTED');assert.equal(readWorld(db,id).revision,7);};
    rejected(s=>delete s.patchState.meta['X-16 Auto']);rejected(s=>s.patchState.meta['unknown weapon']=copy(s.patchState.meta['X-16 Auto']));rejected(s=>s.patchArchives=s.patchArchives.filter(p=>p.id!==old.patchState.id));rejected(s=>delete s.patchArchives.at(-1).meta['9mm']);rejected(s=>s.bots.Ace.career.weaponUsage['X-16 Auto'].damage=1);
    const updated=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:7,save:next}});assert.equal(updated.status,200);assert.equal(updated.body.revision,8);assert.deepEqual(readWorld(db,id).save,next);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weapon_patch_stats WHERE user_id=? AND patch_id=?').get(id,old.patchState.id).n,11);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weapon_patch_stats WHERE user_id=? AND patch_id=?').get(id,next.patchState.id).n,14);
    const backup=db.prepare('SELECT save_json FROM world_backups WHERE user_id=? AND revision=7').get(id);assert.deepEqual(JSON.parse(backup.save_json),old);assert.equal(db.prepare('SELECT body FROM messages WHERE id=?').get(messageId).body,'Keep this conversation.');
    const context=botContext(db,id,'bot_0001');assert.equal(context.authoritativeGameFacts.currentPatchId,next.patchState.id);assert.equal(context.patchPerformance,undefined,'current dialogue context does not mix archived patch telemetry');
    for(let i=0;i<1800;i++)nextEngine.step();const continued=copy(nextEngine.dev.inspect().SAVE);assert.ok(continued.patchState.meta['X-16 Auto'].shots>0,'new sidearm must have actual automatic combat measurements');
    const saved=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:8,save:continued}});assert.equal(saved.status,200);assert.equal(saved.body.revision,9);assert.deepEqual(readWorld(db,id).save.patchArchives,next.patchArchives);
    const reloaded=engine({'sar-persistent-save':JSON.stringify(readWorld(db,id).save)});assert.equal(reloaded.dev.inspect().SAVE.patchArchives.length,next.patchArchives.length);assert.equal(reloaded.dev.inspect().SAVE.patchState.id,next.patchState.id);
    const localMigration=migrateLocalWorld(old);assert.equal(Object.keys(localMigration.patchState.weaponStats).length,14);assert.deepEqual(localMigration.patchArchives.at(-1).meta,old.patchState.meta);assert.equal(writeWorld(db,seedUser(db,'local-old-sheet'),localMigration,0,{importing:true,originalSave:old}).revision,1);
  }finally{await stop(app.server);await processEvents(db,id,2);db.close();}
});

test('a dormant old-balance cloud account can cross its season deadline after a weapon addition',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'dormant-balance-user'),save=copy(engine({},precedingBalanceSource()).dev.inspect().SAVE),now=Date.now();
  try{
    save.seasons.current.startAt=now-SEASON_MS-1000;save.seasons.current.endAt=now-1000;save.playerSeasons.current.startAt=save.seasons.current.startAt;save.playerSeasons.current.endAt=save.seasons.current.endAt;
    save.futureWorld={keep:'dormant progress'};seedStoredWorld(db,id,save);
    const refreshed=refreshWorldSeason(db,id,now);assert.equal(refreshed.revision,8);assert.equal(refreshed.save.seasons.current.number,2);assert.equal(refreshed.save.playerSeasons.current.number,2);assert.equal(Object.keys(refreshed.save.patchState.weaponStats).length,11,'deadline refresh keeps cached-client balance available for its checkpoint');
    assert.deepEqual(refreshed.save.patchState.meta,save.patchState.meta);assert.deepEqual(refreshed.save.seasons.history[0].stats,save.seasons.current.stats);assert.deepEqual(refreshed.save.playerSeasons.history[0].stats,save.playerSeasons.current.stats);assert.deepEqual(refreshed.save.futureWorld,save.futureWorld);assert.equal(refreshed.save.bots.Ace.profile.id,save.bots.Ace.profile.id);assert.equal(refreshed.save.bots.Ace.career.kills,save.bots.Ace.career.kills);
    assert.equal(refreshWorldSeason(db,id,now).revision,8);assert.deepEqual(JSON.parse(db.prepare('SELECT save_json FROM world_backups WHERE user_id=? AND revision=7').get(id).save_json),save);
    const upgraded=migrateLocalWorld(refreshed.save);assert.equal(Object.keys(upgraded.patchState.weaponStats).length,14);assert.deepEqual(upgraded.patchArchives.at(-1).meta,save.patchState.meta);assert.equal(writeWorld(db,id,upgraded,8).revision,9);assert.equal(refreshWorldSeason(db,id,now).revision,9);
  }finally{db.close();}
});

test('a cached old PWA checkpoints its persisted patch after deploy, then updates without losing progress or allowing a balance rollback',async()=>{
  const db=createDatabase(':memory:'),id=seedUser(db,'cached-pwa-user'),cookie=sessionFor(db,id),app=createServer({db}),base=await listen(app.server),oldSource=precedingBalanceSource();
  try{
    const prior=engine({},oldSource);for(let i=0;i<300;i++)prior.step();const initial=copy(prior.dev.inspect().SAVE);seedStoredWorld(db,id,initial);
    const cached=engine({'sar-persistent-save':JSON.stringify(initial)},oldSource);for(let i=0;i<300;i++)cached.step();const checkpoint=copy(cached.dev.inspect().SAVE);assert.equal(checkpoint.patchState.id,initial.patchState.id);assert.ok(checkpoint.bots.Ace.career.timeAlive>initial.bots.Ace.career.timeAlive);
    const rejected=async(save,revision=7)=>{const response=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:revision,save}});assert.equal(response.status,409);assert.equal(readWorld(db,id).revision,revision);};
    const edited=copy(checkpoint);edited.patchState.weaponStats['AR-15'].damage++;await rejected(edited);
    const rehashed=copy(edited);rehashed.patchState.fingerprint=cached.dev.balanceFingerprint(rehashed.patchState.weaponStats);rehashed.patchState.id=rehashed.patchState.fingerprint+'-'+rehashed.patchState.generation;await rejected(rehashed);
    const stolen=copy(checkpoint);stolen.bots.Ace.profile.power--;await rejected(stolen);
    assert.throws(()=>writeWorld(db,seedUser(db,'fresh-old-client'),checkpoint,0),/published game build/,'fresh old-sheet writes do not inherit another account’s persisted patch');
    const result=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:7,save:checkpoint}});assert.equal(result.status,200);assert.equal(result.body.revision,8);assert.deepEqual(readWorld(db,id).save,checkpoint);
    const stale=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:7,save:checkpoint}});assert.equal(stale.status,409);assert.equal(stale.body.code,'REVISION_CONFLICT');
    // Applying1.5.1 after its checkpoint runs the actual game's balance migration.
    const updated=engine({'sar-persistent-save':JSON.stringify(readWorld(db,id).save)}),current=copy(updated.dev.inspect().SAVE);assert.equal(Object.keys(current.patchState.weaponStats).length,14);assert.deepEqual(current.patchArchives.at(-1).meta,checkpoint.patchState.meta);assert.deepEqual(current.patchArchives.at(-1).perBot,checkpoint.patchState.perBot);assert.deepEqual(current.patchArchives.at(-1).skillStrata,checkpoint.patchState.skillStrata);
    const applied=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:8,save:current}});assert.equal(applied.status,200);assert.equal(applied.body.revision,9);
    const oldClientAfterUpdate=engine({'sar-persistent-save':JSON.stringify(current)},oldSource),rollback=copy(oldClientAfterUpdate.dev.inspect().SAVE);await rejected(rollback,9);assert.deepEqual(readWorld(db,id).save,current);
    const backup=db.prepare('SELECT save_json FROM world_backups WHERE user_id=? AND revision=8').get(id);assert.deepEqual(JSON.parse(backup.save_json),checkpoint);
  }finally{await stop(app.server);await processEvents(db,id,2);db.close();}
});

test('database migration keeps existing users and takes a pre-migration backup',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-db-test-')),file=path.join(dir,'world.sqlite');
  let db=new DatabaseSync(file);
  try{
    db.exec(fs.readFileSync(path.join(__dirname,'../migrations/001_core.sql'),'utf8'));db.exec('PRAGMA user_version=1');seedUser(db,'preserved');db.close();
    db=createDatabase(file);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);
    assert.equal(db.prepare('SELECT username FROM users WHERE id=?').get('preserved').username,'preserved');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM save_migrations').get().n,LATEST_DB_SCHEMA-1);
    const backup=fs.readdirSync(dir).find(name=>name.includes('pre-schema1'));assert.ok(backup);
    const old=new DatabaseSync(path.join(dir,backup),{readOnly:true});assert.equal(old.prepare('PRAGMA user_version').get().user_version,1);assert.equal(old.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);old.close();
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('username/password signup, persistent sessions, recovery rotation, logout and request isolation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sar-auth-test-')),file=path.join(dir,'accounts.sqlite');
  let app=createServer({db:createDatabase(file)}),base=await listen(app.server);
  try{
    assert.equal((await request(base,'/api/world')).status,401);
    assert.equal((await request(base,'/api/auth/signup',{method:'POST',body:{username:'<bad>',password:'long-enough-password'}})).status,400);
    const signup=await request(base,'/api/auth/signup',{method:'POST',body:{username:'Noah_Test',password:'long-enough-password'}});
    assert.equal(signup.status,201);assert.match(signup.body.recoveryCode,/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
    assert.ok(signup.cookie.includes('HttpOnly')&&signup.cookie.includes('SameSite=Lax')&&signup.cookie.includes('Max-Age='));
    const cookie=signup.cookie.split(';')[0],id=signup.body.account.id;
    assert.equal((await request(base,'/api/bootstrap',{cookie})).body.authenticated,true);
    const stored=app.db.prepare('SELECT password_hash,recovery_hash FROM users WHERE id=?').get(id);
    assert.match(stored.password_hash,/^\$2[aby]\$12\$/);assert.notEqual(stored.password_hash,'long-enough-password');assert.notEqual(stored.recovery_hash,signup.body.recoveryCode);
    const duplicate=await request(base,'/api/auth/signup',{method:'POST',body:{username:'nOaH_tEsT',password:'another-password'}});assert.equal(duplicate.status,409);
    assert.equal((await request(base,'/api/auth/login',{method:'POST',body:{username:'Noah_Test',password:'incorrect-password'}})).status,401);
    assert.equal((await request(base,'/api/auth/login',{method:'POST',body:{username:'Noah_Test',password:'long-enough-password'+ 'a'.repeat(100)}})).status,401);
    assert.equal((await request(base,'/api/auth/logout',{method:'POST',cookie,headers:{origin:'https://unrelated.example'}})).status,403);
    assert.equal((await request(base,'/api/auth/logout',{method:'POST',cookie,headers:{'content-type':'text/plain'}})).status,415);
    await stop(app.server);app.db.close();app=createServer({db:createDatabase(file)});base=await listen(app.server);
    assert.equal((await request(base,'/api/bootstrap',{cookie})).body.account.id,id);
    const login=await request(base,'/api/auth/login',{method:'POST',body:{username:'NOAH_TEST',password:'long-enough-password'}});assert.equal(login.status,200);
    const secondCookie=login.cookie.split(';')[0];assert.equal(login.body.account.id,id);
    const recovered=await request(base,'/api/auth/recover',{method:'POST',body:{username:'Noah_Test',recoveryCode:signup.body.recoveryCode.toLowerCase(),newPassword:'new-secure-password'}});
    assert.equal(recovered.status,200);assert.notEqual(recovered.body.recoveryCode,signup.body.recoveryCode);
    assert.equal((await request(base,'/api/bootstrap',{cookie})).body.authenticated,false);
    assert.equal((await request(base,'/api/bootstrap',{cookie:secondCookie})).body.authenticated,false);
    assert.equal((await request(base,'/api/auth/recover',{method:'POST',body:{username:'Noah_Test',recoveryCode:signup.body.recoveryCode,newPassword:'third-secure-password'}})).status,401);
    const recoveredCookie=recovered.cookie.split(';')[0];assert.equal((await request(base,'/api/bootstrap',{cookie:recoveredCookie})).body.authenticated,true);
    assert.equal((await request(base,'/api/auth/logout',{method:'POST',cookie:recoveredCookie})).status,200);assert.equal((await request(base,'/api/bootstrap',{cookie:recoveredCookie})).body.authenticated,false);
    const races=await Promise.all(['race-password-one','race-password-two'].map(newPassword=>request(base,'/api/auth/recover',{method:'POST',body:{username:'Noah_Test',recoveryCode:recovered.body.recoveryCode,newPassword}})));
    assert.deepEqual(races.map(result=>result.status).sort(),[200,401],'a recovery code is single-use even under simultaneous requests');
    assert.equal((await request(base,'/server/db.cjs')).status,404);
    assert.ok([200,204].includes((await request(base,'/api/launcher/update')).status));
    assert.ok([200,204].includes((await request(base,'/api/launcher/update.sig')).status));
    assert.equal((await request(base,'/api/launcher/download/bad%2fpath.exe')).status,400);
  }finally{await stop(app.server);app.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('HTTP import/revision/profile isolation, message read/delete cancellation and admin event transactions',async()=>{
  const db=createDatabase(':memory:'),a=seedUser(db,'universe_a'),b=seedUser(db,'universe_b'),cookieA=sessionFor(db,a),cookieB=sessionFor(db,b),app=createServer({db}),base=await listen(app.server),previousAdmin=process.env.SAR_ADMIN_TOKEN;
  process.env.SAR_ADMIN_TOKEN='backend-test-admin-secret';
  try{
    const local=oldLocalSave(),imported=await request(base,'/api/world/import',{method:'POST',cookie:cookieA,body:{userId:b,save:local}});
    assert.equal(imported.status,201);assert.equal(imported.body.revision,1);assert.equal(readWorld(db,b),null,'frontend-supplied user ID cannot select another universe');
    const original=db.prepare('SELECT save_json FROM world_backups WHERE user_id=? AND revision=0').get(a);assert.deepEqual(JSON.parse(original.save_json),local);
    const e=engine({'sar-persistent-save':JSON.stringify(imported.body.save)});for(let i=0;i<60;i++)e.step();const save=copy(e.dev.inspect().SAVE);
    const update=await request(base,'/api/world',{method:'PUT',cookie:cookieA,body:{baseRevision:1,save}});assert.equal(update.status,200);assert.equal(update.body.revision,2);
    const conflict=await request(base,'/api/world',{method:'PUT',cookie:cookieA,body:{baseRevision:1,save}});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'REVISION_CONFLICT');
    const invalid=copy(save);invalid.bots.Ace.profile.power++;
    const rejected=await request(base,'/api/world',{method:'PUT',cookie:cookieA,body:{baseRevision:2,save:invalid}});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'SAVE_REJECTED');assert.equal(readWorld(db,a).revision,2);
    const profile=await request(base,'/api/profile',{cookie:cookieA});assert.deepEqual(profile.body.playerSeasons,save.playerSeasons);assert.equal(profile.body.preferences.primary,save.config.primary);
    assert.equal((await request(base,'/api/world',{cookie:cookieB})).body.world,null);assert.equal((await request(base,'/api/bots/bot_0001',{cookie:cookieB})).status,404);
    const bot=await request(base,'/api/bots/bot_0001',{cookie:cookieA});assert.equal(bot.body.bot.career.kills,77);assert.equal(bot.body.bot.power,97);
    const messageId=crypto.randomUUID(),eventId=a+':pending-player-message';
    db.prepare('INSERT INTO messages(id,user_id,bot_id,direction,type,event_id,body,created_at,source) VALUES(?,?,?,?,?,?,?,?,?)').run(messageId,a,'bot_0001','player','PLAYER_REPLY',eventId,'remove-this-text',Date.now(),'player');
    db.prepare('INSERT INTO structured_events(id,user_id,bot_id,type,payload_json,created_at) VALUES(?,?,?,?,?,?)').run(eventId,a,'bot_0001','PLAYER_REPLY',JSON.stringify({playerReply:'remove-this-text'}),Date.now());
    db.prepare('INSERT INTO conversation_summaries(user_id,bot_id,summary,last_message_at) VALUES(?,?,?,?)').run(a,'bot_0001','player: remove-this-text',Date.now());
    assert.equal((await request(base,'/api/messages/'+messageId+'/read',{method:'POST',cookie:cookieB})).status,200);assert.equal(db.prepare('SELECT read_at FROM messages WHERE id=?').get(messageId).read_at,null);
    assert.equal((await request(base,'/api/messages/'+messageId,{method:'DELETE',cookie:cookieB})).status,404);
    assert.equal((await request(base,'/api/messages/'+messageId+'/read',{method:'POST',cookie:cookieA})).status,200);assert.ok(db.prepare('SELECT read_at FROM messages WHERE id=?').get(messageId).read_at>0);
    assert.equal((await request(base,'/api/messages/'+messageId,{method:'DELETE',cookie:cookieA})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').get(messageId).n,0);
    const cancelled=db.prepare('SELECT payload_json,messaged_at FROM structured_events WHERE id=?').get(eventId);assert.equal(cancelled.payload_json,'{"deleted":true}');assert.ok(cancelled.messaged_at>0);assert.equal(db.prepare('SELECT summary FROM conversation_summaries WHERE user_id=? AND bot_id=?').get(a,'bot_0001').summary,'');
    const details={name:'Test Cup',startsAt:Date.now()+86400000,participants:['bot_0001'],status:'UPCOMING'};
    assert.equal((await request(base,'/api/admin/tournaments',{method:'POST',cookie:cookieA,body:details})).status,403);
    const duplicate=await request(base,'/api/admin/tournaments',{method:'POST',cookie:cookieA,headers:{'x-sar-admin-token':process.env.SAR_ADMIN_TOKEN},body:{...details,participants:['bot_0001','bot_0001']}});assert.equal(duplicate.status,400);
    const unknown=await request(base,'/api/admin/tournaments',{method:'POST',cookie:cookieA,headers:{'x-sar-admin-token':process.env.SAR_ADMIN_TOKEN},body:{...details,participants:['bot_0001','bot_unknown']}});assert.equal(unknown.status,400);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE kind='legacy'").get().n,0,'failed admin writes roll back the tournament and events');
    const added=await request(base,'/api/admin/tournaments',{method:'POST',cookie:cookieA,headers:{'x-sar-admin-token':process.env.SAR_ADMIN_TOKEN},body:details});assert.equal(added.status,201);
    assert.equal((await request(base,'/api/tournaments',{cookie:cookieA})).body.tournaments.filter(t=>t.kind==='legacy').length,1);assert.equal((await request(base,'/api/tournaments',{cookie:cookieB})).body.tournaments.filter(t=>t.kind==='legacy').length,0);
  }finally{if(previousAdmin===undefined)delete process.env.SAR_ADMIN_TOKEN;else process.env.SAR_ADMIN_TOKEN=previousAdmin;await stop(app.server);await processEvents(db,a,2);db.close();}
});

test('schema 16 import preserves real progress, IDs, patch/season history and normalized SQL',()=>{
  const original=oldLocalSave(),migrated=migrateLocalWorld(original),db=createDatabase(':memory:');
  try{
    const id=seedUser(db);assert.equal(migrated.schema,17);assert.equal(migrated.bots.Ace.profile.id,'bot_0001');assert.equal(migrated.bots.Ace.profile.power,97);
    assert.equal(migrated.bots.Ace.profile.rank,8);assert.equal(migrated.bots.Ace.profile.personality.aggression,.231);assert.equal(migrated.bots.Ace.career.kills,77);
    assert.equal(migrated.bots.Ace.recentForm,6);assert.equal(migrated.bots.Ace.familiarity.AK47,43);assert.equal(migrated.futureWorld.keep,37);assert.equal(migrated.config.futurePreference,'retain');
    assert.deepEqual(migrated.patchArchives,original.patchArchives);assert.deepEqual(migrated.seasons.history,original.seasons.history);assert.equal(migrated.seasons.current.startAt,original.seasons.current.startAt);assert.equal(migrated.seasons.current.endAt,original.seasons.current.endAt);
    assert.equal(migrated.patchState.meta['AR-15'].kills,77);assert.equal(migrated.patchState.meta['AR-15'].classifiedKills,0);assert.equal(migrated.patchState.meta['AR-15'].engagementDistanceN,0);
    assert.equal(writeWorld(db,id,migrated,0,{importing:true}).revision,1);
    assert.deepEqual(readWorld(db,id).save,migrated);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bots WHERE user_id=?').get(id).n,50);
    assert.equal(JSON.parse(db.prepare('SELECT stats_json FROM bot_careers WHERE user_id=? AND bot_id=?').get(id,'bot_0001').stats_json).kills,77);
    assert.equal(JSON.parse(db.prepare('SELECT stats_json FROM weapon_patch_stats WHERE user_id=? AND patch_id=? AND weapon=?').get(id,migrated.patchState.id,'AR-15').stats_json).kills,77);
    assert.equal(db.prepare('SELECT winner_bot_id FROM seasons WHERE user_id=? AND number=1').get(id).winner_bot_id,'bot_0001');
    assert.throws(()=>writeWorld(db,id,migrated,0,{importing:true}),/already has cloud progress/);
    assert.throws(()=>migrateLocalWorld({...original,schema:99}),/newer game version/);
  }finally{db.close();}
});

test('real engine event deltas and completed matches reconcile; stale/reversed/forged saves are rejected',()=>{
  const e=engine(),first=copy(e.dev.inspect().SAVE),db=createDatabase(':memory:'),id=seedUser(db);
  try{
    writeWorld(db,id,first,0);
    let steps=0;while(e.dev.inspect().diagnostics.completedMatches<1&&steps<12000){e.step();steps++;}
    assert.ok(e.dev.inspect().diagnostics.completedMatches>=1,'shipped engine must finish a real match');
    const second=copy(e.dev.inspect().SAVE);assert.equal(writeWorld(db,id,second,1).revision,2);
    const stale=()=>writeWorld(db,id,second,1);assert.throws(stale,error=>error.code==='REVISION_CONFLICT');
    const rejected=mutate=>{const next=copy(second);mutate(next);assert.throws(()=>writeWorld(db,id,next,2),error=>error.status===400||error.code==='SAVE_REJECTED');assert.equal(readWorld(db,id).revision,2);};
    rejected(s=>s.bots.Ace.profile.power++);rejected(s=>s.bots.Ace.profile.personality.aggression=.99);
    rejected(s=>s.bots.Ace.career.damage--);rejected(s=>s.playerCareer.kills=1);
    rejected(s=>s.bots.Ace.career.games++);rejected(s=>s.patchState.meta['AR-15'].engagementDistanceN=-1);
    rejected(s=>s.patchState.perBot.Ace=undefined);rejected(s=>Object.values(Object.values(s.patchState.skillStrata)[0])[0].damage=-1);
    rejected(s=>{s.patchState.id=s.patchState.fingerprint+'-2';s.patchState.generation=2;s.patchArchives.push({...copy(second.patchState),endedAt:Date.now()});});
    rejected(s=>s.seasons.current.endAt++);
    const unsafe=JSON.parse('{"__proto__":{"bad":true}}');rejected(s=>s.extra=unsafe);
    assert.equal(JSON.parse(db.prepare('SELECT stats_json FROM user_career_stats WHERE user_id=?').get(id).stats_json).games,second.playerCareer.games);
    const normalized=db.prepare('SELECT bot_id,stats_json FROM bot_careers WHERE user_id=?').all(id);for(const row of normalized){const name=second.activeBotNames.find(name=>botId(name,second.bots[name])===row.bot_id);assert.deepEqual(JSON.parse(row.stats_json),second.bots[name].career);}
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM world_backups WHERE user_id=?').get(id).n>=1);
  }finally{db.close();}
});

test('database deadlines advance bot and player seasons on server load, preserving immutable archives',()=>{
  const db=createDatabase(':memory:'),id=seedUser(db),save=copy(engine().dev.inspect().SAVE),now=Date.now();
  try{
    save.seasons.current.startAt=now-SEASON_MS*2-1000;save.seasons.current.endAt=save.seasons.current.startAt+SEASON_MS;
    save.playerSeasons.current.startAt=save.seasons.current.startAt;save.playerSeasons.current.endAt=save.seasons.current.endAt;
    save.seasons.current.stats.Ace.games=12;save.seasons.current.stats.Ace.wins=8;save.seasons.current.stats.Ace.losses=4;save.seasons.current.stats.Ace.kills=27;save.seasons.current.stats.Ace.deaths=7;
    save.playerSeasons.current.stats.games=2;save.playerSeasons.current.stats.wins=1;save.playerSeasons.current.stats.losses=1;
    writeWorld(db,id,save,0);const refreshed=refreshWorldSeason(db,id);
    assert.equal(refreshed.revision,2);assert.equal(refreshed.save.seasons.current.number,3);assert.equal(refreshed.save.playerSeasons.current.number,3);
    assert.equal(refreshed.save.seasons.current.startAt,save.seasons.current.startAt+SEASON_MS*2);assert.equal(refreshed.save.seasons.history.length,2);assert.equal(refreshed.save.playerSeasons.history.length,2);
    assert.equal(refreshed.save.seasons.history.find(s=>s.number===1).winner.name,'Ace');assert.equal(refreshed.save.playerSeasons.history.find(s=>s.number===1).stats.games,2);
    assert.equal(refreshWorldSeason(db,id).revision,2,'server refresh is idempotent');
    const changed=copy(refreshed.save);changed.seasons.history.find(s=>s.number===1).winner.name='Nova';
    assert.throws(()=>writeWorld(db,id,changed,2),/Finalized season history changed/);
    const early=copy(refreshed.save),current=copy(early.seasons.current);current.finalizedAt=current.endAt;early.seasons.history.unshift(current);early.seasons.current.number++;early.seasons.current.startAt=current.endAt;early.seasons.current.endAt=current.endAt+SEASON_MS;
    const playerCurrent=copy(early.playerSeasons.current);early.playerSeasons.history.unshift(playerCurrent);early.playerSeasons.current.number++;early.playerSeasons.current.startAt=current.endAt;early.playerSeasons.current.endAt=current.endAt+SEASON_MS;
    assert.throws(()=>writeWorld(db,id,early,2),/server time/);
    assert.equal(readWorld(db,id).revision,2);
  }finally{db.close();}
});

test('existing Meta archive/restart action keeps careers and continues a separate measured sample',async()=>{
  const db=createDatabase(':memory:'),id=seedUser(db),cookie=sessionFor(db,id),app=createServer({db}),base=await listen(app.server);
  try{
    const source=fs.readFileSync(path.join(__dirname,'../../game.js'),'utf8'),e=engine({},source);for(let i=0;i<120;i++)e.step();
    const sampled=copy(e.dev.inspect().SAVE);writeWorld(db,id,sampled,0);
    // The engine helper stubs DOM handlers. Export the actual shipped handler
    // branch inside its retained closure; only confirmation/rendering are stubbed.
    const resetBranch=source.split(/\r?\n/).find(line=>line.includes("if(e.target.id==='resetMeta')"));assert.ok(resetBranch);
    const resetSource=source.replace(/\}\)\(\);\s*$/,`window.__META_RESET=()=>{const e={target:{id:'resetMeta'}},confirm=()=>true,renderMetaModal=()=>{};${resetBranch}};})();`);
    const reloaded=engine({'sar-persistent-save':JSON.stringify(sampled)},resetSource);reloaded.context.__META_RESET();
    const restarted=copy(reloaded.dev.inspect().SAVE);
    assert.equal(restarted.patchState.reason,'manual sample restart');assert.equal(restarted.patchState.fingerprint,sampled.patchState.fingerprint);assert.equal(restarted.patchState.generation,sampled.patchState.generation+1);
    assert.equal(restarted.patchArchives.at(-1).meta['AR-15'].shots,sampled.patchState.meta['AR-15'].shots);
    const first=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:1,save:restarted}});assert.equal(first.status,200);assert.equal(first.body.revision,2);
    for(let i=0;i<150;i++)reloaded.step();
    const continued=copy(reloaded.dev.inspect().SAVE),second=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:2,save:continued}});assert.equal(second.status,200);assert.equal(second.body.revision,3);
    assert.deepEqual(readWorld(db,id).save.patchArchives,restarted.patchArchives);assert.ok(continued.bots.Ace.career.timeAlive>=sampled.bots.Ace.career.timeAlive);
    const damaged=copy(continued);damaged.patchArchives.at(-1).reason='edited archive';const rejected=await request(base,'/api/world',{method:'PUT',cookie,body:{baseRevision:3,save:damaged}});assert.equal(rejected.status,409);assert.equal(rejected.body.code,'SAVE_REJECTED');assert.equal(readWorld(db,id).revision,3);
  }finally{await stop(app.server);await processEvents(db,id,2);db.close();}
});

test('event-driven GPT mock has bounded real context, retries failures, serializes workers and never alters gameplay',async()=>{
  const previousEndpoint=process.env.SAR_GPT_OSS_URL,requests=[],db=createDatabase(':memory:'),id=seedUser(db),save=copy(engine().dev.inspect().SAVE);
  let failNext=false;
  const mock=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);requests.push(JSON.parse(Buffer.concat(chunks).toString()));if(failNext){failNext=false;res.writeHead(503);res.end('{}');return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'<b>Ace:</b> Your message is received. I will keep my aim steady.'}}]}));});
  const endpoint=await listen(mock);process.env.SAR_GPT_OSS_URL=endpoint+'/v1/chat/completions';
  try{
    writeWorld(db,id,save,0);const before=copy(readWorld(db,id).save),botIdValue=save.bots.Ace.profile.id;
    const context=botContext(db,id,botIdValue);assert.equal(context.power,99);assert.equal(context.powerRank,1);assert.equal(context.currentSeason.number,save.seasons.current.number);assert.deepEqual(context.career,save.bots.Ace.career);
    db.prepare('INSERT INTO structured_events(id,user_id,bot_id,type,payload_json,created_at) VALUES(?,?,?,?,?,?)').run('real-event',id,botIdValue,'CAREER_MILESTONE',JSON.stringify({kills:500,actualCareerKills:500}),Date.now());
    const [a,b]=await Promise.all([processEvents(db,id,2),processEvents(db,id,2)]);assert.equal(a.sent+b.sent,1);assert.equal(requests.length,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE event_id=?').get('real-event').n,1);
    assert.equal(requests[0].model,'gpt-oss-20b');assert.match(requests[0].messages[0].content,/Never invent/);
    const payload=JSON.parse(requests[0].messages[1].content);assert.equal(payload.event.id,'real-event');assert.equal(payload.bot.name,'Ace');assert.ok(payload.bot.recentMessages.length<=6);
    db.prepare('INSERT INTO structured_events(id,user_id,bot_id,type,payload_json,created_at) VALUES(?,?,?,?,?,?)').run('cooldown-event',id,botIdValue,'CAREER_MILESTONE','{}',Date.now());
    const reply=await replyToBot(db,id,botIdValue,'Tell me about your current playstyle.');assert.equal(reply.generated,true,'cooldown event must not starve a direct player reply');
    const latest=JSON.parse(requests.at(-1).messages[1].content);assert.equal(latest.event.type,'PLAYER_REPLY');assert.match(latest.event.playerReply,/current playstyle/);assert.ok(latest.bot.recentMessages.length<=6&&latest.bot.conversationSummary.length<=700);
    failNext=true;const delayed=await replyToBot(db,id,botIdValue,'Try this reply after a temporary endpoint outage.');assert.equal(delayed.generated,false);assert.equal(delayed.pending,true);
    await processEvents(db,id,2);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id=? AND direction='bot' AND type='PLAYER_REPLY'").get(id).n,2,'failed generation is retried from stored event');
    assert.deepEqual(readWorld(db,id).save,before,'messages must never mutate careers, balance, Meta, Form or seasons');
    const summary=db.prepare('SELECT summary FROM conversation_summaries WHERE user_id=? AND bot_id=?').get(id,botIdValue).summary;assert.ok(summary.length<=700);
    assert.throws(()=>validateWorld({...before,playerCareer:{...before.playerCareer,hits:-1}}),/Invalid statistics counter/);
    await assert.rejects(replyToBot(db,id,'bot_unknown','Hello'),/Bot profile not found/);await assert.rejects(replyToBot(db,id,botIdValue,'x'.repeat(501)),/1–500/);
    tournamentEvent(db,id,{id:'actual-admin-event',name:'Scheduled League Cup',starts_at:Date.now()+86400000,status:'UPCOMING'},botIdValue);const event=JSON.parse(db.prepare('SELECT payload_json FROM structured_events WHERE type=?').get('TOURNAMENT').payload_json);assert.equal(event.name,'Scheduled League Cup');assert.equal(event.status,'UPCOMING');
  }finally{if(previousEndpoint===undefined)delete process.env.SAR_GPT_OSS_URL;else process.env.SAR_GPT_OSS_URL=previousEndpoint;await stop(mock);db.close();}
});
