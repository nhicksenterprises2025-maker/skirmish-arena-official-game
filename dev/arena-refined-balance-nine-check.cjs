'use strict';
// Isolated real-engine acceptance for the supplied Audit 4 sheet. No owner data writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs'),XP=require('../progression.js'),{validateWorld}=require('../server/world.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const beforeDir=process.env.ARENA_REFINED_AUDIT4_BEFORE||path.join(os.homedir(),'OneDrive','Documents','ChatGPT','freeshui','arena-refined-audit-4','before');
const oldSource=fs.readFileSync(path.join(beforeDir,'game.js'),'utf8'),previous=JSON.parse(fs.readFileSync(path.join(beforeDir,'balance-8.0-authoritative.json'),'utf8'));
const preferred=Number(process.argv[2]);
assert.ok(Number.isFinite(preferred)&&preferred>0,'Pass the explicitly supplied FAL PreferredWorld as the first argument. Do not infer it.');
const exposed=source.replace('window.SAR = {','window.__NINE={PRIMARYS,SIDEARMS,coverageState,underSampledWeaponBoost,chooseBotPrimary,weaponSheet,weaponDisplayMetrics,loadoutCard,weaponDescription,makeWeaponState,updateBurst,effectiveSpreadDeg,updateCrosshairVisual,damageAtRange,recordParticipantEvent,recordParticipantCompletion,recordPatchEvent,commitMatchXP,WEAPON_PATCH_NOTES};window.SAR = {');
const make=(storage={},options={})=>engine(storage,exposed,options),clone=value=>JSON.parse(JSON.stringify(value)),near=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-8,label+': '+a+' != '+b);
const checks=[],pass=test=>{checks.push(test);console.log('PASS '+test);};
const fields=['type','role','auto','damage','head','spread','walkSpread','sprintSpread','adsSpread','falloffStart','falloff','speed','hitSpeed','mag','reserve','reload','pellets','burstCount','preferred'];
// Expected inputs are transcribed from the user's supplied sheet, independent of game.js.
const table={
 'AR-15':['primary','All-rounder',true,28,42,2.7,2.9,3.6,1.5,22,.025,80,.30,40,120,2.10,1,1,900],
 'AK47':['primary','Heavy rifle',true,34,50,4,4.5,5.2,1.6,25,.028,74,.35,36,120,2.75,1,1,820],
 'SMG-9':['primary','Close tracking',true,19,29,3.1,3.3,3.7,1.8,11,.043,62,.17,42,144,1.90,1,1,520],
 'Pump Shotgun':['primary','Burst shotgun',false,124,248,6.5,7.5,9,3,4,.10,48,1.50,5,30,2.40,8,1,330],
 'Auto 12':['primary','Auto shotgun',true,49,99,7.45,8.5,10,2.5,5,.08,50,.51,10,50,4.60,6,1,300],
 'LR-762':['primary','Marksman rifle',false,63,124,10,12,15,1.2,32,.015,105,.77,10,60,3.05,1,1,1250],
 'LW Tundra':['primary','Sniper rifle',false,115,175,12.2,14,18,1,45,.01,125,1.40,4,25,2.80,1,1,1500],
 'War Head LMG':['primary','Sustained-fire LMG',true,40,60,5.35,5.8,6.2,1.8,24,.02,81,.42,75,225,4.70,1,1,1000],
 'P90':['primary','Ranged SMG',true,25,40,2.2,2.4,2.8,1.2,20,.032,70,.23,36,144,2.20,1,1,720],
 '9mm':['sidearm','Heavy sidearm',false,28,50,4.75,5,5.45,1.1,13,.04,60,.27,16,60,1.50,1,1,440],
 'X16':['sidearm','Fast sidearm',false,24,34,4.75,4.4,4.75,1.3,11,.045,58,.19,12,72,1.00,1,1,390],
 'X-16 Auto':['sidearm','Auto sidearm',true,21,30,4.65,5,5.35,1.5,10,.0475,62,.19,26,104,1.60,1,1,430],
 'SR-Aug':['primary','Triple Burst AR',true,23,40,7,4.75,5.5,2.2,19,.024,88,.70,39,156,2.90,1,3,750],
 'SPAS-12':['primary','3 Shot Shotgun',false,100,210,5.8,5.925,6.25,1.7,7,.05,75,1,3,12,3.60,12,1,420],
 'FAL':['primary','Semi-Auto AR',false,48,72,8.5,10,12.5,2,28,.03,88,.26,20,80,3.40,1,1,preferred]
};
const e=make(),api=e.context.__NINE,weapons=e.context.SAR.getWeapons();
assert.deepEqual(Object.keys(weapons),Object.keys(table));
for(const [name,row]of Object.entries(table))fields.forEach((field,index)=>assert.equal(field==='burstCount'?(weapons[name][field]||1):weapons[name][field],row[index],name+' '+field));
for(const [name,old]of Object.entries(previous.weapons)){
 const expected={...old};fields.forEach((field,index)=>{if(field!=='burstCount'||old[field]!==undefined||table[name][index]!==1)expected[field]=table[name][index];});
 assert.deepEqual(weapons[name],expected,name+' supplied updates only; non-sheet fields preserved');
}
assert.equal(weapons['SR-Aug'].burstSpacing,.065);
assert.equal(e.context.SAR.getUniverse().patchState.balanceVersion,'9.0');
assert.equal(e.context.SAR.getVersion().version,JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version);
assert.notEqual(e.context.SAR.getVersion().version,'9.0','Application identity is separate from weapon balance');
for(const [name,tiles]of Object.entries({'AR-15':'12.86','X-16 Auto':'6.14','SR-Aug':'10.71','SPAS-12':'6.00'}))assert.equal((weapons[name].preferred/70).toFixed(2),tiles);
assert.doesNotMatch(source,/\brangeTiles\s*:/);
pass('Every supplied value is exact; all other prior weapon fields and source-unit ranges are preserved; app and balance identities stay separate');

