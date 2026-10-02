(() => {
'use strict';

// ============================================================
// SKIRMISH ARENA REIMAGINED — LIVE UPDATE 1.3.0
// High-DPI procedural Canvas renderer, no external libraries or image assets.
// Every visual is generated in code at runtime; all balance tuning lives in WEAPONS.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
let DPR = Math.min(2, window.devicePixelRatio || 1);
let simulationTime = performance.now();
const gameNow = () => simulationTime;
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
const SCORE_LIMIT = 50;
const TEAM_COLORS = ['#20d487','#25a8ff'];
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
  'AR-15': { type:'primary', damage:28, spread:1.70, falloffStart:22, falloff:0.025, head:42, speed:80, hitSpeed:0.35, mag:30, reload:1.9, reserve:120, role:'All-rounder', auto:true, pellets:1, color:'#d9bf79', preferred:900 },
  'AK47': { type:'primary', damage:33, spread:2.50, falloffStart:25, falloff:0.028, head:50, speed:74, hitSpeed:0.40, mag:32, reload:2.6, reserve:120, role:'Heavy rifle', auto:true, pellets:1, color:'#ad7046', preferred:820 },
  'SMG-9': { type:'primary', damage:20, spread:2.90, falloffStart:14, falloff:0.040, head:30, speed:62, hitSpeed:0.22, mag:42, reload:1.9, reserve:144, role:'Close tracking', auto:true, pellets:1, color:'#91a4b0', preferred:520 },
  'Pump Shotgun': { type:'primary', damage:125, spread:4.10, falloffStart:4, falloff:0.10, head:250, speed:48, hitSpeed:1.35, mag:6, reload:2.5, reserve:30, role:'Burst shotgun', auto:false, pellets:8, color:'#46545c', preferred:330 },
  'Auto 12': { type:'primary', damage:65, spread:6.45, falloffStart:5, falloff:0.08, head:84, speed:50, hitSpeed:0.51, mag:10, reload:4.6, reserve:50, role:'Auto shotgun', auto:true, pellets:6, color:'#566775', preferred:300 },
  'LR-762': { type:'primary', damage:57, spread:5.00, falloffStart:32, falloff:0.015, head:125, speed:100, hitSpeed:0.84, mag:10, reload:3.2, reserve:60, role:'Marksman rifle', auto:false, pellets:1, color:'#6c7c66', preferred:1250 },
  'LW Tundra': { type:'primary', damage:102, spread:4.20, falloffStart:45, falloff:0.010, head:150, speed:125, hitSpeed:1.60, mag:3, reload:2.8, reserve:25, role:'Sniper rifle', auto:false, pellets:1, color:'#acc5d4', preferred:1500 },
  'War Head LMG': { type:'primary', damage:48, spread:2.35, falloffStart:24, falloff:0.020, head:68, speed:78, hitSpeed:0.50, mag:75, reload:4.3, reserve:225, role:'Sustained-fire LMG', auto:true, pellets:1, color:'#756b52', preferred:1000 },
  'P90': { type:'primary', damage:24, spread:2.20, falloffStart:20, falloff:0.032, head:35, speed:70, hitSpeed:0.28, mag:36, reload:2.4, reserve:144, role:'Ranged SMG', auto:true, pellets:1, color:'#4f93ad', preferred:720 },
  '9mm': { type:'sidearm', damage:31, spread:1.75, falloffStart:13, falloff:0.040, head:43, speed:60, hitSpeed:0.34, mag:15, reload:1.5, reserve:60, role:'Heavy sidearm', auto:false, pellets:1, color:'#4e5960', preferred:440 },
  'X16': { type:'sidearm', damage:25, spread:2.00, falloffStart:11, falloff:0.045, head:36, speed:58, hitSpeed:0.19, mag:18, reload:1.4, reserve:72, role:'Fast sidearm', auto:false, pellets:1, color:'#252d32', preferred:390 }
}
const PRIMARYS = Object.keys(WEAPONS).filter(k => WEAPONS[k].type === 'primary');
const SIDEARMS = Object.keys(WEAPONS).filter(k => WEAPONS[k].type === 'sidearm');


const WEAPON_PATCH_NOTES = [
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
const RETIRED_BOT_NAMES = ['Mira'];

const STORE = {
  get(key, fallback=null){ try { const v=localStorage.getItem(key); return v===null?fallback:v; } catch { return fallback; } },
  set(key, value){ try { localStorage.setItem(key, value);return true; } catch(error) {this.error=error.message;return false;} }
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
  const id=STORE.get(SESSION_KEY,'');if(!id)return null;
  const a=readAccounts()[id];return a?{id,username:a.username,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt}:null;
}
async function signUpLocal(username,password){
  username=normalizeUsername(username);password=String(password||'');
  if(username.length<2)return {ok:false,error:'Username must be at least 2 characters.'};
  if(password.length<4)return {ok:false,error:'Password must be at least 4 characters.'};
  const id=accountId(username),accounts=readAccounts();
  if(accounts[id])return {ok:false,error:'That username already exists on this device.'};
  const salt=randomSalt(),hash=await passwordDigest(password,salt),now=Date.now();
  accounts[id]={username,salt,hash,createdAt:now,lastLoginAt:now};writeAccounts(accounts);STORE.set(SESSION_KEY,id);
  return {ok:true,account:{id,username,createdAt:now,lastLoginAt:now}};
}
async function loginLocal(username,password){
  const id=accountId(username),accounts=readAccounts(),a=accounts[id];
  if(!a)return {ok:false,error:'Username or password is incorrect.'};
  const hash=await passwordDigest(String(password||''),a.salt);
  if(hash!==a.hash)return {ok:false,error:'Username or password is incorrect.'};
  a.lastLoginAt=Date.now();accounts[id]=a;writeAccounts(accounts);STORE.set(SESSION_KEY,id);
  return {ok:true,account:{id,username:a.username,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt}};
}
function logoutLocal(){STORE.set(SESSION_KEY,'');}

// One stable save key is intentionally version-agnostic. Every future build should migrate
// this object forward instead of changing keys, so bot careers and meta history never reset.
const SAVE_KEY='sar-persistent-save';
const SAVE_SCHEMA_VERSION=15;
const SAVE_SCHEMA=SAVE_SCHEMA_VERSION;
const DEFAULT_BINDS={
  moveUp:'KeyW',moveDown:'KeyS',moveLeft:'KeyA',moveRight:'KeyD',
  sprint:'ShiftLeft',dash:'Space',reload:'KeyR',primary:'Digit1',sidearm:'Digit2',
  scoreboard:'Tab',fullMap:'KeyM'
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
  return { name, picks:0, kills:0, deaths:0, damage:0, shots:0, hits:0, headshots:0, killDistance:0, killDistanceN:0, equippedTime:0 };
}
function blankBotCareer(name){
  return {name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0,weaponUsage:{}};
}
function profileSeed(name){ let h=2166136261; for(const ch of name){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
function defaultBotProfile(name,index){
  const power=POWER_SCORES[index] ?? Math.max(35,99-index*2);
  let archetype=ARCHETYPES[index%ARCHETYPES.length];
  if(index===0)archetype='Marksman';
  return {name,power,rank:index+1,archetype,feared:power>=90,personality:personalityBlueprint(name,index,power,archetype)};
}
function blankSeasonStats(name){return {name,games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0};}
function createSeason(number=1,startAt=Date.now()){
  return {number,startAt,endAt:startAt+SEASON_LENGTH_MS,winner:null,finalizedAt:null,stats:Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,blankSeasonStats(n)]))};
}
function normalizeSeasons(raw){
  const src=raw&&typeof raw==='object'?raw:{};
  const current=src.current&&typeof src.current==='object'?src.current:createSeason(1,Date.now());
  current.number=Number.isFinite(Number(current.number))?Math.max(1,Math.floor(Number(current.number))):1;current.startAt=Number.isFinite(Number(current.startAt))&&Number(current.startAt)>0?Number(current.startAt):Date.now();current.endAt=Number.isFinite(Number(current.endAt))&&Number(current.endAt)>current.startAt?Number(current.endAt):current.startAt+SEASON_LENGTH_MS;
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
function ensureSeasonFresh(now=Date.now()){
  if(!SAVE?.seasons?.current)return false;let changed=false;
  while(now>=SAVE.seasons.current.endAt){
    const cur=SAVE.seasons.current,winner=seasonWinnerFor(cur);cur.winner=winner;cur.finalizedAt=cur.endAt;
    SAVE.seasons.history.unshift(cloneData(cur));SAVE.seasons.current=createSeason(cur.number+1,cur.endAt);changed=true;
  }return changed;
}
function recordSeasonEvent(a,key,value=1){
  if(a.isPlayer)return;ensureSeasonFresh(Date.now());const cur=SAVE.seasons.current,ss=cur.stats[a.name]||(cur.stats[a.name]=blankSeasonStats(a.name));ss[key]=(ss[key]||0)+value;
}
function recordSeasonMatch(a,winner){
  if(!a||a.isPlayer||!a.career)return;
  const cur=SAVE.seasons.current,ss=cur.stats[a.name]||(cur.stats[a.name]=blankSeasonStats(a.name));
  ss.games++;if(a.team===winner)ss.wins++;else ss.losses++;
}
function formatSeasonRemaining(ms){
  ms=Math.max(0,ms);const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);
  return d>0?`${d}D ${h}H`:`${h}H ${m}M`;
}

// Schema migrations are additive. Unrecognized fields travel with the save.
function cloneData(v){return JSON.parse(JSON.stringify(v));}
function balanceSnapshot(){
  const fields=['type','damage','head','spread','speed','hitSpeed','falloffStart','falloff','mag','reserve','reload','pellets','auto','preferred'];
  return Object.fromEntries(Object.keys(WEAPONS).sort().map(n=>[n,Object.fromEntries(fields.map(k=>[k,WEAPONS[n][k]]))]));
}
function balanceFingerprint(snapshot=balanceSnapshot()){return 'b-'+profileSeed(JSON.stringify(snapshot)).toString(16);}
function freshPatch(reason='balance',generation=1){
  const stats=balanceSnapshot(),fingerprint=balanceFingerprint(stats);
  return {id:`${fingerprint}-${generation}`,fingerprint,generation,label:WEAPON_PATCH_NOTES[0].version,reason,startedAt:Date.now(),weaponStats:stats,completedMatches:0,observedSeconds:0,meta:Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,blankWeaponMeta(n)])),perBot:{},skillStrata:{}};
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
      if(s.meta&&Object.values(s.meta).some(m=>m.kills||m.shots||m.equippedTime))s.patchArchives.push({id:'legacy-unverified',reason:'pre-fingerprint telemetry; balance version cannot be verified',startedAt:s.createdAt,endedAt:Date.now(),meta:cloneData(s.meta),perBot:Object.fromEntries(Object.entries(s.bots||{}).map(([n,b])=>[n,cloneData(b.career?.weaponUsage||{})]))});
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
  }
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
  let out=raw?cloneData(raw):{schema:13,createdAt:Date.now(),config:{},bots:{},meta:{}};
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
    for(const w of Object.keys(WEAPONS))b.career.weaponUsage[w]=sanitizeStats(b.career.weaponUsage[w],{k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0});
    b.recentForm=Math.max(-10,Math.min(10,Number(b.recentForm)||0));b.familiarity={...b.familiarity};
    for(const w of Object.keys(WEAPONS))b.familiarity[w]=Math.max(0,Math.min(100,Number(b.familiarity[w])||0));
    b.recentMatches=Array.isArray(b.recentMatches)?b.recentMatches:[];out.bots[name]=b;
  });
  let version=Number(out.schema)||13;
  if(version>SAVE_SCHEMA_VERSION){saveWriteProtected=true;}else{
    if(version<13)version=13;
    while(version<SAVE_SCHEMA_VERSION){const migrate=MIGRATIONS[version];if(!migrate)throw new Error(`No migration for schema ${version}`);out=migrate(out);version=out.schema;}
    out.schema=SAVE_SCHEMA_VERSION;
  }
  out.config={primary:'AR-15',sidearm:'9mm',skin:0,mouseSensitivity:1,binds:{...DEFAULT_BINDS},...out.config};
  if(!PRIMARYS.includes(out.config.primary))out.config.primary='AR-15';if(!SIDEARMS.includes(out.config.sidearm))out.config.sidearm='9mm';
  out.config.skin=Math.max(0,Math.min(SKINS.length-1,Math.floor(Number(out.config.skin)||0)));out.config.mouseSensitivity=Math.max(.25,Math.min(2.5,Number(out.config.mouseSensitivity)||1));
  const binds={...out.config.binds},used=new Set();
  for(const [action,def] of Object.entries(DEFAULT_BINDS)){
    let code=binds[action];if(typeof code!=='string'||!/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Backspace|Enter|CapsLock|F[1-9]|F1[0-2])$/.test(code)||used.has(code))code=[def,...Object.values(DEFAULT_BINDS)].find(c=>!used.has(c));
    binds[action]=code;used.add(code);
  }out.config.binds=binds;
  out.seasons=normalizeSeasons(out.seasons);out.patchArchives=Array.isArray(out.patchArchives)?out.patchArchives:[];out.balancePatchHistory=Array.isArray(out.balancePatchHistory)?out.balancePatchHistory:[];
  if(!out.patchState)out.patchState=freshPatch();
  if(JSON.stringify(out.patchState.weaponStats)!==JSON.stringify(balanceSnapshot())){
    const old=out.patchState;out.patchArchives.push({...old,endedAt:Date.now(),meta:cloneData(old.meta||out.meta),reason:'weapon statistics changed'});
    const current=balanceSnapshot(),changes=[];
    for(const [n,w] of Object.entries(current))for(const [k,v] of Object.entries(w))if(old.weaponStats?.[n]?.[k]!==v)changes.push({weapon:n,field:k,before:old.weaponStats?.[n]?.[k]??null,after:v});
    out.balancePatchHistory.push({at:Date.now(),from:old.id,to:balanceFingerprint(),changes});out.patchState=freshPatch('weapon statistics changed',(old.generation||1)+1);
  }
  out.patchState.meta={...out.patchState.meta};out.patchState.perBot={...out.patchState.perBot};out.patchState.skillStrata={...out.patchState.skillStrata};
  for(const w of Object.keys(WEAPONS))out.patchState.meta[w]=sanitizeStats(out.patchState.meta[w],blankWeaponMeta(w));
  out.retiredBotArchive={...out.retiredBotArchive};for(const [n,b] of Object.entries(out.bots))if(!out.activeBotNames.includes(n))out.retiredBotArchive[n]=b;
  out.meta=out.patchState.meta;out.updatedAt=Date.now();return out;
}
let SAVE=(()=>{
  const text=STORE.get(SAVE_KEY,'null');try{const raw=JSON.parse(text);const s=normalizeSave(raw);if(raw&&raw.schema!==s.schema)STORE.set('sar-migration-backup',text);return s;}
  catch(error){STORE.set('sar-recovery-backup',text);saveWriteProtected=true;console.error('Save preserved in recovery backup:',error);return normalizeSave(null);}
})();
const CONFIG=SAVE.config;
let meta=SAVE.meta;
let botCareerStore=Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,SAVE.bots[n].career]));
function profileFor(name){return SAVE.bots[name]?.profile||defaultBotProfile(name,BOT_NAMES.indexOf(name));}
function careerFor(name){return botCareerStore[name]||SAVE.bots[name]?.career;}
function saveTelemetry(){
  if(saveWriteProtected)return;
  ensureSeasonFresh(Date.now());SAVE.schema=SAVE_SCHEMA_VERSION;SAVE.updatedAt=Date.now();SAVE.config=CONFIG;SAVE.meta=meta;SAVE.patchState.meta=meta;
  if(!STORE.set(SAVE_KEY,JSON.stringify(SAVE))){const status=document.getElementById('sarUpdateStatus');if(status)status.textContent='Device storage is full. Export Save Data to preserve this universe.';}
}
function exportEnvelope(){
  saveTelemetry();const storage={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('sar-')&&k!==SAVE_KEY)storage[k]=localStorage.getItem(k);}
  return {format:'sar-complete-backup-v1',save:cloneData(SAVE),storage};
}
function exportSave(){
  const blob=new Blob([JSON.stringify(exportEnvelope(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='skirmish-arena-complete-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importSaveFile(file){
  if(!file)return;const originalRoster=BOT_NAMES.slice(),r=new FileReader();r.onload=()=>{try{
    const parsed=JSON.parse(String(r.result||'')),world=parsed.format==='sar-complete-backup-v1'?parsed.save:parsed;
    if(!world||typeof world!=='object'||Array.isArray(world)||!world.bots)throw new Error('Invalid save');
    if(Number(world.schema)>SAVE_SCHEMA_VERSION)throw new Error('This save requires a newer game build');
    const migrated=normalizeSave(world);STORE.set('sar-import-backup',STORE.get(SAVE_KEY,'null'));
    if(!STORE.set(SAVE_KEY,JSON.stringify(migrated)))throw new Error('Device storage is full');saveWriteProtected=true;
    if(parsed.format==='sar-complete-backup-v1')for(const [k,v] of Object.entries(parsed.storage||{}))if(k.startsWith('sar-')&&k!==SAVE_KEY&&k!=='sar-import-backup'&&typeof v==='string')STORE.set(k,v);
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
const floors = [];
const walls = [];
const solids = [];
const trees = [];
const decor = [];
const S=n=>n*MAP_SCALE;
function rect(x,y,w,h,kind='wall'){ const r={type:'rect',x:S(x),y:S(y),w:S(w),h:S(h),kind}; solids.push(r); walls.push(r); return r; }
function circle(x,y,r,kind='tree'){ const c={type:'circle',x:S(x),y:S(y),r:S(r),kind}; solids.push(c); return c; }
function addBuilding(x,y,w,h,doorSide='south',tone=0){
  floors.push({x:S(x),y:S(y),w:S(w),h:S(h),tone}); const t=26, door=105;
  // four perimeter walls, with one doorway split in requested side
  if(doorSide==='north'){
    rect(x,y,(w-door)/2,t,'building'); rect(x+(w+door)/2,y,(w-door)/2,t,'building');
  } else rect(x,y,w,t,'building');
  if(doorSide==='south'){
    rect(x,y+h-t,(w-door)/2,t,'building'); rect(x+(w+door)/2,y+h-t,(w-door)/2,t,'building');
  } else rect(x,y+h-t,w,t,'building');
  if(doorSide==='west'){
    rect(x,y,t,(h-door)/2,'building'); rect(x,y+(h+door)/2,t,(h-door)/2,'building');
  } else rect(x,y,t,h,'building');
  if(doorSide==='east'){
    rect(x+w-t,y,t,(h-door)/2,'building'); rect(x+w-t,y+(h+door)/2,t,(h-door)/2,'building');
  } else rect(x+w-t,y,t,h,'building');
}
addBuilding(420,360,520,360,'south',0);
addBuilding(1440,330,470,320,'east',1);
addBuilding(3180,360,560,350,'west',2);
addBuilding(3930,690,420,390,'south',3);
addBuilding(720,2080,500,370,'north',2);
addBuilding(1650,2370,480,330,'east',1);
addBuilding(2830,2210,520,390,'north',0);
addBuilding(3780,2290,500,350,'west',3);
// central cover / structures
addBuilding(2060,1230,360,300,'south',1);
addBuilding(2660,1600,360,300,'north',2);
[
 [1180,1080,180,36],[1030,1510,36,220],[1510,1770,230,36],[3480,1250,220,36],[3730,1580,36,220],
 [2150,1980,260,36],[2420,930,36,190],[2800,1050,210,36],[3240,1860,230,36],[560,1380,220,36]
].forEach(v=>rect(...v,'fence'));
[
 [1870,1080,85,85],[1970,1080,85,85],[2490,1450,90,90],[3150,1450,82,82],[3340,2010,95,95],
 [1320,2220,82,82],[1020,820,90,90],[3900,1300,90,90],[4380,1770,80,80]
].forEach(v=>rect(...v,'crate'));
[
 [1150,420],[1140,760],[520,1280],[910,1830],[1460,1130],[1680,2020],[2060,520],
 [2880,650],[3460,910],[4270,1320],[4080,1890],[3570,2520],[2780,2570],[1200,2710]
].forEach(([x,y],i)=>{ const c=circle(x,y,34+(i%3)*4,'tree'); trees.push(c); });
// rocks
[[460,1050,32],[1810,860,29],[3070,980,36],[4420,2240,34],[2450,2270,31],[1420,2860,35],[3500,2880,29]].forEach(([x,y,r])=>circle(x,y,r,'rock'));

// deterministic decorative flecks
for(let i=0;i<190;i++){
  const x=(i*977)%WORLD.w, y=(i*619)%WORLD.h;
  decor.push({x,y,t:i%4,s:2+(i%3)});
}

const SPAWNS = [
  [180,180],[800,180],[1600,180],[2400,180],[3200,180],[4000,180],[4620,180],
  [180,760],[180,1500],[180,2350],[180,3020],
  [4620,760],[4620,1500],[4620,2350],[4620,3020],
  [760,3020],[1550,3020],[2400,3020],[3250,3020],[4050,3020],
  [1180,980],[2050,830],[2850,920],[3650,1080],[980,1760],[1850,1900],[2920,2050],[3910,1840],
  [2260,1500],[3360,1580],[1460,1500],[2450,2680]
].map(p=>({x:S(p[0]),y:S(p[1])}));

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
function obstacleHitT(x1,y1,x2,y2){
  let best=null;
  for(const o of querySegmentSolids(x1,y1,x2,y2)){
    let t=null;
    if(o.type==='rect') t=segRect(x1,y1,x2,y2,o);
    else t=segCircle(x1,y1,x2,y2,o.x,o.y,o.r);
    if(t!==null && (best===null||t<best)) best=t;
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
  for(let i=0;i<steps;i++){const nx=a.x+dx/steps;if(!collides(nx,a.y))a.x=nx;const ny=a.y+dy/steps;if(!collides(a.x,ny))a.y=ny;}
}
function formatTime(s){ const m=Math.floor(s/60),ss=Math.floor(s%60); return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'); }

// -------------------- Tactical navigation --------------------
// Every bot uses the same A* / cover system. Power affects execution quality, not access to strategy.
const NAV_STEP=40,NAV_COLS=Math.ceil(WORLD.w/NAV_STEP),NAV_ROWS=Math.ceil(WORLD.h/NAV_STEP);
let NAV_READY=false,NAV_WALKABLE=[],NAV_EDGES=[];
const COVER_POINTS=[];
function pathClear(x1,y1,x2,y2,r=ACTOR_RADIUS+5){
  if(collides(x1,y1,r)||collides(x2,y2,r))return false;
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
function nearestNav(x,y){
  buildNavigation();const gx=clamp(Math.floor(x/NAV_STEP),0,NAV_COLS-1),gy=clamp(Math.floor(y/NAV_STEP),0,NAV_ROWS-1),candidates=[];
  for(let yy=Math.max(0,gy-4);yy<=Math.min(NAV_ROWS-1,gy+4);yy++)for(let xx=Math.max(0,gx-4);xx<=Math.min(NAV_COLS-1,gx+4);xx++){
    const idx=navIndex(xx,yy);if(NAV_WALKABLE[idx]){const p=navPoint(idx);candidates.push({idx,p,d:(p.x-x)**2+(p.y-y)**2});}
  }
  candidates.sort((a,b)=>a.d-b.d);for(const c of candidates)if(pathClear(x,y,c.p.x,c.p.y,ACTOR_RADIUS+2))return c.idx;return candidates[0]?.idx??null;
}
function findPath(sx,sy,gx,gy,blocked=null){
  diagnostics.pathSearches++;
  buildNavigation();if(pathClear(sx,sy,gx,gy))return[{x:gx,y:gy}];
  const start=nearestNav(sx,sy),goal=nearestNav(gx,gy);if(start===null||goal===null)return[];
  const n=NAV_WALKABLE.length,g=new Float64Array(n);g.fill(Infinity);const came=new Int32Array(n);came.fill(-1);const closed=new Uint8Array(n);g[start]=0;
  const heap=[];const push=(idx,f)=>{heap.push({idx,f});let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p;}heap[i]={idx,f};};
  const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length&&last){let i=0;while(true){const l=i*2+1,r=l+1;if(l>=heap.length)break;let c=(r<heap.length&&heap[r].f<heap[l].f)?r:l;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return root;};
  const gp=navPoint(goal),heur=i=>{const p=navPoint(i);return Math.hypot(p.x-gp.x,p.y-gp.y);};push(start,heur(start));
  while(heap.length){const cur=pop().idx;if(closed[cur])continue;closed[cur]=1;if(cur===goal)break;const cp=navPoint(cur);
    for(const [ni,cost] of NAV_EDGES[cur]){if(closed[ni])continue;const ng=g[cur]+cost+((blocked?.get(ni)||0)>gameNow()?NAV_STEP*8:0);if(ng<g[ni]){g[ni]=ng;came[ni]=cur;push(ni,ng+heur(ni));}}

  }
  if(came[goal]===-1)return[];let chain=[],cur=goal;while(cur!==-1&&cur!==start){chain.push(navPoint(cur));cur=came[cur];}chain.reverse();chain.push({x:gx,y:gy});
  const smooth=[];let ax=sx,ay=sy,i=0;while(i<chain.length){let best=i;for(let j=i+1;j<chain.length;j++){if(pathClear(ax,ay,chain[j].x,chain[j].y))best=j;else break;}smooth.push({x:chain[best].x,y:chain[best].y});ax=chain[best].x;ay=chain[best].y;i=best+1;}return smooth;
}
const ROUTE_CACHE=new Map();
function navigateToward(a,goal,now){
  if(!goal)return {x:0,y:0};a.stuckSample??={x:a.x,y:a.y,at:now};
  if(now-a.stuckSample.at>1250){
    const moved=Math.hypot(a.x-a.stuckSample.x,a.y-a.stuckSample.y);
    if(moved<22&&dist(a,goal)>85){
      diagnostics.stuckRecoveries++;a.stuckCount=(a.stuckCount||0)+1;if(a.stuckCount>=4){a.navGoal=null;a.cover=null;a.flankGoal=null;a.nextDecision=now+1500;a.unstickGoal=null;const candidates=NAV_EDGES[nearestNav(a.x,a.y)]||[];const reachable=candidates.map(([idx])=>navPoint(idx)).filter(p=>pathClear(a.x,a.y,p.x,p.y,ACTOR_RADIUS));if(reachable.length){a.moveGoal=reachable[Math.floor(Math.random()*reachable.length)];goal=a.moveGoal;}}a.blockedCells??=new Map();const cell=nearestNav(a.x,a.y);a.blockedCells.set(cell,now+7000);a.repathAt=0;
      // A short perpendicular correction first; repeated failures trigger a different grid route.
      const angle=Math.atan2(goal.y-a.y,goal.x-a.x)+Math.PI/2*(a.stuckCount%2?1:-1);
      const local={x:a.x+Math.cos(angle)*90,y:a.y+Math.sin(angle)*90};if(pathClear(a.x,a.y,local.x,local.y))a.unstickGoal=local;
    }else a.stuckCount=0;
    a.stuckSample={x:a.x,y:a.y,at:now};
  }
  if(a.unstickGoal){if(dist(a,a.unstickGoal)<24)a.unstickGoal=null;else {const ang=Math.atan2(a.unstickGoal.y-a.y,a.unstickGoal.x-a.x);return {x:Math.cos(ang),y:Math.sin(ang)};}}
  const changed=!a.navGoal||dist(goal,a.navGoal)>110;
  if(changed||now>=a.repathAt){
    a.navGoal={...goal};const start=nearestNav(a.x,a.y),end=nearestNav(goal.x,goal.y),key=start+':'+end;
    const blocked=a.blockedCells&&[...a.blockedCells].some(([,until])=>until>now),cached=ROUTE_CACHE.get(key);
    if(cached&&!blocked&&now-cached.at<15000&&(!cached.path.length||pathClear(a.x,a.y,cached.path[0].x,cached.path[0].y))){a.navPath=cached.path.map(p=>({...p}));diagnostics.pathCacheHits++;}
    else {a.navPath=findPath(a.x,a.y,goal.x,goal.y,a.blockedCells);if(!blocked){if(ROUTE_CACHE.size>256)ROUTE_CACHE.delete(ROUTE_CACHE.keys().next().value);ROUTE_CACHE.set(key,{at:now,path:a.navPath.map(p=>({...p}))});}}
    a.navIndex=0;a.repathAt=now+rand(1800,2600);
  }
  while(a.navIndex<a.navPath.length-1&&dist(a,a.navPath[a.navIndex])<42)a.navIndex++;
  // Look ahead only where body clearance permits it.
  if(a.navIndex<a.navPath.length-1&&pathClear(a.x,a.y,a.navPath[a.navIndex+1].x,a.navPath[a.navIndex+1].y))a.navIndex++;
  const wp=a.navPath[a.navIndex];if(!wp){a.repathAt=Math.min(a.repathAt,now+500);return {x:0,y:0};}
  const angle=Math.atan2(wp.y-a.y,wp.x-a.x);return {x:Math.cos(angle),y:Math.sin(angle)};
}
function chooseCover(a,target){
  buildNavigation();let best=null,bestScore=Infinity;
  for(const c of COVER_POINTS){
    const da=dist(a,c);if(da>650||da>bestScore+100||pointLOS(c.x,c.y,target))continue;
    const peeks=c.peek.filter(p=>!collides(p.x,p.y,ACTOR_RADIUS+3)&&pointLOS(p.x,p.y,target));if(!peeks.length)continue;
    const crowd=(a.visibleAllies||[]).filter(o=>dist(o,c)<100).length,range=dist(c,target),score=da+crowd*200+Math.abs(range-currentWeapon(a).preferred)*.1;
    if(score<bestScore){bestScore=score;best={x:c.x,y:c.y,peek:peeks,facing:Math.atan2(target.y-c.y,target.x-c.x),escape:(()=>{const angle=Math.atan2(c.y-target.y,c.x-target.x),x=c.x+Math.cos(angle)*120,y=c.y+Math.sin(angle)*120;return pathClear(c.x,c.y,x,y)?{x,y}:{x:c.x,y:c.y};})()};}
  }return best;
}

function pointLOS(x,y,target){return obstacleHitT(x,y,target.x,target.y)===null;}
function makeFlankGoal(a,target){
  const w=currentWeapon(a),base=Math.atan2(a.y-target.y,a.x-target.x),side=a.strafeDir;for(const offset of [Math.PI*.55*side,-Math.PI*.55*side,Math.PI*.8*side]){
    const r=clamp(w.preferred*.75,320,920),x=clamp(target.x+Math.cos(base+offset)*r,80,WORLD.w-80),y=clamp(target.y+Math.sin(base+offset)*r,80,WORLD.h-80);if(!collides(x,y,ACTOR_RADIUS+6))return{x,y};
  }return null;
}

// -------------------- Game state --------------------
let state = {
  mode:'menu', running:false, paused:false, elapsed:0, startTime:0,
  actors:[], projectiles:[], particles:[], camera:{x:WORLD.w/2,y:WORLD.h/2},
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
  const map={ShiftLeft:'L-SHIFT',ShiftRight:'R-SHIFT',Space:'SPACE',Tab:'TAB',Escape:'ESC',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'};
  if(map[code])return map[code];
  if(code?.startsWith('Key'))return code.slice(3);
  if(code?.startsWith('Digit'))return code.slice(5);
  return code||'UNBOUND';
}
let nextShotId=1;

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
  const p=a.profile.personality,b=SAVE.bots[a.name],rows=weaponMetrics();
  return weightedChoice(SIDEARMS,SIDEARMS.map(n=>{const r=rows.find(r=>r.m.name===n),comfort=(b.familiarity[n]||0)/100,style=(n==='X16'&&['Rusher','Flanker'].includes(a.traits.archetype))?1.2:1;return style*(.7+comfort*.2+(r?.score||50)/100*p.metaAwareness); }));
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
  // With nine primaries and 40 bot assignments, ten coverage picks guarantee every primary appears at least once while 75% remain organic.
  if(c.assignments%4!==0)return null;
  const rows=weaponMetrics(),allFull=rows.filter(r=>PRIMARYS.includes(r.m.name)).every(r=>r.confidence>=.999);
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
  const rows=weaponMetrics().filter(r=>PRIMARYS.includes(r.m.name)),phase=metaPhase(rows),b=SAVE.bots[a.name],p=a.profile.personality,previous=a.slots?.[0]?.name;
  // Bots learn observed results at different rates. A balance edit never supplies a verdict.
  const perceptionAge=Date.now()-(b.metaReadAt||0),delay=(1-p.metaAwareness)*180000+15000;
  b.perceivedMeta??={};if(b.metaPatch!==SAVE.patchState.id){b.metaPatch=SAVE.patchState.id;b.perceivedMeta={};b.metaReadAt=Date.now();}
  if(perceptionAge>delay){for(const r of rows){const old=b.perceivedMeta[r.m.name]??50;b.perceivedMeta[r.m.name]=old+(r.score-old)*(.18+p.metaAwareness*.45);}b.metaReadAt=Date.now();}
  const coverage=context==='match'?chooseCoverageWeapon(a):null;
  if(coverage){recordCoveragePick(coverage);return coverage;}
  const weights=PRIMARYS.map(n=>{
    const row=rows.find(r=>r.m.name===n),proven=clamp(((b.perceivedMeta[n]??50)-50)/30,-1,1),style=styleFitForWeapon(a,n),comfort=(b.familiarity[n]||0)/100;
    const personal=b.recentMatches.filter(m=>m.patchId===SAVE.patchState.id&&m.weapons?.[n]).map(m=>m.weapons[n]),eng=personal.reduce((s,m)=>s+m.k+m.d,0),kills=personal.reduce((s,m)=>s+m.k,0),personalShare=(kills+10)/(eng+20);
    const exploration=(1-(row?.confidence||0))*(phase.phase==='DISCOVERY'?1.25:.7);
    const gravity=.35*proven*(.65+p.metaAwareness)+.20*style+.15*comfort+.10*(personalShare-.5)*2+.10*exploration+.10*rand(-p.unpredictability,p.unpredictability);
    let weight=Math.exp(gravity*3.3);if(n===previous&&context==='match')weight*=.48+p.weaponLoyalty*.5;return Math.max(.05,weight);
  });const chosen=weightedChoice(PRIMARYS,weights);if(context==='match')recordCoveragePick(chosen);return chosen;
}

function makeActor(name,isPlayer=false,botIndex=0){
  const skinIndex=isPlayer?CONFIG.skin:(botIndex%SKINS.length);
  const a={
    id:nextActorId++, name, isPlayer, botIndex, team:null, matchId:null, x:0,y:0,vx:0,vy:0,angle:0,hp:MAX_HP,dead:false,deathAt:0,respawnAt:0,
    skinIndex, speed:isPlayer?PLAYER_SPEED:BOT_SPEED, currentSlot:0, slots:[], target:null,targetSeenAt:0,nextThink:0,
    wander:{x:WORLD.w/2,y:WORLD.h/2,until:0}, strafeDir:Math.random()<.5?-1:1, muzzleUntil:0,recoil:0,hitFlash:0,spawnFlash:0,
    profile:isPlayer?null:profileFor(name), traits:isPlayer?null:makeTraits(botIndex,name), stats:{kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0},
    career:isPlayer?null:careerFor(name),
    weaponUsage:isPlayer?Object.fromEntries(Object.keys(WEAPONS).map(n=>[n,{k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0}])):careerFor(name).weaponUsage, damageLedger:new Map(),
    lastDamager:null,lastDamageAt:0, regenActive:false, aiAim:0, aiAimReadyAt:0,
    sprinting:false, spreadBloom:0, desiredVx:0,desiredVy:0, wasInPlayerView:false,playerViewReadyAt:0,
    dashUntil:0,dashCooldownUntil:0,dashVx:0,dashVy:0,lastDashAt:-Infinity,
    navPath:[],navIndex:0,navGoal:null,repathAt:0,tactic:'advance',cover:null,coverUntil:0,peekUntil:0,peekSide:1,flankGoal:null,nextMetaCheck:0
  };
  const primary=isPlayer?CONFIG.primary:chooseBotPrimary(a,'life');
  const side=isPlayer?CONFIG.sidearm:chooseBotSidearm(a);
  a.slots=[makeWeaponState(primary),makeWeaponState(side)];
  resetBrain(a);
  return a;
}
function resetBrain(a){
  a.memory=new Map();a.visibleEnemies=[];a.visibleAllies=[];a.nextThink=0;a.nextDecision=0;a.nextAim=0;a.aimPoint={x:a.x,y:a.y};a.aimNoise=0;a.targetChangedAt=0;a.actionUntil=0;a.dashExecuteAt=gameNow()+(a.traits?.reaction||.2)*1000;a.moveGoal=null;a.coverState='MOVING_TO_COVER';a.coverStateUntil=0;a.flankUntil=0;a.strafeUntil=0;a.stuckSample=null;a.stuckCount=0;a.blockedCells=new Map();a.unstickGoal=null;a.matchVariance=rand(-.035,.035);
}
function shuffle(items){const result=items.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function registerPick(a){
  for(const s of a.slots){ meta[s.name].picks++; a.weaponUsage[s.name].picks++;recordPatchEvent(a,s.name,'picks'); }
}
function actorsInMatch(matchId){
  const m=state.matches[matchId];return m?.participants?.filter(a=>a.matchId===matchId)||[];
}
function getMatch(matchId){
  return state.matches.find(m=>m && m.id===matchId) || null;
}
function spawnScore(p, actor){
  let minEnemy=999999, visibleEnemies=0, occupied=0, teammateNear=0;
  for(const other of state.actors){
    if(other===actor||other.dead||other.matchId!==actor.matchId) continue;
    const d=Math.hypot(p.x-other.x,p.y-other.y);
    if(d<115) occupied++;
    if(other.team===actor.team){
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
function resetActorMatchStats(a){
  a.stats={kills:0,deaths:0,assists:0,damage:0,taken:0,shots:0,hits:0,headshots:0,timeAlive:0};a.matchWeaponStats={};
}
function prepareActorForMatch(a, matchId, team){
  a.matchId=matchId;a.team=team;a.currentSlot=0;a.target=null;a.damageLedger.clear();a.lastDamager=null;a.navPath=[];a.navIndex=0;a.navGoal=null;a.cover=null;a.tactic='advance';
  resetActorMatchStats(a);
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
  a.hp=MAX_HP;a.dead=false;a.deathAt=0;a.respawnAt=0;a.currentSlot=0;a.target=null;a.damageLedger.clear();a.lastDamager=null;a.lastDamageAt=0;a.regenActive=false;a.dashUntil=0;a.dashCooldownUntil=0;a.dashVx=0;a.dashVy=0;a.navPath=[];a.navIndex=0;a.navGoal=null;a.cover=null;a.tactic='advance';
  a.spawnFlash=gameNow()+600;a.hitFlash=0;a.recoil=0;a.muzzleUntil=0;resetBrain(a);
  registerPick(a);
}
function clearMatchEffects(matchId){
  state.projectiles=state.projectiles.filter(p=>p.matchId!==matchId);
  state.particles=state.particles.filter(p=>p.matchId!==matchId);
}
function startMatch(matchId, participants, hasPlayer=false){
  clearMatchEffects(matchId);
  const shuffled=shuffle(participants);
  const match={participants:shuffled,id:matchId,score:[0,0],limit:SCORE_LIMIT,status:'active',hasPlayer,startedAt:gameNow(),durationMs:MATCH_DURATION_MS,overtime:false,endedAt:0,winner:null,endReason:null};
  state.matches[matchId]=match;
  shuffled.forEach((a,i)=>{
    const team=i<TEAM_SIZE?0:1;
    prepareActorForMatch(a,matchId,team);
  });
  for(const a of shuffled) respawnActor(a,true);
  return match;
}
function startBotMatch(matchId, bots){
  return startMatch(matchId,bots,false);
}
function initializeLeague(){
  if(state.leagueStarted) return;
  state.leagueStarted=true;state.actors=[];state.matches=[];state.idleBots=[];nextActorId=1;
  const bots=[];
  for(let i=0;i<BOT_COUNT;i++) bots.push(makeActor(BOT_NAMES[i],false,i));
  state.actors.push(...bots);
  const shuffled=shuffle(bots);
  for(let matchId=0;matchId<MATCH_COUNT;matchId++) startBotMatch(matchId,shuffled.slice(matchId*10,matchId*10+10));
  // 50 persistent bots / 40 live slots. The ten waiting bots rotate into completed
  // matches first so no bot is permanently benched.
  state.idleBots.push(...shuffled.slice(MATCH_COUNT*10));
}
function queueForMatch(){
  initializeLeague();
  if(state.queued||state.playerMatchId!==null) return;
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
  startMatch(matchId,[player,...chosen],true);
  state.playerMatchId=matchId;state.queued=false;state.running=true;state.mode='play';state.paused=false;state.elapsed=0;state.startTime=gameNow();
  document.getElementById('menu').classList.remove('visible');
  document.getElementById('pause').classList.remove('visible');
  document.getElementById('modal').classList.remove('visible');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('crosshair').classList.remove('hidden');
  const focus=getPlayer(); if(focus){state.camera.x=focus.x;state.camera.y=focus.y;}
  input.aimX=cssW/2+Math.min(220,cssW*.22);input.aimY=cssH/2;input.fullMap=false;
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
  const player=getPlayer();
  const playerTeam=player?.team??0, won=match.winner===playerTeam;
  const released=actorsInMatch(match.id).filter(a=>!a.isPlayer);
  if(player){
    player.matchId=null;player.team=null;
    state.actors=state.actors.filter(a=>a!==player);
  }
  state.playerMatchId=null;state.running=false;state.mode='menu';
  rotateBotMatch(match.id,released,10);
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('crosshair').classList.add('hidden');
  document.getElementById('menu').classList.add('visible');
  const qb=document.getElementById('queueButton');if(qb){qb.disabled=false;qb.textContent='PLAY 5V5 TDM';}
  document.getElementById('queueStatus')?.classList.add('hidden');
  showModal(`<div class="eyebrow">MATCH COMPLETE</div><h2>${won?'Victory':'Defeat'}</h2><div class="result-score"><strong style="color:${TEAM_COLORS[playerTeam]}">${match.score[playerTeam]}</strong><span>—</span><strong style="color:${TEAM_COLORS[1-playerTeam]}">${match.score[1-playerTeam]}</strong></div><p>${match.endReason==='time'?'The five-minute clock expired.':match.endReason==='overtime'?'The tied game was decided in sudden-death overtime.':'A team reached 50 kills.'} The released bots have already been returned to the live matchmaking pool.</p><button data-action="close-result">RETURN TO LOBBY</button>`);
}
function finishBotMatch(match){
  const released=actorsInMatch(match.id).filter(a=>!a.isPlayer);
  if(state.queued && state.playerMatchId===null && released.length>=9){
    launchPlayerMatch(match.id,released);
  } else {
    rotateBotMatch(match.id,released,10);
  }
}
function endMatch(match,winner,reason='score'){
  if(!match||match.status!=='active')return;
  ensureSeasonFresh(Date.now());
  match.status='ended';match.winner=winner;match.endReason=reason;match.endedAt=gameNow();
  for(const a of actorsInMatch(match.id)){recordCompletedParticipant(a);if(a.career){a.career.games++;if(a.team===winner)a.career.wins++;else a.career.losses++;recordSeasonMatch(a,winner);recordBotResult(a,winner);}}
  SAVE.patchState.completedMatches++;diagnostics.completedMatches++;diagnostics.matchScoreKills+=match.score[0]+match.score[1];
  saveTelemetry();
  for(const a of actorsInMatch(match.id)){a.vx=a.vy=0;a.target=null;}
  // Bot network continuity rule: completed matches are recycled immediately. There is
  // no intermission where the bot population stops playing.
  queueMicrotask(()=>match.hasPlayer?finishPlayerMatch(match):finishBotMatch(match));
}
function matchRemainingMs(match,now=gameNow()){return Math.max(0,match.durationMs-(now-match.startedAt));}
function updateMatchClocks(now){
  for(const match of state.matches){
    if(!match||match.status!=='active'||match.overtime)continue;
    if(matchRemainingMs(match,now)<=0){
      if(match.score[0]===match.score[1])match.overtime=true;
      else endMatch(match,match.score[0]>match.score[1]?0:1,'time');
    }
  }
}
function exitGame(){
  state.paused=false;state.queued=false;
  const match=state.playerMatchId!==null?getMatch(state.playerMatchId):null;
  if(match&&match.status==='active'){
    const bots=actorsInMatch(match.id).filter(a=>!a.isPlayer);
    const player=getPlayer();if(player)state.actors=state.actors.filter(a=>a!==player);
    state.playerMatchId=null;state.running=false;state.mode='menu';rotateBotMatch(match.id,bots,10);
  } else {state.running=false;state.mode='menu';state.spectateActorId=null;}
  document.getElementById('hud').classList.add('hidden');document.getElementById('spectatorHud')?.classList.add('hidden');document.getElementById('scoreboard').classList.add('hidden');
  document.getElementById('crosshair').classList.add('hidden');document.getElementById('pause').classList.remove('visible');
  document.getElementById('menu').classList.add('visible');
  const qb=document.getElementById('queueButton');if(qb){qb.disabled=false;qb.textContent='PLAY 5V5 TDM';}
}
function getPlayer(){ return state.actors.find(a=>a.isPlayer&&a.matchId!==null); }
function spectatedActor(){
  if(state.mode!=='spectate')return null;let a=state.actors.find(x=>x.id===state.spectateActorId&&x.matchId===state.spectateMatchId&&!x.dead);
  if(!a){a=actorsInMatch(state.spectateMatchId).find(x=>!x.dead)||actorsInMatch(state.spectateMatchId)[0]||null;state.spectateActorId=a?.id??null;}return a;
}
function getFocusActor(){ return getPlayer()||spectatedActor(); }
function visibleMatchId(){
  if(state.playerMatchId!==null)return state.playerMatchId;
  if(state.mode==='spectate')return state.spectateMatchId;
  return 0;
}
function cycleSpectateActor(dir=1){
  if(state.mode!=='spectate')return;const list=actorsInMatch(state.spectateMatchId).filter(a=>!a.dead);if(!list.length)return;
  let i=list.findIndex(a=>a.id===state.spectateActorId);i=(i+dir+list.length)%list.length;state.spectateActorId=list[i].id;
}
function cycleSpectateMatch(dir=1){
  if(state.mode!=='spectate')return;state.spectateMatchId=(state.spectateMatchId+dir+MATCH_COUNT)%MATCH_COUNT;const a=actorsInMatch(state.spectateMatchId).find(x=>!x.dead);state.spectateActorId=a?.id??null;
}
function startSpectate(){
  initializeLeague();state.mode='spectate';state.running=true;state.paused=false;state.spectateMatchId=0;const a=actorsInMatch(0).find(x=>!x.dead);state.spectateActorId=a?.id??null;
  document.getElementById('menu').classList.remove('visible');document.getElementById('modal').classList.remove('visible');document.getElementById('pause').classList.remove('visible');
  document.getElementById('hud').classList.add('hidden');document.getElementById('crosshair').classList.add('hidden');document.getElementById('spectatorHud')?.classList.remove('hidden');updateSpectatorHud(gameNow());
}

// -------------------- Combat --------------------
function currentWeaponState(a){ return a.slots[a.currentSlot]; }
function currentWeapon(a){ return WEAPONS[currentWeaponState(a).name]; }
function startReload(a,now){
  const s=currentWeaponState(a),w=WEAPONS[s.name];
  if(a.dead||s.reloading||s.ammo>=w.mag||s.reserve<=0) return;
  s.reloading=true;s.reloadEnd=now+w.reload*1000;
}
function finishReload(s){
  const w=WEAPONS[s.name],need=w.mag-s.ammo,take=Math.min(need,s.reserve);s.ammo+=take;s.reserve-=take;s.reloading=false;s.reloadEnd=0;
}
function fire(a, angle, now){
  const s=currentWeaponState(a), w=WEAPONS[s.name];
  if(a.dead||s.reloading||now-s.lastShot<w.hitSpeed*1000) return false;
  if(s.ammo<=0){ startReload(a,now); return false; }
  s.ammo--;s.lastShot=now;a.muzzleUntil=now+65;a.recoil=1;
  // Procedural weapon VFX: warm muzzle sparks and a tiny brass casing for non-shotgun firearms.
  const muzzle=20+weaponLength(s.name)-weaponKick(s.name,a.recoil)-a.recoil*1.3;
  const mx=a.x+Math.cos(angle)*muzzle,my=a.y+Math.sin(angle)*muzzle;
  for(let q=0;q<3;q++){const sa=angle+rand(-.28,.28),sv=rand(45,110);state.particles.push({matchId:a.matchId,type:'spark',x:mx,y:my,vx:Math.cos(sa)*sv,vy:Math.sin(sa)*sv,life:rand(.09,.16),age:0,size:1.5,color:'#ffd878'});}
  if(w.pellets===1){const side=angle+Math.PI/2+rand(-.18,.18),sv=rand(35,70);state.particles.push({matchId:a.matchId,type:'casing',x:a.x+Math.cos(angle)*18,y:a.y+Math.sin(angle)*18,vx:Math.cos(side)*sv,vy:Math.sin(side)*sv,life:.55,age:0,size:2,color:'#d7b45a',spin:rand(0,6.28)});}
  const pelletDamage=w.damage/w.pellets, pelletHead=w.head/w.pellets;
  const shotSpread=effectiveSpreadDeg(a,w);
  a.spreadBloom=Math.min(w.spread*.95,(a.spreadBloom||0)+Math.max(.04,w.spread*(w.auto?.08:.13)));
  // Accuracy is trigger-pull based: one shot fired regardless of pellet count.
  // A shotgun trigger pull counts as one hit if at least one pellet connects.
  const shotId=nextShotId++, shotRecord={id:shotId,hit:false};
  meta[s.name].shots++;recordPatchEvent(a,s.name,'shots');a.stats.shots++;a.weaponUsage[s.name].shots++;if(a.career)a.career.shots++;
  for(let i=0;i<w.pellets;i++){
    const spread=(Math.random()-.5)*shotSpread*Math.PI/180;
    const ang=angle+spread;
    // Begin at the collision boundary so firing beside a wall cannot bypass it.
    const muzzle=ACTOR_RADIUS+1;
    const obstruction=obstacleHitT(a.x,a.y,a.x+Math.cos(ang)*muzzle,a.y+Math.sin(ang)*muzzle);if(obstruction!==null)continue;
    state.projectiles.push({
      matchId:a.matchId,x:a.x+Math.cos(ang)*muzzle,y:a.y+Math.sin(ang)*muzzle,px:a.x,py:a.y,
      vx:Math.cos(ang)*w.speed*TILE,vy:Math.sin(ang)*w.speed*TILE,owner:a,weapon:s.name,
      damage:pelletDamage,head:pelletHead,travel:muzzle,born:now,dead:false,shot:shotRecord
    });
  }
  if(s.ammo===0 && !a.isPlayer) startReload(a,now+30);
  return true;
}
function damageAtRange(p, isHead){
  const w=WEAPONS[p.weapon], tiles=p.travel/TILE;
  const over=Math.max(0,tiles-w.falloffStart), mult=Math.max(.45,1-over*w.falloff);
  return (isHead?p.head:p.damage)*mult;
}
function killActor(victim,killer,weapon,isHead,killDistance,now){
  if(victim.dead)return;
  victim.dead=true;victim.deathAt=now;victim.respawnAt=now+RESPAWN_MS;victim.stats.deaths++;if(victim.career)victim.career.deaths++;
  const equipped=currentWeaponState(victim)?.name; if(equipped){meta[equipped].deaths++;recordPatchEvent(victim,equipped,'deaths');victim.weaponUsage[equipped].d++;}
  if(killer && killer!==victim){
    killer.stats.kills++;if(killer.career)killer.career.kills++;meta[weapon].kills++;recordPatchEvent(killer,weapon,'kills');killer.weaponUsage[weapon].k++;
    meta[weapon].killDistance+=killDistance;meta[weapon].killDistanceN++;
    if(isHead){ killer.stats.headshots++;killer.weaponUsage[weapon].headshots++;if(killer.career)killer.career.headshots++;meta[weapon].headshots++;recordPatchEvent(killer,weapon,'headshots'); }
    // assists from recent contributors
    for(const [id,entry] of victim.damageLedger){
      if(id===killer.id||now-entry.time>5000||entry.damage<35)continue;
      const assister=state.actors.find(a=>a.id===id); if(assister){assister.stats.assists++;recordSeasonEvent(assister,'assists');if(assister.career)assister.career.assists++;}
    }
    const match=getMatch(killer.matchId);
    if(match && match.status==='active' && killer.team!==victim.team){
      match.score[killer.team]++;
      if(match.score[killer.team]>=match.limit) endMatch(match,killer.team,'score');
      else if(match.overtime) endMatch(match,killer.team,'overtime');
    }
    if(killer.matchId===visibleMatchId()) addKillfeed(killer.name,victim.name,weapon,isHead);
    if(!killer.isPlayer&&killer.traits) killer.traits.confidence=clamp(killer.traits.confidence+.06,0,1);
  }
  if(!victim.isPlayer&&victim.traits) victim.traits.confidence=clamp(victim.traits.confidence-.05,0,1);
  for(let i=0;i<15;i++) state.particles.push({matchId:victim.matchId,x:victim.x,y:victim.y,vx:rand(-120,120),vy:rand(-120,120),life:rand(.35,.75),age:0,size:rand(2,5),color:SKINS[victim.skinIndex].accent});
}
function applyDamage(victim,p,amount,isHead,now){
  if(victim.dead)return;
  const actual=Math.min(victim.hp,amount);victim.hp-=actual;victim.stats.taken+=actual;recordSeasonEvent(victim,'taken',actual);p.owner.stats.damage+=actual;p.owner.weaponUsage[p.weapon].damage+=actual;meta[p.weapon].damage+=actual;recordPatchEvent(p.owner,p.weapon,'damage',actual);if(victim.career)victim.career.taken+=actual;if(p.owner.career)p.owner.career.damage+=actual;
  victim.hitFlash=now+90;victim.lastDamager=p.owner;victim.lastDamageAt=now;victim.regenActive=false;
  const e=victim.damageLedger.get(p.owner.id)||{damage:0,time:now};e.damage+=actual;e.time=now;victim.damageLedger.set(p.owner.id,e);
  if(victim.hp<=0) killActor(victim,p.owner,p.weapon,isHead,p.travel,now);
}
function updateProjectiles(dt,now){
  for(const p of state.projectiles){
    if(p.dead)continue;const match=getMatch(p.matchId);if(!match||match.status!=='active'){p.dead=true;continue;}p.px=p.x;p.py=p.y;const nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;const segLen=Math.hypot(nx-p.x,ny-p.y);
    let bestT=1.01,best=null;
    const ot=obstacleHitT(p.x,p.y,nx,ny); if(ot!==null){bestT=ot;best='wall';}
    for(const a of actorsInMatch(p.matchId)){
      if(a===p.owner||a.dead||a.matchId!==p.matchId||a.team===p.owner.team)continue;
      const t=segCircle(p.x,p.y,nx,ny,a.x,a.y,ACTOR_RADIUS);
      if(t!==null&&t<bestT){bestT=t;best=a;}
    }
    if(best){
      p.travel += segLen*bestT;p.x=lerp(p.x,nx,bestT);p.y=lerp(p.y,ny,bestT);
      if(best!=='wall'){
        const centerError=lineDistToPoint(p.px,p.py,nx,ny,best.x,best.y);
        const isHead=centerError<7.2;
        if(!p.shot.hit){p.shot.hit=true;meta[p.weapon].hits++;recordPatchEvent(p.owner,p.weapon,'hits');p.owner.stats.hits++;p.owner.weaponUsage[p.weapon].hits++;if(p.owner.career)p.owner.career.hits++;}
        const amount=damageAtRange(p,isHead);applyDamage(best,p,amount,isHead,now);
        state.particles.push({matchId:p.matchId,x:p.x,y:p.y,vx:rand(-50,50),vy:rand(-50,50),life:.18,age:0,size:2.7,color:isHead?'#ffd66b':'#ffffff'});
      }
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
  a.dashVx=dx*DASH_SPEED;a.dashVy=dy*DASH_SPEED;a.dashUntil=now+DASH_DURATION_MS;a.dashCooldownUntil=now+DASH_COOLDOWN_MS;a.lastDashAt=now;a.sprinting=false;
  for(let i=0;i<8;i++)state.particles.push({matchId:a.matchId,type:'dash',x:a.x-rand(0,26)*dx+rand(-6,6),y:a.y-rand(0,26)*dy+rand(-6,6),vx:-dx*rand(35,85),vy:-dy*rand(35,85),life:rand(.16,.30),age:0,size:rand(2.2,4.6),color:a.isPlayer?'#7cf0d0':TEAM_COLORS[a.team]});
  return true;
}
function updateDashMotion(a,dt,now){
  if(now>=a.dashUntil)return false;
  moveWithCollision(a,a.dashVx*dt,a.dashVy*dt);
  a.vx=a.dashVx;a.vy=a.dashVy;
  if(Math.random()<.55)state.particles.push({matchId:a.matchId,type:'dash',x:a.x,y:a.y,vx:-a.dashVx*.06,vy:-a.dashVy*.06,life:.18,age:0,size:3.5,color:a.isPlayer?'#7cf0d0':TEAM_COLORS[a.team]});
  return true;
}
// -------------------- AI
// Perception contains observations, never references to live hidden actors.
function selectTarget(a,now){
  a.memory??=new Map();const visible=[],allies=[];
  for(const o of actorsInMatch(a.matchId)){
    if(o===a||o.dead)continue;const d=dist(a,o);if(d>2200||!hasLOS(a,o))continue;
    if(o.team===a.team){allies.push({id:o.id,x:o.x,y:o.y,hp:o.hp,angle:o.angle,muzzleUntil:o.muzzleUntil,at:now});continue;}
    const observation={id:o.id,name:o.name,isPlayer:o.isPlayer,x:o.x,y:o.y,vx:o.vx,vy:o.vy,hp:o.hp,power:o.profile?.power||50,weapon:currentWeaponState(o).name,angle:o.angle,at:now,visible:true};
    a.memory.set(o.id,observation);visible.push(observation);
  }
  const visibleIds=new Set(visible.map(o=>o.id));
  for(const [id,o] of a.memory){if(now-o.at>4200)a.memory.delete(id);else if(!visibleIds.has(id))o.visible=false;}
  a.visibleEnemies=visible;a.visibleAllies=allies;
  const p=a.profile.personality,w=currentWeapon(a),score=o=>{
    const d=dist(a,o),attention=Math.abs(angleDiff(Math.atan2(a.y-o.y,a.x-o.x),o.angle))<.4;
    const nearby=visible.filter(x=>x.id!==o.id&&dist(x,o)<400).length;
    return 1.6-Math.abs(d-w.preferred*.75)/1800+(1-o.hp/MAX_HP)*p.chasePreference+.28*(nearby===0)+.18*(o.id===a.lastDamager?.id)+.16*(o.power/100)*(attention?1:-.3)+(o.visible?.8:-.5)+.25*allies.some(ally=>dist(ally,o)<850&&Math.abs(angleDiff(Math.atan2(o.y-ally.y,o.x-ally.x),ally.angle))<.35)-.14*Math.max(0,visible.length-allies.length-1);
  };
  let best=null,bestScore=-Infinity;for(const o of a.memory.values()){const v=score(o);if(v>bestScore){best=o;bestScore=v;}}
  const old=a.target&&a.memory.get(a.target.id),committed=old&&now-a.targetChangedAt<500+p.targetPersistence*1100;
  if(old&&(committed||score(old)+.3+p.targetPersistence*.15>=bestScore))best=old;
  if(best?.id!==a.target?.id){a.aiAimReadyAt=now+a.traits.reaction*1000;a.targetChangedAt=now;a.cover=null;a.flankGoal=null;a.nextDecision=0;if(best)diagnostics.actions.SWITCH_TARGET=(diagnostics.actions.SWITCH_TARGET||0)+1;}
  if(best?.visible&&a.target?.id===best.id&&!a.target.visible)a.aiAimReadyAt=now+a.traits.reaction*1000;
  a.target=best?{...best}:null;if(best)a.targetSeenAt=best.at;
}
function obstacleSteer(a,dx,dy){
  let sx=dx,sy=dy;
  for(const o of querySolids(a.x-90,a.y-90,a.x+90,a.y+90)){
    const cx=o.type==='circle'?o.x:clamp(a.x,o.x,o.x+o.w),cy=o.type==='circle'?o.y:clamp(a.y,o.y,o.y+o.h),length=Math.hypot(a.x-cx,a.y-cy)||1,d=length-ACTOR_RADIUS-(o.type==='circle'?o.r:0);
    if(d<32){const strength=clamp((32-d)/32,0,1)*.65;sx+=(a.x-cx)/length*strength;sy+=(a.y-cy)/length*strength;}
  }
  for(const o of actorsInMatch(a.matchId)){if(o===a||o.dead||o.team!==a.team)continue;const d=dist(a,o);if(d>0&&d<78&&hasLOS(a,o)){sx+=(a.x-o.x)/d*(78-d)/78*.8;sy+=(a.y-o.y)/d*(78-d)/78*.8;}}
  const len=Math.hypot(sx,sy)||1;return {x:sx/len,y:sy/len};
}
function incomingDanger(a){
  let danger=0,side=null;
  for(const p of state.projectiles){
    if(p.matchId!==a.matchId||p.owner.team===a.team||Math.hypot(p.x-a.x,p.y-a.y)>420||!hasLOS(a,p))continue;
    const speed2=p.vx*p.vx+p.vy*p.vy,t=((a.x-p.x)*p.vx+(a.y-p.y)*p.vy)/speed2;
    if(t>0&&t<.12&&Math.hypot(p.x+p.vx*t-a.x,p.y+p.vy*t-a.y)<ACTOR_RADIUS+18){danger++;side={x:-p.vy,y:p.vx};}
  }return {danger,side};
}
function safeRetreatGoal(a,t){
  const cover=chooseCover(a,t);if(cover){a.cover=cover;return cover;}
  const angle=Math.atan2(a.y-t.y,a.x-t.x);
  for(const off of [0,.65,-.65,1.2,-1.2]){const x=clamp(a.x+Math.cos(angle+off)*400,50,WORLD.w-50),y=clamp(a.y+Math.sin(angle+off)*400,50,WORLD.h-50);if(!collides(x,y))return {x,y};}
  return a.wander;
}
function decideBot(a,now){
  const t=a.target,p=a.profile.personality,s=currentWeaponState(a),w=currentWeapon(a),hp=a.hp/MAX_HP,familiar=(SAVE.bots[a.name].familiarity[s.name]||0)/100;
  const form=SAVE.bots[a.name].recentForm/10,risk=clamp(p.riskTolerance+form*.08+a.matchVariance,0,1),dash=now>=a.dashCooldownUntil,low=hp<p.retreatThreshold;
  if(!t){if((a.hp<=REGEN_THRESHOLD&&(p.riskTolerance<.7||now-a.lastDamageAt>4300))||a.regenActive){a.tactic='REGEN_HIDE';a.decisionReason='No current sighting: staying protected until recovery';a.moveGoal=a.cover||{x:a.x,y:a.y};return;}a.tactic='REPOSITION';a.decisionReason='No sighting: searching lanes';a.cover=null;
    if(now>a.wander.until||dist(a,a.wander)<90)a.wander={x:rand(120,WORLD.w-120),y:rand(120,WORLD.h-120),until:now+rand(4500,7500)};
    a.moveGoal=a.wander;if(s.ammo<w.mag*(.5+p.reloadDiscipline*.2))startReload(a,now);return;
  }
  const d=dist(a,t),los=t.visible&&pointLOS(a.x,a.y,t),allies=a.visibleAllies||[],enemies=a.visibleEnemies||[],advantage=allies.length+1-enemies.length,pressure=Math.max(0,-advantage);
  const enemyWeapon=WEAPONS[t.weapon],enemyThreat=enemyWeapon?clamp(enemyWeapon.damage/Math.max(.1,enemyWeapon.hitSpeed)/180,0,1)*(d<enemyWeapon.preferred?1:.4):.4;
  const crowd=allies.filter(o=>Math.hypot(o.x-a.x,o.y-a.y)<250).length,attention=Math.abs(angleDiff(Math.atan2(a.y-t.y,a.x-t.x),t.angle))<.45;
  const range=w.preferred*(.78+familiar*.12),inRange=1-clamp(Math.abs(d-range)/Math.max(400,range),0,1),ammo=s.ammo/w.mag,regenNear=a.hp<=REGEN_THRESHOLD&&(a.regenActive||now-a.lastDamageAt>4300),incoming=incomingDanger(a);
  const utilities={
    FIGHT:los?2.2+inRange*.9+ammo*.25-pressure*.3+(a.traits.confidence-.5)*.15:0,
    PUSH:!low?1.5+(d>range?1.25:0)+p.aggression*.6+Math.max(0,advantage)*.15:0,
    HOLD:los?1.1+p.patience*.9+inRange*.6+(['Anchor','Marksman'].includes(a.traits.archetype)?.65:0):.2,
    PEEK:los?1.6+p.coverPreference*1.8+(low?.3:0)+(attention?.25:0)+enemyThreat*.12:.2,
    FLANK:1+p.flankPreference*1.8+crowd*.5+(attention?.25:0)+(los?0:.25),
    RETREAT:low?2.5+(1-risk)*1.4+pressure*.5+enemyThreat*.25+(d<range*.5?.8:0):pressure>1?2.6:0,
    RELOAD:!s.reloading&&s.reserve>0?(ammo===0?6:ammo<.35?2.4+p.reloadDiscipline+(los?-1:.8):0):0,
    REPOSITION:!los?2.7:1+(crowd>1?.7:0),
    DASH_ATTACK:dash&&los&&!low&&d>range&&d<900?3.0+p.dashAggression+(t.hp<80?.6:0):0,
    DASH_ESCAPE:dash&&(low||incoming.danger)?2.4+(low?1.2:0)+incoming.danger*.8:0,
    REGEN_HIDE:regenNear?4.4+(a.regenActive?1.5:0)-risk*.8:0,
    CHASE:t.visible&&t.hp<85&&!low?2.4+p.chasePreference+(t.hp<40?.6:0):0
  };
  // A small, scheduled decision error affects judgement; it never changes gun mechanics.
  let action='FIGHT',best=-Infinity;for(const [key,v] of Object.entries(utilities)){const n=v+rand(-.12,.12)*(1.25-a.traits.skill);if(n>best){best=n;action=key;}}
  if(now<a.actionUntil&&utilities[a.tactic]>best-.45)action=a.tactic;
  if(action!==a.tactic){a.actionUntil=now+600+p.targetPersistence*400;a.tactic=action;diagnostics.actions[action]=(diagnostics.actions[action]||0)+1;}
  a.decisionReason=`${action}: ${los?'visible':'remembered'} target, ${Math.round(d)} range, ${Math.round(a.hp)} HP, ${advantage>=0?'+':''}${advantage} local numbers`;
  let goal=null;
  if(['RETREAT','REGEN_HIDE','DASH_ESCAPE','RELOAD'].includes(action)){
    if(action==='RELOAD')startReload(a,now);
    if(!a.cover||now>a.coverUntil){goal=safeRetreatGoal(a,t);a.coverUntil=now+2300;}else goal=a.cover;
    if(action==='DASH_ESCAPE'&&a.cover&&dist(a,a.cover)<45)goal=a.cover.escape||a.cover;
    if(action==='DASH_ESCAPE'&&now>=a.dashExecuteAt){const dir=incoming.side||{x:goal.x-a.x,y:goal.y-a.y};if(pathClear(a.x,a.y,a.x+dir.x/Math.hypot(dir.x,dir.y)*DASH_DISTANCE,a.y+dir.y/Math.hypot(dir.x,dir.y)*DASH_DISTANCE))tryDash(a,dir.x,dir.y,now);a.dashExecuteAt=now+600;}
  }else if(action==='PEEK'){
    if(!a.cover||now>a.coverUntil){a.cover=chooseCover(a,t);a.coverUntil=now+4000;a.coverState='MOVING_TO_COVER';a.coverStateUntil=0;}
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
  if(!goal&&action==='FLANK'){
    if(!a.flankGoal||dist(a,a.flankGoal)<80||now>a.flankUntil){a.flankGoal=makeFlankGoal(a,t);a.flankUntil=now+3500;}goal=a.flankGoal;
  }
  if(!goal){
    const angle=Math.atan2(t.y-a.y,t.x-a.x);
    if(['PUSH','CHASE','DASH_ATTACK','REPOSITION'].includes(action)){
      goal={x:t.x-Math.cos(angle)*Math.min(range*.65,d*.3),y:t.y-Math.sin(angle)*Math.min(range*.65,d*.3)};
      if(action==='DASH_ATTACK'&&now>=a.dashExecuteAt&&pathClear(a.x,a.y,a.x+Math.cos(angle)*DASH_DISTANCE,a.y+Math.sin(angle)*DASH_DISTANCE)){tryDash(a,Math.cos(angle),Math.sin(angle),now);a.dashExecuteAt=now+700;}
    }else if(d<range*.5){goal={x:a.x-Math.cos(angle)*250,y:a.y-Math.sin(angle)*250};}
    else if(action==='HOLD'){goal={x:a.x,y:a.y};}
    else {if(now>a.strafeUntil){a.strafeDir*=Math.random()<.35?-1:1;a.strafeUntil=now+rand(1400,2600);}goal={x:a.x+Math.cos(angle+Math.PI/2*a.strafeDir)*150,y:a.y+Math.sin(angle+Math.PI/2*a.strafeDir)*150};}
  }
  if(goal){goal={x:clamp(goal.x,45,WORLD.w-45),y:clamp(goal.y,45,WORLD.h-45)};if(!collides(goal.x,goal.y))a.moveGoal=goal;else {const idx=nearestNav(goal.x,goal.y);if(idx!==null)a.moveGoal=navPoint(idx);}}
}
function updateBot(a,dt,now){
  if(a.dead)return;updateHealthRegen(a,dt,now);
  if(now>=a.nextThink){selectTarget(a,now);a.nextThink=now+rand(180,280);}
  if(now>=a.nextDecision){decideBot(a,now);a.nextDecision=now+rand(330,520);}
  let s=currentWeaponState(a),w=WEAPONS[s.name],t=a.target;
  if(t){
    const d=dist(a,t),primary=a.slots[0];
    if(a.currentSlot===0&&(s.reloading||s.ammo===0)&&d<550&&a.slots[1].ammo>0)a.currentSlot=1;
    else if(a.currentSlot===1&&!primary.reloading&&primary.ammo>0&&(d>500||s.ammo===0))a.currentSlot=0;
    s=currentWeaponState(a);w=WEAPONS[s.name];
    if(now>=a.nextAim){
      const lead=clamp(d/(w.speed*TILE),0,.48)*(.4+.6*a.traits.skill);
      a.aimPoint={x:t.x+t.vx*lead,y:t.y+t.vy*lead};
      a.aimNoise=rand(-1,1)*(1-a.traits.accuracy)*7.5*Math.PI/180;a.nextAim=now+rand(75,135);
    }
    const desired=Math.atan2(a.aimPoint.y-a.y,a.aimPoint.x-a.x),turnRate=4.2+5*a.traits.accuracy;
    a.aiAim+=clamp(angleDiff(desired+a.aimNoise,a.aiAim),-turnRate*dt,turnRate*dt);a.angle=a.aiAim;
    let gate=true;
    if(t.isPlayer&&state.mode==='play'){const inView=botIsInsidePlayerView(a);if(inView&&!a.wasInPlayerView)a.playerViewReadyAt=now+a.traits.reaction*1000;a.wasInPlayerView=inView;gate=inView&&now>=a.playerViewReadyAt;}
    const hiding=['REGEN_HIDE','RETREAT','RELOAD'].includes(a.tactic)||(a.tactic==='PEEK'&&!a.coverState?.startsWith('PEEKING'));
    // Fire at a recent visible observation, subject to the same geometry and camera rule.
    if(!hiding&&t.visible&&now-t.at<300&&pointLOS(a.x,a.y,t)&&gate&&now>=a.aiAimReadyAt&&Math.abs(angleDiff(desired,a.aiAim))<.065)fire(a,a.aiAim,now);
  }
  if(s.ammo===0)startReload(a,now);
  if(!updateDashMotion(a,dt,now)){
    let dir={x:0,y:0};if(a.moveGoal&&dist(a,a.moveGoal)>22)dir=navigateToward(a,a.moveGoal,now);
    if(dir.x||dir.y)dir=obstacleSteer(a,dir.x,dir.y);
    const holding=['HOLD','REGEN_HIDE'].includes(a.tactic)&&a.moveGoal&&dist(a,a.moveGoal)<40;
    smoothBotMove(a,holding?0:dir.x,holding?0:dir.y,BOT_SPEED*(.97+.06*a.traits.skill),dt);
    if(!t&&Math.hypot(a.vx,a.vy)>10)a.angle=Math.atan2(a.vy,a.vx);
  }
  a.stats.timeAlive+=dt;a.career.timeAlive+=dt;recordEquipped(a,dt);
  a.recoil=Math.max(0,a.recoil-dt*(s.name==='War Head LMG'?4.4:7));a.spreadBloom=Math.max(0,a.spreadBloom-dt*Math.max(.45,w.spread*.9));
}

function botIsInsidePlayerView(bot,pad=18){const p=getPlayer();if(!p||state.mode!=='play'||bot.matchId!==p.matchId)return true;return Math.abs(bot.x-p.x)<=Math.max(0,cssW*.5-pad)&&Math.abs(bot.y-p.y)<=Math.max(0,cssH*.5-pad);}
function smoothBotMove(a,mx,my,speed,dt){const k=1-Math.exp(-dt*8.5);a.desiredVx=mx*speed;a.desiredVy=my*speed;a.vx=lerp(a.vx,a.desiredVx,k);a.vy=lerp(a.vy,a.desiredVy,k);moveWithCollision(a,a.vx*dt,a.vy*dt);}

// -------------------- Player --------------------
function screenToWorld(sx,sy){return {x:sx-cssW/2+state.camera.x,y:sy-cssH/2+state.camera.y};}
function movementSpreadMultiplier(a){
  if(gameNow()<a.dashUntil)return 2.05;
  if(a.sprinting)return 1.65;
  return Math.hypot(a.vx,a.vy)>28?1.0:.62;
}
function effectiveSpreadDeg(a,w=currentWeapon(a)){
  return Math.max(.08,w.spread*movementSpreadMultiplier(a)+(a.spreadBloom||0));
}
function updateCrosshairVisual(a){
  const c=document.getElementById('crosshair');if(!c||!a)return;
  const w=currentWeapon(a),deg=effectiveSpreadDeg(a,w);
  const gap=clamp(5+deg*2.9,6,34);
  c.style.setProperty('--gap',gap.toFixed(1)+'px');
  c.style.left=input.aimX+'px';c.style.top=input.aimY+'px';
  c.classList.toggle('sprinting',!!a.sprinting);
}
function updatePlayer(a,dt,now){
  if(!a||a.dead)return;
  updateHealthRegen(a,dt,now);
  if(updateDashMotion(a,dt,now)){a.stats.timeAlive+=dt;const wn=currentWeaponState(a).name;recordEquipped(a,dt);a.recoil=Math.max(0,a.recoil-dt*7);a.spreadBloom=Math.max(0,a.spreadBloom-dt*Math.max(.5,currentWeapon(a).spread*1.0));updateCrosshairVisual(a);return;}
  const s=currentWeaponState(a);if(s.reloading&&now>=s.reloadEnd)finishReload(s);
  let mx=(actionDown('moveRight')?1:0)-(actionDown('moveLeft')?1:0),my=(actionDown('moveDown')?1:0)-(actionDown('moveUp')?1:0);
  const l=Math.hypot(mx,my);if(l){mx/=l;my/=l;}
  a.sprinting=!!(l&&actionDown('sprint'));
  const speed=a.speed*(a.sprinting?1.48:1);
  a.vx=mx*speed;a.vy=my*speed;moveWithCollision(a,a.vx*dt,a.vy*dt);a.stats.timeAlive+=dt;
  const m=screenToWorld(input.aimX,input.aimY);a.angle=Math.atan2(m.y-a.y,m.x-a.x);
  if(input.mouseDown&&currentWeapon(a).auto)fire(a,a.angle,now);
  if(actionDown('reload')) startReload(a,now);
  {const wn=currentWeaponState(a).name;recordEquipped(a,dt);}
  a.recoil=Math.max(0,a.recoil-dt*7);a.spreadBloom=Math.max(0,a.spreadBloom-dt*Math.max(.5,currentWeapon(a).spread*1.0));
  updateCrosshairVisual(a);
}

// -------------------- Update --------------------
function updateLobbyUi(){
  ensureSeasonFresh(Date.now());
  const strip=document.getElementById('liveMatchStrip'); if(!strip)return;
  const rows=state.matches.slice(0,MATCH_COUNT).map((m,i)=>{
    if(!m)return `<span>GAME ${i+1} • FORMING</span>`;
    const tag=m.hasPlayer?'PLAYER MATCH':'BOT MATCH';
    const clock=m.overtime?'OT':formatTime(Math.ceil(matchRemainingMs(m)/1000));return `<span><b>GAME ${i+1}</b> ${m.score[0]}–${m.score[1]} <em>${tag} • ${clock}</em></span>`;
  }).join('');
  strip.innerHTML=rows;
  const season=SAVE.seasons.current,leader=seasonWinnerFor(season),last=SAVE.seasons.history[0]?.winner||null;
  const sn=document.getElementById('seasonNumber');if(sn)sn.textContent=`SEASON ${season.number}`;
  const sr=document.getElementById('seasonRemaining');if(sr)sr.textContent=formatSeasonRemaining(season.endAt-Date.now());
  const sl=document.getElementById('seasonLeader');if(sl)sl.textContent=leader?.name||'—';
  const sc=document.getElementById('seasonChampion');if(sc)sc.textContent=last?`${last.name} • S${SAVE.seasons.history[0].number}`:'NO CHAMPION YET';
  const detail=document.getElementById('queueDetail');
  if(detail&&state.queued) detail.textContent='Instant player slot ready. Starting immediately…';
}
function update(dt,now){
  initializeLeague();
  if(state.paused)return;
  updateMatchClocks(now);
  if(state.playerMatchId!==null) state.elapsed+=dt;
  for(const a of state.actors){
    if(a.matchId===null)continue;
    const match=getMatch(a.matchId);if(!match||match.status!=='active'){a.vx=a.vy=0;continue;}
    if(a.dead){
      a.vx=a.vy=0;
      if(now>=a.respawnAt)respawnActor(a,false);
      continue;
    }
    for(const slot of a.slots){if(slot.reloading&&now>=slot.reloadEnd)finishReload(slot);}
    if(a.isPlayer)updatePlayer(a,dt,now); else updateBot(a,dt,now);
  }
  updateProjectiles(dt,now);SAVE.patchState.observedSeconds+=dt;diagnostics.maxParticles=Math.max(diagnostics.maxParticles,state.particles.length);
  for(const p of state.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;}
  state.particles=state.particles.filter(p=>p.age<p.life&&p.matchId===visibleMatchId()).slice(-220);
  const focus=getFocusActor();
  if(focus){
    if(state.mode==='play'){state.camera.x=focus.x;state.camera.y=focus.y;}
    else{const k=1-Math.exp(-dt*7);state.camera.x=lerp(state.camera.x,focus.x,k);state.camera.y=lerp(state.camera.y,focus.y,k);}
  } else {
    const demo=actorsInMatch(0).find(a=>!a.dead);
    if(demo){
      const k=1-Math.exp(-dt*2.5);state.camera.x=lerp(state.camera.x,demo.x,k);state.camera.y=lerp(state.camera.y,demo.y,k);
    }
  }
  if(state.playerMatchId!==null && now-state.lastHud>100){updateHud(now);state.lastHud=now;}
  if(state.mode==='spectate'&&now-state.lastHud>100){updateSpectatorHud(now);state.lastHud=now;}
  if(now-state.lastLobbyUi>1000){ensureSeasonFresh(Date.now());updateLobbyUi();state.lastLobbyUi=now;}
}

// -------------------- Rendering --------------------
function worldToScreen(x,y){return {x:x-state.camera.x+cssW/2,y:y-state.camera.y+cssH/2};}
function visibleRect(x,y,w,h,pad=100){const s=worldToScreen(x,y);return !(s.x+w<-pad||s.y+h<-pad||s.x>cssW+pad||s.y>cssH+pad);}
function drawMap(){
  const pat=patterns();
  ctx.fillStyle='#82ad64';ctx.fillRect(0,0,cssW,cssH);
  ctx.save();ctx.translate(-state.camera.x+cssW/2,-state.camera.y+cssH/2);

  // Ground material + subtle mowing bands
  ctx.fillStyle=pat.grass;ctx.fillRect(0,0,WORLD.w,WORLD.h);
  for(let x=0;x<WORLD.w;x+=320){ctx.fillStyle=((x/320)&1)?'rgba(255,255,255,.018)':'rgba(30,105,44,.018)';ctx.fillRect(x,0,160,WORLD.h);}

  // Roads: shoulders, asphalt texture, curbs and lane paint
  ctx.fillStyle='rgba(47,70,70,.17)';ctx.fillRect(0,S(1434),WORLD.w,S(342));ctx.fillRect(S(2234),0,S(362),WORLD.h);
  ctx.fillStyle=pat.asphalt;ctx.fillRect(0,S(1450),WORLD.w,S(310));ctx.fillRect(S(2250),0,S(330),WORLD.h);
  ctx.fillStyle='rgba(247,247,230,.62)';ctx.fillRect(0,S(1450),WORLD.w,S(4));ctx.fillRect(0,S(1756),WORLD.w,S(4));ctx.fillRect(S(2250),0,S(4),WORLD.h);ctx.fillRect(S(2576),0,S(4),WORLD.h);
  ctx.fillStyle='rgba(252,247,200,.72)';for(let x=S(36);x<WORLD.w;x+=S(190))ctx.fillRect(x,S(1598),S(94),S(5));for(let y=S(36);y<WORLD.h;y+=S(190))ctx.fillRect(S(2412),y,S(5),S(94));

  // Dirt / pedestrian lanes with soft edging
  const paths=[[0,S(960),S(1600),S(92)],[S(3220),S(2050),S(1580),S(92)],[S(1240),S(2740),S(1900),S(72)]];
  for(const [x,y,w,h] of paths){ctx.fillStyle='rgba(73,63,40,.14)';ctx.fillRect(x,y+4,w,h);ctx.fillStyle=pat.dirt;ctx.fillRect(x,y,w,h);ctx.fillStyle='rgba(255,248,202,.18)';ctx.fillRect(x,y,w,2);}

  // Grass flowers, stones, and tiny tuft clusters
  for(const d of decor){if(!visibleRect(d.x-7,d.y-7,14,14))continue;
    if(d.t===3){ctx.strokeStyle='rgba(44,119,53,.38)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(d.x-2,d.y+3);ctx.lineTo(d.x,d.y-4);ctx.moveTo(d.x+2,d.y+3);ctx.lineTo(d.x+4,d.y-3);ctx.stroke();}
    else {ctx.fillStyle=d.t===0?'#f6df63':d.t===1?'#f49fba':'#f5f4d8';ctx.beginPath();for(let k=0;k<4;k++){const a=k*Math.PI/2;ctx.arc(d.x+Math.cos(a)*2.2,d.y+Math.sin(a)*2.2,1.6,0,Math.PI*2);}ctx.fill();}
  }

  // Building floors: cast shadow, textured slab, trim, tile/walk strips
  const floorColors=['rgba(230,208,169,.83)','rgba(216,224,223,.88)','rgba(235,201,166,.84)','rgba(205,218,235,.88)'];
  for(const f of floors){if(!visibleRect(f.x,f.y,f.w,f.h,150))continue;
    ctx.fillStyle='rgba(32,54,50,.18)';ctx.fillRect(f.x+12,f.y+15,f.w,f.h);
    ctx.fillStyle=floorColors[f.tone%4];ctx.fillRect(f.x,f.y,f.w,f.h);
    ctx.globalAlpha=.25;ctx.fillStyle=pat.concrete;ctx.fillRect(f.x+10,f.y+10,f.w-20,f.h-20);ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(92,103,101,.16)';ctx.lineWidth=1;for(let x=f.x+55;x<f.x+f.w;x+=78){ctx.beginPath();ctx.moveTo(x,f.y+30);ctx.lineTo(x,f.y+f.h-30);ctx.stroke();}
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.strokeRect(f.x+.5,f.y+.5,f.w-1,f.h-1);
  }

  // Walls, fences, crates — all procedural material shapes
  for(const o of walls){if(!visibleRect(o.x,o.y,o.w,o.h,120))continue;
    if(o.kind==='building'){
      ctx.fillStyle='rgba(26,42,45,.22)';ctx.fillRect(o.x+7,o.y+9,o.w,o.h);
      const g=ctx.createLinearGradient(o.x,o.y,o.x,o.y+Math.max(24,o.h));g.addColorStop(0,'#fffdf0');g.addColorStop(.55,'#ecebdd');g.addColorStop(1,'#c9d0ca');ctx.fillStyle=g;ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#5f7075';ctx.fillRect(o.x,o.y,Math.min(o.w,7),o.h);ctx.fillRect(o.x,o.y,o.w,Math.min(o.h,7));
      ctx.fillStyle='rgba(255,255,255,.65)';ctx.fillRect(o.x+7,o.y+7,Math.max(0,o.w-7),2);
    } else if(o.kind==='fence'){
      ctx.fillStyle='rgba(36,45,42,.16)';ctx.fillRect(o.x+5,o.y+7,o.w,o.h);ctx.fillStyle='#d5be87';ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='#8d744b';if(o.w>o.h){ctx.fillRect(o.x,o.y+o.h/2-2,o.w,4);for(let x=o.x+14;x<o.x+o.w;x+=39){rr(ctx,x,o.y-5,7,o.h+10,2,'#937a50');ctx.fillStyle='rgba(255,255,255,.20)';ctx.fillRect(x+1,o.y-3,1,o.h+6);}}else{ctx.fillRect(o.x+o.w/2-2,o.y,4,o.h);for(let y=o.y+14;y<o.y+o.h;y+=39)rr(ctx,o.x-5,y,o.w+10,7,2,'#937a50');}
    } else {
      ctx.fillStyle='rgba(31,45,45,.21)';ctx.fillRect(o.x+7,o.y+9,o.w,o.h);
      rr(ctx,o.x,o.y,o.w,o.h,5,'#8a7355','#654f38',2);ctx.fillStyle='#b39267';ctx.fillRect(o.x+6,o.y+7,o.w-12,8);
      ctx.strokeStyle='rgba(72,53,36,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(o.x+10,o.y+10);ctx.lineTo(o.x+o.w-10,o.y+o.h-10);ctx.moveTo(o.x+o.w-10,o.y+10);ctx.lineTo(o.x+10,o.y+o.h-10);ctx.stroke();
    }
  }

  // Trees / rocks. Multiple canopies and highlights create depth without sprite assets.
  for(const o of solids){if(o.type!=='circle'||!visibleRect(o.x-o.r-30,o.y-o.r-30,o.r*2+60,o.r*2+60))continue;
    if(o.kind==='tree'){
      const sg=ctx.createRadialGradient(o.x+12,o.y+15,2,o.x+12,o.y+15,o.r*1.45);sg.addColorStop(0,'rgba(35,70,40,.24)');sg.addColorStop(1,'rgba(35,70,40,0)');ctx.fillStyle=sg;ctx.beginPath();ctx.arc(o.x+12,o.y+15,o.r*1.45,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#7b5739';rr(ctx,o.x-7,o.y-7,14,24,5,'#80583a','#5e402b',1.5);
      const leaf=['#2f8748','#3f9b50','#57aa55','#337e45'];const lobes=[[-14,-10,.72],[9,-12,.68],[-5,9,.78],[15,8,.62],[0,-2,.82]];
      lobes.forEach((v,i)=>{const rg=ctx.createRadialGradient(o.x+v[0]-6,o.y+v[1]-7,2,o.x+v[0],o.y+v[1],o.r*v[2]);rg.addColorStop(0,'#71bf68');rg.addColorStop(.48,leaf[i%leaf.length]);rg.addColorStop(1,'#2c7440');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(o.x+v[0],o.y+v[1],o.r*v[2],0,Math.PI*2);ctx.fill();});
      ctx.strokeStyle='rgba(34,103,48,.48)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(o.x,o.y,o.r*.96,0,Math.PI*2);ctx.stroke();
    } else {
      ctx.fillStyle='rgba(26,42,43,.19)';ctx.beginPath();ctx.ellipse(o.x+8,o.y+10,o.r*1.1,o.r*.7,0,0,Math.PI*2);ctx.fill();
      const rg=ctx.createRadialGradient(o.x-o.r*.35,o.y-o.r*.35,2,o.x,o.y,o.r);rg.addColorStop(0,'#c6ceca');rg.addColorStop(.5,'#969f9c');rg.addColorStop(1,'#697572');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#687370';ctx.lineWidth=2;ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(o.x-4,o.y-5,o.r*.58,Math.PI,Math.PI*1.55);ctx.stroke();
    }
  }
  ctx.restore();
}
// Machined silhouettes, all Canvas geometry. The same model serves previews and live play.
function drawWeaponModel(name,x,y,angle,recoil=0,g=ctx,motion=null){
  const w=WEAPONS[name],length=weaponLength(name),pistol=w.type==='sidearm',steel='#253038',edge='#101b20',polymer='#35433f',wood='#96613e';
  const since=motion?Math.max(0,(gameNow()-motion.lastShot)/1000):99,cycle=clamp(since/w.hitSpeed,0,1),reload=motion?.reloading?clamp(1-(motion.reloadEnd-gameNow())/(w.reload*1000),0,1):0;
  const magDrop=reload>0?Math.sin(Math.PI*clamp((reload-.12)/.72,0,1))*19:0,bolt=reload>.78?Math.sin((reload-.78)/.22*Math.PI)*5:0;
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
    const compact=name==='X16',slideWindow=Math.min(.13,w.hitSpeed*.65),slide=since<slideWindow?Math.sin(clamp(since/slideWindow,0,1)*Math.PI)*(compact?3:4):bolt;
    const end=compact?32:35;shape([[1,1],[end-3,1],[end-3,5],[20,6],[17,18],[6,17],[9,4]],compact?'#273237':'#48534e');
    grip(8,5,compact?8:10,compact?12:14,compact?'#253038':'#354340');guard(17,4,compact?10:12);
    metal(0-slide,compact?-5.5:-6.5,end,compact?8.5:10.5,compact?'#303a43':'#465057',1.3);metal(end-2,-2.5,length-end+2,5,'#142126',.6);
    g.strokeStyle='#111e25';for(let t=3;t<10;t+=2){g.beginPath();g.moveTo(t-slide,-4);g.lineTo(t-slide-1,1);g.stroke();}
    rr(g,18-slide,-4.5,6,2.8,.5,'#16242c','#7c8781',.5);metal(2-slide,-8,3,2,'#151f23',.3);metal(end-4-slide,-7,2.5,2,'#1a262b',.3);pins([[11,3],[19,3]]);
    if(reload>0)mag(8,17,6,7);g.restore();return;
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
  return {'AR-15':62,AK47:62,'SMG-9':48,'Pump Shotgun':72,'Auto 12':66,'LR-762':75,'LW Tundra':84,'War Head LMG':77,P90:58,'9mm':38,X16:34}[name]||62;
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
  g.save();g.translate(-25,-29);g.rotate(-.10);g.scale(.96,.96);drawWeaponModel(CONFIG.primary,0,0,0,0,g);g.restore();
  poly(g,[[-51,-17],[-33,-30],[-16,-25],[-22,-13],[-45,-3]],skin.body,edge,1.7);
  poly(g,[[49,-21],[30,-32],[24,-22],[38,-9],[49,-11]],skin.body,edge,1.7);
  rr(g,-24,-31,15,12,3,'#27352e',edge,1.3);rr(g,20,-34,14,12,3,'#27352e',edge,1.3);
  g.strokeStyle='#7b8875';g.lineWidth=.8;for(let x=-21;x<-10;x+=3){g.beginPath();g.moveTo(x,-28);g.lineTo(x,-23);g.stroke();}for(let x=23;x<32;x+=3){g.beginPath();g.moveTo(x,-31);g.lineTo(x,-26);g.stroke();}
  g.restore();
}
function drawOperatorModel(g,skin,index,leg=0){
  const edge='#17272b';
  // Split boots and trouser cuffs give the gait an articulated silhouette.
  rr(g,-24,-16+leg,22,11,4,skin.pants,edge,1.5);rr(g,-24,6-leg,22,11,4,skin.pants,edge,1.5);
  rr(g,-28,-15+leg,12,9,3,'#23302e',edge,1.2);rr(g,-28,7-leg,12,9,3,'#23302e',edge,1.2);
  g.fillStyle='rgba(210,223,206,.24)';g.fillRect(-26,-13+leg,6,1);g.fillRect(-26,9-leg,6,1);
  rr(g,-23,-13,15,26,5,skin.vest,edge,1.5);g.strokeStyle='rgba(220,225,200,.25)';g.lineWidth=1;g.strokeRect(-20,-9,8,18);
  const armor=g.createLinearGradient(-10,-19,14,19);armor.addColorStop(0,skin.body);armor.addColorStop(.5,skin.vest);armor.addColorStop(1,'#24332f');
  rr(g,-14,-19,35*skin.build,38,10,skin.body,edge,1.7);rr(g,-8,-15,27,30,6,armor,edge,1.5);
  g.fillStyle='#1d2b27';g.fillRect(-10,-17,4,34);g.fillRect(15,-14,3,28);
  for(const y of [-13,7]){rr(g,7,y,8,7,1.2,skin.body,edge,.8);g.fillStyle='rgba(240,229,190,.42)';g.fillRect(9,y+2,4,1);}
  // Sleeves and visible team patches, with forearms angled around the receiver.
  g.strokeStyle=edge;g.lineWidth=10;g.beginPath();g.moveTo(6,-15);g.lineTo(23,-10);g.lineTo(31,-6);g.moveTo(6,15);g.lineTo(17,12);g.lineTo(36,6);g.stroke();
  g.strokeStyle=skin.body;g.lineWidth=7.5;g.stroke();rr(g,9,-19,9,5,1.2,skin.accent,edge,.8);rr(g,9,14,9,5,1.2,skin.accent,edge,.8);
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
  if(a.dead)return;const s=worldToScreen(a.x,a.y);if(s.x<-135||s.y<-135||s.x>cssW+135||s.y>cssH+135)return;
  const skin=SKINS[a.skinIndex],speed=Math.hypot(a.vx,a.vy),moving=speed>20,leg=moving?Math.sin(now*.018+a.id)*3.2:0;
  ctx.save();ctx.translate(s.x,s.y);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.fillStyle='rgba(18,36,27,.20)';ctx.beginPath();ctx.ellipse(5,8,32,22,0,0,Math.PI*2);ctx.fill();
  const team=TEAM_COLORS[a.team]||'#bac5b0';
  ctx.strokeStyle='rgba(13,30,25,.55)';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,29,29,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=team;ctx.lineWidth=a.isPlayer?2.6:1.6;ctx.stroke();
  if(a.isPlayer){ctx.strokeStyle='#f2f1db';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,32,-.65,.65);ctx.arc(0,0,32,Math.PI-.65,Math.PI+.65);ctx.stroke();}
  ctx.rotate(a.angle);if(a.recoil>.1){ctx.translate(-a.recoil*1.3,0);}drawOperatorModel(ctx,skin,a.skinIndex,leg);
  drawWeaponModel(currentWeaponState(a).name,20,0,0,a.recoil,ctx,currentWeaponState(a));
  // Gloves sit over the gun rather than disappearing under it.
  rr(ctx,27,-8,8,6,2,skin.vest,'#17282a',1);rr(ctx,34,3,7,6,2,skin.vest,'#17282a',1);
  if(now<a.muzzleUntil){
    const shotSlot=currentWeaponState(a),tip=20+weaponLength(shotSlot.name)-weaponKick(shotSlot.name,a.recoil),flare=8+(Math.floor(shotSlot.lastShot)+a.id)%7;
    const glow=ctx.createRadialGradient(tip,0,0,tip,0,15);glow.addColorStop(0,'#fff9d4');glow.addColorStop(.25,'rgba(255,213,99,.9)');glow.addColorStop(1,'rgba(255,153,46,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(tip,0,15,0,Math.PI*2);ctx.fill();
    poly(ctx,[[tip+flare,0],[tip+2,-3],[tip,-5-flare*.15],[tip-2,0],[tip,5+flare*.15],[tip+3,3]],'#ffefb1');
  }
  ctx.restore();
  const displayName=a.isPlayer?'YOU':a.profile?.feared?`◆ ${a.name} [${a.profile.power}]`:a.name;
  ctx.font='700 10px system-ui';ctx.textAlign='center';const labelWidth=ctx.measureText(displayName).width+16;
  rr(ctx,s.x-labelWidth/2,s.y-49,labelWidth,16,2,'rgba(20,34,30,.88)');ctx.fillStyle=team;ctx.fillRect(s.x-labelWidth/2,s.y-47,2,12);ctx.fillStyle='#f0f3e3';ctx.fillText(displayName,s.x+1,s.y-37);
  if(a.hp<MAX_HP||a.isPlayer){rr(ctx,s.x-24,s.y-29,48,4,1,'rgba(13,26,23,.65)');const hpw=48*clamp(a.hp/MAX_HP,0,1);if(hpw>0)rr(ctx,s.x-24,s.y-29,hpw,4,1,a.hp<75?'#ef7666':team);}
  const slot=currentWeaponState(a);if(slot.reloading){const progress=clamp(1-(slot.reloadEnd-now)/(WEAPONS[slot.name].reload*1000),0,1);rr(ctx,s.x-24,s.y-23,48,2,0,'rgba(15,28,24,.6)');if(progress>0)rr(ctx,s.x-24,s.y-23,48*progress,2,0,'#d9c27e');}
  if(now<a.hitFlash){ctx.strokeStyle='rgba(255,243,207,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,28,0,Math.PI*2);ctx.stroke();}
  if(now<a.spawnFlash){const p=(a.spawnFlash-now)/600;ctx.strokeStyle=`rgba(222,242,202,${p})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,30+(1-p)*22,0,Math.PI*2);ctx.stroke();}
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
function playerSpotsEnemy(a,p){
  if(!p||a.team===p.team||a.isPlayer)return true;
  return botIsInsidePlayerView(a,0)&&hasLOS(p,a);
}
function drawTacticalMap(full=false){
  if(state.mode!=='play'&&state.mode!=='spectate')return;
  const p=getPlayer(),mid=visibleMatchId();
  const pad=full?42:14;
  const maxW=full?Math.min(cssW*.78,980):210,maxH=full?Math.min(cssH*.74,680):140;
  const scale=Math.min((maxW-pad*2)/WORLD.w,(maxH-pad*2)/WORLD.h);
  const mw=WORLD.w*scale+pad*2,mh=WORLD.h*scale+pad*2;
  const x=full?(cssW-mw)/2:18,y=full?(cssH-mh)/2:84;
  ctx.save();
  if(full){ctx.fillStyle='rgba(7,20,25,.58)';ctx.fillRect(0,0,cssW,cssH);}
  rr(ctx,x,y,mw,mh,full?22:14,full?'rgba(239,249,247,.96)':'rgba(240,249,247,.88)','rgba(18,54,59,.25)',1.5);
  const ox=x+pad,oy=y+pad;
  ctx.save();ctx.beginPath();ctx.rect(ox,oy,WORLD.w*scale,WORLD.h*scale);ctx.clip();
  ctx.fillStyle='#82ad64';ctx.fillRect(ox,oy,WORLD.w*scale,WORLD.h*scale);
  // roads
  ctx.fillStyle='#96a5a7';ctx.fillRect(ox,oy+S(1450)*scale,WORLD.w*scale,S(310)*scale);ctx.fillRect(ox+S(2250)*scale,oy,S(330)*scale,WORLD.h*scale);
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
    ctx.fillStyle=a.isPlayer?'#ffffff':TEAM_COLORS[a.team]||'#fff';
    ctx.strokeStyle=a.isPlayer?'#12343b':'rgba(15,37,42,.55)';ctx.lineWidth=a.isPlayer?2:1;
    ctx.beginPath();ctx.arc(ax,ay,full?5:3.4,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(!full&&p){
    ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=1;
    ctx.strokeRect(ox+(p.x-cssW/2)*scale,oy+(p.y-cssH/2)*scale,cssW*scale,cssH*scale);
  }
  ctx.restore();
  ctx.fillStyle='#17353d';ctx.font=full?'900 15px system-ui':'900 9px system-ui';ctx.textAlign='left';
  ctx.fillText(full?'BRIGHTFIELD BLOCKS — FULL MAP':'MINIMAP',x+pad,y+(full?25:11));
  if(full){ctx.textAlign='right';ctx.font='800 11px system-ui';ctx.fillStyle='#5f777e';ctx.fillText(`${codeLabel(binding('fullMap'))} TO CLOSE`,x+mw-pad,y+25);}
  ctx.restore();
}
function render(now){
  drawMap();drawProjectiles();
  const sorted=state.actors.filter(a=>a.matchId===visibleMatchId()).slice().sort((a,b)=>a.y-b.y);for(const a of sorted)drawActor(a,now);drawParticles();
  // daylight wash + subtle cinematic vignette, both procedural
  const sun=ctx.createLinearGradient(0,0,cssW,cssH);sun.addColorStop(0,'rgba(255,247,204,.045)');sun.addColorStop(.5,'rgba(255,255,255,0)');sun.addColorStop(1,'rgba(80,153,214,.025)');ctx.fillStyle=sun;ctx.fillRect(0,0,cssW,cssH);
  const g=ctx.createRadialGradient(cssW/2,cssH/2,Math.min(cssW,cssH)*.28,cssW/2,cssH/2,Math.max(cssW,cssH)*.74);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(10,35,31,.10)');ctx.fillStyle=g;ctx.fillRect(0,0,cssW,cssH);
  drawTacticalMap(!!input.fullMap);
}

// -------------------- UI --------------------
function addKillfeed(killer,victim,weapon,head){
  const el=document.createElement('div');el.className='feed-item';el.innerHTML=`<em>${escapeHtml(killer)}</em> ${head?'✦ ':''}<b>${escapeHtml(weapon)}</b> ${escapeHtml(victim)}`;
  const feed=document.getElementById('killfeed');feed.prepend(el);while(feed.children.length>6)feed.lastChild.remove();setTimeout(()=>el.remove(),5200);
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function updateHud(now){
  const p=getPlayer();if(!p)return;
  const match=getMatch(p.matchId);if(!match)return;
  const sw=currentWeaponState(p);
  document.getElementById('uptimeLabel').textContent=match.overtime?'OT':formatTime(Math.ceil(matchRemainingMs(match,now)/1000));
  const scoreEl=document.getElementById('teamScoreLabel');
  scoreEl.innerHTML=`<span style="color:${TEAM_COLORS[0]}">GREEN ${match.score[0]}</span> — <span style="color:${TEAM_COLORS[1]}">${match.score[1]} BLUE</span>`;
  document.getElementById('hpText').textContent=Math.max(0,Math.ceil(p.hp));
  document.getElementById('hpFill').style.width=(clamp(p.hp/MAX_HP,0,1)*100)+'%';
  document.getElementById('weaponName').textContent=sw.name;
  document.getElementById('ammoText').textContent=sw.ammo;
  document.getElementById('reserveText').textContent='/ '+sw.reserve;
  document.getElementById('reloadText').classList.toggle('hidden',!sw.reloading);
  const ability=document.getElementById('abilityText');if(ability){const dashLeft=Math.max(0,(p.dashCooldownUntil-now)/1000),regenWait=p.hp<=REGEN_THRESHOLD&&!p.regenActive?Math.max(0,(REGEN_DELAY_MS-(now-p.lastDamageAt))/1000):0;ability.textContent=`DASH ${dashLeft>0?dashLeft.toFixed(1)+'s':'READY'}${p.regenActive?' • REGEN ACTIVE':(regenWait>0?' • REGEN '+regenWait.toFixed(1)+'s':'')}`;ability.classList.toggle('regen-active',p.regenActive);}
  const teamName=p.team===0?'GREEN':'BLUE';
  const teamLabel=document.getElementById('teamLabel');teamLabel.textContent=teamName;teamLabel.style.color=TEAM_COLORS[p.team];
  document.getElementById('kdText').textContent=`${p.stats.kills} K / ${p.stats.deaths} D / ${p.stats.assists} A • KD ${kdDisplay(p.stats.kills,p.stats.deaths)}`;
  const resp=document.getElementById('respawnText');resp.classList.toggle('hidden',!p.dead);
  if(p.dead)resp.textContent=`RESPAWNING IN ${Math.max(1,Math.ceil((p.respawnAt-now)/1000))}`;
  if(!document.getElementById('scoreboard').classList.contains('hidden'))renderScoreboard();
}
function updateSpectatorHud(now){
  const a=spectatedActor(),m=getMatch(state.spectateMatchId);if(!a||!m)return;
  const name=document.getElementById('spectateName'),power=document.getElementById('spectatePower'),game=document.getElementById('spectateGame'),score=document.getElementById('spectateScore'),clock=document.getElementById('spectateClock'),weapon=document.getElementById('spectateWeapon');
  if(name)name.textContent=a.name;if(power)power.textContent=a.profile?`PWR ${a.profile.power} • #${a.profile.rank} ${strategicRole(a.profile.archetype)}${a.profile.feared?' • FEARED':''} • ${(a.tactic||'patrol').toUpperCase()}`:'';
  if(game)game.textContent=`GAME ${state.spectateMatchId+1}`;if(score)score.textContent=`${m.score[0]} — ${m.score[1]}`;if(clock)clock.textContent=m.overtime?'OT':formatTime(Math.ceil(matchRemainingMs(m,now)/1000));if(weapon)weapon.textContent=currentWeaponState(a).name;
}
function renderScoreboard(){
  const mid=state.playerMatchId!==null?state.playerMatchId:(state.mode==='spectate'?state.spectateMatchId:null);if(mid===null)return;
  const arr=actorsInMatch(mid).slice().sort((a,b)=>a.team-b.team||b.stats.kills-a.stats.kills||a.stats.deaths-b.stats.deaths);
  document.getElementById('scoreRows').innerHTML=arr.map(a=>{
    const team=a.team===0?'GREEN':'BLUE';
    return `<div class="score-row"><span style="color:${TEAM_COLORS[a.team]};font-weight:900">${team}</span><strong>${escapeHtml(a.name)}</strong><span>${a.isPlayer?'—':a.profile?.power??'—'}</span><span>${a.stats.kills}</span><span>${a.stats.deaths}</span><span>${a.stats.assists}</span><span><strong>${kdDisplay(a.stats.kills,a.stats.deaths)}</strong></span><span>${Math.round(a.stats.damage)}</span><span>${escapeHtml(currentWeaponState(a).name)}</span></div>`;
  }).join('');
}
function showModal(html,view=''){
  const content=document.getElementById('modalContent');content.innerHTML=html;content.dataset.view=view;
  const shell=document.querySelector('#modal .modal');if(shell)shell.classList.toggle('meta-wide',view==='meta');
  if(shell)shell.scrollTop=0;document.getElementById('modal').scrollTop=0;
  clearInput();document.getElementById('modal').classList.add('visible');
}
function closeModal(){document.getElementById('modal').classList.remove('visible');document.getElementById('modalContent').dataset.view='';const shell=document.querySelector('#modal .modal');if(shell)shell.classList.remove('meta-wide');}
function previewContext(c){
  const w=c.clientWidth||Number(c.getAttribute('width')),h=c.clientHeight||Number(c.getAttribute('height'));
  c.width=Math.round(w*DPR);c.height=Math.round(h*DPR);const g=c.getContext('2d');g.setTransform(DPR,0,0,DPR,0,0);g.clearRect(0,0,w,h);return {g,w,h};
}
function drawWeaponPreview(c,name){
  const {g,w,h}=previewContext(c),length=weaponLength(name),scale=Math.min((w-40)/(length+30),(h-22)/39);
  g.fillStyle='#e5e4d8';g.fillRect(0,0,w,h);g.strokeStyle='rgba(40,52,44,.08)';g.lineWidth=1;
  for(let x=16;x<w;x+=24){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  g.save();g.translate(w/2-(length-22)*scale/2,h*.48);g.scale(scale,scale);drawWeaponModel(name,0,0,0,0,g);g.restore();
}
function drawOperatorPreview(c,skinIndex){
  const {g,w,h}=previewContext(c);drawOperatorPortrait(g,w,h,skinIndex);
}
function paintLobbyKit(){
  drawOperatorPreview(document.getElementById('lobbyOperator'),CONFIG.skin);
  drawWeaponPreview(document.getElementById('lobbyWeapon'),CONFIG.primary);
  document.getElementById('lobbyOperatorName').textContent=SKINS[CONFIG.skin].name.toUpperCase();
  document.getElementById('lobbyWeaponName').textContent=CONFIG.primary;
}
function renderLoadoutModal(){
  const prim=PRIMARYS.map(n=>`<div class="option-card ${CONFIG.primary===n?'selected':''}"><canvas class="weapon-preview" data-weapon-preview="${n}" width="240" height="92"></canvas><div class="eyebrow">PRIMARY</div><h3>${n}</h3><p>${WEAPONS[n].role}<br>${WEAPONS[n].damage} dmg • ${WEAPONS[n].mag} mag • ${WEAPONS[n].hitSpeed.toFixed(2)}s interval</p><button data-set-primary="${n}">${CONFIG.primary===n?'EQUIPPED':'EQUIP'}</button></div>`).join('');
  const side=SIDEARMS.map(n=>`<div class="option-card ${CONFIG.sidearm===n?'selected':''}"><canvas class="weapon-preview" data-weapon-preview="${n}" width="240" height="92"></canvas><div class="eyebrow">SIDEARM</div><h3>${n}</h3><p>${WEAPONS[n].role}<br>${WEAPONS[n].damage} dmg • ${WEAPONS[n].mag} mag • ${WEAPONS[n].hitSpeed.toFixed(2)}s interval</p><button data-set-sidearm="${n}">${CONFIG.sidearm===n?'EQUIPPED':'EQUIP'}</button></div>`).join('');
  showModal(`<div class="eyebrow">PLAYER CONFIGURATION</div><h2>Loadout</h2><h3>Primary</h3><div class="option-grid">${prim}</div><h3 style="margin-top:28px">Sidearm</h3><div class="option-grid">${side}</div>`,'loadout');
  paintLobbyKit();requestAnimationFrame(()=>document.querySelectorAll('[data-weapon-preview]').forEach(c=>drawWeaponPreview(c,c.dataset.weaponPreview)));
}
function renderOperatorModal(){
  const desc=['Balanced tactical silhouette','Light scout silhouette','Lean runner silhouette','Blue-accent strike kit','Heavy guard silhouette','Clean recon palette','Field ranger kit','Dark navy operations kit'];
  const cards=SKINS.map((s,i)=>`<div class="option-card ${CONFIG.skin===i?'selected':''}"><canvas class="operator-preview" data-operator-preview="${i}" width="220" height="150"></canvas><div class="eyebrow">OPERATOR ${String(i+1).padStart(2,'0')}</div><h3>${s.name}</h3><p>${desc[i]}</p><button data-set-skin="${i}">${CONFIG.skin===i?'SELECTED':'SELECT'}</button></div>`).join('');
  showModal(`<div class="eyebrow">COSMETIC ONLY • IDENTICAL HITBOXES</div><h2>Operator</h2><div class="option-grid operator-grid">${cards}</div>`,'operator');
  paintLobbyKit();requestAnimationFrame(()=>document.querySelectorAll('[data-operator-preview]').forEach(c=>drawOperatorPreview(c,Number(c.dataset.operatorPreview))));
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
  return {name:m.name,kills,deaths,headshots,damage,shots,hits,equippedTime,picks,killDistanceN,killDistance};
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
  const [s,b]=patchRecord(a,weapon);s[key]=(s[key]||0)+value;
  const alias=key==='kills'?'k':key==='deaths'?'d':key;b[alias]=(b[alias]||0)+value;
  a.matchWeaponStats??={};a.matchWeaponStats[weapon]??={k:0,d:0,picks:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};a.matchWeaponStats[weapon][alias]=(a.matchWeaponStats[weapon][alias]||0)+value;
  if(['kills','deaths','damage','shots','hits','headshots'].includes(key))recordSeasonEvent(a,key,value);
  if(key==='equippedTime')recordSeasonEvent(a,'timeAlive',value);
}
function recordEquipped(a,dt){
  const w=currentWeaponState(a).name;meta[w].equippedTime+=dt;a.weaponUsage[w].equippedTime+=dt;recordPatchEvent(a,w,'equippedTime',dt);
  if(!a.isPlayer){const b=SAVE.bots[a.name],f=b.familiarity[w];b.familiarity[w]=Math.min(100,f+(100-f)*dt/36000);}
}
function formLabel(v){return v>=6?'HOT':v>=2?'GOOD':v<=-6?'SLUMP':v<=-2?'COLD':'NORMAL';}
function recordBotResult(a,winner){
  const b=SAVE.bots[a.name],s=a.stats,p=a.profile.personality;
  const momentum=clamp((s.kills-s.deaths)/Math.max(3,s.kills+s.deaths)*8+(a.team===winner?2:-2),-10,10);
  b.recentForm=clamp(b.recentForm*.76+momentum*.24,-10,10);
  b.recentMatches.push({at:Date.now(),patchId:SAVE.patchState.id,primary:a.slots[0].name,weapons:cloneData(a.matchWeaponStats||{}),won:a.team===winner,kills:s.kills,deaths:s.deaths,damage:s.damage});
  b.recentMatches=b.recentMatches.slice(-20);
  a.traits.confidence=clamp(p.confidence+b.recentForm*.015+rand(-.06,.06),.1,.9);
}
function recordCompletedParticipant(a){const s=a.stats;diagnostics.completedParticipants++;diagnostics.completedKills+=s.kills;diagnostics.completedDeaths+=s.deaths;diagnostics.completedDamage+=s.damage;diagnostics.completedTaken+=s.taken;}

function metaPhase(rows=weaponMetrics()){
  const primary=rows.filter(r=>PRIMARYS.includes(r.m.name)),full=primary.filter(r=>r.confidence>=.999).length,mean=primary.reduce((s,r)=>s+r.confidence,0)/PRIMARYS.length;
  return {phase:full>=7&&mean>.9?'STABLE':mean>=.35?'DEVELOPING':'DISCOVERY',fullySampled:full,primaryCount:PRIMARYS.length,patch:SAVE.patchState.id,label:SAVE.patchState.label,matches:SAVE.patchState.completedMatches};
}
const diagnostics={completedMatches:0,completedParticipants:0,completedKills:0,completedDeaths:0,completedDamage:0,completedTaken:0,matchScoreKills:0,stuckRecoveries:0,pathSearches:0,pathCacheHits:0,actions:{},maxParticles:0};
function weaponMetrics(){
  const rows=Object.values(meta).filter(m=>WEAPONS[m.name]).map(raw=>{const m=telemetryView(raw);return {raw,m,minutes:m.equippedTime/60,engagements:m.kills+m.deaths};});
  const sum=records=>records.reduce((t,m)=>{for(const k of ['kills','deaths','damage','shots','hits','headshots','equippedTime'])t[k]+=(m[k]||0);return t;},{kills:0,deaths:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0});
  const total=sum(rows.map(r=>r.m)),league={kd:(total.kills+1)/(total.deaths+1),kpm:total.kills/Math.max(.01,total.equippedTime/60),dpm:total.damage/Math.max(.01,total.equippedTime/60),acc:total.hits/Math.max(1,total.shots),hs:total.headshots/Math.max(1,total.kills)};
  const bands=Object.entries(SAVE.patchState.skillStrata),bandWeights=bands.map(([band,data])=>({band,data,weight:sum(Object.values(data)).equippedTime/Math.max(.01,total.equippedTime)}));
  for(const r of rows){
    const m=r.m;r.kd=ratio(m.kills,m.deaths);r.accuracy=m.hits/Math.max(1,m.shots);r.hs=m.headshots/Math.max(1,m.kills);r.killPerPick=m.kills/Math.max(1,m.picks);r.avgDamage=m.damage/Math.max(1,m.picks);r.kpm=m.kills/Math.max(.001,r.minutes);r.dpm=m.damage/Math.max(.001,r.minutes);r.usage=m.equippedTime/Math.max(.001,total.equippedTime);r.range=m.killDistanceN?m.killDistance/m.killDistanceN/TILE:null;
    const priorShare=league.kd/(1+league.kd),share=(m.kills+20*priorShare)/(r.engagements+20);r.adjKd=share/Math.max(.00001,1-share);
    let kdLog=0,kpmLog=0,dpmLog=0,weight=0;
    // Standardize every gun to the same observed Power mix. Each band's baseline excludes
    // this gun, with neutral priors when there is no comparison sample. No assumed talent multipliers.
    for(const b of bandWeights){
      const own=b.data[m.name]||blankWeaponMeta(m.name),other=sum(Object.entries(b.data).filter(([n])=>n!==m.name).map(([,v])=>v));
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

function sortRows(rows,view){
  const cfg=TABLE_SORT[view];
  return rows.sort((a,b)=>{
    const av=typeof cfg.key==='function'?cfg.key(a):a[cfg.key],bv=typeof cfg.key==='function'?cfg.key(b):b[cfg.key];
    if(typeof av==='string')return av.localeCompare(bv)*cfg.dir;
    return ((av??-Infinity)-(bv??-Infinity))*cfg.dir;
  });
}
function sortIndicator(view,key){const c=TABLE_SORT[view];return c.key===key?(c.dir===-1?' ▼':' ▲'):'';}
function botWeaponPerformance(weaponName){
  const rows=BOT_NAMES.slice(0,BOT_COUNT).map(name=>{
    const u=SAVE.patchState.perBot[name]?.[weaponName]||{};
    const kills=Math.max(0,finiteNumber(u.k)),deaths=Math.max(0,finiteNumber(u.d));
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
let META_SELECTED_WEAPON=null;
function topBotsForWeaponHtml(weaponName){
  const rows=botWeaponPerformance(weaponName);
  if(!rows.length)return `<div class="meta-empty">No bot sample yet. This panel will populate as the live matches produce weapon-specific data.</div>`;
  return `<div class="meta-topbots-list">${rows.map((r,i)=>`<article class="meta-topbot"><div class="meta-topbot-head"><span class="meta-rank">#${i+1}</span><div><strong>${r.profile?.feared?'◆ ':''}${escapeHtml(r.name)}</strong><small>${r.profile?.power||'—'} POWER • ${escapeHtml(strategicRole(r.profile?.archetype))}</small></div>${r.engagements<5?'<em>LOW SAMPLE</em>':''}</div><div class="meta-topbot-stats"><span><b>${kdDisplay(r.kills,r.deaths)}</b><small>K/D</small></span><span><b>${r.kills}–${r.deaths}</b><small>K–D</small></span><span><b>${(r.accuracy*100).toFixed(1)}%</b><small>ACC</small></span><span><b>${Math.round(r.damage)}</b><small>DMG</small></span><span><b>${r.headshots}</b><small>HS</small></span><span><b>${r.minutes.toFixed(1)}m</b><small>TIME</small></span></div></article>`).join('')}</div>`;
}
function currentMetaRows(){
  const rows=weaponMetrics().map(r=>Object.assign(r,{name:r.m.name,picks:r.m.picks,kills:r.m.kills,deaths:r.m.deaths,damage:r.m.damage,shots:r.m.shots,hits:r.m.hits,headshots:r.m.headshots}));
  sortRows(rows,'meta');return rows;
}
function metaRowsHtml(rows=currentMetaRows()){
  return rows.map((r,i)=>`<tr class="meta-weapon-row ${META_SELECTED_WEAPON===r.name?'selected':''}" data-meta-weapon="${escapeHtml(r.name)}"><td><span class="meta-table-rank">${i+1}</span></td><td><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(WEAPONS[r.name]?.role||'')}</small></td><td><strong>${r.score.toFixed(1)}</strong></td><td><strong>${kdDisplay(r.kills,r.deaths)}</strong></td><td>${r.kills}</td><td>${r.deaths}</td><td>${(r.usage*100).toFixed(1)}%</td><td>${(r.accuracy*100).toFixed(1)}%</td><td>${r.kpm.toFixed(2)}</td><td>${r.dpm.toFixed(0)}</td><td>${(r.confidence*100).toFixed(0)}%</td></tr>`).join('');
}
function metaHeadHtml(){
  const cols=[['rank','#'],['name','Weapon'],['score','Score'],['kd','K/D'],['kills','Kills'],['deaths','Deaths'],['usage','Usage'],['accuracy','Accuracy'],['kpm','K/Min'],['dpm','Dmg/Min'],['confidence','Sample']];
  return cols.map(([k,l])=>k==='rank'?`<th>${l}</th>`:`<th><button class="table-sort" data-sort-view="meta" data-sort-key="${k}">${l}${sortIndicator('meta',k)}</button></th>`).join('');
}
function metaSummaryHtml(rows){
  if(!rows.length)return '';
  const top=rows.slice().sort((a,b)=>b.score-a.score)[0],kd=rows.slice().sort((a,b)=>b.kd-a.kd)[0],usage=rows.slice().sort((a,b)=>b.usage-a.usage)[0];
  const totalKills=rows.reduce((n,r)=>n+r.kills,0);
  return `<div class="meta-summary"><div><small>TOP GUN</small><strong>${top.engagements>=10?escapeHtml(top.name):'DISCOVERING'}</strong><span>${top.engagements>=10?top.score.toFixed(1)+' score':'awaiting combat sample'}</span></div><div><small>BEST K/D</small><strong>${escapeHtml(kd.name)}</strong><span>${kdDisplay(kd.kills,kd.deaths)}</span></div><div><small>MOST USED</small><strong>${escapeHtml(usage.name)}</strong><span>${(usage.usage*100).toFixed(1)}%</span></div><div><small>RECORDED KILLS</small><strong>${totalKills}</strong><span>all weapons</span></div></div>`;
}
function metaDetailHtml(rows=currentMetaRows()){
  const row=rows.find(r=>r.name===META_SELECTED_WEAPON)||rows[0];if(!row)return '<div class="meta-empty">No weapon telemetry yet.</div>';
  META_SELECTED_WEAPON=row.name;const w=WEAPONS[row.name];
  return `<div class="meta-detail-head"><div><div class="eyebrow">SELECTED WEAPON</div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(w.role)}</p></div><canvas id="metaWeaponPreview" width="280" height="96" data-weapon-preview="${escapeHtml(row.name)}"></canvas></div><div class="meta-detail-kpis"><div><small>GUN SCORE</small><strong>${row.score.toFixed(1)}</strong></div><div><small>K/D</small><strong>${kdDisplay(row.kills,row.deaths)}</strong></div><div><small>USAGE</small><strong>${(row.usage*100).toFixed(1)}%</strong></div><div><small>CONFIDENCE</small><strong>${(row.confidence*100).toFixed(0)}%</strong></div></div><div class="meta-detail-grid"><span><small>Loadouts</small><b>${row.picks}</b></span><span><small>Accuracy</small><b>${(row.accuracy*100).toFixed(1)}%</b></span><span><small>HS / Kill</small><b>${(row.hs*100).toFixed(1)}%</b></span><span><small>Kill Range</small><b>${row.range===null?'—':row.range.toFixed(1)+' tiles'}</b></span><span><small>Damage / Loadout</small><b>${row.avgDamage.toFixed(0)}</b></span><span><small>Damage / Min</small><b>${row.dpm.toFixed(0)}</b></span></div><p class="analytics-note">Bayesian K/D ${row.adjKd.toFixed(2)} · Power-adjusted K/D ${row.skillAdjustedKd.toFixed(2)}</p><div class="meta-topbots-heading"><div><div class="eyebrow">BEST USERS</div><h4>Top 3 bots with ${escapeHtml(row.name)}</h4></div><span>BY WEAPON K/D • 5+ ENGAGEMENTS PREFERRED</span></div>${topBotsForWeaponHtml(row.name)}`;
}
function paintMetaPreview(){const c=document.getElementById('metaWeaponPreview');if(c)drawWeaponPreview(c,c.dataset.weaponPreview);}
function updateMetaTable(){
  const rows=currentMetaRows();if(!META_SELECTED_WEAPON||!rows.some(r=>r.name===META_SELECTED_WEAPON))META_SELECTED_WEAPON=rows[0]?.name||null;
  const body=document.getElementById('metaRows');if(body)body.innerHTML=metaRowsHtml(rows);
  const head=document.getElementById('metaHead');if(head)head.innerHTML=metaHeadHtml();
  const summary=document.getElementById('metaSummary');if(summary)summary.innerHTML=metaSummaryHtml(rows);
  const detail=document.getElementById('metaDetail');if(detail)detail.innerHTML=metaDetailHtml(rows);
  paintMetaPreview();const phase=document.getElementById('metaPhase');if(phase)phase.textContent=metaPhaseText();
  const stamp=document.getElementById('metaStamp');if(stamp)stamp.textContent='LIVE • '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function metaPhaseText(){const p=metaPhase();return `BALANCE PATCH ${p.patch} · ${p.phase} · ${p.fullySampled}/${p.primaryCount} PRIMARIES FULLY SAMPLED · ${p.matches} GAMES`;}
function archiveHtml(){return SAVE.patchArchives.length?SAVE.patchArchives.slice().reverse().map(p=>`<details><summary>${escapeHtml(p.id)} · ${escapeHtml(p.reason||'balance change')} · ${p.completedMatches||0} games</summary><table class="meta-table"><thead><tr><th>Weapon</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Shots</th><th>Equipped minutes</th></tr></thead><tbody>${Object.entries(p.meta||{}).map(([n,m])=>`<tr><td>${escapeHtml(n)}</td><td>${m.kills||0}</td><td>${m.deaths||0}</td><td>${Math.round(m.damage||0)}</td><td>${m.shots||0}</td><td>${((m.equippedTime||0)/60).toFixed(1)}</td></tr>`).join('')}</tbody></table></details>`).join(''):'<p>No archived patches yet. A change to weapon statistics automatically archives this sample.</p>';}
function renderMetaModal(){
  const initial=currentMetaRows();if(!META_SELECTED_WEAPON)META_SELECTED_WEAPON=initial[0]?.name||null;
  showModal(`<div class="meta-page"><div class="meta-page-head"><div><div class="eyebrow">LIVE WEAPON ANALYTICS • REFRESHES EVERY SECOND</div><h2>Weapon Meta</h2><p><span id="metaPhase">${metaPhaseText()}</span></p></div><span id="metaStamp" class="meta-live">LIVE</span></div><div id="metaSummary">${metaSummaryHtml(initial)}</div><div class="meta-dashboard"><section class="meta-table-panel"><div class="meta-table-scroll"><table class="meta-table sortable-table meta-clean-table"><thead><tr id="metaHead">${metaHeadHtml()}</tr></thead><tbody id="metaRows">${metaRowsHtml(initial)}</tbody></table></div><div class="meta-formula"><strong>Gun Score v3</strong><span>60% Adjusted K/D</span><span>18% Kills/Min</span><span>12% Damage/Min</span><span>6% Accuracy</span><span>4% HS/Kill</span></div></section><aside id="metaDetail" class="meta-detail-panel">${metaDetailHtml(initial)}</aside></div><details class="meta-method"><summary>Telemetry definitions & scoring methodology</summary><p>K/D = kills made with the weapon ÷ deaths while it was held. Accuracy uses one trigger pull per shot; shotguns record one hit when at least one pellet connects. Usage is actual alive equipped time. Damage is real health removed only. Confidence reports sample maturity and does not increase Gun Score. The K/D component combines 25% Bayesian pooled K/D and 75% Power-standardized Bayesian K/D. Power bands share the observed league time mix; each gun is compared with other guns in that band using a 24-engagement prior. Kills/min and damage/min use the same skill adjustment with 5-minute priors. Accuracy uses a 60-shot prior; headshot share uses 12 kills. Components use bounded log-relative scores. Usage is never a scoring component.</p></details><details class="meta-method"><summary>Archived patches (${SAVE.patchArchives.length})</summary>${archiveHtml()}</details><button id="resetMeta" class="meta-reset">ARCHIVE & RESTART CURRENT SAMPLE</button></div>`,'meta');
  requestAnimationFrame(paintMetaPreview);updateMetaTable();
}
function botRows(){
  return BOT_NAMES.slice(0,BOT_COUNT).map(name=>{
    const c=careerFor(name),profile=profileFor(name),kd=kdSortValue(c.kills,c.deaths),accuracy=c.hits/Math.max(1,c.shots),wl=ratio(c.wins,c.losses),winPct=c.wins/Math.max(1,c.games);
    return {name,...c,kd,accuracy,wl,winPct,power:profile.power,powerRank:profile.rank,archetype:strategicRole(profile.archetype),recentForm:SAVE.bots[name].recentForm,personality:`${Math.round((profile.personality?.unpredictability||0)*100)}% volatile`,favorite:profile.personality?.favoriteWeapon||'—',metaDrive:profile.personality?.metaDrive||0,feared:profile.feared};
  });
}
function botRowsHtml(){
  const rows=botRows();sortRows(rows,'bots');
  return rows.map((r,i)=>`<tr><td>${i+1}</td><td><button class="bot-profile-link" data-bot-profile="${escapeHtml(r.name)}">${r.feared?'◆ ':''}${escapeHtml(r.name)}</button><br><small>${formLabel(r.recentForm)} ${r.recentForm>=0?'+':''}${r.recentForm.toFixed(1)} FORM</small></td><td><strong>${r.power}</strong></td><td>#${r.powerRank} ${escapeHtml(r.archetype)}</td><td><strong>${escapeHtml(r.personality)}</strong><br><span class="muted">Fav ${escapeHtml(r.favorite)}</span></td><td>${r.games}</td><td>${r.wins}</td><td>${r.losses}</td><td>${(r.winPct*100).toFixed(1)}%</td><td>${r.kills}</td><td>${r.deaths}</td><td><strong>${kdDisplay(r.kills,r.deaths)}</strong></td><td>${r.assists}</td><td>${Math.round(r.damage)}</td><td>${(r.accuracy*100).toFixed(1)}%</td><td>${r.headshots}</td></tr>`).join('');
}
function botHeadHtml(){
  const cols=[['rank','#'],['name','Bot'],['power','Power'],['archetype','Profile'],['personality','Personality'],['games','Games'],['wins','Wins'],['losses','Losses'],['winPct','Win %'],['kills','Kills'],['deaths','Deaths'],['kd','K/D'],['assists','Assists'],['damage','Damage'],['accuracy','Acc.'],['headshots','HS Kills']];
  return cols.map(([k,l])=>k==='rank'?`<th>${l}</th>`:`<th><button class="table-sort" data-sort-view="bots" data-sort-key="${k}">${l}${sortIndicator('bots',k)}</button></th>`).join('');
}
function updateBotLeaderboard(){
  const body=document.getElementById('botRows');if(body)body.innerHTML=botRowsHtml();
  const head=document.getElementById('botHead');if(head)head.innerHTML=botHeadHtml();
  const stamp=document.getElementById('botStamp');if(stamp)stamp.textContent='LIVE • UPDATED '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function renderBotProfile(name){const b=SAVE.bots[name];if(!b)return;const a=state.actors.find(a=>a.name===name),p=b.profile;showModal(`<div class="eyebrow">PERSISTENT OPERATOR RECORD</div><h2>${escapeHtml(name)} · ${p.power} POWER</h2><p>${escapeHtml(strategicRole(p.archetype))} · ${formLabel(b.recentForm)} ${b.recentForm.toFixed(1)} FORM</p><p>${escapeHtml(a?.decisionReason||'Waiting for next match')}</p><p>SEASON ${SAVE.seasons.current.number} · ${(SAVE.seasons.current.stats[name]?.wins||0)}–${(SAVE.seasons.current.stats[name]?.losses||0)} W/L · ${(SAVE.seasons.current.stats[name]?.kills||0)}–${(SAVE.seasons.current.stats[name]?.deaths||0)} K/D</p><div class="analytics-note">${escapeHtml(p.personality.description||'')}</div><h3>Weapon familiarity</h3><table class="meta-table"><thead><tr><th>Weapon</th><th>Familiarity</th><th>Career kills</th><th>Career equipped time</th></tr></thead><tbody>${Object.keys(WEAPONS).map(w=>`<tr><td>${escapeHtml(w)}</td><td>${b.familiarity[w].toFixed(1)} / 100</td><td>${b.career.weaponUsage[w].k}</td><td>${(b.career.weaponUsage[w].equippedTime/60).toFixed(1)}m</td></tr>`).join('')}</tbody></table><details><summary>Stable personality</summary><p>${Object.entries(p.personality).filter(([,v])=>typeof v==='number').map(([k,v])=>escapeHtml(k)+': '+v.toFixed(2)).join(' · ')}</p></details><button data-action="bots">BACK TO LEADERBOARD</button>`,'profile');}
document.addEventListener('click',e=>{const b=e.target.closest('[data-bot-profile]');if(b)renderBotProfile(b.dataset.botProfile);});
function renderBotLeaderboard(){
  showModal(`<div class="eyebrow">50-BOT ACTIVE CAREER RECORDS • ALL LIVE MATCHES</div><div class="meta-heading"><h2>Bot Leaderboard</h2><span id="botStamp">LIVE</span></div><div class="analytics-note">Career combat totals persist across versions. Power is a fixed skill rating, not calculated from stats. Every bot keeps the same tactical navigation/cover brain, while Power changes execution quality. There are only five tactical playstyles: Long-Range Marksman, Aggressive Rusher, Flanker, Defensive Anchor and Adaptive Flex. Bots re-evaluate weapons each match, generally gravitate toward stronger live-meta guns, and still make occasional unpredictable choices. ◆ marks feared bots. Click any header to sort.</div><div style="overflow:auto"><table class="meta-table sortable-table"><thead><tr id="botHead">${botHeadHtml()}</tr></thead><tbody id="botRows">${botRowsHtml()}</tbody></table></div>`,'bots');
  updateBotLeaderboard();
}
setInterval(()=>{
  const view=document.getElementById('modalContent')?.dataset.view;
  if(!document.getElementById('modal').classList.contains('visible'))return;
  if(view==='meta')updateMetaTable();
  if(view==='bots')updateBotLeaderboard();
},1000);
function renderSaveModal(){
  showModal(`<div class="eyebrow">VERSION-SAFE PERSISTENCE</div><h2>Save Data</h2><div class="analytics-note">Bot careers, fixed Power profiles, per-bot weapon history, and weapon meta are automatically saved every 2 seconds under one permanent schema key. Future versions migrate this save forward. Export a file as an extra backup when moving the game to another folder/device.</div><div class="stack"><button data-action="export-save">EXPORT SAVE FILE</button><button data-action="import-save">IMPORT SAVE FILE</button></div><input id="saveImport" type="file" accept="application/json,.json" class="hidden">`,'save');
}
let awaitingBindAction=null;
function settingsTabs(active){
  return `<div class="settings-tabs"><button class="${active==='controls'?'active':''}" data-settings-tab="controls">CONTROLS</button><button class="${active==='aim'?'active':''}" data-settings-tab="aim">AIM</button><button class="${active==='account'?'active':''}" data-settings-tab="account">ACCOUNT</button><button class="${active==='updates'?'active':''}" data-settings-tab="updates">UPDATES</button><button class="${active==='readme'?'active':''}" data-settings-tab="readme">README</button><button class="${active==='patchnotes'?'active':''}" data-settings-tab="patchnotes">PATCH NOTES</button></div>`;
}
function bindRow(action,label){
  return `<div class="control-row"><span>${label}</span><button class="bind-button" data-bind-action="${action}">${awaitingBindAction===action?'PRESS A KEY…':codeLabel(binding(action))}</button></div>`;
}
function renderPatchNotesHtml(){
  return WEAPON_PATCH_NOTES.map(p=>`<article class="patch-entry"><div class="patch-kicker">${p.version} • ${p.date}</div><h3>${p.title}</h3><div class="patch-letter"><strong>Developer Letter</strong><p>${p.letter}</p></div>${p.changes.map(c=>`<section class="patch-weapon"><div class="patch-weapon-title"><strong>${c.weapon}</strong><span class="patch-kind ${c.kind.toLowerCase()}">${c.kind}</span></div><ul>${c.items.map(i=>`<li>${i}</li>`).join('')}</ul><p><strong>Rationale:</strong> ${c.reason}</p></section>`).join('')}</article>`).join('');
}
function renderSettingsModal(tab='controls'){
  if(tab==='updates'){
    const updater=window.SARUpdater;
    const installed=updater?.isInstalled?.()||false;
    const canInstall=updater?.canInstall?.()||false;
    const hasUpdate=updater?.hasUpdate?.()||false;
    const version=updater?.version||'1.2.1';
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
      <div class="settings-section readme-panel">
        <div class="readme-hero"><span class="readme-kicker">SKIRMISH ARENA REIMAGINED</span><h3>A Living Competitive Sandbox</h3><p>Skirmish Arena Reimagined is a persistent 5v5 team-deathmatch simulation built around one idea: let the game create its own meta, then balance around what actually happens.</p></div>
        <div class="readme-grid">
          <section><h4>What This Game Is</h4><p>You play alongside and against a permanent population of bots with different Power ratings, personalities, weapon habits, strengths, weaknesses, careers, and long-term records. Matches continue across the simulation, bot statistics persist between versions, and each season creates another chapter in the same ongoing competitive world. Bots use one of five clear tactical playstyles and re-evaluate weapons from game to game. Higher-Power bots generally read the live meta more aggressively, but no bot is hard-locked to a specific gun and occasional unpredictable picks are intentional.</p></section>
          <section><h4>Combat Mobility & Recovery</h4><p>Every player and bot can dash a medium distance once every four seconds. Dash direction follows movement input, or aim direction when standing still. Low-health recovery activates only after dropping to 75 HP or below and then surviving seven uninterrupted seconds without taking damage; once active, health regenerates until full unless another hit interrupts it.</p></section>
          <section><h4>What The Meta Means</h4><p>The weapon meta is not scripted. Every kill, death, trigger pull, hit, point of damage, headshot, loadout selection, and second of equipped time feeds the live weapon statistics. Gun Score uses those results to identify which weapons are actually outperforming in real matches.</p></section>
          <section><h4>Daily Weapon Balance</h4><p>Weapon tuning is intended to be frequent. Balance can be reviewed and adjusted on a near-daily basis as new data comes in. A weapon may be buffed, nerfed, or left untouched depending on what the live meta shows. Some changes may immediately reshape the game; others may barely move the numbers and require another adjustment.</p></section>
          <section><h4>Why It Changes Often</h4><p>This is meant to be a moving competitive environment rather than a permanently solved loadout list. Frequent updates allow dominant weapons to be challenged, overlooked weapons to find a role, and new strategies to emerge naturally as players and bots adapt to the latest values.</p></section>
          <section><h4>How To Read The Data</h4><p>K/D is the strongest signal in weapon evaluation, but it is not used alone. The game also tracks time-normalized kills and damage, trigger-pull accuracy, headshot-kill rate, usage, range, and sample confidence. Career bot statistics and seasonal results are kept separate from raw weapon-balance measurements.</p></section>
          <section><h4>Patch Notes</h4><p>The Patch Notes tab is intentionally limited to weapon balance changes. Each balance update records the exact values changed and an official explanation for why the adjustment was made, creating a permanent history of how the meta evolved.</p></section>
        </div>
        <div class="readme-footer"><strong>The goal:</strong> no permanently fixed meta. The strongest strategies should be discovered through play, measured through data, and challenged through continued balance updates.</div>
      </div>`,'settings');
    return;
  }
  if(tab==='patchnotes'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}<div class="settings-section"><div class="patch-heading"><div><h3>Weapon Balance Patch Notes</h3><p>Official weapon tuning history only.</p></div></div>${renderPatchNotesHtml()}</div>`,'settings');
    return;
  }
  if(tab==='account'){
    const acct=currentAccount();
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
  if(tab==='aim'){
    showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs(tab)}
      <div class="settings-section"><h3>Aim</h3>
        <div class="slider-row"><div><strong>Mouse sensitivity</strong><span>Controls virtual crosshair movement speed.</span></div><div class="slider-control"><input id="mouseSensitivity" type="range" min=".25" max="2.5" step=".05" value="${CONFIG.mouseSensitivity}"><strong id="sensValue">${Number(CONFIG.mouseSensitivity).toFixed(2)}×</strong></div></div>
        <div class="analytics-note">Crosshair spread is live weapon dispersion. Standing still tightens it, moving opens it, sprinting opens it further, and sustained fire adds temporary bloom. The projectile simulation uses the same value.</div>
      </div>`,'settings');
    return;
  }
  showModal(`<div class="eyebrow">GAME SETTINGS</div><h2>Settings</h2>${settingsTabs('controls')}
    <div class="settings-section"><h3>Controls</h3><div class="controls-grid">
      ${bindRow('moveUp','Move up')}${bindRow('moveDown','Move down')}${bindRow('moveLeft','Move left')}${bindRow('moveRight','Move right')}
      ${bindRow('sprint','Sprint')}${bindRow('dash','Dash')}${bindRow('reload','Reload')}${bindRow('primary','Primary weapon')}${bindRow('sidearm','Sidearm')}
      ${bindRow('scoreboard','Scoreboard')}${bindRow('fullMap','Full map')}
      <div class="control-row"><span>Aim</span><strong>MOUSE</strong></div><div class="control-row"><span>Fire</span><strong>LMB</strong></div>
      <div class="control-row"><span>Pause / lobby</span><strong>ESC</strong></div>
    </div><p class="meta-note">Spectator controls remain ← / → for bots and ↑ / ↓ for live games.</p></div>`,'settings');
}
function renderControlsModal(){renderSettingsModal('controls');}

function clearInput(){input.keys.clear();input.mouseDown=false;input.justPressed=false;document.getElementById('scoreboard').classList.add('hidden');}
addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();saveTelemetry();}});
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
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(document.getElementById('modal').classList.contains('visible'))return;
  input.keys.add(e.code);
  if(e.code===binding('scoreboard')&&state.running){e.preventDefault();if(state.running){document.getElementById('scoreboard').classList.remove('hidden');renderScoreboard();}}
  if(e.code===binding('fullMap')&&state.running&&!e.repeat){
    e.preventDefault();input.fullMap=!input.fullMap;
    if(state.mode==='play')document.getElementById('crosshair').classList.toggle('hidden',input.fullMap);
  }
  if(e.code==='Escape'&&state.running&&!e.repeat){
    if(input.fullMap){input.fullMap=false;if(state.mode==='play')document.getElementById('crosshair').classList.remove('hidden');return;}
    if(state.mode==='spectate'){exitGame();return;}
    state.paused=!state.paused;document.getElementById('pause').classList.toggle('visible',state.paused);clearInput();
  }
  if(state.mode==='spectate'){if(e.code==='ArrowRight')cycleSpectateActor(1);if(e.code==='ArrowLeft')cycleSpectateActor(-1);if(e.code==='ArrowDown')cycleSpectateMatch(1);if(e.code==='ArrowUp')cycleSpectateMatch(-1);}
  if(state.running&&!state.paused&&state.mode==='play'){
    const p=getPlayer();if(p&&!p.dead){
      if(e.code===binding('dash')&&!e.repeat){e.preventDefault();const d=dashDirectionFromPlayer(p);tryDash(p,d.x,d.y,gameNow());}
      if(e.code===binding('primary'))p.currentSlot=0;
      if(e.code===binding('sidearm'))p.currentSlot=1;
      if(e.code===binding('reload'))startReload(p,gameNow());
    }
  }
});
addEventListener('keyup',e=>{input.keys.delete(e.code);if(e.code===binding('scoreboard'))document.getElementById('scoreboard').classList.add('hidden');});
canvas.addEventListener('mousemove',e=>{
  input.mouseX=e.clientX;input.mouseY=e.clientY;
  if(state.mode==='play'&&state.running&&!state.paused){
    const sens=Number(CONFIG.mouseSensitivity)||1;
    input.aimX=clamp(input.aimX+e.movementX*sens,8,cssW-8);
    input.aimY=clamp(input.aimY+e.movementY*sens,8,cssH-8);
    const c=document.getElementById('crosshair');c.style.left=input.aimX+'px';c.style.top=input.aimY+'px';
  }
});
canvas.addEventListener('mousedown',e=>{
  if(e.button!==0||state.mode!=='play'||state.paused||input.fullMap)return;
  input.mouseDown=true;const p=getPlayer();
  // Handle the press immediately so even a click shorter than one frame fires.
  if(p&&!p.dead){const aim=screenToWorld(input.aimX,input.aimY);p.angle=Math.atan2(aim.y-p.y,aim.x-p.x);fire(p,p.angle,gameNow());}
});addEventListener('mouseup',e=>{if(e.button===0)input.mouseDown=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

document.addEventListener('click',async e=>{
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='play')queueForMatch();
  else if(action==='spectate')startSpectate();
  else if(action==='loadout')renderLoadoutModal();
  else if(action==='operator')renderOperatorModal();
  else if(action==='meta')renderMetaModal();
  else if(action==='bots')renderBotLeaderboard();
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
  else if(action==='app-check-update'){
    const msg=document.getElementById('appUpdateMessage');if(msg)msg.textContent='CHECKING FOR UPDATES…';
    await window.SARUpdater?.check?.();renderSettingsModal('updates');
  }
  else if(action==='app-install-update'){await window.SARUpdater?.apply?.();}
  else if(action==='app-install-pwa'){await window.SARUpdater?.install?.();renderSettingsModal('updates');}
  else if(action==='export-save')exportSave();
  else if(action==='import-save')document.getElementById('saveImport')?.click();
  else if(action==='resume'){state.paused=false;document.getElementById('pause').classList.remove('visible');}
  else if(action==='exit')exitGame();
  else if(action==='close-result')closeModal();

  const tab=e.target.closest('[data-settings-tab]')?.dataset.settingsTab;if(tab){awaitingBindAction=null;renderSettingsModal(tab);}
  const bindAction=e.target.closest('[data-bind-action]')?.dataset.bindAction;if(bindAction){awaitingBindAction=bindAction;renderSettingsModal('controls');}

  const p=e.target.closest('[data-set-primary]')?.dataset.setPrimary;if(p){CONFIG.primary=p;STORE.set('sar-v1-primary',p);saveTelemetry();renderLoadoutModal();}
  const s=e.target.closest('[data-set-sidearm]')?.dataset.setSidearm;if(s){CONFIG.sidearm=s;STORE.set('sar-v1-sidearm',s);saveTelemetry();renderLoadoutModal();}
  const sk=e.target.closest('[data-set-skin]')?.dataset.setSkin;if(sk!==undefined){CONFIG.skin=Number(sk);STORE.set('sar-v1-skin',sk);saveTelemetry();renderOperatorModal();}
  const sortButton=e.target.closest('[data-sort-view]');if(sortButton){const view=sortButton.dataset.sortView,key=sortButton.dataset.sortKey,c=TABLE_SORT[view];if(c.key===key)c.dir*=-1;else{c.key=key;c.dir=-1;}if(view==='meta')updateMetaTable();else updateBotLeaderboard();}
  const metaWeaponRow=e.target.closest('[data-meta-weapon]');if(metaWeaponRow){META_SELECTED_WEAPON=metaWeaponRow.dataset.metaWeapon;updateMetaTable();}
  if(e.target.id==='resetMeta'){if(confirm('Archive this sample permanently and start a new current sample?')){SAVE.patchArchives.push({...cloneData(SAVE.patchState),endedAt:Date.now(),reason:'manual sample restart'});state.projectiles=[];SAVE.patchState=freshPatch('manual sample restart',SAVE.patchState.generation+1);meta=SAVE.meta=SAVE.patchState.meta;saveTelemetry();renderMetaModal();}}
});
document.getElementById('closeModal').addEventListener('click',()=>{awaitingBindAction=null;closeModal();});
document.addEventListener('change',e=>{if(e.target?.id==='saveImport')importSaveFile(e.target.files?.[0]);});
document.addEventListener('input',e=>{
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
addEventListener('resize',()=>{paintLobbyKit();document.querySelectorAll('[data-weapon-preview]').forEach(c=>drawWeaponPreview(c,c.dataset.weaponPreview));document.querySelectorAll('[data-operator-preview]').forEach(c=>drawOperatorPreview(c,Number(c.dataset.operatorPreview)));paintMetaPreview();});
let last=performance.now();
function loop(frameTime){
  const elapsed=Math.max(0,Math.min(.25,(frameTime-last)/1000));last=frameTime;
  if(!state.paused&&!document.hidden){
    let remaining=elapsed;
    while(remaining>1e-6){const dt=Math.min(.035,remaining);simulationTime+=dt*1000;update(dt,simulationTime);remaining-=dt;}
  }
  render(simulationTime);requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose a tiny read-only debugging surface for verification/dev tools.
window.SAR = {
  getState:()=>({mode:state.mode,running:state.running,paused:state.paused,queued:state.queued,playerMatchId:state.playerMatchId,spectateMatchId:state.spectateMatchId,actors:state.actors.length,bots:state.actors.filter(a=>!a.isPlayer).length,projectiles:state.projectiles.length,elapsed:state.elapsed,world:{...WORLD},matches:state.matches.map(m=>m?{id:m.id,score:[...m.score],hasPlayer:m.hasPlayer,status:m.status,overtime:m.overtime,timeLeftMs:matchRemainingMs(m),endReason:m.endReason}:null),idleBots:state.idleBots.length}),
  getWeapons:()=>JSON.parse(JSON.stringify(WEAPONS)),
  getMeta:()=>JSON.parse(JSON.stringify(meta)),
  getBots:()=>JSON.parse(JSON.stringify(botCareerStore)),
  getProfiles:()=>JSON.parse(JSON.stringify(Object.fromEntries(BOT_NAMES.slice(0,BOT_COUNT).map(n=>[n,profileFor(n)])))),
  getTopMetaPrimaries:()=>topMetaPrimaries(3),
  getPrimaryCoverage:()=>JSON.parse(JSON.stringify(coverageState())),
  getBotLoadouts:()=>state.actors.filter(a=>!a.isPlayer).map(a=>({name:a.name,power:a.profile?.power,personality:a.profile?.personality?.label,primary:a.slots?.[0]?.name,sidearm:a.slots?.[1]?.name,matchId:a.matchId})),
  getSaveInfo:()=>({schema:SAVE.schema,updatedAt:SAVE.updatedAt,key:SAVE_KEY,writeProtected:saveWriteProtected,patch:metaPhase(),archives:SAVE.patchArchives.length,storageError:STORE.error||null,activeBots:BOT_COUNT,retiredBots:Object.keys(SAVE.bots).filter(n=>!BOT_NAMES.slice(0,BOT_COUNT).includes(n)),account:currentAccount()?.username||null}),
  getWeaponScores:()=>weaponMetrics().map(r=>({name:r.m.name,score:r.score,kd:r.kd,skillAdjustedKd:r.skillAdjustedKd,confidence:r.confidence,usage:r.usage,accuracy:r.accuracy})),
  getActorSnapshots:()=>state.actors.map(a=>({id:a.id,name:a.name,isPlayer:a.isPlayer,matchId:a.matchId,team:a.team,x:a.x,y:a.y,hp:a.hp,dead:a.dead,vx:a.vx,vy:a.vy,target:a.target?.name||null,muzzleUntil:a.muzzleUntil,weapon:currentWeaponState(a)?.name,ammo:currentWeaponState(a)?.ammo,reloading:currentWeaponState(a)?.reloading,tactic:a.tactic,reason:a.decisionReason,coverState:a.coverState?.startsWith('PEEKING')&&gameNow()<a.muzzleUntil?'FIRING':a.coverState,targetSeenAt:a.target?.at,stuckCount:a.stuckCount||0,sprinting:a.sprinting,dashing:gameNow()<a.dashUntil,dashCooldownMs:Math.max(0,a.dashCooldownUntil-gameNow()),regenActive:a.regenActive,spread:!a.dead&&a.slots.length?effectiveSpreadDeg(a):null})),
  getConfig:()=>JSON.parse(JSON.stringify(CONFIG)),
  getDiagnostics:()=>cloneData(diagnostics),
  getPatch:()=>cloneData(SAVE.patchState),
  getUniverse:()=>cloneData(SAVE)
};
})();
