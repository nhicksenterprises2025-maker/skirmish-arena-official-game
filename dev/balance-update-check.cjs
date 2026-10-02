/* Official sheet, in-place migration and new sidearm acceptance checks.
   The fixture is confined to the VM; no installed account/database is touched. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs'),root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const injected=source.replace('window.SAR = {','window.__BALANCE={weaponSheet,loadoutCard,drawWeaponModel,makeWeaponState,startReload,finishReload,updatePresentation};window.SAR = {');
const fields=['type','role','auto','damage','head','spread','walkSpread','sprintSpread','adsSpread','falloffStart','falloff','speed','hitSpeed','mag','reserve','reload','pellets','preferred'];
const official={
  "AR-15": [
    "primary",
    "All-rounder",
    true,
    28,
    42,
    2.7,
    2.9,
    3.6,
    1.5,
    22,
    0.025,
    80,
    0.3,
    40,
    120,
    2.1,
    1,
    900
  ],
  "AK47": [
    "primary",
    "Heavy rifle",
    true,
    34,
    50,
    4,
    4.5,
    5.2,
    1.6,
    25,
    0.028,
    74,
    0.35,
    36,
    120,
    2.75,
    1,
    820
  ],
  "SMG-9": [
    "primary",
    "Close tracking",
    true,
    19,
    29,
    3.1,
    3.3,
    3.7,
    1.8,
    11,
    0.043,
    62,
    0.17,
    42,
    144,
    1.9,
    1,
    520
  ],
  "Pump Shotgun": [
    "primary",
    "Burst shotgun",
    false,
    124,
    248,
    6.5,
    7.5,
    9,
    3,
    3.5,
    0.1,
    48,
    1.5,
    5,
    30,
    2.4,
    8,
    330
  ],
  "Auto 12": [
    "primary",
    "Auto shotgun",
    true,
    49,
    84,
    7.45,
    8.5,
    10,
    3.4,
    5,
    0.08,
    50,
    0.51,
    10,
    50,
    4.6,
    6,
    300
  ],
  "LR-762": [
    "primary",
    "Marksman rifle",
    false,
    63,
    124,
    10,
    12,
    15,
    1.2,
    32,
    0.015,
    100,
    0.84,
    10,
    60,
    3.2,
    1,
    1250
  ],
  "LW Tundra": [
    "primary",
    "Sniper rifle",
    false,
    121,
    181,
    12.2,
    14,
    18,
    1,
    45,
    0.01,
    125,
    1.4,
    4,
    25,
    2.8,
    1,
    1500
  ],
  "War Head LMG": [
    "primary",
    "Sustained-fire LMG",
    true,
    45,
    65,
    5.35,
    5.8,
    6.2,
    1.8,
    24,
    0.02,
    81,
    0.42,
    75,
    225,
    4.7,
    1,
    1000
  ],
  "P90": [
    "primary",
    "Ranged SMG",
    true,
    25,
    40,
    2.2,
    2.4,
    2.8,
    1.2,
    20,
    0.032,
    70,
    0.23,
    36,
    144,
    2.2,
    1,
    720
  ],
  "9mm": [
    "sidearm",
    "Heavy sidearm",
    false,
    28,
    50,
    4.75,
    5,
    5.45,
    1.1,
    13,
    0.04,
    60,
    0.34,
    16,
    60,
    1.5,
    1,
    440
  ],
  "X16": [
    "sidearm",
    "Fast sidearm",
    false,
    24,
    34,
    4,
    4.4,
    4.75,
    1.3,
    11,
    0.045,
    58,
    0.19,
    18,
    72,
    1.2,
    1,
    390
  ],
  "X-16 Auto": [
    "sidearm",
    "Auto sidearm",
    true,
    21,
    30,
    4.65,
    5,
    5.35,
    1.5,
    10,
    0.0475,
    62,
    0.19,
    26,
    104,
    1.6,
    1,
    430
  ],
  "SR-Aug": [
    "primary",
    "Triple Burst AR",
    true,
    23,
    45,
    4.5,
    4.75,
    5.5,
    2.2,
    19,
    0.024,
    88,
    0.7,
    39,
    156,
    2.4,
    1,
    750
  ],
  "SPAS-12": [
    "primary",
    "3 Shot Shotgun",
    false,
    100,
    210,
    5.8,
    5.925,
    6.25,
    1.7,
    7,
    0.05,
    75,
    1,
    3,
    12,
    3.6,
    12,
    420
  ]
};
const checks=[];function pass(test,detail){checks.push({test,result:'PASS',detail});console.log('PASS',test,detail||'');}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);}
const e=engine({},injected),d=e.context.__BALANCE,weapons=e.context.SAR.getWeapons();
assert.deepEqual(Object.keys(weapons),Object.keys(official));
for(const [name,values] of Object.entries(official)){
 for(let i=0;i<fields.length;i++)assert.equal(weapons[name][fields[i]],values[i],name+' '+fields[i]);
 const state=d.makeWeaponState(name);assert.equal(state.ammo,values[13]);assert.equal(state.reserve,values[14]);
 const sheet=d.weaponSheet(name);assert.equal(sheet.bodyShots,Math.ceil(250/values[3]));assert.equal(sheet.headShots,Math.ceil(250/values[4]));
 const html=d.loadoutCard(name,e.dev.currentMetaRows());assert.match(html,new RegExp(values[13]+' / '+values[14]));assert.ok(html.includes(values[15].toFixed(2)+'s'));assert.ok(html.includes((values[17]/70).toFixed(2)+' tiles'));
 assert.ok(html.includes(name==='SR-Aug'?'BURST':values[2]?'AUTOMATIC':'SEMI-AUTO'));d.drawWeaponModel(name,0,0,0,0,e.context.document.getElementById('game').getContext('2d'),state);
}
approx(d.weaponSheet('Pump Shotgun').bodyTtk,3);approx(d.weaponSheet('Pump Shotgun').headTtk,1.5);approx(d.weaponSheet('Auto 12').bodyTtk,2.55);approx(d.weaponSheet('P90').bodyTtk,2.07);approx(d.weaponSheet('X-16 Auto').bodyTtk,2.09);
assert.equal(weapons['AR-15'].preferred,900);assert.equal(weapons['X-16 Auto'].preferred,430);
pass('All fourteen weapons exactly match the official sheet; real loadout/STK/TTK use the current stats and actual70-unit tiles');

{
 const oldSource=fs.readFileSync(path.join(__dirname,'fixtures/game-1.3.0.js'),'utf8'),prior=engine({},oldSource);for(let i=0;i<400;i++)prior.step();prior.dev.saveTelemetry();
 const old=JSON.parse(prior.data.get('sar-persistent-save'));old.bots.Ace.profile.id='bot_0001';old.bots.Ace.profile.customCosmetic='retained';old.bots.Ace.career.kills=123;old.seasons.history=[{number:0,custom:'historic'}];old.playerCareer={name:'YOU',kills:27,damage:4321,weapons:{X16:{k:4,d:3,picks:7,damage:1000,custom:91}},customRecord:73};old.config.sidearm='X16';old.customUniverse={seed:223};
 const data=Object.fromEntries(prior.data),accounts=JSON.stringify({test:{hash:'do-not-change',salt:'stable',createdAt:42}});data['sar-persistent-save']=JSON.stringify(old);data['sar-local-accounts-v1']=accounts;data['sar-local-session-v1']='test';
 const next=engine(data,injected),save=next.dev.inspect().SAVE;
 assert.notEqual(save.patchState.id,old.patchState.id);assert.equal(save.patchState.generation,old.patchState.generation+1);assert.equal(save.patchState.label,'WEAPON BALANCE UPDATE 8.0');assert.equal(save.patchArchives.length,old.patchArchives.length+1);
 const archived=save.patchArchives.at(-1);assert.deepEqual(archived.meta,old.meta);assert.deepEqual(archived.weaponStats,old.patchState.weaponStats);assert.deepEqual(archived.perBot,old.patchState.perBot);assert.equal(archived.id,old.patchState.id);
 for(const row of Object.values(save.meta))for(const field of ['kills','deaths','damage','shots','hits','classifiedKills','soloKills','finisherKills','engagementDistanceN'])assert.equal(row[field],0);
 assert.deepEqual(save.seasons,old.seasons);assert.equal(save.bots.Ace.profile.id,old.bots.Ace.profile.id);assert.equal(save.bots.Ace.profile.customCosmetic,'retained');assert.equal(save.bots.Ace.career.kills,123);assert.equal(save.playerCareer.kills,27);assert.equal(save.playerCareer.damage,4321);assert.equal(save.playerCareer.customRecord,73);assert.equal(save.playerCareer.weapons.X16.custom,91);assert.equal(save.config.sidearm,'X16');assert.deepEqual(save.customUniverse,old.customUniverse);
 assert.equal(next.data.get('sar-local-accounts-v1'),accounts);assert.equal(next.data.get('sar-local-session-v1'),'test');assert.ok(save.balancePatchHistory.at(-1).changes.some(c=>c.weapon==='X-16 Auto'));
 for(const bot of Object.values(save.bots)){assert.equal(bot.familiarity['X-16 Auto'],0);assert.equal(bot.career.weaponUsage['X-16 Auto'].k,0);}assert.equal(save.playerCareer.weapons['X-16 Auto'].k,0);
 next.dev.saveTelemetry();const reloaded=engine(Object.fromEntries(next.data),injected);assert.equal(reloaded.dev.inspect().SAVE.patchArchives.length,save.patchArchives.length);assert.equal(reloaded.dev.inspect().SAVE.patchState.id,save.patchState.id);assert.equal(reloaded.dev.inspect().SAVE.playerCareer.kills,27);
 pass('Previous installed balance telemetry archives intact once; careers, IDs, account storage, seasons, unknown fields and existing loadout survive migration/reload');
}

{
 const playerGame=engine({},injected);playerGame.dev.CONFIG.sidearm='X-16 Auto';playerGame.dev.queueForMatch();for(let i=0;i<92;i++)playerGame.step();
 const {state,meta,SAVE}=playerGame.dev.inspect(),player=state.actors.find(a=>a.isPlayer),victim=state.actors.find(a=>a.matchId===player.matchId&&a.team!==player.team);for(const actor of state.actors)if(actor!==player){actor.dead=true;actor.respawnAt=1e12;}state.projectiles=[];
 assert.equal(player.slots[1].name,'X-16 Auto');assert.equal(player.slots[1].ammo,26);player.currentSlot=1;playerGame.dev.input.mouseDown=true;
 const shots=meta['X-16 Auto'].shots;for(let i=0;i<30;i++)playerGame.step(1/60);playerGame.dev.input.mouseDown=false;assert.ok(meta['X-16 Auto'].shots-shots>=2,'holding fire must produce automatic follow-ups');
 const now=playerGame.dev.now(),slot=player.slots[1];assert.equal(playerGame.dev.fire(player,player.angle,slot.lastShot+189),false);assert.equal(playerGame.dev.fire(player,player.angle,slot.lastShot+190),true);
 playerGame.context.__BALANCE.startReload(player,now);assert.ok(slot.reloading);const ammoBefore=slot.ammo,reserveBefore=slot.reserve;assert.equal(playerGame.dev.fire(player,player.angle,now+1000),false);playerGame.step(1.59);assert.equal(slot.ammo,ammoBefore);playerGame.step(.02);assert.equal(slot.ammo,26);assert.equal(slot.reserve,reserveBefore-(26-ammoBefore));assert.equal(slot.reloading,false);
 victim.dead=false;victim.hp=250;victim.damageByWeapon.clear();victim.damageLedger.clear();const before=meta['X-16 Auto'].kills;playerGame.dev.applyDamage(victim,{owner:player,weapon:'X-16 Auto',travel:430},250,false,playerGame.dev.now());assert.equal(meta['X-16 Auto'].kills,before+1);assert.equal(meta['X-16 Auto'].soloKills,1);assert.equal(SAVE.playerCareer.weapons['X-16 Auto'].k,1);
 playerGame.dev.setMetaKind('sidearm');assert.equal(playerGame.dev.visibleMetaRows().length,3);const row=playerGame.dev.currentMetaRows().find(r=>r.name==='X-16 Auto');assert.ok(playerGame.dev.metaDetailHtml([row]).includes('X-16 Auto'));assert.ok(e.context.SAR.getBotLoadouts().some(b=>b.sidearm==='X-16 Auto'),'bots must equip new sidearm');
 pass('X-16 Auto equips, fires automatically, obeys0.19s cadence/1.60s reload, records true player kill/contribution and appears in three-sidearm Meta and bot loadouts');
}

{
 const s=engine({},injected);for(let i=0;i<100;i++)s.step();const {state}=s.dev.inspect(),before=s.context.SAR.getUniverse(),snap=s.dev.renderSnapshot(),a=state.actors.find(a=>a.id===snap.actors[0].id),actor=snap.actors[0];assert.deepEqual(s.context.SAR.getUniverse(),before);
 assert.equal(actor.name,a.name);assert.equal(actor.maxHP,250);assert.equal(actor.hp,a.hp);assert.equal(actor.vx,a.vx);assert.equal(actor.vy,a.vy);assert.equal(actor.skinPalette.name,['Urban Assault','Woodland Scout','Desert Runner','Blue Strike','Crimson Guard','Steel Recon','Ranger Elite','Night Ops'][a.skinIndex]);
 for(const k of ['recoil','reloadProgress','adsBlend','muzzleFlash','hit','spawn','respawnProgress'])assert.ok(actor[k]>=0&&actor[k]<=1,k);assert.equal(actor.reloadDuration,weapons[actor.weapon].reload);assert.equal(actor.fireInterval,weapons[actor.weapon].hitSpeed);assert.equal(actor.muzzle,a.muzzleUntil>snap.time);
 const slot=a.slots[a.currentSlot];slot.lastShot=-999;slot.reloading=false;slot.ammo=weapons[slot.name].mag;assert.ok(s.dev.fire(a,a.angle,s.dev.now()));assert.ok(s.dev.renderSnapshot().actors.find(v=>v.id===a.id).shotId>actor.shotId);
 s.context.__BALANCE.startReload(a,s.dev.now());s.step(.1);const reload=s.dev.renderSnapshot().actors.find(v=>v.id===a.id);assert.ok(reload.reloading);assert.ok(reload.reloadProgress>0&&reload.reloadProgress<1);assert.ok(reload.reloadRemaining<reload.reloadDuration);
 s.dev.applyDamage(a,{owner:state.actors.find(b=>b.matchId===a.matchId&&b.team!==a.team),weapon:'AK47',travel:70},250,false,s.dev.now());const death=s.dev.renderSnapshot().actors.find(v=>v.id===a.id);assert.ok(death.dead);assert.equal(death.hp,0);approx(death.respawnRemaining,1.9);assert.equal(death.muzzle,false);assert.equal(death.sprinting,false);
 assert.ok(snap.geometry.surfaces.length>0&&snap.geometry.outerWorld.length>0);assert.ok(Array.isArray(snap.particles));
 pass('2.5D snapshot is read-only and derives skins, HP, motion, shot/reload events, death/respawn and environment from the real selected simulation');
}
fs.writeFileSync(path.join(__dirname,'balance-update-results.json'),JSON.stringify({result:'PASS',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),checks},null,2));
