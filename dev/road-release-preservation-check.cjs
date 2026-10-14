'use strict';
// Real HEAD combat/progression followed by the gameplay-quality revision migration.
// Synthetic RAM worlds only. Accounts and commerce caches use the real save keys.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {engine}=require('./simulate.cjs'),{validateWorld}=require('../server/world.cjs');
const root=path.resolve(__dirname,'..'),clone=v=>JSON.parse(JSON.stringify(v));
const same=(a,b,label)=>assert.ok(require('node:util').isDeepStrictEqual(a,b),label);
// The exact clean HEAD at the start of this pass stays reproducible after commit.
const beforeRef=process.argv[2]||'7f9c972a4402dfde01862ad59cd98b8e9559dcdb';
const head=file=>cp.execFileSync('git',['show',beforeRef+':'+file],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const beforeSource=head('game.js'),moduleStub={exports:{}};
new Function('module','exports',head('tactical-instinct.js'))(moduleStub,moduleStub.exports);
const beforeTactics=moduleStub.exports,afterTactics=require('../tactical-instinct.js');
assert.equal(beforeTactics.revision,'tactical-adaptation-1');assert.equal(afterTactics.revision,'gameplay-quality-1');
const clock={value:Date.now()-60000},source=beforeSource.replace("confirm('Archive this sample permanently and start a new current sample?')",'true').replace('async function paintModelPreview(c,options){','async function paintModelPreview(c,options){return;');
const prior=engine({},source,{tactics:beforeTactics,wallNow:()=>clock.value});
const tick=(e,count)=>{for(let i=0;i<count;i++){clock.value+=1000/30;e.step();}};
tick(prior,600);
for(const m of prior.dev.inspect().state.matches)if(m.status==='active')prior.dev.endMatch(m,m.mode==='tdm'?0:m.participants.slice().sort((a,b)=>b.stats.kills-a.stats.kills)[0].id,'time');
prior.ui.flush();
// Exercise the existing explicit archive workflow to seed genuine nonzero history.
prior.ui.dispatch('document','click',{target:prior.ui.element('resetMeta')});prior.ui.flush();
tick(prior,600);
prior.context.SARCloud.state={account:{id:'release-preservation-fixture',username:'Release Preservation'},loaded:true,localMode:true};
prior.context.SARCloud.commitMatch=()=>{};prior.dev.CONFIG.primary='FAL';
prior.context.SAR.startRanked();const match=prior.dev.inspect().state.matches.find(m=>m?.hasPlayer);assert.ok(match);match.status='active';
const player=match.participants.find(a=>a.isPlayer),victim=match.participants.find(a=>a.team!==player.team);let lane;
for(let y=100;y<2200&&!lane;y+=60)for(let x=100;x<3300&&!lane;x+=60)if(!prior.dev.collides(x,y)&&prior.dev.pathClear(x,y,x+200,y))lane={x,y};
assert.ok(lane);Object.assign(player,lane,{dead:false,angle:0});Object.assign(victim,{x:lane.x+150,y:lane.y,hp:48,dead:false});
prior.dev.inspect().state.projectiles=[];assert.equal(prior.dev.fire(player,0,prior.dev.now()+1000),true);
const projectile=prior.dev.inspect().state.projectiles[0];Object.assign(projectile,{x:player.x+30,y:player.y+12,vx:5600,vy:0,travel:30});prior.dev.updateProjectiles(.04,prior.dev.now()+1040);
assert.equal(player.stats.kills,1);prior.dev.endMatch(match,player.team,'time');prior.ui.flush();
for(const m of prior.dev.inspect().state.matches)if(m.status==='active')prior.dev.endMatch(m,m.mode==='tdm'?0:m.participants.slice().sort((a,b)=>b.stats.kills-a.stats.kills)[0].id,'time');prior.ui.flush();
const old=prior.context.SAR.getUniverse();
assert.equal(old.patchArchives.length,1);assert.ok(Object.values(old.patchArchives[0].meta).some(w=>w.shots>0&&w.damage>0));
assert.ok(Object.values(old.patchState.meta).some(w=>w.shots>0&&w.damage>0));assert.ok(old.progression.totalXPUnits>0);assert.ok(old.ranked.participants['release-preservation-fixture'].ratingUnits>0);assert.ok(old.playerCareer.weapons.FAL.k>0);
// Additional persisted records cover historical/private extension preservation.
old.futureOwnership={operator:'steel-recon',appearance:'fixture-owned',style:'alternate'};
old.tournamentHistory=[{id:'preserved-completed-event',name:'Historical Event',ruleset:'historical-fixed-series',winner:{teamId:'winner',roster:['Ace']},completedAt:clock.value-5000}];
const accounts=JSON.stringify({fixture:{username:'Release Preservation',hash:'synthetic-preserved-hash',salt:'synthetic-preserved-salt',createdAt:123}}),session='release-preservation-fixture';
const commerceKey='sar-commerce-v1:http://127.0.0.1:8803:sandbox:'+session,commerce=JSON.stringify({accountId:session,environment:'sandbox',wallet:{accountId:session,environment:'sandbox',balanceUnits:71999,entitlements:[{cosmeticId:'fixture-owned',orderId:'preserved-order'}],equipped:{'steel-recon':{cosmeticId:'fixture-owned',styleId:'alternate'}}},orders:[{id:'preserved-order',status:'fulfilled'}]});
const storage={'sar-persistent-save':JSON.stringify(old),'sar-local-accounts-v1':accounts,'sar-local-session-v1':session,[commerceKey]:commerce};
const after=engine(storage,undefined,{tactics:afterTactics,wallNow:()=>clock.value});
const migrated=after.dev.normalizeSave(old);
let count=0;const pass=name=>{count++;console.log('PASS '+name);};
assert.equal(migrated.patchState.id,old.patchState.id);assert.equal(migrated.patchState.fingerprint,old.patchState.fingerprint);assert.equal(migrated.patchState.balanceVersion,'9.0');
for(const key of ['weaponStats','meta','perBot','skillStrata','completedMatches','observedSeconds'])assert.deepEqual(migrated.patchState[key],old.patchState[key],key);
for(const key of ['bots','playerCareer','seasons','playerSeasons','patchArchives','balancePatchHistory','progression','ranked','rankedResults','modeStats','tournamentHistory','futureOwnership','activeBotNames','config'])assert.deepEqual(migrated[key],old[key],key+' preserved');
assert.deepEqual(migrated.meta,old.meta);pass('Actual nonzero HEAD combat, all historical telemetry, bot identities/Power/familiarity/careers, seasons, XP, Ranked and completed event records survive exactly');
const newSample=migrated.patchState.aiSamples[afterTactics.revision];assert.equal(migrated.aiRevision,afterTactics.revision);assert.ok(newSample);assert.equal(newSample.completedMatches,0);assert.equal(newSample.observedSeconds,0);assert.deepEqual(newSample.perBot,{});assert.deepEqual(newSample.skillStrata,{});
for(const [name,row]of Object.entries(newSample.meta))assert.deepEqual(row,after.dev.blankWeaponMeta(name));
for(const [revision,sample]of Object.entries(old.patchState.aiSamples))assert.deepEqual(migrated.patchState.aiSamples[revision],sample,'historical '+revision);
const oldAnalytics=old.patchState.participantAnalytics.samples,newAnalytics=migrated.patchState.participantAnalytics.samples;
for(const [revision,sample]of Object.entries(oldAnalytics))assert.deepEqual(newAnalytics[revision],sample);
for(const mode of ['tdm','deathmatch'])for(const cohort of ['human','bot']){const s=newAnalytics[afterTactics.revision][mode][cohort];assert.equal(s.completedMatches,0);assert.deepEqual(s.participants,{});assert.deepEqual(s.skillStrata,{});for(const [name,row]of Object.entries(s.meta))assert.deepEqual(row,after.dev.blankWeaponMeta(name));}
pass('Separate gameplay-quality-1 AI and mode/cohort samples start empty; every prior revision remains immutable and no Balance9 archive/reset is added');
const reloaded=engine({...storage,'sar-persistent-save':JSON.stringify(migrated)},undefined,{tactics:afterTactics,wallNow:()=>clock.value});
const again=reloaded.dev.normalizeSave(migrated);
assert.deepEqual(again.patchState.aiSamples,migrated.patchState.aiSamples);assert.deepEqual(again.patchState.participantAnalytics,migrated.patchState.participantAnalytics);
for(const e of [after,reloaded]){assert.equal(e.data.get('sar-local-accounts-v1'),accounts);assert.equal(e.data.get('sar-local-session-v1'),session);assert.equal(e.data.get(commerceKey),commerce);}
const cold=reloaded.context.SAR.getUniverse();
for(const [name,bot]of Object.entries(cold.bots)){
 const current=clone(bot),previous=clone(migrated.bots[name]);
 // Meta-reading caches are scoped to AI revision by the existing architecture.
 // Keep every permanent/unknown field; exclude only these three derived caches.
 for(const key of ['metaPatch','metaReadAt','perceivedMeta']){delete current[key];delete previous[key];}
 same(current,previous,name+' permanent bot fields on cold restart');
 assert.equal(bot.metaPatch,cold.patchState.id+':'+afterTactics.revision);
}
for(const key of ['playerCareer','seasons','playerSeasons','patchArchives','balancePatchHistory','progression','ranked','rankedResults','modeStats','tournamentHistory','futureOwnership'])same(cold[key],migrated[key],key+' cold restart');
pass('Repeat migration/cold restart are idempotent; account/session and nonzero Arena Credit/owned-appearance caches stay byte-for-byte unchanged');
validateWorld(old);validateWorld(migrated,{save:old});validateWorld(again,{save:migrated});
const forged=clone(again);forged.patchState.aiSamples[beforeTactics.revision].observedSeconds++;
assert.throws(()=>validateWorld(forged,{save:migrated}),/Historical AI revision changed|samples disagree/);
const archiveMutation=clone(again);archiveMutation.patchArchives[0].meta['AR-15'].damage++;
assert.throws(()=>validateWorld(archiveMutation,{save:migrated}),/Archived patch telemetry changed|samples disagree/);
pass('Actual server world validation accepts the additive migration/retry and rejects mutations of historical AI measurements or archived weapon telemetry');
console.log(`${count} preservation groups passed`);
