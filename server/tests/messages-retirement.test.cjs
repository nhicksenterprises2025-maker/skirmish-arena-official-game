'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{createDatabase,LATEST_DB_SCHEMA}=require('../db.cjs'),{TABLES}=require('../retirement-archive.cjs');
const {profiles}=require('../bot-competition.cjs'),Circuit=require('../tournaments.cjs'),Wallet=require('../wallet.cjs'),{createPayments}=require('../payments.cjs');
const {makeConfig,fakeStripe}=require('./payment-fixture.cjs'),{engine}=require('../../dev/simulate.cjs'),{createServer}=require('../index.cjs'),{writeWorld}=require('../world.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function directory(){return fs.mkdtempSync(path.join(os.tmpdir(),'sar-retirement-'));}
function cleanup(dir){assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
function insert(db,table,row){const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
function tableRows(db,table){return db.prepare('SELECT * FROM '+table).all().map(row=>({...row}));}
const resetTables=['tournament_schedule_anchors','tournament_state_resets','tournament_reset_archives'],tournamentTables=['tournaments','tournament_teams','tournament_registrations','tournament_series','tournament_matches','tournament_stats','tournament_placements','tournament_earnings','tournament_invites','tournament_participants'];
function retained(db,afterReset=false){const completed=new Set(afterReset?db.prepare("SELECT id FROM tournaments WHERE status='COMPLETED'").all().map(row=>row.id):[]);return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name).filter(name=>!TABLES.includes(name)&&!['save_migrations','retired_feature_archives','bot_competition_profiles',...resetTables].includes(name)).map(name=>[name,tableRows(db,name).filter(row=>!afterReset||!tournamentTables.includes(name)||completed.has(name==='tournaments'?row.id:row.tournament_id))]));}
function resetProof(db,file,before){
 const marker=db.prepare('SELECT * FROM tournament_state_resets').get();assert.equal(marker.reset_id,require('../tournament-reset.cjs').RESET_ID);assert.equal(db.prepare('SELECT COUNT(*) n FROM tournament_state_resets').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM save_migrations WHERE version=11').get().n,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM tournaments WHERE status<>'COMPLETED'").get().n,0);
 assert.ok(marker.recovery_file&&fs.existsSync(marker.recovery_file));assert.equal(path.dirname(marker.recovery_file),path.dirname(file));
 const backup=new DatabaseSync(marker.recovery_file,{readOnly:true});try{assert.equal(backup.prepare('PRAGMA user_version').get().user_version,8);assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(retained(backup),before);}finally{backup.close();}
}
function legacy(file){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0');
 for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).filter(name=>/^00[1-8]_/.test(name)).sort()){
  const version=Number(name.slice(0,3));if(version===8)db.exec('PRAGMA foreign_keys=OFF');db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));if(version===8)db.exec('PRAGMA foreign_keys=ON');insert(db,'save_migrations',{version,applied_at:1,note:name});
 }
 db.exec('PRAGMA user_version=8');
 const run=engine();run.dev.queueForMatch();const match=run.dev.inspect().state.matches.find(m=>m?.hasPlayer),human=match.participants.find(p=>p.isPlayer);match.status='active';run.dev.fire(human,0,10000);run.dev.endMatch(match,human.team,'time');const world=run.context.SAR.getUniverse(),now=Date.now();assert.ok(world.progression.totalXPUnits>0);
 insert(db,'users',{id:'retained',username:'retained',username_key:'retained',password_hash:'isolated-fixture-hash',recovery_hash:'isolated-recovery-hash',created_at:now,updated_at:now});
 insert(db,'sessions',{token_hash:'fixture-session-hash',user_id:'retained',created_at:now,expires_at:now+86400000,last_seen_at:now});
 insert(db,'worlds',{user_id:'retained',revision:12,schema_version:world.schema,save_json:JSON.stringify(world),updated_at:now,season_start_at:world.seasons.current.startAt,season_end_at:world.seasons.current.endAt});
 insert(db,'world_backups',{user_id:'retained',revision:11,save_json:JSON.stringify(world),reason:'existing recovery',created_at:now-1});
 for(const p of profiles){const bot=world.bots[p.name];insert(db,'bots',{user_id:'retained',bot_id:p.botId,name:p.name,power:bot.profile.power,power_rank:bot.profile.rank,playstyle:bot.profile.archetype,personality_json:JSON.stringify(bot.profile.personality),form:bot.recentForm,familiarity_json:JSON.stringify(bot.familiarity),updated_at:now});insert(db,'bot_careers',{user_id:'retained',bot_id:p.botId,stats_json:JSON.stringify(bot.career)});insert(db,'bot_social_profiles',{user_id:'retained',bot_id:p.botId,personality_json:JSON.stringify({social:{competitiveness:p.competitiveness,socialness:p.socialness,ego:p.ego},messageBehavior:{retired:true}}),player_respect:62.5,player_trust:37.5,important_memories_json:JSON.stringify([{quote:'recover exact private text'}]),opinions_json:'[{"weapon":"AR-15"}]',state_json:'{"retiredState":true}',last_event_at:now,created_at:now});}
 insert(db,'bot_relationships',{user_id:'retained',bot_id:'bot_0001',other_bot_id:'bot_0002',friendship:42.25,rivalry:3.5,updated_at:now});
 insert(db,'user_career_stats',{user_id:'retained',stats_json:JSON.stringify(world.playerCareer)});
 insert(db,'seasons',{user_id:'retained',number:world.seasons.current.number,start_at:world.seasons.current.startAt,end_at:world.seasons.current.endAt,stats_json:JSON.stringify(world.seasons.current.stats)});
 insert(db,'balance_patches',{user_id:'retained',patch_id:world.patchState.id,generation:world.patchState.generation,fingerprint:world.patchState.fingerprint,started_at:world.patchState.startedAt,reason:'retained active patch',data_json:JSON.stringify(world.patchState)});
 insert(db,'structured_events',{id:'retired-event',user_id:'retained',bot_id:'bot_0001',type:'PLAYER_REPLY',payload_json:'{"playerReply":"archived request"}',created_at:now});
 insert(db,'messages',{id:'retired-message',user_id:'retained',bot_id:'bot_0001',direction:'player',type:'PLAYER_REPLY',event_id:'retired-event',body:'original message',created_at:now,source:'fixture',subject:'recover subject'});
 insert(db,'conversation_summaries',{user_id:'retained',bot_id:'bot_0001',summary:'recover summary',last_message_at:now});
 insert(db,'ai_preferences',{user_id:'retained',settings_json:'{"botMessages":true,"developerMode":true}',updated_at:now});
 insert(db,'ai_jobs',{id:'retired-job',user_id:'retained',bot_id:'bot_0001',event_id:'retired-event',kind:'event',priority:1,status:'RUNNING',request_json:'{"stored":"request"}',created_at:now,updated_at:now});
 insert(db,'ai_generations',{id:'retired-generation',user_id:'retained',job_id:'retired-job',bot_id:'bot_0001',bot_name:'Ace',context_json:'{"fact":17}',prompt_json:'{"prompt":"retired"}',raw_response:'exact old response',validated_json:'{"reply":"old"}',model:'retired-provider',game_version:'fixture',created_at:now});
 insert(db,'ai_training_feedback',{generation_id:'retired-generation',user_id:'retained',rating:'EDIT',corrected_output_json:'{"reply":"recover edit"}',updated_at:now});
 const t=Circuit.createCustom(db,'retained',{name:'Retained tournament',startsAt:now+3600000},now);Circuit.registerTeam(db,'retained',t.id,{name:'Retained team',participantIds:['retained']},now);
 // Persisted historical fixture: every original column/result remains exact,
 // while the separately created unfinished tournament is explicitly retired.
 const done=Circuit.createCustom(db,'retained',{name:'Historical official champion',startsAt:now+7200000},now),historical=Circuit.registerTeam(db,'retained',done.id,{name:'Historical winning roster',participantIds:['retained']},now),team=historical.teams[0];
 db.prepare("UPDATE tournaments SET kind='official',status='COMPLETED',bracket_json=? WHERE id=?").run(JSON.stringify({rulesetId:historical.rulesetId,teams:historical.teams,series:[],invites:[],placements:[{teamId:team.id,placement:1}],earnings:[{participantId:'retained',kind:'user',amount:50000}],historicalSnapshot:{winner:team.name,roster:team.participants}}),done.id);
 insert(db,'tournament_placements',{tournament_id:done.id,team_id:team.id,placement:1});insert(db,'tournament_earnings',{tournament_id:done.id,participant_id:'retained',kind:'user',amount:50000,credited_at:now});insert(db,'tournament_stats',{tournament_id:done.id,participant_id:'retained',stats_json:'{"games":3,"kills":23,"deaths":12,"shots":100,"hits":60}'});
 return db;
}

