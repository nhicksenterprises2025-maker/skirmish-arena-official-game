/* Audit 4: real FAL firing/reload events and optional exact pre-audit audio
   preservation. Usage: node dev/arena-refined-audio-check.cjs [results.json]
   [before-LICENSES.json] [before-audio.js]. Test worlds are isolated. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/LICENSES.json'),'utf8'));
const output=process.argv[2]||path.join(__dirname,'arena-refined-audio-results.json');
assert.equal(path.extname(output).toLowerCase(),'.json','output must be a JSON report');
const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);},hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const beforePath=process.argv[3],mixerPath=process.argv[4];
let preservation=null;
if(beforePath){
 const before=JSON.parse(fs.readFileSync(beforePath,'utf8'));
 assert.equal(Object.keys(before.assets).length,218,'the Audit 3 baseline contains 218 runtime recordings');
 for(const [id,asset] of Object.entries(before.assets)){
  assert.deepEqual(manifest.assets[id],asset,id+' complete provenance/mastering preserved');
  assert.equal(hash(fs.readFileSync(path.join(root,'assets/audio',asset.file))),asset.sha256,id+' exact recording bytes preserved');
 }
 for(const [name,weapon] of Object.entries(before.weapons))assert.deepEqual(manifest.weapons[name],weapon,name+' established mappings and mix preserved');
 for(const key of ['format','licenseVerifiedAt','sources','events','audioIdentityVersion','processingTool'])assert.deepEqual(manifest[key],before[key],key+' preserved');
 const additions=Object.keys(manifest.assets).filter(id=>!before.assets[id]);
 assert.equal(additions.length,13);assert.ok(additions.every(id=>id.startsWith('fal_')),'only FAL recordings added');
 assert.ok(mixerPath,'pre-audit mixer snapshot required for preservation evidence');
 assert.deepEqual(fs.readFileSync(path.join(root,'audio.js')),fs.readFileSync(mixerPath),'shared audio mixer byte-identical');
 preservation={baselineAssets:218,preservedAssets:218,addedAssets:additions.length,addedBytes:additions.reduce((n,id)=>n+manifest.assets[id].bytes,0),mixerSha256:hash(fs.readFileSync(path.join(root,'audio.js'))),assets:additions.map(id=>({id,...manifest.assets[id]}))};
 pass('All 218 prior clips, licensing, mappings, shared cues and mixer bytes are identical; only 13 FAL recordings were added');
}
const {engine}=require('./simulate.cjs'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const injected=source.replace('window.SAR = {','window.__AUDIT4AUDIO={makeWeaponState,startReload,updateHandlingAudio,finishReload,updateBurst};window.SAR = {');
assert.notEqual(injected,source,'real engine diagnostic insertion point');
const e=engine({},injected),api=e.context.__AUDIT4AUDIO,{state}=e.dev.inspect();
const actor=state.actors.find(a=>a.matchId===0),w=e.context.SAR.getWeapons().FAL;
assert.ok(w,'FAL in canonical registry');assert.equal(w.auto,false);assert.equal(w.burstCount||1,1);assert.equal(w.pellets,1);assert.equal(w.hitSpeed,.26);assert.equal(w.reload,3.40);assert.equal(w.mag,20);
assert.deepEqual(Object.keys(manifest.weapons),Object.keys(e.context.SAR.getWeapons()),'every canonical weapon mapped');
const phases=[],shots=[];let observedAt=0;
e.context.SARAudio={emit(event){if(event.type==='shot')shots.push(copy(event));else phases.push({...copy(event),observedAt});},flush(){}};
Object.assign(actor,{dead:false,currentSlot:0});state.matches[0].status='active';
let lane;
for(let y=100;y<2200&&!lane;y+=80)for(let x=100;x<3500&&!lane;x+=80)if(!e.dev.collides(x,y)&&e.dev.pathClear(x,y,x+220,y))lane={x,y};
assert.ok(lane,'real unobstructed firing lane');Object.assign(actor,lane);
actor.slots[0]=api.makeWeaponState('FAL');state.projectiles=[];
const start=e.dev.now()+5000;
assert.equal(e.dev.fire(actor,0,start),true);assert.equal(e.dev.fire(actor,0,start+259),false);assert.equal(e.dev.fire(actor,0,start+260),true);
api.updateBurst(actor,start+1000);
assert.deepEqual(shots.map(event=>event.time),[start,start+260]);assert.equal(state.projectiles.length,2);assert.equal(actor.slots[0].ammo,18);assert.ok(!actor.slots[0].pendingBurst);
assert.ok(shots.every(event=>event.weapon==='FAL'),'actual single-bullet firing identity');
pass('Actual FAL firing emits one sound per bullet, rejects the 259 ms retry, accepts 260 ms and creates no burst sounds/projectiles');
const s=actor.slots[0];s.ammo=0;observedAt=10000;api.startReload(actor,observedAt);
assert.equal(s.reloadEnd,13400);assert.deepEqual(phases.map(event=>event.type),['mag-out']);
observedAt=12311;api.updateHandlingAudio(actor,s,observedAt);assert.equal(phases.length,1,'mag-in must wait until authoritative 68% phase');
// Sample just past the exact 68% boundary to avoid binary-rounding ambiguity in
// the existing continuous reload interpolation; no production timing changes.
observedAt=12312.000001;api.updateHandlingAudio(actor,s,observedAt);assert.deepEqual(phases.map(event=>event.type),['mag-out','mag-in']);
observedAt=13399;api.updateHandlingAudio(actor,s,observedAt);assert.equal(phases.length,2,'phase cannot replay');
observedAt=13400;api.finishReload(s,actor);assert.deepEqual(phases.map(event=>event.type),['mag-out','mag-in','reload-ready']);
assert.deepEqual(phases.map(event=>Math.round(event.observedAt)),[10000,12312,13400]);assert.equal(s.ammo,20);assert.equal(s.reserve,60);
assert.ok(phases.every(event=>event.weapon==='FAL'&&manifest.weapons.FAL.handlingEvents[event.type].length===3));
pass('The real FAL reload routes its three-take identities at 0 / 2.312 / 3.40 seconds and preserves 20-round refill/80-round reserve accounting');
assert.equal(manifest.events.message,undefined);assert.equal(manifest.assets.message_received,undefined);
const result={result:'PASS',checks,sourceSha256:hash(Buffer.from(source)),preservation,falEvents:{shots,reload:phases},runtimeAssets:Object.keys(manifest.assets).length,runtimeBytes:Object.values(manifest.assets).reduce((n,a)=>n+a.bytes,0)};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