{
 const f=make(),d=f.context.__NINE,{state,SAVE}=f.dev.inspect();assert.ok(d.PRIMARYS.includes('FAL'));assert.ok(!d.SIDEARMS.includes('FAL'));
 for(const b of Object.values(SAVE.bots)){assert.equal(b.familiarity.FAL,0);assert.ok(b.career.weaponUsage.FAL);}
 const coverage=d.coverageState();coverage.assignments=0;for(const name of d.PRIMARYS)coverage.counts[name]=name==='FAL'?0:99;
 const bot=state.actors.find(a=>!a.isPlayer&&!a.sandbox&&a.matchId===0),empty={m:f.dev.blankWeaponMeta('FAL')},boost=d.underSampledWeaponBoost('FAL',empty,'DISCOVERY',1);
 assert.ok(boost>d.underSampledWeaponBoost('AR-15',{m:f.dev.blankWeaponMeta('AR-15')},'DISCOVERY',1)&&boost<=5,'Under-sampled FAL receives bounded probability, never a forced winner');
 assert.ok(Array.from({length:200},()=>d.chooseBotPrimary(bot,'life')).includes('FAL'),'Real weighted bot selection samples the registered FAL');
 const picked=d.chooseBotPrimary(bot,'match');assert.ok(d.PRIMARYS.includes(picked));assert.equal(coverage.counts[picked],picked==='FAL'?1:100);
 assert.equal(f.dev.botTacticalRange('FAL'),preferred);assert.ok(f.dev.currentMetaRows().some(row=>row.name==='FAL'));assert.ok(!SAVE.progression.usedWeapons.includes('FAL'));
}
pass('FAL registers as a primary, enters actual bot coverage/selection and meta, initializes familiarity, and uses the explicitly supplied bot range without fabricating first use');