test('all 50 tournament traits exactly match the pre-retirement source roster',()=>{
 // Captured by comparing every row against the old PROFILES before removing it.
 assert.equal(profiles.length,50);assert.equal(sha(JSON.stringify(profiles.map(p=>[p.botId,p.name,p.competitiveness,p.socialness,p.ego]))),'2c9ea20479e51f4f960e521e1c05762e1b588df69acf5af179bcb2586649be0d');
});

test('schema9 retirement plus schema11 reset preserves shared data/completed official history and restarts idempotently',async()=>{
 const dir=directory(),file=path.join(dir,'fixture.sqlite');let db=legacy(file);
 try{
  db.prepare('UPDATE bot_social_profiles SET personality_json=? WHERE bot_id=?').run(JSON.stringify({social:{competitiveness:.01,socialness:.02,ego:.03}}),'bot_0050');
  const config=makeConfig(),fake=fakeStripe(config),payments=createPayments({db,config,stripe:fake.client});const started=await payments.checkout('retained',{packId:'ac-500',requestId:'migration-checkout'}),order=db.prepare('SELECT * FROM ac_payment_orders WHERE id=?').get(started.order.id);fake.paid(order.session_id);await payments.webhook(...fake.signed(fake.event(order.session_id)));
  const before=retained(db),expected=retained(db,true),retired=Object.fromEntries(TABLES.map(name=>[name,tableRows(db,name)]));db.close();db=createDatabase(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);assert.deepEqual(retained(db,true),expected);resetProof(db,file,before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  for(const name of TABLES)assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(name),undefined);
  const receipt=db.prepare('SELECT * FROM retired_feature_archives').get(),archive=fs.readFileSync(path.join(dir,receipt.archive_file));assert.equal(receipt.bytes,archive.length);assert.equal(receipt.sha256,sha(archive));const records=archive.toString('utf8').trim().split('\n').map(JSON.parse);assert.equal(records[0].sourceSchema,8);assert.deepEqual(JSON.parse(receipt.row_counts_json),Object.fromEntries(TABLES.map(name=>[name,retired[name].length])));
  for(const name of TABLES){assert.deepEqual(records.filter(row=>row.type==='row'&&row.table===name).map(row=>row.row),retired[name]);assert.match(records.find(row=>row.type==='table'&&row.table===name).sql,/CREATE TABLE/);}
  const tournament=Circuit.createCustom(db,'retained',{name:'New event after once-only reset',startsAt:Date.now()+3600000},Date.now());
  for(const row of retired.bot_social_profiles){const p=JSON.parse(row.personality_json).social,kept=db.prepare('SELECT * FROM bot_competition_profiles WHERE user_id=? AND bot_id=?').get(row.user_id,row.bot_id),form=db.prepare('SELECT form FROM bots WHERE user_id=? AND bot_id=?').get(row.user_id,row.bot_id).form;assert.equal(kept.competitiveness,p.competitiveness);assert.equal(kept.socialness,p.socialness);assert.equal(kept.ego,p.ego);assert.equal(kept.player_respect,row.player_respect);assert.equal(kept.player_trust,row.player_trust);assert.equal(Circuit.decision(db,row.user_id,tournament,row.bot_id).accepted,p.competitiveness*.5+p.socialness*.2+p.ego*.15+Math.max(0,Math.min(1,(form+10)/20))*.15>=.37);}
  const backupName=fs.readdirSync(dir).find(name=>name.includes('.pre-schema8-')&&name.endsWith('.sqlite')),backup=new DatabaseSync(path.join(dir,backupName),{readOnly:true});try{assert.equal(backup.prepare('PRAGMA user_version').get().user_version,8);assert.deepEqual(retained(backup),before);for(const name of TABLES)assert.deepEqual(tableRows(backup,name),retired[name]);}finally{backup.close();}
  const artifacts=fs.readdirSync(dir).filter(name=>name.includes('.pre-')).sort();db.close();db=createDatabase(file);assert.deepEqual(retained(db,true),expected);assert.ok(db.prepare('SELECT 1 FROM tournaments WHERE id=?').get(tournament.id),'reopening never resets a newly created tournament');assert.equal(db.prepare('SELECT COUNT(*) n FROM tournament_state_resets').get().n,1);assert.deepEqual(fs.readdirSync(dir).filter(name=>name.includes('.pre-')).sort(),artifacts);assert.equal(db.prepare('SELECT count(*) n FROM retired_feature_archives').get().n,1);assert.equal(Wallet.snapshot(db,'retained','sandbox').balanceUnits,50000);
 }finally{db.close();cleanup(dir);}
});

