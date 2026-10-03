(() => {
'use strict';

// ============================================================
// SKIRMISH ARENA — 1.7.0 — FIELDCRAFT
// High-DPI procedural Canvas renderer, no external libraries or image assets.
// Every visual is generated in code at runtime; all balance tuning lives in WEAPONS.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
let DPR = Math.min(2, window.devicePixelRatio || 1);
let simulationTime = performance.now();
const gameNow = () => simulationTime;
const TACTICS=window.SARTactics, AI_REVISION=TACTICS.revision;
const XP=window.SARProgression;
const wallNow = () => window.SARCloud?.now?.() ?? Date.now();
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
const DESIGN_WORLD = { w: 4800, h: 3200 };
const MAP_SCALE = 0.90;
const WORLD = { w: Math.round(DESIGN_WORLD.w * MAP_SCALE), h: Math.round(DESIGN_WORLD.h * MAP_SCALE) };
const TILE = 70;
const MATCH_DURATION_MS = 5 * 60 * 1000;
const SEASON_LENGTH_MS = 15 * 24 * 60 * 60 * 1000;
const MAX_HP = 250;
const BOT_COUNT = 50;
const MATCH_COUNT = 4;
const PLAYER_MATCH_SLOT_ID = MATCH_COUNT - 1;
const TEAM_SIZE = 5;
const SCORE_LIMIT = 60;
const SLOT_COOLDOWN_MS = 15000;
const RULESET_REVISION = 'core-gameplay-1';
const TEAM_PRESENTATION = window.SARTeamPresentation;
const ACTOR_RADIUS = 21;
const PLAYER_SPEED = 285;
const BOT_SPEED = 255;
const RESPAWN_MS = 1900;
const REGEN_THRESHOLD = 75;
const REGEN_DELAY_MS = 7000;
const REGEN_RATE = 25; // HP per second once low-health regen begins
const DASH_COOLDOWN_MS = 4000;
const DASH_DURATION_MS = 150;
const DASH_DISTANCE = 260;
const DASH_SPEED = DASH_DISTANCE / (DASH_DURATION_MS / 1000);

const WEAPONS = {
  'AR-15': { type:'primary', damage:28, spread:2.7, walkSpread:2.9, sprintSpread:3.6, adsSpread:1.5, falloffStart:22, falloff:0.025, head:42, speed:80, hitSpeed:0.3, mag:40, reload:2.1, reserve:120, role:'All-rounder', auto:true, pellets:1, color:'#d9bf79', preferred:900 },
  'AK47': { type:'primary', damage:34, spread:4, walkSpread:4.5, sprintSpread:5.2, adsSpread:1.6, falloffStart:25, falloff:0.028, head:50, speed:74, hitSpeed:0.35, mag:36, reload:2.75, reserve:120, role:'Heavy rifle', auto:true, pellets:1, color:'#ad7046', preferred:820 },
  'SMG-9': { type:'primary', damage:19, spread:3.1, walkSpread:3.3, sprintSpread:3.7, adsSpread:1.8, falloffStart:11, falloff:0.043, head:29, speed:62, hitSpeed:0.17, mag:42, reload:1.9, reserve:144, role:'Close tracking', auto:true, pellets:1, color:'#91a4b0', preferred:520 },
  'Pump Shotgun': { type:'primary', damage:124, spread:6.5, walkSpread:7.5, sprintSpread:9, adsSpread:3, falloffStart:3.5, falloff:0.10, head:248, speed:48, hitSpeed:1.5, mag:5, reload:2.4, reserve:30, role:'Burst shotgun', auto:false, pellets:8, color:'#46545c', preferred:330 },
  'Auto 12': { type:'primary', damage:49, spread:7.45, walkSpread:8.5, sprintSpread:10, adsSpread:3.4, falloffStart:5, falloff:0.08, head:84, speed:50, hitSpeed:0.51, mag:10, reload:4.6, reserve:50, role:'Auto shotgun', auto:true, pellets:6, color:'#566775', preferred:300 },
  'LR-762': { type:'primary', damage:63, spread:10, walkSpread:12, sprintSpread:15, adsSpread:1.2, falloffStart:32, falloff:0.015, head:124, speed:100, hitSpeed:0.84, mag:10, reload:3.2, reserve:60, role:'Marksman rifle', auto:false, pellets:1, color:'#6c7c66', preferred:1250 },
  'LW Tundra': { type:'primary', damage:121, spread:12.2, walkSpread:14, sprintSpread:18, adsSpread:1, falloffStart:45, falloff:0.010, head:181, speed:125, hitSpeed:1.4, mag:4, reload:2.8, reserve:25, role:'Sniper rifle', auto:false, pellets:1, color:'#acc5d4', preferred:1500 },
  'War Head LMG': { type:'primary', damage:45, spread:5.35, walkSpread:5.8, sprintSpread:6.2, adsSpread:1.8, falloffStart:24, falloff:0.020, head:65, speed:81, hitSpeed:0.42, mag:75, reload:4.7, reserve:225, role:'Sustained-fire LMG', auto:true, pellets:1, color:'#756b52', preferred:1000 },
  'P90': { type:'primary', damage:25, spread:2.2, walkSpread:2.4, sprintSpread:2.8, adsSpread:1.2, falloffStart:20, falloff:0.032, head:40, speed:70, hitSpeed:0.23, mag:36, reload:2.2, reserve:144, role:'Ranged SMG', auto:true, pellets:1, color:'#4f93ad', preferred:720 },
  '9mm': { type:'sidearm', damage:28, spread:4.75, walkSpread:5, sprintSpread:5.45, adsSpread:1.1, falloffStart:13, falloff:0.040, head:50, speed:60, hitSpeed:0.34, mag:16, reload:1.5, reserve:60, role:'Heavy sidearm', auto:false, pellets:1, color:'#4e5960', preferred:440 },
  'X16': { type:'sidearm', damage:24, spread:4, walkSpread:4.4, sprintSpread:4.75, adsSpread:1.3, falloffStart:11, falloff:0.045, head:34, speed:58, hitSpeed:0.19, mag:18, reload:1.2, reserve:72, role:'Fast sidearm', auto:false, pellets:1, color:'#252d32', preferred:390 },
  'X-16 Auto': { type:'sidearm', damage:21, spread:4.65, walkSpread:5, sprintSpread:5.35, adsSpread:1.5, falloffStart:10, falloff:0.0475, head:30, speed:62, hitSpeed:0.19, mag:26, reload:1.6, reserve:104, role:'Auto sidearm', auto:true, pellets:1, color:'#546c72', preferred:430 },
  'SR-Aug': { type:'primary', damage:23, head:45, spread:4.50, walkSpread:4.75, sprintSpread:5.50, adsSpread:2.20, falloffStart:19, falloff:0.024, speed:88, hitSpeed:0.70, burstCount:3, burstSpacing:0.065, mag:39, reserve:156, reload:2.40, role:'Triple Burst AR', auto:true, pellets:1, color:'#7c8964', preferred:750 },
  'SPAS-12': { type:'primary', role:'3 Shot Shotgun', auto:false, damage:100, head:210, spread:5.8, walkSpread:5.925, sprintSpread:6.25, adsSpread:1.7, falloffStart:7, falloff:0.05, speed:75, hitSpeed:1, mag:3, reserve:12, reload:3.6, pellets:12, preferred:420, color:'#7b8380' }
}
const PRIMARYS = Object.keys(WEAPONS).filter(k => WEAPONS[k].type === 'primary');
const SIDEARMS = Object.keys(WEAPONS).filter(k => WEAPONS[k].type === 'sidearm');


const WEAPON_PATCH_NOTES = [
  {version:'WEAPON BALANCE UPDATE 8.0',date:'OCTOBER 2, 2026',title:'CORE TUNING',letter:'Four weapons adjusted. The previous complete Weapon Meta dataset is archived, including its tactical revision samples. Lifetime careers, familiarity, seasons and tournament history are preserved.',changes:[
    {weapon:'War Head LMG',kind:'ADJUSTED',items:['Projectile speed: 78 → 81 tiles/s','Firing interval: 0.47s → 0.42s']},
    {weapon:'P90',kind:'ADJUSTED',items:['Headshot damage: 35 → 40','Firing interval: 0.24s → 0.23s','Reload: 2.40s → 2.20s']},
    {weapon:'SR-Aug',kind:'ADJUSTED',items:['Body damage: 24 → 23 per bullet','Headshot damage: 49 → 45 per bullet','Three independent rounds; burst cycle remains 0.70s and spacing remains 0.065s']},
    {weapon:'SPAS-12',kind:'ADJUSTED',items:['Combined body damage: 108 → 100','Combined headshot damage: 220 → 210','One shell still fires 12 independent pellets']}
  ]},
  {version:'WEAPON BALANCE UPDATE 7.0',date:'OCTOBER 1, 2026',title:'META REWORK / AUG TUNING',letter:'Six weapon adjustments are active. Previous Weapon Meta telemetry is archived under its existing balance version; the Balance 7.0 sample starts clean. Lifetime statistics, careers, familiarity, seasons, accounts and tournament history are preserved.',changes:[
    {weapon:'AK47',kind:'ADJUSTED',items:['Body damage: 33 → 34','Firing interval: 0.40s → 0.35s','Magazine: 32 → 36','Reload: 2.60s → 2.75s']},
    {weapon:'SMG-9',kind:'ADJUSTED',items:['Body damage: 20 → 19','Headshot damage: 30 → 29','Falloff start: 14 → 11 tiles','Falloff per tile: 4.00% → 4.30%']},
    {weapon:'LR-762',kind:'ADJUSTED',items:['Body damage: 57 → 63','Headshot damage: 125 → 124']},
    {weapon:'LW Tundra',kind:'ADJUSTED',items:['Body damage: 102 → 121','Headshot damage: 150 → 181','Firing interval: 1.60s → 1.40s','Magazine: 3 → 4']},
    {weapon:'SR-Aug',kind:'ADJUSTED',items:['Hip Fire spread: 3.50° → 4.50°','Hip Walk spread: 3.75° → 4.75°','Sprint Hip spread: 4.50° → 5.50°','ADS spread: 1.90° → 2.20°','Burst cycle: 0.55s → 0.70s']},
    {weapon:'SPAS-12',kind:'ADJUSTED',items:['Combined body damage: 110 → 108','Combined headshot damage: 225 → 220']}
  ]},
  {"version":"WEAPON BALANCE UPDATE 6.0","date":"SEPTEMBER 30, 2026","title":"SPAS-12 & Event Audio","letter":"The 9mm now uses 5.00° walking and 5.45° sprinting hip spread. SR-Aug deals 24 body / 49 head damage per independent round and repeats bursts every 550 ms, retaining 65 ms intra-burst spacing. SPAS-12 adds a three-shell, twelve-pellet primary. Physical head collisions remain authoritative for every projectile and pellet. Event-driven audio accompanies the existing simulation. Previous Meta telemetry is archived; lifetime careers, familiarity, seasons and accounts persist.","changes":[{"weapon":"9mm","kind":"ADJUSTED","reason":"Apply the supplied moving hip spread values.","items":["Hip Walk 2.50° → 5.00°","Sprint Hip 2.90° → 5.45°"]},{"weapon":"SR-Aug","kind":"ADJUSTED","reason":"Apply damage and burst-cycle changes without changing the three individual rounds.","items":["Body damage 25 → 24 per bullet","Headshot damage 50 → 49 per bullet","Burst cycle 0.35s → 0.55s; spacing remains 0.065s","Ideal Body / Head TTK 1.715s / 0.68s"]},{"weapon":"SPAS-12","kind":"NEW WEAPON","reason":"Add a three-shell shotgun through the existing independent pellet architecture and natural bot selection.","items":["Body / head damage 110 / 225 combined; 12 pellets per shell","Hip / walk / sprint / ADS 5.80° / 5.925° / 6.25° / 1.70°","Cycle 1.00s; magazine 3; reserve 12; reload 3.60s","Falloff starts at 7 tiles; 5.00% / tile; projectile 75 tiles/s","Preferred range 420 / 6.00 tiles; ideal Body / Head TTK 2.00s / 1.00s"]}]},
  {version:'WEAPON BALANCE UPDATE 5.0',date:'SEPTEMBER 30, 2026',title:'Four Spread States & SR-Aug',letter:'The supplied weapon sheet is now active. Stationary, walking, sprinting and ADS spread drive the same projectile cone and crosshair, with smooth transitions. The SR-Aug fires three individually resolved rounds, 65 ms apart, repeating on a 350 ms burst cycle. Current-patch telemetry starts clean; all previous patches, lifetime careers, familiarity and seasons remain intact. Preferred-range tiles are always derived from world range / 70. The intentional 9mm walking and sprint spreads are 2.50° and 2.90°.',changes:[{"weapon":"AR-15","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 28 / 42","Hip / walk / sprint / ADS 2.7° / 2.9° / 3.6° / 1.5°","Cycle 0.3s","Magazine / reserve 40 / 120; reload 2.1s","Falloff 22 tiles, 2.50% / tile; projectile 80 tiles/s","Preferred range 900 / 12.86 tiles"]},{"weapon":"AK47","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 33 / 50","Hip / walk / sprint / ADS 4° / 4.5° / 5.2° / 1.6°","Cycle 0.4s","Magazine / reserve 32 / 120; reload 2.6s","Falloff 25 tiles, 2.80% / tile; projectile 74 tiles/s","Preferred range 820 / 11.71 tiles"]},{"weapon":"SMG-9","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 20 / 30","Hip / walk / sprint / ADS 3.1° / 3.3° / 3.7° / 1.8°","Cycle 0.17s","Magazine / reserve 42 / 144; reload 1.9s","Falloff 14 tiles, 4.00% / tile; projectile 62 tiles/s","Preferred range 520 / 7.43 tiles"]},{"weapon":"Pump Shotgun","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 124 / 248","Hip / walk / sprint / ADS 6.5° / 7.5° / 9° / 3°","Cycle 1.5s","Magazine / reserve 5 / 30; reload 2.4s","Falloff 3.5 tiles, 10.00% / tile; projectile 48 tiles/s","Preferred range 330 / 4.71 tiles"]},{"weapon":"Auto 12","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 49 / 84","Hip / walk / sprint / ADS 7.45° / 8.5° / 10° / 3.4°","Cycle 0.51s","Magazine / reserve 10 / 50; reload 4.6s","Falloff 5 tiles, 8.00% / tile; projectile 50 tiles/s","Preferred range 300 / 4.29 tiles"]},{"weapon":"LR-762","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 57 / 125","Hip / walk / sprint / ADS 10° / 12° / 15° / 1.2°","Cycle 0.84s","Magazine / reserve 10 / 60; reload 3.2s","Falloff 32 tiles, 1.50% / tile; projectile 100 tiles/s","Preferred range 1250 / 17.86 tiles"]},{"weapon":"LW Tundra","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 102 / 150","Hip / walk / sprint / ADS 12.2° / 14° / 18° / 1°","Cycle 1.6s","Magazine / reserve 3 / 25; reload 2.8s","Falloff 45 tiles, 1.00% / tile; projectile 125 tiles/s","Preferred range 1500 / 21.43 tiles"]},{"weapon":"War Head LMG","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 45 / 65","Hip / walk / sprint / ADS 5.35° / 5.8° / 6.2° / 1.8°","Cycle 0.47s","Magazine / reserve 75 / 225; reload 4.7s","Falloff 24 tiles, 2.00% / tile; projectile 78 tiles/s","Preferred range 1000 / 14.29 tiles"]},{"weapon":"P90","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 25 / 35","Hip / walk / sprint / ADS 2.2° / 2.4° / 2.8° / 1.2°","Cycle 0.24s","Magazine / reserve 36 / 144; reload 2.4s","Falloff 20 tiles, 3.20% / tile; projectile 70 tiles/s","Preferred range 720 / 10.29 tiles"]},{"weapon":"9mm","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 28 / 50","Hip / walk / sprint / ADS 4.75° / 2.5° / 2.9° / 1.1°","Cycle 0.34s","Magazine / reserve 16 / 60; reload 1.5s","Falloff 13 tiles, 4.00% / tile; projectile 60 tiles/s","Preferred range 440 / 6.29 tiles"]},{"weapon":"X16","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 24 / 34","Hip / walk / sprint / ADS 4° / 4.4° / 4.75° / 1.3°","Cycle 0.19s","Magazine / reserve 18 / 72; reload 1.2s","Falloff 11 tiles, 4.50% / tile; projectile 58 tiles/s","Preferred range 390 / 5.57 tiles"]},{"weapon":"X-16 Auto","kind":"ADJUSTED","reason":"Apply the authoritative balance sheet and four shared spread states.","items":["Body / head damage 21 / 30","Hip / walk / sprint / ADS 4.65° / 5° / 5.35° / 1.5°","Cycle 0.19s","Magazine / reserve 26 / 104; reload 1.6s","Falloff 10 tiles, 4.75% / tile; projectile 62 tiles/s","Preferred range 430 / 6.14 tiles"]},{"weapon":"SR-Aug","kind":"NEW WEAPON","reason":"A freely available burst primary sampled through the existing bot selection system.","items":["Body / head damage 25 / 50","Hip / walk / sprint / ADS 3.5° / 3.75° / 4.5° / 1.9°","Cycle 0.35s; 3 rounds, 0.065s spacing","Magazine / reserve 39 / 156; reload 2.4s","Falloff 19 tiles, 2.40% / tile; projectile 88 tiles/s","Preferred range 750 / 10.71 tiles"]}]},
  {
    version:'WEAPON BALANCE UPDATE 4.0', date:'SEPTEMBER 29, 2026', title:'Official Balance Sheet & X-16 Auto',
    letter:`This patch applies the official weapon sheet and introduces the X-16 Auto: a 26-round automatic emergency sidearm with its own loadout, bot usage and live Sidearm Meta record. The AR-15 gains magazine endurance, the Pump trades one shell and slower follow-ups for a shorter reload, and the Auto 12 and existing sidearms receive the specified damage and spread changes. Current Meta starts a new balance patch; all older telemetry is archived, while lifetime careers, bot identities, familiarity, seasons and accounts are preserved. Preferred ranges use the game's actual 70-unit tile: AR-15 900 / 70 = 12.86 tiles and X-16 Auto 430 / 70 = 6.14 tiles. These normalize the inconsistent 13.36 and 5.91 tile labels in the supplied sheet without changing the requested world distances.`,
    changes:[
      {weapon:'X-16 Auto',kind:'NEW WEAPON',reason:'Add an automatic sidearm with a distinct extended magazine, snappy slide action and separate sidearm telemetry.',items:['Damage 21','Headshot Damage 30','Base Spread 3.65°','Falloff Start 10 tiles','Falloff 4.75% / tile','Projectile Speed 62 tiles/s','Hit Speed 0.19s','Magazine 26','Reserve 104','Reload 1.60s','Preferred Range 430 / 6.14 tiles']},
      {weapon:'AR-15',kind:'ADJUSTED',reason:'Apply the official magazine and reload values.',items:['Magazine 30 → 40','Reload 1.90s → 2.10s','Preferred Range 900 / 12.86 tiles']},
      {weapon:'Pump Shotgun',kind:'ADJUSTED',reason:'Apply the official blast damage, spread, cycle, shell capacity and reload.',items:['Damage 125 → 124','Base Spread 4.10° → 4.50°','Hit Speed 1.35s → 1.50s','Magazine 6 → 5','Reload 2.50s → 2.30s']},
      {weapon:'Auto 12',kind:'NERFED',reason:'Apply the official body damage while preserving headshot damage and other parameters.',items:['Damage 65 → 50']},
      {weapon:'P90',kind:'BUFFED',reason:'Apply the official body damage while preserving its 7–12 tile AI design range.',items:['Damage 24 → 25']},
      {weapon:'9mm',kind:'ADJUSTED',reason:'Apply the official heavy-sidearm damage and accuracy.',items:['Damage 31 → 28','Headshot Damage 43 → 40','Base Spread 1.75° → 2.75°']},
      {weapon:'X16',kind:'ADJUSTED',reason:'Apply the official fast-sidearm damage, accuracy and faster reload.',items:['Damage 25 → 24','Headshot Damage 36 → 34','Base Spread 2.00° → 3.00°','Reload 1.40s → 1.20s']}
    ]
  },
  {
    version:'WEAPON BALANCE UPDATE 3.0', date:'SEPTEMBER 29, 2026', title:'Accuracy Reset, Shotgun Commitment & P90 Introduction',
    letter:`Weapon Balance Update 3.0 continues the daily live-meta tuning cycle with a narrower focus on precision, engagement commitment and primary-weapon variety. The AR-15 and AK47 receive accuracy reductions to make sustained rifle pressure less universally reliable. The Pump Shotgun becomes significantly more rewarding on a perfect close-range headshot, but its effective window is shortened and follow-up shots are slower. The Auto 12 receives another small lethality reduction, while the LW Tundra becomes less forgiving through lower damage and substantially wider spread. This update also introduces the P90, a ranged SMG designed to bridge the space between the SMG-9 and traditional rifles through moderate damage, controllable range retention and a fast automatic cadence. These values are being introduced as live starting points; subsequent changes will continue to follow actual match telemetry rather than intended outcomes.`,
    changes:[
      {weapon:'P90',kind:'NEW WEAPON',reason:'Add a mobile automatic primary that can contest medium-short sightlines without replacing either the close-range SMG-9 or full rifles. Its 24 damage, 0.28-second cadence and 20-tile falloff start give it sustained pressure, while 3.20% falloff per tile keeps long-range efficiency controlled.',items:['Damage 24','Headshot Damage 35','Base Spread 2.20°','Falloff Start 20 tiles','Falloff 3.20% / tile','Projectile Speed 70 tiles/s','Hit Speed 0.28s','Magazine 36','Reserve 144','Reload 2.40s','Preferred Range 720']},
      {weapon:'AR-15',kind:'NERFED',reason:'Reduce the all-rounder’s precision ceiling so it remains dependable without being the easiest primary to use across nearly every engagement distance.',items:['Base Spread 1.40° → 1.70°']},
      {weapon:'AK47',kind:'NERFED',reason:'Pull back some of the AK47’s recent precision gains. Its damage, cadence and later falloff remain intact, but headshot output and base accuracy are reduced to create more separation from cleaner precision options.',items:['Headshot Damage 52 → 50','Base Spread 2.00° → 2.50°']},
      {weapon:'Pump Shotgun',kind:'ADJUSTED',reason:'Make the pump shotgun more decisive on an exceptional point-blank headshot while increasing the cost of missed or poorly positioned shots. The shorter falloff window and slower follow-up cadence make spacing more important.',items:['Headshot Damage 200 → 250','Base Spread 4.00° → 4.10°','Falloff Start 6 → 4 tiles','Hit Speed 1.15s → 1.35s','Reload 2.60s → 2.50s']},
      {weapon:'Auto 12',kind:'NERFED',reason:'Reduce repeated close-range burst efficiency without changing its magazine identity. Lower headshot output and a slightly slower firing interval create a clearer response window for opponents.',items:['Headshot Damage 92 → 84','Hit Speed 0.48s → 0.51s']},
      {weapon:'LW Tundra',kind:'NERFED',reason:'Increase the execution requirement on the dedicated sniper. Slightly lower damage and a much wider base spread make positioning and shot discipline matter more while preserving its long falloff profile.',items:['Damage 105 → 102','Headshot Damage 155 → 150','Base Spread 2.80° → 4.20°']}
    ]
  },
  {
    version:'WEAPON BALANCE UPDATE 2.0', date:'SEPTEMBER 29, 2026', title:'Meta Rebalance & War Head LMG Introduction',
    letter:`Weapon Balance Update 2.0 is designed to disrupt the established primary-weapon hierarchy while preserving clear reasons to choose every class. The AK47 receives a controlled consistency increase at range, while the SMG-9 and Auto 12 give up some close-range efficiency in exchange for more deliberate commitment. The LR-762 is being redefined around high-value precision: body-shot output is reduced, but accurate headshots are now significantly more rewarding. The X16 receives a faster firing cadence to strengthen its identity as the speed-focused sidearm. This update also introduces the War Head LMG, a 75-round sustained-fire primary built around pressure, magazine endurance and a costly reload window. As always, live bot performance—not intended outcomes—will determine whether these changes require follow-up adjustments.`,
    changes:[
      {weapon:'War Head LMG',kind:'NEW WEAPON',reason:'Introduce a sustained-fire option that can pressure lanes and survive extended engagements without giving it rifle-level precision. Its 75-round magazine is offset by a 4.30-second reload and moderate spread.',items:['Damage 48','Headshot Damage 68','Base Spread 2.35°','Falloff Start 24 tiles','Falloff 2.00% / tile','Projectile Speed 78 tiles/s','Hit Speed 0.50s','Magazine 75','Reserve 225','Reload 4.30s']},
      {weapon:'AK47',kind:'BUFFED',reason:'Improve the AK47’s ability to hold medium-range fights and reward accurate bursts without increasing base body damage. The faster cadence and later falloff point should raise consistency while preserving its heavier handling profile.',items:['Headshot Damage 49 → 52','Falloff Start 20 → 25 tiles','Hit Speed 0.42s → 0.40s']},
      {weapon:'SMG-9',kind:'ADJUSTED',reason:'Reduce raw close-range lethality and precision while giving the SMG more ammunition per magazine. The weapon should remain a tracking-focused pressure tool rather than winning purely through forgiving damage output.',items:['Damage 22 → 20','Headshot Damage 33 → 30','Base Spread 2.50° → 2.90°','Magazine 36 → 42','Reload 1.70s → 1.90s']},
      {weapon:'Auto 12',kind:'NERFED',reason:'The Auto 12 is receiving a broad efficiency reduction so repeated close-range shots require more commitment. Lower damage, wider spread, slower cycling and a substantially longer reload create clearer punishment windows.',items:['Damage 70 → 65','Headshot Damage 100 → 92','Base Spread 6.00° → 6.45°','Hit Speed 0.40s → 0.48s','Reload 2.40s → 4.60s']},
      {weapon:'LR-762',kind:'REWORKED',reason:'Shift the LR-762 away from forgiving semi-auto body-shot pressure and toward true marksman play. It is significantly less forgiving overall, but precision headshots now carry much greater impact.',items:['Damage 60 → 57','Headshot Damage 78 → 125','Base Spread 2.00° → 5.00°','Hit Speed 0.64s → 0.84s','Magazine 12 → 10','Reload 2.10s → 3.20s']},
      {weapon:'X16',kind:'BUFFED',reason:'Strengthen the X16’s speed-first sidearm identity and improve emergency finishing pressure without changing its damage, magazine or range profile.',items:['Hit Speed 0.25s → 0.19s']}
    ]
  },
  {
    version:'WEAPON BALANCE UPDATE 1.0', date:'SEPTEMBER 28, 2026', title:'Role Definition & Precision Pass',
    letter:`This update establishes a clearer weapon hierarchy for live 5v5 play. The goal is to make each weapon earn its place through a distinct combat role rather than allowing precision rifles to overlap too heavily or close-range weapons to feel unreliable inside their intended range. The AK47 is being shifted away from pure burst efficiency and toward sustained, committed rifle play. Both shotguns are receiving meaningful consistency increases so that successfully closing distance produces a credible advantage. The LR-762 and LW Tundra are receiving accuracy and handling adjustments so long-range lethality requires more deliberate positioning and shot discipline. Weapons not listed below are unchanged.`,
    changes:[
      {weapon:'AK47',kind:'ADJUSTED',reason:'Reduce mid-range burst efficiency while giving the rifle slightly more sustained magazine capacity. The slower reload makes that larger magazine a commitment rather than a free advantage.',items:['Damage 36 → 33','Headshot Damage 54 → 49','Base Spread 1.85° → 2.00°','Magazine 30 → 32','Reload 2.10s → 2.60s']},
      {weapon:'Pump Shotgun',kind:'BUFFED',reason:'Make the pump shotgun more dependable when a player successfully reaches close range. Higher shell damage and a tighter pellet cone increase reward for deliberate, well-timed shots without extending its falloff range.',items:['Damage 96 → 125','Headshot Damage 128 → 200','Base Spread 6.50° → 4.00°']},
      {weapon:'Auto 12',kind:'BUFFED',reason:'Increase close-range pressure and consistency so the Auto 12 properly fills its aggressive shotgun role. Damage and pellet concentration improve while its range, fire interval, magazine and reload remain unchanged.',items:['Damage 44 → 70','Headshot Damage 60 → 100','Base Spread 7.50° → 6.00°']},
      {weapon:'LR-762',kind:'NERFED',reason:'Reduce laser-like long-range consistency and create more separation between the marksman rifle and dedicated sniper rifle. Damage output and handling remain unchanged.',items:['Base Spread 0.65° → 2.00°']},
      {weapon:'LW Tundra',kind:'NERFED',reason:'Require greater shot discipline from the highest-range weapon. Increased spread, a slower follow-up interval, smaller magazine and longer reload make missed shots meaningfully costly while preserving its heavy per-shot damage.',items:['Base Spread 0.20° → 2.80°','Hit Speed 1.30s → 1.60s','Magazine 5 → 3','Reload 2.50s → 2.80s']}
    ]
  }
];

const SKINS = [
  {name:'Urban Assault', body:'#4a5962', vest:'#28353c', accent:'#93a4ad', pants:'#2f3a40', skin:'#c38f6a', build:1.02},
  {name:'Woodland Scout', body:'#627d4d', vest:'#3e5437', accent:'#a3c47c', pants:'#405044', skin:'#805b47', build:.98},
  {name:'Desert Runner', body:'#c5a36d', vest:'#8c744e', accent:'#f0d3a1', pants:'#786b52', skin:'#d3a079', build:.95},
  {name:'Blue Strike', body:'#26384a', vest:'#182631', accent:'#25a8ff', pants:'#1e2c35', skin:'#a96f55', build:1.00},
  {name:'Crimson Guard', body:'#342f35', vest:'#201f24', accent:'#e64f5c', pants:'#29282d', skin:'#70483b', build:1.05},
  {name:'Steel Recon', body:'#8c989e', vest:'#59666d', accent:'#d8e1e4', pants:'#4b575c', skin:'#e2b28e', build:.97},
  {name:'Ranger Elite', body:'#6c7147', vest:'#464a31', accent:'#b3945b', pants:'#4d4b35', skin:'#9c684e', build:1.04},
  {name:'Night Ops', body:'#222f3e', vest:'#151e29', accent:'#5f7fa2', pants:'#17222d', skin:'#bb8262', build:1.00}
];

const BOT_NAMES = [
  'Ace','Nova','Rook','Mako','Vex','Jett','Bolt','Kite','Onyx','Echo','Raze','Hawk','Drift','Knox','Frost',
  'Sable','Rift','Flint','Zero','Axel','Reign','Blitz','Vale','Ghost','Cruz','Ivy','Wren','Dash','Talon',
  'Orbit','Slate','Pike','Nyx','Cinder','Ryder','Lux','Bishop','Sage','Koda',
  'Quill','Raven','Strafe','Jinx','Atlas','Nash','Keen','Moss','Rune','Zane','Dune'
];
const CANONICAL_BOT_IDS=Object.fromEntries(BOT_NAMES.map((name,index)=>[name,'bot_'+String(index+1).padStart(4,'0')]));
function stableBotId(name){return CANONICAL_BOT_IDS[name]||'bot_legacy_'+profileSeed(name).toString(16);}
const RETIRED_BOT_NAMES = ['Mira'];

const STORE = {
  get(key, fallback=null){ try { const v=window.SARStorage?window.SARStorage.get(key):localStorage.getItem(key); return v===null?fallback:v; } catch { return fallback; } },
  set(key, value){ try {if(window.SARStorage)return window.SARStorage.set(key,value);localStorage.setItem(key, value);return true;} catch(error) {this.error=error.message;return false;} }
};

// Device-local account layer. This is intentionally separate from gameplay telemetry so
// future save migrations cannot invalidate login credentials. Passwords are never stored
// in plaintext; only a random salt + one-way hash are persisted.
const ACCOUNT_KEY='sar-local-accounts-v1';
const SESSION_KEY='sar-local-session-v1';
function readAccounts(){try{const value=JSON.parse(STORE.get(ACCOUNT_KEY,'{}'));return value&&typeof value==='object'&&!Array.isArray(value)?Object.assign(Object.create(null),value):Object.create(null);}catch{return Object.create(null);}}
function writeAccounts(v){STORE.set(ACCOUNT_KEY,JSON.stringify(v));}
function normalizeUsername(v){return String(v||'').trim().replace(/\s+/g,' ').slice(0,24);}
function accountId(v){return normalizeUsername(v).toLowerCase();}
function randomSalt(){
  const bytes=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=(Math.random()*256)|0;
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function passwordDigest(password,salt){
  const src=new TextEncoder().encode(`${salt}:${String(password)}`);
  if(globalThis.crypto?.subtle){
    const hash=await crypto.subtle.digest('SHA-256',src);
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  // Portable fallback for restricted file:// environments where SubtleCrypto is absent.
  let h1=0x811c9dc5,h2=0x9e3779b9;
  for(let round=0;round<6000;round++)for(const b of src){h1=Math.imul(h1^b^round,16777619)>>>0;h2=Math.imul(h2+(b^h1),2246822519)>>>0;}
  return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}
function currentAccount(){
  if(window.SARCloud?.state?.account)return window.SARCloud.state.account;
  const id=STORE.get(SESSION_KEY,'');if(!id)return null;
  const a=readAccounts()[id];return a?{id,username:a.username,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt}:null;
}
async function signUpLocal(username,password){
  username=normalizeUsername(username);password=String(password||'');
  if(username.length<2)return {ok:false,error:'Username must be at least 2 characters.'};
  if(password.length<4)return {ok:false,error:'Password must be at least 4 characters.'};
  const id=accountId(username),accounts=readAccounts();
  if(accounts[id])return {ok:false,error:'That username already exists on this device.'};
  const salt=randomSalt(),hash=await passwordDigest(password,salt),now=wallNow();
  accounts[id]={username,salt,hash,createdAt:now,lastLoginAt:now};writeAccounts(accounts);STORE.set(SESSION_KEY,id);
  return {ok:true,account:{id,username,createdAt:now,lastLoginAt:now}};
}
async function loginLocal(username,password){
  const id=accountId(username),accounts=readAccounts(),a=accounts[id];
  if(!a)return {ok:false,error:'Username or password is incorrect.'};
  const hash=await passwordDigest(String(password||''),a.salt);
  if(hash!==a.hash)return {ok:false,error:'Username or password is incorrect.'};
  a.lastLoginAt=wallNow();accounts[id]=a;writeAccounts(accounts);STORE.set(SESSION_KEY,id);
  return {ok:true,account:{id,username:a.username,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt}};
}
function logoutLocal(){STORE.set(SESSION_KEY,'');}

// One stable save key is intentionally version-agnostic. Every future build should migrate
// this object forward instead of changing keys, so bot careers and meta history never reset.
const SAVE_KEY='sar-persistent-save';
const SAVE_SCHEMA_VERSION=17;
const SAVE_SCHEMA=SAVE_SCHEMA_VERSION;
const DEFAULT_BINDS={
  moveUp:'KeyW',moveDown:'KeyS',moveLeft:'KeyA',moveRight:'KeyD',
  sprint:'ShiftLeft',dash:'Space',reload:'KeyR',primary:'Digit1',sidearm:'Digit2',
  scoreboard:'Tab',fullMap:'KeyM',ads:'MouseRight'
};
const POWER_SCORES=[99,96,94,92,90,88,86,84,82,80,78,76,74,72,70,68,66,64,62,60,58,56,54,52,50,48,46,44,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21];
const ARCHETYPES=['Marksman','Rusher','Flanker','Anchor','Flex'];
const STRATEGIC_ROLE_NAMES={
  Marksman:'Long-Range Marksman',
  Rusher:'Aggressive Rusher',
  Flanker:'Flanker',
  Anchor:'Defensive Anchor',
  Flex:'Adaptive Flex'
};
const STRATEGIC_ROLE_DESCRIPTIONS={
  Marksman:'favors medium-to-long sightlines, measured peeks and accurate shots',
  Rusher:'pushes openings, closes distance quickly and takes first-contact fights',
  Flanker:'uses side routes, off-angles and timing to attack from unexpected positions',
  Anchor:'holds strong cover, protects lanes and punishes enemies who overextend',
  Flex:'changes range, route and risk level according to the match state'
};
function strategicRole(archetype){return STRATEGIC_ROLE_NAMES[archetype]||'Adaptive Flex';}
const STYLE_WEAPON_PREFS={
  Marksman:['LW Tundra','LR-762','AK47','AR-15','War Head LMG','P90','SMG-9','Pump Shotgun','Auto 12'],
  Rusher:['SMG-9','P90','Auto 12','Pump Shotgun','AK47','AR-15','War Head LMG','LR-762','LW Tundra'],
  Flanker:['P90','SMG-9','AR-15','AK47','Pump Shotgun','Auto 12','War Head LMG','LR-762','LW Tundra'],
  Anchor:['War Head LMG','AR-15','AK47','LR-762','P90','LW Tundra','SMG-9','Auto 12','Pump Shotgun'],
  Flex:['AR-15','AK47','P90','War Head LMG','SMG-9','LR-762','Pump Shotgun','Auto 12','LW Tundra']
};
function personalityBlueprint(name,index,power,archetype){
  const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  const r=seeded(profileSeed(name)^0x9e3779b9),prefs=STYLE_WEAPON_PREFS[archetype]||PRIMARYS;
  const favoriteWeapon=prefs[Math.floor(r()*Math.min(4,prefs.length))]||PRIMARYS[index%PRIMARYS.length];
  // Power affects how strongly a bot reads the live meta, but nobody is hard-locked to a gun.
  let metaDrive=.46+lim((power-20)/79,0,1)*.43;
  let adaptability=.56+lim((power-20)/79,0,1)*.30;
  let weaponLoyalty=.08+r()*.12;
  let unpredictability=.14+r()*.30;
  let coverUse=.58,flankRate=.32,risk=.50;
  if(archetype==='Marksman'){coverUse=.76;flankRate=.22;risk=.38;}
  if(archetype==='Rusher'){coverUse=.48;flankRate=.34;risk=.72;}
  if(archetype==='Flanker'){coverUse=.58;flankRate=.68;risk=.58;}
  if(archetype==='Anchor'){coverUse=.84;flankRate=.16;risk=.34;}
  if(archetype==='Flex'){coverUse=.64;flankRate=.42;risk=.52;unpredictability+=.14;adaptability+=.08;}
  // Lower-power bots are allowed to be more erratic; elite bots still occasionally surprise the field.
  unpredictability+=lim((60-power)/220,0,.14);
  const metaText=power>=90?'strongly gravitates toward the best live weapons':power>=75?'usually favors strong meta weapons':power>=55?'balances meta strength with matchup fit':'uses the meta as a guide but can be highly unpredictable';
  return {
    label:strategicRole(archetype),tier:strategicRole(archetype),metaDrive:lim(metaDrive,.35,.92),adaptability:lim(adaptability,.50,.94),weaponLoyalty:lim(weaponLoyalty,.05,.22),
    coverUse:lim(coverUse,.35,.92),flankRate:lim(flankRate,.12,.75),risk:lim(risk,.28,.78),unpredictability:lim(unpredictability,.10,.58),favoriteWeapon,
    description:`${strategicRole(archetype)} — ${STRATEGIC_ROLE_DESCRIPTIONS[archetype]}; ${metaText}. Weapon choice is re-evaluated from match to match.`
  };
}
function blankWeaponMeta(name){
  return { name, picks:0, kills:0, deaths:0, damage:0, shots:0, hits:0, headshots:0, killDistance:0, killDistanceN:0, engagementDistance:0, engagementDistanceN:0, classifiedKills:0, soloKills:0, finisherKills:0, equippedTime:0 };
}
const PARTICIPANT_ANALYTICS_SCHEMA=1;
function blankCohortSample(){return {meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),skillStrata:{},participants:{},completedMatches:0};}
function ensureParticipantAnalytics(save){
  // Older combined measurements remain intact. None are attributed from names,
  // roster positions or inferred human shares; exact collection begins here.
  const patch=save.patchState;
  patch.participantAnalytics??={schema:PARTICIPANT_ANALYTICS_SCHEMA,startedAt:wallNow(),coverage:'prospective-skyline',legacy:{tdm:cloneData(patch.meta),deathmatch:cloneData(save.modeStats?.deathmatch?.meta||{})},samples:{}};
  const analytics=patch.participantAnalytics;
  if(analytics.schema!==PARTICIPANT_ANALYTICS_SCHEMA)throw Error('Unsupported participant analytics schema');
  analytics.samples[AI_REVISION]??={rulesetRevision:RULESET_REVISION,tdm:{human:blankCohortSample(),bot:blankCohortSample()},deathmatch:{human:blankCohortSample(),bot:blankCohortSample()}};
  return analytics;
}
function participantIdentity(a){
  if(a?.isPlayer===true)return {id:String(a.participantId||currentAccount()?.id||'local-player'),type:'human'};
  if(a?.isPlayer===false&&a.profile?.id)return {id:String(a.profile.id),type:'bot'};
  return null;
}
function participantSample(cohort='human',mode='tdm'){
  return SAVE.patchState.participantAnalytics.samples[AI_REVISION][mode==='deathmatch'?'deathmatch':'tdm'][cohort==='bot'?'bot':'human'];
}
function recordParticipantEvent(a,weapon,key,value){
  const match=getMatch(a.matchId),identity=participantIdentity(a);
  if(!identity||!match?.eligible||match.sessionType!=='standard'||match.practice||!WEAPONS[weapon])return;
  const sample=participantSample(identity.type,match.mode),band=skillBand(a);
  sample.participants[identity.id]??={participantId:identity.id,type:identity.type,meta:{}};
  const actor=sample.participants[identity.id];
  sample.skillStrata[band]??={};sample.skillStrata[band][weapon]??=blankWeaponMeta(weapon);actor.meta[weapon]??=blankWeaponMeta(weapon);
  for(const row of [sample.meta[weapon],sample.skillStrata[band][weapon],actor.meta[weapon]])row[key]=(row[key]||0)+value;
}
function recordParticipantCompletion(match,participants){
  if(!match.eligible||match.sessionType!=='standard'||match.practice)return;
  for(const cohort of new Set(participants.map(a=>participantIdentity(a)?.type).filter(Boolean)))participantSample(cohort,match.mode).completedMatches++;
}
function blankBotCareer(name){
  return {name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0,timePlayed:0,weaponUsage:{}};
}
function blankPlayerCareer(){
  return {name:'YOU',games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0,timePlayed:0,bestKills:0,bestDamage:0,bestStreak:0,currentStreak:0,bestWinStreak:0,currentWinStreak:0,bestKdGame:null,recentMatches:[],weapons:{}};
}
function profileSeed(name){ let h=2166136261; for(const ch of name){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
function defaultBotProfile(name,index){
  const power=POWER_SCORES[index] ?? Math.max(35,99-index*2);
  let archetype=ARCHETYPES[index%ARCHETYPES.length];
  if(index===0)archetype='Marksman';
  return {id:stableBotId(name),name,power,rank:index+1,archetype,feared:power>=90,personality:personalityBlueprint(name,index,power,archetype)};
}
function blankSeasonStats(name){return {name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0};}
function createSeason(number=1,startAt=wallNow()){
  return {number,startAt,endAt:startAt+SEASON_LENGTH_MS,winner:null,finalizedAt:null,stats:Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,blankSeasonStats(n)]))};
}
function normalizeSeasons(raw){
  const src=raw&&typeof raw==='object'?raw:{};
  const current=src.current&&typeof src.current==='object'?src.current:createSeason(1,wallNow());
  current.number=Number.isFinite(Number(current.number))?Math.max(1,Math.floor(Number(current.number))):1;current.startAt=Number.isFinite(Number(current.startAt))&&Number(current.startAt)>0?Number(current.startAt):wallNow();current.endAt=Number.isFinite(Number(current.endAt))&&Number(current.endAt)>current.startAt?Number(current.endAt):current.startAt+SEASON_LENGTH_MS;
  current.stats=current.stats&&typeof current.stats==='object'?current.stats:{};
  for(const n of BOT_NAMES.slice(0,BOT_COUNT))current.stats[n]=sanitizeStats(current.stats[n],blankSeasonStats(n));
  return {...src,current,history:Array.isArray(src.history)?src.history:[]};
}
function seasonKd(s){return s.deaths>0?s.kills/s.deaths:(s.kills>0?999:0);}
function seasonWinnerFor(season){
  const rows=BOT_NAMES.slice(0,BOT_COUNT).map(n=>season.stats[n]||blankSeasonStats(n));
  const played=rows.filter(r=>r.games>0);if(!played.length)return null;
  const qualified=played.filter(r=>r.games>=10),pool=qualified.length?qualified:played;
  pool.sort((a,b)=>seasonKd(b)-seasonKd(a)||b.wins-a.wins||b.kills-a.kills||b.damage-a.damage||a.name.localeCompare(b.name));
  const r=pool[0]||blankSeasonStats('—');
  return {name:r.name,kd:r.deaths>0?r.kills/r.deaths:r.kills,zeroDeaths:r.deaths===0&&r.kills>0,games:r.games,wins:r.wins,losses:r.losses,kills:r.kills,deaths:r.deaths,damage:r.damage};
}
function ensureSeasonFresh(now=wallNow()){
  if(!SAVE?.seasons?.current)return false;let changed=false;
  while(now>=SAVE.seasons.current.endAt){
    const cur=SAVE.seasons.current,winner=seasonWinnerFor(cur);cur.winner=winner;cur.finalizedAt=cur.endAt;
    SAVE.seasons.history.unshift(cloneData(cur));SAVE.seasons.current=createSeason(cur.number+1,cur.endAt);
    if(SAVE.playerSeasons){SAVE.playerSeasons.history.unshift(cloneData(SAVE.playerSeasons.current));SAVE.playerSeasons.current={number:cur.number+1,startAt:cur.endAt,endAt:cur.endAt+SEASON_LENGTH_MS,stats:blankSeasonStats('YOU')};}
    changed=true;
  }return changed;
}
function recordSeasonEvent(a,key,value=1){
  if(!officialTdm(a))return;
  ensureSeasonFresh(wallNow());const cur=SAVE.seasons.current,ss=a.isPlayer?SAVE.playerSeasons.current.stats:(cur.stats[a.name]||(cur.stats[a.name]=blankSeasonStats(a.name)));ss[key]=(ss[key]||0)+value;
}
function recordSeasonMatch(a,winner){
  if(!a||!a.career||!officialTdm(a))return;
  const cur=SAVE.seasons.current,ss=a.isPlayer?SAVE.playerSeasons.current.stats:(cur.stats[a.name]||(cur.stats[a.name]=blankSeasonStats(a.name)));
  ss.games++;if(a.team===winner)ss.wins++;else ss.losses++;
}
function formatSeasonRemaining(ms){
  ms=Math.max(0,ms);const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);
  return d>0?`${d}D ${h}H`:`${h}H ${m}M`;
}

// Schema migrations are additive. Unrecognized fields travel with the save.
function cloneData(v){return JSON.parse(JSON.stringify(v));}
function balanceSnapshot(){
  const fields=['type','damage','head','spread','walkSpread','sprintSpread','adsSpread','burstCount','burstSpacing','speed','hitSpeed','falloffStart','falloff','mag','reserve','reload','pellets','auto','preferred'];
  return Object.fromEntries(Object.keys(WEAPONS).sort().map(n=>[n,Object.fromEntries(fields.map(k=>[k,WEAPONS[n][k]]))]));
}
function balanceFingerprint(snapshot=balanceSnapshot()){return 'b-'+profileSeed(JSON.stringify(snapshot)).toString(16);}
function freshAiSample(){return {revision:AI_REVISION,startedAt:wallNow(),meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),perBot:{},skillStrata:{},completedMatches:0,observedSeconds:0};}
function freshPatch(reason='balance',generation=1){
  const stats=balanceSnapshot(),fingerprint=balanceFingerprint(stats);
  const note=WEAPON_PATCH_NOTES[0];
  return {id:`${fingerprint}-${generation}`,fingerprint,generation,rulesetRevision:RULESET_REVISION,label:note.version,balanceVersion:note.version.split(' ').at(-1),updateName:note.title,reason,startedAt:wallNow(),weaponStats:stats,aiSamples:{[AI_REVISION]:freshAiSample()},completedMatches:0,observedSeconds:0,meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),perBot:{},skillStrata:{}};
}
function personalityDefaults(profile,index){
  const base=personalityBlueprint(profile.name,index,profile.power,profile.archetype),p={...base,...profile.personality};
  const r=seeded(profileSeed(profile.name)^0xabc913),f=()=>.25+r()*.5;
  const defaults={aggression:p.risk,riskTolerance:p.risk,patience:1-p.risk,confidence:.5,weaponLoyalty:p.weaponLoyalty,metaAwareness:p.metaDrive,unpredictability:p.unpredictability,flankPreference:p.flankRate,coverPreference:p.coverUse,chasePreference:f(),retreatThreshold:.30+(1-p.risk)*.2,dashAggression:p.risk,reloadDiscipline:.55+r()*.35,targetPersistence:.4+r()*.4};
  for(const [k,v] of Object.entries(defaults))if(!Number.isFinite(p[k]))p[k]=v;
  return p;
}
const MIGRATIONS={
  13(s){
    s.patchArchives=Array.isArray(s.patchArchives)?s.patchArchives:[];
    if(!s.patchState){
      if(s.meta&&Object.values(s.meta).some(m=>m.kills||m.shots||m.equippedTime))s.patchArchives.push({id:'legacy-unverified',reason:'pre-fingerprint telemetry; balance version cannot be verified',startedAt:s.createdAt,endedAt:wallNow(),meta:cloneData(s.meta),perBot:Object.fromEntries(Object.entries(s.bots||{}).map(([n,b])=>[n,cloneData(b.career?.weaponUsage||{})]))});
      s.patchState=freshPatch('initial verified telemetry');s.meta=s.patchState.meta;
    }
    s.balancePatchHistory=Array.isArray(s.balancePatchHistory)?s.balancePatchHistory:[];s.schema=14;return s;
  },
  14(s){
    for(const [name,b] of Object.entries(s.bots||{})){
      if(!b.profile)continue;
      b.profile.personality=personalityDefaults({...b.profile,name},BOT_NAMES.indexOf(name));
      if(!Number.isFinite(b.recentForm))b.recentForm=0;
      b.familiarity={...b.familiarity};for(const w of Object.keys(WEAPONS))if(!Number.isFinite(b.familiarity[w]))b.familiarity[w]=0;
      if(!Array.isArray(b.recentMatches))b.recentMatches=[];
    }
    s.schema=15;return s;
  },
  15(s){s.config={...s.config};s.config.adsSensitivity??=.65;s.config.cameraAimBias??=false;s.config.binds={...s.config.binds};s.config.binds.ads??='MouseRight';s.schema=16;return s;},
  16(s){s.config={...s.config};s.config.viewMode??='CLASSIC';s.schema=17;return s;}
};
let migrationBackup=null,saveWriteProtected=false;
function sanitizeStats(record,defaults){
  const result={...defaults,...(record&&typeof record==='object'&&!Array.isArray(record)?record:{})};
  for(const [key,value] of Object.entries(defaults))if(typeof value==='number'){const n=Number(result[key]);result[key]=Number.isFinite(n)?Math.max(0,n):value;}
  return result;
}
function normalizeSave(raw){
  if(raw&&(!raw.bots||typeof raw.bots!=='object'||Array.isArray(raw.bots)))throw new Error('Save has invalid profiles');
  migrationBackup=raw?cloneData(raw):null;
  let out=raw?cloneData(raw):{schema:13,createdAt:wallNow(),config:{},bots:{},meta:{}};
  if(!raw){
    try{out.meta=JSON.parse(STORE.get('sar-v1-meta-v2','{}'))||{};}catch{}
    try{for(const [n,c] of Object.entries(JSON.parse(STORE.get('sar-v1-bot-career-v1','{}'))||{}))out.bots[n]={career:c};}catch{}
    out.config={primary:STORE.get('sar-v1-primary','AR-15'),sidearm:STORE.get('sar-v1-sidearm','9mm'),skin:Number(STORE.get('sar-v1-skin','0'))};
  }
  // An explicit persisted roster takes precedence over code defaults; never regenerate identities.
  const names=Array.isArray(out.activeBotNames)?out.activeBotNames:Object.keys(out.bots).filter(n=>!RETIRED_BOT_NAMES.includes(n)&&out.bots[n]?.profile);
  const active=[...new Set([...names,...BOT_NAMES])].slice(0,BOT_COUNT);BOT_NAMES.splice(0,BOT_NAMES.length,...active);out.activeBotNames=active;
  out.bots={...out.bots};
  active.forEach((name,index)=>{
    const b=out.bots[name]||{},def=defaultBotProfile(name,index);
    b.profile={...def,...b.profile,name};
    if(!Number.isFinite(b.profile.power))b.profile.power=def.power;
    if(!Number.isFinite(b.profile.rank))b.profile.rank=def.rank;
    if(!ARCHETYPES.includes(b.profile.archetype))b.profile.archetype=def.archetype;
    b.profile.personality=personalityDefaults(b.profile,index);
    b.career=sanitizeStats(b.career,blankBotCareer(name));b.career.weaponUsage={...b.career.weaponUsage};
    for(const w of Object.keys(WEAPONS))b.career.weaponUsage[w]=sanitizeStats(b.career.weaponUsage[w],{k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0});
    b.recentForm=Math.max(-10,Math.min(10,Number(b.recentForm)||0));b.familiarity={...b.familiarity};
    for(const w of Object.keys(WEAPONS))b.familiarity[w]=Math.max(0,Math.min(100,Number(b.familiarity[w])||0));
    b.recentMatches=Array.isArray(b.recentMatches)?b.recentMatches:[];out.bots[name]=b;
  });
  for(const [name,b] of Object.entries(out.bots))if(b.profile&&!b.profile.id)b.profile.id=stableBotId(name);
  let version=Number(out.schema)||13;
  if(version>SAVE_SCHEMA_VERSION){saveWriteProtected=true;}else{
    if(version<13)version=13;
    while(version<SAVE_SCHEMA_VERSION){const migrate=MIGRATIONS[version];if(!migrate)throw new Error(`No migration for schema ${version}`);out=migrate(out);version=out.schema;}
    out.schema=SAVE_SCHEMA_VERSION;
  }
  out.config={primary:'AR-15',sidearm:'9mm',skin:0,mouseSensitivity:1,adsSensitivity:.65,cameraAimBias:false,damageNumbers:true,binds:{...DEFAULT_BINDS},...out.config};
  if(!PRIMARYS.includes(out.config.primary))out.config.primary='AR-15';if(!SIDEARMS.includes(out.config.sidearm))out.config.sidearm='9mm';
  out.config.skin=Math.max(0,Math.min(SKINS.length-1,Math.floor(Number(out.config.skin)||0)));out.config.mouseSensitivity=Math.max(.25,Math.min(2.5,Number(out.config.mouseSensitivity)||1));
  out.config.adsSensitivity=Math.max(.30,Math.min(1,Number(out.config.adsSensitivity)||.65));out.config.cameraAimBias=out.config.cameraAimBias===true;
  out.config.damageNumbers=out.config.damageNumbers!==false;
  out.config.viewMode='2.5D';out.config.weaponInspection='2.5D';out.config.operatorInspection='2.5D';
  out.config.spectatorCamera=out.config.spectatorCamera==='TACTICAL'?'TACTICAL':'FOLLOW';
  const binds={...out.config.binds},used=new Set();
  for(const [action,def] of Object.entries(DEFAULT_BINDS)){
    let code=binds[action];if(typeof code!=='string'||!/^(Mouse(Right|Middle|Back|Forward)|Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Backspace|Enter|CapsLock|F[1-9]|F1[0-2])$/.test(code)||used.has(code))code=[def,...Object.values(DEFAULT_BINDS)].find(c=>!used.has(c));
    binds[action]=code;used.add(code);
  }out.config.binds=binds;
  out.seasons=normalizeSeasons(out.seasons);out.patchArchives=Array.isArray(out.patchArchives)?out.patchArchives:[];out.balancePatchHistory=Array.isArray(out.balancePatchHistory)?out.balancePatchHistory:[];
  const playerSeason=out.playerSeasons?.current;
  out.playerSeasons={...out.playerSeasons,current:playerSeason&&playerSeason.number===out.seasons.current.number?{...playerSeason,stats:sanitizeStats(playerSeason.stats,blankSeasonStats('YOU'))}:{number:out.seasons.current.number,startAt:out.seasons.current.startAt,endAt:out.seasons.current.endAt,stats:blankSeasonStats('YOU')},history:Array.isArray(out.playerSeasons?.history)?out.playerSeasons.history:[]};
  out.playerCareer=sanitizeStats(out.playerCareer,blankPlayerCareer());
  out.playerCareer.weapons={...out.playerCareer.weapons};
  for(const w of Object.keys(WEAPONS))out.playerCareer.weapons[w]=sanitizeStats(out.playerCareer.weapons[w],{k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0});
  out.playerCareer.recentMatches=Array.isArray(out.playerCareer.recentMatches)?out.playerCareer.recentMatches.slice(-30):[];
  if(!out.patchState)out.patchState=freshPatch();
  if(JSON.stringify(out.patchState.weaponStats)!==JSON.stringify(balanceSnapshot())){
    const old=out.patchState;out.patchArchives.push({...old,endedAt:wallNow(),meta:cloneData(old.meta||out.meta),reason:'weapon statistics changed'});
    const current=balanceSnapshot(),changes=[];
    for(const [n,w] of Object.entries(current))for(const [k,v] of Object.entries(w))if(old.weaponStats?.[n]?.[k]!==v)changes.push({weapon:n,field:k,before:old.weaponStats?.[n]?.[k]??null,after:v});
    out.balancePatchHistory.push({at:wallNow(),from:old.id,fromLabel:old.label,to:balanceFingerprint(),label:WEAPON_PATCH_NOTES[0].version,updateName:WEAPON_PATCH_NOTES[0].title,changes});out.patchState=freshPatch('weapon statistics changed',(old.generation||1)+1);
  }
  out.patchState.meta={...out.patchState.meta};out.patchState.perBot={...out.patchState.perBot};out.patchState.skillStrata={...out.patchState.skillStrata};
  for(const w of Object.keys(WEAPONS))out.patchState.meta[w]=sanitizeStats(out.patchState.meta[w],blankWeaponMeta(w));
  out.retiredBotArchive={...out.retiredBotArchive};for(const [n,b] of Object.entries(out.bots))if(!out.activeBotNames.includes(n))out.retiredBotArchive[n]=b;
  // Keep cumulative Balance 7.0 counters intact; revision samples are additive.
  out.patchState.aiSamples??={};
  if(!out.patchState.aiSamples[AI_REVISION]){
    if(!Object.keys(out.patchState.aiSamples).length)out.patchState.aiSamples['pre-tactical-instinct']={revision:'pre-tactical-instinct',endedAt:wallNow(),meta:cloneData(out.patchState.meta),perBot:cloneData(out.patchState.perBot),skillStrata:cloneData(out.patchState.skillStrata),completedMatches:out.patchState.completedMatches,observedSeconds:out.patchState.observedSeconds};
    out.patchState.aiSamples[AI_REVISION]={revision:AI_REVISION,startedAt:wallNow(),meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),perBot:{},skillStrata:{},completedMatches:0,observedSeconds:0};
  }
  out.aiRevision=AI_REVISION;
  out.modeStats??={};out.modeStats.deathmatch??={player:blankPlayerCareer(),bots:{},meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),completedMatches:0,recentMatches:[],revision:AI_REVISION};
  for(const name of Object.keys(WEAPONS))out.modeStats.deathmatch.meta[name]??=blankWeaponMeta(name);
  ensureParticipantAnalytics(out);
  out.progression=XP.normalize(out.progression,out);
  out.meta=out.patchState.meta;out.updatedAt=wallNow();return out;
}
let SAVE=(()=>{
  const text=STORE.get(SAVE_KEY,'null');try{const raw=JSON.parse(text);if(raw&&!raw.progression&&!STORE.get('sar-xp-migration-original',null)&&!STORE.set('sar-xp-migration-original',text))throw Error('The original save could not be backed up before progression migration.');const s=normalizeSave(raw);if(raw&&raw.schema!==s.schema)STORE.set('sar-migration-backup',text);return s;}
  catch(error){STORE.set('sar-recovery-backup',text);saveWriteProtected=true;console.error('Save preserved in recovery backup:',error);window.SARBoot?.fail('Your saved world could not be loaded. The original has been preserved. Retry to continue.',error);throw error;}
})();
const CONFIG=SAVE.config;
let meta=SAVE.meta;
let botCareerStore=Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,SAVE.bots[n].career]));
function botData(a){return a.tournamentBot||SAVE.bots[a.name];}
function actorMeta(a,weapon){return (a.tournamentMeta||meta)[weapon];}
function profileFor(name){return SAVE.bots[name]?.profile||defaultBotProfile(name,BOT_NAMES.indexOf(name));}
function careerFor(name){return botCareerStore[name]||SAVE.bots[name]?.career;}
function saveTelemetry(){
  if(saveWriteProtected||window.SARCloud?.state?.replacing)return;
  ensureSeasonFresh(wallNow());SAVE.schema=SAVE_SCHEMA_VERSION;SAVE.updatedAt=wallNow();SAVE.config=CONFIG;SAVE.meta=meta;SAVE.patchState.meta=meta;
  if(!STORE.set(SAVE_KEY,JSON.stringify(SAVE))){const status=document.getElementById('sarUpdateStatus');if(status)status.textContent='Device storage is full. Export Save Data to preserve this universe.';}
  window.SARCloud?.queueSave?.(SAVE);
}
function exportEnvelope(){
  saveTelemetry();const storage={};for(const [k,v] of (window.SARStorage?.entries()||Array.from({length:localStorage.length},(_,i)=>{const k=localStorage.key(i);return [k,localStorage.getItem(k)];}))){if(k?.startsWith('sar-')&&k!==SAVE_KEY)storage[k]=v;}
  return {format:'sar-complete-backup-v1',save:cloneData(SAVE),storage};
}
function exportSave(){
  const blob=new Blob([JSON.stringify(exportEnvelope(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='skirmish-arena-complete-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importSaveFile(file){
  if(!file)return;const originalRoster=BOT_NAMES.slice(),r=new FileReader();r.onload=async()=>{try{
    const parsed=JSON.parse(String(r.result||'')),world=parsed.format==='sar-complete-backup-v1'?parsed.save:parsed;
    if(!world||typeof world!=='object'||Array.isArray(world)||!world.bots)throw new Error('Invalid save');
    if(Number(world.schema)>SAVE_SCHEMA_VERSION)throw new Error('This save requires a newer game build');
    const migrated=normalizeSave(world);STORE.set('sar-import-backup',STORE.get(SAVE_KEY,'null'));
    if(window.SARCloud?.state?.account)await window.SARCloud.importWorld(migrated);
    if(!STORE.set(SAVE_KEY,JSON.stringify(migrated)))throw new Error('Device storage is full');saveWriteProtected=true;
    if(parsed.format==='sar-complete-backup-v1')for(const [k,v] of Object.entries(parsed.storage||{}))if(k.startsWith('sar-')&&!k.startsWith('sar-cloud-')&&k!==SAVE_KEY&&k!=='sar-import-backup'&&typeof v==='string')STORE.set(k,v);
    await window.SARStorage?.flush?.();
    location.reload();
  }catch(error){BOT_NAMES.splice(0,BOT_NAMES.length,...originalRoster);alert('Save import failed: '+error.message);}};r.readAsText(file);
}
setInterval(saveTelemetry,2000);window.addEventListener('beforeunload',saveTelemetry);window.addEventListener('sar-before-update',saveTelemetry);saveTelemetry();

let cssW = innerWidth, cssH = innerHeight;
function resize(){
  cssW = innerWidth; cssH = innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(cssW * DPR); canvas.height = Math.floor(cssH * DPR);
  canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
}
addEventListener('resize', resize); resize();

// -------------------- Procedural art cache --------------------
// No bitmap/SVG assets are loaded. These material tiles are painted in code once,
// then repeated by the renderer for richer detail at a low per-frame cost.
function seeded(seed){ let x=seed>>>0; return ()=>{ x=(1664525*x+1013904223)>>>0; return x/4294967296; }; }
function makeTexture(w,h,paint){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'); g.imageSmoothingEnabled=true; paint(g,w,h); return c;
}
function materialNoise(g,w,h,seed,count,colors,min=1,max=3){
  const r=seeded(seed);
  for(let i=0;i<count;i++){
    g.globalAlpha=.16+r()*.25; g.fillStyle=colors[(r()*colors.length)|0];
    const s=min+r()*(max-min); g.beginPath(); g.arc(r()*w,r()*h,s,0,Math.PI*2); g.fill();
  }
  g.globalAlpha=1;
}
const ART={
  grass: makeTexture(256,256,(g,w,h)=>{
    g.fillStyle='#82ad64';g.fillRect(0,0,w,h);
    const lg=g.createLinearGradient(0,0,w,h);lg.addColorStop(0,'rgba(255,255,255,.055)');lg.addColorStop(.55,'rgba(255,255,255,0)');lg.addColorStop(1,'rgba(20,94,44,.06)');g.fillStyle=lg;g.fillRect(0,0,w,h);
    const r=seeded(1107);g.lineCap='round';
    for(let i=0;i<210;i++){const x=r()*w,y=r()*h,len=3+r()*7;g.strokeStyle=r()>.5?'rgba(33,118,51,.20)':'rgba(223,247,180,.16)';g.lineWidth=.7+r()*1.1;g.beginPath();g.moveTo(x,y);g.lineTo(x+(r()-.5)*4,y-len);g.stroke();}
    materialNoise(g,w,h,20,80,['#4eaa45','#9bd86f','#d8ed9b'],.5,1.4);
  }),
  asphalt: makeTexture(192,192,(g,w,h)=>{
    g.fillStyle='#85928c';g.fillRect(0,0,w,h);materialNoise(g,w,h,29,180,['#6f7f77','#bac4b8','#7e8d82'],.5,2.2);
    const r=seeded(44);g.strokeStyle='rgba(74,87,89,.12)';g.lineWidth=1;for(let i=0;i<16;i++){g.beginPath();let x=r()*w,y=r()*h;g.moveTo(x,y);for(let k=0;k<3;k++){x+=(r()-.5)*28;y+=(r()-.5)*28;g.lineTo(x,y)}g.stroke();}
  }),
  dirt: makeTexture(160,160,(g,w,h)=>{
    g.fillStyle='#c6ad70';g.fillRect(0,0,w,h);materialNoise(g,w,h,52,150,['#967d4e','#e0cb8d','#b2945b'],.7,2.3);
  }),
  concrete: makeTexture(128,128,(g,w,h)=>{
    g.fillStyle='#d8d6c8';g.fillRect(0,0,w,h);materialNoise(g,w,h,74,95,['#b8b8ac','#f1eee0','#9ea4a0'],.45,1.5);
    g.strokeStyle='rgba(94,104,103,.10)';g.lineWidth=1;g.beginPath();g.moveTo(64,0);g.lineTo(64,h);g.moveTo(0,64);g.lineTo(w,64);g.stroke();
  })
};
let PAT=null;
function patterns(){ if(PAT)return PAT; PAT={grass:ctx.createPattern(ART.grass,'repeat'),asphalt:ctx.createPattern(ART.asphalt,'repeat'),dirt:ctx.createPattern(ART.dirt,'repeat'),concrete:ctx.createPattern(ART.concrete,'repeat')};return PAT; }
function rr(g,x,y,w,h,r,fill,stroke=null,lw=1){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}}
function poly(g,pts,fill,stroke=null,lw=1){g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}}

// -------------------- Map --------------------
// Brightfield's district plan is shared by drawing, collision, placement validation and navigation.
const floors=[],walls=[],solids=[],trees=[],decor=[],roads=[],surfaces=[],props=[],outerWorld=[];
const S=n=>n*MAP_SCALE;
const WORLD_PAD=2200;
const MAP_REPORT={rejected:{},placed:0,buildings:0,version:'brightfield-district-2'};
const doorZones=[],navigationCorridors=[];
const SPAWNS=[];
function mapRect(x,y,w,h,kind='wall',owner=null){const r={type:'rect',x,y,w,h,kind,owner};solids.push(r);walls.push(r);return r;}
function mapCircle(x,y,r,kind='tree'){const c={type:'circle',x,y,r,kind};solids.push(c);if(kind==='tree')trees.push(c);return c;}
function rectOverlap(a,b,pad=0){return a.x-pad<b.x+b.w&&a.x+a.w+pad>b.x&&a.y-pad<b.y+b.h&&a.y+a.h+pad>b.y;}
function objectBounds(o,visual=false){return o.type==='circle'?{x:o.x-o.r-(visual?22:0),y:o.y-o.r-(visual?22:0),w:2*(o.r+(visual?22:0)),h:2*(o.r+(visual?22:0))}:o;}
function addRoad(x,y,w,h,major=false){const r={x,y,w,h,major,horizontal:w>h};roads.push(r);navigationCorridors.push({...r,x:x-54,y:y-54,w:w+108,h:h+108});return r;}
addRoad(0,1320,WORLD.w,240,true);addRoad(2040,0,240,WORLD.h,true);
addRoad(0,450,WORLD.w,140);addRoad(0,2290,WORLD.w,140);
addRoad(640,0,140,WORLD.h);addRoad(3540,0,140,WORLD.h);
function buildingAt(x,y){return floors.find(f=>x>f.x+22&&x<f.x+f.w-22&&y>f.y+22&&y<f.y+f.h-22)||null;}
function districtBuilding(x,y,w,h,front,tone,label){
  const b={id:floors.length,x,y,w,h,tone,label,front,exits:[]};
  if(roads.some(r=>rectOverlap(b,r,54)))throw new Error('District building intersects street: '+label);
  floors.push(b);MAP_REPORT.buildings++;
  const sides=(front==='east'||front==='west')?['west','east']:['north','south'],t=22,opening=144;
  for(const side of ['north','south','west','east']){
    const horiz=side==='north'||side==='south',sx=side==='east'?x+w-t:x,sy=side==='south'?y+h-t:y,len=horiz?w:h;
    if(sides.includes(side)){
      const part=(len-opening)/2;
      mapRect(sx,sy,horiz?part:t,horiz?t:part,'building',b.id);
      mapRect(horiz?sx+part+opening:sx,horiz?sy:sy+part+opening,horiz?part:t,horiz?t:part,'building',b.id);
      const dx=side==='west'?-1:side==='east'?1:0,dy=side==='north'?-1:side==='south'?1:0;
      const cx=horiz?x+w/2:(side==='west'?x+t/2:x+w-t/2),cy=horiz?(side==='north'?y+t/2:y+h-t/2):y+h/2;
      const exit={id:side,x:cx,y:cy,dx,dy,inside:{x:cx-dx*72,y:cy-dy*72},outside:{x:cx+dx*86,y:cy+dy*86},release:{x:cx+dx*150,y:cy+dy*150}};
      for(const p of [exit.outside,exit.release]){p.x=Math.max(52,Math.min(WORLD.w-52,p.x));p.y=Math.max(52,Math.min(WORLD.h-52,p.y));}b.exits.push(exit);doorZones.push({x:cx-(horiz?opening/2+28:160),y:cy-(horiz?160:opening/2+28),w:horiz?opening+56:320,h:horiz?320:opening+56,building:b.id});
      // Walks lead from every door to the nearest street curb, reserving a clean approach.
      const r=roads.filter(r=>horiz?r.horizontal:!r.horizontal).sort((a,c)=>Math.abs((horiz?a.y+a.h/2:a.x+a.w/2)-(horiz?cy:cx))-Math.abs((horiz?c.y+c.h/2:c.x+c.w/2)-(horiz?cy:cx)))[0];
      let ex=cx,ey=cy;
      if(horiz)ey=dy<0?r.y+r.h+8:r.y-8;else ex=dx<0?r.x+r.w+8:r.x-8;
      // The secondary door may face away from its nearest street; use a short yard walk instead.
      if((ex-cx)*dx+(ey-cy)*dy<0||Math.hypot(ex-cx,ey-cy)>650){ex=cx+dx*160;ey=cy+dy*160;}
      ex=Math.max(40,Math.min(WORLD.w-40,ex));ey=Math.max(40,Math.min(WORLD.h-40,ey));const walk={x:Math.min(cx,ex)-(horiz?62:0),y:Math.min(cy,ey)-(horiz?0:62),w:horiz?124:Math.abs(ex-cx),h:horiz?Math.abs(ey-cy):124,kind:side===front?'driveway':'walk',building:b.id};
      surfaces.push(walk);navigationCorridors.push({...walk,x:walk.x-25,y:walk.y-25,w:walk.w+50,h:walk.h+50});
    }else mapRect(sx,sy,horiz?w:t,horiz?t:h,'building',b.id);
  }
  return b;
}
[
 [160,770,360,320,'east',0,'Willow House'],[1010,790,380,320,'south',1,'Cedar House'],
 [1110,110,420,260,'south',2,'North Cottage'],[2850,110,420,260,'south',0,'Juniper House'],
 [2600,790,410,320,'south',3,'Elm House'],[3810,770,330,320,'west',1,'East Cottage'],
 [160,1800,360,320,'east',3,'Maple House'],[1080,1760,420,330,'north',2,'Garden House'],
 [1300,2510,400,260,'north',1,'South Cottage'],[2700,1760,420,330,'north',0,'Birch House'],
 [2800,2510,400,260,'north',3,'Acacia House'],[3800,1810,350,310,'west',2,'Orchard House']
].forEach(v=>districtBuilding(...v));
// Spawn courts stay clear of every road, doorway, wall and prop.
for(const [x,y] of [[100,150],[460,300],[850,170],[1850,200],[2440,200],[3380,180],[3770,200],[4220,250],[95,1220],[850,1210],[1870,1210],[2420,1210],[3340,1210],[4210,1220],[95,1630],[900,1630],[1870,1630],[2420,1630],[3340,1630],[4220,1650],[100,2720],[850,2700],[1880,2700],[2440,2700],[3390,2700],[4220,2710],[920,650],[1750,650],[2440,650],[3340,650],[940,2180],[1770,2180],[2440,2180],[3350,2180]])SPAWNS.push({x,y});
function placementProblem(o,{interior=false}={}){
  const b=objectBounds(o,true);
  if(b.x<52||b.y<52||b.x+b.w>WORLD.w-52||b.y+b.h>WORLD.h-52)return 'perimeter';
  if(roads.some(r=>rectOverlap(b,r,24)))return 'road';
  if(doorZones.some(z=>rectOverlap(b,z)))return 'doorway';
  if(navigationCorridors.some(z=>rectOverlap(b,z,8)))return 'corridor';
  if(SPAWNS.some(p=>rectOverlap(b,{x:p.x-64,y:p.y-64,w:128,h:128})))return 'spawn';
  if(!interior&&floors.some(f=>rectOverlap(b,f,45)))return 'building';
  if(solids.some(s=>rectOverlap(b,objectBounds(s,s.kind==='tree'),ACTOR_RADIUS*2+16)))return 'prop';
  return null;
}
function placeProp(o,options){const why=placementProblem(o,options);if(why){MAP_REPORT.rejected[why]=(MAP_REPORT.rejected[why]||0)+1;return false;}if(o.type==='circle')mapCircle(o.x,o.y,o.r,o.kind);else {mapRect(o.x,o.y,o.w,o.h,o.kind);if(['car','bench','utility'].includes(o.kind))props.push(o);}MAP_REPORT.placed++;return true;}
// Yard dividers have generous open ends; all use the same placement checks as random cover.
for(const b of floors){for(const r of [{x:b.x-74,y:b.y+68,w:14,h:b.h-136},{x:b.x+b.w+60,y:b.y+68,w:14,h:b.h-136},{x:b.x+60,y:b.y-70,w:b.w-120,h:14},{x:b.x+60,y:b.y+b.h+56,w:b.w-120,h:14}])placeProp({type:'rect',...r,kind:'fence'});}
const districtRng=seeded(0x42524947);
for(const [kind,count] of [['tree',48],['bush',36],['crate',20],['rock',14],['utility',10],['bench',8],['car',10]]){
  let placed=0;for(let tries=0;placed<count&&tries<900;tries++){
    const x=80+districtRng()*(WORLD.w-160),y=80+districtRng()*(WORLD.h-160);
    const o=['tree','bush','rock'].includes(kind)?{type:'circle',x,y,r:kind==='tree'?30+districtRng()*12:kind==='bush'?24:24+districtRng()*10,kind}:{type:'rect',x,y,w:kind==='car'?108:kind==='bench'?74:kind==='utility'?48:70,h:kind==='car'?48:kind==='bench'?24:kind==='utility'?42:70,kind};
    if(placeProp(o))placed++;
  }
}
// Sparse interior fixtures leave the doorway-to-doorway centreline completely clear.
for(const b of floors){const o={type:'rect',x:b.x+46,y:b.y+46,w:70,h:42,kind:'interior',owner:b.id};if(!doorZones.some(z=>rectOverlap(o,z,18))&&!solids.some(s=>rectOverlap(o,objectBounds(s),20)))mapRect(o.x,o.y,o.w,o.h,o.kind,b.id);}
for(let i=0;i<420;i++){const x=districtRng()*WORLD.w,y=districtRng()*WORLD.h;if(!roads.some(r=>rectOverlap({x,y,w:8,h:8},r,60))&&!floors.some(f=>rectOverlap({x,y,w:8,h:8},f))&&!surfaces.some(f=>rectOverlap({x,y,w:8,h:8},f)))decor.push({x,y,t:i%4,s:2+i%3});}
// Continuous physical border, including closed street gates: no gap permits actor escape.
mapRect(0,0,WORLD.w,24,'perimeter');mapRect(0,WORLD.h-24,WORLD.w,24,'perimeter');mapRect(0,24,24,WORLD.h-48,'perimeter');mapRect(WORLD.w-24,24,24,WORLD.h-48,'perimeter');
// Outer blocks are only decoration and never enter collision, spawn, LOS or minimap data.
const outerRng=seeded(0x4e454947);
for(let gy=-WORLD_PAD;gy<WORLD.h+WORLD_PAD;gy+=540)for(let gx=-WORLD_PAD;gx<WORLD.w+WORLD_PAD;gx+=620){
  const lot={x:gx+80,y:gy+90,w:270+outerRng()*80,h:180+outerRng()*60,tone:Math.floor(outerRng()*4)};
  if(rectOverlap(lot,{x:-100,y:-100,w:WORLD.w+200,h:WORLD.h+200}))continue;
  if(roads.some(r=>rectOverlap(lot,{x:r.x-(r.horizontal?WORLD_PAD:0),y:r.y-(r.horizontal?0:WORLD_PAD),w:r.w+(r.horizontal?WORLD_PAD*2:0),h:r.h+(r.horizontal?0:WORLD_PAD*2)},25)))continue;outerWorld.push({...lot,kind:'house'});outerWorld.push({x:gx+440,y:gy+210,r:42,kind:'tree'});outerWorld.push({x:gx+74,y:gy+370,w:105,h:42,kind:'car',tone:Math.floor(outerRng()*4)});outerWorld.push({x:gx+530,y:gy+400,kind:'pole'});
}

const SOLID_CELL=200,SOLID_GRID=new Map();
for(const o of solids){
  const x=o.type==='rect'?o.x:o.x-o.r,y=o.type==='rect'?o.y:o.y-o.r,w=o.type==='rect'?o.w:o.r*2,h=o.type==='rect'?o.h:o.r*2;
  for(let cy=Math.floor(y/SOLID_CELL);cy<=Math.floor((y+h)/SOLID_CELL);cy++)for(let cx=Math.floor(x/SOLID_CELL);cx<=Math.floor((x+w)/SOLID_CELL);cx++){const k=cx+','+cy;let a=SOLID_GRID.get(k);if(!a)SOLID_GRID.set(k,a=[]);a.push(o);}
}
function querySolids(x1,y1,x2,y2){
  const found=new Set();for(let y=Math.floor(y1/SOLID_CELL);y<=Math.floor(y2/SOLID_CELL);y++)for(let x=Math.floor(x1/SOLID_CELL);x<=Math.floor(x2/SOLID_CELL);x++)for(const o of SOLID_GRID.get(x+','+y)||[])found.add(o);return found;
}

// Walk only the cells crossed by the ray (supercover DDA), not its whole bounding rectangle.
function querySegmentSolids(x1,y1,x2,y2){
  const found=new Set();let cx=Math.floor(x1/SOLID_CELL),cy=Math.floor(y1/SOLID_CELL),ex=Math.floor(x2/SOLID_CELL),ey=Math.floor(y2/SOLID_CELL);
  const dx=x2-x1,dy=y2-y1,sx=Math.sign(dx),sy=Math.sign(dy),deltaX=dx?SOLID_CELL/Math.abs(dx):Infinity,deltaY=dy?SOLID_CELL/Math.abs(dy):Infinity;
  let tx=dx?((sx>0?(cx+1)*SOLID_CELL:cx*SOLID_CELL)-x1)/dx:Infinity,ty=dy?((sy>0?(cy+1)*SOLID_CELL:cy*SOLID_CELL)-y1)/dy:Infinity;
  const add=(x,y)=>{for(const o of SOLID_GRID.get(x+','+y)||[])found.add(o);};add(cx,cy);
  let guard=0;while((cx!==ex||cy!==ey)&&guard++<100){
    if(Math.abs(tx-ty)<1e-10){add(cx+sx,cy);add(cx,cy+sy);cx+=sx;cy+=sy;tx+=deltaX;ty+=deltaY;}
    else if(tx<ty){cx+=sx;tx+=deltaX;}else{cy+=sy;ty+=deltaY;}add(cx,cy);
  }return found;
}
// -------------------- Utilities --------------------
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const dist2=(a,b)=>{const x=a.x-b.x,y=a.y-b.y;return x*x+y*y};
const dist=(a,b)=>Math.sqrt(dist2(a,b));
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function segCircle(x1,y1,x2,y2,cx,cy,r){
  const dx=x2-x1, dy=y2-y1, fx=x1-cx, fy=y1-cy;
  const a=dx*dx+dy*dy; if(fx*fx+fy*fy<=r*r)return 0; if(a<1e-9) return null;
  const b=2*(fx*dx+fy*dy), c=fx*fx+fy*fy-r*r;
  const d=b*b-4*a*c; if(d<0) return null;
  const s=Math.sqrt(d); const t1=(-b-s)/(2*a), t2=(-b+s)/(2*a);
  if(t1>=0&&t1<=1) return t1; if(t2>=0&&t2<=1) return t2; return null;
}
function segRect(x1,y1,x2,y2,r){
  let t0=0,t1=1; const dx=x2-x1,dy=y2-y1;
  const p=[-dx,dx,-dy,dy], q=[x1-r.x,r.x+r.w-x1,y1-r.y,r.y+r.h-y1];
  for(let i=0;i<4;i++){
    if(Math.abs(p[i])<1e-9){ if(q[i]<0) return null; }
    else { const t=q[i]/p[i]; if(p[i]<0){ if(t>t1)return null; if(t>t0)t0=t; } else { if(t<t0)return null; if(t<t1)t1=t; } }
  }
  return t0;
}
function lineDistToPoint(x1,y1,x2,y2,px,py){
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1; const t=clamp(((px-x1)*dx+(py-y1)*dy)/l2,0,1);
  const qx=x1+t*dx,qy=y1+t*dy; return Math.hypot(px-qx,py-qy);
}
function obstacleHitT(x1,y1,x2,y2,hitInfo=null){
  let best=null;
  for(const o of querySegmentSolids(x1,y1,x2,y2)){
    let t=null;
    if(o.type==='rect') t=segRect(x1,y1,x2,y2,o);
    else t=segCircle(x1,y1,x2,y2,o.x,o.y,o.r);
    if(t!==null && (best===null||t<best)){best=t;if(hitInfo)hitInfo.solid=o;}
  }
  return best;
}
function hasLOS(a,b){ return obstacleHitT(a.x,a.y,b.x,b.y)===null; }
function collides(x,y,r=ACTOR_RADIUS){
  if(x-r<0||y-r<0||x+r>WORLD.w||y+r>WORLD.h) return true;
  for(const o of querySolids(x-r,y-r,x+r,y+r)){
    if(o.type==='circle'){
      if(Math.hypot(x-o.x,y-o.y)<r+o.r) return true;
    } else {
      const nx=clamp(x,o.x,o.x+o.w), ny=clamp(y,o.y,o.y+o.h);
      if((x-nx)*(x-nx)+(y-ny)*(y-ny)<r*r) return true;
    }
  }
  return false;
}
function moveWithCollision(a,dx,dy){
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(ACTOR_RADIUS*.45)));
  const ox=a.x,oy=a.y;for(let i=0;i<steps;i++){const nx=a.x+dx/steps;if(!collides(nx,a.y))a.x=nx;const ny=a.y+dy/steps;if(!collides(a.x,ny))a.y=ny;}if(Math.hypot(dx,dy)>1&&Math.hypot(a.x-ox,a.y-oy)<Math.hypot(dx,dy)*.35)a.collisionCount=(a.collisionCount||0)+1;
}
function formatTime(s){ const m=Math.floor(s/60),ss=Math.floor(s%60); return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'); }

// -------------------- Tactical navigation --------------------
// Every bot uses the same A* / cover system. Power affects execution quality, not access to strategy.
const NAV_STEP=40,NAV_COLS=Math.ceil(WORLD.w/NAV_STEP),NAV_ROWS=Math.ceil(WORLD.h/NAV_STEP);
let NAV_READY=false,NAV_WALKABLE=[],NAV_EDGES=[];
const COVER_POINTS=[];
function pathClear(x1,y1,x2,y2,r=ACTOR_RADIUS){
  if(collides(x1,y1,r)||collides(x2,y2,r))return false;r=Math.max(0,r-1e-5); // Legal tangency must not become an inclusive ray hit at t=0.
  for(const o of querySolids(Math.min(x1,x2)-r,Math.min(y1,y2)-r,Math.max(x1,x2)+r,Math.max(y1,y2)+r)){
    if(o.type==='circle'){if(segCircle(x1,y1,x2,y2,o.x,o.y,o.r+r)!==null)return false;}
    else{
      if(segRect(x1,y1,x2,y2,{x:o.x-r,y:o.y,w:o.w+2*r,h:o.h})!==null||segRect(x1,y1,x2,y2,{x:o.x,y:o.y-r,w:o.w,h:o.h+2*r})!==null)return false;
      for(const [cx,cy] of [[o.x,o.y],[o.x+o.w,o.y],[o.x,o.y+o.h],[o.x+o.w,o.y+o.h]])if(segCircle(x1,y1,x2,y2,cx,cy,r)!==null)return false;
    }
  }return true;
}
function buildNavigation(){
  if(NAV_READY)return;NAV_READY=true;NAV_WALKABLE=new Array(NAV_COLS*NAV_ROWS).fill(false);
  for(let y=0;y<NAV_ROWS;y++)for(let x=0;x<NAV_COLS;x++){
    const px=clamp((x+.5)*NAV_STEP,ACTOR_RADIUS+8,WORLD.w-ACTOR_RADIUS-8),py=clamp((y+.5)*NAV_STEP,ACTOR_RADIUS+8,WORLD.h-ACTOR_RADIUS-8);
    NAV_WALKABLE[y*NAV_COLS+x]=!collides(px,py,ACTOR_RADIUS+4);
  }
  // Connectivity checks swept body clearance, so a thin wall between open cells cannot be crossed.
  NAV_EDGES=Array.from({length:NAV_WALKABLE.length},()=>[]);
  for(let y=0;y<NAV_ROWS;y++)for(let x=0;x<NAV_COLS;x++){
    const idx=navIndex(x,y);if(!NAV_WALKABLE[idx])continue;const a=navPoint(idx);
    for(const [ox,oy] of [[1,0],[0,1],[1,1],[-1,1]]){
      const nx=x+ox,ny=y+oy;if(nx<0||nx>=NAV_COLS||ny>=NAV_ROWS)continue;const ni=navIndex(nx,ny);if(!NAV_WALKABLE[ni])continue;
      const b=navPoint(ni);if(pathClear(a.x,a.y,b.x,b.y,ACTOR_RADIUS+3)){const cost=Math.hypot(ox,oy)*NAV_STEP;NAV_EDGES[idx].push([ni,cost]);NAV_EDGES[ni].push([idx,cost]);}
    }
  }
  const visited=new Uint8Array(NAV_WALKABLE.length);let largest=[];
  for(let start=0;start<NAV_WALKABLE.length;start++){if(!NAV_WALKABLE[start]||visited[start])continue;const queue=[start];visited[start]=1;for(let i=0;i<queue.length;i++)for(const [ni] of NAV_EDGES[queue[i]])if(!visited[ni]){visited[ni]=1;queue.push(ni);}if(queue.length>largest.length)largest=queue;}
  const connected=new Set(largest);MAP_REPORT.disconnectedNavigationCells=0;for(let i=0;i<NAV_WALKABLE.length;i++)if(NAV_WALKABLE[i]&&!connected.has(i)){NAV_WALKABLE[i]=false;NAV_EDGES[i]=[];MAP_REPORT.disconnectedNavigationCells++;}
  const addCover=(x,y,px1,py1,px2,py2)=>{
    if(!collides(x,y,ACTOR_RADIUS+5))COVER_POINTS.push({x,y,peek:[{x:px1,y:py1},{x:px2,y:py2}]});
  };
  for(const o of solids){
    const off=ACTOR_RADIUS+20;
    if(o.type==='rect'){
      const xs=[o.x+o.w*.08,o.x+o.w*.28,o.x+o.w*.5,o.x+o.w*.72,o.x+o.w*.92],ys=[o.y+o.h*.08,o.y+o.h*.28,o.y+o.h*.5,o.y+o.h*.72,o.y+o.h*.92];
      for(const x of xs){addCover(x,o.y-off,o.x-off,o.y-off,o.x+o.w+off,o.y-off);addCover(x,o.y+o.h+off,o.x-off,o.y+o.h+off,o.x+o.w+off,o.y+o.h+off);}
      for(const y of ys){addCover(o.x-off,y,o.x-off,o.y-off,o.x-off,o.y+o.h+off);addCover(o.x+o.w+off,y,o.x+o.w+off,o.y-off,o.x+o.w+off,o.y+o.h+off);}
    }else{
      for(let i=0;i<8;i++){const a=i*Math.PI/4,rad=o.r+off,x=o.x+Math.cos(a)*rad,y=o.y+Math.sin(a)*rad,t=a+Math.PI/2;addCover(x,y,x+Math.cos(t)*58,y+Math.sin(t)*58,x-Math.cos(t)*58,y-Math.sin(t)*58);}
    }
  }
}
function navIndex(x,y){return y*NAV_COLS+x;}
function navPoint(index){const x=index%NAV_COLS,y=(index/NAV_COLS)|0;return{x:clamp((x+.5)*NAV_STEP,ACTOR_RADIUS+8,WORLD.w-ACTOR_RADIUS-8),y:clamp((y+.5)*NAV_STEP,ACTOR_RADIUS+8,WORLD.h-ACTOR_RADIUS-8),gx:x,gy:y};}
// Off-grid actors must connect through a swept, collision-safe start anchor.
function nearestNav(x,y,reachable=true){
  buildNavigation();const gx=clamp(Math.floor(x/NAV_STEP),0,NAV_COLS-1),gy=clamp(Math.floor(y/NAV_STEP),0,NAV_ROWS-1),candidates=[];
  for(let yy=Math.max(0,gy-4);yy<=Math.min(NAV_ROWS-1,gy+4);yy++)for(let xx=Math.max(0,gx-4);xx<=Math.min(NAV_COLS-1,gx+4);xx++){
    const idx=navIndex(xx,yy);if(NAV_WALKABLE[idx]){const p=navPoint(idx);candidates.push({idx,p,d:(p.x-x)**2+(p.y-y)**2});}
  }
  candidates.sort((a,b)=>a.d-b.d);for(const c of candidates)if(!reachable||pathClear(x,y,c.p.x,c.p.y,ACTOR_RADIUS))return c.idx;return null;
}
function navigationStart(x,y){
  const idx=nearestNav(x,y);if(idx!==null)return {idx,anchors:[]};
  for(const length of [40,70,110])for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,p={x:x+Math.cos(angle)*length,y:y+Math.sin(angle)*length};
    if(!pathClear(x,y,p.x,p.y,ACTOR_RADIUS))continue;const idx=nearestNav(p.x,p.y);if(idx!==null)return {idx,anchors:[p]};
  }
  // A coarse start grid and a single straight escape ray can miss a tight dogleg.
  // Search a bounded fine local grid using the same swept body collision checks.
  const step=4,queue=[{ix:0,iy:0,x,y,parent:-1,depth:0}],seen=new Set(['0,0']);
  for(let q=0;q<queue.length&&q<1800;q++){
    const p=queue[q];if(p.depth>=4&&p.depth%4===0){const idx=nearestNav(p.x,p.y);if(idx!==null){const anchors=[];for(let i=q;i>0;i=queue[i].parent)anchors.push({x:queue[i].x,y:queue[i].y});anchors.reverse();return {idx,anchors};}}
    if(p.depth>=48)continue;
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const ix=p.ix+dx,iy=p.iy+dy,key=ix+','+iy;if(seen.has(key))continue;const nx=x+ix*step,ny=y+iy*step;if(!pathClear(p.x,p.y,nx,ny,ACTOR_RADIUS))continue;seen.add(key);queue.push({ix,iy,x:nx,y:ny,parent:q,depth:p.depth+1});}
  }
  return {idx:null,anchors:[]};
}
function findPath(sx,sy,gx,gy,blocked=null){
  diagnostics.pathSearches++;
  buildNavigation();if(pathClear(sx,sy,gx,gy))return[{x:gx,y:gy}];
  const connection=navigationStart(sx,sy),start=connection.idx,goal=nearestNav(gx,gy,false);if(start===null||goal===null)return[];
  const n=NAV_WALKABLE.length,g=new Float64Array(n);g.fill(Infinity);const came=new Int32Array(n);came.fill(-1);const closed=new Uint8Array(n);g[start]=0;
  const heap=[];const push=(idx,f)=>{heap.push({idx,f});let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p;}heap[i]={idx,f};};
  const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length&&last){let i=0;while(true){const l=i*2+1,r=l+1;if(l>=heap.length)break;let c=(r<heap.length&&heap[r].f<heap[l].f)?r:l;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return root;};
  const gp=navPoint(goal);if(start===goal)return [...connection.anchors,{x:gp.x,y:gp.y},...(pathClear(gp.x,gp.y,gx,gy)?[{x:gx,y:gy}]:[])];const heur=i=>{const p=navPoint(i);return Math.hypot(p.x-gp.x,p.y-gp.y);};push(start,heur(start));
  while(heap.length){const cur=pop().idx;if(closed[cur])continue;closed[cur]=1;if(cur===goal)break;const cp=navPoint(cur);
    for(const [ni,cost] of NAV_EDGES[cur]){if(closed[ni])continue;const ng=g[cur]+cost+((blocked?.get(ni)||0)>gameNow()?NAV_STEP*8:0);if(ng<g[ni]){g[ni]=ng;came[ni]=cur;push(ni,ng+heur(ni));}}

  }
  if(came[goal]===-1)return[];let chain=[],cur=goal;while(cur!==-1&&cur!==start){chain.push(navPoint(cur));cur=came[cur];}chain.push(navPoint(start));for(const anchor of [...connection.anchors].reverse())chain.push(anchor);chain.reverse();chain.push(pathClear(gp.x,gp.y,gx,gy)?{x:gx,y:gy}:{x:gp.x,y:gp.y});
  const smooth=[];let ax=sx,ay=sy,i=0;while(i<chain.length){let best=i;for(let j=i+1;j<chain.length;j++){if(pathClear(ax,ay,chain[j].x,chain[j].y))best=j;else break;}smooth.push({x:chain[best].x,y:chain[best].y});ax=chain[best].x;ay=chain[best].y;i=best+1;}return smooth;
}
const ROUTE_CACHE=new Map();
function navigateToward(a,goal,now){
  if(goal&&dist(a,goal)<=22){a.stuckSample=null;a.stuckCount=0;a.timeWithoutMeaningfulProgress=0;return {x:0,y:0};}
  if(!goal)return {x:0,y:0};if(a.recoveryGoal&&now<a.recoveryUntil&&dist(a,a.recoveryGoal)>20)goal=a.recoveryGoal;else a.recoveryGoal=null;a.desiredMovement={x:goal.x-a.x,y:goal.y-a.y};a.stuckSample??={x:a.x,y:a.y,at:now};a.timeWithoutMeaningfulProgress=Math.hypot(a.x-a.stuckSample.x,a.y-a.stuckSample.y)<22?(now-a.stuckSample.at)/1000:0;
  if(now-a.stuckSample.at>1250){
    const moved=Math.hypot(a.x-a.stuckSample.x,a.y-a.stuckSample.y);
    if(moved<22&&dist(a,goal)>32){
      diagnostics.stuckRecoveries++;diagnostics.maxStuckDetectionSeconds=Math.max(diagnostics.maxStuckDetectionSeconds,(now-a.stuckSample.at)/1000);if(a.exitPlan&&a.stuckCount>=1){a.buildingState?.failedExits.set(a.exitPlan.exit,now+7000);a.exitPlan=null;const alternate=buildingExitGoal(a,now);if(alternate)a.moveGoal=goal=alternate;}a.stuckCount=(a.stuckCount||0)+1;if(a.stuckCount>=4){a.navGoal=null;a.cover=null;a.flankGoal=null;a.nextDecision=now+1500;a.unstickGoal=null;const candidates=NAV_EDGES[nearestNav(a.x,a.y)]||[];const reachable=candidates.map(([idx])=>navPoint(idx)).filter(p=>pathClear(a.x,a.y,p.x,p.y,ACTOR_RADIUS));if(reachable.length){a.recoveryGoal=reachable[Math.floor(Math.random()*reachable.length)];a.recoveryUntil=now+1700;a.moveGoal=goal=a.recoveryGoal;}}a.blockedCells??=new Map();const cell=nearestNav(a.x,a.y);a.blockedCells.set(cell,now+7000);a.repathAt=0;
      // A short perpendicular correction first; repeated failures trigger a different grid route.
      const angle=Math.atan2(goal.y-a.y,goal.x-a.x)+Math.PI/2*(a.stuckCount%2?1:-1);
      const local={x:a.x+Math.cos(angle)*90,y:a.y+Math.sin(angle)*90};if(pathClear(a.x,a.y,local.x,local.y))a.unstickGoal=local;
    }else a.stuckCount=0;
    a.stuckSample={x:a.x,y:a.y,at:now};
  }
  if(a.unstickGoal){if(dist(a,a.unstickGoal)<24)a.unstickGoal=null;else {const ang=Math.atan2(a.unstickGoal.y-a.y,a.unstickGoal.x-a.x);return {x:Math.cos(ang),y:Math.sin(ang)};}}
  // Retarget the tail of a committed route when its final segment remains safe.
  // Previously a nearby new goal left the old endpoint active until the periodic
  // repath, so a bot could repeatedly overshoot and reverse at that old point.
  if(a.navPath?.length){
    const tail=a.navPath.length-1,from=tail>0?a.navPath[tail-1]:a;
    if(pathClear(from.x,from.y,goal.x,goal.y)){
      a.navPath[tail]={x:goal.x,y:goal.y};a.navGoal={x:goal.x,y:goal.y};
    }
  }
  const changed=!a.navGoal||dist(goal,a.navGoal)>110;
  const current=a.navPath?.[a.navIndex],blockedRoute=current&&!pathClear(a.x,a.y,current.x,current.y);
  // Keep valid paths; a decision tick does not invalidate one. Failed routes and
  // materially changed destinations may replan at most once every 350 ms.
  if((changed||blockedRoute||!current||a.repathAt===0)&&now>=(a.nextRepathAt||0)){
    a.navGoal={...goal};const start=nearestNav(a.x,a.y),end=nearestNav(goal.x,goal.y,false),key=start+':'+end;if(end!==null){const point=navPoint(end);if(!pathClear(point.x,point.y,goal.x,goal.y)){goal={x:point.x,y:point.y};a.moveGoal={...goal};a.navGoal={...goal};}}
    const blocked=a.blockedCells&&[...a.blockedCells].some(([,until])=>until>now),cached=ROUTE_CACHE.get(key);
    if(cached&&!blocked&&now-cached.at<15000&&(!cached.path.length||pathClear(a.x,a.y,cached.path[0].x,cached.path[0].y))){a.navPath=cached.path.map(p=>({...p}));diagnostics.pathCacheHits++;}
    else {a.navPath=findPath(a.x,a.y,goal.x,goal.y,a.blockedCells);if(!blocked){if(ROUTE_CACHE.size>256)ROUTE_CACHE.delete(ROUTE_CACHE.keys().next().value);ROUTE_CACHE.set(key,{at:now,path:a.navPath.map(p=>({...p}))});}}
    const tail=a.navPath.at(-1);if(tail&&pathClear(tail.x,tail.y,goal.x,goal.y)){const from=a.navPath.at(-2)||a;if(pathClear(from.x,from.y,goal.x,goal.y))a.navPath[a.navPath.length-1]={x:goal.x,y:goal.y};else a.navPath.push({x:goal.x,y:goal.y});}
    a.navIndex=0;a.nextRepathAt=now+350;a.repathAt=now+350;
  }
  while(a.navIndex<a.navPath.length-1&&dist(a,a.navPath[a.navIndex])<36&&pathClear(a.x,a.y,a.navPath[a.navIndex+1].x,a.navPath[a.navIndex+1].y))a.navIndex++;
  // Look ahead only where body clearance permits it.
  if(a.navIndex<a.navPath.length-1&&pathClear(a.x,a.y,a.navPath[a.navIndex+1].x,a.navPath[a.navIndex+1].y))a.navIndex++;
  const wp=a.navPath[a.navIndex];a.distanceToWaypoint=wp?dist(a,wp):null;if(!wp){a.repathAt=Math.min(a.repathAt,now+500);return {x:0,y:0};}
  if(a.navIndex===a.navPath.length-1&&dist(a,wp)<=22){a.repathAt=0;return {x:0,y:0};}
  const angle=Math.atan2(wp.y-a.y,wp.x-a.x);return {x:Math.cos(angle),y:Math.sin(angle)};
}

function botTacticalRange(name){return name==='P90'?10*TILE:WEAPONS[name].preferred;}
function chooseCover(a,target){
  buildNavigation();let best=null,bestScore=Infinity;
  for(const c of COVER_POINTS){
    const da=dist(a,c);if(da>650||da>bestScore+100||pointLOS(c.x,c.y,target))continue;
    const peeks=c.peek.filter(p=>!collides(p.x,p.y,ACTOR_RADIUS+3)&&pointLOS(p.x,p.y,target));if(!peeks.length)continue;
    const crowd=(a.visibleAllies||[]).filter(o=>dist(o,c)<100).length,range=dist(c,target),score=da+crowd*200+Math.abs(range-botTacticalRange(currentWeaponState(a).name))*.1;
    if(score<bestScore){bestScore=score;best={x:c.x,y:c.y,peek:peeks,facing:Math.atan2(target.y-c.y,target.x-c.x),escape:(()=>{const angle=Math.atan2(c.y-target.y,c.x-target.x),x=c.x+Math.cos(angle)*120,y=c.y+Math.sin(angle)*120;return pathClear(c.x,c.y,x,y)?{x,y}:{x:c.x,y:c.y};})()};}
  }return best;
}

function pointLOS(x,y,target){return obstacleHitT(x,y,target.x,target.y)===null;}
function makeFlankGoal(a,target){
  const w=currentWeapon(a),base=Math.atan2(a.y-target.y,a.x-target.x),side=a.strafeDir;for(const offset of [Math.PI*.55*side,-Math.PI*.55*side,Math.PI*.8*side]){
    const r=clamp(botTacticalRange(currentWeaponState(a).name)*.9,320,920),x=clamp(target.x+Math.cos(base+offset)*r,80,WORLD.w-80),y=clamp(target.y+Math.sin(base+offset)*r,80,WORLD.h-80);if(!collides(x,y,ACTOR_RADIUS+6))return{x,y};
  }return null;
}

// -------------------- Game state --------------------
let state = {
  mode:'menu', running:false, paused:false, elapsed:0, startTime:0,
  actors:[], projectiles:[], particles:[], camera:{x:WORLD.w/2,y:WORLD.h/2,zoom:1},
  matches:[], queued:false, queueSince:0, playerMatchId:null, idleBots:[], spectateMatchId:0, spectateActorId:null,
  lastHud:0, lastScore:0, lastLobbyUi:0, sessionId:0, leagueStarted:false,
  primaryCoverage:{assignments:0,counts:Object.fromEntries(PRIMARYS.map(n=>[n,0])),lastCycle:null}
};
let nextActorId=1;
const input = {
  keys:new Set(), mouseX:cssW/2,mouseY:cssH/2, aimX:cssW/2+180,aimY:cssH/2,
  mouseDown:false, justPressed:false, fullMap:false
};
function binding(action){return CONFIG.binds?.[action]||DEFAULT_BINDS[action];}
function actionDown(action){return input.keys.has(binding(action));}
function codeLabel(code){
  const map={MouseRight:'RMB',MouseMiddle:'MMB',MouseBack:'MOUSE 4',MouseForward:'MOUSE 5',ShiftLeft:'L-SHIFT',ShiftRight:'R-SHIFT',Space:'SPACE',Tab:'TAB',Escape:'ESC',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'};
  if(map[code])return map[code];
  if(code?.startsWith('Key'))return code.slice(3);
  if(code?.startsWith('Digit'))return code.slice(5);
  return code||'UNBOUND';
}
let nextShotId=1;
const damageNumbers=[];

function recordDamageNumber(victim,p,actual,isHead,now){
  if(!CONFIG.damageNumbers||actual<=0||!p.owner.isPlayer||!isEnemy(p.owner,victim)||p.owner.matchId!==victim.matchId)return;
  // All pellets share the trigger-pull record. Each target gets one number,
  // updated only with HP actually removed by the authoritative damage resolver.
  const shot=p.shot||(p.shot={id:0});
  shot.damageNumbers??=new Map();
  const feedbackKey=p.feedbackId===undefined?victim.id:victim.id+':'+p.feedbackId;let entry=shot.damageNumbers.get(feedbackKey);
  if(!entry){
    entry={matchId:victim.matchId,ownerId:p.owner.id,targetId:victim.id,amount:0,head:false,killing:false,offsetX:(((p.feedbackId??shot.id)%3)-1)*18,born:now,life:780};
    shot.damageNumbers.set(feedbackKey,entry);
  }
  entry.amount+=actual;entry.head||=isHead;entry.killing||=victim.hp<=0;entry.x=victim.x;entry.y=victim.y;
  entry.born=now;entry.life=entry.killing?840:780;
  if(!damageNumbers.includes(entry))damageNumbers.push(entry);
  // The fastest current automatic cadence fits four feedback entries; evict
  // older feedback instead of letting sustained fire obscure the target.
  const sameTarget=damageNumbers.filter(n=>n.targetId===victim.id);
  while(sameTarget.length>4){const oldest=sameTarget.shift();damageNumbers.splice(damageNumbers.indexOf(oldest),1);}
  if(damageNumbers.length>32)damageNumbers.splice(0,damageNumbers.length-32);
}

function damageNumberSnapshot(now=gameNow()){
  for(let i=damageNumbers.length-1;i>=0;i--)if(now-damageNumbers[i].born>=damageNumbers[i].life)damageNumbers.splice(i,1);
  if(!CONFIG.damageNumbers||state.mode!=='play'||input.fullMap)return [];
  const player=getPlayer();
  return damageNumbers.filter(n=>n.matchId===visibleMatchId()&&n.ownerId===player?.id).map(n=>{
    const target=state.actors.find(a=>a.id===n.targetId&&!a.dead),progress=clamp((now-n.born)/n.life,0,1);
    return {x:target?.x??n.x,y:target?.y??n.y,text:String(Number(n.amount.toFixed(1))),amount:n.amount,head:n.head,killing:n.killing,offsetX:n.offsetX,rise:26*progress,alpha:1-progress};
  });
}

function makeWeaponState(name){ const w=WEAPONS[name]; return {name,ammo:w.mag,reserve:w.reserve,lastShot:-999,reloadEnd:0,reloading:false}; }
function makeTraits(i,name){
  const profile=profileFor(name),personality=profile.personality||personalityBlueprint(name,i,profile.power,profile.archetype),skill=clamp((profile.power-20)/79,0,1),r=seeded(profileSeed(name));
  const pref=personality.favoriteWeapon||PRIMARYS[i%PRIMARYS.length];
  let accuracy=.48+skill*.44+(r()-.5)*.025;
  let reaction=.47-skill*.36+(r()-.5)*.025;
  let headshot=.08+skill*.63+(r()-.5)*.035;
  if(profile.archetype==='Marksman'){accuracy+=.018;headshot+=.035;reaction-=.012;}
  let aggression=.32+personality.risk*.48+(r()-.5)*.12;
  let retreat=.28+(1-personality.risk)*.46+(r()-.5)*.08;
  if(['Rusher','Flanker'].includes(profile.archetype))aggression+=.10;
  if(['Anchor','Marksman'].includes(profile.archetype))retreat+=.08;
  return {
    aggression:clamp(aggression,.28,.94), accuracy:clamp(accuracy,.46,.985), headshot:clamp(headshot,.07,.73), reaction:clamp(reaction,.075,.48),
    preferred:pref, chase:.34+r()*.58, retreat:clamp(retreat,.18,.82), strafe:.25+r()*.68, explore:.42+r()*.52,
    switcher:personality.adaptability, metaFollow:personality.metaDrive, confidence:.5, skill, power:profile.power, archetype:profile.archetype,
    personality:personality.label, weaponLoyalty:personality.weaponLoyalty, coverUse:personality.coverUse, flankRate:personality.flankRate, risk:personality.risk, unpredictability:personality.unpredictability
  };
}
function topMetaPrimaries(limit=3){
  const ranked=weaponMetrics().filter(r=>PRIMARYS.includes(r.m.name)).sort((a,b)=>b.score-a.score||b.kd-a.kd||b.kpm-a.kpm||a.m.name.localeCompare(b.m.name));
  return ranked.slice(0,Math.max(1,limit)).map(r=>r.m.name);
}
let botMetaCache=null;
function botMetaContext(){
  const now=wallNow(),key=SAVE.patchState.id+':'+AI_REVISION;
  if(!botMetaCache||botMetaCache.key!==key||now<botMetaCache.at||now-botMetaCache.at>=1000){const rows=weaponMetrics();botMetaCache={key,at:now,rows,phase:metaPhase(rows)};}
  return botMetaCache;
}
function styleFitForWeapon(a,name){
  const prefs=STYLE_WEAPON_PREFS[a.traits?.archetype]||PRIMARYS,idx=prefs.indexOf(name);
  let fit=idx<0?.15:Math.max(.18,1-idx*.14);
  const w=WEAPONS[name];
  if(a.traits?.archetype==='Marksman')fit+=clamp(w.preferred/1600,0,.22);
  if(['Rusher','Flanker'].includes(a.traits?.archetype))fit+=clamp((700-w.preferred)/2200,0,.20);
  if(a.traits?.preferred===name)fit+=.28*a.traits.weaponLoyalty;
  return fit;
}
function chooseBotSidearm(a){
  const p=a.profile.personality,b=botData(a),{rows,phase}=botMetaContext();
  return weightedChoice(SIDEARMS,SIDEARMS.map(n=>{const r=rows.find(r=>r.m.name===n),comfort=(b.familiarity[n]||0)/100,style=(['X16','X-16 Auto'].includes(n)&&['Rusher','Flanker'].includes(a.traits.archetype))?1.2:1;return TACTICS.weaponWeight({phase:phase.phase,confidence:r?.confidence||0,score:r?.score??50,awareness:p.metaAwareness,style,familiarity:comfort,personal:0,personalConfidence:0,surprise:rand(-p.unpredictability,p.unpredictability)}); }));
}

function coverageState(){
  if(!state.primaryCoverage)state.primaryCoverage={assignments:0,counts:Object.fromEntries(PRIMARYS.map(n=>[n,0])),lastCycle:null};
  return state.primaryCoverage;
}
function recordCoveragePick(name){
  const c=coverageState();c.counts[name]=(c.counts[name]||0)+1;c.assignments++;
  // One rolling block equals the four 5v5 bot matches (40 bot loadouts). Reset after the block.
  if(c.assignments>=MATCH_COUNT*TEAM_SIZE*2){c.lastCycle={...c.counts};c.assignments=0;c.counts=Object.fromEntries(PRIMARYS.map(n=>[n,0]));}
}
function chooseCoverageWeapon(a){
  const c=coverageState();
  // Reserve one of every four match-start loadouts for the least-sampled weapons.
  // Coverage is exploration, never evidence that a popular weapon is stronger.
  if(c.assignments%4!==0)return null;
  const rows=botMetaContext().rows,allFull=rows.filter(r=>PRIMARYS.includes(r.m.name)).every(r=>r.confidence>=.999);
  if(allFull&&c.assignments%12!==0)return null;
  const min=Math.min(...PRIMARYS.map(n=>c.counts[n]||0));
  const under=PRIMARYS.filter(n=>(c.counts[n]||0)===min).sort((x,y)=>(meta[x].equippedTime||0)-(meta[y].equippedTime||0));
  if(!under.length)return null;
  return under.sort((x,y)=>styleFitForWeapon(a,y)-styleFitForWeapon(a,x)+rand(-.08,.08))[0];
}
function weightedChoice(items,weights){
  let total=weights.reduce((s,v)=>s+Math.max(.0001,v),0),r=Math.random()*total;
  for(let i=0;i<items.length;i++){r-=Math.max(.0001,weights[i]);if(r<=0)return items[i];}
  return items[items.length-1];
}
function chooseBotPrimary(a,context='life'){
  const snapshot=botMetaContext(),rows=snapshot.rows.filter(r=>PRIMARYS.includes(r.m.name)),phase=snapshot.phase,b=botData(a),p=a.profile.personality,previous=a.slots?.[0]?.name;
  // Bots learn observed results at different rates. A balance edit never supplies a verdict.
  const perceptionAge=wallNow()-(b.metaReadAt||0),q=TACTICS.quality(a.profile.power),delay=(1-p.metaAwareness)*90000+(1-q)*70000+15000;
  b.perceivedMeta??={};if(b.metaPatch!==SAVE.patchState.id+':'+AI_REVISION){b.metaPatch=SAVE.patchState.id+':'+AI_REVISION;b.perceivedMeta={};b.metaReadAt=wallNow();}
  if(perceptionAge>delay){for(const r of rows){const old=b.perceivedMeta[r.m.name]??50;b.perceivedMeta[r.m.name]=old+(r.score-old)*(.18+p.metaAwareness*.25+q*.2)*r.confidence;}b.metaReadAt=wallNow();}
  const coverage=context==='match'&&!a.sandbox?chooseCoverageWeapon(a):null;
  const weights=PRIMARYS.map(n=>{
    const row=rows.find(r=>r.m.name===n),style=styleFitForWeapon(a,n),comfort=(b.familiarity[n]||0)/100;
    const personal=b.recentMatches.filter(m=>m.patchId===SAVE.patchState.id&&m.aiRevision===AI_REVISION&&m.weapons?.[n]).map(m=>m.weapons[n]),eng=personal.reduce((s,m)=>s+m.k+m.d,0),kills=personal.reduce((s,m)=>s+m.k,0),personalShare=(kills+10)/(eng+20);
    let weight=TACTICS.weaponWeight({phase:phase.phase,confidence:row?.confidence||0,score:b.perceivedMeta[n]??50,awareness:p.metaAwareness,style,familiarity:comfort,personal:(personalShare-.5)*2,personalConfidence:Math.min(1,eng/30),surprise:rand(-p.unpredictability,p.unpredictability)});if(n===previous&&context==='match')weight*=.65+p.weaponLoyalty*.5;return weight;
  });const total=weights.reduce((sum,w)=>sum+w,0);a.weaponCandidates=PRIMARYS.map((name,i)=>({name,weight:weights[i]/total})).sort((a,b)=>b.weight-a.weight).slice(0,3);a.metaPhase=phase.phase;
  const chosen=coverage||weightedChoice(PRIMARYS,weights);if(context==='match'&&!a.sandbox)recordCoveragePick(chosen);return chosen;
}

function makeActor(name,isPlayer=false,botIndex=0,sandbox=false){
  const skinIndex=isPlayer?CONFIG.skin:(botIndex%SKINS.length);
  const a={
    id:nextActorId++, name, isPlayer, botIndex, team:null, matchId:null, x:0,y:0,vx:0,vy:0,angle:0,hp:MAX_HP,dead:false,deathAt:0,respawnAt:0,
    sandbox,tournamentBot:sandbox&&!isPlayer?cloneData(SAVE.bots[name]):null,tournamentMeta:sandbox?Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])):null,
    skinIndex, speed:isPlayer?PLAYER_SPEED:BOT_SPEED, currentSlot:0, slots:[], target:null,targetSeenAt:0,nextThink:0,
    wander:{x:WORLD.w/2,y:WORLD.h/2,until:0}, strafeDir:Math.random()<.5?-1:1, muzzleUntil:0,recoil:0,hitFlash:0,spawnFlash:0,
    profile:isPlayer?null:profileFor(name), traits:isPlayer?null:makeTraits(botIndex,name), stats:{kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0},
    career:sandbox?(isPlayer?blankPlayerCareer():blankBotCareer(name)):isPlayer?SAVE.playerCareer:careerFor(name),
    weaponUsage:isPlayer?SAVE.playerCareer.weapons:careerFor(name).weaponUsage, damageLedger:new Map(), damageByWeapon:new Map(),
    lastDamager:null,lastDamageAt:0, regenActive:false, aiAim:0, aiAimReadyAt:0,
    sprinting:false, desiredVx:0,desiredVy:0, wasInPlayerView:false,playerViewReadyAt:0,
    dashUntil:0,dashCooldownUntil:0,dashVx:0,dashVy:0,lastDashAt:-Infinity,
    navPath:[],navIndex:0,navGoal:null,repathAt:0,tactic:'advance',cover:null,coverUntil:0,peekUntil:0,peekSide:1,flankGoal:null,nextMetaCheck:0
  };
  if(sandbox){a.weaponUsage=a.isPlayer?a.career.weapons:a.career.weaponUsage;for(const w of Object.keys(WEAPONS))a.weaponUsage[w]={k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};}
  const primary=isPlayer?CONFIG.primary:chooseBotPrimary(a,'life');
  const side=isPlayer?CONFIG.sidearm:chooseBotSidearm(a);
  a.slots=[makeWeaponState(primary),makeWeaponState(side)];
  resetBrain(a);
  return a;
}
function resetBrain(a){
  a.learnedApproach=null;a.learnedApproachUntil=0;a.learnedApproachTarget=null;a.utilityScores=[];
  a.ads=false;a.adsBlend=0;a.visual=null;a.recoveryGoal=null;a.recoveryUntil=0;a.buildingState=null;a.exitPlan=null;a.coverIdleSince=gameNow();a.motionStates=['IDLE'];a.collisionCount=0;a.progressSeconds=0;
  a.memory=new Map();a.visibleEnemies=[];a.visibleAllies=[];a.nextThink=0;a.nextDecision=0;a.nextAim=0;a.aimPoint={x:a.x,y:a.y};a.aimNoise=0;a.targetChangedAt=0;a.actionUntil=0;a.dashExecuteAt=gameNow()+(a.traits?.reaction||.2)*1000;a.moveGoal=null;a.coverState='MOVING_TO_COVER';a.coverStateUntil=0;a.flankUntil=0;a.strafeUntil=0;a.stuckSample=null;a.stuckCount=0;a.blockedCells=new Map();a.unstickGoal=null;a.matchVariance=rand(-.035,.035);
}
function shuffle(items){const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function registerPick(a){
  for(const s of a.slots){ actorMeta(a,s.name).picks++; a.weaponUsage[s.name].picks++;recordPatchEvent(a,s.name,'picks'); }
}
function officialTdm(a){const m=getMatch(a.matchId);return !a.sandbox&&(!m||m.eligible!==false)&&m?.mode!=='deathmatch';}
function isAlly(a,b){return a!==b&&a.matchId===b.matchId&&getMatch(a.matchId)?.mode!=='deathmatch'&&a.team===b.team;}
function isEnemy(a,b){return a!==b&&a.matchId===b.matchId&&!isAlly(a,b);}
function revisionSample(){return SAVE.patchState.aiSamples?.[AI_REVISION]||SAVE.patchState;}
function nextSessionSlot(){let id=MATCH_COUNT;while(state.matches[id])id++;return id;}
function actorsInMatch(matchId){
  const m=state.matches[matchId];return m?.participants?.filter(a=>a.matchId===matchId)||[];
}
function getMatch(matchId){
  return state.matches.find(m=>m && m.id===matchId) || null;
}
function matchTeamPresentation(match,participants=match?.participants||[],viewer=participants.find(a=>a.isPlayer)){
  const follow=state.mode==='spectate'&&state.spectateMatchId===match?.id?participants.find(a=>a.id===state.spectateActorId):null;
  return TEAM_PRESENTATION.create({mode:match?.mode,teamIds:[0,1],participants,viewerId:TEAM_PRESENTATION.identity(viewer),followId:TEAM_PRESENTATION.identity(follow)});
}
function actorPresentation(actor){return matchTeamPresentation(getMatch(actor.matchId)).actor(actor);}
function teamScoreHtml(match,presentation=matchTeamPresentation(match)){
  return presentation.sides(match.score).map(side=>`<span style="color:${side.color}">${side.label} ${side.score}</span>`).join(' — ');
}
function spawnScore(p, actor){
  let minEnemy=999999, visibleEnemies=0, occupied=0, teammateNear=0;
  for(const other of state.actors){
    if(other===actor||other.dead||other.matchId!==actor.matchId) continue;
    const d=Math.hypot(p.x-other.x,p.y-other.y);
    if(d<115) occupied++;
    if(isAlly(other,actor)){
      if(d<650) teammateNear++;
      continue;
    }
    minEnemy=Math.min(minEnemy,d);
    if(d<1200 && hasLOS(p,other)) visibleEnemies++;
  }
  return minEnemy - visibleEnemies*380 - occupied*1100 + Math.min(teammateNear,2)*80;
}
function chooseSpawn(actor){
  const scored=SPAWNS.map(p=>({p,s:spawnScore(p,actor)})).sort((a,b)=>b.s-a.s);
  if(actor.isPlayer) return scored[0].p;
  const pool=scored.slice(0,Math.min(7,scored.length));
  return pool[Math.floor(Math.random()*pool.length)].p;
}
function xpEvent(a,event,weapon){
  if(!a?.isPlayer)return;const match=getMatch(a.matchId);if(match?.status!=='active'||!XP.eligibility(match))return;
  const e=a.xpEvents??=XP.events();if(event==='weapon'){if(!e.usedWeapons.includes(weapon))e.usedWeapons.push(weapon);}else if(event==='streak')e.bestStreak=Math.max(e.bestStreak,a.killStreak);else e[{solo:'soloKills',finisher:'finishingKills',dash:'dashes'}[event]]++;
}
function commitMatchXP(match){
  const kind=XP.eligibility(match),player=actorsInMatch(match.id).find(a=>a.isPlayer);if(!kind||!player)return null;
  const rows=standings(match),winners=match.mode==='deathmatch'?ffaWinners(rows):rows.filter(r=>r.team===match.winner).map(r=>r.id),won=match.mode==='deathmatch'?(winners.length===1?winners[0]===player.id:winners.includes(player.id)?null:false):match.winner===null?null:player.team===match.winner;
  const s=player.stats,stats=Object.fromEntries(['kills','deaths','assists','damage','headshots','timeAlive'].map(k=>[k,s[k]]));
  const result=XP.award(SAVE.progression,{matchId:match.matchId,kind,mode:match.mode,at:wallNow(),stats,events:player.xpEvents||XP.events(),leaders:{kills:s.kills===Math.max(...rows.map(r=>r.kills)),assists:s.assists===Math.max(...rows.map(r=>r.assists)),alive:s.timeAlive===Math.max(...rows.map(r=>r.timeAlive))},won,winStreak:kind==='standard'&&won?(player.career.currentWinStreak||0)+1:0,...(kind==='official'?{tournamentId:match.context.tournamentId,seriesId:match.context.seriesId}:{})});
  match.xpAward=cloneData(result.receipt);updateProgressionUi();return result;
}
function formatXP(value){return Number(value).toLocaleString(undefined,{maximumFractionDigits:2});}
function levelProgressHtml(p){return `<strong>LVL ${p.currentLevel}</strong><span>${p.maxLevel?'MAX LEVEL':formatXP(p.currentXP)+' / '+formatXP(p.requiredXP)+' XP'}</span><progress max="1" value="${p.progress}" aria-label="Level progress"></progress>`;}
function updateProgressionUi(){const host=document.getElementById('lobbyProgression');if(host)host.innerHTML=levelProgressHtml(XP.view(SAVE.progression.totalXPUnits));}
function progressionProfileHtml(){const p=XP.view(SAVE.progression.totalXPUnits);return `<section class="profile-progression" aria-label="Account progression"><div>${levelProgressHtml(p)}</div><dl><div><dt>XP TO NEXT LEVEL</dt><dd>${p.maxLevel?'MAX LEVEL':formatXP(p.remainingXP)}</dd></div><div><dt>LIFETIME XP</dt><dd>${formatXP(p.totalXP)}</dd></div></dl></section>`;}
function xpSummaryHtml(r){if(!r)return '';const p=XP.view(r.beforeUnits+r.units),old=XP.view(r.beforeUnits),lines=XP.breakdown(r);return `<section class="xp-summary"><div class="xp-summary-heading"><div><span>XP EARNED</span><strong>+${formatXP(r.units/XP.SCALE)} XP</strong></div><div class="xp-result-level"><span>LEVEL PROGRESS${p.currentLevel>old.currentLevel?' · LEVEL UP':''}</span>${levelProgressHtml(p)}</div></div><details><summary>XP BREAKDOWN</summary><dl>${lines.map(l=>`<div><dt>${escapeHtml(l.label)}</dt><dd>+${formatXP(l.units/XP.SCALE)}</dd></div>`).join('')}${r.kind==='official'?`<div class="xp-total"><dt>BASE XP</dt><dd>${formatXP(r.baseUnits/XP.SCALE)}</dd></div><div><dt>TOURNAMENT BONUS</dt><dd>×1.3</dd></div>`:''}<div class="xp-total"><dt>${r.kind==='official'?'FINAL XP':'TOTAL'}</dt><dd>+${formatXP(r.units/XP.SCALE)} XP</dd></div></dl></details></section>`;}

function resetActorMatchStats(a){
  if(a.isPlayer)a.xpEvents=XP.events();
  a.stats={kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0};a.matchWeaponStats={};a.killStreak=0;
}
function prepareActorForMatch(a, matchId, team){
  a.matchId=matchId;a.team=team;a.currentSlot=0;a.target=null;a.damageLedger.clear();a.damageByWeapon.clear();a.lastDamager=null;a.navPath=[];a.navIndex=0;a.navGoal=null;a.cover=null;a.tactic='advance';
  resetActorMatchStats(a);a.tacticalMemory=TACTICS.memory();
  if(a.isPlayer) a.slots=[makeWeaponState(CONFIG.primary),makeWeaponState(CONFIG.sidearm)];
  else {
    const primary=chooseBotPrimary(a,'match');
    a.slots=[makeWeaponState(primary),makeWeaponState(chooseBotSidearm(a))];
  }
}
function respawnActor(a, initial=false){
  if(a.matchId===null) return;
  if(!initial){
    if(!a.isPlayer){
      const old=a.slots[0]?.name;
      // Bots normally keep their match loadout, but volatile personalities can surprise-switch after a death.
      const rerollChance=.06+(a.traits?.unpredictability||.2)*.24;
      const chosen=Math.random()<rerollChance?chooseBotPrimary(a,'life'):old;
      a.slots[0]=makeWeaponState(chosen||old);
      a.slots[1]=makeWeaponState(a.slots[1]?.name || chooseBotSidearm(a));
    } else {
      a.slots=[makeWeaponState(CONFIG.primary),makeWeaponState(CONFIG.sidearm)];
    }
  }
  const p=chooseSpawn(a); a.x=p.x+rand(-24,24); a.y=p.y+rand(-24,24);
  if(collides(a.x,a.y)) { a.x=p.x; a.y=p.y; }
  a.hp=MAX_HP;a.dead=false;a.deathAt=0;a.respawnAt=0;a.currentSlot=0;a.target=null;a.damageLedger.clear();a.damageByWeapon.clear();a.lastDamager=null;a.lastDamageAt=0;a.regenActive=false;a.dashUntil=0;a.dashCooldownUntil=0;a.dashVx=0;a.dashVy=0;a.navPath=[];a.navIndex=0;a.navGoal=null;a.cover=null;a.tactic='advance';
  a.spawnFlash=gameNow()+600;a.hitFlash=0;a.recoil=0;a.muzzleUntil=0;resetBrain(a);
  registerPick(a);
}
function clearMatchEffects(matchId){
  state.projectiles=state.projectiles.filter(p=>p.matchId!==matchId);
  state.particles=state.particles.filter(p=>p.matchId!==matchId);
}
function startMatch(matchId, participants, hasPlayer=false,context=null){
  clearMatchEffects(matchId);
  const shuffled=context?participants.slice():shuffle(participants);
  const mode=context?.mode==='deathmatch'?'deathmatch':'tdm',sessionType=context?.sessionType||(context?.tournamentId?'tournament':'standard');
  const match={context,participants:shuffled,id:matchId,matchId:context?.gameId||('match:'+wallNow()+':'+matchId+':'+nextActorId+':'+Math.random().toString(36).slice(2)),mode,sessionType,eligible:sessionType==='standard',aiRevision:AI_REVISION,rulesetRevision:RULESET_REVISION,balanceVersion:SAVE.patchState.balanceVersion,balanceFingerprint:balanceFingerprint(),appVersion:window.SARBuild?.version||'1.10.0',score:[0,0],limit:mode==='deathmatch'?30:sessionType==='tournament'?50:SCORE_LIMIT,status:'active',hasPlayer,startedAt:gameNow(),durationMs:mode==='deathmatch'?240000:MATCH_DURATION_MS,overtime:false,endedAt:0,winner:null,endReason:null,teamIntentions:new Map()};
  state.matches[matchId]=match;
  shuffled.forEach((a,i)=>{
    const team=mode==='deathmatch'?i:(context?.teamsByActor?.[a.id]??(i<TEAM_SIZE?0:1));
    prepareActorForMatch(a,matchId,team);
  });
  for(const a of shuffled) respawnActor(a,true);
  return match;
}
function startBotMatch(matchId, bots, restoring=false){
  const match=startMatch(matchId,bots,false);
  SAVE.matchSlots??={};const prior=SAVE.matchSlots[matchId];
  // An active slot is rehydrated under its existing identity on app restart.
  const resume=restoring&&prior?.phase==='active'&&!prior.hasPlayer&&prior.matchId;
  if(resume)match.matchId=prior.matchId;
  SAVE.matchSlots[matchId]={phase:'active',matchId:match.matchId,generation:(prior?.generation||0)+(resume?0:1),participants:bots.map(a=>a.name)};
  return match;
}
function beginSlotCooldown(match){
  if(match.id>=MATCH_COUNT||match.sessionType!=='standard'||match.mode!=='tdm')return;
  SAVE.matchSlots??={};const previous=SAVE.matchSlots[match.id];
  match.cooldownUntil=wallNow()+SLOT_COOLDOWN_MS;
  const bots=match.participants.filter(a=>!a.isPlayer);
  SAVE.matchSlots[match.id]={phase:'cooldown',matchId:match.matchId,generation:previous?.generation||1,endedAt:match.cooldownUntil-SLOT_COOLDOWN_MS,readyAt:match.cooldownUntil,participants:bots.map(a=>a.name),poses:bots.map(a=>({name:a.name,x:a.x,y:a.y,angle:a.angle,team:a.team,dead:a.dead}))};
}
function slotCooldownRemaining(match){return Math.max(0,(match?.cooldownUntil||0)-wallNow());}
function updateOfficialSlots(){
  for(const match of state.matches.slice(0,MATCH_COUNT)){
    if(match?.status!=='cooldown'||slotCooldownRemaining(match)>0)continue;
    // Replacing the slot synchronously consumes this transition exactly once.
    finishBotMatch(match);saveTelemetry();
  }
}
function initializeLeague(){
  if(state.leagueStarted) return;
  state.leagueStarted=true;state.actors=[];state.matches=[];state.idleBots=[];nextActorId=1;
  const bots=[];
  for(let i=0;i<BOT_COUNT;i++) bots.push(makeActor(BOT_NAMES[i],false,i));
  state.actors.push(...bots);
  const shuffled=shuffle(bots);SAVE.matchSlots??={};
  // Reserve saved cooldown rosters first, so a reload cannot book those bots
  // into another slot while their original slot is still cooling down.
  for(let matchId=0;matchId<MATCH_COUNT;matchId++){
    const saved=SAVE.matchSlots[matchId];if(saved?.phase!=='cooldown'||!Number.isFinite(saved.readyAt))continue;
    const participants=[];for(const name of (saved.participants||[]).slice(0,10)){const at=shuffled.findIndex(a=>a.name===name);if(at>=0)participants.push(...shuffled.splice(at,1));}
    for(const a of participants){const pose=saved.poses?.find(p=>p.name===a.name);a.matchId=matchId;a.team=pose?.team??null;a.x=pose?.x??WORLD.w/2;a.y=pose?.y??WORLD.h/2;a.angle=pose?.angle??0;a.dead=pose?.dead??true;a.vx=a.vy=0;}
    state.matches[matchId]={id:matchId,matchId:saved.matchId,status:'cooldown',sessionType:'standard',mode:'tdm',eligible:true,hasPlayer:false,participants,score:[0,0],limit:SCORE_LIMIT,durationMs:MATCH_DURATION_MS,startedAt:gameNow(),cooldownUntil:saved.readyAt};
  }
  for(let matchId=0;matchId<MATCH_COUNT;matchId++)if(!state.matches[matchId]){
    const prior=SAVE.matchSlots[matchId],selected=[];
    if(prior?.phase==='active')for(const name of (prior.participants||[]).slice(0,10)){const at=shuffled.findIndex(a=>a.name===name);if(at>=0)selected.push(...shuffled.splice(at,1));}
    selected.push(...shuffled.splice(0,10-selected.length));startBotMatch(matchId,selected,true);
  }
  // 50 persistent bots / 40 live slots. The ten waiting bots rotate into completed
  // matches first so no bot is permanently benched.
  state.idleBots.push(...shuffled);updateOfficialSlots();saveTelemetry();
}
function standings(match){
  return actorsInMatch(match.id).map(a=>({id:a.id,sourceBotId:a.sourceBotId||a.profile?.id||null,participantId:a.participantId||String(a.id),name:a.name,isPlayer:a.isPlayer,team:a.team,...cloneData(a.stats)})).sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||b.damage-a.damage);
}
function ffaWinners(rows){if(!rows.length)return [];const first=rows[0];return rows.filter(r=>r.kills===first.kills&&r.deaths===first.deaths&&r.damage===first.damage).map(r=>r.id);}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function snapshotResult(match){
  const rows=standings(match),player=rows.find(r=>r.isPlayer),winners=match.mode==='deathmatch'?ffaWinners(rows):rows.filter(r=>r.team===match.winner).map(r=>r.id);
  let placement=0,previous=null;rows.forEach((r,i)=>{if(!previous||r.kills!==previous.kills||r.deaths!==previous.deaths||r.damage!==previous.damage)placement=i+1;r.placement=placement;previous=r;});
  return frozen({matchId:match.matchId,mode:match.mode,sessionType:match.sessionType,eligible:match.eligible,practice:match.practice||false,aiRevision:match.aiRevision,rulesetRevision:match.rulesetRevision,balanceVersion:match.balanceVersion,balanceFingerprint:match.balanceFingerprint,appVersion:match.appVersion,endedAt:match.endedAt,durationMs:match.endedAt-match.startedAt,reason:match.endReason,score:match.score.slice(),winner:match.winner,winnerIds:winners,rows,playerId:player?.id,xp:cloneData(match.xpAward||null),config:cloneData(match.context?.config||null)});
}
function sessionResultHtml(result){
  const player=result.rows.find(r=>r.id===result.playerId),ffa=result.mode==='deathmatch',custom=result.sessionType==='custom',tie=ffa?result.winnerIds.length!==1:result.winner===null;
  const outcome=result.practice?'PRACTICE COMPLETE':custom?'CUSTOM MATCH COMPLETE':tie?'DRAW':ffa?(result.winnerIds.includes(player?.id)?'VICTORY':'DEATHMATCH COMPLETE'):player?.team===result.winner?'VICTORY':'DEFEAT';
  const presentation=matchTeamPresentation(result,result.rows,player);
  const winnerNames=result.rows.filter(r=>result.winnerIds.includes(r.id)).map(r=>escapeHtml(r.name)).join(' / ');
  return `<div class="eyebrow">${custom?'CUSTOM / SESSION ONLY':'STANDARD'} · ${ffa?'DEATHMATCH':'TEAM DEATHMATCH'} · BRIGHTFIELD BLOCKS</div><h2>${outcome}</h2><p class="page-intro">${ffa&&!result.practice?(tie?'Tied: ':'Winner: ')+winnerNames+(player?' · Your placement: '+player.placement:''):result.practice?'No opposing participant — practice statistics only.':teamScoreHtml(result,presentation)}</p><div class="meta-table-scroll"><table class="meta-table result-table"><thead><tr><th>${ffa?'PLACE':'TEAM'}</th><th>PLAYER</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>DAMAGE</th><th>ACCURACY</th><th>HS</th></tr></thead><tbody>${result.rows.map(r=>`<tr class="${r.isPlayer?'result-you':''}"><td style="color:${presentation.actor(r).color}">${ffa?r.placement:presentation.actor(r).label}</td><td>${escapeHtml(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td>${kdDisplay(r.kills,r.deaths)}</td><td>${Math.round(r.damage).toLocaleString()}</td><td>${r.shots?(r.hits/r.shots*100).toFixed(1)+'%':'—'}</td><td>${r.headshots}</td></tr>`).join('')}</tbody></table></div><p class="meta-note">${custom?'Session statistics only. No career, season, weapon meta or reward progress.':ffa?'Saved to your Deathmatch record. TDM standings and Weapon Meta are separate.':'Your competitive record is saved.'} ${result.reason==='time'?'Time expired.':result.reason==='score'?'Kill target reached.':''}</p>${xpSummaryHtml(result.xp)}<div class="account-actions"><button class="primary" data-action="play-again">PLAY AGAIN</button><button data-action="close-result">RETURN TO LOBBY</button><button data-action="spectate">SPECTATE LIVE BOT MATCH</button></div>`;
}
function enterSession(match){
  state.localSessionId=match.id;state.running=true;state.paused=false;state.elapsed=0;state.queued=false;
  state.mode=match.hasPlayer?'play':'spectate';state.playerMatchId=match.hasPlayer?match.id:null;
  if(!match.hasPlayer){state.spectateMatchId=match.id;state.spectateActorId=match.participants[0]?.id??null;}
  document.getElementById('menu').classList.remove('visible');document.getElementById('modal').classList.remove('visible');document.getElementById('pause').classList.remove('visible');
  document.getElementById('hud').classList.toggle('hidden',!match.hasPlayer);document.getElementById('spectatorHud').classList.toggle('hidden',match.hasPlayer);document.getElementById('crosshair').classList.toggle('hidden',!match.hasPlayer);
  const focus=match.participants.find(a=>a.isPlayer)||match.participants[0];if(focus){state.camera.x=focus.x;state.camera.y=focus.y;}
  clearInput();input.aimX=cssW/2+Math.min(220,cssW*.22);input.aimY=cssH/2;input.fullMap=false;
  if(match.hasPlayer){match.status='countdown';state.countdownUntil=gameNow()+3000;state.fightUntil=0;const overlay=document.getElementById('matchCountdown');overlay.classList.remove('hidden','fight');overlay.querySelector('strong').textContent='3';overlay.querySelector('span').textContent='MATCH STARTS IN';requestGameplayPointerLock();}
}
function bindDeathmatchStats(a){
  const dm=SAVE.modeStats.deathmatch;a.standardBindings={career:a.career,weaponUsage:a.weaponUsage};a.sandbox=true;a.tournamentBot=a.isPlayer?null:cloneData(SAVE.bots[a.name]);a.tournamentMeta=dm.meta;
  a.career=a.isPlayer?dm.player:(dm.bots[a.name]??=blankBotCareer(a.name));a.weaponUsage=a.isPlayer?(a.career.weapons??={}):(a.career.weaponUsage??={});
  for(const n of Object.keys(WEAPONS))a.weaponUsage[n]??={k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
}
function startDeathmatch(){
  initializeLeague();if(state.playerMatchId!==null||state.localSessionId!=null)throw Error('Finish your current session first.');
  if(state.idleBots.length<9)throw Error('The roster is currently reserved. Finish the active session first.');
  const bots=state.idleBots.splice(0,9),player=makeActor('YOU',true,999,true);state.actors.push(player);
  const actors=[player,...bots];actors.forEach(bindDeathmatchStats);
  const match=startMatch(nextSessionSlot(),actors,true,{mode:'deathmatch',sessionType:'standard'});enterSession(match);return match;
}
function customConfiguration(raw={}){
  const mode=raw.mode==='deathmatch'?'deathmatch':'tdm',difficulty=Object.hasOwn(TACTICS.presets,raw.difficulty)?raw.difficulty:'Medium',player=raw.player!==false;
  const slots=Array.isArray(raw.bots)?raw.bots:[],used=new Set();if(slots.length>9)throw Error('Choose at most nine bots.');
  const bots=slots.map(slot=>{let name=BOT_NAMES.slice(0,BOT_COUNT).find(n=>profileFor(n).id===slot.sourceBotId||n===slot.name);if(!name){if(slot.sourceBotId&&slot.sourceBotId!=='random')throw Error('Choose an existing roster bot.');name=shuffle(BOT_NAMES.slice(0,BOT_COUNT).filter(n=>!used.has(n)))[0];}if(used.has(name))throw Error('Each bot can occupy one custom slot.');used.add(name);return {sourceBotId:profileFor(name).id,name,team:slot.team===1?1:0};});
  const playerTeam=raw.playerTeam===1?1:0;if(mode==='tdm')for(const team of [0,1])if(bots.filter(b=>b.team===team).length+(player&&playerTeam===team?1:0)>TEAM_SIZE)throw Error('Each TDM team supports up to five participants.');
  return {mode,difficulty,player,playerTeam,bots,map:'brightfield-blocks'};
}
function startCustomMatch(raw){
  initializeLeague();if(state.playerMatchId!==null||state.localSessionId!=null)throw Error('Finish your current session first.');const config=customConfiguration(raw),actors=[],teamsByActor={};
  if(config.player){const a=makeActor('YOU',true,999,true);a.participantId='custom-player:'+a.id;teamsByActor[a.id]=config.playerTeam;actors.push(a);}
  for(const slot of config.bots){const a=makeActor(slot.name,false,BOT_NAMES.indexOf(slot.name),true);a.sourceBotId=slot.sourceBotId;a.participantId='custom:'+a.id+':'+slot.sourceBotId;a.customDifficulty=config.difficulty;a.execution=TACTICS.presets[config.difficulty];teamsByActor[a.id]=slot.team;actors.push(a);}
  state.actors.push(...actors);const match=startMatch(nextSessionSlot(),actors,config.player,{mode:config.mode,sessionType:'custom',teamsByActor,config});match.practice=config.mode==='deathmatch'?actors.length<2:new Set(actors.map(a=>a.team)).size<2;
  CONFIG.customMatch=cloneData(config);saveTelemetry();enterSession(match);return match;
}
function releaseSession(match){
  clearMatchEffects(match.id);for(const a of match.participants){
    if(a.standardBindings&&!a.isPlayer){a.career=a.standardBindings.career;a.weaponUsage=a.standardBindings.weaponUsage;delete a.standardBindings;a.sandbox=false;a.tournamentBot=null;a.tournamentMeta=null;a.matchId=null;a.team=null;a.target=null;a.vx=a.vy=0;state.idleBots.push(a);}
    else state.actors=state.actors.filter(actor=>actor!==a);
  }
  state.matches[match.id]=null;while(state.matches.length>MATCH_COUNT&&!state.matches.at(-1))state.matches.pop();state.localSessionId=null;state.playerMatchId=null;state.running=false;state.mode='menu';state.paused=false;
  releaseGameplayPointerLock();clearInput();for(const id of ['hud','spectatorHud','crosshair','scoreboard','matchCountdown','finalCountdown'])document.getElementById(id)?.classList.add('hidden');document.getElementById('pause').classList.remove('visible');document.getElementById('menu').classList.add('visible');
}
function finishSession(match){if(state.matches[match.id]!==match)return;releaseSession(match);showModal(sessionResultHtml(match.result),'results');}
function renderPlayMenu(){showModal('<div class="eyebrow">PLAY / BRIGHTFIELD BLOCKS</div><h2>Choose your match</h2><div class="play-modes"><button class="primary" data-action="play-tdm"><strong>TEAM DEATHMATCH</strong><span>5v5 · 60 kills · 5 minutes</span></button><button data-action="play-deathmatch"><strong>DEATHMATCH</strong><span>10 players · 30 kills · 4 minutes</span></button><button data-action="play-custom"><strong>CUSTOM</strong><span>Your roster, teams and difficulty · session only</span></button></div>','play');}
function renderCustomSetup(config=CONFIG.customMatch||{mode:'tdm',player:true,playerTeam:0,difficulty:'Medium',bots:[]}){
  const options=BOT_NAMES.slice(0,BOT_COUNT).map(name=>({name,id:profileFor(name).id}));
  showModal(`<div class="eyebrow">PLAY / CUSTOM SESSION</div><h2>Custom match</h2><p class="meta-note">Choose up to nine bots. Empty slots stay empty. All results are session-only.</p><div class="custom-settings"><label>MODE<select id="customMode"><option value="tdm" ${config.mode==='tdm'?'selected':''}>Team Deathmatch</option><option value="deathmatch" ${config.mode==='deathmatch'?'selected':''}>Deathmatch</option></select></label><label>MAP<select id="customMap"><option value="brightfield-blocks">Brightfield Blocks</option></select></label><label>DIFFICULTY<select id="customDifficulty">${Object.keys(TACTICS.presets).map(n=>`<option ${config.difficulty===n?'selected':''}>${n}</option>`).join('')}</select></label><label><input id="customPlayer" type="checkbox" ${config.player!==false?'checked':''}> Join as player</label><label>YOUR TEAM<select id="customPlayerTeam"><option value="0">Side A</option><option value="1" ${config.playerTeam===1?'selected':''}>Side B</option></select></label></div><div class="custom-slots"><div class="custom-slot"><strong>SLOT</strong><strong>BOT</strong><strong>TEAM (TDM)</strong></div>${Array.from({length:9},(_,i)=>{const b=config.bots[i];return `<div class="custom-slot"><span>${i+1}</span><select id="customBot${i}" aria-label="Bot slot ${i+1}"><option value="">Empty</option><option value="random">Random roster bot</option>${options.map(o=>`<option value="${escapeHtml(o.id)}" ${b?.sourceBotId===o.id?'selected':''}>${escapeHtml(o.name)} · ${profileFor(o.name).power}</option>`).join('')}</select><select id="customTeam${i}" aria-label="Team slot ${i+1}"><option value="0">Side A</option><option value="1" ${(b?.team??(i>=4?1:0))===1?'selected':''}>Side B</option></select></div>`;}).join('')}</div><p id="customError" role="status"></p><div class="account-actions"><button class="primary" data-action="start-custom">START SESSION</button><button data-action="play">BACK</button><button data-action="close-result">RETURN TO LOBBY</button></div>`,'custom-setup');
}
function readCustomSetup(){return {mode:document.getElementById('customMode').value,difficulty:document.getElementById('customDifficulty').value,player:document.getElementById('customPlayer').checked,playerTeam:Number(document.getElementById('customPlayerTeam').value),bots:Array.from({length:9},(_,i)=>({sourceBotId:document.getElementById('customBot'+i).value,team:Number(document.getElementById('customTeam'+i).value)})).filter(b=>b.sourceBotId)};}
function updateFinalCountdown(now){
  const match=getMatch(visibleMatchId()),overlay=document.getElementById('finalCountdown');if(!overlay)return;
  const remaining=match?.status==='active'&&!match.overtime?matchRemainingMs(match,now):0,value=state.running&&remaining>0&&remaining<=5000?Math.ceil(remaining/1000):0;
  overlay.classList.toggle('hidden',!value);if(value&&(overlay.dataset.match!==match.matchId||overlay.dataset.second!==String(value))){overlay.dataset.match=match.matchId;overlay.dataset.second=String(value);overlay.textContent=String(value);}
}
function renderDeathmatchProfile(){const c=SAVE.modeStats.deathmatch.player;showModal(`<div class="eyebrow">PLAYER PROFILE / DEATHMATCH</div><h2>Deathmatch record</h2><div class="account-actions"><button data-action="player-profile">TEAM DEATHMATCH</button><button class="selected" data-action="deathmatch-profile">DEATHMATCH</button></div>${progressionProfileHtml()}${careerStatsHtml(c,true)}<h3>WEAPONS</h3>${careerWeaponTableHtml(c.weapons||{})}<h3>RECENT MATCHES</h3>${SAVE.modeStats.deathmatch.recentMatches.slice(-10).reverse().map(r=>{const p=r.rows.find(a=>a.isPlayer);return `<p>${p?'PLACE '+p.placement+' · '+p.kills+' / '+p.deaths+' / '+p.assists:'DEATHMATCH'} · ${r.reason==='time'?'TIME LIMIT':'KILL TARGET'}</p>`;}).join('')||'<p>No completed Deathmatches yet.</p>'}<p class="meta-note">Deathmatch records remain separate from TDM careers, seasons and Weapon Meta.</p>`,'deathmatch-profile');}


function queueForMatch(){
  initializeLeague();
  if(state.queued||state.playerMatchId!==null||state.localSessionId!=null) return;
  state.queued=true;state.queueSince=gameNow();
  const qb=document.getElementById('queueButton');if(qb){qb.disabled=true;qb.textContent='STARTING 5V5 TDM';}
  const qs=document.getElementById('queueStatus');if(qs)qs.classList.remove('hidden');
  const detail=document.getElementById('queueDetail');if(detail)detail.textContent='Instant player slot ready. Starting immediately…';
  updateLobbyUi();
  // All four bot games remain true 5v5s. Joining instantly takes over the designated
  // live slot, moves one bot into the waiting rotation, and restarts it as YOU + 9 bots.
  let open=getMatch(PLAYER_MATCH_SLOT_ID);
  if(!open||open.status!=='active'||open.hasPlayer){
    open=state.matches.find(m=>m&&m.status==='active'&&!m.hasPlayer)||null;
  }
  if(open){
    const available=actorsInMatch(open.id).filter(a=>!a.isPlayer);
    if(available.length>=9)launchPlayerMatch(open.id,available);
  }
}
function launchPlayerMatch(matchId, releasedBots){
  const chosen=releasedBots.slice(0,9), leftover=releasedBots.slice(9);
  for(const a of leftover){a.matchId=null;a.team=null;a.target=null;a.vx=a.vy=0;}
  state.idleBots.push(...leftover);
  const player=makeActor('YOU',true,999);
  state.actors.push(player);
  const match=startMatch(matchId,[player,...chosen],true);
  SAVE.matchSlots[matchId]={phase:'active',matchId:match.matchId,hasPlayer:true,generation:(SAVE.matchSlots[matchId]?.generation||0)+1,participants:chosen.map(a=>a.name)};saveTelemetry();
  match.status='countdown';state.countdownUntil=gameNow()+3000;state.fightUntil=0;
  state.playerMatchId=matchId;state.audioCountdown=3;audioEvent('countdown',player);state.queued=false;state.running=true;state.mode='play';state.paused=false;state.elapsed=0;state.startTime=gameNow();
  document.getElementById('menu').classList.remove('visible');
  document.getElementById('pause').classList.remove('visible');
  document.getElementById('modal').classList.remove('visible');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('crosshair').classList.remove('hidden');
  const focus=getPlayer(); if(focus){state.camera.x=focus.x;state.camera.y=focus.y;}
  input.aimX=cssW/2+Math.min(220,cssW*.22);input.aimY=cssH/2;input.fullMap=false;
  clearInput();positionCrosshair();requestGameplayPointerLock();
  const countdown=document.getElementById('matchCountdown');if(countdown){countdown.classList.remove('hidden','fight');const label=countdown.querySelector('span'),number=countdown.querySelector('strong');if(label)label.textContent='MATCH STARTS IN';if(number)number.textContent='3';}
}
function recordPlayerResult(a,winner){
  const career=a.career,s=a.stats;
  career.bestKills=Math.max(career.bestKills,s.kills);career.bestDamage=Math.max(career.bestDamage,s.damage);
  career.currentWinStreak=a.team===winner?career.currentWinStreak+1:0;career.bestWinStreak=Math.max(career.bestWinStreak,career.currentWinStreak);
  const old=career.bestKdGame,kd=s.kills/Math.max(1,s.deaths);if(!old||kd>old.kd||(kd===old.kd&&s.kills>old.kills))career.bestKdGame={kd,kills:s.kills,deaths:s.deaths,at:wallNow()};
  career.recentMatches.push({at:wallNow(),patchId:SAVE.patchState.id,mode:getMatch(a.matchId)?.mode||'tdm',sessionType:getMatch(a.matchId)?.sessionType||'standard',eligible:officialTdm(a),matchId:getMatch(a.matchId)?.matchId,aiRevision:AI_REVISION,won:a.team===winner,primary:a.slots[0].name,sidearm:a.slots[1].name,kills:s.kills,deaths:s.deaths,assists:s.assists,damage:s.damage,headshots:s.headshots});
  career.recentMatches=career.recentMatches.slice(-30);
}
function rotateBotMatch(matchId,releasedBots,targetSize=10){
  // Waiting bots enter first; recently released bots go to the back of the queue.
  const pool=[...state.idleBots.splice(0),...releasedBots];
  const next=pool.slice(0,targetSize),waiting=pool.slice(targetSize);
  for(const a of waiting){a.matchId=null;a.team=null;a.target=null;a.vx=a.vy=0;}
  state.idleBots.push(...waiting);
  return startBotMatch(matchId,next);
}
function finishPlayerMatch(match){
  if(state.matches[match.id]!==match)return;
  const player=getPlayer();
  const playerTeam=player?.team??0, won=match.winner===playerTeam,report=match.playerReport||{};
  const released=actorsInMatch(match.id).filter(a=>!a.isPlayer);
  if(player){
    player.matchId=null;player.team=null;
    state.actors=state.actors.filter(a=>a!==player);
  }
  state.playerMatchId=null;state.running=false;state.mode='menu';
  // Participants remain reserved by the cooling slot until its deadline.
  match.hasPlayer=false;match.participants=released;
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('crosshair').classList.add('hidden');
  document.getElementById('menu').classList.add('visible');
  const qb=document.getElementById('queueButton');if(qb){qb.disabled=false;qb.textContent='PLAY';}
  document.getElementById('queueStatus')?.classList.add('hidden');
  showModal(matchReportHtml(match,playerTeam,report),'results');
}
function matchReportHtml(match,playerTeam,report){
  const presentation=matchTeamPresentation(match,match.result?.rows||match.participants,(match.result?.rows||match.participants).find(a=>a.isPlayer));
  const won=match.winner===playerTeam,accuracy=report.shots?((report.hits/report.shots)*100).toFixed(1)+'%':'—';
  return `<div class="eyebrow">MATCH REPORT / BRIGHTFIELD BLOCKS</div><h2>${match.winner===null?'DRAW':won?'VICTORY':'DEFEAT'}</h2>
    <div class="result-score">${presentation.sides(match.score).map(side=>`<strong style="color:${side.color}"><small>${side.label}</small>${side.score}</strong>`).join('<span>—</span>')}</div>
    <div class="match-mvp"><span class="label">MATCH MVP</span><strong>${escapeHtml(report.mvp?.name||'—')}</strong><span>${report.mvp?.kills||0} K · ${Math.round(report.mvp?.damage||0).toLocaleString()} DMG</span></div>
    ${xpSummaryHtml(match.xpAward)}<h3>YOUR PERFORMANCE</h3><div class="match-report-grid"><div><span>K / D / A</span><strong>${report.kills||0} / ${report.deaths||0} / ${report.assists||0}</strong></div><div><span>K/D</span><strong>${kdDisplay(report.kills||0,report.deaths||0)}</strong></div><div><span>DAMAGE</span><strong>${Math.round(report.damage||0).toLocaleString()}</strong></div><div><span>ACCURACY</span><strong>${accuracy}</strong></div><div><span>HEADSHOTS</span><strong>${report.headshots||0}</strong></div><div><span>MOST-USED WEAPON</span><strong>${escapeHtml(report.mostUsed||'—')}</strong></div></div>
    <h3>TEAM SCOREBOARD</h3><div class="meta-table-scroll"><table class="meta-table result-table"><thead><tr><th>PLAYER</th><th>TEAM</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>DAMAGE</th></tr></thead><tbody>${(report.rows||[]).map(a=>`<tr class="${a.isPlayer?'result-you':''}"><td>${escapeHtml(a.name)}</td><td style="color:${presentation.team(a.team).color}">${presentation.team(a.team).label}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.assists}</td><td>${kdDisplay(a.kills,a.deaths)}</td><td>${Math.round(a.damage).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>
    <p class="meta-note">${match.endReason==='time'?'The five-minute clock expired.':match.endReason==='overtime'?'The tied game was decided in sudden-death overtime.':'A team reached '+match.limit+' kills.'}</p><div class="account-actions"><button class="primary" data-action="play-again">PLAY AGAIN</button><button data-action="spectate">SPECTATE LIVE BOT MATCH</button><button data-action="close-result">RETURN TO LOBBY</button></div>`;
}
function finishBotMatch(match){
  if(state.matches[match.id]!==match||match.status!=='cooldown'||slotCooldownRemaining(match)>0)return;
  const released=actorsInMatch(match.id).filter(a=>!a.isPlayer);
  if(state.queued && state.playerMatchId===null && released.length>=9){
    launchPlayerMatch(match.id,released);
  } else {
    rotateBotMatch(match.id,released,10);
  }
}
function endMatch(match,winner,reason='score'){
  if(!match||match.status!=='active')return;
  if(match.context?.tournamentId){endTournamentGame(match,winner,reason);return;}
  if(match.result)return;
  ensureSeasonFresh(wallNow());
  if(match.hasPlayer){const player=actorsInMatch(match.id).find(a=>a.isPlayer);if(player)audioEvent((match.mode==='deathmatch'?player.id===winner:player.team===winner)?'victory':'defeat',player);}
  match.status='ended';match.winner=match.practice?null:winner;match.endReason=reason;match.endedAt=gameNow();
  commitMatchXP(match);match.result=snapshotResult(match);if(match.hasPlayer||state.localSessionId===match.id)state.lastResult=match.result;updateFinalCountdown(gameNow());
  const participants=actorsInMatch(match.id);
  recordParticipantCompletion(match,participants);
  const socialMatchId=match.matchId;
  if(match.sessionType==='custom'||match.mode==='deathmatch'){
    if(match.eligible){const dm=SAVE.modeStats.deathmatch;for(const a of participants){const won=match.result.winnerIds.length===1&&match.result.winnerIds.includes(a.id);a.career.games++;if(won)a.career.wins++;else if(!match.result.winnerIds.includes(a.id))a.career.losses++;else a.career.draws=(a.career.draws||0)+1;for(const [name,sample] of Object.entries(a.matchWeaponStats||{}))if(sample.picks||sample.equippedTime)a.weaponUsage[name].games++;if(a.isPlayer)recordPlayerResult(a,won?a.team:null);}dm.completedMatches++;dm.recentMatches.push(cloneData(match.result));dm.recentMatches=dm.recentMatches.slice(-30);saveTelemetry();window.SARCloud?.commitMatch?.(SAVE,socialMatchId);}
    for(const a of participants){a.vx=a.vy=0;a.target=null;}queueMicrotask(()=>finishSession(match));return;
  }
  for(const a of participants)a.completedSocialMatch={matchId:socialMatchId,team:a.team,teammates:participants.filter(other=>!other.isPlayer&&other!==a&&other.team===a.team).map(other=>other.name),opponents:participants.filter(other=>!other.isPlayer&&other.team!==a.team).map(other=>other.name)};
  if(match.hasPlayer){const p=participants.find(a=>a.isPlayer);match.playerReport={...(p?.stats||{}),mostUsed:Object.entries(p?.matchWeaponStats||{}).sort((a,b)=>(b[1].equippedTime||0)-(a[1].equippedTime||0))[0]?.[0]||p?.slots[0]?.name,mvp:participants.map(a=>({name:a.name,kills:a.stats.kills,damage:a.stats.damage})).sort((a,b)=>b.kills-a.kills||b.damage-a.damage)[0],rows:participants.map(a=>({name:a.name,isPlayer:a.isPlayer,team:a.team,...cloneData(a.stats)})).sort((a,b)=>a.team-b.team||b.kills-a.kills||b.damage-a.damage)};}
  for(const a of participants){recordCompletedParticipant(a);if(a.career){a.career.games++;if(a.team===winner)a.career.wins++;else a.career.losses++;recordSeasonMatch(a,winner);for(const [w,sample] of Object.entries(a.matchWeaponStats||{}))if(sample.picks>0||sample.equippedTime>0)a.weaponUsage[w].games++;if(a.isPlayer)recordPlayerResult(a,winner);else recordBotResult(a,winner);}}
  SAVE.patchState.completedMatches++;if(revisionSample()!==SAVE.patchState)revisionSample().completedMatches++;diagnostics.completedMatches++;diagnostics.matchScoreKills+=match.score[0]+match.score[1];
  beginSlotCooldown(match);match.status='cooldown';
  saveTelemetry();
  if(match.hasPlayer){window.SARCloud?.commitMatch?.(SAVE,socialMatchId);if(document.getElementById('modalContent')?.dataset.view==='player-profile')renderPlayerProfile();}
  for(const a of actorsInMatch(match.id)){a.vx=a.vy=0;a.target=null;}
  // Only the local result screen advances immediately. Automated replacement
  // belongs to the persisted slot scheduler, independently for each slot.
  if(match.hasPlayer)queueMicrotask(()=>finishPlayerMatch(match));
}
function startTournamentGame(context){
  initializeLeague();if(state.playerMatchId!==null||state.localSessionId!=null)throw new Error('Finish your current game first.');
  const people=context.teams.flatMap(team=>team.participants);if(people.length!==10||new Set(people.map(p=>p.id)).size!==10)throw new Error('Two complete teams are required.');
  const actors=people.map(p=>{const human=p.kind==='user'&&context.hasPlayer!==false,bot=BOT_NAMES.find(name=>profileFor(name).id===p.id);if(!human&&!bot)throw new Error('Unknown tournament participant');const a=makeActor(human?'YOU':bot,human,bot?BOT_NAMES.indexOf(bot):999,true);a.participantId=p.id;return a;});
  const matchId=nextSessionSlot();state.actors.push(...actors);const match=startMatch(matchId,actors,actors.some(a=>a.isPlayer),context);if(match.hasPlayer){state.playerMatchId=matchId;state.running=true;state.mode='play';state.paused=false;state.elapsed=0;document.getElementById('menu').classList.remove('visible');document.getElementById('modal').classList.remove('visible');document.getElementById('hud').classList.remove('hidden');document.getElementById('crosshair').classList.remove('hidden');const p=getPlayer();state.camera.x=p.x;state.camera.y=p.y;input.aimX=cssW/2+220;input.aimY=cssH/2;clearInput();requestGameplayPointerLock();}return match;
}
function endTournamentGame(match,winner,reason){
  match.status='ended';match.winner=winner;match.endReason=reason;match.endedAt=gameNow();
  commitMatchXP(match);if(match.xpAward){saveTelemetry();window.SARCloud?.commitMatch?.(SAVE,match.matchId);}
  const actors=actorsInMatch(match.id);match.tournamentResult={mode:match.mode,sessionType:'tournament',eligible:false,aiRevision:AI_REVISION,balanceVersion:match.balanceVersion,balanceFingerprint:match.balanceFingerprint,matchId:match.matchId,xp:cloneData(match.xpAward||null),id:match.context.gameId||('game:'+match.context.seriesId+':'+wallNow()),winnerTeamId:match.context.teamIds[winner],score:match.score.slice(),duration:(match.endedAt-match.startedAt)/1000,stats:actors.map(a=>({participantId:a.participantId,...cloneData(a.stats),weaponStats:cloneData(a.matchWeaponStats)}))};
  if(match.hasPlayer){const p=actors.find(a=>a.isPlayer);match.playerReport={...cloneData(p.stats),rows:actors.map(a=>({name:a.name,isPlayer:a.isPlayer,team:a.team,...cloneData(a.stats)}))};audioEvent(p.team===winner?'victory':'defeat',p);releaseGameplayPointerLock();queueMicrotask(()=>{state.actors=state.actors.filter(a=>a.matchId!==match.id);state.matches[match.id]=null;state.playerMatchId=null;state.running=false;state.mode='menu';document.getElementById('hud').classList.add('hidden');document.getElementById('crosshair').classList.add('hidden');document.getElementById('menu').classList.add('visible');window.SARTournaments?.onResult?.(match.context,match.tournamentResult);});}
}
function matchRemainingMs(match,now=gameNow()){return ['cooldown','ended'].includes(match.status)?0:match.status==='countdown'?match.durationMs:Math.max(0,match.durationMs-(now-match.startedAt));}
function updateMatchClocks(now){
  for(const match of state.matches){
    if(!match||match.status!=='active'||match.overtime)continue;
    if(matchRemainingMs(match,now)<=0){
      if(match.mode==='deathmatch'){const rows=standings(match),winners=ffaWinners(rows);endMatch(match,winners.length===1?winners[0]:null,'time');}
      else if(match.practice)endMatch(match,null,'time');
      else if(match.score[0]===match.score[1])match.overtime=true;
      else endMatch(match,match.score[0]>match.score[1]?0:1,'time');
    }
  }
}
function exitGame(){
  const returnToPhone=state.mode==='spectate';
  releaseGameplayPointerLock();clearInput();
  state.paused=false;state.queued=false;
  const match=getMatch(state.localSessionId??state.playerMatchId);
  if(match&&state.localSessionId===match.id){releaseSession(match);}
  else if(match?.context?.tournamentId){state.actors=state.actors.filter(a=>a.matchId!==match.id);state.matches[match.id]=null;state.playerMatchId=null;state.running=false;state.mode='menu';window.SARTournaments?.onAbandon?.(match.context);}
  else if(match&&['active','countdown'].includes(match.status)){
    const bots=actorsInMatch(match.id).filter(a=>!a.isPlayer);
    const player=getPlayer();if(player)state.actors=state.actors.filter(a=>a!==player);
    state.playerMatchId=null;state.running=false;state.mode='menu';rotateBotMatch(match.id,bots,10);
  } else {state.running=false;state.mode='menu';state.spectateActorId=null;}
  document.getElementById('hud').classList.add('hidden');document.getElementById('spectatorHud')?.classList.add('hidden');document.getElementById('scoreboard').classList.add('hidden');
  document.getElementById('crosshair').classList.add('hidden');document.getElementById('pause').classList.remove('visible');
  document.getElementById('matchCountdown')?.classList.add('hidden');
  document.getElementById('menu').classList.add('visible');
  if(returnToPhone)window.SARPhone?.returnFromSpectate?.();
  const qb=document.getElementById('queueButton');if(qb){qb.disabled=false;qb.textContent='PLAY';}
}
function getPlayer(){ return state.actors.find(a=>a.isPlayer&&a.matchId!==null); }
function spectatedActor(){
  if(state.mode!=='spectate')return null;let a=state.actors.find(x=>x.id===state.spectateActorId&&x.matchId===state.spectateMatchId);
  if(!a){a=actorsInMatch(state.spectateMatchId).find(x=>!x.dead)||actorsInMatch(state.spectateMatchId)[0]||null;state.spectateActorId=a?.id??null;}return a;
}
function getFocusActor(){ return getPlayer()||spectatedActor(); }
function visibleMatchId(){
  if(state.playerMatchId!==null)return state.playerMatchId;
  if(state.mode==='spectate')return state.spectateMatchId;
  return 0;
}
function cycleSpectateActor(dir=1){
  if(state.mode!=='spectate')return;const list=actorsInMatch(state.spectateMatchId);if(!list.length)return;
  let i=list.findIndex(a=>a.id===state.spectateActorId);i=(i+dir+list.length)%list.length;state.spectateActorId=list[i].id;
}
function cycleSpectateMatch(dir=1){
  if(state.mode!=='spectate')return;state.spectateMatchId=(state.spectateMatchId+dir+MATCH_COUNT)%MATCH_COUNT;const a=actorsInMatch(state.spectateMatchId).find(x=>!x.dead);state.spectateActorId=a?.id??null;
}
function startSpectate(matchId=0){
  releaseGameplayPointerLock();clearInput();
  initializeLeague();state.mode='spectate';state.running=true;state.paused=false;state.spectateMatchId=matchId;const a=actorsInMatch(matchId).find(x=>!x.dead);state.spectateActorId=a?.id??null;
  document.getElementById('menu').classList.remove('visible');document.getElementById('modal').classList.remove('visible');document.getElementById('pause').classList.remove('visible');
  document.getElementById('hud').classList.add('hidden');document.getElementById('crosshair').classList.add('hidden');document.getElementById('spectatorHud')?.classList.remove('hidden');updateSpectatorHud(gameNow());
}

// -------------------- Combat --------------------
function audioEvent(type,a,details={}){window.SARAudio?.emit({type,actorId:a?.id,matchId:a?.matchId,x:a?.x,y:a?.y,weapon:a?currentWeaponState(a)?.name:undefined,...details});}
function impactMaterial(solid){return ['tree','fence','bench','interior'].includes(solid?.kind)?'wood':['car','utility'].includes(solid?.kind)?'metal':'concrete';}
function footstepSurface(a){if(buildingAt(a.x,a.y))return 'indoor';const contains=(r,pad=0)=>a.x>=r.x-pad&&a.x<=r.x+r.w+pad&&a.y>=r.y-pad&&a.y<=r.y+r.h+pad;return roads.some(r=>contains(r,54))||surfaces.some(r=>contains(r))?'pavement':'grass';}
function updateHandlingAudio(a,s,now){
  const w=WEAPONS[s.name];
  if(s.name==='Pump Shotgun'&&Number.isFinite(s.lastBullet)&&now-s.lastBullet>=180&&now-s.lastBullet<800&&s.pumpAudioAt!==s.lastBullet){s.pumpAudioAt=s.lastBullet;audioEvent('pump',a,{weapon:s.name});}
  if(!s.reloading)return;const progress=clamp(1-(s.reloadEnd-now)/(w.reload*1000),0,1);
  if(['Pump Shotgun','SPAS-12'].includes(s.name)){
    const inserts=Math.max(1,s.audioShells||1),step=Math.min(inserts,Math.floor(progress*(inserts+1)));
    while((s.audioPhase||0)<step){s.audioPhase=(s.audioPhase||0)+1;audioEvent('shell-insert',a,{weapon:s.name});}
  }else if(progress>=.68&&!s.audioPhase){s.audioPhase=1;audioEvent('mag-in',a,{weapon:s.name});}
}

function currentWeaponState(a){ return a.slots[a.currentSlot]; }
function currentWeapon(a){ return WEAPONS[currentWeaponState(a).name]; }
function startReload(a,now){
  const s=currentWeaponState(a),w=WEAPONS[s.name];
  if(a.dead||s.reloading||s.ammo>=w.mag||s.reserve<=0) return;
  s.pendingBurst=null;s.reloading=true;s.reloadEnd=now+w.reload*1000;s.audioPhase=0;s.audioShells=Math.min(w.mag-s.ammo,s.reserve);
  if(!['Pump Shotgun','SPAS-12'].includes(s.name))audioEvent('mag-out',a,{weapon:s.name});
}
function finishReload(s,a=null){
  if(a)audioEvent('reload-ready',a,{weapon:s.name});
  const w=WEAPONS[s.name],need=w.mag-s.ammo,take=Math.min(need,s.reserve);s.ammo+=take;s.reserve-=take;s.reloading=false;s.reloadEnd=0;
}
function recordEngagementRange(a,angle,weapon,now){
  // Sample one actual trigger pull aimed toward a currently visible opponent.
  // Old shots have no range observation, so they are never reconstructed.
  let candidate=null,best=Infinity;
  if(!a.isPlayer&&a.target?.visible&&now-a.target.at<300&&pointLOS(a.x,a.y,a.target)){
    const bearing=Math.atan2(a.target.y-a.y,a.target.x-a.x);
    if(Math.abs(angleDiff(angle,bearing))<.18)candidate=a.target;
  }else if(a.isPlayer){
    for(const o of actorsInMatch(a.matchId)){
      if(o.dead||isAlly(o,a)||!hasLOS(a,o))continue;
      const bearing=Math.atan2(o.y-a.y,o.x-a.x),difference=Math.abs(angleDiff(angle,bearing));
      if(difference<.14&&difference<best){candidate=o;best=difference;}
    }
  }
  if(!candidate)return;
  const distance=Math.hypot(candidate.x-a.x,candidate.y-a.y);
  actorMeta(a,weapon).engagementDistance+=distance;actorMeta(a,weapon).engagementDistanceN++;
  recordPatchEvent(a,weapon,'engagementDistance',distance);recordPatchEvent(a,weapon,'engagementDistanceN');
}
function emitWeaponRound(a,s,w,angle,now,shotRecord,feedbackId){
  s.ammo--;s.lastBullet=now;a.muzzleUntil=now+65;a.recoil=1;
  audioEvent('shot',a,{weapon:s.name,roundId:feedbackId,time:now});
  // Procedural weapon VFX: warm muzzle sparks and a tiny brass casing for non-shotgun firearms.
  const muzzle=20+weaponLength(s.name)-weaponKick(s.name,a.recoil)-a.recoil*1.3;
  const mx=a.x+Math.cos(angle)*muzzle,my=a.y+Math.sin(angle)*muzzle;
  for(let q=0;q<3;q++){const sa=angle+rand(-.28,.28),sv=rand(45,110);state.particles.push({matchId:a.matchId,type:'spark',x:mx,y:my,vx:Math.cos(sa)*sv,vy:Math.sin(sa)*sv,life:rand(.09,.16),age:0,size:1.5,color:'#ffd878'});}
  if(w.pellets===1){const side=angle+Math.PI/2+rand(-.18,.18),sv=rand(35,70);state.particles.push({matchId:a.matchId,type:'casing',x:a.x+Math.cos(angle)*18,y:a.y+Math.sin(angle)*18,vx:Math.cos(side)*sv,vy:Math.sin(side)*sv,life:.55,age:0,size:2,color:'#d7b45a',spin:rand(0,6.28)});}
  const pelletDamage=w.damage/w.pellets, pelletHead=w.head/w.pellets;
  const shotSpread=effectiveSpreadDeg(a,w);
  a.presentationShotId=feedbackId;
  for(let i=0;i<w.pellets;i++){
    const spread=(Math.random()-.5)*shotSpread*Math.PI/180;
    const ang=angle+spread;
    // Begin at the collision boundary so firing beside a wall cannot bypass it.
    const muzzle=ACTOR_RADIUS+1;
    const obstruction=obstacleHitT(a.x,a.y,a.x+Math.cos(ang)*muzzle,a.y+Math.sin(ang)*muzzle);if(obstruction!==null)continue;
    state.projectiles.push({
      matchId:a.matchId,x:a.x+Math.cos(ang)*muzzle,y:a.y+Math.sin(ang)*muzzle,px:a.x,py:a.y,
      vx:Math.cos(ang)*w.speed*TILE,vy:Math.sin(ang)*w.speed*TILE,owner:a,weapon:s.name,
      damage:pelletDamage,head:pelletHead,travel:muzzle,born:now,dead:false,shot:shotRecord,feedbackId
    });
  }
  if(s.ammo===0 && !a.isPlayer) startReload(a,now+30);
}
function fire(a, angle, now){
  if(getMatch(a.matchId)?.status!=='active')return false;
  const s=currentWeaponState(a),w=WEAPONS[s.name];
  if(a.dead||s.reloading||s.pendingBurst||now-s.lastShot<w.hitSpeed*1000)return false;
  if(s.ammo<=0){audioEvent('dry-fire',a,{weapon:s.name});startReload(a,now);return false;}
  s.lastShot=now;
  xpEvent(a,'weapon',s.name);
  // Accuracy is trigger-pull based: one shot fired regardless of pellet count.
  // A shotgun trigger pull counts as one hit if at least one pellet connects.
  const shotId=nextShotId++, shotRecord={id:shotId,hit:false};if(a.ads){diagnostics.adsShots++;if(!a.isPlayer)diagnostics.botAdsShots++;}
  actorMeta(a,s.name).shots++;recordPatchEvent(a,s.name,'shots');a.stats.shots++;a.weaponUsage[s.name].shots++;if(a.career)a.career.shots++;
  recordEngagementRange(a,angle,s.name,now);
  emitWeaponRound(a,s,w,angle,now,shotRecord,shotId);
  if(w.burstCount>1&&s.ammo>0&&!s.reloading)s.pendingBurst={remaining:w.burstCount-1,nextAt:now+w.burstSpacing*1000,shotRecord};
  return true;
}
function updateBurst(a,now){
  for(const s of a.slots){
    const burst=s.pendingBurst;if(!burst)continue;
    if(a.dead||s!==currentWeaponState(a)||s.reloading||getMatch(a.matchId)?.status!=='active'){s.pendingBurst=null;continue;}
    const w=WEAPONS[s.name];
    while(s.pendingBurst&&burst.remaining>0&&now>=burst.nextAt){
      if(s.ammo<=0){s.pendingBurst=null;break;}
      emitWeaponRound(a,s,w,a.angle,burst.nextAt,burst.shotRecord,nextShotId++);
      burst.remaining--;burst.nextAt+=w.burstSpacing*1000;
      if(!burst.remaining||s.reloading)s.pendingBurst=null;
    }
  }
}
function damageAtRange(p, isHead){
  const w=WEAPONS[p.weapon], tiles=p.travel/TILE;
  const over=Math.max(0,tiles-w.falloffStart), mult=Math.max(.45,1-over*w.falloff);
  return (isHead?p.head:p.damage)*mult;
}
function killActor(victim,killer,weapon,isHead,killDistance,now){
  if(victim.dead||getMatch(victim.matchId)?.status!=='active')return;
  if(!victim.isPlayer){const range=victim.target?dist(victim,victim.target):0,w=currentWeapon(victim);TACTICS.remember(victim.tacticalMemory,{kind:'death',x:victim.x,y:victim.y,at:now,tactic:victim.tactic,approach:victim.moveGoal?{...victim.moveGoal}:null,door:victim.exitPlan?.exit,isolated:!victim.visibleAllies?.length,badRange:!!victim.target&&(range>w.preferred*1.7||(w.preferred>=1000&&range<w.preferred*.4))});}
  victim.dead=true;victim.deathAt=now;victim.respawnAt=now+RESPAWN_MS;victim.stats.deaths++;victim.killStreak=0;if(victim.career){victim.career.deaths++;if(victim.isPlayer)victim.career.currentStreak=0;}
  const equipped=currentWeaponState(victim)?.name; if(equipped){actorMeta(victim,equipped).deaths++;recordPatchEvent(victim,equipped,'deaths');victim.weaponUsage[equipped].d++;}
  if(killer && killer!==victim){
    if(!killer.isPlayer){TACTICS.forgetHealth(killer.tacticalMemory,victim.id);if(killer.tactic==='CHASE')TACTICS.remember(killer.tacticalMemory,{kind:'chase_end',success:true});}
    killer.stats.kills++;killer.killStreak=(killer.killStreak||0)+1;if(killer.career){killer.career.kills++;if(killer.isPlayer){killer.career.currentStreak=killer.killStreak;killer.career.bestStreak=Math.max(killer.career.bestStreak,killer.killStreak);}}actorMeta(killer,weapon).kills++;recordPatchEvent(killer,weapon,'kills');killer.weaponUsage[weapon].k++;
    actorMeta(killer,weapon).killDistance+=killDistance;actorMeta(killer,weapon).killDistanceN++;recordPatchEvent(killer,weapon,'killDistance',killDistance);recordPatchEvent(killer,weapon,'killDistanceN');
    // The ledger contains actual health removed by this weapon since this victim's
    // last spawn. Only kills recorded after this schema exist in the denominator.
    const contribution=victim.damageByWeapon.get(weapon)||0;
    actorMeta(killer,weapon).classifiedKills++;recordPatchEvent(killer,weapon,'classifiedKills');
    if(contribution>=MAX_HP*.8-1e-6){actorMeta(killer,weapon).soloKills++;recordPatchEvent(killer,weapon,'soloKills');xpEvent(killer,'solo');}
    if(contribution<=MAX_HP*.4+1e-6){actorMeta(killer,weapon).finisherKills++;recordPatchEvent(killer,weapon,'finisherKills');xpEvent(killer,'finisher');}
    if(isHead){ killer.stats.headshots++;killer.weaponUsage[weapon].headshots++;if(killer.career)killer.career.headshots++;actorMeta(killer,weapon).headshots++;recordPatchEvent(killer,weapon,'headshots'); }
    xpEvent(killer,'streak');
    // assists from recent contributors
    for(const [id,entry] of victim.damageLedger){
      if(id===killer.id||now-entry.time>5000||entry.damage<35)continue;
      const assister=state.actors.find(a=>a.id===id); if(assister){assister.stats.assists++;recordSeasonEvent(assister,'assists');if(assister.career)assister.career.assists++;}
    }
    const match=getMatch(killer.matchId);
    if(match && match.status==='active' && isEnemy(killer,victim)){
      if(match.mode==='deathmatch'){if(killer.stats.kills>=match.limit)endMatch(match,killer.id,'score');}
      else {match.score[killer.team]++;
      if(match.score[killer.team]>=match.limit) endMatch(match,killer.team,'score');
      else if(match.overtime) endMatch(match,killer.team,'overtime');}
    }
    if(killer.matchId===visibleMatchId()) addKillfeed(killer,victim,weapon,isHead);
    if(!killer.isPlayer&&killer.traits) killer.traits.confidence=clamp(killer.traits.confidence+.06,0,1);
  }
  if(!victim.isPlayer&&victim.traits) victim.traits.confidence=clamp(victim.traits.confidence-.05,0,1);
  for(let i=0;i<15;i++) state.particles.push({matchId:victim.matchId,x:victim.x,y:victim.y,vx:rand(-120,120),vy:rand(-120,120),life:rand(.35,.75),age:0,size:rand(2,5),color:SKINS[victim.skinIndex].accent});
}
function applyDamage(victim,p,amount,isHead,now){
  if(victim.dead||getMatch(victim.matchId)?.status!=='active'||!isEnemy(p.owner,victim))return;
  const actual=Math.min(victim.hp,amount);victim.hp-=actual;victim.stats.taken+=actual;recordSeasonEvent(victim,'taken',actual);p.owner.stats.damage+=actual;p.owner.weaponUsage[p.weapon].damage+=actual;actorMeta(p.owner,p.weapon).damage+=actual;recordPatchEvent(p.owner,p.weapon,'damage',actual);if(victim.career)victim.career.taken+=actual;if(p.owner.career)p.owner.career.damage+=actual;
  if(!victim.isPlayer)TACTICS.remember(victim.tacticalMemory,{kind:'damage',amount:actual,received:true,at:now});if(!p.owner.isPlayer){TACTICS.remember(p.owner.tacticalMemory,{kind:'damage',amount:actual,received:false,at:now});TACTICS.observeDamage(p.owner.tacticalMemory,victim.id,actual,now);}
  victim.damageByWeapon.set(p.weapon,(victim.damageByWeapon.get(p.weapon)||0)+actual);
  victim.hitFlash=now+90;victim.lastDamager=p.owner;victim.lastDamageAt=now;victim.regenActive=false;
  const e=victim.damageLedger.get(p.owner.id)||{damage:0,time:now};e.damage+=actual;e.time=now;victim.damageLedger.set(p.owner.id,e);
  recordDamageNumber(victim,p,actual,isHead,now);
  if(actual>0&&p.owner.isPlayer&&isEnemy(p.owner,victim))audioEvent('resolved-hit',p.owner,{ownerId:p.owner.id,targetId:victim.id,feedbackId:p.feedbackId??p.shot?.id,head:isHead,killing:victim.hp<=0,damage:actual});
  if(victim.hp<=0) killActor(victim,p.owner,p.weapon,isHead,p.travel,now);
}
function updateProjectiles(dt,now){
  for(const p of state.projectiles){
    if(p.dead)continue;const match=getMatch(p.matchId);if(!match||match.status!=='active'){p.dead=true;continue;}p.px=p.x;p.py=p.y;const nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;const segLen=Math.hypot(nx-p.x,ny-p.y);
    let bestT=1.01,best=null;
    const impact={};const ot=obstacleHitT(p.x,p.y,nx,ny,impact); if(ot!==null){bestT=ot;best='wall';}
    for(const a of actorsInMatch(p.matchId)){
      if(a===p.owner||a.dead||a.matchId!==p.matchId||!isEnemy(a,p.owner))continue;
      const t=segCircle(p.x,p.y,nx,ny,a.x,a.y,ACTOR_RADIUS);
      if(t!==null&&t<bestT){bestT=t;best=a;}
    }
    if(best){
      p.travel += segLen*bestT;p.x=lerp(p.x,nx,bestT);p.y=lerp(p.y,ny,bestT);
      if(best!=='wall'){
        const centerError=lineDistToPoint(p.px,p.py,nx,ny,best.x,best.y);
        const isHead=centerError<7.2;
        if(!p.shot.hit){p.shot.hit=true;actorMeta(p.owner,p.weapon).hits++;recordPatchEvent(p.owner,p.weapon,'hits');p.owner.stats.hits++;p.owner.weaponUsage[p.weapon].hits++;if(p.owner.career)p.owner.career.hits++;}
        const amount=damageAtRange(p,isHead);applyDamage(best,p,amount,isHead,now);
        state.particles.push({matchId:p.matchId,x:p.x,y:p.y,vx:rand(-50,50),vy:rand(-50,50),life:.18,age:0,size:2.7,color:isHead?'#ffd66b':'#ffffff'});
      }
      if(best==='wall')audioEvent('impact-'+impactMaterial(impact.solid),p.owner,{x:p.x,y:p.y});
      if(best==='wall'&&p.matchId===visibleMatchId())for(let i=0;i<3;i++)state.particles.push({matchId:p.matchId,type:i===0?'spark':'dirt',x:p.x,y:p.y,vx:rand(-45,45),vy:rand(-45,45),age:0,life:.17,size:1.8,color:i===0?'#e8d29a':'#b9ab86'});
      p.dead=true;
    } else {
      p.x=nx;p.y=ny;p.travel+=segLen;
      if(p.x<0||p.y<0||p.x>WORLD.w||p.y>WORLD.h||now-p.born>3500)p.dead=true;
    }
  }
  state.projectiles=state.projectiles.filter(p=>!p.dead);
}

// -------------------- Mobility / recovery --------------------
function updateHealthRegen(a,dt,now){
  if(a.dead||a.hp>=MAX_HP){a.regenActive=false;return;}
  if(!a.regenActive){
    if(a.hp<=REGEN_THRESHOLD && a.lastDamageAt>0 && now-a.lastDamageAt>=REGEN_DELAY_MS)a.regenActive=true;
    else return;
  }
  a.hp=Math.min(MAX_HP,a.hp+REGEN_RATE*dt);
  if(a.hp>=MAX_HP)a.regenActive=false;
}
function dashDirectionFromPlayer(a){
  let dx=(actionDown('moveRight')?1:0)-(actionDown('moveLeft')?1:0),dy=(actionDown('moveDown')?1:0)-(actionDown('moveUp')?1:0);
  if(Math.hypot(dx,dy)<.01){const m=screenToWorld(input.aimX,input.aimY);dx=m.x-a.x;dy=m.y-a.y;}
  const l=Math.hypot(dx,dy)||1;return{x:dx/l,y:dy/l};
}
function tryDash(a,dx,dy,now){
  if(!a||a.dead||now<a.dashCooldownUntil||now<a.dashUntil)return false;
  const l=Math.hypot(dx,dy);if(l<.01)return false;dx/=l;dy/=l;
  a.dashVx=dx*DASH_SPEED;a.dashVy=dy*DASH_SPEED;a.dashUntil=now+DASH_DURATION_MS;a.dashCooldownUntil=now+DASH_COOLDOWN_MS;a.lastDashAt=now;a.sprinting=false;a.ads=false;
  audioEvent('dash',a);xpEvent(a,'dash');
  for(let i=0;i<8;i++)state.particles.push({matchId:a.matchId,type:'dash',x:a.x-rand(0,26)*dx+rand(-6,6),y:a.y-rand(0,26)*dy+rand(-6,6),vx:-dx*rand(35,85),vy:-dy*rand(35,85),life:rand(.16,.30),age:0,size:rand(2.2,4.6),color:actorPresentation(a).color});
  return true;
}
function updateDashMotion(a,dt,now){
  if(now>=a.dashUntil)return false;
  moveWithCollision(a,a.dashVx*dt,a.dashVy*dt);
  a.vx=a.dashVx;a.vy=a.dashVy;
  if(Math.random()<.55)state.particles.push({matchId:a.matchId,type:'dash',x:a.x,y:a.y,vx:-a.dashVx*.06,vy:-a.dashVy*.06,life:.18,age:0,size:3.5,color:actorPresentation(a).color});
  return true;
}
// -------------------- AI
// Perception contains observations, never references to live hidden actors.
function selectTarget(a,now){
  a.memory??=new Map();const visible=[],allies=[];
  const match=getMatch(a.matchId);if(match?.mode!=='deathmatch')for(const report of TACTICS.reports(match?.teamIntentions,a,now))if(!a.memory.has(report.id)||a.memory.get(report.id).at<report.at)a.memory.set(report.id,{...report});
  for(const o of actorsInMatch(a.matchId)){
    if(o===a||o.dead&&!a.memory.has(o.id)&&!a.visibleAllies?.some(ally=>ally.id===o.id))continue;const d=dist(a,o);if(d>2200||!hasLOS(a,o))continue;
    if(o.dead){if(isAlly(o,a)&&now-o.deathAt<1200)TACTICS.remember(a.tacticalMemory,{kind:'ally_down',id:o.id,x:o.x,y:o.y,at:o.deathAt});a.memory.delete(o.id);TACTICS.forgetHealth(a.tacticalMemory,o.id);continue;}
    if(isAlly(o,a)){allies.push({id:o.id,x:o.x,y:o.y,hp:o.hp,angle:o.angle,muzzleUntil:o.muzzleUntil,at:now,reloading:!!currentWeaponState(o).reloading,retreating:['RETREAT','REGEN_HIDE','DASH_ESCAPE'].includes(o.tactic),attacked:now-o.lastDamageAt<900});continue;}
    const previous=a.memory.get(o.id),spawnSignal=o.spawnFlash>now?o.spawnFlash:previous?.spawnSignal;
    if(spawnSignal&&spawnSignal!==previous?.spawnSignal)TACTICS.forgetHealth(a.tacticalMemory,o.id);
    const observation={id:o.id,name:o.name,isPlayer:o.isPlayer,x:o.x,y:o.y,vx:o.vx,vy:o.vy,...TACTICS.estimateHealth(a.tacticalMemory,o.id,now),power:o.profile?.power||50,weapon:currentWeaponState(o).name,reloading:!!currentWeaponState(o).reloading,engaged:o.muzzleUntil>now,angle:o.angle,at:now,visible:true,confidence:1,spawnSignal};
    a.memory.set(o.id,observation);visible.push(observation);
  }
  const visibleIds=new Set(visible.map(o=>o.id));
  for(const [id,o] of a.memory){if(now-o.at>4200)a.memory.delete(id);else if(!visibleIds.has(id)){o.visible=false;o.vx=o.vy=0;o.confidence=(o.reported?.6:1)*Math.exp(-(now-o.at)/1500);Object.assign(o,TACTICS.estimateHealth(a.tacticalMemory,id,now));}}
  a.visibleEnemies=visible;a.visibleAllies=allies;
  const p=a.profile.personality,w=currentWeapon(a),score=o=>{
    const d=dist(a,o),attention=Math.abs(angleDiff(Math.atan2(a.y-o.y,a.x-o.x),o.angle))<.4;
    const nearby=visible.filter(x=>x.id!==o.id&&dist(x,o)<400).length;
    return 1.6-Math.abs(d-w.preferred*.75)/1800+(1-o.hp/MAX_HP)*(o.healthConfidence||0)*p.chasePreference+.28*(nearby===0)+.18*(o.id===a.lastDamager?.id)+.16*(o.power/100)*(attention?1:-.3)+(o.visible?.8:-.5-(1-(o.confidence||0))*.6)+.25*allies.some(ally=>dist(ally,o)<850&&Math.abs(angleDiff(Math.atan2(o.y-ally.y,o.x-ally.x),ally.angle))<.35)-.14*Math.max(0,visible.length-allies.length-1);
  };
  let best=null,bestScore=-Infinity;for(const o of a.memory.values()){const v=score(o);if(v>bestScore){best=o;bestScore=v;}}
  const old=a.target&&a.memory.get(a.target.id),committed=old&&now-a.targetChangedAt<500+p.targetPersistence*1100;
  if(old&&(committed||score(old)+.3+p.targetPersistence*.15>=bestScore))best=old;
  if(best?.id!==a.target?.id){a.aiAimReadyAt=now+a.traits.reaction*(a.execution?.reaction||1)*1000;a.targetChangedAt=now;a.cover=null;a.flankGoal=null;a.nextDecision=0;if(best)diagnostics.actions.SWITCH_TARGET=(diagnostics.actions.SWITCH_TARGET||0)+1;}
  if(best?.visible&&a.target?.id===best.id&&!a.target.visible)a.aiAimReadyAt=now+a.traits.reaction*(a.execution?.reaction||1)*1000;
  a.target=best?{...best}:null;if(best)a.targetSeenAt=best.at;
}
function obstacleSteer(a,dx,dy){
  // Repulsion can deadlock a crowded corner. Once recovery is active, follow the
  // navigator's short swept-safe direction before resuming ordinary spacing.
  if(a.stuckCount>=2&&pathClear(a.x,a.y,a.x+dx*32,a.y+dy*32,ACTOR_RADIUS))return {x:dx,y:dy};
  let sx=dx,sy=dy;
  for(const o of querySolids(a.x-90,a.y-90,a.x+90,a.y+90)){
    const cx=o.type==='circle'?o.x:clamp(a.x,o.x,o.x+o.w),cy=o.type==='circle'?o.y:clamp(a.y,o.y,o.y+o.h),length=Math.hypot(a.x-cx,a.y-cy)||1,d=length-ACTOR_RADIUS-(o.type==='circle'?o.r:0);
    if(d<32){const strength=clamp((32-d)/32,0,1)*.65;sx+=(a.x-cx)/length*strength;sy+=(a.y-cy)/length*strength;}
  }
  for(const o of actorsInMatch(a.matchId)){if(o===a||o.dead||!isAlly(o,a))continue;const d=dist(a,o);if(d>0&&d<78&&hasLOS(a,o)){sx+=(a.x-o.x)/d*(78-d)/78*.8;sy+=(a.y-o.y)/d*(78-d)/78*.8;}}
  // Several nearby walls/teammates used to sum enough repulsion to reverse a
  // collision-safe path direction. Bound that opposing component, retaining
  // forward progress and lateral spacing without reducing the movement speed.
  const forward=sx*dx+sy*dy;if(forward<.4){sx+=dx*(.4-forward);sy+=dy*(.4-forward);}
  const len=Math.hypot(sx,sy)||1,steer={x:sx/len,y:sy/len};
  if(!pathClear(a.x,a.y,a.x+steer.x*24,a.y+steer.y*24,ACTOR_RADIUS)&&pathClear(a.x,a.y,a.x+dx*24,a.y+dy*24,ACTOR_RADIUS))return {x:dx,y:dy};
  return steer;
}
function incomingDanger(a){
  let danger=0,side=null;
  for(const p of state.projectiles){
    if(p.matchId!==a.matchId||!isEnemy(p.owner,a)||Math.hypot(p.x-a.x,p.y-a.y)>420||!hasLOS(a,p))continue;
    const speed2=p.vx*p.vx+p.vy*p.vy,t=((a.x-p.x)*p.vx+(a.y-p.y)*p.vy)/speed2;
    if(t>0&&t<.12&&Math.hypot(p.x+p.vx*t-a.x,p.y+p.vy*t-a.y)<ACTOR_RADIUS+18){danger++;side={x:-p.vy,y:p.vx};}
  }return {danger,side};
}
function safeRetreatGoal(a,t){
  const learned=a.tacticalMemory?.cover.filter(c=>gameNow()-c.at<60000&&dist(a,c)<600&&!collides(c.x,c.y)&&!pointLOS(c.x,c.y,t)).at(-1);
  const cover=chooseCover(a,t);if(learned&&(!cover||dist(a,learned)<dist(a,cover)*.8)){a.cover=learned;return learned;}if(cover){a.cover=cover;return cover;}
  const angle=Math.atan2(a.y-t.y,a.x-t.x);
  for(const off of [0,.65,-.65,1.2,-1.2]){const x=clamp(a.x+Math.cos(angle+off)*400,50,WORLD.w-50),y=clamp(a.y+Math.sin(angle+off)*400,50,WORLD.h-50);if(!collides(x,y))return {x,y};}
  return a.wander;
}
function updateBuildingContext(a,now){
  const b=buildingAt(a.x,a.y);if(!b){if(a.buildingState){diagnostics.buildingExits++;a.buildingState=null;}return null;}
  const entering=a.buildingState?.id!==b.id;if(entering){diagnostics.buildingEntries++;a.buildingState={id:b.id,enteredAt:now,idleSince:now,reasonForEntering:a.tactic||'TRANSIT',failedExits:new Map(),health:a.hp,regenProgress:0,exitRoutes:b.exits};}
  const c=a.buildingState,s=currentWeaponState(a),w=currentWeapon(a),threat=(a.visibleEnemies||[]).some(t=>Math.hypot(t.x-a.x,t.y-a.y)<750),teammate=(a.visibleAllies||[]).some(t=>t.hp<75&&Math.hypot(t.x-a.x,t.y-a.y)<180);
  c.timeInsideBuilding=(now-c.enteredAt)/1000;c.currentThreat=threat;c.health=a.hp;c.ammo=s.ammo;c.regenProgress=a.regenActive?clamp(a.hp/MAX_HP,0,1):0;c.targetAvailability=!!a.target;
  c.validReason=a.regenActive||a.hp<=REGEN_THRESHOLD?'REGEN_HIDE':s.reloading||(s.reserve>0&&s.ammo<w.mag*.2)?'RELOAD':threat?'HOLD_ANGLE':teammate?'WAIT_TEAM':'TRANSIT';
  if(entering)c.reasonForEntering=c.validReason;
  if(c.validReason!=='TRANSIT')c.idleSince=now;
  c.holdUtility=2+a.profile.personality.patience*.9-Math.max(0,(now-c.idleSince)/1000)*.28;
  c.exitUtility=1.2+Math.max(0,(now-c.idleSince)/1000)*.12;
  return c;
}
function chooseBuildingExit(a,now){
  const c=a.buildingState,b=c&&floors[c.id];if(!b)return null;
  const choices=b.exits.map(e=>{const congestion=(a.visibleAllies||[]).filter(o=>Math.hypot(o.x-e.outside.x,o.y-e.outside.y)<100).length,threat=(a.visibleEnemies||[]).filter(o=>pointLOS(e.outside.x,e.outside.y,o)).length;return {e,score:dist(a,e.inside)+congestion*190+threat*250+((c.failedExits.get(e.id)||0)>now?1500:0)};}).sort((x,y)=>x.score-y.score);
  for(const {e} of choices){const path=findPath(a.x,a.y,e.inside.x,e.inside.y,a.blockedCells);if(path.length&&pathClear(e.inside.x,e.inside.y,e.outside.x,e.outside.y)&&pathClear(e.outside.x,e.outside.y,e.release.x,e.release.y)){a.exitPlan={building:b.id,exit:e.id,anchors:[e.inside,e.outside,e.release],phase:0,at:now};diagnostics.exitPlans++;return a.exitPlan;}c.failedExits.set(e.id,now+6000);}
  return null;
}
function buildingExitGoal(a,now){
  if(!a.exitPlan&&!chooseBuildingExit(a,now))return null;
  const plan=a.exitPlan;if(!plan)return null;
  while(plan.phase<plan.anchors.length&&dist(a,plan.anchors[plan.phase])<24)plan.phase++;
  if(plan.phase>=plan.anchors.length){a.exitPlan=null;return null;}return plan.anchors[plan.phase];
}
function decayPassiveCover(a,now){
  const meaningful=a.target?.visible||a.regenActive||a.hp<=REGEN_THRESHOLD||currentWeaponState(a).reloading;
  if(meaningful||!a.cover){a.coverIdleSince=now;return 0;}a.coverIdleSince??=now;return Math.max(0,(now-a.coverIdleSince)/1000-2)*.24;
}

function tacticalAssessment(a,now){
  const match=getMatch(a.matchId),w=currentWeapon(a),slot=currentWeaponState(a),ffa=match.mode==='deathmatch',participants=actorsInMatch(match.id);
  const own=ffa?a.stats.kills:match.score[a.team],opponent=ffa?Math.max(0,...participants.filter(o=>o!==a).map(o=>o.stats.kills)):match.score[1-a.team];
  let teamAssessment=null;if(!ffa){match.teamAssessments??={};let cached=match.teamAssessments[a.team];if(!cached||now>=cached.until){cached={until:now+450,...TACTICS.teamAssessment(participants.filter(o=>!o.dead&&!o.isPlayer&&o.team===a.team).map(o=>({power:o.profile.power})))};match.teamAssessments[a.team]=cached;}teamAssessment=cached;}
  const advice=TACTICS.evaluate({id:a.id,team:a.team,power:a.profile.power,style:a.traits.archetype,personality:a.profile.personality,executionError:a.execution?.error||1,teamAssessment,x:a.x,y:a.y,now,remaining:matchRemainingMs(match,now),duration:match.durationMs,targetScore:match.limit,placement:ffa?1+participants.filter(o=>o.stats.kills>own).length:undefined,ownScore:own,opponentScore:opponent,leadingScore:Math.max(own,opponent),ffa,hp:a.hp/MAX_HP,ammo:slot.ammo/w.mag,reloading:slot.reloading,dashReady:now>=a.dashCooldownUntil,weapon:w,spread:effectiveSpreadDeg(a),regenNear:a.hp<=REGEN_THRESHOLD&&(a.regenActive||now-a.lastDamageAt>4300),target:a.target,enemies:a.visibleEnemies,allies:a.visibleAllies,intentions:ffa?[]:[...match.teamIntentions.values()],memory:a.tacticalMemory});
  advice.teamAveragePower=teamAssessment?.averagePower;
  a.tacticalAdvice=advice;return advice;
}
function publishBotIntention(a,now){const match=getMatch(a.matchId);if(match.mode==='deathmatch')return;const slot=currentWeaponState(a);TACTICS.publish(match.teamIntentions,{id:a.id,team:a.team,power:a.profile.power,executionError:a.execution?.error||1,x:a.x,y:a.y,action:a.tactic,intent:a.tacticalAdvice?.intention,ready:a.hp>80&&!slot.reloading&&slot.ammo>currentWeapon(a).mag*.25,enemies:a.visibleEnemies},now);}
function decideBot(a,now){
  const building=updateBuildingContext(a,now),passiveDecay=decayPassiveCover(a,now);
  const advice=tacticalAssessment(a,now),t=a.target,p=a.profile.personality,s=currentWeaponState(a),w=currentWeapon(a),hp=a.hp/MAX_HP,familiar=(botData(a).familiarity[s.name]||0)/100;
  const form=botData(a).recentForm/10,risk=clamp(p.riskTolerance+form*.08+a.matchVariance,0,1),dash=now>=a.dashCooldownUntil,low=hp<p.retreatThreshold;
  if(!t){if((a.hp<=REGEN_THRESHOLD&&(p.riskTolerance<.7||now-a.lastDamageAt>4300))||a.regenActive){a.tactic='REGEN_HIDE';a.decisionReason='No current sighting: staying protected until recovery';a.moveGoal=a.cover||{x:a.x,y:a.y};return;}if(a.exitPlan||(building&&building.exitUtility>building.holdUtility)){const exit=buildingExitGoal(a,now);if(exit){a.tactic='EXIT';a.decisionReason='Leaving '+floors[building?.id??a.exitPlan.building].label+': no recovery, threat or team reason to hold';a.moveGoal=exit;a.cover=null;return;}}a.tactic='REPOSITION';a.decisionReason='No sighting: searching lanes';a.cover=null;
    if(now>a.wander.until||dist(a,a.wander)<90)a.wander={x:rand(120,WORLD.w-120),y:rand(120,WORLD.h-120),until:now+rand(4500,7500)};
    const ally=a.visibleAllies?.slice().sort((x,y)=>dist(a,x)-dist(a,y))[0],regroup=ally&&(a.tacticalMemory.isolation>.2||advice.intention==='DEFEND LEAD');
    a.moveGoal=regroup?{x:ally.x+(a.id%2?110:-110),y:ally.y}:a.wander;if(regroup){a.tactic='REGROUP';a.decisionReason='Rejoining observed support';}if(s.ammo<w.mag*(.5+p.reloadDiscipline*.2))startReload(a,now);publishBotIntention(a,now);return;
  }
  const d=dist(a,t),los=t.visible&&pointLOS(a.x,a.y,t),allies=a.visibleAllies||[],enemies=a.visibleEnemies||[],advantage=allies.length+1-enemies.length,pressure=Math.max(0,-advantage);
  const enemyWeapon=WEAPONS[t.weapon],enemyThreat=enemyWeapon?clamp(enemyWeapon.damage/Math.max(.1,enemyWeapon.hitSpeed)/180,0,1)*(d<enemyWeapon.preferred?1:.4):.4;
  const crowd=allies.filter(o=>Math.hypot(o.x-a.x,o.y-a.y)<250).length,attention=Math.abs(angleDiff(Math.atan2(a.y-t.y,a.x-t.x),t.angle))<.45;
  const range=s.name==='P90'?botTacticalRange(s.name)*(.9+familiar*.1):w.preferred*(.78+familiar*.12),inRange=1-clamp(Math.abs(d-range)/Math.max(400,range),0,1),ammo=s.ammo/w.mag,regenNear=a.hp<=REGEN_THRESHOLD&&(a.regenActive||now-a.lastDamageAt>4300),incoming=incomingDanger(a);
  const utilities={
    FIGHT:los?2.2+inRange*.9+ammo*.25-pressure*.3+(a.traits.confidence-.5)*.15:0,
    PUSH:!low?1.5+(d>range?1.25:0)+p.aggression*.6+Math.max(0,advantage)*.15:0,
    HOLD:los?1.1+p.patience*.9+inRange*.6+(['Anchor','Marksman'].includes(a.traits.archetype)?.65:0):.2,
    PEEK:los?1.6+p.coverPreference*1.8+(low?.3:0)+(attention?.25:0)+enemyThreat*.12:.2,
    FLANK:1+p.flankPreference*1.8+crowd*.5+(attention?.25:0)+(los?0:.25),
    RETREAT:low?2.5+(1-risk)*1.4+pressure*.5+enemyThreat*.25+(d<range*.5?.8:0):pressure>1?2.6:0,
    RELOAD:!s.reloading&&s.reserve>0?(ammo===0?6:ammo<.35?2.4+p.reloadDiscipline+(los?-1:.8):0):0,
    REPOSITION:!los?2.7:1+(crowd>1?.7:0),
    DASH_ATTACK:dash&&los&&!low&&d>range&&d<900?3.0+p.dashAggression+(t.hp<80&&(t.healthConfidence||0)>.3?.6:0):0,
    DASH_ESCAPE:dash&&(low||incoming.danger)?2.4+(low?1.2:0)+incoming.danger*.8:0,
    REGEN_HIDE:regenNear?4.4+(a.regenActive?1.5:0)-risk*.8:0,
    CHASE:0
  };
  if(s.name==='P90'){
    if(d<4*TILE){utilities.REPOSITION+=1.5;utilities.FIGHT-=.55;}
    if(d>18*TILE){utilities.PUSH+=1.2;utilities.HOLD-=.6;}
    if(d>=7*TILE&&d<=12*TILE)utilities.FIGHT+=.35;
    if(d-DASH_DISTANCE<7*TILE)utilities.DASH_ATTACK=0;
  }
  for(const [key,value] of Object.entries(advice.utilities))utilities[key]=(utilities[key]||0)+value;
  utilities.HOLD-=passiveDecay;utilities.PEEK-=passiveDecay*.65;utilities.REPOSITION+=passiveDecay*.8;utilities.EXIT=building&&building.validReason==='TRANSIT'?building.exitUtility+passiveDecay:0;
  // Scheduled, bounded judgement noise and commitment never alter mechanics.
  const selection=TACTICS.chooseAction(utilities,{current:a.tactic,power:a.profile.power,executionError:a.execution?.error||1,memory:a.tacticalMemory,now,hp,ammo,regenActive:a.regenActive,pressure,targetId:t.id,persistence:p.targetPersistence},Math.random);let action=selection.action;a.utilityScores=selection.top;
  if(action!==a.tactic){if(a.tactic==='CHASE'&&now-(a.chaseStartedAt||0)>1000)TACTICS.remember(a.tacticalMemory,{kind:'chase_end',success:false});if(action==='CHASE')a.chaseStartedAt=now;a.actionUntil=selection.commitUntil;a.tactic=action;diagnostics.actions[action]=(diagnostics.actions[action]||0)+1;}
  a.decisionReason=`${action}: ${los?'visible':'remembered'} target, ${Math.round(d)} range, ${Math.round(a.hp)} HP, ${advantage>=0?'+':''}${advantage} local numbers`;
  let goal=action==='EXIT'?buildingExitGoal(a,now):['SUPPORT','REGROUP'].includes(action)?advice.goal:action==='WAIT_SUPPORT'?{x:a.x,y:a.y}:null;
  a.decisionReason+=' · '+advice.notes.join(', ');if(action!=='EXIT'&&a.target?.visible)a.exitPlan=null;
  if(['RETREAT','REGEN_HIDE','DASH_ESCAPE','RELOAD'].includes(action)){
    if(action==='RELOAD')startReload(a,now);
    if(!a.cover||now>a.coverUntil){goal=safeRetreatGoal(a,t);a.coverUntil=now+2300;}else goal=a.cover;
    if(action==='DASH_ESCAPE'&&a.cover&&dist(a,a.cover)<45)goal=a.cover.escape||a.cover;
    if(action==='DASH_ESCAPE'&&now>=a.dashExecuteAt){const dir=incoming.side||{x:goal.x-a.x,y:goal.y-a.y};if(pathClear(a.x,a.y,a.x+dir.x/Math.hypot(dir.x,dir.y)*DASH_DISTANCE,a.y+dir.y/Math.hypot(dir.x,dir.y)*DASH_DISTANCE))tryDash(a,dir.x,dir.y,now);a.dashExecuteAt=now+600;}
  }else if(action==='PEEK'){
    if(!a.cover?.peek||now>a.coverUntil){a.cover=chooseCover(a,t);a.coverUntil=now+4000;a.coverState='MOVING_TO_COVER';a.coverStateUntil=0;}
    if(a.cover){
      const peeks=a.cover.peek,atHide=dist(a,a.cover)<38;
      if(a.coverState==='MOVING_TO_COVER'&&atHide){a.coverState='HOLDING_COVER';a.coverStateUntil=now+350+p.patience*300;}
      if(now>=a.coverStateUntil&&a.coverState==='HOLDING_COVER'){a.peekSide*=-1;a.coverState=a.peekSide>0?'PEEKING_LEFT':'PEEKING_RIGHT';a.peekArrived=false;a.coverStateUntil=now+3000;}
      if(a.coverState.startsWith('PEEKING')&&!a.peekArrived&&dist(a,peeks[a.peekSide>0?0:peeks.length-1])<45){a.peekArrived=true;a.coverStateUntil=now+550+(1-a.traits.skill)*500;}
      if(now>=a.coverStateUntil&&a.coverState.startsWith('PEEKING')){a.coverState='DUCKING';a.coverStateUntil=now+650;}
      if(now>=a.coverStateUntil&&a.coverState==='DUCKING'&&atHide){a.coverState='HOLDING_COVER';a.coverStateUntil=now+300;}
      goal=a.coverState.startsWith('PEEKING')?peeks[a.peekSide>0?0:peeks.length-1]:a.cover;
    }else {action='FIGHT';a.tactic='FIGHT';a.cover=null;}
  }
  if(!goal&&(action==='FLANK'||action==='CHASE'&&advice.chase.alternate)){
    if(!a.flankGoal||dist(a,a.flankGoal)<80||now>a.flankUntil){a.flankGoal=makeFlankGoal(a,t);a.flankUntil=now+3500;}goal=a.flankGoal;
  }
  if(!goal){
    const angle=Math.atan2(t.y-a.y,t.x-a.x);
    if(s.name==='P90'&&d<4*TILE&&action==='REPOSITION'){
      const step=Math.max(250,7*TILE-d);
      goal=[0,.55,-.55,1,-1].map(offset=>({x:clamp(a.x-Math.cos(angle+offset)*step,45,WORLD.w-45),y:clamp(a.y-Math.sin(angle+offset)*step,45,WORLD.h-45)})).find(point=>!collides(point.x,point.y)&&dist(point,t)>d+35)||safeRetreatGoal(a,t);
      a.decisionReason='REPOSITION: P90 too close; opening a ranged SMG sightline';
    }else if(['PUSH','CHASE','DASH_ATTACK','REPOSITION'].includes(action)){
      const standOff=s.name==='P90'?clamp(range,7*TILE,12*TILE):Math.min(range*.65,d*.3);
      goal={x:t.x-Math.cos(angle)*standOff,y:t.y-Math.sin(angle)*standOff};
      if(action==='DASH_ATTACK'&&(s.name!=='P90'||d-DASH_DISTANCE>=7*TILE)&&now>=a.dashExecuteAt&&pathClear(a.x,a.y,a.x+Math.cos(angle)*DASH_DISTANCE,a.y+Math.sin(angle)*DASH_DISTANCE)){tryDash(a,Math.cos(angle),Math.sin(angle),now);a.dashExecuteAt=now+700;}
    }else if(d<range*.5){goal={x:a.x-Math.cos(angle)*250,y:a.y-Math.sin(angle)*250};}
    else if(action==='HOLD'){goal={x:a.x,y:a.y};}
    else {if(now>a.strafeUntil){a.strafeDir*=Math.random()<.35?-1:1;a.strafeUntil=now+rand(1400,2600);}goal={x:a.x+Math.cos(angle+Math.PI/2*a.strafeDir)*150,y:a.y+Math.sin(angle+Math.PI/2*a.strafeDir)*150};}
  }
  if(goal&&action==='FLANK'){const angle=Math.atan2(t.y-a.y,t.x-a.x),side=a.id%2?1:-1;goal={x:goal.x+Math.cos(angle+side*Math.PI/2)*90,y:goal.y+Math.sin(angle+side*Math.PI/2)*90};}
  if(goal&&['PUSH','CHASE','DASH_ATTACK'].includes(action)&&TACTICS.routePenalty(a.tacticalMemory,a,goal,now)>.9){
    if(now>=(a.learnedApproachUntil||0)||a.learnedApproachTarget!==t.id){const alternate=makeFlankGoal(a,t);a.learnedApproach=alternate&&!collides(alternate.x,alternate.y)&&TACTICS.routePenalty(a.tacticalMemory,a,alternate,now)<TACTICS.routePenalty(a.tacticalMemory,a,goal,now)?alternate:null;a.learnedApproachUntil=now+2500;a.learnedApproachTarget=t.id;}
    if(a.learnedApproach){goal=a.learnedApproach;a.decisionReason+=' · alternate failed approach';}
  }
  if(action==='PEEK'&&a.cover&&now-(a.lastCoverLearning||0)>5000){TACTICS.remember(a.tacticalMemory,{kind:'cover',x:a.cover.x,y:a.cover.y,at:now});a.lastCoverLearning=now;}
  if(goal){goal={x:clamp(goal.x,45,WORLD.w-45),y:clamp(goal.y,45,WORLD.h-45)};if(!collides(goal.x,goal.y))a.moveGoal=goal;else {const idx=nearestNav(goal.x,goal.y);if(idx!==null)a.moveGoal=navPoint(idx);}}
  publishBotIntention(a,now);
}
function updateBot(a,dt,now){
  if(a.dead)return;updateHealthRegen(a,dt,now);
  if(now>=a.nextThink){selectTarget(a,now);a.nextThink=now+rand(180,280)*(a.execution?.decision||1);}
  if(now>=a.nextDecision){decideBot(a,now);a.nextDecision=now+rand(330,520)*(a.execution?.decision||1);}
  updateAds(a,botWantsAds(a),dt,now);if(a.ads)diagnostics.botAdsSeconds+=dt;
  let s=currentWeaponState(a),w=WEAPONS[s.name],t=a.target;
  if(t){
    const d=dist(a,t),primary=a.slots[0];
    if(a.currentSlot===0&&(s.reloading||s.ammo===0)&&d<550&&a.slots[1].ammo>0)a.currentSlot=1;
    else if(a.currentSlot===1&&!primary.reloading&&primary.ammo>0&&(d>500||s.ammo===0))a.currentSlot=0;
    s=currentWeaponState(a);w=WEAPONS[s.name];
    if(now>=a.nextAim){
      const lead=clamp(d/(w.speed*TILE),0,.48)*(.4+.6*a.traits.skill);
      a.aimPoint={x:t.x+t.vx*lead,y:t.y+t.vy*lead};
      a.aimNoise=rand(-1,1)*(1-a.traits.accuracy)*(a.execution?.error||1)*7.5*Math.PI/180;a.nextAim=now+rand(75,135);
    }
    const desired=Math.atan2(a.aimPoint.y-a.y,a.aimPoint.x-a.x),turnRate=4.2+5*a.traits.accuracy;
    a.aiAim+=clamp(angleDiff(desired+a.aimNoise,a.aiAim),-turnRate*dt,turnRate*dt);a.angle=a.aiAim;
    let gate=true;
    if(t.isPlayer&&state.mode==='play'){const inView=botIsInsidePlayerView(a);if(inView&&!a.wasInPlayerView)a.playerViewReadyAt=now+a.traits.reaction*(a.execution?.reaction||1)*1000;a.wasInPlayerView=inView;gate=inView&&now>=a.playerViewReadyAt;}
    const hiding=['REGEN_HIDE','RETREAT','RELOAD'].includes(a.tactic)||(a.tactic==='PEEK'&&!a.coverState?.startsWith('PEEKING'));
    // Fire at a recent visible observation, subject to the same geometry and camera rule.
    const p90Window=s.name!=='P90'||d<=16*TILE||(d<=18*TILE&&['HOLD','PEEK'].includes(a.tactic));
    if(!hiding&&p90Window&&t.visible&&now-t.at<300&&pointLOS(a.x,a.y,t)&&gate&&now>=a.aiAimReadyAt&&Math.abs(angleDiff(desired,a.aiAim))<.065)fire(a,a.aiAim,now);
  }
  if(s.ammo===0)startReload(a,now);
  if(!updateDashMotion(a,dt,now)){
    const holding=['HOLD','REGEN_HIDE','WAIT_SUPPORT'].includes(a.tactic)&&a.moveGoal&&dist(a,a.moveGoal)<40;let dir={x:0,y:0};if(!holding&&a.moveGoal&&dist(a,a.moveGoal)>22)dir=navigateToward(a,a.moveGoal,now);
    if(dir.x||dir.y)dir=obstacleSteer(a,dir.x,dir.y);
    if(holding||!a.moveGoal||dist(a,a.moveGoal)<=22){a.stuckSample=null;a.stuckCount=0;a.timeWithoutMeaningfulProgress=0;}
    smoothBotMove(a,holding?0:dir.x,holding?0:dir.y,BOT_SPEED,dt);
    if(!t&&Math.hypot(a.vx,a.vy)>10)a.angle=Math.atan2(a.vy,a.vx);
  }
  a.stats.timeAlive+=dt;a.career.timeAlive+=dt;recordEquipped(a,dt);
  a.recoil=Math.max(0,a.recoil-dt*(s.name==='War Head LMG'?4.4:7));
}

function botIsInsidePlayerView(bot,pad=18){const p=getPlayer();if(!p||state.mode!=='play'||bot.matchId!==p.matchId)return true;const screen=worldToScreen(bot.x,bot.y);return screen.x>=pad&&screen.y>=pad&&screen.x<=cssW-pad&&screen.y<=cssH-pad;}
function smoothBotMove(a,mx,my,speed,dt){const k=1-Math.exp(-dt*8.5);a.desiredVx=mx*speed;a.desiredVy=my*speed;a.vx=lerp(a.vx,a.desiredVx,k);a.vy=lerp(a.vy,a.desiredVy,k);moveWithCollision(a,a.vx*dt,a.vy*dt);}

// -------------------- Player --------------------
// ADS is a shared gameplay modifier, independent of all base weapon balance constants.
function adsZoomFor(name){return name==='LW Tundra'?1.18:name==='LR-762'?1.15:['Pump Shotgun','Auto 12','SPAS-12','9mm','X16','X-16 Auto'].includes(name)?1.08:['SMG-9','P90','War Head LMG'].includes(name)?1.10:1.12;}
function updateAds(a,wants,dt,now){a.ads=!!(wants&&!a.dead&&!a.sprinting&&now>=a.dashUntil&&!currentWeaponState(a).reloading);a.adsBlend=lerp(a.adsBlend||0,a.ads?1:0,1-Math.exp(-dt*12));}
function botWantsAds(a){const t=a.target;if(!t||!t.visible)return false;const d=dist(a,t),name=currentWeaponState(a).name,w=currentWeapon(a),style=a.traits.archetype;
  if(d<200||a.sprinting||gameNow()<a.dashUntil||['PUSH','CHASE','DASH_ATTACK','DASH_ESCAPE','RETREAT'].includes(a.tactic))return false;
  const precision=['LW Tundra','LR-762'].includes(name),threshold=(style==='Rusher'?1.00:style==='Flanker'?.8:.52)*w.preferred;
  return (precision||d>Math.max(300,threshold))&&(['HOLD','PEEK','FIGHT','SUPPORT','WAIT_SUPPORT'].includes(a.tactic)||Math.hypot(a.vx,a.vy)<90);
}
function viewBounds(){const z=state.camera.zoom||1;return {x:state.camera.x-cssW/(2*z),y:state.camera.y-cssH/(2*z),w:cssW/z,h:cssH/z};}
function screenToWorld(sx,sy){if(CONFIG.viewMode==='2.5D'&&window.SAR25D?.screenToWorld){const hit=window.SAR25D.screenToWorld(sx,sy);if(hit)return hit;}const z=state.camera.zoom||1;return {x:(sx-cssW/2)/z+state.camera.x,y:(sy-cssH/2)/z+state.camera.y};}
function worldToScreen(x,y){const z=state.camera.zoom||1;return {x:(x-state.camera.x)*z+cssW/2,y:(y-state.camera.y)*z+cssH/2};}
function visibleRect(x,y,w,h,pad=100){const v=viewBounds(),p=pad/(state.camera.zoom||1);return x+w>=v.x-p&&y+h>=v.y-p&&x<=v.x+v.w+p&&y<=v.y+v.h+p;}
function updateCamera(dt){
  const focus=getFocusActor()||actorsInMatch(0).find(a=>!a.dead);if(!focus)return;
  const player=state.mode==='play'&&focus.isPlayer,blend=player?(focus.adsBlend||0):0;
  const fit=Math.max(1,cssW/(WORLD.w+2*WORLD_PAD),cssH/(WORLD.h+2*WORLD_PAD));
  const tactical=state.mode==='spectate'&&CONFIG.spectatorCamera==='TACTICAL';
  const wantedZoom=tactical?Math.min(cssW/(WORLD.w+200),cssH/(WORLD.h+200)):fit*(1+(adsZoomFor(currentWeaponState(focus).name)-1)*blend);
  state.camera.zoom=lerp(state.camera.zoom||1,wantedZoom,1-Math.exp(-dt*10));
  let bx=0,by=0;if(player&&CONFIG.cameraAimBias&&!focus.dead){const dx=input.aimX-cssW/2,dy=input.aimY-cssH/2,len=Math.hypot(dx,dy),cap=22+blend*14;if(len>80){bx=dx/len*Math.min(cap,len*.045);by=dy/len*Math.min(cap,len*.045);}}
  const halfW=cssW/(2*state.camera.zoom),halfH=cssH/(2*state.camera.zoom);
  const loX=Math.max(45,halfW-WORLD_PAD),hiX=Math.min(WORLD.w-45,WORLD.w+WORLD_PAD-halfW),loY=Math.max(45,halfH-WORLD_PAD),hiY=Math.min(WORLD.h-45,WORLD.h+WORLD_PAD-halfH);
  const tx=tactical?WORLD.w/2:loX<=hiX?clamp(focus.x+bx,loX,hiX):WORLD.w/2,ty=tactical?WORLD.h/2:loY<=hiY?clamp(focus.y+by,loY,hiY):WORLD.h/2,k=1-Math.exp(-dt*(player?24:state.mode==='spectate'?8:2.5));
  state.camera.x=lerp(state.camera.x,tx,k);state.camera.y=lerp(state.camera.y,ty,k);
}
function recoilEnvelope(a,now){const s=currentWeaponState(a),w=WEAPONS[s.name],age=Math.max(0,(now-(s.lastBullet??s.lastShot))/1000),window=Math.min(w.hitSpeed*.82,s.name==='War Head LMG'?.38:.24);if(age>window)return 0;const t=age/window;return t<.13?Math.sin(t/.13*Math.PI/2):Math.pow(1-(t-.13)/.87,2);}
function reloadPhase(s,now){return s.reloading?clamp(1-(s.reloadEnd-now)/(WEAPONS[s.name].reload*1000),0,1):0;}
function magazineMotion(t){if(t<=.16)return 0;if(t<.36)return (t-.16)/.20*22;if(t<.56)return 22;if(t<.78)return (1-(t-.56)/.22)*22;return 0;}
function weaponRig(a,now){const s=currentWeaponState(a),name=s.name,r=reloadPhase(s,now),v=a.visual||{},ads=a.adsBlend||0,sprint=v.sprint||0,kick=recoilEnvelope(a,now),gait=v.phase||0;
  const reloadLean=r?Math.sin(Math.PI*r):0,heavy=name==='War Head LMG',sway=Math.sin(gait*.5)*(heavy?.018:.028)*(v.move||0)*(1-ads*.8);
  return {name,reload:r,kick,x:20+ads*3-sprint*8,y:sprint*5+reloadLean*7,angle:sprint*.34+reloadLean*.18-kick*(name==='LW Tundra'?.10:heavy?.045:.065)+sway};
}
function gripAnchors(rig){const name=rig.name,k=weaponKick(name,rig.kick),r=rig.reload,pistol=WEAPONS[name].type==='sidearm';
  let rear={x:pistol?13:name==='LW Tundra'?4:name==='Pump Shotgun'?3:name==='P90'?9:6,y:pistol?11:name==='P90'?9:12};
  let support={x:pistol?19:name==='P90'?28:name==='LW Tundra'?38:name==='Pump Shotgun'?35:36,y:pistol?5:name==='P90'?5:4};
  if(r){if(r<.78)support={x:name==='P90'?13:22,y:name==='P90'?-10-magazineMotion(r)*.65:10+magazineMotion(r)};else if(r<.92)support={x:12,y:-5};}
  const transform=p=>({x:rig.x+Math.cos(rig.angle)*(p.x-k)-Math.sin(rig.angle)*p.y,y:rig.y+Math.sin(rig.angle)*(p.x-k)+Math.cos(rig.angle)*p.y});
  return {rear:transform(rear),support:transform(support)};
}
function updatePresentation(a,dt,now,oldX,oldY){
  a.actualDisplacement={x:a.x-oldX,y:a.y-oldY};const speed=Math.hypot(a.x-oldX,a.y-oldY)/Math.max(.001,dt),moving=speed>8;
  a.visual??={phase:0,move:0,sprint:0,turn:a.angle,lower:a.angle,bob:0,settle:0};const v=a.visual,k=1-Math.exp(-dt*10);
  v.move=lerp(v.move,clamp(speed/PLAYER_SPEED,0,1.5),k);v.sprint=lerp(v.sprint,a.sprinting?1:0,k);const oldStep=Math.floor(v.phase/Math.PI);v.phase+=speed*dt*.052;if(moving&&!a.dead&&now>=a.dashUntil&&Math.floor(v.phase/Math.PI)>oldStep)audioEvent('footstep-'+footstepSurface(a),a);
  v.turn+=angleDiff(a.angle,v.turn)*(1-Math.exp(-dt*23));const lowerTarget=moving?Math.atan2(a.y-oldY,a.x-oldX):a.angle;v.lower+=angleDiff(lowerTarget,v.lower)*(1-Math.exp(-dt*(moving?7:3)));
  v.bob=Math.sin(v.phase*2)*Math.min(1.5,v.move)*(1-(a.adsBlend||0)*.6);v.settle=lerp(v.settle,moving?0:1,1-Math.exp(-dt*6));
  a.motionStates=[];if(a.dead)a.motionStates.push('DEAD');else{a.motionStates.push(moving?'MOVING':'IDLE');if(a.sprinting)a.motionStates.push('SPRINTING');if(a.ads)a.motionStates.push('ADS');if(now<a.dashUntil)a.motionStates.push('DASHING');if(currentWeaponState(a).reloading)a.motionStates.push('RELOADING');else if(now-currentWeaponState(a).lastShot<WEAPONS[currentWeaponState(a).name].hitSpeed*1000)a.motionStates.push('FIRING');}
}

function effectiveSpreadDeg(a,w=currentWeapon(a)){
  // Full cone width in degrees. Movement selects an exact weapon value;
  // only the existing ADS transition interpolates. Aim position never enters this calculation.
  const hip=(a.sprinting||gameNow()<a.dashUntil)?w.sprintSpread:Math.hypot(a.vx||0,a.vy||0)>28?w.walkSpread:w.spread;
  return lerp(hip,w.adsSpread,clamp(a.adsBlend||0,0,1));
}
const RETICLE_PIXELS_PER_DEGREE=3;
function updateCrosshairVisual(a){
  const c=document.getElementById('crosshair');if(!c||!a)return;const deg=effectiveSpreadDeg(a);
  // Fixed screen-space conversion: aim position only moves the reticle, never its arms.
  const realGap=clamp(3+deg*RETICLE_PIXELS_PER_DEGREE,4,60);c.style.setProperty('--gap',realGap.toFixed(2)+'px');c.dataset.spread=deg.toFixed(4);c.style.left=input.aimX+'px';c.style.top=input.aimY+'px';c.classList.toggle('sprinting',!!a.sprinting);c.classList.toggle('ads',!!a.ads);
}
function updatePlayer(a,dt,now){
  if(!a||a.dead)return;
  updateHealthRegen(a,dt,now);
  if(updateDashMotion(a,dt,now)){updateAds(a,false,dt,now);a.stats.timeAlive+=dt;a.career.timeAlive+=dt;const wn=currentWeaponState(a).name;recordEquipped(a,dt);a.recoil=Math.max(0,a.recoil-dt*7);updateCrosshairVisual(a);return;}
  const s=currentWeaponState(a);if(s.reloading&&now>=s.reloadEnd)finishReload(s,a);
  const controls=gameplayMouseActive();
  let mx=(controls&&actionDown('moveRight')?1:0)-(controls&&actionDown('moveLeft')?1:0),my=(controls&&actionDown('moveDown')?1:0)-(controls&&actionDown('moveUp')?1:0);
  const l=Math.hypot(mx,my);if(l){mx/=l;my/=l;}
  a.sprinting=!!(l&&actionDown('sprint'));updateAds(a,controls&&actionDown('ads')&&!input.fullMap,dt,now);
  const speed=a.speed*(a.sprinting?1.48:1);
  a.vx=mx*speed;a.vy=my*speed;moveWithCollision(a,a.vx*dt,a.vy*dt);a.stats.timeAlive+=dt;a.career.timeAlive+=dt;
  const m=screenToWorld(input.aimX,input.aimY);a.angle=Math.atan2(m.y-a.y,m.x-a.x);
  if(controls&&input.mouseDown&&currentWeapon(a).auto)fire(a,a.angle,now);
  if(controls&&actionDown('reload')) startReload(a,now);
  {const wn=currentWeaponState(a).name;recordEquipped(a,dt);}
  a.recoil=Math.max(0,a.recoil-dt*7);
  updateCrosshairVisual(a);
}

// -------------------- Update --------------------
function updateLobbyUi(){
  updateProgressionUi();
  ensureSeasonFresh(wallNow());
  const season=SAVE.seasons.current,leader=seasonWinnerFor(season),last=SAVE.seasons.history[0]?.winner||null;
  const sn=document.getElementById('seasonNumber');if(sn)sn.textContent=`SEASON ${season.number}`;
  const sr=document.getElementById('seasonRemaining');if(sr)sr.textContent=formatSeasonRemaining(season.endAt-wallNow());
  const sl=document.getElementById('seasonLeader');if(sl)sl.textContent=leader?.name||'—';
  const sc=document.getElementById('seasonChampion');if(sc)sc.textContent=last?`${last.name} • S${SAVE.seasons.history[0].number}`:'NO CHAMPION YET';
  const detail=document.getElementById('queueDetail');
  if(detail&&state.queued){const deadlines=state.matches.slice(0,MATCH_COUNT).filter(m=>m?.status==='cooldown').map(slotCooldownRemaining);detail.textContent=deadlines.length?'Next available slot in '+Math.ceil(Math.min(...deadlines)/1000)+'s.':'Starting the next available match…';}
}
function update(dt,now){
  initializeLeague();
  updateOfficialSlots();
  if(state.paused)return;
  if(state.playerMatchId!==null){
    const playerMatch=getMatch(state.playerMatchId);
    if(playerMatch?.status==='countdown'){
      const left=state.countdownUntil-now,overlay=document.getElementById('matchCountdown');
      if(left<=0){audioEvent('fight',getPlayer());playerMatch.status='active';playerMatch.startedAt=now;state.fightUntil=now+650;if(overlay){overlay.classList.add('fight');const number=overlay.querySelector('strong'),label=overlay.querySelector('span');if(number)number.textContent='FIGHT';if(label)label.textContent='';}}
      else {const count=Math.ceil(left/1000);if(state.audioCountdown!==count){state.audioCountdown=count;audioEvent('countdown',getPlayer());}if(overlay){const number=overlay.querySelector('strong');if(number)number.textContent=String(count);}}
    }
    if(state.fightUntil&&now>=state.fightUntil){document.getElementById('matchCountdown')?.classList.add('hidden');state.fightUntil=0;}
  }
  updateMatchClocks(now);updateFinalCountdown(now);
  if(state.playerMatchId!==null&&getMatch(state.playerMatchId)?.status==='active') state.elapsed+=dt;
  for(const a of state.actors){
    if(a.matchId===null)continue;
    const match=getMatch(a.matchId);if(!match||match.status!=='active'){a.vx=a.vy=0;continue;}
    if(a.career)a.career.timePlayed+=dt;
    if(a.dead){
      a.ads=false;a.adsBlend=lerp(a.adsBlend||0,0,1-Math.exp(-dt*12));a.motionStates=['DEAD'];a.vx=a.vy=0;
      if(now>=a.respawnAt)respawnActor(a,false);
      continue;
    }
    for(const slot of a.slots){updateHandlingAudio(a,slot,now);if(slot.reloading&&now>=slot.reloadEnd)finishReload(slot,a);}
    const oldX=a.x,oldY=a.y;if(a.isPlayer)updatePlayer(a,dt,now); else updateBot(a,dt,now);effectiveSpreadDeg(a);updateBurst(a,now);updatePresentation(a,dt,now,oldX,oldY);
  }
  updateProjectiles(dt,now);window.SARAudio?.flush();if(state.matches.some(m=>m?.status==='active'&&m.eligible&&m.mode==='tdm')){SAVE.patchState.observedSeconds+=dt;const r=revisionSample();if(r!==SAVE.patchState)r.observedSeconds+=dt;}diagnostics.maxParticles=Math.max(diagnostics.maxParticles,state.particles.length);
  for(const p of state.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;}
  state.particles=state.particles.filter(p=>p.age<p.life&&p.matchId===visibleMatchId()).slice(-220);
  updateCamera(dt);
  if(state.playerMatchId!==null && now-state.lastHud>100){updateHud(now);state.lastHud=now;}
  if(state.mode==='spectate'&&now-state.lastHud>100){updateSpectatorHud(now);state.lastHud=now;}
  if(now-state.lastLobbyUi>1000){ensureSeasonFresh(wallNow());updateLobbyUi();updateLoadoutMeta();state.lastLobbyUi=now;}
}

// -------------------- Rendering --------------------

function streetEdgeSegments(r,horizontal){
  let spans=[[horizontal?r.x:r.y,horizontal?r.x+r.w:r.y+r.h]];
  for(const other of roads){if(other===r||other.horizontal===r.horizontal)continue;const lo=horizontal?other.x:other.y,hi=lo+(horizontal?other.w:other.h);spans=spans.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([x,y])=>y>x));}
  return spans;
}
function drawDistrictCar(o,low=false){
  if(!low){ctx.fillStyle='#bac1ac';ctx.fillRect(o.x-12,o.y-10,o.w+24,o.h+20);ctx.strokeStyle='#dde0c9';ctx.lineWidth=2;ctx.strokeRect(o.x-8,o.y-7,o.w+16,o.h+14);}
  const palette=['#677f8b','#b29369','#70856b','#9b7470'],c=palette[o.tone%4||0];
  rr(ctx,o.x+5,o.y+7,o.w,o.h,9,'rgba(28,40,35,.17)');rr(ctx,o.x,o.y,o.w,o.h,9,c,'#42514b',1.8);
  rr(ctx,o.x+o.w*.25,o.y+5,o.w*.46,o.h-10,4,'#344b51');ctx.fillStyle='rgba(185,207,207,.55)';ctx.fillRect(o.x+o.w*.3,o.y+7,5,o.h-14);
  if(!low){ctx.fillStyle='#1e2d2a';for(const x of [o.x+17,o.x+o.w-26]){ctx.fillRect(x,o.y-3,17,5);ctx.fillRect(x,o.y+o.h-2,17,5);}ctx.fillStyle='#eee8b1';ctx.fillRect(o.x+o.w-4,o.y+7,3,8);ctx.fillRect(o.x+o.w-4,o.y+o.h-15,3,8);}
}
function drawOuterDistrict(view){
  ctx.save();ctx.beginPath();ctx.rect(-WORLD_PAD,-WORLD_PAD,WORLD.w+WORLD_PAD*2,WORLD.h+WORLD_PAD*2);ctx.rect(0,0,WORLD.w,WORLD.h);ctx.clip('evenodd');
  // Repeating residential streets connect the active district to the surrounding neighborhood.
  ctx.fillStyle='#a1ada1';
  for(let x=-WORLD_PAD+570;x<WORLD.w+WORLD_PAD;x+=620)ctx.fillRect(x,-WORLD_PAD,50,WORLD.h+WORLD_PAD*2);
  for(let y=-WORLD_PAD+480;y<WORLD.h+WORLD_PAD;y+=540)ctx.fillRect(-WORLD_PAD,y,WORLD.w+WORLD_PAD*2,60);
  ctx.fillStyle='#82918b';for(let x=-WORLD_PAD+580;x<WORLD.w+WORLD_PAD;x+=620)ctx.fillRect(x,-WORLD_PAD,30,WORLD.h+WORLD_PAD*2);
  for(let y=-WORLD_PAD+490;y<WORLD.h+WORLD_PAD;y+=540)ctx.fillRect(-WORLD_PAD,y,WORLD.w+WORLD_PAD*2,40);
  for(const r of roads){ctx.fillStyle='#93a19b';ctx.fillRect(r.x-(r.horizontal?WORLD_PAD:0),r.y-(r.horizontal?0:WORLD_PAD),r.w+(r.horizontal?WORLD_PAD*2:0),r.h+(r.horizontal?0:WORLD_PAD*2));}
  for(const o of outerWorld){if(!visibleRect(o.x-65,o.y-65,(o.w||120)+130,(o.h||120)+130,80))continue;
    if(o.kind==='house'){
      ctx.fillStyle='#c1c4ac';ctx.fillRect(o.x-18,o.y-16,o.w+36,o.h+70);ctx.fillStyle='#b2b9a4';ctx.fillRect(o.x+o.w/2-30,o.y+o.h,60,110);
      rr(ctx,o.x+10,o.y+13,o.w,o.h,3,'rgba(33,53,42,.14)');rr(ctx,o.x,o.y,o.w,o.h,3,['#bdab8b','#a9b9b4','#c3b7a0','#b3b8c1'][o.tone],'#6d7a6b',2);
      ctx.fillStyle=['#827c68','#737f78','#947f69','#7e8991'][o.tone];poly(ctx,[[o.x+4,o.y+4],[o.x+o.w/2,o.y+o.h*.22],[o.x+o.w-4,o.y+4],[o.x+o.w-4,o.y+o.h-4],[o.x+o.w/2,o.y+o.h*.78],[o.x+4,o.y+o.h-4]],ctx.fillStyle);
      ctx.strokeStyle='rgba(238,233,205,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x+o.w/2,o.y+o.h*.22);ctx.lineTo(o.x+o.w/2,o.y+o.h*.78);ctx.stroke();rr(ctx,o.x+o.w*.65,o.y+o.h*.3,20,28,1,'#a6a792','#718071',1);
      ctx.strokeStyle='#8d9a7a';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(o.x-28,o.y-23);ctx.lineTo(o.x-28,o.y+o.h+44);ctx.lineTo(o.x+o.w+28,o.y+o.h+44);ctx.stroke();
    }else if(o.kind==='tree'){ctx.fillStyle='rgba(30,62,36,.12)';ctx.beginPath();ctx.ellipse(o.x+10,o.y+12,51,37,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=['#608d57','#658c55','#5b8352'][Math.abs(Math.floor(o.x+o.y))%3];ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#789b68';ctx.beginPath();ctx.arc(o.x-10,o.y-12,o.r*.65,0,Math.PI*2);ctx.fill();}
    else if(o.kind==='car')drawDistrictCar(o,true);
    else {ctx.strokeStyle='#7b7862';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x-9,o.y-35);ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(o.x-24,o.y-34);ctx.lineTo(o.x+10,o.y-34);ctx.stroke();}
  }ctx.restore();
}
function drawMap(){
  const pat=patterns(),zoom=state.camera.zoom||1;
  ctx.fillStyle='#91ae74';ctx.fillRect(0,0,cssW,cssH);
  ctx.save();ctx.translate(cssW/2,cssH/2);ctx.scale(zoom,zoom);ctx.translate(-state.camera.x,-state.camera.y);
  ctx.fillStyle=pat.grass;ctx.fillRect(-WORLD_PAD,-WORLD_PAD,WORLD.w+2*WORLD_PAD,WORLD.h+2*WORLD_PAD);
  drawOuterDistrict();
  for(let x=0;x<WORLD.w;x+=320){ctx.fillStyle=((x/320)&1)?'rgba(255,255,255,.018)':'rgba(30,105,44,.018)';ctx.fillRect(x,0,160,WORLD.h);}
  // Sidewalks, shoulders and paving share the district rectangles.
  for(const r of roads){ctx.fillStyle='#bec7b2';ctx.fillRect(r.x-51,r.y-51,r.w+102,r.h+102);ctx.fillStyle='#d0d3bd';ctx.fillRect(r.x-45,r.y-45,r.w+90,r.h+90);}
  for(const f of surfaces){ctx.fillStyle=f.kind==='driveway'?'#c3c8b3':(Math.floor(f.x+f.y)%3===0?'#c5bea0':'#c9c1a0');ctx.fillRect(f.x,f.y,f.w,f.h);ctx.strokeStyle='rgba(77,93,74,.18)';ctx.lineWidth=1;ctx.strokeRect(f.x+.5,f.y+.5,f.w-1,f.h-1);}
  // Paving joints and planted edging are surface detail, so navigation and cover remain exact.
  ctx.strokeStyle='rgba(83,101,81,.16)';ctx.lineWidth=1;
  for(const r of roads)for(const [a,b] of streetEdgeSegments(r,r.horizontal)){
    for(let n=Math.ceil(a/88)*88;n<b;n+=88){if(!visibleRect(r.horizontal?n:r.x-45,r.horizontal?r.y-45:n,r.horizontal?1:r.w+90,r.horizontal?r.h+90:1,20))continue;
      ctx.beginPath();if(r.horizontal){ctx.moveTo(n,r.y-44);ctx.lineTo(n,r.y-4);ctx.moveTo(n,r.y+r.h+4);ctx.lineTo(n,r.y+r.h+44);}else{ctx.moveTo(r.x-44,n);ctx.lineTo(r.x-4,n);ctx.moveTo(r.x+r.w+4,n);ctx.lineTo(r.x+r.w+44,n);}ctx.stroke();
    }
  }
  for(const f of surfaces){if(!visibleRect(f.x,f.y,f.w,f.h,25))continue;ctx.strokeStyle='rgba(76,92,73,.16)';ctx.beginPath();if(f.w>f.h){for(let x=f.x+84;x<f.x+f.w;x+=84){ctx.moveTo(x,f.y+2);ctx.lineTo(x,f.y+f.h-2);}}else for(let y=f.y+84;y<f.y+f.h;y+=84){ctx.moveTo(f.x+2,y);ctx.lineTo(f.x+f.w-2,y);}ctx.stroke();}
  for(const r of roads){ctx.fillStyle=pat.asphalt;ctx.fillRect(r.x,r.y,r.w,r.h);}
  for(const r of roads){
    ctx.fillStyle='#d9dcc8';for(const [a,b] of streetEdgeSegments(r,r.horizontal)){if(r.horizontal){ctx.fillRect(a,r.y-3,b-a,5);ctx.fillRect(a,r.y+r.h-2,b-a,5);}else{ctx.fillRect(r.x-3,a,5,b-a);ctx.fillRect(r.x+r.w-2,a,5,b-a);}}
    ctx.fillStyle=r.major?'#e1ddb5':'#d4d3bb';const start=r.horizontal?r.x:r.y,end=start+(r.horizontal?r.w:r.h);
    for(let n=start+45;n<end-35;n+=150){const mark=r.horizontal?{x:n,y:r.y+r.h/2-2,w:68,h:4}:{x:r.x+r.w/2-2,y:n,w:4,h:68};if(!roads.some(other=>other!==r&&other.horizontal!==r.horizontal&&rectOverlap(mark,other,12)))ctx.fillRect(mark.x,mark.y,mark.w,mark.h);}
    for(const [a,b] of streetEdgeSegments(r,r.horizontal))for(let n=Math.ceil((a+24)/330)*330;n<b-24;n+=330){
      for(const edge of [0,1]){const x=r.horizontal?n:r.x+(edge?r.w-12:4),y=r.horizontal?r.y+(edge?r.h-12:4):n,w=r.horizontal?29:8,h=r.horizontal?8:29;if(!visibleRect(x,y,w,h,20))continue;
        rr(ctx,x,y,w,h,1,'#586963','#a8b4a0',1);ctx.strokeStyle='#a5afa1';ctx.lineWidth=1;ctx.beginPath();for(let q=3;q<(r.horizontal?w:h)-2;q+=4){if(r.horizontal){ctx.moveTo(x+q,y+2);ctx.lineTo(x+q,y+h-2);}else{ctx.moveTo(x+2,y+q);ctx.lineTo(x+w-2,y+q);}}ctx.stroke();
      }
    }
  }
  // Pedestrian crossings sit on the approaches, leaving the centre of intersections clean.
  for(const h of roads.filter(r=>r.horizontal))for(const v of roads.filter(r=>!r.horizontal)){
    ctx.fillStyle='rgba(238,237,214,.68)';for(let i=0;i<6;i++){ctx.fillRect(v.x-35,h.y+12+i*(h.h-24)/6,18,12);ctx.fillRect(v.x+v.w+17,h.y+12+i*(h.h-24)/6,18,12);ctx.fillRect(v.x+12+i*(v.w-24)/6,h.y-35,12,18);ctx.fillRect(v.x+12+i*(v.w-24)/6,h.y+h.h+17,12,18);}
  }
  // Small details belong to lawn surfaces, never to traffic or doorway corridors.
  for(const d of decor){if(!visibleRect(d.x-7,d.y-7,14,14,20))continue;ctx.fillStyle=['#e4d98b','#d4b6b5','#e2e5c4','#5d9457'][d.t];ctx.fillRect(d.x,d.y,d.s,d.t===3?5:d.s);}
  const floorColors=['#d8c8a6','#c5d1ca','#dac4a9','#c2ced7'];
  for(const f of floors){if(!visibleRect(f.x,f.y,f.w,f.h,100))continue;
    ctx.fillStyle='rgba(36,56,46,.16)';ctx.fillRect(f.x+9,f.y+12,f.w,f.h);ctx.fillStyle=floorColors[f.tone];ctx.fillRect(f.x,f.y,f.w,f.h);
    ctx.globalAlpha=.20;ctx.fillStyle=pat.concrete;ctx.fillRect(f.x+22,f.y+22,f.w-44,f.h-44);ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(105,101,82,.12)';ctx.lineWidth=1;for(let x=f.x+62;x<f.x+f.w-22;x+=65){ctx.beginPath();ctx.moveTo(x,f.y+22);ctx.lineTo(x,f.y+f.h-22);ctx.stroke();}
    for(const e of f.exits){ctx.fillStyle='#bcb69c';if(e.dx)ctx.fillRect(e.x-12,e.y-66,24,132);else ctx.fillRect(e.x-66,e.y-12,132,24);ctx.fillStyle='#faf2ca';ctx.fillRect(e.x-5,e.y-5,10,10);}
    ctx.fillStyle='rgba(51,71,62,.48)';ctx.font='600 11px system-ui';ctx.textAlign='left';ctx.fillText(f.label.toUpperCase(),f.x+34,f.y+f.h-40);
  }
  for(const o of walls){if(o.kind==='perimeter'||!visibleRect(o.x,o.y,o.w,o.h,65))continue;
    if(o.kind==='building'){
      ctx.fillStyle='rgba(31,48,41,.22)';ctx.fillRect(o.x+6,o.y+8,o.w,o.h);ctx.fillStyle='#e9e6d3';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle='#64776e';ctx.fillRect(o.x,o.y,Math.min(5,o.w),o.h);ctx.fillRect(o.x,o.y,o.w,Math.min(5,o.h));ctx.fillStyle='#faf6df';ctx.fillRect(o.x+5,o.y+5,Math.max(0,o.w-5),2);
      const horizontal=o.w>o.h,len=horizontal?o.w:o.h;for(let n=46;n<len-36;n+=92){const x=o.x+(horizontal?n:7),y=o.y+(horizontal?7:n),w=horizontal?32:8,h=horizontal?8:32;rr(ctx,x,y,w,h,1,'#9fb7b4','#6d8582',1);ctx.fillStyle='#d3e2d4';if(horizontal)ctx.fillRect(x+3,y+2,w-6,2);else ctx.fillRect(x+2,y+3,2,h-6);}
    }else if(o.kind==='car')drawDistrictCar({...o,tone:Math.floor(o.x)%4});
    else if(o.kind==='fence'){
      ctx.fillStyle='rgba(33,49,38,.13)';ctx.fillRect(o.x+4,o.y+5,o.w,o.h);ctx.fillStyle='#af9970';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle='#7b6e51';if(o.w>o.h){for(let x=o.x;x<o.x+o.w;x+=24)ctx.fillRect(x,o.y-2,3,o.h+4);}else{for(let y=o.y;y<o.y+o.h;y+=24)ctx.fillRect(o.x-2,y,o.w+4,3);}
    }else if(o.kind==='utility'){rr(ctx,o.x+4,o.y+6,o.w,o.h,2,'rgba(20,40,29,.15)');rr(ctx,o.x,o.y,o.w,o.h,3,'#788376','#53685c',2);ctx.fillStyle='#aab09a';ctx.fillRect(o.x+5,o.y+5,o.w-10,5);ctx.strokeStyle='#4f6354';for(let y=o.y+16;y<o.y+o.h-5;y+=6){ctx.beginPath();ctx.moveTo(o.x+7,y);ctx.lineTo(o.x+o.w-7,y);ctx.stroke();}}
    else if(o.kind==='bench'){rr(ctx,o.x,o.y,o.w,o.h,2,'#977d57','#665d47',1.5);ctx.fillStyle='#c4a777';for(let y=o.y+3;y<o.y+o.h;y+=7)ctx.fillRect(o.x+2,y,o.w-4,3);}
    else {rr(ctx,o.x+5,o.y+7,o.w,o.h,3,'rgba(31,45,35,.18)');rr(ctx,o.x,o.y,o.w,o.h,3,o.kind==='interior'?'#9a9380':'#9c835d','#6e6248',2);ctx.fillStyle='#bfa579';ctx.fillRect(o.x+5,o.y+5,o.w-10,6);if(o.kind!=='interior'){ctx.strokeStyle='#776144';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x+8,o.y+9);ctx.lineTo(o.x+o.w-8,o.y+o.h-8);ctx.moveTo(o.x+o.w-8,o.y+9);ctx.lineTo(o.x+8,o.y+o.h-8);ctx.stroke();}}
  }
  for(const o of solids){if(o.type!=='circle'||!visibleRect(o.x-o.r-30,o.y-o.r-30,o.r*2+60,o.r*2+60,20))continue;
    ctx.fillStyle='rgba(28,53,33,.17)';ctx.beginPath();ctx.ellipse(o.x+8,o.y+9,o.r*1.12,o.r*.86,0,0,Math.PI*2);ctx.fill();
    if(o.kind==='tree'||o.kind==='bush'){
      const leaf=o.kind==='tree'?(Math.floor(o.x+o.y)%2?['#487b45','#5b8a50','#709956']:['#457d47','#588e4e','#6b9c57']):['#68874d','#789855','#8da366'];
      for(const [i,l] of [[0,[-9,-8,.8]],[1,[10,4,.75]],[2,[-3,9,.77]]]){ctx.fillStyle=leaf[i];ctx.beginPath();ctx.arc(o.x+l[0],o.y+l[1],o.r*l[2],0,Math.PI*2);ctx.fill();}ctx.strokeStyle='rgba(43,87,46,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(o.x,o.y,o.r*.92,0,Math.PI*2);ctx.stroke();
      if(o.kind==='bush'){for(let i=0;i<5;i++){const a=i*2.399+o.x*.01,x=o.x+Math.cos(a)*o.r*.72,y=o.y+Math.sin(a)*o.r*.65;ctx.fillStyle=['#d0bf83','#d0a5a0','#dbe2bd'][i%3];ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}}
    }else {poly(ctx,[[o.x-o.r,o.y-5],[o.x-o.r*.3,o.y-o.r],[o.x+o.r*.8,o.y-o.r*.55],[o.x+o.r,o.y+o.r*.35],[o.x,o.y+o.r],[o.x-o.r*.9,o.y+o.r*.6]],'#919f8f','#6f806e',1.5);poly(ctx,[[o.x-o.r*.8,o.y-5],[o.x-o.r*.3,o.y-o.r*.85],[o.x+o.r*.5,o.y-o.r*.4],[o.x-2,o.y+6]],'#b0b9a3');}
  }
  // Concrete footings and visible chain-link panels describe the playable perimeter.
  for(const o of walls.filter(o=>o.kind==='perimeter')){if(!visibleRect(o.x,o.y,o.w,o.h,30))continue;ctx.fillStyle='#78876c';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#a9b29b';ctx.lineWidth=1.3;const horizontal=o.w>o.h;
    const start=horizontal?Math.max(o.x,viewBounds().x-40):Math.max(o.y,viewBounds().y-40),end=horizontal?Math.min(o.x+o.w,viewBounds().x+viewBounds().w+40):Math.min(o.y+o.h,viewBounds().y+viewBounds().h+40);
    ctx.beginPath();for(let n=Math.floor(start/14)*14;n<end;n+=14){if(horizontal){ctx.moveTo(n,o.y+3);ctx.lineTo(n+14,o.y+o.h-3);ctx.moveTo(n,o.y+o.h-3);ctx.lineTo(n+14,o.y+3);}else{ctx.moveTo(o.x+3,n);ctx.lineTo(o.x+o.w-3,n+14);ctx.moveTo(o.x+o.w-3,n);ctx.lineTo(o.x+3,n+14);}}ctx.stroke();
    ctx.fillStyle='#506452';for(let n=Math.floor(start/120)*120;n<end;n+=120)if(horizontal)ctx.fillRect(n,o.y-3,7,o.h+6);else ctx.fillRect(o.x-3,n,o.w+6,7);
  }
  ctx.restore();
}

// Machined silhouettes, all Canvas geometry. The same model serves previews and live play.
function drawWeaponModel(name,x,y,angle,recoil=0,g=ctx,motion=null){
  const w=WEAPONS[name],length=weaponLength(name),pistol=w.type==='sidearm',steel='#253038',edge='#101b20',polymer='#35433f',wood='#96613e';
  const since=motion?Math.max(0,(gameNow()-motion.lastShot)/1000):99,cycle=clamp(since/w.hitSpeed,0,1),reload=motion?.reloading?clamp(1-(motion.reloadEnd-gameNow())/(w.reload*1000),0,1):0;
  const magDrop=magazineMotion(reload),bolt=reload>.78?Math.sin((reload-.78)/.22*Math.PI)*5:0;
  const kick=weaponKick(name,recoil);
  g.save();g.translate(x,y);g.rotate(angle);g.translate(-kick,0);g.lineJoin='round';g.lineCap='round';g.lineWidth=.9;
  const metal=(xx,yy,ww,hh,color=steel,r=1.4)=>{const grad=g.createLinearGradient(xx,yy,xx,yy+hh);grad.addColorStop(0,'#718087');grad.addColorStop(.12,color);grad.addColorStop(.7,color);grad.addColorStop(1,'#142126');rr(g,xx,yy,ww,hh,r,grad,edge,.9);};
  const shape=(pts,color)=>poly(g,pts,color,edge,1);
  const pins=(points)=>{for(const [px,py] of points){g.fillStyle='#0d171c';g.beginPath();g.arc(px,py,1,0,6.283);g.fill();g.fillStyle='#81908d';g.fillRect(px-.5,py-.6,.9,.4);}};
  const grip=(xx,yy,ww=8,hh=15,color=polymer)=>{shape([[xx,yy],[xx+ww,yy],[xx+ww-2,yy+hh],[xx-2,yy+hh-1]],color);g.strokeStyle='#18262a';g.lineWidth=.7;for(let v=yy+3;v<yy+hh;v+=3){g.beginPath();g.moveTo(xx,v);g.lineTo(xx+ww-2,v+1);g.stroke();}};
  const guard=(xx,yy,ww=12)=>{g.strokeStyle=edge;g.lineWidth=2;g.beginPath();g.moveTo(xx,yy);g.bezierCurveTo(xx,yy+9,xx+ww,yy+9,xx+ww,yy);g.stroke();g.strokeStyle='#728078';g.lineWidth=.6;g.stroke();g.strokeStyle='#19262b';g.lineWidth=1.1;g.beginPath();g.moveTo(xx+5,yy);g.lineTo(xx+6,yy+4);g.stroke();};
  const rail=(xx,end,yy=-7)=>{metal(xx,yy,end-xx,2.4,'#38434a',.3);g.fillStyle='#111d22';for(let t=xx+2;t<end-1;t+=3.5)g.fillRect(t,yy,.9,2);};
  const slots=(xx,end,yy,count=2)=>{g.fillStyle='#101d22';for(let t=xx;t<end;t+=5){rr(g,t,yy,3,1.8,.7,'#101d22');if(count===2)rr(g,t,yy+4,3,1.6,.6,'#172328');}};
  const stock=(xx,yy,end,color=polymer)=>{shape([[xx,yy],[end,yy+2],[end,yy+8],[xx+3,yy+13],[xx,yy+13]],color);rr(g,xx-2,yy,3,14,.8,'#172426',edge,.7);g.strokeStyle='#59675b';g.lineWidth=.7;g.beginPath();g.moveTo(xx+3,yy+3);g.lineTo(end-2,yy+4);g.stroke();};
  const optic=(xx,size=17)=>{metal(xx,-13,size,6,'#23313a',2.4);metal(xx+3,-7,3,3,'#222b2e',.6);metal(xx+size-6,-7,3,3,'#222b2e',.6);rr(g,xx+size-2,-13.3,3,6.6,1,'#5f9698',edge,.7);g.fillStyle='#c3dfd0';g.fillRect(xx+size-1,-12,1,1.5);metal(xx+size*.4,-16,4,3,'#2c393d',.7);};
  const mag=(xx,yy,ww,hh,color='#283637')=>{g.save();g.translate(0,magDrop);g.rotate(magDrop*.005);shape([[xx,yy],[xx+ww,yy],[xx+ww-1,yy+hh],[xx+1,yy+hh]],color);g.strokeStyle='#142226';g.lineWidth=.7;for(let t=xx+2;t<xx+ww;t+=3){g.beginPath();g.moveTo(t,yy+2);g.lineTo(t,yy+hh-2);g.stroke();}g.restore();};
  if(pistol){
    const compact=name==='X16',automatic=name==='X-16 Auto',slideWindow=Math.min(.13,w.hitSpeed*.65),slide=since<slideWindow?Math.sin(clamp(since/slideWindow,0,1)*Math.PI)*(compact?3:automatic?3.7:4):bolt;
    const end=compact?32:automatic?36:35;shape([[1,1],[end-3,1],[end-3,5],[20,6],[17,18],[6,17],[9,4]],compact?'#273237':automatic?'#3b4e45':'#48534e');
    grip(8,5,compact?8:10,compact?12:14,compact?'#253038':automatic?'#2d3d37':'#354340');guard(17,4,compact?10:12);
    metal(0-slide,compact?-5.5:-6.5,end,compact?8.5:10.5,compact?'#303a43':automatic?'#506256':'#465057',1.3);metal(end-2,-2.5,length-end+2,5,'#142126',.6);
    g.strokeStyle='#111e25';for(let t=3;t<10;t+=2){g.beginPath();g.moveTo(t-slide,-4);g.lineTo(t-slide-1,1);g.stroke();}
    rr(g,18-slide,-4.5,6,2.8,.5,'#16242c','#7c8781',.5);metal(2-slide,-8,3,2,'#151f23',.3);metal(end-4-slide,-7,2.5,2,'#1a262b',.3);pins([[11,3],[19,3]]);
    if(automatic){metal(end-1,-4,7,8,'#2c3d38',.8);slots(end,end+6,-2,2);mag(8,17,8,10,'#344541');metal(22,5,9,4,'#283b3e',.8);metal(28,5,3,3,'#74a0a2',.4);}
    else if(reload>0)mag(8,17,6,7);g.restore();return;
  }
  // Furniture, receiver and feed construction are specific to each weapon.
  if(name==='AR-15'){
    metal(-10,-2,15,4,'#596565');stock(-22,-6,-7);shape([[-15,-4],[-7,-4],[-7,3],[-16,6]],'#42524d');
    metal(-4,-5.5,30,11,'#384850',1.2);metal(0,1.2,25,4.5,'#2a343c',1);grip(2,5);guard(11,5);mag(19,6,11,16,'#4d5b56');
    metal(26,-5,23,10,'#3d4b4b',1.6);slots(29,46,-3.3);rail(1,49,-7.5);optic(9,14);metal(48,-2.4,11,4.8,'#222e34');
    metal(53,-6,3,7,'#2e3e42',.3);rr(g,8,-2,9,2.6,.5,'#132028','#788780',.5);pins([[0,2],[24,2]]);metal(-3-bolt,-7,4,2,'#526164',.5);
  }else if(name==='AK47'){
    stock(-23,-6,-2,wood);metal(-5,-5.5,31,11,'#3b444a',1);shape([[1,5],[9,5],[8,19],[0,17]],'#6e4933');guard(10,5,11);
    g.save();g.translate(0,magDrop);g.beginPath();g.moveTo(19,4);g.lineTo(28,5);g.bezierCurveTo(29,15,35,20,37,22);g.lineTo(27,25);g.bezierCurveTo(21,20,19,12,19,4);g.closePath();g.fillStyle='#283337';g.fill();g.strokeStyle=edge;g.stroke();g.strokeStyle='#59675e';for(let n=0;n<3;n++){g.beginPath();g.moveTo(22+n*2,8);g.quadraticCurveTo(23+n*2,18,29+n*2,22);g.stroke();}g.restore();
    metal(26,-2.5,33,5,'#222d33');metal(27,-6,22,3,'#5b635b');shape([[26,-3],[47,-3],[48,5],[27,6]],wood);slots(31,46,-1,1);metal(50,-6,3,7,'#334047',.2);rail(0,24,-7);pins([[0,1],[12,1],[24,1]]);metal(9-bolt,-3,6,2,'#727c78',.4);
  }else if(name==='SMG-9'){
    metal(-16,-3,15,2,'#687777',.6);metal(-16,3,15,2,'#687777',.6);rr(g,-19,-5,4,13,1.5,polymer,edge,.9);
    metal(-3,-6,33,12,'#445257',2);grip(3,6,7,13);guard(10,5,10);mag(22,5,6,17);metal(30,-4.5,9,9,'#35444b',2);slots(31,38,-2,1);rail(2,32,-8);optic(12,11);metal(39,-2,6,4);pins([[2,1],[28,1]]);
  }else if(name==='SPAS-12'){
    metal(-23,-9,43,3,'#697772',1);metal(-24,-9,3,18,'#424f4e',1);metal(-5,-6,31,12,'#424e52',1.5);grip(0,6,8,17);guard(11,6,12);
    metal(25,-4,40,4,'#202d33',1);metal(23,2,37,4,'#56645f',1);metal(27,-7,26,9,'#4d5a55',1.3);slots(30,52,-5);metal(63,-6,2,6,'#788580',.3);pins([[0,0],[20,0]]);
    if(reload>0){g.save();g.translate(13,8+Math.sin(reload*Math.PI*6)*4);metal(0,0,8,3,'#a9563a',.7);metal(0,0,2,3,'#c5a760',.4);g.restore();}
  }else if(name==='Pump Shotgun'){
    stock(-25,-6,-3,'#536051');metal(-5,-4.5,27,9,'#3e484c');guard(2,5,12);grip(-1,5,7,10);
    metal(21,-3,48,4,'#2c373e',1);metal(19,2,45,3.6,'#4f5c60',1);const pump=cycle<.72?Math.sin(clamp(cycle/.72,0,1)*Math.PI)*9:0;
    metal(25-pump,-1,23,9,'#59635a',2.4);g.strokeStyle='#21312d';for(let t=28;t<47;t+=3){g.beginPath();g.moveTo(t-pump,0);g.lineTo(t-pump,7);g.stroke();}metal(63,-5,2,4,'#414a46',.2);rr(g,8,-2,9,3,.8,'#16242a','#727e7b',.5);pins([[-1,0],[19,0]]);
    if(reload>0){g.save();g.translate(11,8+Math.sin(reload*Math.PI*4)*5);metal(0,0,8,3,'#a7583a',.7);metal(0,0,2,3,'#c5a760',.4);g.restore();}
  }else if(name==='Auto 12'){
    stock(-22,-7,-3,'#4c5c58');metal(-5,-8,36,16,'#45535c',2);grip(0,7,9,16);guard(10,7,12);metal(29,-6,20,12,'#34464c',2);slots(32,48,-4);rail(0,49,-10);optic(7,15);metal(49,-3,14,6,'#222f35');
    g.save();g.translate(0,magDrop);g.fillStyle='#2a393d';g.beginPath();g.arc(24,14,11,0,6.283);g.fill();g.strokeStyle=edge;g.stroke();g.strokeStyle='#59665e';g.beginPath();g.arc(24,14,7,0,6.283);g.stroke();pins([[24,14]]);g.restore();pins([[1,2],[29,2]]);
  }else if(name==='LR-762'){
    stock(-25,-6,-5,'#5d6c53');metal(-14,-2,10,4,'#59685b');metal(-5,-5,32,10,'#596756');grip(0,5,8,15,'#44513f');guard(9,5);mag(21,5,11,15,'#394641');metal(27,-4.5,26,9,'#5d6b5a',1);slots(30,51,-2.5);rail(-1,52,-7);optic(5,27);metal(53,-2,19,4,'#273536');pins([[0,2],[25,2]]);
  }else if(name==='LW Tundra'){
    shape([[-28,-6],[-5,-5],[17,-2],[41,-2],[41,4],[13,5],[7,15],[-2,14],[0,5],[-25,8]],'#778b87');rr(g,-30,-6,3,15,.9,'#1e3030',edge,.8);metal(-4,-5,37,9,'#77858a');metal(33,-2,48,4,'#3b4d54',.8);optic(0,38);rail(-2,30,-7);
    const boltTravel=cycle<.75?Math.sin(clamp((cycle-.1)/.65,0,1)*Math.PI)*7:bolt;metal(11-boltTravel,-2,14,3,'#afb5ac',.5);g.strokeStyle='#253c44';g.lineWidth=1.8;g.beginPath();g.moveTo(15-boltTravel,3);g.lineTo(18-boltTravel,8);g.stroke();g.fillStyle='#24333a';g.beginPath();g.arc(18-boltTravel,8,2,0,6.283);g.fill();mag(22,4,9,9);pins([[-5,1],[31,1]]);metal(-22,-8,12,3,'#52675e',1);
  }else if(name==='War Head LMG'){
    stock(-28,-8,-6,'#736c50');metal(-6,-8,40,16,'#545747',2);grip(0,8,9,15);guard(10,7,12);metal(33,-6,22,12,'#5d6250',1.5);slots(35,54,-4);rail(-2,53,-10);optic(3,15);metal(55,-3,19,6,'#344039');metal(61,-4,3,8,'#55604c',.4);
    g.save();g.translate(0,magDrop*.6);shape([[16,7],[35,7],[38,23],[17,23]],'#4a513f');rr(g,19,10,15,10,1,'#5a6148',edge,.8);g.fillStyle='#c6ae65';for(let n=13;n<33;n+=3)g.fillRect(n,5,2,4);g.restore();pins([[0,1],[30,1]]);
    g.strokeStyle='#26342c';g.lineWidth=1.6;g.beginPath();g.moveTo(60,3);g.lineTo(53,14);g.moveTo(60,3);g.lineTo(68,14);g.stroke();metal(10-bolt,-4,12,3,'#1f2d30',.5);
  }else if(name==='SR-Aug'){
    shape([[-24,-6],[-4,-7],[13,-3],[39,-3],[40,4],[16,6],[12,19],[5,19],[3,6],[-23,9]],'#6d7959');
    metal(-24,-7,5,16,'#26372c');metal(39,-2,20,4,'#2a3936');grip(8,5,7,15,'#46543f');guard(18,4,14);mag(-10,7,10,18,'#394638');rail(-3,36,-9);optic(5,27);slots(27,38,-2);pins([[-12,1],[32,0]]);
  }else if(name==='P90'){
    shape([[-19,-6],[-10,-10],[27,-9],[40,-4],[40,5],[32,11],[21,11],[17,17],[5,16],[-1,9],[-16,8]],'#4c605f');
    rr(g,-18,-5,9,12,3,'#2b403e',edge,.8);g.fillStyle='#172b29';g.beginPath();g.ellipse(10,8,6,4,-.2,0,6.283);g.fill();rr(g,23,3,9,7,2,'#243c3c',edge,.7);metal(37,-2,18,4,'#293a42');
    g.save();g.translate(-magDrop*.2,-magDrop*.65);rr(g,-8,-13,41,6,2,'#788276',edge,.8);rr(g,-6,-12,35,3,1,'#abb195','#3c544b',.4);g.fillStyle='#b3a16b';for(let n=-4;n<27;n+=3)g.fillRect(n,-11.5,1.5,2.2);g.restore();optic(14,15);pins([[-3,0],[34,0]]);g.strokeStyle='#82988b';g.lineWidth=.7;g.beginPath();g.moveTo(-12,-1);g.lineTo(1,-2);g.stroke();
  }
  // Worn edges are restrained; controls and muzzle apertures retain contrast at play scale.
  g.fillStyle='rgba(221,229,210,.18)';g.fillRect(0,-4,22,.65);metal(length-4,-3.2,4,6.4,'#223238',.7);g.fillStyle='#111b20';g.fillRect(length-1.2,-2.3,1.2,4.6);
  if(reload>.82){metal(0-bolt,-6,4,2,'#8f9b8f',.4);}g.restore();
}

function weaponKick(name,recoil){return recoil*(name==='LW Tundra'?8.5:name==='War Head LMG'?6.8:WEAPONS[name]?.type==='sidearm'?4:5.5);}
function weaponLength(name){
  return {'AR-15':62,AK47:62,'SMG-9':48,'Pump Shotgun':72,'SPAS-12':69,'Auto 12':66,'LR-762':75,'LW Tundra':84,'War Head LMG':77,P90:58,'9mm':38,X16:34,'X-16 Auto':43,'SR-Aug':62}[name]||62;
}
function drawOperatorPortrait(g,w,h,index){
  const skin=SKINS[index],edge='#19282a',accent=skin.accent;
  g.fillStyle='#d7d8c8';g.fillRect(0,0,w,h);
  // A quiet field-manual plate, with registration marks and a cast ground shadow.
  g.strokeStyle='rgba(42,57,46,.10)';g.lineWidth=1;
  for(let x=14;x<w;x+=28){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let y=14;y<h;y+=28){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.strokeStyle='rgba(42,57,46,.34)';
  for(const [x,y,dx,dy] of [[12,12,1,1],[w-12,12,-1,1],[12,h-12,1,-1],[w-12,h-12,-1,-1]]){g.beginPath();g.moveTo(x+dx*12,y);g.lineTo(x,y);g.lineTo(x,y+dy*12);g.stroke();}
  const scale=Math.min(w/214,h/292);
  g.save();g.translate(w/2,h/2);g.scale(scale,scale);g.lineJoin='round';g.lineCap='round';
  g.fillStyle='rgba(21,34,29,.16)';g.beginPath();g.ellipse(4,125,63,8,0,0,Math.PI*2);g.fill();
  // Boots, articulated trousers and separate knee plates.
  poly(g,[[-34,15],[-3,18],[-9,73],[-17,116],[-40,116],[-36,68]],skin.pants,edge,2);
  poly(g,[[2,18],[34,15],[39,66],[42,117],[18,117],[8,74]],skin.pants,edge,2);
  rr(g,-43,111,28,15,4,'#26302e',edge,2);rr(g,16,112,31,14,4,'#26302e',edge,2);
  g.fillStyle='#526057';g.fillRect(-40,113,22,2);g.fillRect(20,114,22,2);
  rr(g,-36,65,24,25,5,skin.vest,edge,1.7);rr(g,12,67,23,25,5,skin.vest,edge,1.7);
  g.strokeStyle='#849081';g.lineWidth=1;g.beginPath();g.moveTo(-31,70);g.lineTo(-17,70);g.moveTo(17,72);g.lineTo(30,72);g.stroke();
  g.strokeStyle='rgba(229,236,211,.24)';g.beginPath();g.moveTo(-29,28);g.lineTo(-28,60);g.moveTo(24,29);g.lineTo(29,59);g.moveTo(-30,95);g.lineTo(-24,109);g.moveTo(24,99);g.lineTo(31,111);g.stroke();
  rr(g,-41,30,12,24,2,skin.body,edge,1);rr(g,29,31,12,24,2,skin.body,edge,1);
  // Pack, sleeves and seam highlights.
  rr(g,-43,-77,85,94,11,'#283b36',edge,2);
  poly(g,[[-31,-83],[-48,-75],[-60,-18],[-46,0],[-29,-44]],skin.body,edge,2);
  poly(g,[[31,-82],[50,-72],[60,-20],[43,-2],[27,-43]],skin.body,edge,2);
  rr(g,-52,-66,20,15,4,skin.vest,edge,1.5);rr(g,33,-64,21,15,4,skin.vest,edge,1.5);
  rr(g,-50,-61,14,4,1,accent);rr(g,36,-59,14,4,1,accent);
  g.strokeStyle='rgba(239,242,211,.24)';g.lineWidth=1.2;g.beginPath();g.moveTo(-47,-43);g.lineTo(-50,-24);g.moveTo(49,-40);g.lineTo(52,-23);g.stroke();
  // Chest rig, shoulder webbing, plates, MOLLE rows and magazines.
  const plate=g.createLinearGradient(-30,-70,35,17);plate.addColorStop(0,skin.body);plate.addColorStop(.4,skin.vest);plate.addColorStop(1,'#24312e');
  poly(g,[[-28,-82],[29,-81],[38,-62],[33,22],[-34,22],[-39,-61]],skin.body,edge,2);
  rr(g,-31,-67,62,74,7,plate,edge,2);
  rr(g,-28,-83,10,43,3,'#202e2c');rr(g,18,-83,10,43,3,'#202e2c');
  rr(g,-27,-76,8,6,1,'#9caa96',edge,.8);rr(g,19,-76,8,6,1,'#9caa96',edge,.8);
  g.fillStyle='rgba(237,235,210,.18)';for(let y=-51;y<-24;y+=7)for(let x=-24;x<26;x+=10)g.fillRect(x,y,7,2);
  rr(g,-15,-62,31,10,1,'#d4c6a2',edge,.8);g.fillStyle='#263930';g.font='800 5px monospace';g.textAlign='center';g.fillText('SAR / '+String(index+1).padStart(2,'0'),0,-55);
  for(let x=-24;x<26;x+=17){rr(g,x,-20,14,29,2,skin.body,edge,1.2);rr(g,x+1,-22,12,9,1,skin.vest,edge,.8);g.fillStyle='#bac1a6';g.fillRect(x+6,-17,2,3);g.strokeStyle='rgba(255,255,230,.16)';g.strokeRect(x+2,-9,10,15);}
  rr(g,-36,16,73,8,1,'#202e29',edge,1.4);rr(g,-5,16,12,8,1,'#9caa94',edge,1);rr(g,-3,18,8,4,.5,'#303f36');
  rr(g,-42,7,14,19,2,skin.vest,edge,1);rr(g,31,5,14,21,2,skin.vest,edge,1);
  // Neck scarf and shaded face beneath the helmet.
  rr(g,-13,-91,26,19,5,skin.skin,edge,1.5);
  poly(g,[[-22,-83],[-10,-91],[9,-90],[25,-83],[11,-73],[-12,-75]],skin.vest,edge,1.2);
  const face=g.createLinearGradient(-13,-114,17,-87);face.addColorStop(0,skin.skin);face.addColorStop(1,'#745b46');
  rr(g,-20,-120,40,38,13,face,edge,2);
  poly(g,[[-17,-98],[17,-98],[17,-90],[9,-82],[-9,-82],[-17,-90]],skin.vest,edge,1);
  g.strokeStyle='rgba(226,233,214,.2)';g.beginPath();g.moveTo(-8,-92);g.lineTo(8,-92);g.moveTo(-6,-88);g.lineTo(6,-88);g.stroke();
  const helmet=g.createLinearGradient(-20,-138,23,-107);helmet.addColorStop(0,skin.accent);helmet.addColorStop(.15,skin.body);helmet.addColorStop(1,skin.vest);
  poly(g,[[-24,-108],[-23,-122],[-13,-137],[12,-139],[24,-125],[25,-108]],helmet,edge,2);
  rr(g,-25,-113,51,7,2,skin.vest,edge,1);rr(g,-9,-139,18,8,1,'#33443d',edge,1);
  rr(g,-18,-110,37,13,4,'#172a2c',edge,1.5);
  const lens=g.createLinearGradient(-17,-109,19,-96);lens.addColorStop(0,'#719395');lens.addColorStop(.42,'#3e6165');lens.addColorStop(1,'#192e32');
  rr(g,-16,-108,14,8,2,lens);rr(g,3,-108,14,8,2,lens);g.strokeStyle='rgba(221,241,223,.48)';g.beginPath();g.moveTo(-13,-106);g.lineTo(-6,-106);g.moveTo(6,-106);g.lineTo(13,-106);g.stroke();
  rr(g,-27,-109,7,16,3,'#263b35',edge,1);rr(g,21,-109,7,16,3,'#263b35',edge,1);
  g.strokeStyle='#1b2c28';g.lineWidth=2;g.beginPath();g.moveTo(26,-96);g.quadraticCurveTo(27,-88,13,-89);g.stroke();rr(g,10,-91,6,4,1,'#1b2827');
  // Rifle carried across the rig. Hands overlap the stock and fore-end naturally.
  g.save();g.translate(-25,-29);g.rotate(-.10);g.scale(.96,.96);drawWeaponModel(skin.name==='Steel Recon'?'SR-Aug':CONFIG.primary,0,0,0,0,g);g.restore();
  poly(g,[[-51,-17],[-33,-30],[-16,-25],[-22,-13],[-45,-3]],skin.body,edge,1.7);
  poly(g,[[49,-21],[30,-32],[24,-22],[38,-9],[49,-11]],skin.body,edge,1.7);
  rr(g,-24,-31,15,12,3,'#27352e',edge,1.3);rr(g,20,-34,14,12,3,'#27352e',edge,1.3);
  g.strokeStyle='#7b8875';g.lineWidth=.8;for(let x=-21;x<-10;x+=3){g.beginPath();g.moveTo(x,-28);g.lineTo(x,-23);g.stroke();}for(let x=23;x<32;x+=3){g.beginPath();g.moveTo(x,-31);g.lineTo(x,-26);g.stroke();}
  g.restore();
}
function drawOperatorModel(g,skin,index,leg=0,pose=null){
  const edge='#17272b';
  g.save();if(pose)g.rotate(pose.lower);
  // Split boots and trouser cuffs give the gait an articulated silhouette.
  rr(g,-24,-16+leg,22,11,4,skin.pants,edge,1.5);rr(g,-24,6-leg,22,11,4,skin.pants,edge,1.5);
  rr(g,-28,-15+leg,12,9,3,'#23302e',edge,1.2);rr(g,-28,7-leg,12,9,3,'#23302e',edge,1.2);
  g.fillStyle='rgba(210,223,206,.24)';g.fillRect(-26,-13+leg,6,1);g.fillRect(-26,9-leg,6,1);
  g.restore();
  rr(g,-23,-13,15,26,5,skin.vest,edge,1.5);g.strokeStyle='rgba(220,225,200,.25)';g.lineWidth=1;g.strokeRect(-20,-9,8,18);
  const armor=g.createLinearGradient(-10,-19,14,19);armor.addColorStop(0,skin.body);armor.addColorStop(.5,skin.vest);armor.addColorStop(1,'#24332f');
  rr(g,-14,-19,35*skin.build,38,10,skin.body,edge,1.7);rr(g,-8,-15,27,30,6,armor,edge,1.5);
  g.fillStyle='#1d2b27';g.fillRect(-10,-17,4,34);g.fillRect(15,-14,3,28);
  for(const y of [-13,7]){rr(g,7,y,8,7,1.2,skin.body,edge,.8);g.fillStyle='rgba(240,229,190,.42)';g.fillRect(9,y+2,4,1);}
  // Arms use the same rig transform as the weapon and its actual grip anchors.
  const hands=pose?.hands||{rear:{x:28,y:11},support:{x:50,y:4}};
  for(const [shoulder,hand] of [[{x:6,y:15},hands.rear],[{x:6,y:-15},hands.support]]){const elbow={x:(shoulder.x+hand.x)*.5-4,y:(shoulder.y+hand.y)*.5+(shoulder.y>0?5:-5)};g.strokeStyle=edge;g.lineWidth=10;g.beginPath();g.moveTo(shoulder.x,shoulder.y);g.lineTo(elbow.x,elbow.y);g.lineTo(hand.x,hand.y);g.stroke();g.strokeStyle=skin.body;g.lineWidth=7.5;g.stroke();}
  rr(g,9,-19,9,5,1.2,skin.accent,edge,.8);rr(g,9,14,9,5,1.2,skin.accent,edge,.8);

  rr(g,-13,-18,5,36,1,'#2d3530',edge,.7);for(const y of [-12,6]){rr(g,-12,y,6,7,1,skin.body,edge,.6);}rr(g,-21,-13+leg,7,7,2,'#687469',edge,.7);rr(g,-21,7-leg,7,7,2,'#687469',edge,.7);rr(g,24,-9,5,5,1.5,skin.skin,edge,.6);
  // Helmet covers the crown. A forward visor and comms establish facing direction.
  const helmet=g.createRadialGradient(-9,-7,1,-3,0,14);helmet.addColorStop(0,skin.accent);helmet.addColorStop(.22,skin.body);helmet.addColorStop(1,skin.vest);
  g.fillStyle=helmet;g.beginPath();g.ellipse(-3,0,13,13.5,0,0,Math.PI*2);g.fill();g.strokeStyle=edge;g.lineWidth=1.8;g.stroke();
  g.strokeStyle='rgba(233,238,216,.22)';g.lineWidth=1;g.beginPath();g.arc(-3,-1,10,Math.PI*.85,Math.PI*1.6);g.stroke();
  rr(g,-9,-3,10,6,2,skin.vest,edge,.7);rr(g,5,-9,5,18,2,'#203438',edge,1);
  g.fillStyle='#76a4a4';g.fillRect(7,-6,1.5,10);rr(g,-7,-15,9,4,1.4,skin.vest,edge,1);
  g.strokeStyle='#142523';g.lineWidth=1.5;g.beginPath();g.moveTo(-3,14);g.lineTo(10,15);g.lineTo(14,9);g.stroke();
  if(index===1||index===6){g.strokeStyle=skin.accent;g.lineWidth=1.2;g.beginPath();g.moveTo(-10,-5);g.lineTo(-5,-9);g.moveTo(-11,5);g.lineTo(-6,8);g.stroke();}
}
function drawActor(a,now){
  if(a.dead)return;const s=worldToScreen(a.x,a.y),zoom=state.camera.zoom||1;if(s.x<-160||s.y<-160||s.x>cssW+160||s.y>cssH+160)return;
  const skin=SKINS[a.skinIndex],v=a.visual||{turn:a.angle,lower:a.angle,phase:0,move:0,sprint:0,bob:0},rig=weaponRig(a,now),hands=gripAnchors(rig),leg=Math.sin(v.phase)*3.6*Math.min(1.2,v.move);
  ctx.save();ctx.translate(s.x,s.y);ctx.scale(zoom,zoom);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.fillStyle='rgba(18,36,27,.19)';ctx.beginPath();ctx.ellipse(5,8,31,22,0,0,Math.PI*2);ctx.fill();
  const team=actorPresentation(a).color;ctx.strokeStyle='rgba(13,30,25,.50)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=team;ctx.lineWidth=a.isPlayer?2:1.4;ctx.stroke();
  if(a.isPlayer){ctx.strokeStyle='#f2f1db';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,31,-.65,.65);ctx.arc(0,0,31,Math.PI-.65,Math.PI+.65);ctx.stroke();}
  ctx.rotate(v.turn);ctx.translate(-rig.kick*1.2+v.sprint*2,v.bob);
  drawOperatorModel(ctx,skin,a.skinIndex,leg,{lower:angleDiff(v.lower,v.turn),hands,sprint:v.sprint,ads:a.adsBlend||0});
  drawWeaponModel(rig.name,rig.x,rig.y,rig.angle,rig.kick,ctx,currentWeaponState(a));
  for(const hand of [hands.rear,hands.support]){ctx.save();ctx.translate(hand.x,hand.y);ctx.rotate(rig.angle);rr(ctx,-3.5,-3,7,6,2,skin.vest,'#17282a',.8);ctx.restore();}
  if(now<a.muzzleUntil){const slot=currentWeaponState(a),tip=weaponLength(slot.name)-weaponKick(slot.name,rig.kick),flare=8+(Math.floor(slot.lastShot)+a.id)%7;ctx.save();ctx.translate(rig.x,rig.y);ctx.rotate(rig.angle);const glow=ctx.createRadialGradient(tip,0,0,tip,0,15);glow.addColorStop(0,'#fff9d4');glow.addColorStop(.25,'rgba(255,213,99,.85)');glow.addColorStop(1,'rgba(255,153,46,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(tip,0,15,0,Math.PI*2);ctx.fill();poly(ctx,[[tip+flare,0],[tip+2,-3],[tip,-5-flare*.15],[tip-2,0],[tip,5+flare*.15],[tip+3,3]],'#ffefb1');ctx.restore();}
  ctx.restore();
  const displayName=a.isPlayer?'YOU':a.profile?.feared?`◆ ${a.name} [${a.profile.power}]`:a.name;
  ctx.font='700 11px system-ui';ctx.textAlign='center';const labelWidth=ctx.measureText(displayName).width+14;rr(ctx,s.x-labelWidth/2,s.y-49*zoom,labelWidth,17,2,'rgba(20,34,30,.88)');ctx.fillStyle=team;ctx.fillRect(s.x-labelWidth/2,s.y-47*zoom,2,12);ctx.fillStyle='#f0f3e3';ctx.fillText(displayName,s.x+1,s.y-37*zoom);
  if(a.hp<MAX_HP||a.isPlayer){rr(ctx,s.x-24*zoom,s.y-29*zoom,48*zoom,4,1,'rgba(13,26,23,.65)');const hpw=48*zoom*clamp(a.hp/MAX_HP,0,1);if(hpw>0)rr(ctx,s.x-24*zoom,s.y-29*zoom,hpw,4,1,a.hp<75?'#ef7666':team);}
  const slot=currentWeaponState(a);if(slot.reloading){const progress=reloadPhase(slot,now);rr(ctx,s.x-24*zoom,s.y-23*zoom,48*zoom,2,0,'rgba(15,28,24,.6)');if(progress>0)rr(ctx,s.x-24*zoom,s.y-23*zoom,48*zoom*progress,2,0,'#d9c27e');}
  if(now<a.hitFlash){ctx.strokeStyle='rgba(255,243,207,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,28*zoom,0,Math.PI*2);ctx.stroke();}
  if(now<a.spawnFlash){const p=(a.spawnFlash-now)/600;ctx.strokeStyle=`rgba(222,242,202,${p})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,(30+(1-p)*22)*zoom,0,Math.PI*2);ctx.stroke();}
}

function drawProjectiles(){
  ctx.lineCap='round';
  for(const p of state.projectiles){if(p.matchId!==visibleMatchId())continue;const a=worldToScreen(p.px,p.py),b=worldToScreen(p.x,p.y);if((a.x<-80&&b.x<-80)||(a.y<-80&&b.y<-80)||(a.x>cssW+80&&b.x>cssW+80)||(a.y>cssH+80&&b.y>cssH+80))continue;
    const shotgun=p.weapon.includes('Shotgun')||p.weapon==='Auto 12';ctx.strokeStyle=shotgun?'rgba(255,177,72,.22)':'rgba(255,224,97,.24)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.strokeStyle=shotgun?'rgba(255,226,160,.82)':'rgba(255,251,216,.94)';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#fff7c7';ctx.beginPath();ctx.arc(b.x,b.y,1.7,0,Math.PI*2);ctx.fill();
  }
}
function drawParticles(){
  for(const p of state.particles){if(p.matchId!==visibleMatchId())continue;const s=worldToScreen(p.x,p.y),alpha=1-p.age/p.life;if(alpha<=0)continue;ctx.globalAlpha=alpha;
    if(p.type==='casing'){ctx.save();ctx.translate(s.x,s.y);ctx.rotate((p.age*18)+(p.spin||0));rr(ctx,-2,-1,5,2,1,p.color||'#d9b45f');ctx.restore();}
    else if(p.type==='spark'){ctx.strokeStyle=p.color||'#ffe39a';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x-p.vx*.035,s.y-p.vy*.035);ctx.stroke();}
    else {ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(.4,p.size*alpha),0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;
}
function drawDamageNumbers(now){
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=3;
  for(const n of damageNumberSnapshot(now)){
    const s=worldToScreen(n.x,n.y),x=s.x+n.offsetX,y=s.y-58*(state.camera.zoom||1)-n.rise;
    if(x<-40||y<-40||x>cssW+40||y>cssH+40)continue;
    ctx.globalAlpha=n.alpha;ctx.font=`${n.killing?900:800} ${n.head?18:16}px system-ui`;
    ctx.strokeStyle='rgba(16,29,24,.88)';ctx.strokeText(n.text,x,y);ctx.fillStyle=n.head?'#ffd66b':'#f0f3e3';ctx.fillText(n.text,x,y);
  }
  ctx.restore();
}
function playerSpotsEnemy(a,p){
  if(!p||isAlly(a,p)||a.isPlayer)return true;
  return botIsInsidePlayerView(a,0)&&hasLOS(p,a);
}
function drawTacticalMap(full=false){
  if(state.mode!=='play'&&state.mode!=='spectate')return;
  const p=getPlayer(),mid=visibleMatchId();
  const pad=full?42:14;
  const maxW=full?Math.min(cssW*.84,980):Math.min(210,cssW*.40),maxH=full?Math.min(cssH*.78,680):Math.min(140,cssH*.22);
  const scale=Math.min((maxW-pad*2)/WORLD.w,(maxH-pad*2)/WORLD.h);
  const mw=WORLD.w*scale+pad*2,mh=WORLD.h*scale+pad*2;
  const x=full?(cssW-mw)/2:18,y=full?(cssH-mh)/2:(cssW<700?162:94);
  ctx.save();
  if(full){ctx.fillStyle='rgba(7,20,25,.58)';ctx.fillRect(0,0,cssW,cssH);}
  rr(ctx,x,y,mw,mh,full?8:4,full?'rgba(19,34,29,.97)':'rgba(19,34,29,.80)','rgba(216,229,201,.32)',1);
  const ox=x+pad,oy=y+pad;
  ctx.save();ctx.beginPath();ctx.rect(ox,oy,WORLD.w*scale,WORLD.h*scale);ctx.clip();
  ctx.fillStyle='#82ad64';ctx.fillRect(ox,oy,WORLD.w*scale,WORLD.h*scale);
  // roads
  ctx.fillStyle='#98a7a1';for(const r of roads)ctx.fillRect(ox+r.x*scale,oy+r.y*scale,r.w*scale,r.h*scale);
  // buildings + hard cover
  ctx.fillStyle='rgba(240,232,205,.92)';
  for(const f of floors)ctx.fillRect(ox+f.x*scale,oy+f.y*scale,f.w*scale,f.h*scale);
  ctx.fillStyle='rgba(62,78,80,.78)';
  for(const o of walls)ctx.fillRect(ox+o.x*scale,oy+o.y*scale,Math.max(1,o.w*scale),Math.max(1,o.h*scale));
  ctx.fillStyle='#3e8f4e';
  for(const t of trees){ctx.beginPath();ctx.arc(ox+t.x*scale,oy+t.y*scale,Math.max(1.5,t.r*scale),0,Math.PI*2);ctx.fill();}
  const actors=actorsInMatch(mid).filter(a=>!a.dead);
  for(const a of actors){
    if(state.mode==='play'&&p&&!playerSpotsEnemy(a,p))continue;
    const ax=ox+a.x*scale,ay=oy+a.y*scale;
    ctx.fillStyle=actorPresentation(a).color;
    ctx.strokeStyle=a.isPlayer?'#12343b':'rgba(15,37,42,.55)';ctx.lineWidth=a.isPlayer?2:1;
    ctx.beginPath();ctx.arc(ax,ay,full?5:3.4,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(!full&&p){
    ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=1;
    const view=viewBounds();ctx.strokeRect(ox+view.x*scale,oy+view.y*scale,view.w*scale,view.h*scale);
  }
  ctx.restore();
  ctx.fillStyle='#e1ead6';ctx.font=full?'900 15px system-ui':'900 9px system-ui';ctx.textAlign='left';
  ctx.fillText(full?'BRIGHTFIELD BLOCKS — FULL MAP':'MINIMAP',x+pad,y+(full?25:11));
  if(full){ctx.textAlign='right';ctx.font='800 11px system-ui';ctx.fillStyle='#acbca5';ctx.fillText(`${codeLabel(binding('fullMap'))} TO CLOSE`,x+mw-pad,y+25);}
  ctx.restore();
}
function render(now){
  window.SARFullscreen?.setCombatActive(state.running&&!state.paused&&!document.getElementById('modal').classList.contains('visible'));
  if(window.SAR25D?.render){window.SAR25D.render(renderSnapshot());return;}
  ctx.fillStyle='#253b30';ctx.fillRect(0,0,cssW,cssH);ctx.fillStyle='#e5e4d8';ctx.textAlign='center';ctx.font='600 16px system-ui';ctx.fillText(loading25d?'Loading arena…':'Arena renderer unavailable. Open Settings → View to retry.',cssW/2,cssH/2);
}
function renderSnapshot(){
  const id=visibleMatchId(),focus=getFocusActor(),player=getPlayer(),now=gameNow(),match=getMatch(id),presentation=matchTeamPresentation(match);
  return {world:WORLD,time:now,mode:state.mode,matchId:id,focus:{x:state.camera.x,y:state.camera.y},focusActorId:focus?.id??null,focusTeam:focus?.team??null,perspective:{mode:match?.mode,kind:presentation.kind,label:presentation.perspectiveLabel},zoom:state.camera.zoom||1,
    tactical:state.mode==='spectate'&&CONFIG.spectatorCamera==='TACTICAL',fullMap:input.fullMap,
    actors:actorsInMatch(id).map(a=>{
      const slot=currentWeaponState(a),weapon=WEAPONS[slot?.name]||WEAPONS['AR-15'],v=a.visual||{};
      return {id:a.id,name:a.name,x:a.x,y:a.y,angle:a.angle,team:a.team,participantId:TEAM_PRESENTATION.identity(a),presentation:presentation.actor(a),dead:a.dead,skin:a.skinIndex,skinPalette:{...SKINS[a.skinIndex]},weapon:slot?.name||'AR-15',hp:a.hp,maxHP:MAX_HP,isPlayer:a.isPlayer,
        mapVisible:!a.dead&&(state.mode!=='play'||!player||playerSpotsEnemy(a,player)),
        vx:a.vx,vy:a.vy,moving:!a.dead&&(v.move||0)>.025,sprinting:!a.dead&&a.sprinting,dashing:!a.dead&&now<a.dashUntil,ads:!a.dead&&a.ads,adsBlend:a.adsBlend||0,
        reloading:!a.dead&&!!slot?.reloading,reloadProgress:slot?reloadPhase(slot,now):0,reloadDuration:weapon.reload,reloadRemaining:slot?.reloading?Math.max(0,slot.reloadEnd-now)/1000:0,
        recoil:a.dead?0:recoilEnvelope(a,now),shotId:a.presentationShotId||0,lastShot:slot?.lastBullet??slot?.lastShot??-999,shotAge:Math.max(0,(now-(slot?.lastBullet??slot?.lastShot??-999))/1000),fireInterval:weapon.hitSpeed,
        muzzle:!a.dead&&a.muzzleUntil>now,muzzleFlash:!a.dead?clamp((a.muzzleUntil-now)/65,0,1):0,hit:!a.dead?clamp((a.hitFlash-now)/90,0,1):0,spawn:!a.dead?clamp((a.spawnFlash-now)/600,0,1):0,
        deadTime:a.dead?Math.max(0,now-a.deathAt)/1000:0,respawnRemaining:a.dead?Math.max(0,a.respawnAt-now)/1000:0,respawnProgress:a.dead?clamp((now-a.deathAt)/RESPAWN_MS,0,1):0,
        visual:{phase:v.phase||0,move:v.move||0,sprint:v.sprint||0,turn:v.turn??a.angle,lower:v.lower??a.angle,bob:v.bob||0,settle:v.settle||0}};
    }),
    projectiles:state.projectiles.filter(p=>p.matchId===id&&!p.dead).map(p=>({x:p.x,y:p.y,px:p.px,py:p.py,vx:p.vx,vy:p.vy,angle:Math.atan2(p.vy,p.vx),weapon:p.weapon})),
    particles:state.particles.filter(p=>p.matchId===id).map(p=>({type:p.type,x:p.x,y:p.y,age:p.age,life:p.life,size:p.size,color:p.color})),
    damageNumbers:damageNumberSnapshot(now),
    geometry:{roads,floors,solids,surfaces,decor,outerWorld}};
}
let loading25d=false;
async function ensure25d(){
  if(window.SAR25D||loading25d)return;
  loading25d=true;
  try{
    const module=await import('./renderer-25d.mjs');
    window.SAR25D=module.createRenderer(renderSnapshot());
    window.SAR25D.resize(innerWidth,innerHeight);
  }catch(error){
    console.error('2.5D renderer unavailable:',error);
    const status=document.getElementById('viewStatus');if(status)status.textContent='Arena renderer unavailable. Retry the view.';
  }finally{loading25d=false;}
}

// -------------------- UI --------------------
function addKillfeed(killer,victim,weapon,head){
  const el=document.createElement('div');el.className='feed-item';
  const capture=a=>({id:a.id,participantId:TEAM_PRESENTATION.identity(a),team:a.team,name:a.name});
  el.sarEvent={killer:capture(killer),victim:capture(victim),matchId:killer.matchId,matchKey:getMatch(killer.matchId)?.matchId,weapon,head};
  paintKillfeedItem(el);
  const feed=document.getElementById('killfeed');feed.prepend(el);while(feed.children.length>6)feed.lastChild.remove();setTimeout(()=>el.remove(),5200);
}
function paintKillfeedItem(el){
  const data=el.sarEvent;if(!data)return;
  const match=getMatch(data.matchId),presentation=matchTeamPresentation(match);
  el.hidden=data.matchId!==visibleMatchId()||data.matchKey!==match?.matchId;
  const person=a=>{const p=presentation.actor(a);return `<em style="color:${p.color}"><small>${p.label}</small> ${escapeHtml(a.name)}</em>`;};
  const signature=JSON.stringify([presentation.kind,presentation.viewerId,presentation.followId]);if(el.dataset.perspective===signature)return;el.dataset.perspective=signature;
  el.innerHTML=`${person(data.killer)} ${data.head?'✦ ':''}<b>${escapeHtml(data.weapon)}</b> ${person(data.victim)}`;
}
function refreshKillfeed(){for(const el of document.getElementById('killfeed').children)paintKillfeedItem(el);}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function matchHudState(match,focus,now){
  const ffa=match.mode==='deathmatch',rows=ffa?standings(match):[],row=rows.find(r=>r.id===focus?.id),presentation=matchTeamPresentation(match);
  const placement=row?1+rows.filter(r=>r.kills>row.kills||(r.kills===row.kills&&(r.deaths<row.deaths||(r.deaths===row.deaths&&r.damage>row.damage)))).length:0;
  return {ffa,mode:ffa?'DEATHMATCH':match.sessionType==='custom'?'CUSTOM TDM':'5V5 TDM',target:match.limit+' KILLS',placement,total:rows.length,
    clock:match.status==='cooldown'?'NEXT '+formatTime(Math.ceil(slotCooldownRemaining(match)/1000)):match.overtime?'OT':formatTime(Math.ceil(matchRemainingMs(match,now)/1000)),
    score:match.status==='cooldown'?'MATCH COMPLETE':ffa?`<span>${focus?.stats.kills||0} KILLS</span> <small>LEADER ${rows[0]?.kills||0}</small>`:teamScoreHtml(match,presentation)};
}
function updateHud(now){
  const p=getPlayer();if(!p)return;
  const match=getMatch(p.matchId);if(!match)return;
  refreshKillfeed();
  const sw=currentWeaponState(p),hud=matchHudState(match,p,now);
  document.getElementById('hud').dataset.mode=match.mode;
  document.getElementById('hudModeLabel').textContent=hud.mode;
  document.getElementById('hudTargetLabel').textContent=hud.target;
  document.getElementById('hudScoreHeading').textContent=hud.ffa?'KILLS / LEADER':'SCORE';
  document.getElementById('uptimeLabel').textContent=hud.clock;
  const scoreEl=document.getElementById('teamScoreLabel');
  scoreEl.innerHTML=hud.score;
  document.getElementById('hpText').textContent=Math.max(0,Math.ceil(p.hp));
  document.getElementById('hpFill').style.width=(clamp(p.hp/MAX_HP,0,1)*100)+'%';
  document.getElementById('weaponName').textContent=sw.name;
  document.getElementById('ammoText').textContent=sw.ammo;
  document.getElementById('reserveText').textContent='/ '+sw.reserve;
  document.getElementById('reloadText').classList.toggle('hidden',!sw.reloading);
  const ability=document.getElementById('abilityText');if(ability){const dashLeft=Math.max(0,(p.dashCooldownUntil-now)/1000),regenWait=p.hp<=REGEN_THRESHOLD&&!p.regenActive?Math.max(0,(REGEN_DELAY_MS-(now-p.lastDamageAt))/1000):0;ability.textContent=`${p.ads?'ADS • ':''}DASH ${dashLeft>0?dashLeft.toFixed(1)+'s':'READY'}${p.regenActive?' • REGEN ACTIVE':(regenWait>0?' • REGEN '+regenWait.toFixed(1)+'s':'')}`;ability.classList.toggle('regen-active',p.regenActive);}
  document.getElementById('hudIdentityHeading').textContent=hud.ffa?'YOUR PLACEMENT':'YOUR TEAM';
  const presentation=actorPresentation(p),teamName=hud.ffa?'#'+hud.placement+' / '+hud.total:presentation.label;
  const teamLabel=document.getElementById('teamLabel');teamLabel.textContent=teamName;teamLabel.style.color=presentation.color;
  document.getElementById('kdText').innerHTML=`<span><small>K</small><b>${p.stats.kills}</b></span><span><small>D</small><b>${p.stats.deaths}</b></span><span><small>A</small><b>${p.stats.assists}</b></span><span><small>K/D</small><b>${kdDisplay(p.stats.kills,p.stats.deaths)}</b></span>`;
  const resp=document.getElementById('respawnText');resp.classList.toggle('hidden',!p.dead);
  if(p.dead)resp.textContent=`RESPAWNING IN ${Math.max(1,Math.ceil((p.respawnAt-now)/1000))}`;
  if(!document.getElementById('scoreboard').classList.contains('hidden'))renderScoreboard();
}
function updateSpectatorHud(now){
  const a=spectatedActor(),m=getMatch(state.spectateMatchId);if(!a||!m)return;const hud=matchHudState(m,a,now),presentation=matchTeamPresentation(m);
  refreshKillfeed();
  const name=document.getElementById('spectateName'),power=document.getElementById('spectatePower'),game=document.getElementById('spectateGame'),score=document.getElementById('spectateScore'),clock=document.getElementById('spectateClock'),weapon=document.getElementById('spectateWeapon');
  if(name){name.textContent=a.name;name.dataset.botProfile=a.name;}if(power)power.textContent=a.profile?`PWR ${a.profile.power} • ${m.mode==='deathmatch'?'FFA':presentation.actor(a).label} • ${strategicRole(a.profile.archetype)}${a.profile.feared?' • FEARED':''} • ${a.stats.kills}/${a.stats.deaths}/${a.stats.assists} K/D/A`:'';
  if(game)game.textContent=`GAME ${state.spectateMatchId+1} · ${hud.mode} · ${presentation.perspectiveLabel}`;if(score)score.innerHTML=hud.score;if(clock)clock.textContent=hud.clock;if(weapon)weapon.textContent=currentWeaponState(a).name;
  document.getElementById('spectateScoreHeading').textContent=hud.ffa?`PLACE ${hud.placement}/${hud.total} · TARGET ${m.limit}`:`TARGET ${m.limit}`;
  document.querySelectorAll('[data-spectator=blue],[data-spectator=red]').forEach(button=>button.classList.toggle('hidden',hud.ffa));
  document.getElementById('spectatorHud').dataset.team=presentation.actor(a).side;
  document.querySelectorAll('[data-spectator-match]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.spectatorMatch)===state.spectateMatchId)));
  document.querySelectorAll('[data-spectator="follow"],[data-spectator="25d"],[data-spectator="tactical"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.spectator==='tactical'?CONFIG.spectatorCamera==='TACTICAL':CONFIG.spectatorCamera!=='TACTICAL')));
}

function spectatorAction(action){if(state.mode!=='spectate')return;
  if(action==='previous-bot'||action==='next-bot')cycleSpectateActor(action==='previous-bot'?-1:1);
  else if(action==='previous-match'||action==='next-match')cycleSpectateMatch(action==='previous-match'?-1:1);
  else if(action==='blue'||action==='red'){const presentation=matchTeamPresentation(getMatch(state.spectateMatchId)),list=presentation.ffa?[]:actorsInMatch(state.spectateMatchId).filter(a=>presentation.actor(a).side===action),index=list.findIndex(a=>a.id===state.spectateActorId);if(list.length)state.spectateActorId=list[(index+1)%list.length].id;}
  else if(action==='stats'){const a=spectatedActor();if(a)renderBotRecord(a.name);}
  else if(action==='loadout'){const a=spectatedActor();if(a){showModal('<div class="eyebrow">SPECTATOR / CURRENT KIT</div><h2>'+escapeHtml(a.name)+'</h2><div class="option-grid loadout-grid">'+a.slots.map(slot=>loadoutCard(slot.name,currentMetaRows(),true)).join('')+'</div>','spectate-loadout');requestAnimationFrame(()=>document.querySelectorAll('[data-weapon-preview]').forEach(c=>drawWeaponPreview(c,c.dataset.weaponPreview)));}}
  else if(['follow','tactical','25d'].includes(action)){CONFIG.spectatorCamera=action==='tactical'?'TACTICAL':'FOLLOW';CONFIG.viewMode='2.5D';ensure25d();saveTelemetry();}
  updateSpectatorHud(gameNow());
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-spectator]');if(button)spectatorAction(button.dataset.spectator);
  const direct=e.target.closest('[data-spectator-match],[data-watch-match]');if(!direct)return;
  const match=Number(direct.dataset.spectatorMatch??direct.dataset.watchMatch);if(!Number.isInteger(match)||match<0||match>=MATCH_COUNT)return;
  if(direct.dataset.watchMatch!==undefined)startSpectate();
  if(state.mode==='spectate'){cycleSpectateMatch(match-state.spectateMatchId);updateSpectatorHud(gameNow());}
});
document.addEventListener('change',e=>{if(e.target.id==='enableDebugPanel'&&debugOwner()){STORE.set(debugKey(),String(!!e.target.checked));updateDebugPanel(gameNow()+500);}});

function renderScoreboard(){
  const mid=state.playerMatchId!==null?state.playerMatchId:(state.mode==='spectate'?state.spectateMatchId:null);if(mid===null)return;
  const match=getMatch(mid);if(!match)return;const ffa=match.mode==='deathmatch',ranks=ffa?standings(match):[],presentation=matchTeamPresentation(match);
  const arr=actorsInMatch(mid).slice().sort((a,b)=>ffa?ranks.findIndex(r=>r.id===a.id)-ranks.findIndex(r=>r.id===b.id):a.team-b.team||b.stats.kills-a.stats.kills||a.stats.deaths-b.stats.deaths);
  document.getElementById('scoreModeLabel').textContent=(ffa?'DEATHMATCH':'TDM')+' · TARGET '+match.limit;
  document.getElementById('scoreGroupHeading').textContent=ffa?'Place':'Team';
  document.getElementById('scoreRows').innerHTML=arr.map(a=>{
    const display=presentation.actor(a),group=ffa?matchHudState(match,a,gameNow()).placement:display.label;
    return `<div class="score-row"><span style="color:${display.color};font-weight:900">${group}</span><strong>${escapeHtml(a.name)}</strong><span>${a.isPlayer?'—':a.profile?.power??'—'}</span><span>${a.stats.kills}</span><span>${a.stats.deaths}</span><span>${a.stats.assists}</span><span><strong>${kdDisplay(a.stats.kills,a.stats.deaths)}</strong></span><span>${Math.round(a.stats.damage)}</span><span>${escapeHtml(currentWeaponState(a).name)}</span></div>`;
  }).join('');
}
let modalReturnFocus=null;
function showModal(html,view=''){
  if(settingsCapture){settingsCapture.html=html;return;}
  html=window.SARPhone?.decoratePanel?.(html,view)??html;
  if(!document.getElementById('modal').classList.contains('visible'))modalReturnFocus=document.activeElement;
  const content=document.getElementById('modalContent'),active=document.activeElement;
  const focusAttribute=content.contains?.(active)?['id','data-settings-tab','data-set-primary','data-set-sidearm','data-set-skin','data-bind'].find(name=>active.hasAttribute(name)):null;
  const focusValue=focusAttribute?active.getAttribute(focusAttribute):null;
  content.innerHTML=html;content.dataset.view=view;
  const shell=document.querySelector('#modal .modal');if(shell)shell.classList.toggle('meta-wide',(view==='meta'||view==='bots'));
  if(shell)shell.scrollTop=0;document.getElementById('modal').scrollTop=0;
  clearInput();document.getElementById('modal').classList.add('visible');
  releaseGameplayPointerLock();
  const replacement=focusAttribute?[...content.querySelectorAll('['+focusAttribute+']')].find(node=>node.getAttribute(focusAttribute)===focusValue):null;
  (replacement||shell)?.focus?.({preventScroll:true});
}
function closeModal(){window.SARPhone?.suspend?.();document.getElementById('modal').classList.remove('visible');document.getElementById('modalContent').dataset.view='';const shell=document.querySelector('#modal .modal');if(shell)shell.classList.remove('meta-wide');clearInput();if(modalReturnFocus?.isConnected)modalReturnFocus.focus?.({preventScroll:true});modalReturnFocus=null;requestGameplayPointerLock();}
function previewContext(c){
  const w=c.clientWidth||Number(c.getAttribute('width')),h=c.clientHeight||Number(c.getAttribute('height'));
  c.width=Math.round(w*DPR);c.height=Math.round(h*DPR);const g=c.getContext('2d');g.setTransform(DPR,0,0,DPR,0,0);g.clearRect(0,0,w,h);return {g,w,h};
}
const previewRequests=new WeakMap();
async function paintModelPreview(c,options){if(!c)return;previewContext(c);const token={};previewRequests.set(c,token);
  try{inspectionModule??=import('./inspect-25d.mjs');const module=await inspectionModule;if(previewRequests.get(c)!==token||c.isConnected===false)return;await module.paintInspection(c,options);}
  catch(error){const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#35473c';g.font='14px system-ui';g.fillText('Model unavailable',14,28);console.warn('Model preview:',error.message);}
}
function drawWeaponPreview(c,name){void paintModelPreview(c,{kind:'weapon',weapon:name});}
function drawOperatorPreview(c,skinIndex){void paintModelPreview(c,{kind:'operator',skin:skinIndex,palette:SKINS[skinIndex],weapon:SKINS[skinIndex].name==='Steel Recon'?'SR-Aug':CONFIG.primary});}
function paintLobbyKit(){
  void paintModelPreview(document.getElementById('lobbyOperator'),{kind:'operator',skin:CONFIG.skin,palette:SKINS[CONFIG.skin],unarmed:true});
  drawWeaponPreview(document.getElementById('lobbyWeapon'),CONFIG.primary);
  document.getElementById('lobbyOperatorName').textContent=SKINS[CONFIG.skin].name.toUpperCase();
  document.getElementById('lobbyWeaponName').textContent=CONFIG.primary;
}
function weaponShotTime(w,index){const count=w.burstCount||1;return Math.floor(index/count)*w.hitSpeed+(index%count)*(w.burstSpacing||0);}
function weaponSheet(name){const w=WEAPONS[name],shots=damage=>Math.ceil(MAX_HP/damage),ttk=n=>{const i=n-1,reloads=Math.floor(i/w.mag);return reloads*(weaponShotTime(w,w.mag-1)+w.reload)+weaponShotTime(w,i%w.mag);};return {w,rpm:60*(w.burstCount||1)/w.hitSpeed,bodyShots:shots(w.damage),headShots:shots(w.head),bodyTtk:ttk(shots(w.damage)),headTtk:ttk(shots(w.head))};}
function weaponDescription(name){const w=WEAPONS[name],cadence=60*(w.burstCount||1)/w.hitSpeed;
  if(w.burstCount)return `Three independently resolved rounds per burst, ${w.burstSpacing*1000} ms apart. Hold fire to repeat every ${w.hitSpeed*1000} ms; use ADS for controlled mid-range fire.`;
  if(name==='SPAS-12')return 'Three-shell shotgun with twelve independently resolved pellets per shell, moderate reach and a measured one-second follow-up.';
  if(w.pellets>1)return w.auto?'Automatic close-range shotgun for repeated bursts; steep falloff rewards closing distance.':'High-damage close-range burst with powerful headshots; a slow follow-up and steep falloff demand timing.';
  if(w.preferred>=1400)return 'Long-range rifle with high single-shot damage and slow follow-ups. Use ADS and measured shots.';
  if(w.preferred>=1200)return 'Marksman rifle with strong headshot damage and long damage retention; deliberate fire rewards precision.';
  if(w.mag>=60)return 'Large-magazine sustained pressure with strong range retention; plan around its long reload.';
  if(w.type==='sidearm')return w.auto?'Automatic emergency sidearm with an extended magazine, fast cycling slide and wider sustained-fire spread.':cadence>250?'Fast follow-up sidearm with a compact magazine and short damage-retention range.':'Heavy sidearm with deliberate follow-up shots; useful for finishing close engagements.';
  if(w.preferred<800)return (cadence>200?'Fast':'Measured')+' '+(w.falloffStart>=20?'ranged SMG for mid-range pressure':'close-range automatic for tracking fights')+'; ADS tightens the actual projectile cone.';
  return w.damage>=32?'Higher-damage rifle for committed mid-range fire; its slower reload rewards magazine discipline.':'Balanced rifle with tight base spread, moderate damage and dependable mid-range pressure.';
}
function weaponBars(name){const all=Object.values(WEAPONS),w=WEAPONS[name],norm=(v,fn)=>{const vals=all.map(fn),min=Math.min(...vals),max=Math.max(...vals);return max===min?1:(v-min)/(max-min);};
  const accuracy=1-norm(w.spread,v=>v.spread),cadence=norm((w.burstCount||1)/w.hitSpeed,v=>(v.burstCount||1)/v.hitSpeed);
  return [['Damage',norm(w.damage,v=>v.damage)],['Fire rate',cadence],['Accuracy',accuracy],['Range',.6*norm(w.falloffStart,v=>v.falloffStart)+.4*norm(1/w.falloff,v=>1/v.falloff)],['Magazine',norm(w.mag,v=>v.mag)],['Reload',1-norm(w.reload,v=>v.reload)],['Control',.7*accuracy+.3*(1-cadence)]];
}
function loadoutMetaHtml(name,rows=currentMetaRows()){const category=rows.filter(r=>WEAPONS[r.name].type===WEAPONS[name].type),rank=category.findIndex(r=>r.name===name),r=category[rank];if(!r)return 'Waiting for combat samples';return `<span>${WEAPONS[name].type==='sidearm'?'SIDEARM':'PRIMARY'} META ${r.engagements>=5?'#'+(rank+1):'—'}</span><strong>Score ${r.engagements>=5?r.score.toFixed(1):'LOW SAMPLE'}</strong><span>Sample ${(r.confidence*100).toFixed(0)}%${r.confidence<.6?' · provisional':''}</span>`;}
function loadoutCard(name,rows,readOnly=false){const d=weaponSheet(name),w=d.w,primary=w.type==='primary',equipped=CONFIG[primary?'primary':'sidearm']===name;
  const stats=[['Body damage',w.damage],['Headshot damage',w.head],['Body TTK',d.bodyTtk.toFixed(2)+'s'],['Headshot TTK',d.headTtk.toFixed(2)+'s'],['Magazine / reserve',w.mag+' / '+w.reserve],['Reload',w.reload.toFixed(2)+'s'],['Preferred range',w.preferred+' / '+(w.preferred/TILE).toFixed(2)+' tiles']];
  const advanced=[['Calculated RPM',d.rpm.toFixed(0)],['Hip Fire Spread',w.spread.toFixed(2)+'°'],['Hip Walk Spread',w.walkSpread.toFixed(2)+'°'],['Sprint Hip Spread',w.sprintSpread.toFixed(2)+'°'],['ADS Spread',w.adsSpread.toFixed(2)+'°'],['Falloff Start',w.falloffStart+' tiles'],['Falloff / Tile',(w.falloff*100).toFixed(2)+'%'],['Projectile Speed',w.speed+' tiles/s'],['Body Hits To Kill',d.bodyShots+(w.pellets>1?' blasts':'')],['Head Hits To Kill',d.headShots+(w.pellets>1?' blasts':'')],[w.burstCount?'Rounds / burst':'Pellets / shot',w.burstCount||w.pellets],['Cycle',w.hitSpeed.toFixed(2)+'s'],...(w.burstCount?[['Intra-burst spacing',w.burstSpacing.toFixed(3)+'s']]:[])];
  const sheet=values=>'<dl class="weapon-sheet">'+values.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>';
  return '<article class="option-card loadout-card '+(equipped?'selected':'')+'"><span class="kit-state">'+(equipped?'EQUIPPED':primary?'PRIMARY':'SIDEARM')+'</span><canvas class="weapon-preview" data-weapon-preview="'+name+'" width="280" height="110"></canvas><div class="eyebrow">'+(primary?'PRIMARY':'SIDEARM')+' · '+(w.burstCount?'BURST':w.auto?'AUTOMATIC':'SEMI-AUTO')+'</div><h3>'+name+'</h3><strong class="weapon-role">'+escapeHtml(w.role)+'</strong><p class="weapon-description">'+weaponDescription(name)+'</p>'+sheet(stats)+'<div class="loadout-live-meta" data-loadout-meta="'+name+'">'+loadoutMetaHtml(name,rows)+'</div><details class="advanced-stats"><summary>ADVANCED STATS</summary>'+sheet(advanced)+'<div class="weapon-bars">'+weaponBars(name).map(([label,value])=>'<div><span>'+label+'</span><i><b style="width:'+((8+clamp(value,0,1)*92).toFixed(1))+'%"></b></i></div>').join('')+'</div></details>'+(readOnly?'':'<button data-set-'+(primary?'primary':'sidearm')+'="'+name+'">'+(equipped?'EQUIPPED':'EQUIP')+'</button>')+'</article>';
}
let inspectionModule=null,inspectionRequest=0;
function inspectorHtml(kind){return '<section class="model-inspector" data-inspector="'+kind+'"><div class="inspection-toolbar"><strong>'+(kind==='weapon'?'WEAPON INSPECTION':'OPERATOR INSPECTION')+'</strong>'+(kind==='weapon'?'<select id="inspectionWeapon" aria-label="Inspect weapon">'+Object.keys(WEAPONS).map(n=>'<option '+(n===CONFIG.primary?'selected':'')+'>'+n+'</option>').join('')+'</select>':'<span>'+escapeHtml(SKINS[CONFIG.skin].name)+'</span>')+'</div><canvas id="inspectionCanvas" width="720" height="260" aria-label="Model inspection"></canvas><label class="inspection-rotation">ROTATION <input id="inspectionRotation" type="range" min="-75" max="75" step="3" value="0"></label><p class="meta-note" id="inspectionStatus"></p></section>';}
async function paintInspection(){const c=document.getElementById('inspectionCanvas'),host=document.querySelector('[data-inspector]');if(!c||!host)return;const request=++inspectionRequest,kind=host.dataset.inspector,weapon=kind==='weapon'?document.getElementById('inspectionWeapon').value:SKINS[CONFIG.skin].name==='Steel Recon'?'SR-Aug':CONFIG.primary;
 const status=document.getElementById('inspectionStatus');if(status)status.textContent='Loading model…';
 try{inspectionModule??=import('./inspect-25d.mjs');const module=await inspectionModule;if(request!==inspectionRequest||!c.isConnected)return;await module.paintInspection(c,{kind,weapon,skin:CONFIG.skin,palette:SKINS[CONFIG.skin],rotation:Number(document.getElementById('inspectionRotation')?.value||0)*Math.PI/180});if(status)status.textContent='';}
 catch(error){if(request===inspectionRequest&&status)status.textContent='Model unavailable. Reopen to retry.';}
}
document.addEventListener('input',e=>{if(e.target.id==='inspectionRotation')paintInspection();});
document.addEventListener('change',e=>{if(e.target.id==='inspectionWeapon')paintInspection();if(e.target.id==='metaMobileSort'){TABLE_SORT.meta={key:e.target.value,dir:e.target.value==='name'?1:-1};updateMetaTable();}});
function renderLoadoutModal(){const rows=currentMetaRows();showModal(`<div class="eyebrow">ARMORY / EQUIPMENT</div><h2>Loadout</h2><p class="page-intro">Build your kit. Inspect every angle.</p>${inspectorHtml('weapon')}<h3>Primary</h3><div class="option-grid loadout-grid">${PRIMARYS.map(n=>loadoutCard(n,rows)).join('')}</div><h3 style="margin-top:28px">Sidearm</h3><div class="option-grid loadout-grid">${SIDEARMS.map(n=>loadoutCard(n,rows)).join('')}</div>`,'loadout');paintInspection();paintLobbyKit();requestAnimationFrame(()=>document.querySelectorAll('[data-weapon-preview]').forEach(c=>drawWeaponPreview(c,c.dataset.weaponPreview)));}
function updateLoadoutMeta(){if(document.getElementById('modalContent').dataset.view!=='loadout')return;const rows=currentMetaRows();document.querySelectorAll('[data-loadout-meta]').forEach(el=>{el.innerHTML=loadoutMetaHtml(el.dataset.loadoutMeta,rows);});}

function renderOperatorModal(){
  const desc=['Olive field layers. A dependable urban kit.','Light webbing and desert tones. Built for the scout.','Low-profile gear with a clean, mobile silhouette.','Cool blue accents on a close-quarters strike kit.','Heavy plates and reinforced protective gear.','Steel finishes, recon equipment and the SR-Aug.','Woodland layers with practical field equipment.','Dark navy armor and restrained operations details.'];
  const cards=SKINS.map((s,i)=>`<div class="option-card operator-card ${CONFIG.skin===i?'selected':''}"><span class="kit-state">${CONFIG.skin===i?'EQUIPPED':'OPERATOR / '+String(i+1).padStart(2,'0')}</span><canvas class="operator-preview" data-operator-preview="${i}" width="220" height="150"></canvas><div class="eyebrow">OPERATOR ${String(i+1).padStart(2,'0')}</div><h3>${s.name}</h3><p>${desc[i]}</p><button data-set-skin="${i}">${CONFIG.skin===i?'SELECTED':'SELECT'}</button></div>`).join('');
  showModal(`<div class="eyebrow">ROSTER / PERSONALIZE</div><h2>Operator</h2><p class="page-intro">Eight identities. Your choice of field kit. Cosmetic selection; identical hitboxes.</p>${inspectorHtml('operator')}<div class="option-grid operator-grid">${cards}</div>`,'operator');
  paintInspection();paintLobbyKit();requestAnimationFrame(()=>document.querySelectorAll('[data-operator-preview]').forEach(c=>drawOperatorPreview(c,Number(c.dataset.operatorPreview))));
}
const TABLE_SORT={meta:{key:'score',dir:-1},bots:{key:'kd',dir:-1}};
function ratio(n,d){return d>0?n/d:(n>0?n:0);}
function kdDisplay(k,d){return d>0?(k/d).toFixed(2):(k>0?'∞':'0.00');}
function kdSortValue(k,d){return d>0?k/d:(k>0?Infinity:0);}
function finiteNumber(v,fallback=0){v=Number(v);return Number.isFinite(v)?v:fallback;}
function telemetryView(m){
  // Never rewrite persistent history here. These guards only prevent impossible/corrupt
  // values from leaking into live calculations or UI percentages.
  const shots=Math.max(0,finiteNumber(m.shots)),hits=clamp(finiteNumber(m.hits),0,shots);
  const kills=Math.max(0,finiteNumber(m.kills)),deaths=Math.max(0,finiteNumber(m.deaths));
  const headshots=clamp(finiteNumber(m.headshots),0,kills),damage=Math.max(0,finiteNumber(m.damage));
  const equippedTime=Math.max(0,finiteNumber(m.equippedTime)),picks=Math.max(0,finiteNumber(m.picks));
  const killDistanceN=clamp(finiteNumber(m.killDistanceN),0,kills),killDistance=Math.max(0,finiteNumber(m.killDistance));
  const engagementDistanceN=clamp(finiteNumber(m.engagementDistanceN),0,shots),engagementDistance=Math.max(0,finiteNumber(m.engagementDistance));
  const classifiedKills=clamp(finiteNumber(m.classifiedKills),0,kills),soloKills=clamp(finiteNumber(m.soloKills),0,classifiedKills),finisherKills=clamp(finiteNumber(m.finisherKills),0,classifiedKills);
  return {name:m.name,kills,deaths,headshots,damage,shots,hits,equippedTime,picks,killDistanceN,killDistance,engagementDistanceN,engagementDistance,classifiedKills,soloKills,finisherKills};
}
function bayesRate(events,exposure,priorMean,priorExposure){
  exposure=Math.max(0,exposure);priorMean=Math.max(0,finiteNumber(priorMean));
  return (Math.max(0,events)+priorMean*priorExposure)/Math.max(.000001,exposure+priorExposure);
}
function relativeComponent(value,baseline,scale=24){
  // Log-relative scoring treats equal proportional improvements equally and avoids
  // percentile jumps caused by a field of only nine weapons.
  if(!(baseline>0)||!(value>=0))return 50;
  const eps=Math.max(1e-9,baseline*.001);
  return clamp(50+scale*Math.log2((value+eps)/(baseline+eps)),0,100);
}
// All counters enter here at the real combat event, never through inferred outcomes.
function skillBand(a){return a.isPlayer?'human':String(Math.floor((a.profile.power-20)/20)*20+20);}
function patchRecord(a,weapon){
  const patch=SAVE.patchState,band=skillBand(a);
  patch.skillStrata[band]??={};patch.skillStrata[band][weapon]??=blankWeaponMeta(weapon);
  const identity=a.isPlayer?'@human:'+a.name:a.name;patch.perBot[identity]??={};patch.perBot[identity][weapon]??={k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
  return [patch.skillStrata[band][weapon],patch.perBot[identity][weapon]];
}
function recordPatchEvent(a,weapon,key,value=1){
  recordParticipantEvent(a,weapon,key,value);
  if(!officialTdm(a)){const alias=key==='kills'?'k':key==='deaths'?'d':key;a.matchWeaponStats??={};a.matchWeaponStats[weapon]??={k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};a.matchWeaponStats[weapon][alias]=(a.matchWeaponStats[weapon][alias]||0)+value;return;}
  const [s,b]=patchRecord(a,weapon);s[key]=(s[key]||0)+value;
  const scope=revisionSample();if(scope!==SAVE.patchState){const alias=key==='kills'?'k':key==='deaths'?'d':key,identity=a.isPlayer?'@human:'+a.name:a.name,band=skillBand(a);scope.meta[weapon][key]=(scope.meta[weapon][key]||0)+value;scope.perBot[identity]??={};scope.perBot[identity][weapon]??={};scope.perBot[identity][weapon][alias]=(scope.perBot[identity][weapon][alias]||0)+value;scope.skillStrata[band]??={};scope.skillStrata[band][weapon]??=blankWeaponMeta(weapon);scope.skillStrata[band][weapon][key]=(scope.skillStrata[band][weapon][key]||0)+value;}
  const alias=key==='kills'?'k':key==='deaths'?'d':key;b[alias]=(b[alias]||0)+value;
  a.matchWeaponStats??={};a.matchWeaponStats[weapon]??={k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};a.matchWeaponStats[weapon][alias]=(a.matchWeaponStats[weapon][alias]||0)+value;
  if(['kills','deaths','damage','shots','hits','headshots'].includes(key))recordSeasonEvent(a,key,value);
  if(key==='equippedTime')recordSeasonEvent(a,'timeAlive',value);
}
function recordEquipped(a,dt){
  const w=currentWeaponState(a).name;actorMeta(a,w).equippedTime+=dt;a.weaponUsage[w].equippedTime+=dt;recordPatchEvent(a,w,'equippedTime',dt);
  if(!a.isPlayer){const b=botData(a),f=b.familiarity[w];b.familiarity[w]=Math.min(100,f+(100-f)*dt/36000);}
}
function formLabel(v){return v>=6?'HOT':v>=2?'GOOD':v<=-6?'SLUMP':v<=-2?'COLD':'NORMAL';}
function recordBotResult(a,winner){
  const b=botData(a),s=a.stats,p=a.profile.personality;
  const momentum=clamp((s.kills-s.deaths)/Math.max(3,s.kills+s.deaths)*8+(a.team===winner?2:-2),-10,10);
  b.recentForm=clamp(b.recentForm*.76+momentum*.24,-10,10);
  b.recentMatches.push({at:wallNow(),patchId:SAVE.patchState.id,mode:getMatch(a.matchId)?.mode||'tdm',sessionType:getMatch(a.matchId)?.sessionType||'standard',eligible:officialTdm(a),matchId:getMatch(a.matchId)?.matchId,aiRevision:AI_REVISION,primary:a.slots[0].name,weapons:cloneData(a.matchWeaponStats||{}),won:a.team===winner,kills:s.kills,deaths:s.deaths,damage:s.damage,...(a.completedSocialMatch?{social:cloneData(a.completedSocialMatch)}:{})});
  b.recentMatches=b.recentMatches.slice(-20);
  a.traits.confidence=clamp(p.confidence+b.recentForm*.015+rand(-.06,.06),.1,.9);
}
function recordCompletedParticipant(a){const s=a.stats;diagnostics.completedParticipants++;diagnostics.completedKills+=s.kills;diagnostics.completedDeaths+=s.deaths;diagnostics.completedDamage+=s.damage;diagnostics.completedTaken+=s.taken;}

function metaPhase(rows=weaponMetrics()){
  const primary=rows.filter(r=>PRIMARYS.includes(r.m.name)),full=primary.filter(r=>r.confidence>=.999).length,mean=primary.reduce((s,r)=>s+r.confidence,0)/PRIMARYS.length;
  return {phase:full>=7&&mean>.9?'STABLE':mean>=.35?'DEVELOPING':'DISCOVERY',fullySampled:full,primaryCount:PRIMARYS.length,patch:SAVE.patchState.id,label:SAVE.patchState.label,updateName:SAVE.patchState.updateName,balanceVersion:SAVE.patchState.balanceVersion,matches:revisionSample().completedMatches,aiRevision:AI_REVISION};
}
const diagnostics={completedMatches:0,completedParticipants:0,completedKills:0,completedDeaths:0,completedDamage:0,completedTaken:0,matchScoreKills:0,stuckRecoveries:0,maxStuckDetectionSeconds:0,buildingEntries:0,buildingExits:0,exitPlans:0,adsShots:0,botAdsShots:0,botAdsSeconds:0,pathSearches:0,pathCacheHits:0,actions:{},maxParticles:0};
function weaponMetrics(sample=revisionSample()){
  const rows=Object.values(sample.meta).filter(m=>WEAPONS[m.name]).map(raw=>{const m=telemetryView(raw);return {raw,m,minutes:m.equippedTime/60,engagements:m.kills+m.deaths};});
  const sum=records=>records.reduce((t,m)=>{for(const k of ['kills','deaths','damage','shots','hits','headshots','equippedTime'])t[k]+=(m[k]||0);return t;},{kills:0,deaths:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0});
  const bands=Object.entries(sample.skillStrata);
  // Each category has its own observed league and Power-band baselines. Sidearms
  // are compared with sidearms, with no fixed penalty or primary-weapon prior.
  const cohorts=Object.fromEntries(['primary','sidearm'].map(type=>{
    const total=sum(rows.filter(r=>WEAPONS[r.m.name].type===type).map(r=>r.m));
    const league={kd:(total.kills+1)/(total.deaths+1),kpm:total.kills/Math.max(.01,total.equippedTime/60),dpm:total.damage/Math.max(.01,total.equippedTime/60),acc:total.hits/Math.max(1,total.shots),hs:total.headshots/Math.max(1,total.kills)};
    const bandWeights=bands.map(([band,data])=>({band,data,weight:sum(Object.entries(data).filter(([n])=>WEAPONS[n]?.type===type).map(([,m])=>m)).equippedTime/Math.max(.01,total.equippedTime)}));
    return [type,{total,league,bandWeights}];
  }));
  for(const r of rows){
    const m=r.m,type=WEAPONS[m.name].type,{total,league,bandWeights}=cohorts[type];
    r.kd=ratio(m.kills,m.deaths);r.accuracy=m.hits/Math.max(1,m.shots);r.hs=m.headshots/Math.max(1,m.kills);r.killPerPick=m.kills/Math.max(1,m.picks);r.avgDamage=m.damage/Math.max(1,m.picks);r.kpm=m.kills/Math.max(.001,r.minutes);r.dpm=m.damage/Math.max(.001,r.minutes);r.usage=m.equippedTime/Math.max(.001,total.equippedTime);r.usageSampled=total.equippedTime>0;r.range=m.killDistanceN?m.killDistance/m.killDistanceN/TILE:null;
    r.engRange=m.engagementDistanceN?m.engagementDistance/m.engagementDistanceN/TILE:null;
    r.soloPct=m.classifiedKills?m.soloKills/m.classifiedKills:null;r.finisherPct=m.classifiedKills?m.finisherKills/m.classifiedKills:null;
    const priorShare=league.kd/(1+league.kd),share=(m.kills+20*priorShare)/(r.engagements+20);r.adjKd=share/Math.max(.00001,1-share);
    let kdLog=0,kpmLog=0,dpmLog=0,weight=0;
    // Standardize every gun to the same observed Power mix. Each band's baseline excludes
    // this gun, with neutral priors when there is no comparison sample. No assumed talent multipliers.
    for(const b of bandWeights){
      const own=b.data[m.name]||blankWeaponMeta(m.name),other=sum(Object.entries(b.data).filter(([n])=>n!==m.name&&WEAPONS[n]?.type===type).map(([,v])=>v));
      if(other.equippedTime<1||other.kills+other.deaths<2)continue;
      const baseKd=(other.kills+1)/(other.deaths+1),baseShare=baseKd/(1+baseKd),sh=(own.kills+24*baseShare)/(own.kills+own.deaths+24),kd=sh/Math.max(.00001,1-sh);
      const om=other.equippedTime/60,minutes=own.equippedTime/60,baseKpm=other.kills/Math.max(.01,om),baseDpm=other.damage/Math.max(.01,om);
      kdLog+=b.weight*Math.log2(kd/baseKd);kpmLog+=b.weight*Math.log2(Math.max(.00001,bayesRate(own.kills,minutes,baseKpm,5))/Math.max(.00001,baseKpm));dpmLog+=b.weight*Math.log2(Math.max(.00001,bayesRate(own.damage,minutes,baseDpm,5))/Math.max(.00001,baseDpm));weight+=b.weight;
    }
    r.skillAdjustedKd=league.kd*Math.pow(2,weight?kdLog/weight:0);
    r.adjKpm=bayesRate(m.kills,r.minutes,league.kpm,4);r.adjDpm=bayesRate(m.damage,r.minutes,league.dpm,4);r.adjAccuracy=bayesRate(m.hits,m.shots,league.acc,60);r.adjHs=bayesRate(m.headshots,m.kills,league.hs,12);
    const kdScore=.25*relativeComponent(r.adjKd,league.kd,30)+.75*relativeComponent(r.skillAdjustedKd,league.kd,30);
    const kpmScore=clamp(50+20*(weight?kpmLog/weight:0),0,100),dpmScore=clamp(50+18*(weight?dpmLog/weight:0),0,100);
    r.score=.60*kdScore+.18*kpmScore+.12*dpmScore+.06*relativeComponent(r.adjAccuracy,league.acc,14)+.04*relativeComponent(r.adjHs,league.hs,10);
    r.confidence=.5*Math.min(1,r.engagements/80)+.3*Math.min(1,r.minutes/30)+.2*Math.min(1,m.shots/400);
  }return rows;
}

function sortRows(rows,view,cfg=TABLE_SORT[view]){
  return rows.sort((a,b)=>{
    const av=typeof cfg.key==='function'?cfg.key(a):a[cfg.key],bv=typeof cfg.key==='function'?cfg.key(b):b[cfg.key];
    if(av===null||av===undefined)return 1;if(bv===null||bv===undefined)return -1;
    if(typeof av==='string')return av.localeCompare(bv)*cfg.dir;
    return ((av??-Infinity)-(bv??-Infinity))*cfg.dir;
  });
}
function sortIndicator(view,key){const c=TABLE_SORT[view];return c.key===key?(c.dir===-1?' ▼':' ▲'):'';}
function botWeaponPerformance(weaponName,sample=revisionSample()){
  const rows=BOT_NAMES.slice(0,BOT_COUNT).map(name=>{
    const u=sample.participants?sample.participants[profileFor(name).id]?.meta?.[weaponName]||{}:sample.perBot[name]?.[weaponName]||{};
    const kills=Math.max(0,finiteNumber(u.kills??u.k)),deaths=Math.max(0,finiteNumber(u.deaths??u.d));
    const shots=Math.max(0,finiteNumber(u.shots)),hits=clamp(finiteNumber(u.hits),0,shots);
    const damage=Math.max(0,finiteNumber(u.damage)),headshots=clamp(finiteNumber(u.headshots),0,kills);
    const equippedTime=Math.max(0,finiteNumber(u.equippedTime)),picks=Math.max(0,finiteNumber(u.picks));
    const engagements=kills+deaths;
    return {name,profile:profileFor(name),kills,deaths,engagements,picks,damage,shots,hits,headshots,equippedTime,
      kd:kdSortValue(kills,deaths),accuracy:hits/Math.max(1,shots),minutes:equippedTime/60};
  }).filter(r=>r.picks>0||r.engagements>0||r.shots>0||r.equippedTime>0);
  // Prefer mature samples. Until three bots qualify, fill remaining slots from the
  // best available low-sample records so every weapon can still show useful live data.
  const mature=rows.filter(r=>r.engagements>=5).sort((a,b)=>b.kd-a.kd||b.kills-a.kills||b.damage-a.damage||b.accuracy-a.accuracy||a.name.localeCompare(b.name));
  const used=new Set(mature.slice(0,3).map(r=>r.name));
  const fallback=rows.filter(r=>!used.has(r.name)).sort((a,b)=>b.kd-a.kd||b.kills-a.kills||b.engagements-a.engagements||b.damage-a.damage||a.name.localeCompare(b.name));
  return [...mature.slice(0,3),...fallback].slice(0,3);
}
let META_KIND='primary',META_SELECTED_WEAPON=null,META_COHORT='human',META_MODE='tdm';
const META_SELECTIONS={human:{kind:'primary',mode:'tdm',weapon:null,sort:{key:'score',dir:-1}},bot:{kind:'primary',mode:'tdm',weapon:null,sort:{key:'score',dir:-1}}};
function rememberMetaSelection(){META_SELECTIONS[META_COHORT]={kind:META_KIND,mode:META_MODE,weapon:META_SELECTED_WEAPON,sort:{...TABLE_SORT.meta}};}
function topBotsForWeaponHtml(weaponName){
  const rows=botWeaponPerformance(weaponName,participantSample('bot',META_MODE));
  if(!rows.length)return `<div class="meta-empty">No bot sample yet. This panel will populate as the live matches produce weapon-specific data.</div>`;
  return `<div class="meta-topbots-list">${rows.map((r,i)=>`<article class="meta-topbot"><div class="meta-topbot-head"><span class="meta-rank">#${i+1}</span><div><strong>${r.profile?.feared?'◆ ':''}${escapeHtml(r.name)}</strong><small>${r.profile?.power||'—'} POWER • ${escapeHtml(strategicRole(r.profile?.archetype))}</small></div>${r.engagements<5?'<em>LOW SAMPLE</em>':''}</div><div class="meta-topbot-stats"><span><b>${kdDisplay(r.kills,r.deaths)}</b><small>K/D</small></span><span><b>${r.kills}–${r.deaths}</b><small>K–D</small></span><span><b>${(r.accuracy*100).toFixed(1)}%</b><small>ACC</small></span><span><b>${Math.round(r.damage)}</b><small>DMG</small></span><span><b>${r.headshots}</b><small>HS</small></span><span><b>${r.minutes.toFixed(1)}m</b><small>TIME</small></span></div></article>`).join('')}</div>`;
}
function currentMetaRows(sample=revisionSample(),sort=TABLE_SORT.meta){
  const rows=weaponMetrics(sample).map(r=>Object.assign(r,{name:r.m.name,picks:r.m.picks,kills:r.m.kills,deaths:r.m.deaths,damage:r.m.damage,shots:r.m.shots,hits:r.m.hits,headshots:r.m.headshots}));
  sortRows(rows,'meta',sort);return rows;
}
function metaRowsForCohort({cohort='human',mode='tdm',kind=null,sort=META_SELECTIONS[cohort==='bot'?'bot':'human'].sort}={}){return currentMetaRows(participantSample(cohort,mode),sort).filter(r=>!kind||WEAPONS[r.name].type===kind);}
function compactMetaHtml(options={}){
  const cohort=options.cohort==='bot'?'bot':'human',mode=options.mode==='deathmatch'?'deathmatch':'tdm',kind=options.kind==='sidearm'?'sidearm':'primary',rows=metaRowsForCohort({cohort,mode,kind});
  return `<p class="meta-note">${cohort==='bot'?'Bot':'Human'} participants · ${mode==='deathmatch'?'Deathmatch':'TDM'} · current patch. Separate samples begin with SKYLINE; earlier combined history is retained.</p>${rows.some(r=>r.shots||r.engagements)?'':'<p class="meta-empty">No eligible combat sample yet. Weapon information is available below.</p>'}<div class="phone-meta-rows">${rows.map(r=>`<details class="phone-meta-row" data-row="${escapeHtml(r.name)}"><summary><strong>${escapeHtml(r.name)}</strong><span>Score ${metaScore(r)} · ${kdDisplay(r.kills,r.deaths)} K/D</span></summary><dl><dt>Kills / Deaths</dt><dd>${r.kills} / ${r.deaths}</dd><dt>Usage</dt><dd>${r.usageSampled?(r.usage*100).toFixed(1)+'%':'—'}</dd><dt>Accuracy</dt><dd>${metaAccuracy(r)}</dd><dt>Kills / min</dt><dd>${metaRate(r.kpm,r.minutes)}</dd><dt>Damage / min</dt><dd>${metaRate(r.dpm,r.minutes,0)}</dd><dt>Engagement range</dt><dd>${metaRange(r.engRange,r.m.engagementDistanceN)}</dd><dt>Kill range</dt><dd>${metaRange(r.range,r.m.killDistanceN)}</dd><dt>Solo / Finisher</dt><dd>${metaPercent(r.soloPct,r.m.classifiedKills)} / ${metaPercent(r.finisherPct,r.m.classifiedKills)}</dd><dt>Sample</dt><dd>${(r.confidence*100).toFixed(0)}%</dd><dt>Shots / Hits</dt><dd>${r.shots} / ${r.hits}</dd><dt>Damage</dt><dd>${Math.round(r.damage)}</dd><dt>Headshot kills</dt><dd>${r.headshots}</dd><dt>Equipped</dt><dd>${r.minutes.toFixed(1)} min</dd><dt>Loadouts</dt><dd>${r.picks}</dd></dl><button data-phone-meta-weapon="${escapeHtml(r.name)}">WEAPON DETAILS</button></details>`).join('')}</div>`;
}
const META_SOLO_HELP="Percentage of kills where this weapon dealt at least 80% of the victim's total health.";
const META_FINISHER_HELP="Percentage of kills where this weapon mainly finished damage started by another weapon.";
function visibleMetaRows(){return metaRowsForCohort({cohort:META_COHORT,mode:META_MODE,kind:META_KIND,sort:TABLE_SORT.meta});}
function metaMeasured(value,count,digits=1,suffix=''){
  if(!count)return '—';
  if(count<5)return 'LOW SAMPLE';
  return value.toFixed(digits)+suffix;
}
function metaRate(value,minutes,digits=2){return minutes>=1?value.toFixed(digits):minutes>0?'LOW SAMPLE':'—';}
function metaScore(r){return r.engagements>=5?r.score.toFixed(1):r.engagements?'LOW SAMPLE':'—';}
function metaKd(r){return r.engagements>=5?kdDisplay(r.kills,r.deaths):r.engagements?'LOW SAMPLE':'—';}
function metaAccuracy(r){return metaMeasured(r.accuracy*100,r.shots,1,'%');}
function metaPercent(value,count){return metaMeasured(value===null?0:value*100,count,1,'%');}
function metaRange(value,count){return metaMeasured(value===null?0:value,count,1,' tiles');}
const META_LABELS=['Rank','Weapon','Gun Score','K/D','Kills','Deaths','Usage','Accuracy','K/min','Dmg/min','Avg Engagement Range','Avg Kill Range','Solo Kill %','Finisher Kill %','Sample'];
const compactNumber=n=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
function metaRowsHtml(rows=visibleMetaRows()){
  const ranks=new Map(rows.filter(r=>r.engagements>=5).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).map((r,i)=>[r.name,i+1]));
  return rows.map(r=>{const values=[ranks.get(r.name)||'—',r.name,metaScore(r),metaKd(r),compactNumber(r.kills),compactNumber(r.deaths),r.usageSampled?(r.usage*100).toFixed(1)+'%':'—',metaAccuracy(r),metaRate(r.kpm,r.minutes),r.minutes>=1?compactNumber(r.dpm):metaRate(r.dpm,r.minutes,0),metaMeasured(r.engRange||0,r.m.engagementDistanceN),metaMeasured(r.range||0,r.m.killDistanceN),metaPercent(r.soloPct,r.m.classifiedKills),metaPercent(r.finisherPct,r.m.classifiedKills),(r.confidence*100).toFixed(0)+'%'];return '<tr class="meta-weapon-row '+(META_SELECTED_WEAPON===r.name?'selected':'')+'" tabindex="0" aria-selected="'+(META_SELECTED_WEAPON===r.name)+'" data-meta-weapon="'+escapeHtml(r.name)+'">'+values.map((v,i)=>'<td data-label="'+META_LABELS[i]+'" title="'+escapeHtml(String(v==='LOW SAMPLE'?'Low sample':i===4?r.kills:i===5?r.deaths:i===9?r.dpm:v))+'">'+(i===1?'<strong>'+escapeHtml(v)+'</strong>':v==='LOW SAMPLE'?'—':escapeHtml(v))+'</td>').join('')+'</tr>';}).join('');
}
function metaHeadHtml(){
  const cols=[['rank','Rank'],['name','Weapon'],['score','Score'],['kd','K/D'],['kills','Kills'],['deaths','Deaths'],['usage','Usage'],['accuracy','Acc.'],['kpm','K/Min'],['dpm','Dmg/Min'],['engRange','Eng. (t)'],['range','Kill (t)'],['soloPct','Solo %'],['finisherPct','Finish %'],['confidence','Sample']];
  return cols.map(([k,l])=>{
    const title=k==='soloPct'?META_SOLO_HELP:k==='finisherPct'?META_FINISHER_HELP:null;
    return `<th${title?' title="'+escapeHtml(title)+'"':''}>${k==='rank'?l:`<button class="table-sort" data-sort-view="meta" data-sort-key="${k}">${l}${sortIndicator('meta',k)}</button>`}</th>`;
  }).join('');
}
function metaSummaryHtml(rows){
  if(!rows.length)return '';
  const qualified=rows.filter(r=>r.engagements>=10),top=qualified.slice().sort((a,b)=>b.score-a.score)[0],kd=qualified.slice().sort((a,b)=>b.kd-a.kd)[0],usage=rows.filter(r=>r.usageSampled).slice().sort((a,b)=>b.usage-a.usage)[0];
  const totalKills=rows.reduce((n,r)=>n+r.kills,0);
  return `<div class="meta-summary"><div><small>${META_KIND==='sidearm'?'TOP SIDEARM':'TOP PRIMARY'}</small><strong>${top?escapeHtml(top.name):'DISCOVERING'}</strong><span>${top?top.score.toFixed(1)+' score':'awaiting combat sample'}</span></div><div><small>BEST K/D</small><strong>${kd?escapeHtml(kd.name):'—'}</strong><span>${kd?kdDisplay(kd.kills,kd.deaths):'LOW SAMPLE'}</span></div><div><small>MOST USED</small><strong>${usage?escapeHtml(usage.name):'—'}</strong><span>${usage?(usage.usage*100).toFixed(1)+'% of '+META_KIND+' time':'awaiting equipped time'}</span></div><div><small>RECORDED KILLS</small><strong>${totalKills}</strong><span>${META_KIND==='sidearm'?'sidearms only':'primaries only'}</span></div></div>`;
}
function metaDetailHtml(rows=visibleMetaRows()){
  const row=rows.find(r=>r.name===META_SELECTED_WEAPON)||rows[0];if(!row)return '<div class="meta-empty">No weapon telemetry yet.</div>';
  META_SELECTED_WEAPON=row.name;const w=WEAPONS[row.name],sheet=weaponSheet(row.name);
  const stat=(label,value,help='')=>`<span><small>${help?`<abbr title="${escapeHtml(help)}" tabindex="0">${label} ⓘ</abbr>`:label}</small><b>${value}</b></span>`;
  const stats=[
    ['Body TTK',sheet.bodyTtk.toFixed(2)+'s'],['Headshot TTK',sheet.headTtk.toFixed(2)+'s'],
    ['Accuracy',metaAccuracy(row)],['Kills / Min',metaRate(row.kpm,row.minutes)],['Damage / Min',metaRate(row.dpm,row.minutes,0)],
    ...(row.name==='P90'?[['Designed Range','7–12 tiles']]:[]),
    ['Avg Engagement Range',metaRange(row.engRange,row.m.engagementDistanceN)],
    ['Avg Kill Range',metaRange(row.range,row.m.killDistanceN)],
    ['Solo Kill %',metaPercent(row.soloPct,row.m.classifiedKills),META_SOLO_HELP],
    ['Finisher Kill %',metaPercent(row.finisherPct,row.m.classifiedKills),META_FINISHER_HELP],
    ['Loadouts',String(row.picks)],['HS / Kill',metaPercent(row.hs,row.kills)],['Damage / Loadout',row.picks?row.avgDamage.toFixed(0):'—']
  ];
  return `<div class="meta-detail-head"><div><div class="eyebrow">${META_KIND==='sidearm'?'SIDEARM META':'PRIMARY META'} · SELECTED WEAPON</div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(w.role)}</p></div><canvas id="metaWeaponPreview" width="280" height="96" data-weapon-preview="${escapeHtml(row.name)}"></canvas></div><div class="meta-detail-kpis"><div><small>GUN SCORE</small><strong>${metaScore(row)}</strong></div><div><small>K/D</small><strong>${metaKd(row)}</strong></div><div><small>USAGE</small><strong>${row.usageSampled?(row.usage*100).toFixed(1)+'%':'—'}</strong></div><div><small>CONFIDENCE</small><strong>${(row.confidence*100).toFixed(0)}%</strong></div></div><div class="meta-detail-grid">${stats.map(([label,value,help])=>stat(label,value,help)).join('')}</div><p class="analytics-note">${row.engagements>=5?'Bayesian K/D '+row.adjKd.toFixed(2)+' · Power-adjusted K/D '+row.skillAdjustedKd.toFixed(2):'Gun Score stabilizes as this weapon gathers real combat samples.'} Usage is the share of ${META_KIND} equipped time.</p>${META_COHORT==='bot'?`<div class="meta-topbots-heading"><div><div class="eyebrow">BEST USERS</div><h4>Top 3 bots with ${escapeHtml(row.name)}</h4></div><span>BY WEAPON K/D • 5+ ENGAGEMENTS PREFERRED</span></div>${topBotsForWeaponHtml(row.name)}`:''}`;
}
function paintMetaPreview(){const c=document.getElementById('metaWeaponPreview');if(c)drawWeaponPreview(c,c.dataset.weaponPreview);}
function rememberTableFocus(host){const active=document.activeElement;if(!host?.contains?.(active))return ()=>{};const keys=['metaWeapon','sortKey','botProfile'];const key=keys.find(k=>active.dataset?.[k]!==undefined);if(!key)return ()=>{};const value=active.dataset[key];return ()=>{Array.from(host.querySelectorAll('[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']')).find(el=>el.dataset[key]===value)?.focus({preventScroll:true});};}
function updateMetaTable(){
  rememberMetaSelection();
  const restoreFocus=rememberTableFocus(document.getElementById('modalContent'));
  const page=document.querySelector('.meta-page');if(page)page.dataset.kind=META_KIND;
  const rows=visibleMetaRows();if(!META_SELECTED_WEAPON||!rows.some(r=>r.name===META_SELECTED_WEAPON))META_SELECTED_WEAPON=rows[0]?.name||null;
  const body=document.getElementById('metaRows');if(body)body.innerHTML=metaRowsHtml(rows);
  const head=document.getElementById('metaHead');if(head)head.innerHTML=metaHeadHtml();
  const summary=document.getElementById('metaSummary');if(summary)summary.innerHTML=metaSummaryHtml(rows);
  const detail=document.getElementById('metaDetail');if(detail)detail.innerHTML=metaDetailHtml(rows);
  const context=document.getElementById('metaContext');if(context)context.textContent=META_KIND==='sidearm'?'Sidearms are evaluated separately because they are frequently used as emergency or finishing weapons.':'Primaries are compared with primaries in the current balance patch.';
  document.querySelectorAll('[data-meta-kind]').forEach(b=>{const active=b.dataset.metaKind===META_KIND;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('[data-meta-mode]').forEach(b=>{const active=b.dataset.metaMode===META_MODE;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  paintMetaPreview();const phase=document.getElementById('metaPhase');if(phase)phase.textContent=metaPhaseText();
  const stamp=document.getElementById('metaStamp');if(stamp)stamp.textContent='LIVE • '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});restoreFocus();
}
function metaPhaseText(){const sample=participantSample(META_COHORT,META_MODE),p=metaPhase(weaponMetrics(sample));return `${p.label||'BALANCE PATCH '+p.patch}${p.updateName?' — '+p.updateName:''} · ${p.phase} · ${META_COHORT.toUpperCase()} · ${META_MODE==='deathmatch'?'DEATHMATCH':'TDM'} · ${p.fullySampled}/${p.primaryCount} PRIMARIES FULLY SAMPLED · ${sample.completedMatches} GAMES`;}
function archiveHtml(){return SAVE.patchArchives.length?SAVE.patchArchives.slice().reverse().map(p=>`<details><summary>${escapeHtml(p.label||p.id)}${p.updateName?' — '+escapeHtml(p.updateName):''} · ${escapeHtml(p.id)} · ${escapeHtml(p.reason||'balance change')} · ${p.completedMatches||0} games</summary><table class="meta-table"><thead><tr><th>Weapon</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Shots</th><th>Equipped minutes</th></tr></thead><tbody>${Object.entries(p.meta||{}).map(([n,m])=>`<tr><td>${escapeHtml(n)}</td><td>${m.kills||0}</td><td>${m.deaths||0}</td><td>${Math.round(m.damage||0)}</td><td>${m.shots||0}</td><td>${((m.equippedTime||0)/60).toFixed(1)}</td></tr>`).join('')}</tbody></table></details>`).join(''):'<p>No archived patches yet. A change to weapon statistics automatically archives this sample.</p>';}

function renderMetaModal(options={}){
  rememberMetaSelection();META_COHORT=options.cohort==='bot'?'bot':'human';
  const saved=META_SELECTIONS[META_COHORT];META_KIND=options.kind||saved.kind;META_MODE=options.mode||saved.mode;META_SELECTED_WEAPON=options.weapon||saved.weapon;TABLE_SORT.meta={...(saved.sort||TABLE_SORT.meta)};const initial=visibleMetaRows();
  showModal(`<div class="meta-page"><div class="meta-page-head"><div><div class="eyebrow">LIVE ANALYTICS / CURRENT PATCH</div><h2>${META_COHORT==='bot'?'Bot Weapon Meta':'Weapon Meta'}</h2><p><span id="metaPhase">${metaPhaseText()}</span></p></div><span id="metaStamp" class="meta-live">LIVE</span></div><div class="meta-tabs" role="tablist" aria-label="Weapon category"><button type="button" data-meta-kind="primary" role="tab" aria-selected="true">PRIMARY META</button><button type="button" data-meta-kind="sidearm" role="tab" aria-selected="false">SIDEARM META</button></div><div class="meta-tabs" role="tablist" aria-label="Match mode"><button data-meta-mode="tdm" role="tab">TEAM DEATHMATCH</button><button data-meta-mode="deathmatch" role="tab">DEATHMATCH</button></div><p class="meta-note">${META_COHORT==='human'?'Human participant performance against humans or bots.':'Bot participant performance against any eligible opponent.'} Analytics schema ${PARTICIPANT_ANALYTICS_SCHEMA}: separate samples begin with SKYLINE. Earlier combined history remains preserved as legacy/mixed; no human share is estimated.</p><p id="metaContext" class="meta-context">Primaries are compared with primaries in the current balance patch.</p><div id="metaSummary">${metaSummaryHtml(initial)}</div><label class="meta-mobile-sort">SORT <select id="metaMobileSort">${Object.entries({name:'Weapon',score:'Gun Score',kd:'K/D',kills:'Kills',deaths:'Deaths',usage:'Usage',accuracy:'Accuracy',kpm:'K/min',dpm:'Dmg/min',engRange:'Engagement Range',range:'Kill Range',soloPct:'Solo Kill %',finisherPct:'Finisher Kill %',confidence:'Sample'}).map(([key,label])=>`<option value="${key}" ${TABLE_SORT.meta.key===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="meta-dashboard" id="metaDashboard"><section class="meta-table-panel"><div class="meta-table-scroll"><table class="meta-table sortable-table meta-clean-table"><thead><tr id="metaHead">${metaHeadHtml()}</tr></thead><tbody id="metaRows">${metaRowsHtml(initial)}</tbody></table></div><div class="meta-formula"><strong>Gun Score v3</strong><span>60% Adjusted K/D</span><span>18% Kills/Min</span><span>12% Damage/Min</span><span>6% Accuracy</span><span>4% HS/Kill</span></div></section><aside id="metaDetail" class="meta-detail-panel">${metaDetailHtml(initial)}</aside></div><details class="meta-method"><summary>Telemetry definitions & scoring methodology</summary><p>Gun Score keeps the same components and weighs each weapon against its own category's actual current-patch league and Power-band results. There is no sidearm penalty. K/D = kills made with the weapon ÷ deaths while it was held. Accuracy counts one trigger pull, including a shotgun blast, as one shot. Usage is share of alive equipped time within the selected category. Kills/min and damage/min use that equipped time. Average engagement range samples actual trigger pulls aimed toward visible enemies; average kill range uses lethal projectile travel. Solo Kill % counts kills where the finishing weapon removed at least 80% of 250 HP from that victim since spawn. Finisher Kill % counts 40% or less. These contribution samples begin in this version: older kill data stays intact but is never backfilled. Confidence measures sample maturity, not score. All displayed live rates, ranks and summaries use only the selected participant cohort and mode.</p></details><details class="meta-method"><summary>Legacy / mixed revision samples</summary>${Object.entries(SAVE.patchState.aiSamples||{}).map(([revision,sample])=>`<p>${escapeHtml(revision)} · ${sample.completedMatches} TDM games · ${Object.values(sample.meta).reduce((sum,w)=>sum+w.kills,0)} kills. ${revision===AI_REVISION?'Combined historical measurements; not a participant-cohort sample.':'Preserved historical sample.'}</p>`).join('')}</details><details class="meta-method"><summary>Archived patches / combined history (${SAVE.patchArchives.length})</summary>${archiveHtml()}</details><button id="resetMeta" class="meta-reset">ARCHIVE & RESTART CURRENT SAMPLE</button></div>`,'meta');
  requestAnimationFrame(paintMetaPreview);updateMetaTable();
}

function botRows(){
  return BOT_NAMES.slice(0,BOT_COUNT).map(name=>{
    const c=careerFor(name),profile=profileFor(name),kd=kdSortValue(c.kills,c.deaths),accuracy=c.hits/Math.max(1,c.shots),wl=ratio(c.wins,c.losses),winPct=c.wins/Math.max(1,c.games);
    return {name,...c,kd,accuracy,wl,winPct,power:profile.power,powerRank:profile.rank,archetype:strategicRole(profile.archetype),recentForm:SAVE.bots[name].recentForm,personality:`${Math.round((profile.personality?.unpredictability||0)*100)}% volatile`,favorite:profile.personality?.favoriteWeapon||'—',metaDrive:profile.personality?.metaDrive||0,feared:profile.feared};
  });
}
function botRowsHtml(){const rows=botRows();sortRows(rows,'bots');return rows.map(r=>'<tr><td><button class="bot-profile-link" data-bot-profile="'+escapeHtml(r.name)+'">'+(r.feared?'◆ ':'')+escapeHtml(r.name)+'</button></td><td><strong>'+r.power+'</strong></td><td>'+formLabel(r.recentForm)+' '+(r.recentForm>=0?'+':'')+r.recentForm.toFixed(1)+'</td><td>'+escapeHtml(r.archetype)+'</td><td>'+escapeHtml(r.favorite)+'</td><td>'+r.games+'</td><td>'+r.wins+'</td><td>'+r.losses+'</td><td>'+(r.winPct*100).toFixed(1)+'%</td><td>'+r.kills+'</td><td>'+r.deaths+'</td><td><strong>'+kdDisplay(r.kills,r.deaths)+'</strong></td><td>'+r.assists+'</td><td>'+Math.round(r.damage).toLocaleString()+'</td><td>'+(r.accuracy*100).toFixed(1)+'%</td><td>'+r.headshots+'</td></tr>').join('');}
function botHeadHtml(){const cols=[['name','Bot'],['power','Power'],['recentForm','Form'],['archetype','Playstyle'],['favorite','Favorite Weapon'],['games','Games'],['wins','Wins'],['losses','Losses'],['winPct','Win %'],['kills','Kills'],['deaths','Deaths'],['kd','K/D'],['assists','Assists'],['damage','Damage'],['accuracy','Accuracy'],['headshots','Headshot Kills']];return cols.map(([k,l])=>'<th aria-sort="'+(TABLE_SORT.bots.key===k?(TABLE_SORT.bots.dir===1?'ascending':'descending'):'none')+'"><button class="table-sort" data-sort-view="bots" data-sort-key="'+k+'">'+l+sortIndicator('bots',k)+'</button></th>').join('');}
function updateBotLeaderboard(){
  const restoreFocus=rememberTableFocus(document.getElementById('modalContent'));
  const body=document.getElementById('botRows');if(body)body.innerHTML=botRowsHtml();
  const head=document.getElementById('botHead');if(head)head.innerHTML=botHeadHtml();
  const stamp=document.getElementById('botStamp');if(stamp)stamp.textContent='LIVE • UPDATED '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});restoreFocus();
}
function renderBotProfile(name){renderBotRecord(name);}
document.addEventListener('click',e=>{const b=e.target.closest('[data-bot-profile]');if(b)renderBotProfile(b.dataset.botProfile);});
function renderBotLeaderboard(){
  showModal(`<div class="eyebrow">THE CIRCUIT / 50 COMPETITORS</div><div class="meta-heading"><h2>Bot Leaderboard</h2><span id="botStamp">LIVE</span></div><details class="leaderboard-guide"><summary>CAREER RECORDS <span>Sort any column · Select a competitor for their profile</span></summary><div class="analytics-note">Career combat totals persist across versions. Power is a fixed skill rating, not calculated from stats. Every bot keeps the same tactical navigation/cover brain, while Power changes execution quality. There are only five tactical playstyles: Long-Range Marksman, Aggressive Rusher, Flanker, Defensive Anchor and Adaptive Flex. Bots re-evaluate weapons each match, generally gravitate toward stronger live-meta guns, and still make occasional unpredictable choices. ◆ marks feared bots. Click any header to sort.</div></details><div class="bot-table-scroll"><table class="meta-table sortable-table bot-leaderboard"><thead><tr id="botHead">${botHeadHtml()}</tr></thead><tbody id="botRows">${botRowsHtml()}</tbody></table></div>`,'bots');
  updateBotLeaderboard();
}
function careerStatsHtml(c,isPlayer=false){
  const win=c.games?(100*c.wins/c.games).toFixed(1)+'%':'—',accuracy=c.shots?(100*c.hits/c.shots).toFixed(1)+'%':'—',head=c.kills?(100*c.headshots/c.kills).toFixed(1)+'%':'—';
  const cells=[['GAMES',c.games],['W / L',c.wins+' / '+c.losses],['WIN %',win],['KILLS',c.kills],['DEATHS',c.deaths],['K/D',kdDisplay(c.kills,c.deaths)],['ASSISTS',c.assists],['DAMAGE',Math.round(c.damage).toLocaleString()],['DAMAGE TAKEN',Math.round(c.taken).toLocaleString()],['SHOTS / HITS',c.shots+' / '+c.hits],['ACCURACY',accuracy],['HEADSHOTS',c.headshots],['HEADSHOT KILL %',head],[isPlayer?'PLAYTIME':'ALIVE TIME',((isPlayer?c.timePlayed:c.timeAlive)/3600).toFixed(2)+'h']];
  return `<div class="match-report-grid career-summary">${cells.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
}
function careerWeaponTableHtml(weapons,familiarity=null){
  const rows=Object.entries(weapons||{}).sort((a,b)=>(b[1].equippedTime||0)-(a[1].equippedTime||0));
  return `<div class="meta-table-scroll"><table class="meta-table profile-weapons"><thead><tr><th>WEAPON</th><th title="Completed games recorded since this field was added in 1.5.0">GAMES*</th><th>K</th><th>D</th><th>K/D</th><th>DAMAGE</th><th>ACCURACY</th><th>HEADSHOTS</th><th>EQUIPPED</th>${familiarity?'<th>FAMILIARITY</th>':''}</tr></thead><tbody>${rows.map(([name,w])=>`<tr><td>${escapeHtml(name)}</td><td>${w.games??'—'}</td><td>${w.k||0}</td><td>${w.d||0}</td><td>${kdDisplay(w.k||0,w.d||0)}</td><td>${Math.round(w.damage||0).toLocaleString()}</td><td>${w.shots?(100*w.hits/w.shots).toFixed(1)+'%':'—'}</td><td>${w.headshots||0}</td><td>${((w.equippedTime||0)/60).toFixed(1)}m</td>${familiarity?`<td>${(familiarity[name]||0).toFixed(1)} / 100</td>`:''}</tr>`).join('')}</tbody></table></div><p class="meta-note">* Per-weapon completed games are measured from 1.5.0 onward. Existing lifetime combat and equipped-time records are preserved.</p>`;
}
function seasonRecordTableHtml(seasons,name=null){
  return `<div class="meta-table-scroll"><table class="meta-table"><thead><tr><th>SEASON</th><th>GAMES</th><th>W / L</th><th>K / D / A</th><th>K/D</th><th>DAMAGE</th><th>STATUS</th></tr></thead><tbody>${seasons.map(s=>{const c=name?s.stats?.[name]:s.stats;if(!c)return '';return `<tr><td>${s.number}</td><td>${c.games||0}</td><td>${c.wins||0} / ${c.losses||0}</td><td>${c.kills||0} / ${c.deaths||0} / ${c.assists||0}</td><td>${kdDisplay(c.kills||0,c.deaths||0)}</td><td>${Math.round(c.damage||0).toLocaleString()}</td><td>${s.finalizedAt?'COMPLETE':s.endAt<=wallNow()?'COMPLETE':'ACTIVE'}</td></tr>`;}).join('')}</tbody></table></div>`;
}
function renderPlayerProfile(){
  const c=SAVE.playerCareer,account=currentAccount(),rows=Object.entries(c.weapons).sort((a,b)=>b[1].equippedTime-a[1].equippedTime);
  const qualified=rows.filter(([,w])=>w.k>=10&&w.shots>=50).sort((a,b)=>b[1].k/Math.max(1,b[1].d)-a[1].k/Math.max(1,a[1].d));
  const seasons=[SAVE.playerSeasons.current,...SAVE.playerSeasons.history];
  showModal(`<div class="eyebrow">PLAYER PROFILE / ${window.SARCloud?.state?.account?'CLOUD ACCOUNT':'LOCAL CACHE'}</div><div class="profile-heading"><div><h2>${escapeHtml(account?.username||'YOU')}</h2><p class="page-intro">Your competitive record. Every match counts.</p><div class="profile-identity"><span>SEASON ${SAVE.playerSeasons.current.number}</span><span>${c.games} GAMES</span><strong>${kdDisplay(c.kills,c.deaths)} K/D</strong></div></div><canvas class="profile-operator" data-operator-preview="${CONFIG.skin}" width="300" height="200" aria-label="Your selected operator"></canvas></div><div class="account-actions"><button class="selected" data-action="player-profile">TEAM DEATHMATCH</button><button data-action="deathmatch-profile">DEATHMATCH</button></div>${progressionProfileHtml()}<h3>CAREER</h3>${careerStatsHtml(c,true)}<h3>RECORDS & KIT</h3><div class="match-report-grid profile-records"><div><span>MOST KILLS IN GAME</span><strong>${c.bestKills}</strong></div><div><span>MOST DAMAGE IN GAME</span><strong>${Math.round(c.bestDamage).toLocaleString()}</strong></div><div><span>BEST K/D GAME</span><strong>${c.bestKdGame?kdDisplay(c.bestKdGame.kills,c.bestKdGame.deaths):'No record yet'}</strong></div><div><span>LONGEST WIN STREAK</span><strong>${c.bestWinStreak}</strong><small>Current: ${c.currentWinStreak}</small></div><div><span>MOST-USED WEAPON</span><strong>${escapeHtml(rows[0]?.[1].equippedTime?rows[0][0]:'No playtime yet')}</strong></div><div><span>BEST-PERFORMING WEAPON</span><strong>${escapeHtml(qualified[0]?.[0]||'Still sampling')}</strong>${qualified.length?'':'<small>10 kills and 50 shots required</small>'}</div><div><span>SELECTED OPERATOR</span><strong>${escapeHtml(SKINS[CONFIG.skin].name)}</strong></div><div><span>SELECTED LOADOUT</span><strong>${escapeHtml(CONFIG.primary)}</strong><small>${escapeHtml(CONFIG.sidearm)}</small></div></div><h3>WEAPONS</h3>${careerWeaponTableHtml(c.weapons)}<h3>SEASONS</h3>${seasonRecordTableHtml(seasons)}<h3>RECENT MATCHES</h3><div class="profile-recent">${c.recentMatches.length?c.recentMatches.slice(-10).reverse().map(m=>`<div><strong>${m.won?'WIN':'LOSS'}</strong><span>${m.kills} / ${m.deaths} / ${m.assists} · ${Math.round(m.damage)} DMG · ${escapeHtml(m.primary)}</span><small>${new Date(m.at).toLocaleString()}</small></div>`).join(''):'<p class="meta-note">Complete your first match to start this record.</p>'}</div>`,'player-profile');
  requestAnimationFrame(()=>document.querySelectorAll('.profile-operator').forEach(c=>drawOperatorPreview(c,Number(c.dataset.operatorPreview))));
}
function renderBotRecord(name){
  const b=SAVE.bots[name];if(!b)return;const p=b.profile,c=b.career,a=state.actors.find(a=>a.name===name);
  const seasons=[SAVE.seasons.current,...SAVE.seasons.history],champions=SAVE.seasons.history.filter(s=>s.winner?.name===name);
  const played=SAVE.seasons.history.filter(s=>(s.stats?.[name]?.games||0)>=10).sort((a,b)=>seasonKd(b.stats[name])-seasonKd(a.stats[name]));
  const best=played[0],weapons=Object.entries(c.weaponUsage).sort((a,b)=>b[1].equippedTime-a[1].equippedTime);
  showModal(`<div class="eyebrow">BOT PROFILE / ${escapeHtml(p.id)}</div><h2>${escapeHtml(name)}</h2><div class="profile-identity"><strong>${p.power} POWER</strong><span>#${p.rank} POWER RANK</span><span>${escapeHtml(strategicRole(p.archetype))}</span><span>${formLabel(b.recentForm)} · ${b.recentForm.toFixed(1)} FORM</span></div><p class="meta-note">${escapeHtml(a?.decisionReason||'Waiting for the next match')}</p><h3>CAREER</h3>${careerStatsHtml(c)}<div class="match-report-grid"><div><span>CHAMPIONSHIPS</span><strong>${champions.length}</strong></div><div><span>BEST QUALIFIED SEASON</span><strong>${best?'SEASON '+best.number:'LOW SAMPLE'}</strong><small>${best?kdDisplay(best.stats[name].kills,best.stats[name].deaths)+' K/D · '+best.stats[name].games+' games':'10 completed games required'}</small></div><div><span>MOST-USED WEAPON</span><strong>${escapeHtml(weapons[0]?.[1].equippedTime?weapons[0][0]:'—')}</strong></div><div><span>PERSONAL FAVORITE</span><strong>${escapeHtml(p.personality.favoriteWeapon||'—')}</strong></div></div><h3>SEASONS</h3>${seasonRecordTableHtml(seasons,name)}<h3>WEAPONS & FAMILIARITY</h3>${careerWeaponTableHtml(c.weaponUsage,b.familiarity)}<h3>RECENT PERFORMANCE</h3><div class="profile-recent">${b.recentMatches.slice().reverse().map(m=>`<div><strong>${m.won?'WIN':'LOSS'}</strong><span>${m.kills} / ${m.deaths} · ${Math.round(m.damage)} DMG · ${escapeHtml(m.primary)}</span><small>${new Date(m.at).toLocaleString()}</small></div>`).join('')||'<p class="meta-note">No completed matches recorded yet.</p>'}</div><details class="profile-personality"><summary>STABLE PERSONALITY</summary><p>${escapeHtml(p.personality.description||'')}</p><p>${Object.entries(p.personality).filter(([,v])=>typeof v==='number').map(([k,v])=>escapeHtml(k)+': '+v.toFixed(2)).join(' · ')}</p></details><div class="account-actions"><button data-action="bots">BACK TO LEADERBOARD</button><button data-message-thread="${escapeHtml(p.id)}">MESSAGE ${escapeHtml(name)}</button></div>`,'profile');
}
setInterval(()=>{
  const view=document.getElementById('modalContent')?.dataset.view;
  if(!document.getElementById('modal').classList.contains('visible'))return;
  if(view==='meta')updateMetaTable();
  if(view==='bots')updateBotLeaderboard();
},1000);
function renderSaveModal(){
  const cloud=window.SARCloud?.state,info=cloud?.account?`Cloud account <strong>${escapeHtml(cloud.account.username)}</strong> · revision ${cloud.revision} · ${cloud.updatedAt?new Date(cloud.updatedAt).toLocaleString():'first sync pending'}. This device also keeps a local cache and exportable backup.`:'This build is running locally without a cloud server. Export a backup before moving to another device.';
  showModal(`<div class="eyebrow">VERSION-SAFE PERSISTENCE</div><h2>Save Data</h2><div class="analytics-note">${info} Bot careers, player career, fixed Power profiles, per-bot weapon history and patch archives migrate forward with the world.</div><div class="stack"><button data-action="export-save">EXPORT SAVE FILE</button><button data-action="import-save">IMPORT SAVE FILE</button></div><input id="saveImport" type="file" accept="application/json,.json" class="hidden">`,'save');
}
let awaitingBindAction=null;
let settingsCapture=null;
function settingsTabs(active){
  if(settingsCapture)return "";
  return `<div class="settings-tabs" role="tablist" aria-label="Settings">${["game","audio","account","about"].map(key=>`<button role="tab" aria-selected="${active===key}" class="${active===key?"active":""}" data-settings-tab="${key}">${key.toUpperCase()}</button>`).join("")}</div>`;
}
function bindRow(action,label){
  return `<div class="control-row"><span>${label}</span><button class="bind-button" data-bind-action="${action}">${awaitingBindAction===action?'KEY / MOUSE…':codeLabel(binding(action))}</button></div>`;
}
function renderPatchNotesHtml(){
 const release=window.SARBuild||{};
 const releaseHtml=(entry,open=false)=>'<details class="patch-release"'+(open?' open':'')+'><summary>'+escapeHtml(entry.applicationVersion?'VERSION '+entry.applicationVersion:entry.version||'1.7.0')+' — '+escapeHtml(entry.updateName||'FIELDCRAFT')+'<small>'+new Date(entry.releasedAt||'2026-10-01').toLocaleDateString()+'</small></summary>'+Object.entries(entry.categories||{}).filter(([,items])=>items.length).map(([name,items])=>'<section><h3>'+escapeHtml(name)+'</h3><ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul></section>').join('')+'</details>';
 return releaseHtml(release,true)+(release.history||[]).map(entry=>releaseHtml(entry)).join('')+WEAPON_PATCH_NOTES.map(p=>'<details class="patch-release"><summary>'+escapeHtml(p.version)+' — '+escapeHtml(p.title)+'<small>'+escapeHtml(p.date)+'</small></summary><h3>Balance</h3>'+p.changes.map(change=>'<section class="patch-weapon"><strong>'+escapeHtml(change.weapon)+'</strong><ul>'+change.items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul></section>').join('')+'</details>').join('');
}
function debugOwner(){return currentAccount()?.username==='noahhicks719';}
function debugKey(){return 'sar.debug.panel.'+(currentAccount()?.id||currentAccount()?.username||'');}
function debugEnabled(){return false;} // Internal diagnostics remain available through the test surface; no player debug panel.
let debugUpdatedAt=0;
function updateDebugPanel(now){
  let panel=document.getElementById('ownerDebugPanel');if(!debugEnabled()){panel?.remove();return;}
  if(!panel){panel=document.createElement('div');panel.id='ownerDebugPanel';panel.style.whiteSpace='pre-line';document.body.appendChild(panel);}if(now-debugUpdatedAt<500)return;debugUpdatedAt=now;
  const focus=getFocusActor(),actor=focus&&!focus.isPlayer?focus:actorsInMatch(visibleMatchId()).filter(a=>!a.isPlayer&&!a.dead).sort((a,b)=>focus?dist(a,focus)-dist(b,focus):a.id-b.id)[0],advice=actor?.tacticalAdvice,target=actor?.target,goal=actor?.moveGoal;
  const lines=['DEBUG · '+state.mode+' · actors '+state.actors.length+' · projectiles '+state.projectiles.length];
  if(actor)lines.push(actor.name+' · '+actor.tactic+' · '+(advice?.phase||'EARLY')+' · '+strategicRole(actor.profile.archetype),
    'Target: '+(target?.name||'none')+' · last-known '+Math.round((target?.confidence||0)*100)+'% · chase '+Math.round((advice?.chase?.confidence||0)*100)+'%',
    'Utilities: '+(actor.utilityScores||[]).map(([name,value])=>name+' '+value.toFixed(2)).join(' · '),
    'Team: '+(advice?.intention||'FFA — no team intentions')+(advice?.teamAveragePower?' · active Power '+advice.teamAveragePower.toFixed(1):''),
    'Meta: '+botMetaContext().phase.phase+' · '+(actor.weaponCandidates||[]).map(c=>c.name+' '+Math.round(c.weight*100)+'%').join(' / '),
    'Goal: '+(goal?Math.round(goal.x)+', '+Math.round(goal.y):'none')+' · waypoint '+actor.navIndex+'/'+actor.navPath.length,
    currentWeaponState(actor).name+' · spread '+effectiveSpreadDeg(actor).toFixed(2)+'°');
  panel.textContent=lines.join('\n');
}
function renderSettingsSection(tab='controls'){
  if(tab==='audio'){showModal('<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>'+settingsTabs(tab)+(window.SARAudio?.settingsHtml()||'<p>Audio is unavailable.</p>'),'settings');return;}
  if(tab==='ai'){window.SARSocialUI?.showSettings(settingsTabs('ai'));return;}
  if(tab==='updates'){
    const updater=window.SARUpdater;
    const installed=updater?.isInstalled?.()||false;
    const canInstall=updater?.canInstall?.()||false;
    const hasUpdate=updater?.hasUpdate?.()||false;
    const version=updater?.version||window.SARBuild.version;
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
      <div class="settings-section update-panel"><h3>App Updates</h3>
        <div class="update-version-card"><div><span class="label">INSTALLED VERSION</span><strong>LIVE UPDATE ${version}</strong></div><div><span class="label">APP STATUS</span><strong>${installed?'INSTALLED APP':'BROWSER VERSION'}</strong></div></div>
        <p class="meta-note">Install the app once from the hosted version. Future releases download in the background and preserve the same bot careers, seasons, weapon meta, controls, account, and save data.</p>
        <div class="account-actions"><button class="primary" data-action="app-check-update">CHECK FOR UPDATES</button>${hasUpdate?'<button class="primary" data-action="app-install-update">INSTALL UPDATE</button>':''}${canInstall&&!installed?'<button data-action="app-install-pwa">INSTALL APP</button>':''}</div>
        <div id="appUpdateMessage" class="account-message">${escapeHtml(updater?.getStatus?.()||(hasUpdate?'A newer build is downloaded and ready to install.':'No update is currently waiting.'))}</div>
        <div class="analytics-note"><strong>How future updates work:</strong> when a new production build is published, this installation checks automatically. If an update is found, press <strong>INSTALL UPDATE</strong>. The game reloads into the new build; persistent save data is not replaced.</div>
      </div>`,'settings');
    return;
  }
  if(tab==='readme'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
      <div class="settings-section readme-panel"><h3>SKIRMISH ARENA</h3><p>Join a match, inspect your loadout and follow the circuit.</p><h4>Play</h4><p>Play joins your current world. Settings → Game lists your bindings. Aim sensitivity, audio and display preferences stay saved.</p><h4>Records</h4><p>Your username menu opens Player Profile. Weapon Meta shows human-participant performance; Phone contains Bot Leaderboard and Bot Weapon Meta. Tournament results and fictional earnings have their own history.</p><h4>Phone</h4><p>Phone contains Messages, Live Scores, Spectate, Bot Leaderboard and Bot Weapon Meta. Open Messages for contacts, conversations and replies. Settings → Game → Messaging controls messages and connection status.</p><h4>Live Circuit</h4><p>The Calendar shows official events and custom tournaments. Register a team, invite bots and play each game of your series. Official prizes are per player; custom events award no earnings.</p><h4>Saves and Updates</h4><p>Previously authenticated accounts can play locally during a connection outage. Settings → Account → Data Management offers complete export and recovery. Update Game verifies the new release and preserves your world.</p><h4>Patch Notes</h4><p>Release history records new features, improvements, balance and fixes.</p></div>`,'settings');
    return;
  }
  if(tab==='patchnotes'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}<div class="settings-section"><div class="patch-heading"><div><h3>Release History</h3></div></div>${renderPatchNotesHtml()}</div>`,'settings');
    return;
  }
  if(tab==='account'){
    const acct=currentAccount();
    if(window.SARCloud?.state?.available){
      const cloud=window.SARCloud.state;
      showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}<div class="settings-section account-panel"><h3>Account</h3><div class="account-signed-in"><span class="label">SIGNED IN AS</span><strong>${escapeHtml(acct?.username||'—')}</strong><p>Cloud progress is stored separately from game builds. Revision ${cloud.revision} · ${cloud.updatedAt?new Date(cloud.updatedAt).toLocaleString():'first sync pending'}.</p></div><div class="account-actions"><button data-action="player-profile">PLAYER PROFILE</button><button data-action="cloud-logout">LOG OUT</button></div><div class="analytics-note">Your session persists between restarts and updates. Save Data can export a separate offline backup. Account recovery uses the one-time code shown at signup.</div></div>`,'settings');
      return;
    }
    if(acct){
      showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
        <div class="settings-section account-panel"><h3>Account</h3>
          <div class="account-signed-in"><span class="label">SIGNED IN AS</span><strong>${escapeHtml(acct.username)}</strong><p>Your login stays active on this browser until you log out.</p></div>
          <div id="accountMessage" class="account-message"></div>
          <button data-action="account-logout">LOG OUT</button>
          <div class="analytics-note">This V1 account is device-local. It uses only a username and password; the password is stored as a salted one-way hash, never as readable text. Online/cloud accounts can be connected later without changing your bot save schema.</div>
        </div>`,'settings');
    }else{
      showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
        <div class="settings-section account-panel"><h3>Login / Sign Up</h3>
          <div class="account-fields"><label><span>Username</span><input id="accountUsername" autocomplete="username" maxlength="24" placeholder="Username"></label><label><span>Password</span><input id="accountPassword" type="password" autocomplete="current-password" placeholder="Password"></label></div>
          <div id="accountMessage" class="account-message"></div>
          <div class="account-actions"><button class="primary" data-action="account-login">LOG IN</button><button data-action="account-signup">SIGN UP</button></div>
          <div class="analytics-note">No email, verification code, profile form, or extra information. Create a username and password and the login persists on this browser.</div>
        </div>`,'settings');
    }
    return;
  }
  if(tab==='gameplay'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}<div class="settings-section"><h3>Gameplay</h3><label class="camera-setting"><input id="damageNumbers" type="checkbox" ${CONFIG.damageNumbers?'checked':''}> Damage Numbers</label><p class="meta-note">Show the health removed by your hits. Shotgun pellets combine into one number per enemy. Bot damage stays hidden while spectating.</p></div>`,'settings');
    return;
  }
  if(tab==='aim'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
      <div class="settings-section"><h3>Aim</h3>
        <div class="slider-row"><div><strong>Mouse sensitivity</strong><span>Controls virtual crosshair movement speed.</span></div><div class="slider-control"><input id="mouseSensitivity" type="range" min=".25" max="2.5" step=".05" value="${CONFIG.mouseSensitivity}"><strong id="sensValue">${Number(CONFIG.mouseSensitivity).toFixed(2)}×</strong></div></div>
        <div class="slider-row"><div><strong>ADS sensitivity multiplier</strong><span>Aim speed while holding ADS.</span></div><div class="slider-control"><input id="adsSensitivity" type="range" min=".30" max="1" step=".05" value="${CONFIG.adsSensitivity}"><strong id="adsSensValue">${CONFIG.adsSensitivity.toFixed(2)}×</strong></div></div>
        <label class="camera-setting"><input id="cameraAimBias" type="checkbox" ${CONFIG.cameraAimBias?'checked':''}> Subtle aim-direction camera bias</label>
        <div class="analytics-note">Hold ${codeLabel(binding('ads'))} for smooth zoom and a tighter projectile cone. Sprint and dash interrupt ADS. Crosshair spread is live weapon dispersion. Stationary, walking, sprinting and ADS each use the weapon’s configured spread. Repeated fire adds no extra bloom. The projectile simulation uses the same value.</div>
      </div>`,'settings');
    return;
  }
  if(tab==='view'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}<div class="settings-section"><h3>View</h3><button data-action="view-25d">RETRY ARENA VIEW</button><p id="viewStatus" class="meta-note"></p><h3>Spectator Camera</h3><div class="account-actions"><button class="${CONFIG.spectatorCamera==='FOLLOW'?'primary':''}" data-action="camera-follow">FOLLOW OPERATOR</button><button class="${CONFIG.spectatorCamera==='TACTICAL'?'primary':''}" data-action="camera-tactical">TACTICAL OVERVIEW</button></div><p class="meta-note">Tactical overview frames the complete arena while spectating. Use the existing player and match switches to change who you follow.</p></div>`,'settings');
    const section=!settingsCapture&&document.querySelector('.settings-section');if(section){const fullscreen=window.SARFullscreen;section.insertAdjacentHTML('beforeend',`<h3>Fullscreen</h3><div class="account-actions"><button data-action="fullscreen">${fullscreen?.getStatus().fullscreen?'EXIT FULLSCREEN':'FULLSCREEN'}</button></div><label class="camera-setting"><input id="fullscreenAutoEnter" type="checkbox" ${fullscreen?.getAutoEnter()!==false?'checked':''}> Enter fullscreen when I press Play or Watch</label><label class="camera-setting"><input id="fullscreenKeepEscape" type="checkbox" ${fullscreen?.getStatus().keyboardLockPreferred?'checked':''}> Keep Escape inside fullscreen during combat, when supported</label><p class="meta-note" data-fullscreen-status>${escapeHtml(fullscreen?.getStatus().message||'')}</p><p class="meta-note">Tab stays inside the game during combat. F11 or Exit Fullscreen returns to a window.</p>`);}
    return;
  }
  showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs('controls')}
    <div class="settings-section"><h3>Controls</h3><div class="controls-grid">
      ${bindRow('moveUp','Move up')}${bindRow('moveDown','Move down')}${bindRow('moveLeft','Move left')}${bindRow('moveRight','Move right')}
      ${bindRow('ads','Aim down sights')}${bindRow('sprint','Sprint')}${bindRow('dash','Dash')}${bindRow('reload','Reload')}${bindRow('primary','Primary weapon')}${bindRow('sidearm','Sidearm')}
      ${bindRow('scoreboard','Scoreboard')}${bindRow('fullMap','Full map')}
      <div class="control-row"><span>Aim</span><strong>MOUSE</strong></div><div class="control-row"><span>Fire</span><strong>LMB</strong></div>
      <div class="control-row"><span>Pause / lobby</span><strong>ESC</strong></div>
    </div><p class="meta-note">Spectator controls remain ← / → for bots and ↑ / ↓ for live games.</p></div>`,'settings');
}
function captureSettingsSection(tab){const capture={};settingsCapture=capture;try{renderSettingsSection(tab);}finally{settingsCapture=null;}const html=capture.html||'',start=html.indexOf('<div class="settings-section');return start>=0?html.slice(start):html;}
function fullscreenSettingsHtml(){const full=window.SARFullscreen;return '<h3>Fullscreen</h3><button data-action="fullscreen">'+(full?.getStatus().fullscreen?'EXIT FULLSCREEN':'FULLSCREEN')+'</button><label class="camera-setting"><input id="fullscreenAutoEnter" type="checkbox" '+(full?.getAutoEnter()!==false?'checked':'')+'> Enter fullscreen when I press Play or Watch</label><label class="camera-setting"><input id="fullscreenKeepEscape" type="checkbox" '+(full?.getStatus().keyboardLockPreferred?'checked':'')+'> Keep Escape inside fullscreen during combat, when supported</label><p class="meta-note" data-fullscreen-status>'+escapeHtml(full?.getStatus().message||'F11 toggles fullscreen.')+'</p>';}
function saveDataSectionHtml(){return '<section class="settings-section"><h3>Data Management</h3><p>Export a complete backup of this account, or safely import an existing save. Newer permanent records cannot be replaced by older ones.</p><div class="account-actions"><button data-action="export-save">EXPORT SAVE FILE</button><button data-action="import-save">IMPORT SAVE FILE</button></div><input id="saveImport" type="file" accept="application/json,.json" class="hidden"></section>';}
function renderSettingsModal(tab='game'){
 const requested=tab;tab=['controls','gameplay','view','aim','ai','developer'].includes(tab)?'game':['updates','patchnotes','readme'].includes(tab)?'about':tab;if(!['game','audio','account','about'].includes(tab))tab='game';
 const old=document.querySelector('#modalContent[data-view="settings"]'),scroll=old?document.querySelector('#modal .modal')?.scrollTop||0:0,opened=new Set([...document.querySelectorAll('[data-settings-section][open]')].map(el=>el.dataset.settingsSection));
 let body='';if(tab==='game'){
  body=['controls','aim','gameplay','view'].map((key,index)=>'<details class="settings-group" data-settings-section="'+key+'" '+((opened.size?opened.has(key):key===requested||index===0)?'open':'')+'><summary>'+({controls:'Controls',aim:'Aim',gameplay:'Gameplay',view:'View & display'}[key])+'</summary>'+captureSettingsSection(key)+(key==='view'?fullscreenSettingsHtml():'')+'</details>').join('');
  body+='<details class="settings-group" data-settings-section="messaging" '+(requested==='ai'||opened.has('messaging')?'open':'')+'><summary>Messaging</summary><div id="messagingSettings">'+(window.SARSocialUI?.settingsSectionHtml?.()||'<p>Messaging is loading.</p>')+'</div></details>';
 }else if(tab==='audio')body=window.SARAudio?.settingsHtml()||'<p>Audio is unavailable.</p>';
 else if(tab==='account')body=captureSettingsSection('account')+saveDataSectionHtml();
 else {const build=window.SARBuild||{};body='<div class="about-brand"><img src="assets/branding/wordmark-mono.svg" alt="Skirmish Arena"><span>BETA</span></div><div class="about-versions"><p>GAME <strong>'+escapeHtml(build.applicationVersion)+'</strong></p><p>INSTALLED BUILD <strong>'+escapeHtml(window.SARUpdater?.version||build.version)+'</strong></p><p>WEAPON BALANCE <strong>'+escapeHtml(build.weaponBalance)+'</strong></p></div>'+captureSettingsSection('updates')+'<details class="settings-group" open><summary>Patch Notes</summary>'+renderPatchNotesHtml()+'</details><details class="settings-group"><summary>Player Guide</summary>'+captureSettingsSection('readme')+'</details>';}
 showModal('<div class="eyebrow">SKIRMISH ARENA</div><h2>Settings</h2>'+settingsTabs(tab)+'<div class="settings-body" data-settings-page="'+tab+'">'+body+'</div>','settings');if(old)document.querySelector('#modal .modal').scrollTop=scroll;
 if(tab==='game')void window.SARSocialUI?.refresh?.();
}

function renderControlsModal(){renderSettingsModal('controls');}

function clearInput(){input.keys.clear();input.mouseDown=false;input.justPressed=false;document.getElementById('scoreboard').classList.add('hidden');const p=getPlayer();if(p){p.ads=false;p.adsBlend=0;}}
let gameplayFocused=true,pointerLockPending=false,wasPointerLocked=false,intentionalPointerRelease=false,lockLostAt=-Infinity;
function gameplayViewportActive(){
  return state.mode==='play'&&state.running&&!state.paused&&gameplayFocused&&!document.hidden&&
    !['modal','menu','pause'].some(id=>document.getElementById(id)?.classList.contains('visible'))&&
    !['accountGate','cloudAccountMenu'].some(id=>{const el=document.getElementById(id);return el&&!el.classList.contains('hidden');});
}
function gameplayMouseActive(){return gameplayViewportActive()&&document.pointerLockElement===canvas;}
function positionCrosshair(){
  input.aimX=clamp(input.aimX,0,cssW);input.aimY=clamp(input.aimY,0,cssH);
  const c=document.getElementById('crosshair');c.style.left=input.aimX+'px';c.style.top=input.aimY+'px';
}
function releaseGameplayPointerLock(){
  canvas.style.cursor='auto';
  if(document.pointerLockElement===canvas){intentionalPointerRelease=true;document.exitPointerLock?.();}
}
function syncGameplayPointerLock(){
  if(!gameplayViewportActive()){clearInput();releaseGameplayPointerLock();}
  else canvas.style.cursor=document.pointerLockElement===canvas?'none':'auto';
}
function requestGameplayPointerLock(){
  if(!gameplayViewportActive()||pointerLockPending||document.pointerLockElement===canvas||typeof canvas.requestPointerLock!=='function')return;
  pointerLockPending=true;
  try{
    const request=canvas.requestPointerLock();
    // Older browsers return void; newer browsers reject a Promise when a fresh
    // user gesture is required. Retry from the next gameplay click in either case.
    if(request?.then)request.then(()=>{pointerLockPending=false;syncGameplayPointerLock();},()=>{pointerLockPending=false;syncGameplayPointerLock();});
  }catch(_){pointerLockPending=false;syncGameplayPointerLock();}
}
function pauseForCaptureLoss(){
  clearInput();if(state.mode==='play'&&state.running){state.paused=true;document.getElementById('pause').classList.add('visible');}
  releaseGameplayPointerLock();
}
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===canvas;pointerLockPending=false;
  const intentional=intentionalPointerRelease;intentionalPointerRelease=false;
  if(!locked&&wasPointerLocked&&!intentional&&gameplayViewportActive()){lockLostAt=performance.now();pauseForCaptureLoss();}
  wasPointerLocked=locked;if(!locked)clearInput();syncGameplayPointerLock();
});
document.addEventListener('pointerlockerror',()=>{pointerLockPending=false;clearInput();syncGameplayPointerLock();});
addEventListener('blur',()=>{gameplayFocused=false;pauseForCaptureLoss();});
addEventListener('focus',()=>{gameplayFocused=true;syncGameplayPointerLock();requestGameplayPointerLock();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseForCaptureLoss();saveTelemetry();}else{syncGameplayPointerLock();requestGameplayPointerLock();}});
addEventListener('resize',positionCrosshair);
if(typeof MutationObserver==='function'){
  const observer=new MutationObserver(()=>{syncGameplayPointerLock();requestGameplayPointerLock();});
  for(const id of ['modal','menu','pause','accountGate','cloudAccountMenu']){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});}
}
syncGameplayPointerLock();
// -------------------- Input / menu actions --------------------
addEventListener('keydown',e=>{
  if(awaitingBindAction){
    e.preventDefault();
    if(e.code==='Escape'){awaitingBindAction=null;renderSettingsModal('controls');return;}
    CONFIG.binds=CONFIG.binds||{...DEFAULT_BINDS};
    const oldCode=CONFIG.binds[awaitingBindAction];
    for(const [action,code] of Object.entries(CONFIG.binds)){if(action!==awaitingBindAction&&code===e.code)CONFIG.binds[action]=oldCode;}
    CONFIG.binds[awaitingBindAction]=e.code;awaitingBindAction=null;saveTelemetry();renderSettingsModal('controls');return;
  }
  if(e.code==='Escape'&&document.getElementById('modal').classList.contains('visible')){awaitingBindAction=null;closeModal();clearInput();return;}
  if(document.getElementById('modal').classList.contains('visible')){
    const row=e.target.closest?.('[data-meta-weapon]');
    if(row&&['Enter','Space'].includes(e.code)){e.preventDefault();META_SELECTED_WEAPON=row.dataset.metaWeapon;updateMetaTable();return;}
    if(e.code==='Tab'){
      const shell=document.querySelector('#modal .modal'),items=Array.from(shell.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length);
      const first=items[0],last=items[items.length-1];
      if(!first){e.preventDefault();shell.focus();return;}
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===shell)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  }
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(document.getElementById('modal').classList.contains('visible'))return;
  if(state.mode==='play'&&!gameplayMouseActive()&&e.code!=='Escape')return;
  if(e.code==='Tab'&&state.running)e.preventDefault();
  input.keys.add(e.code);
  if(e.code===binding('scoreboard')&&state.running){e.preventDefault();if(state.running){document.getElementById('scoreboard').classList.remove('hidden');renderScoreboard();}}
  if(e.code===binding('fullMap')&&state.running&&!e.repeat){
    e.preventDefault();input.fullMap=!input.fullMap;
    if(state.mode==='play')document.getElementById('crosshair').classList.toggle('hidden',input.fullMap);
  }
  if(e.code==='Escape'&&state.running&&!e.repeat){
    if(state.paused&&performance.now()-lockLostAt<250)return;
    if(input.fullMap){input.fullMap=false;if(state.mode==='play')document.getElementById('crosshair').classList.remove('hidden');return;}
    if(state.mode==='spectate'){exitGame();return;}
    state.paused=!state.paused;document.getElementById('pause').classList.toggle('visible',state.paused);clearInput();
    syncGameplayPointerLock();if(!state.paused)requestGameplayPointerLock();
  }
  if(state.mode==='spectate'){if(e.code==='ArrowRight')cycleSpectateActor(1);if(e.code==='ArrowLeft')cycleSpectateActor(-1);if(e.code==='ArrowDown')cycleSpectateMatch(1);if(e.code==='ArrowUp')cycleSpectateMatch(-1);}
  if(gameplayMouseActive()){
    const p=getPlayer();if(p&&!p.dead){
      if(e.code===binding('dash')&&!e.repeat){e.preventDefault();const d=dashDirectionFromPlayer(p);tryDash(p,d.x,d.y,gameNow());}
      if(e.code===binding('primary'))p.currentSlot=0;
      if(e.code===binding('sidearm'))p.currentSlot=1;
      if(e.code===binding('reload'))startReload(p,gameNow());
    }
  }
});
addEventListener('keyup',e=>{input.keys.delete(e.code);if(e.code===binding('scoreboard'))document.getElementById('scoreboard').classList.add('hidden');});
document.addEventListener('mousemove',e=>{
  if(gameplayMouseActive()&&!input.fullMap){
    const player=getPlayer(),sens=(Number(CONFIG.mouseSensitivity)||1)*(1-(1-CONFIG.adsSensitivity)*(player?.adsBlend||0));
    input.aimX+=e.movementX*sens;input.aimY+=e.movementY*sens;positionCrosshair();
  }
});
function mouseCode(button){return ({1:'MouseMiddle',2:'MouseRight',3:'MouseBack',4:'MouseForward'})[button];}
addEventListener('mousedown',e=>{const code=mouseCode(e.button);if(!code)return;if(awaitingBindAction){e.preventDefault();const old=CONFIG.binds[awaitingBindAction];for(const [a,c] of Object.entries(CONFIG.binds))if(a!==awaitingBindAction&&c===code)CONFIG.binds[a]=old;CONFIG.binds[awaitingBindAction]=code;awaitingBindAction=null;saveTelemetry();renderSettingsModal('controls');return;}if(e.target===canvas&&gameplayMouseActive()&&!input.fullMap){e.preventDefault();input.keys.add(code);const p=getPlayer();if(p){if(code===binding('dash')){const d=dashDirectionFromPlayer(p);tryDash(p,d.x,d.y,gameNow());}if(code===binding('primary'))p.currentSlot=0;if(code===binding('sidearm'))p.currentSlot=1;}if(code===binding('fullMap')){input.fullMap=!input.fullMap;document.getElementById('crosshair').classList.toggle('hidden',input.fullMap);}if(code===binding('scoreboard')){document.getElementById('scoreboard').classList.remove('hidden');renderScoreboard();}}},true);
addEventListener('mouseup',e=>{const code=mouseCode(e.button);if(code){input.keys.delete(code);if(code===binding('scoreboard'))document.getElementById('scoreboard').classList.add('hidden');}});
addEventListener('contextmenu',e=>{if(awaitingBindAction)e.preventDefault();});
canvas.addEventListener('mousedown',e=>{
  if(!gameplayViewportActive()||input.fullMap)return;
  if(!gameplayMouseActive()){e.preventDefault();requestGameplayPointerLock();return;}
  if(e.button!==0)return;
  input.mouseDown=true;const p=getPlayer();
  // Handle the press immediately so even a click shorter than one frame fires.
  if(p&&!p.dead){const aim=screenToWorld(input.aimX,input.aimY);p.angle=Math.atan2(aim.y-p.y,aim.x-p.x);fire(p,p.angle,gameNow());}
});addEventListener('mouseup',e=>{if(e.button===0)input.mouseDown=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

document.addEventListener('click',async e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='play')renderPlayMenu();
  else if(action==='play-tdm'){window.SARFullscreen?.onPlay();queueForMatch();}
  else if(action==='play-deathmatch'){window.SARFullscreen?.onPlay();startDeathmatch();}
  else if(action==='play-custom')renderCustomSetup();
  else if(action==='deathmatch-profile')renderDeathmatchProfile();
  else if(action==='start-custom'){try{const config=readCustomSetup();window.SARFullscreen?.onPlay();startCustomMatch(config);}catch(error){document.getElementById('customError').textContent=error.message;}}
  else if(action==='play-again'){window.SARFullscreen?.onPlay();const r=state.lastResult;if(r?.sessionType==='custom')startCustomMatch(r.config);else if(r?.mode==='deathmatch')startDeathmatch();else queueForMatch();}
  else if(action==='spectate')window.SARPhone?.openSpectate?.();
  else if(action==='fullscreen')window.SARFullscreen?.toggle();
  else if(action==='loadout')renderLoadoutModal();
  else if(action==='operator')renderOperatorModal();
  else if(action==='meta')renderMetaModal();
  else if(action==='bots')window.SARPhone?.open?.('bots');
  else if(action==='player-profile')renderPlayerProfile();
  else if(action==='messages'){clearInput();releaseGameplayPointerLock();window.SARSocialUI?.showPhone?.();}
  else if(action==='tournaments')window.SARCloud?.showTournaments?.();
  else if(action==='controls'||action==='settings')renderSettingsModal('controls');
  else if(action==='save')renderSaveModal();
  else if(action==='account-signup'||action==='account-login'){
    const u=document.getElementById('accountUsername')?.value||'',p=document.getElementById('accountPassword')?.value||'';
    const msg=document.getElementById('accountMessage');if(msg){msg.textContent=action==='account-signup'?'CREATING ACCOUNT…':'SIGNING IN…';msg.className='account-message';}
    const result=action==='account-signup'?await signUpLocal(u,p):await loginLocal(u,p);
    if(result.ok){renderSettingsModal('account');}
    else {const m=document.getElementById('accountMessage');if(m){m.textContent=result.error;m.className='account-message error';}}
  }
  else if(action==='account-logout'){logoutLocal();renderSettingsModal('account');}
  else if(action==='cloud-logout')await window.SARCloud?.logout?.();
  else if(action==='view-25d'){CONFIG.viewMode='2.5D';ensure25d();saveTelemetry();renderSettingsModal('view');}
  else if(action==='camera-follow'||action==='camera-tactical'){CONFIG.spectatorCamera=action==='camera-tactical'?'TACTICAL':'FOLLOW';saveTelemetry();renderSettingsModal('view');}
  else if(action==='app-check-update'){
    const msg=document.getElementById('appUpdateMessage');if(msg)msg.textContent='CHECKING FOR UPDATES…';
    await window.SARUpdater?.check?.();renderSettingsModal('updates');
  }
  else if(action==='app-install-update'){await window.SARUpdater?.apply?.();}
  else if(action==='app-install-pwa'){await window.SARUpdater?.install?.();renderSettingsModal('updates');}
  else if(action==='export-save')exportSave();
  else if(action==='import-save')document.getElementById('saveImport')?.click();
  else if(action==='resume'){state.paused=false;document.getElementById('pause').classList.remove('visible');clearInput();requestGameplayPointerLock();}
  else if(action==='exit')exitGame();
  else if(action==='quit-game')await window.SARLifecycle?.quit?.();
  else if(action==='close-result')closeModal();

  const tab=e.target.closest('[data-settings-tab]')?.dataset.settingsTab;if(tab){awaitingBindAction=null;renderSettingsModal(tab);}
  const bindAction=e.target.closest('[data-bind-action]')?.dataset.bindAction;if(bindAction){awaitingBindAction=bindAction;renderSettingsModal('controls');}

  const p=e.target.closest('[data-set-primary]')?.dataset.setPrimary;if(p){CONFIG.primary=p;STORE.set('sar-v1-primary',p);saveTelemetry();renderLoadoutModal();}
  const s=e.target.closest('[data-set-sidearm]')?.dataset.setSidearm;if(s){CONFIG.sidearm=s;STORE.set('sar-v1-sidearm',s);saveTelemetry();renderLoadoutModal();}
  const sk=e.target.closest('[data-set-skin]')?.dataset.setSkin;if(sk!==undefined){CONFIG.skin=Number(sk);STORE.set('sar-v1-skin',sk);saveTelemetry();renderOperatorModal();}
  const metaKind=e.target.closest('[data-meta-kind]')?.dataset.metaKind;if(['primary','sidearm'].includes(metaKind)){META_KIND=metaKind;META_SELECTED_WEAPON=null;updateMetaTable();}
  const metaMode=e.target.closest('[data-meta-mode]')?.dataset.metaMode;if(['tdm','deathmatch'].includes(metaMode)){META_MODE=metaMode;updateMetaTable();}
  const sortButton=e.target.closest('[data-sort-view]');if(sortButton){const view=sortButton.dataset.sortView,key=sortButton.dataset.sortKey,c=TABLE_SORT[view];if(c.key===key)c.dir*=-1;else{c.key=key;c.dir=-1;}if(view==='meta')updateMetaTable();else updateBotLeaderboard();}
  const metaWeaponRow=e.target.closest('[data-meta-weapon]');if(metaWeaponRow){META_SELECTED_WEAPON=metaWeaponRow.dataset.metaWeapon;updateMetaTable();}
  if(e.target.id==='resetMeta'){if(confirm('Archive this sample permanently and start a new current sample?')){SAVE.patchArchives.push({...cloneData(SAVE.patchState),endedAt:wallNow(),reason:'manual sample restart'});state.projectiles=[];SAVE.patchState=freshPatch('manual sample restart',SAVE.patchState.generation+1);meta=SAVE.meta=SAVE.patchState.meta;ensureParticipantAnalytics(SAVE);saveTelemetry();renderMetaModal({cohort:META_COHORT,mode:META_MODE});}}
});
document.getElementById('closeModal').addEventListener('click',()=>{awaitingBindAction=null;closeModal();});
document.addEventListener('change',e=>{if(e.target?.id==='saveImport')importSaveFile(e.target.files?.[0]);});
document.addEventListener('change',e=>{if(e.target?.id==='cameraAimBias'){CONFIG.cameraAimBias=!!e.target.checked;saveTelemetry();}});
document.addEventListener('change',e=>{if(e.target?.id==='damageNumbers'){CONFIG.damageNumbers=!!e.target.checked;damageNumbers.length=0;saveTelemetry();}});
document.addEventListener('input',e=>{
  if(e.target?.id==='adsSensitivity'){CONFIG.adsSensitivity=clamp(Number(e.target.value)||.65,.30,1);const out=document.getElementById('adsSensValue');if(out)out.textContent=CONFIG.adsSensitivity.toFixed(2)+'×';saveTelemetry();}
  if(e.target?.id==='mouseSensitivity'){
    CONFIG.mouseSensitivity=clamp(Number(e.target.value)||1,.25,2.5);
    const out=document.getElementById('sensValue');if(out)out.textContent=CONFIG.mouseSensitivity.toFixed(2)+'×';
    saveTelemetry();
  }
});

// -------------------- Main loop --------------------
initializeLeague();
updateLobbyUi();
paintLobbyKit();
addEventListener('resize',()=>{paintLobbyKit();window.SAR25D?.resize?.(innerWidth,innerHeight);document.querySelectorAll('[data-weapon-preview]').forEach(c=>drawWeaponPreview(c,c.dataset.weaponPreview));document.querySelectorAll('[data-operator-preview]').forEach(c=>drawOperatorPreview(c,Number(c.dataset.operatorPreview)));paintMetaPreview();});
let last=performance.now();
function loop(frameTime){
  const elapsed=Math.max(0,Math.min(.25,(frameTime-last)/1000));last=frameTime;
  window.SARAudio?.setView({active:['play','spectate'].includes(state.mode)&&!state.paused&&!document.hidden&&document.hasFocus(),matchId:visibleMatchId(),x:state.camera.x,y:state.camera.y});
  if(!state.paused&&!document.hidden){
    let remaining=elapsed;
    while(remaining>1e-6){const dt=Math.min(.035,remaining);simulationTime+=dt*1000;update(dt,simulationTime);remaining-=dt;}
  }
  render(simulationTime);updateDebugPanel(simulationTime);requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose a tiny read-only debugging surface for verification/dev tools.
window.SAR = {
  showWeaponMeta:renderMetaModal,metaRowsForCohort:options=>cloneData(metaRowsForCohort(options)),compactMetaHtml,
  getMetaSelection:(cohort='human')=>({...META_SELECTIONS[cohort==='bot'?'bot':'human']}),
  getTeamPresentation:matchId=>matchTeamPresentation(getMatch(matchId)),
  getProgression:()=>({...XP.view(SAVE.progression.totalXPUnits),usedWeapons:SAVE.progression.usedWeapons.slice()}),xpSummaryHtml,
  getState:()=>({mode:state.mode,running:state.running,paused:state.paused,queued:state.queued,playerMatchId:state.playerMatchId,spectateMatchId:state.spectateMatchId,actors:state.actors.length,bots:state.actors.filter(a=>!a.isPlayer).length,projectiles:state.projectiles.length,elapsed:state.elapsed,world:{...WORLD},matches:state.matches.map(m=>m?{id:m.id,matchId:m.matchId,mode:m.mode,sessionType:m.sessionType,eligible:m.eligible,participants:m.participants.length,aiRevision:m.aiRevision,score:[...m.score],hasPlayer:m.hasPlayer,status:m.status,overtime:m.overtime,timeLeftMs:matchRemainingMs(m),endReason:m.endReason,tournamentId:m.context?.tournamentId||null,slotCooldownMs:slotCooldownRemaining(m)}:null),idleBots:state.idleBots.length}),
  getWeapons:()=>JSON.parse(JSON.stringify(WEAPONS)),
  getMeta:()=>JSON.parse(JSON.stringify(meta)),
  getBots:()=>JSON.parse(JSON.stringify(botCareerStore)),
  getProfiles:()=>JSON.parse(JSON.stringify(Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,profileFor(n)])))),
  getTopMetaPrimaries:()=>topMetaPrimaries(3),
  getPrimaryCoverage:()=>JSON.parse(JSON.stringify(coverageState())),
  getBotLoadouts:()=>state.actors.filter(a=>!a.isPlayer).map(a=>({name:a.name,power:a.profile?.power,personality:a.profile?.personality?.label,primary:a.slots?.[0]?.name,sidearm:a.slots?.[1]?.name,matchId:a.matchId})),
  getSaveInfo:()=>({schema:SAVE.schema,updatedAt:SAVE.updatedAt,key:SAVE_KEY,writeProtected:saveWriteProtected,patch:metaPhase(),archives:SAVE.patchArchives.length,storageError:window.SARStorage?.error||STORE.error||null,activeBots:BOT_COUNT,retiredBots:Object.keys(SAVE.bots).filter(n=>!BOT_NAMES.slice(0,BOT_COUNT).includes(n)),account:currentAccount()?.username||null}),
  getWeaponScores:()=>weaponMetrics().map(r=>({name:r.m.name,score:r.score,kd:r.kd,skillAdjustedKd:r.skillAdjustedKd,confidence:r.confidence,usage:r.usage,accuracy:r.accuracy})),
  getActorSnapshots:()=>state.actors.map(a=>({id:a.id,name:a.name,isPlayer:a.isPlayer,matchId:a.matchId,team:a.team,x:a.x,y:a.y,hp:a.hp,dead:a.dead,vx:a.vx,vy:a.vy,target:a.target?.name||null,muzzleUntil:a.muzzleUntil,weapon:currentWeaponState(a)?.name,ammo:currentWeaponState(a)?.ammo,reloading:currentWeaponState(a)?.reloading,tactic:a.tactic,reason:a.decisionReason,tacticalQuality:a.tacticalAdvice?.quality,supportId:a.tacticalAdvice?.supportId,sourceBotId:a.sourceBotId,sessionParticipantId:a.participantId,coverState:a.coverState?.startsWith('PEEKING')&&gameNow()<a.muzzleUntil?'FIRING':a.coverState,targetSeenAt:a.target?.at,stuckCount:a.stuckCount||0,sprinting:a.sprinting,dashing:gameNow()<a.dashUntil,dashCooldownMs:Math.max(0,a.dashCooldownUntil-gameNow()),regenActive:a.regenActive,spread:!a.dead&&a.slots.length?effectiveSpreadDeg(a):null})),
  getConfig:()=>JSON.parse(JSON.stringify(CONFIG)),
  getDiagnostics:()=>cloneData(diagnostics),
  getPatch:()=>cloneData(SAVE.patchState),
  getUniverse:()=>cloneData(SAVE)
};
window.SAR.getVersion=()=>({version:'1.10.0',name:'SKYLINE',code:'skyline-1'});
window.SAR.openPlayerProfile=renderPlayerProfile;
window.SAR.startTournamentGame=startTournamentGame;
window.SAR.getMatchStandings=(id)=>{const match=getMatch(Number(id));return match?standings(match).map(row=>({...row})):[];};
window.SAR.showPanel=showModal;
window.SAR.showSettings=renderSettingsModal;
window.SAR.showBotLeaderboard=renderBotLeaderboard;
window.SAR.getBotTable=()=>({head:botHeadHtml(),body:botRowsHtml(),sort:{...TABLE_SORT.bots}});
window.SAR.setBotSort=(key)=>{const c=TABLE_SORT.bots;if(c.key===key)c.dir*=-1;else{c.key=key;c.dir=-1;}};
window.SAR.watchMatch=(id)=>{const match=getMatch(Number(id));if(!match||!['active','countdown'].includes(match.status))return false;startSpectate(Number(id));return true;};
window.SAR.preparePanel=()=>{clearInput();releaseGameplayPointerLock();};
window.SAR.startDeathmatch=startDeathmatch;window.SAR.startCustomMatch=startCustomMatch;
window.SAR.getLastResult=()=>cloneData(state.lastResult||null);
window.SAR.getActiveTournament=()=>state.matches.find(m=>m?.context?.tournamentId&&m.status==='active')?.context?.tournamentId||null;
window.SAR.cancelTournament=(id)=>{const m=state.matches.find(m=>m?.context?.tournamentId===id);if(!m)return false;m.status='cancelled';releaseSession(m);return true;};
window.SAR.prepareReload=()=>{const wasPaused=state.paused;state.paused=true;clearInput();releaseGameplayPointerLock();saveTelemetry();return ()=>{state.paused=window.SARCloud?.state?.authExpired?true:wasPaused;syncGameplayPointerLock();requestGameplayPointerLock();};};
if(CONFIG.viewMode==='2.5D')ensure25d();
})();