const targets={FAL:[6,4,1.30,.78],'LR-762':[4,3,2.31,1.54],'War Head LMG':[7,5,2.52,1.68],'9mm':[9,5,2.16,1.08]};
for(const [name,[body,head,bodyTtk,headTtk]]of Object.entries(targets)){const sheet=api.weaponSheet(name);assert.equal(sheet.bodyShots,body);assert.equal(sheet.headShots,head);near(sheet.bodyTtk,bodyTtk,name+' body');near(sheet.headTtk,headTtk,name+' head');}
for(const [name,w]of Object.entries(weapons)){
 const sheet=api.weaponSheet(name),count=w.burstCount||1,shotTime=index=>Math.floor(index/count)*w.hitSpeed+(index%count)*(w.burstSpacing||0);
 for(const [value,n,ttk]of [[w.damage,sheet.bodyShots,sheet.bodyTtk],[w.head,sheet.headShots,sheet.headTtk]]){assert.equal(n,Math.ceil(250/value));const i=n-1,reloads=Math.floor(i/w.mag),expected=reloads*(shotTime(w.mag-1)+w.reload)+shotTime(i%w.mag);near(ttk,expected,name+' derived real cycle');}
 const metrics=api.weaponDisplayMetrics(name),html=api.loadoutCard(name,e.dev.currentMetaRows());
 assert.ok(html.includes(sheet.bodyTtk.toFixed(2)+' s'));assert.ok(html.includes(sheet.headTtk.toFixed(2)+' s'));
 if(name==='SPAS-12')assert.ok(html.includes('5.925°'),'the supplied advanced walking spread is displayed without rounding away its third decimal');
 for(const metric of metrics){assert.ok(Number.isFinite(metric.value)&&Number.isFinite(metric.maximum));assert.ok(metric.ratio>=0&&metric.ratio<=1);}
 near(metrics.find(row=>row.key==='range').value,w.preferred);
}
assert.match(api.weaponDescription('SR-Aug'),/65 ms apart.*700 ms/);assert.doesNotMatch(api.weaponDescription('FAL'),/Three independently resolved rounds/);
pass('250 HP target STK/TTK and all displayed rates/bars/ranges derive from the real firing model');

function laneFixture(mode='tdm',human=false){
 const f=make(),d=f.context.__NINE,{state}=f.dev.inspect();let match=state.matches.find(m=>m.mode===mode);
 if(human){f.context.SARCloud.state={account:{id:'audit-four-fixture',username:'AuditFourFixture'}};f.dev.CONFIG.primary='FAL';if(mode==='tdm')f.dev.queueForMatch();else f.context.SAR.startDeathmatch();match=state.matches.find(m=>m?.hasPlayer);match.status='active';}
 const owner=human?match.participants.find(a=>a.isPlayer):match.participants[0],victim=match.participants.find(a=>a!==owner&&(mode==='deathmatch'||a.team!==owner.team));
 let lane;for(let y=100;y<2000&&!lane;y+=80)for(let x=100;x<3000&&!lane;x+=80)if(!f.dev.collides(x,y)&&f.dev.pathClear(x,y,x+200,y))lane={x,y};assert.ok(lane);
 for(const a of state.actors)a.dead=true;
 Object.assign(owner,lane,{dead:false,currentSlot:0,angle:0,vx:0,vy:0,adsBlend:1,sprinting:false,spawnFlash:0});
 Object.assign(victim,{x:lane.x+120,y:lane.y,dead:false,hp:250,spawnFlash:0});
 return {f,d,state,match,owner,victim};
}
for(const human of [false,true])for(const name of Object.keys(weapons))for(const [offset,kind]of [[0,'head'],[12,'damage'],[30,null]]){
 const {f,d,state,owner,victim}=laneFixture('tdm',human);owner.slots[0]=d.makeWeaponState(name);state.projectiles=[];
 assert.equal(f.dev.fire(owner,0,10000),true);assert.equal(state.projectiles.length,weapons[name].pellets);
 for(const p of state.projectiles)Object.assign(p,{x:owner.x+30,y:owner.y+offset,vx:1000,vy:0,travel:30});
 f.dev.updateProjectiles(.14,10200);near(250-victim.hp,kind?weapons[name][kind]:0,name+' physical '+kind);
}
for(const name of ['Pump Shotgun','Auto 12','SPAS-12']){
 const {f,d,state,owner,victim}=laneFixture();owner.slots[0]=d.makeWeaponState(name);state.projectiles=[];f.dev.fire(owner,0,10000);
 near(state.projectiles.reduce((n,p)=>n+p.damage,0),weapons[name].damage,name+' shell body');near(state.projectiles.reduce((n,p)=>n+p.head,0),weapons[name].head,name+' shell head');
 const heads=weapons[name].pellets/2;state.projectiles.forEach((p,index)=>Object.assign(p,{x:owner.x+30,y:owner.y+(index<heads?0:12),vx:1000,vy:0,travel:30}));f.dev.updateProjectiles(.14,10200);
 near(250-victim.hp,(weapons[name].damage+weapons[name].head)/2,name+' mixed real pellet damage');
 const p={weapon:name,travel:70*(weapons[name].falloffStart+2),damage:weapons[name].damage/weapons[name].pellets,head:weapons[name].head/weapons[name].pellets};
 near(d.damageAtRange(p,false),p.damage*(1-2*weapons[name].falloff));p.travel=70*1000;near(d.damageAtRange(p,true),p.head*.45);
}
pass('Physical human/bot head, body and miss collisions work for all 15 weapons; real shotgun pellets preserve shell totals, mixed hits and the existing falloff floor');