test('recoverable SQLite snapshot includes committed WAL pages while an older reader prevents checkpointing',()=>{
 const dir=directory(),file=path.join(dir,'fixture.sqlite');let db=legacy(file),reader;
 try{
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');reader=new DatabaseSync(file);reader.exec('BEGIN');assert.equal(reader.prepare('SELECT body FROM messages').get().body,'original message');
  db.prepare('UPDATE messages SET body=? WHERE id=?').run('committed in WAL before retirement','retired-message');assert.ok(fs.statSync(file+'-wal').size>0);
  const raw=path.join(dir,'main-file-only.sqlite');fs.copyFileSync(file,raw);const incomplete=new DatabaseSync(raw,{readOnly:true});try{assert.equal(incomplete.prepare('SELECT body FROM messages').get().body,'original message','a plain file copy would lose the newest committed row');}finally{incomplete.close();}
  const upgraded=createDatabase(file);upgraded.close();assert.equal(reader.prepare('SELECT body FROM messages').get().body,'original message');reader.exec('ROLLBACK');reader.close();reader=null;
  const backup=new DatabaseSync(path.join(dir,fs.readdirSync(dir).find(name=>name.includes('.pre-schema8-')&&name.endsWith('.sqlite'))),{readOnly:true});try{assert.equal(backup.prepare('SELECT body FROM messages').get().body,'committed in WAL before retirement');assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{backup.close();}
  const archive=fs.readdirSync(dir).find(name=>name.endsWith('.jsonl'));assert.ok(fs.readFileSync(path.join(dir,archive),'utf8').includes('committed in WAL before retirement'));
 }finally{if(reader)reader.close();db.close();cleanup(dir);}
});

for(const stage of ['snapshot-fsync','archive-open','archive-rename','migration-after-drop'])test('failure at '+stage+' retains original schema/data and permits one clean retry',()=>{
 const dir=directory(),file=path.join(dir,'fixture.sqlite');let db=legacy(file);const before=retained(db),expected=retained(db,true),messages=tableRows(db,'messages');db.close();db=null;const originals={fsyncSync:fs.fsyncSync,openSync:fs.openSync,renameSync:fs.renameSync,readFileSync:fs.readFileSync};
 try{
  if(stage==='snapshot-fsync')fs.fsyncSync=()=>{throw new Error('isolated snapshot failure');};
  if(stage==='archive-open')fs.openSync=(target,...args)=>{if(String(target).endsWith('.partial'))throw new Error('isolated archive failure');return originals.openSync(target,...args);};
  if(stage==='archive-rename')fs.renameSync=(source,target)=>{if(String(target).endsWith('.jsonl'))throw new Error('isolated rename failure');return originals.renameSync(source,target);};
  if(stage==='migration-after-drop')fs.readFileSync=(target,...args)=>{const value=originals.readFileSync(target,...args);return String(target).endsWith('009_retire_messages.sql')?value+'\nSELECT * FROM isolated_migration_failure;':value;};
  assert.throws(()=>createDatabase(file),/isolated/);Object.assign(fs,originals);db=new DatabaseSync(file);assert.equal(db.prepare('PRAGMA user_version').get().user_version,8);assert.deepEqual(retained(db),before);assert.deepEqual(tableRows(db,'messages'),messages);for(const table of TABLES)assert.ok(db.prepare('SELECT name FROM sqlite_schema WHERE name=?').get(table));db.close();db=createDatabase(file);assert.equal(db.prepare('PRAGMA user_version').get().user_version,LATEST_DB_SCHEMA);assert.deepEqual(retained(db,true),expected);resetProof(db,file,before);assert.equal(db.prepare('SELECT count(*) n FROM retired_feature_archives').get().n,1);
 }finally{Object.assign(fs,originals);if(db)db.close();cleanup(dir);}
});

test('retired HTTP routes/assets are unavailable while account, save, Phone and commerce routes work without provider activity',async()=>{
 const db=createDatabase(':memory:'),now=Date.now(),token=crypto.randomBytes(32).toString('base64url'),realFetch=global.fetch;let app;const calls=[];
 try{
  insert(db,'users',{id:'fixture-api',username:'fixture-api',username_key:'fixture-api',password_hash:'fixture-only',created_at:now,updated_at:now});insert(db,'sessions',{token_hash:sha(token),user_id:'fixture-api',created_at:now,expires_at:now+86400000,last_seen_at:now});writeWorld(db,'fixture-api',engine().context.SAR.getUniverse(),0);
  global.fetch=(...args)=>{calls.push(String(args[0]));throw new Error('No optional provider should be called');};app=createServer({db});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,request=async(route,method='GET')=>realFetch(base+route,{method,headers:{cookie:'sar_session='+token,'content-type':'application/json'},...(['POST','PATCH'].includes(method)?{body:'{}'}:{})});
  const before=db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get('fixture-api').save_json;
  for(const [route,method] of [['/api/messages','GET'],['/api/messages/reply','POST'],['/api/messages/thread/bot_0001','GET'],['/api/ai/status','GET'],['/api/ai/preferences','PATCH'],['/api/ai/lab','POST'],['/api/ai/export','GET'],['/api/ai/jobs/example','GET'],['/ai-ui.js','GET'],['/ai-ui.css','GET']])assert.equal((await request(route,method)).status,404,route);
  const boot=await (await request('/api/bootstrap')).json();assert.equal(boot.authenticated,true);assert.equal(Object.hasOwn(boot,'gptAvailable'),false);assert.equal((await request('/api/world')).status,200);assert.equal((await request('/api/profile')).status,200);assert.equal((await request('/api/commerce/catalog')).status,200);assert.equal((await request('/api/wallet')).status,200);assert.equal((await request('/phone-ui.js')).status,200);assert.equal((await request('/phone-ui.css')).status,200);assert.equal((await (await request('/api/status')).json()).databaseSchema,LATEST_DB_SCHEMA);
  await new Promise(resolve=>setTimeout(resolve,350));assert.deepEqual(calls,[]);assert.equal(db.prepare('SELECT save_json FROM worlds WHERE user_id=?').get('fixture-api').save_json,before);
 }finally{global.fetch=realFetch;if(app)await new Promise(resolve=>app.server.close(resolve));db.close();}
});
