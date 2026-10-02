'use strict';
// Isolated acceptance: shipped firing/collision/normalization; no live account writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs'),root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const previous=require('./fixtures/balance-6.0.json');
const injected=source.replace('window.SAR = {','window.__SEVEN={weaponSheet,weaponBars,loadoutCard,weaponDescription,makeWeaponState,updateBurst,effectiveSpreadDeg,updateCrosshairVisual,renderPatchNotesHtml,metaPhaseText,WEAPON_PATCH_NOTES};window.SAR = {');
const updates={'AK47':{damage:34,hitSpeed:.35,mag:36,reload:2.75},'SMG-9':{damage:19,head:29,falloffStart:11,falloff:.043},'LR-762':{damage:63,head:124},'LW Tundra':{damage:121,head:181,hitSpeed:1.4,mag:4},'SR-Aug':{spread:4.5,walkSpread:4.75,sprintSpread:5.5,adsSpread:2.2,hitSpeed:.7},'SPAS-12':{damage:108,head:220}};
const checks=[],copy=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
const e=engine({},injected),d=e.context.__SEVEN,weapons=e.context.SAR.getWeapons();
function pass(test){checks.push({test,result:'PASS'});console.log('PASS '+test);}
for(const [name,prior]of Object.entries(previous.weapons))assert.deepEqual(weapons[name],{...prior,...updates[name]},name+' full balance values');
assert.deepEqual(Object.keys(weapons),Object.keys(previous.weapons));
const unchanged=Object.keys(weapons).filter(name=>!updates[name]);
for(const name of unchanged){const before=JSON.stringify(previous.weapons[name]),after=JSON.stringify(weapons[name]);assert.equal(after,before,name+' byte-equivalent configuration');}
pass('Six supplied weapon updates are exact; all eight other weapon configurations remain byte/value-equivalent to Balance6');

const derived={'AK47':[8,5,2.45,1.4],'SMG-9':[14,9,2.21,1.36],'LR-762':[4,3,2.52,1.68],'LW Tundra':[3,2,2.8,1.4],'SR-Aug':[11,6,2.165,.83],'SPAS-12':[3,2,2,1]};
for(const [name,[body,head,bodyTtk,headTtk]]of Object.entries(derived)){const sheet=d.weaponSheet(name);assert.equal(sheet.bodyShots,body);assert.equal(sheet.headShots,head);near(sheet.bodyTtk,bodyTtk);near(sheet.headTtk,headTtk);const html=d.loadoutCard(name,e.dev.currentMetaRows());assert.ok(html.includes(sheet.bodyTtk.toFixed(2)+'s'),name+' displayed body TTK');assert.ok(html.includes(sheet.headTtk.toFixed(2)+'s'),name+' displayed head TTK');assert.ok(html.includes((weapons[name].preferred/70).toFixed(2)+' tiles'));for(const [,value]of d.weaponBars(name))assert.ok(value>=0&&value<=1);}
for(const [name,tiles]of Object.entries({'AR-15':'12.86','X-16 Auto':'6.14','SR-Aug':'10.71','SPAS-12':'6.00'}))assert.equal((weapons[name].preferred/70).toFixed(2),tiles);
assert.match(d.weaponDescription('SR-Aug'),/65 ms apart.*700 ms/);
pass('250HP STK, first-shot-at-zero TTK, real burst timing, loadout/bar values and PreferredRange/70 tiles recalculate correctly');

function laneFixture(){const f=engine({},injected),api=f.context.__SEVEN,{state}=f.dev.inspect(),owner=state.actors.find(a=>a.matchId===0),victim=state.actors.find(a=>a.matchId===0&&a.team!==owner.team);let lane;for(let y=100;y<2000&&!lane;y+=80)for(let x=100;x<3000&&!lane;x+=80)if(!f.dev.collides(x,y)&&f.dev.pathClear(x,y,x+200,y))lane={x,y};assert.ok(lane);for(const a of state.actors)a.dead=true;Object.assign(owner,lane,{dead:false,currentSlot:0,angle:0,vx:0,vy:0,adsBlend:1,sprinting:false});Object.assign(victim,{x:lane.x+120,y:lane.y,dead:false,hp:250});return {f,api,state,owner,victim};}
for(const human of [false,true])for(const name of Object.keys(updates))for(const [offset,kind]of [[0,'head'],[12,'damage'],[30,null]]){
 const {f,api,state,owner,victim}=laneFixture();owner.isPlayer=human;owner.slots[0]=api.makeWeaponState(name);state.projectiles=[];assert.equal(f.dev.fire(owner,0,f.dev.now()+2000),true);
 const count=weapons[name].pellets;assert.equal(state.projectiles.length,count);for(const p of state.projectiles)Object.assign(p,{x:owner.x+30,y:owner.y+offset,vx:1000,vy:0,travel:30});f.dev.updateProjectiles(.14,f.dev.now()+2200);near(250-victim.hp,kind?weapons[name][kind]:0);
}
pass('Changed rifles and shotgun retain real physical head/body/miss collision for human and bot projectiles; SPAS combined damage resolves as108/220');

