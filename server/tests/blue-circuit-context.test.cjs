'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {engine}=require('../../dev/simulate.cjs'),{publicFacts,queryIntent}=require('../dialogue-context.cjs'),XP=require('../../progression.js');
const {createDatabase}=require('../db.cjs'),{writeWorld}=require('../world.cjs'),AI=require('../local-ai.cjs'),{recordSocialEvents,selectPatchContacts}=require('../social-events.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){return engine().context.SAR.getUniverse();}
function database(world){const db=createDatabase(':memory:'),id='context-fixture';db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id,'PRIVATE-HASH',Date.now(),Date.now());writeWorld(db,id,world,0);AI.dispose(db);return {db,id};}
test('public leaderboard uses the real table sort, stable identity and all fifty personas without private state',()=>{
  const world=fixture();for(const [i,name] of world.activeBotNames.entries()){world.bots[name].career.kills=i===0?100:i<=6?200:10;world.bots[name].career.deaths=10;}
  world.privateSecret='NEVER-COPY';world.config.privateSecret='NEVER-COPY';world.bots.Ace.hiddenLiveEnemyPosition={x:999};
  const before=JSON.stringify(world),facts=publicFacts(world,'bot_0001',{playerReply:'what do you rank on the leaderboard?'},12345);
  assert.equal(facts.leaderboard.position,7);assert.equal(facts.leaderboard.sortMetric,'kd');assert.equal(facts.leaderboard.metricValue,10);assert.equal(facts.leaderboard.mode,'tdm (standard and ranked)');assert.equal(facts.scope.retrievedAt,12345);assert.equal(facts.scope.rulesetRevision,world.patchState.rulesetRevision);
  for(const name of world.activeBotNames){const id=world.bots[name].profile.id;assert.deepEqual(publicFacts(world,id).identity,{name,botId:id});}
  assert.equal(JSON.stringify(world),before);assert.ok(!JSON.stringify(facts).includes('NEVER-COPY'));assert.ok(!JSON.stringify(facts).includes('hiddenLiveEnemyPosition'));assert.throws(()=>publicFacts(world,'custom-clone:bot_0001'),/stable bot identity/);assert.throws(()=>publicFacts(world,'human-account'),/stable bot identity/);
  assert.equal(queryIntent({playerReply:'what is your rank?'}).kind,'ambiguous-rank');assert.equal(publicFacts(world,'bot_0001',{playerReply:'your deathmatch leaderboard position?'}).leaderboard.available,false);
  const unsupported=publicFacts(world,'bot_0001',{playerReply:'what do you rank on the bot leaderboard, all eligible modes, sorted by K/D?'});assert.equal(unsupported.query.kind,'leaderboard');assert.equal(unsupported.query.requestedMode,'all modes');assert.equal(unsupported.leaderboard.available,false);assert.equal(unsupported.leaderboard.position,null);assert.equal(unsupported.leaderboard.metricValue,null);assert.match(unsupported.leaderboard.unavailableReason,/no all-modes aggregate/);
  for(const question of ['your team deathmatch leaderboard position?','what do you rank on the bot leaderboard, TDM standard and ranked, sorted by K/D?']){const scoped=publicFacts(world,'bot_0001',{playerReply:question});assert.equal(scoped.query.kind,'leaderboard');assert.equal(scoped.leaderboard.available,true);assert.equal(scoped.leaderboard.position,7);}
});
test('ranked title, fractional ELO, independent streak and recent result use only the selected bot ledger',()=>{
  const world=fixture(),input={participantId:'bot_0001',matchId:'ranked:test:1',kind:'ranked',sessionType:'ranked',mode:'tdm',eligible:true,practice:false,at:Date.now(),won:true,stats:{kills:12,deaths:7,assists:3,damage:3456,headshots:2,timeAlive:80},events:XP.events(),leaders:{kills:false,assists:false,alive:false}};
  XP.awardRanked(world.ranked,input);world.ranked.participants['human-account']={ratingUnits:1000000,winStreak:99,awards:{}};
  const receipt=world.ranked.participants.bot_0001.awards[input.matchId],facts=publicFacts(world,'bot_0001',{playerReply:'what is your ranked title and ELO?'});
  assert.equal(facts.query.kind,'ranked');assert.equal(facts.ranked.rating,receipt.afterUnits/100);assert.equal(facts.ranked.rankName,XP.rankView(receipt.afterUnits).rankName);assert.equal(facts.ranked.winStreak,1);assert.equal(facts.ranked.recentResults[0].matchId,input.matchId);assert.equal(facts.ranked.games,1);assert.notEqual(facts.ranked.rating,10000);assert.equal(publicFacts(world,'bot_0002').ranked.rating,0);
});
test('current registry, exact changes and registered modes enter context automatically',()=>{
  const world=fixture(),current=world.patchState;current.weaponStats['Fixture Rifle']={...current.weaponStats['AR-15'],damage:31,role:'Synthetic fixture weapon'};
  world.balancePatchHistory.push({from:'fixture-old',to:current.fingerprint,at:123,changes:[{weapon:'Fixture Rifle',field:'damage',before:29,after:31}]});
  const facts=publicFacts(world,'bot_0001',{playerReply:'what damage does Fixture Rifle do?'});
  assert.equal(facts.weapons[0].name,'Fixture Rifle');assert.equal(facts.weapons[0].stats.damage,31);assert.equal(facts.weapons[0].role,'Synthetic fixture weapon');assert.ok(facts.weaponRegistry.some(w=>w.name==='Fixture Rifle'));assert.equal(facts.weapons[0].categoryRank,null,'No invented telemetry for a new weapon');assert.equal(facts.activeBalanceChanges.changes[0].after,31);
  const registry=require('../../match-modes.js');registry.register('fixture-mode',{...registry.get('tdm'),id:'fixture-mode',label:'Synthetic implemented test mode'});assert.ok(publicFacts(world,'bot_0001').modes.some(m=>m.id==='fixture-mode'));
  assert.ok(publicFacts(fixture(),'bot_0001').activeBalanceChanges.migrationDiffUnavailable);
  assert.ok(publicFacts(fixture(),'bot_0001').activeBalanceChanges.publishedNotes.changes.length,'Fresh account receives shipped current patch notes');
});
test('fresh-account exact historical changes come from active published notes and pass numeric validation',()=>{
  const world=fixture(),facts=publicFacts(world,'bot_0001',{playerReply:'what changed in SR-Aug body damage?'}),change=facts.activeBalanceChanges.changes.find(c=>c.weapon==='SR-Aug'&&c.field==='damage');
  assert.equal(change.before,24);assert.equal(change.after,23);assert.equal(change.source,'published active balance notes');assert.equal(facts.activeBalanceChanges.changes.find(c=>c.weapon==='P90'&&c.field==='reload').before,2.4);
  const output={subject:'SR-Aug',body:'The SR-Aug body damage dropped from 24 to 23 per bullet. It was 24 body damage before.',mood:'neutral',category:'balance',wantsReply:false,certainty:1},context={name:'Ace',authoritativeGameFacts:facts};
  assert.doesNotThrow(()=>AI.mechanicalGuard(output,context));assert.throws(()=>AI.mechanicalGuard({...output,body:'The SR-Aug was 99 body damage before.'},context),/Unsupported.*damage/);
  world.balancePatchHistory.push({to:world.patchState.fingerprint,from:'fixture',at:1,changes:[{weapon:'SR-Aug',field:'damage',before:25,after:23}]});assert.equal(publicFacts(world,'bot_0001',{weapon:'SR-Aug'}).activeBalanceChanges.changes.find(c=>c.weapon==='SR-Aug'&&c.field==='damage').before,25,'The real account migration diff takes precedence');
});
test('mechanical facts match exact displayed TTK including actual burst timing and reloads for every current weapon',()=>{
  const e=engine(),world=e.context.SAR.getUniverse();
  for(const name of Object.keys(e.context.SAR.getWeapons())){
    const facts=publicFacts(world,'bot_0001',{weapon:name}),weapon=facts.weapons.find(w=>w.name===name),display=e.context.SAR.getWeaponDisplayMetrics(name);
    assert.equal(weapon.mechanics.bodyTTK,display.find(r=>r.key==='bodyTtk').value,name+' body TTK');assert.equal(weapon.mechanics.headTTK,display.find(r=>r.key==='headTtk').value,name+' head TTK');assert.equal(weapon.mechanics.preferredTiles,world.patchState.weaponStats[name].preferred/70);
  }
});
test('meta context matches the shipped cohort and mode query rather than legacy mixed telemetry',()=>{
  const e=engine();for(let n=0;n<600;n++)e.step();const world=e.context.SAR.getUniverse();
  for(const cohort of ['bot','human'])for(const mode of ['tdm','deathmatch']){
    const facts=publicFacts(world,'bot_0001',{playerReply:`${cohort} weapon meta ${mode==='deathmatch'?'deathmatch':'tdm'}`}),expected=e.context.SAR.metaRowsForCohort({cohort,mode,sort:{key:'score',dir:-1}}).filter(r=>r.engagements>=5).slice(0,6);
    assert.equal(facts.weaponMeta.scope.cohort,cohort);assert.equal(facts.weaponMeta.scope.mode,mode);assert.deepEqual(facts.weaponMeta.rows.map(r=>[r.name,r.score]),expected.map(r=>[r.name,r.score]));
  }
});
test('patch selection is relevant, capped and deduplicated through the actual world event path',()=>{
  const fs=require('node:fs'),path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../../game.js'),'utf8'),world=fixture(),{db,id}=database(world);
  try{
    const modified=source.replace("'AR-15': { type:'primary', damage:28","'AR-15': { type:'primary', damage:27");assert.notEqual(modified,source);
    // Represent an already accepted old-version world, then run the actual
    // installed migration into the current constants (never permit future data).
    const legacy=engine({},modified).context.SAR.getUniverse();db.prepare('UPDATE worlds SET save_json=? WHERE user_id=?').run(JSON.stringify(legacy),id);
    const next=engine({'sar-persistent-save':JSON.stringify(legacy)}).context.SAR.getUniverse(),chosen=selectPatchContacts(next,['AR-15'],next.patchState.id);
    writeWorld(db,id,next,1);const read=()=>db.prepare("SELECT bot_id,payload_json FROM structured_events WHERE user_id=? AND type IN ('BALANCE_CHANGE','BALANCE_FEEDBACK','NEW_WEAPON')").all(id);
    assert.equal(read().length,chosen.length);assert.ok(read().length<=2);for(const row of read())assert.ok(chosen.some(name=>next.bots[name].profile.id===row.bot_id));writeWorld(db,id,next,2);assert.equal(read().length,chosen.length);
  }finally{AI.dispose(db);db.close();}
});
test('unchanged refresh produces no new events; ranked changes require the bot own immutable result and deduplicate',()=>{
  const world=fixture(),{db,id}=database(world);
  try{
    const before=db.prepare('SELECT COUNT(*) n FROM structured_events').get().n;recordSocialEvents(db,id,world,clone(world),Date.now());assert.equal(db.prepare('SELECT COUNT(*) n FROM structured_events').get().n,before);
    const next=clone(world),botId='bot_0001',matchId='context-ranked',input={participantId:botId,matchId,kind:'ranked',sessionType:'ranked',mode:'tdm',eligible:true,practice:false,at:Date.now(),won:true,stats:{kills:60,deaths:0,assists:0,damage:15000,headshots:0,timeAlive:0},events:XP.events(),leaders:{kills:true,assists:true,alive:true}};
    XP.awardRanked(next.ranked,input);next.rankedResults[matchId]={rows:[{participantId:botId,type:'bot'}]};recordSocialEvents(db,id,world,next,Date.now());recordSocialEvents(db,id,world,next,Date.now());
    const rows=db.prepare("SELECT bot_id,type,payload_json FROM structured_events WHERE type LIKE 'RANKED_%'").all();assert.equal(rows.length,1);assert.equal(rows[0].bot_id,botId);assert.equal(rows[0].type,'RANKED_RANK_UP');assert.equal(JSON.parse(rows[0].payload_json).matchId,matchId);
  }finally{AI.dispose(db);db.close();}
});