{
 const {f,d,state,owner}=laneFixture();owner.slots[0]=d.makeWeaponState('SR-Aug');state.projectiles=[];
 assert.equal(f.dev.fire(owner,0,10000),true);d.updateBurst(owner,10064);assert.equal(state.projectiles.length,1);d.updateBurst(owner,10065);d.updateBurst(owner,10130);
 assert.deepEqual(state.projectiles.map(p=>p.born),[10000,10065,10130]);assert.equal(new Set(state.projectiles.map(p=>p.shot)).size,1);assert.equal(new Set(state.projectiles.map(p=>p.feedbackId)).size,3);
 assert.equal(owner.slots[0].ammo,36);for(const p of state.projectiles){assert.equal(p.damage,23);assert.equal(p.head,40);}assert.equal(f.dev.fire(owner,0,10699),false);assert.equal(f.dev.fire(owner,0,10700),true);
 owner.slots[0]=d.makeWeaponState('FAL');state.projectiles=[];assert.equal(f.dev.fire(owner,0,20000),true);assert.equal(state.projectiles.length,1);assert.equal(owner.slots[0].pendingBurst,undefined);assert.equal(f.dev.fire(owner,0,20259),false);assert.equal(f.dev.fire(owner,0,20260),true);assert.equal(state.projectiles.length,2);
}
pass('SR-Aug emits separate 65 ms rounds at a 700 ms burst cycle; FAL has one bullet, no pending burst and an exact 260 ms minimum interval');

for(const human of [false,true])for(const name of Object.keys(weapons)){
 const {f,d,state,owner}=laneFixture('tdm',human),w=weapons[name];owner.slots[0]=d.makeWeaponState(name);
 for(const [speed,sprint,ads,expected]of [[0,false,0,w.spread],[180,false,0,w.walkSpread],[300,true,0,w.sprintSpread],[0,false,1,w.adsSpread]]){
  Object.assign(owner,{vx:speed,vy:0,sprinting:sprint,adsBlend:ads,angle:0});delete owner.spreadWeapon;near(d.effectiveSpreadDeg(owner),expected,name+' spread');
  const gaps=[],cross=f.context.document.getElementById('crosshair');cross.style.setProperty=(key,value)=>{if(key==='--gap')gaps.push(value);};
  for(const [aimX,aimY]of [[100,100],[720,450],[1400,880]]){Object.assign(f.dev.input,{aimX,aimY});d.updateCrosshairVisual(owner);}assert.equal(new Set(gaps).size,1);near(Number(cross.dataset.spread),expected);
  owner.slots[0]=d.makeWeaponState(name);state.projectiles=[];f.dev.fire(owner,0,10000);for(const p of state.projectiles)assert.ok(Math.abs(Math.atan2(p.vy,p.vx))*180/Math.PI<=expected/2+1e-7);
 }
}
assert.ok(weapons.X16.walkSpread<weapons.X16.spread);assert.ok(weapons['SR-Aug'].walkSpread<weapons['SR-Aug'].spread);
pass('Every movement/ADS cone matches human and bot projectiles/reticles; cursor distance is invariant and intentional lower walking values remain');