{
 const {f,api,state,owner}=laneFixture();owner.slots[0]=api.makeWeaponState('SR-Aug');owner.isPlayer=true;state.projectiles=[];const at=f.dev.now()+3000,shots=f.dev.inspect().meta['SR-Aug'].shots;
 assert.equal(f.dev.fire(owner,0,at),true);assert.equal(state.projectiles.length,1);api.updateBurst(owner,at+64);assert.equal(state.projectiles.length,1);owner.angle=.2;api.updateBurst(owner,at+65);owner.angle=-.2;api.updateBurst(owner,at+130);
 assert.deepEqual(state.projectiles.map(p=>p.born),[at,at+65,at+130]);assert.equal(new Set(state.projectiles.map(p=>p.shot)).size,1);assert.equal(new Set(state.projectiles.map(p=>p.feedbackId)).size,3);assert.equal(owner.slots[0].ammo,36);assert.equal(f.dev.inspect().meta['SR-Aug'].shots,shots+1);
 for(const p of state.projectiles){assert.equal(p.damage,24);assert.equal(p.head,49);}assert.equal(f.dev.fire(owner,0,at+699),false);assert.equal(f.dev.fire(owner,0,at+700),true);assert.equal(f.dev.inspect().meta['SR-Aug'].shots,shots+2);
 owner.angle=.1;api.updateBurst(owner,at+765);api.updateBurst(owner,at+830);assert.equal(state.projectiles.length,6);assert.equal(owner.slots[0].ammo,33);assert.equal(weapons['SR-Aug'].pellets,1);assert.equal(weapons['SR-Aug'].burstCount,3);
 owner.slots[0]=api.makeWeaponState('SPAS-12');state.projectiles=[];assert.equal(f.dev.fire(owner,0,at+2000),true);assert.equal(state.projectiles.length,12);assert.equal(owner.slots[0].ammo,2);near(state.projectiles.reduce((n,p)=>n+p.damage,0),108);near(state.projectiles.reduce((n,p)=>n+p.head,0),220);
 pass('AUG repeats three independent65ms-spaced rounds at700ms cycles and one telemetry trigger; SPAS remains one shell with twelve independent pellets');
}
{
 const {f,api,state,owner}=laneFixture();owner.slots[0]=api.makeWeaponState('SR-Aug');const cross=f.context.document.getElementById('crosshair');
 for(const human of [false,true])for(const [speed,sprint,ads,angle]of [[0,false,0,4.5],[180,false,0,4.75],[300,true,0,5.5],[0,false,1,2.2],[180,false,.5,3.475]]){
  Object.assign(owner,{isPlayer:human,vx:speed,vy:0,sprinting:sprint,adsBlend:ads,angle:0});delete owner.spreadWeapon;near(api.effectiveSpreadDeg(owner),angle);const gaps=[];cross.style.setProperty=(key,value)=>{if(key==='--gap')gaps.push(value);};
  for(const [aimX,aimY]of [[100,100],[720,450],[1400,880]]){Object.assign(f.dev.input,{aimX,aimY});api.updateCrosshairVisual(owner);}assert.equal(new Set(gaps).size,1);near(Number(cross.dataset.spread),angle);
  for(let i=0;i<32;i++){owner.slots[0]=api.makeWeaponState('SR-Aug');state.projectiles=[];const at=f.dev.now()+3000+i*1000;f.dev.fire(owner,0,at);api.updateBurst(owner,at+65);api.updateBurst(owner,at+130);for(const p of state.projectiles)assert.ok(Math.abs(Math.atan2(p.vy,p.vx))*180/Math.PI<=angle/2+1e-7);}
 }
 pass('AUG four spread states/interpolation affect actual player/bot rounds and the same reticle; cursor distance adds no spread or bloom');
}
{
 const old=e.context.SAR.getUniverse();old.patchState={...copy(old.patchState),id:previous.fingerprint+'-4',fingerprint:previous.fingerprint,generation:4,label:'WEAPON BALANCE UPDATE 6.0',weaponStats:{}};delete old.patchState.balanceVersion;delete old.patchState.updateName;
 const fields=Object.keys(e.dev.balanceSnapshot()['AR-15']);for(const [name,w]of Object.entries(previous.weapons))old.patchState.weaponStats[name]=Object.fromEntries(fields.filter(k=>w[k]!==undefined).map(k=>[k,w[k]]));
 old.patchState.completedMatches=17;old.patchState.observedSeconds=1000;Object.assign(old.patchState.meta['AK47'],{kills:45,deaths:30,damage:9876,shots:100,hits:70,equippedTime:240});old.patchState.perBot.Ace={AK47:{k:7,d:3,damage:2222}};old.patchState.skillStrata.high={AK47:{k:7,d:3}};old.meta=copy(old.patchState.meta);
 old.bots.Ace.career.kills=123;old.bots.Ace.career.weaponUsage.AK47.k=21;old.bots.Ace.familiarity['SR-Aug']=.72;old.playerCareer.kills=41;old.playerCareer.weapons.AK47.k=12;old.tournamentHistory=[{id:'kept',wins:4}];old.balancePatchHistory.push({at:12,from:'historic',to:'historic2',changes:[]});
 const before=copy(old),next=e.dev.normalizeSave(old);assert.equal(next.patchArchives.length,before.patchArchives.length+1);assert.deepEqual(next.patchArchives.slice(0,-1),before.patchArchives);const archive=next.patchArchives.at(-1);
 for(const key of ['id','label','weaponStats','meta','perBot','skillStrata','completedMatches','observedSeconds'])assert.deepEqual(archive[key],before.patchState[key]);
 assert.equal(next.patchState.label,'WEAPON BALANCE UPDATE 7.0');assert.equal(next.patchState.balanceVersion,'7.0');assert.equal(next.patchState.updateName,'META REWORK / AUG TUNING');assert.equal(next.patchState.generation,5);assert.notEqual(next.patchState.fingerprint,previous.fingerprint);assert.equal(next.patchState.completedMatches,0);assert.equal(next.patchState.observedSeconds,0);assert.deepEqual(next.patchState.perBot,{});assert.deepEqual(next.patchState.skillStrata,{});
 for(const [name,row]of Object.entries(next.meta))assert.deepEqual(row,e.dev.blankWeaponMeta(name));for(const key of ['bots','playerCareer','seasons','playerSeasons','tournamentHistory','config'])assert.deepEqual(next[key],before[key],key+' preserved');assert.deepEqual(next.balancePatchHistory.slice(0,-1),before.balancePatchHistory);
 const changes=next.balancePatchHistory.at(-1);assert.equal(changes.label,'WEAPON BALANCE UPDATE 7.0');assert.equal(changes.updateName,'META REWORK / AUG TUNING');assert.deepEqual([...new Set(changes.changes.map(c=>c.weapon))].sort(),Object.keys(updates).sort());assert.equal(changes.changes.length,Object.values(updates).reduce((n,w)=>n+Object.keys(w).length,0));
 const accounts=JSON.stringify({isolated:{hash:'retained',salt:'retained'}}),cold=engine({'sar-persistent-save':JSON.stringify(next),'sar-local-accounts-v1':accounts},injected),restarted=cold.context.SAR.getUniverse();assert.equal(cold.data.get('sar-local-accounts-v1'),accounts);assert.equal(restarted.patchArchives.length,next.patchArchives.length);assert.equal(restarted.patchState.id,next.patchState.id);assert.equal(restarted.playerCareer.kills,41);assert.equal(restarted.bots.Ace.career.kills,123);assert.deepEqual(restarted.tournamentHistory,next.tournamentHistory);
 assert.match(cold.context.__SEVEN.metaPhaseText(),/WEAPON BALANCE UPDATE 7\.0 — META REWORK \/ AUG TUNING/);const notes=d.renderPatchNotesHtml();assert.match(notes,/WEAPON BALANCE UPDATE 7\.0 — META REWORK \/ AUG TUNING/);assert.equal(d.WEAPON_PATCH_NOTES[0].changes.length,6);
 pass('Balance6 telemetry archives once under its original identity; clean Balance7/current history preserves every career, familiarity, season, account and tournament across restart');
}
const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'))),activeBalance=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/balance-7.0.json')));for(const file of ['package.json','package-lock.json','launcher/package.json','launcher/package-lock.json','launcher/src-tauri/tauri.conf.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(root,file))).version,version.version,file);
assert.equal(e.context.SAR.getVersion().version,version.version);assert.equal(e.dev.balanceFingerprint(),activeBalance.fingerprint);assert.equal(e.context.SAR.getUniverse().patchState.label,'WEAPON BALANCE UPDATE 7.0');assert.ok(version.shellRevision);pass('Weapon Balance7 constants/fingerprint stay fixed while game/build metadata agree with the current release');
fs.writeFileSync(path.join(__dirname,'balance-seven-results.json'),JSON.stringify({result:'PASS',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),balanceVersion:'7.0',fingerprint:e.dev.balanceFingerprint(),gameVersion:version.version,unchangedWeapons:unchanged,derived,checks},null,2)+'\n');