{
 const oldEngine=engine({},oldSource),old=oldEngine.context.SAR.getUniverse();assert.deepEqual(oldEngine.context.SAR.getWeapons(),previous.weapons);
 // Include meaningful current-patch records and permanent progression/history.
 old.patchState.completedMatches=17;old.patchState.observedSeconds=1000;Object.assign(old.patchState.meta.AK47,{kills:45,deaths:30,damage:9876,shots:100,hits:70,equippedTime:240});old.meta=clone(old.patchState.meta);
 old.patchState.perBot.Ace={AK47:{k:7,d:3,damage:2222}};old.patchState.skillStrata.high={AK47:{kills:7,deaths:3}};
 old.bots.Ace.career.kills=123;old.bots.Ace.career.weaponUsage.AK47.k=21;old.bots.Ace.familiarity['SR-Aug']=.72;old.playerCareer.kills=41;old.playerCareer.weapons.AK47.k=12;
 old.tournamentHistory=[{id:'audit-four-retained',wins:4,earnings:50000}];old.futureWallet={balanceUnits:71999,orders:['retain']};old.seasons.history.push({id:'retained-season',earnings:12345});
 old.matchSlots[1]={...old.matchSlots[1],phase:'cooldown',endedAt:Date.now(),readyAt:Date.now()+15000};
 old.matchSlots[2]={...old.matchSlots[2],phase:'waiting',resumeStatus:'cooldown',endedAt:Date.now(),readyAt:Date.now()+15000};
 const xpInput={kind:'standard',sessionType:'standard',mode:'tdm',eligible:true,practice:false,at:Date.now(),matchId:'prior-award',won:true,winStreak:1,stats:{kills:0,deaths:0,assists:0,headshots:0,damage:0,timeAlive:0},events:{...XP.events(),usedWeapons:['AR-15']},leaders:{kills:false,assists:false,alive:false}};XP.award(old.progression,xpInput);
 const prior=clone(old),next=e.dev.normalizeSave(old),archive=next.patchArchives.at(-1);
 assert.equal(next.patchArchives.length,prior.patchArchives.length+1);assert.deepEqual(next.patchArchives.slice(0,-1),prior.patchArchives);
 for(const key of Object.keys(prior.patchState).filter(key=>key!=='reason'))assert.deepEqual(archive[key],prior.patchState[key],'complete previous archive '+key);
 assert.equal(next.patchState.balanceVersion,'9.0');assert.equal(next.patchState.generation,prior.patchState.generation+1);assert.notEqual(next.patchState.fingerprint,prior.patchState.fingerprint);
 assert.equal(next.patchState.completedMatches,0);assert.equal(next.patchState.observedSeconds,0);assert.deepEqual(next.patchState.perBot,{});assert.deepEqual(next.patchState.skillStrata,{});
 for(const [name,row]of Object.entries(next.meta))assert.deepEqual(row,e.dev.blankWeaponMeta(name));
 for(const name of Object.keys(prior.bots)){
  const retained=clone(next.bots[name]);delete retained.career.weaponUsage.FAL;delete retained.familiarity.FAL;assert.deepEqual(retained,prior.bots[name],name+' permanent history');
  assert.equal(next.bots[name].familiarity.FAL,0);assert.equal(next.bots[name].career.weaponUsage.FAL.k,0);
 }
 const pc=clone(next.playerCareer);delete pc.weapons.FAL;assert.deepEqual(pc,prior.playerCareer);
 for(const key of ['progression','ranked','seasons','playerSeasons','tournamentHistory','futureWallet','config'])assert.deepEqual(next[key],prior[key],key+' preserved');
 const dm=clone(next.modeStats);delete dm.deathmatch.meta.FAL;assert.deepEqual(dm,prior.modeStats,'cumulative Deathmatch histories are retained');
 assert.deepEqual(next.balancePatchHistory.slice(0,-1),prior.balancePatchHistory);
 const expected=[];for(const [name,row]of Object.entries(e.dev.balanceSnapshot()))for(const [field,value]of Object.entries(row))if(prior.patchState.weaponStats[name]?.[field]!==value)expected.push({weapon:name,field,before:prior.patchState.weaponStats[name]?.[field]??null,after:value});
 assert.deepEqual(next.balancePatchHistory.at(-1).changes,clone(expected),'actual before/after changed values only');
 for(const [id,slot]of Object.entries(prior.matchSlots))if(slot.phase==='active'||slot.phase==='waiting'&&slot.resumeStatus!=='cooldown')assert.notEqual(next.matchSlots[id]?.matchId,slot.matchId,'unfinished old-config identity invalidated');
 for(const id of [1,2])assert.deepEqual(next.matchSlots[id],{...prior.matchSlots[id],balanceFingerprint:prior.matchSlots[id].balanceFingerprint||prior.patchState.fingerprint},'completed or suspended cooldown identity, generation and deadline are preserved');
 const repeat=e.dev.normalizeSave(next);assert.equal(repeat.patchArchives.length,next.patchArchives.length);assert.equal(repeat.balancePatchHistory.length,next.balancePatchHistory.length);assert.equal(repeat.patchState.id,next.patchState.id);
 const accounts=JSON.stringify({fixture:{hash:'retained',salt:'retained'}}),cold=make({'sar-persistent-save':JSON.stringify(next),'sar-local-accounts-v1':accounts}),restored=cold.context.SAR.getUniverse();
 assert.equal(cold.data.get('sar-local-accounts-v1'),accounts);assert.equal(restored.patchArchives.length,next.patchArchives.length);assert.equal(restored.patchState.id,next.patchState.id);assert.deepEqual(restored.progression,next.progression);assert.deepEqual(restored.tournamentHistory,next.tournamentHistory);
 for(const match of cold.dev.inspect().state.matches.filter(match=>match.status==='active'))assert.equal(match.balanceFingerprint,e.dev.balanceFingerprint());
 for(const [id,slot]of Object.entries(prior.matchSlots))if(slot.phase==='active')assert.notEqual(cold.dev.inspect().state.matches[id]?.matchId,slot.matchId,'reload uses a fresh current-config match identity');
 pass('Complete Balance8 archives once; actual numerical history, additive FAL fields, careers, XP, seasons, earnings and accounts survive migration/reload without old unfinished identities; completed cooldowns remain');
}

for(const mode of ['tdm','deathmatch'])for(const human of [false,true]){
 const {f,d,state,match,owner,victim}=laneFixture(mode,human),{SAVE}=f.dev.inspect();owner.slots[0]=d.makeWeaponState('FAL');
 const before=f.context.SAR.getUniverse(),beforeTdm=clone(SAVE.patchState.meta.FAL),beforeDm=clone(SAVE.modeStats.deathmatch.meta.FAL),samples=SAVE.patchState.participantAnalytics.samples[SAVE.aiRevision];
 state.projectiles=[];f.dev.fire(owner,0,10000);for(const p of state.projectiles)Object.assign(p,{x:owner.x+30,y:owner.y+12,vx:1000,vy:0,travel:30});f.dev.updateProjectiles(.14,10200);
 assert.equal(samples[mode][human?'human':'bot'].meta.FAL.shots,1);near(samples[mode][human?'human':'bot'].meta.FAL.damage,48);assert.equal(samples[mode==='tdm'?'deathmatch':'tdm'][human?'human':'bot'].meta.FAL.shots,0);
 if(mode==='tdm'){assert.equal(SAVE.patchState.meta.FAL.shots,beforeTdm.shots+1);assert.deepEqual(SAVE.modeStats.deathmatch.meta.FAL,beforeDm);}else{assert.deepEqual(SAVE.patchState.meta.FAL,beforeTdm);assert.equal(SAVE.modeStats.deathmatch.meta.FAL.shots,beforeDm.shots+1);}
 f.dev.endMatch(match,mode==='tdm'?owner.team:owner.id,'time');const after=f.context.SAR.getUniverse();validateWorld(after,{save:before});
 if(human){assert.deepEqual(after.progression.awards[match.matchId].firstWeapons,['FAL']);const fixed=clone(after.progression);d.commitMatchXP(match);f.dev.endMatch(match,0,'time');assert.deepEqual(f.context.SAR.getUniverse().progression,fixed);
  const reload=make({'sar-persistent-save':JSON.stringify(after)});reload.context.SARCloud.state={account:{id:'audit-four-fixture',username:'AuditFourFixture'}};reload.dev.CONFIG.primary='FAL';if(mode==='tdm')reload.dev.queueForMatch();else reload.context.SAR.startDeathmatch();const again=reload.dev.inspect().state.matches.find(m=>m?.hasPlayer),player=again.participants.find(a=>a.isPlayer);again.status='active';assert.equal(player.slots[0].name,'FAL');reload.dev.fire(player,0,20000);reload.dev.endMatch(again,mode==='tdm'?player.team:player.id,'time');assert.deepEqual(reload.context.SAR.getUniverse().progression.awards[again.matchId].firstWeapons,[],'FAL first use remains spent across reload');
 }
}
pass('FAL physical shots/results validate on the server in separate TDM/DM human/bot scopes; first use awards once and finalization is idempotent');

for(const mode of ['tdm','deathmatch']){
 const f=make();f.context.SARCloud.state={account:{id:'audit-four-fixture',username:'AuditFourFixture'}};f.dev.CONFIG.primary='FAL';const before=f.context.SAR.getUniverse(),bot=before.bots[before.activeBotNames[0]].profile,match=f.context.SAR.startCustomMatch({mode,bots:[{sourceBotId:bot.id,team:1}]}),owner=match.participants.find(a=>a.isPlayer);match.status='active';assert.equal(owner.slots[0].name,'FAL');f.dev.fire(owner,0,10000);f.dev.endMatch(match,mode==='tdm'?owner.team:owner.id,'time');const after=f.context.SAR.getUniverse();assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.progression,before.progression);assert.deepEqual(after.patchState,before.patchState);assert.deepEqual(after.modeStats,before.modeStats);assert.equal(match.result.rows.find(r=>r.isPlayer).shots,1);
}
pass('Custom FAL combat remains session-only and cannot contaminate permanent careers, XP or either mode of Weapon Meta');

{
 const f=make();f.context.SARCloud.state={account:{id:'audit-four-fixture',username:'AuditFourFixture'}};f.dev.CONFIG.primary='FAL';const before=f.context.SAR.getUniverse();f.dev.queueForMatch('ranked-tdm');const match=f.dev.inspect().state.matches.find(m=>m?.hasPlayer),owner=match.participants.find(a=>a.isPlayer);match.status='active';assert.equal(owner.slots[0].name,'FAL');assert.equal(match.sessionType,'ranked');f.dev.fire(owner,0,10000);f.dev.endMatch(match,owner.team,'time');const after=f.context.SAR.getUniverse();assert.deepEqual(after.progression.awards[match.matchId].firstWeapons,['FAL']);assert.ok(after.ranked.participants[owner.participantId].awards[match.matchId]);validateWorld(after,{save:before});
}
for(const kind of ['custom','official']){
 // Use the real waiting pool so this isolation fixture does not also trigger
 // legitimate background replacement loadout picks during reservation/release.
 const f=make();f.context.SARCloud.state={account:{id:'audit-four-fixture',username:'AuditFourFixture'}};f.dev.CONFIG.primary='FAL';const before=f.context.SAR.getUniverse(),people=[{id:'audit-four-fixture',kind:'user',name:'AuditFourFixture'},...f.dev.inspect().state.idleBots.slice(0,9).map(a=>({id:a.profile.id,kind:'bot',name:a.name}))];assert.equal(people.length,10);
 const context={tournamentId:'audit-four-'+kind,tournamentKind:kind,gameId:'audit-four-game-'+kind,seriesId:'audit-four-series-'+kind,hasPlayer:true,teamIds:['audit-four-a','audit-four-b'],teams:[0,1].map(team=>({participants:people.slice(team*5,team*5+5)}))},match=f.context.SAR.startTournamentGame(context),owner=match.participants.find(a=>a.isPlayer);match.status='active';assert.equal(owner.slots[0].name,'FAL');f.dev.fire(owner,0,10000);f.dev.endMatch(match,owner.team,'time');const after=f.context.SAR.getUniverse();assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.patchState,before.patchState);assert.deepEqual(after.modeStats,before.modeStats);assert.equal(match.tournamentResult.stats.find(r=>r.participantId===owner.participantId).weaponStats.FAL.shots,1);
 if(kind==='custom')assert.deepEqual(after.progression,before.progression);else assert.deepEqual(after.progression.awards[match.matchId].firstWeapons,['FAL']);
}
pass('Ranked and both tournament loadouts use FAL with existing ranked/XP eligibility; tournament FAL results cannot enter normal careers or Weapon Meta');

// A stale old-configuration match must never write to the current balance sample.
{
 const {f,d,state,match,owner}=laneFixture(),{SAVE}=f.dev.inspect();owner.slots[0]=d.makeWeaponState('FAL');const before=clone(SAVE.patchState),oldFingerprint=previous.fingerprint;
 match.balanceFingerprint=oldFingerprint;d.recordParticipantEvent(owner,'FAL','shots',1);d.recordPatchEvent(owner,'FAL','shots',1);d.recordParticipantCompletion(match,[owner]);
 assert.deepEqual(clone(SAVE.patchState),before,'old-config event/completion is excluded from current patch');
 state.projectiles=[];assert.equal(f.dev.fire(owner,0,10000),false,'old-config combat is refused');assert.equal(state.projectiles.length,0);f.dev.recordEquipped(owner,1);assert.deepEqual(clone(SAVE.patchState),before,'old-config time cannot accumulate');
 const oldClient=engine({},oldSource).context.SAR.getUniverse();assert.throws(()=>validateWorld(oldClient),/balance|weapon/i,'old-config client save is rejected once authoritative configuration changes');
 validateWorld(oldClient,{save:oldClient});
 const migrated=make({'sar-persistent-save':JSON.stringify(oldClient)}).context.SAR.getUniverse();validateWorld(migrated,{save:oldClient});assert.throws(()=>validateWorld(oldClient,{save:migrated}),/balance|weapon/i,'old-client continuation is rejected after this account activates the current patch');
 match.balanceFingerprint=SAVE.patchState.fingerprint;SAVE.patchState.generation++;SAVE.patchState.id=SAVE.patchState.fingerprint+'-'+SAVE.patchState.generation;assert.equal(f.dev.fire(owner,0,20000),true,'a same-configuration manual sample generation may continue its current match');
}
pass('Stale fingerprints cannot write current events/completions; exact old account checkpoints remain safe until one migration, then reject; same-config generation remains eligible');

const results={result:'PASS',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),balanceVersion:'9.0',fingerprint:e.dev.balanceFingerprint(),appVersion:e.context.SAR.getVersion().version,falPreferredWorld:preferred,priorFingerprint:previous.fingerprint,targets,checks};
fs.writeFileSync(path.join(__dirname,'arena-refined-balance-nine-results.json'),JSON.stringify(results,null,2)+'\n');
console.log('PASS '+checks.length+' groups');
