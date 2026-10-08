'use strict';
// Compare actual seeded combat/worlds before and after this presentation audit.
// Isolated in-memory storage only; no owner account, database or save is opened.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs');
const units=require('../distance-units.js'),mapCalibration=units.mapCalibration('brightfield-blocks');
const current=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8'),baselinePath=process.argv[3]||process.env.SAR_VISUAL_BASELINE,out=process.argv[2],checks=[];
if(out&&path.extname(out).toLowerCase()!=='.json')throw Error('Report output must end in .json; never pass a source path.');
const hook='window.__VISUAL_AUDIT={weaponSheet,weaponDisplayMetrics,loadoutCard,WEAPONS,TILE,MAX_HP};window.SAR = {';
const exposed=source=>source.replace('window.SAR = {',hook),copy=value=>JSON.parse(JSON.stringify(value)),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function graph(value){const seen=new Map();function encode(item){if(!item||typeof item!=='object')return item;if(seen.has(item))return {$ref:seen.get(item)};seen.set(item,seen.size);if(item instanceof Map)return {$map:[...item].map(([k,v])=>[encode(k),encode(v)])};if(item instanceof Set)return {$set:[...item].map(encode)};if(Array.isArray(item))return item.map(encode);return Object.fromEntries(Object.keys(item).sort().filter(k=>typeof item[k]!=='function').map(k=>[k,encode(item[k])]));}return encode(value);}
function pass(test,work){const detail=work();checks.push({test,result:'PASS',detail});console.log('PASS '+test);}
const dateNow=Date.now;let clock=Date.UTC(2026,9,7,12);Date.now=()=>clock;
try{
 const e=engine({},exposed(current),{wallNow:()=>clock}),api=e.context.__VISUAL_AUDIT,weapons=api.WEAPONS,names=Object.keys(weapons),metrics=Object.fromEntries(names.map(name=>[name,api.weaponDisplayMetrics(name)]));
 pass('All eight stat bars use existing authoritative values, shared zero-to-maximum bounds and exact adjacent numbers',()=>{
  const expected={body:s=>s.w.damage,head:s=>s.w.head,bodyTtk:s=>s.bodyTtk,headTtk:s=>s.headTtk,magazine:s=>s.w.mag,reserve:s=>s.w.reserve,reload:s=>s.w.reload,range:s=>s.w.preferred},inverse=new Set(['bodyTtk','headTtk','reload']);
  for(const name of names){const sheet=api.weaponSheet(name),rows=metrics[name];assert.equal(rows.length,8);assert.deepEqual(rows.map(row=>row.key),Object.keys(expected));for(const row of rows){const maximum=Math.max(...names.map(n=>expected[row.key](api.weaponSheet(n))));assert.equal(row.value,expected[row.key](sheet));assert.equal(row.maximum,maximum);assert.equal(row.shorter,inverse.has(row.key));assert.equal(row.ratio,inverse.has(row.key)?1-row.value/maximum:row.value/maximum);assert.ok(row.ratio>=0&&row.ratio<=1);assert.ok(row.text.length>0);if(row.key==='range')assert.equal(row.text,units.worldDistanceToMeters(weapons[name].preferred,mapCalibration).toFixed(2)+' m');}}
  return {weapons:names.length,barsPerWeapon:8,normalization:'existing zero-to-current-arsenal-maximum; TTK/reload inverted'};
 });
 pass('Slower reload and longer TTK produce weaker bars/greenness; damage/ammunition/range keep increasing direction',()=>{
  for(const key of metrics[names[0]].map(row=>row.key)){
   const rows=names.map(name=>({name,...metrics[name].find(row=>row.key===key)})).sort((a,b)=>a.value-b.value);
   for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];assert.ok(a.shorter?a.ratio>=b.ratio:a.ratio<=b.ratio);}
  }
  const fastest=names.map(name=>({name,...metrics[name].find(row=>row.key==='reload')})).sort((a,b)=>a.value-b.value)[0],slowest=names.map(name=>({name,...metrics[name].find(row=>row.key==='reload')})).sort((a,b)=>b.value-a.value)[0];assert.ok(fastest.ratio>slowest.ratio);assert.equal(slowest.ratio,0);
  return {fastestReload:fastest.name,slowestReload:slowest.name};
 });
 pass('Actual loadout markup uses red/orange/yellow/green HSL from the same performance ratio and preserves numeric values',()=>{
  for(const name of names){const html=api.loadoutCard(name,[],true);for(const row of metrics[name]){const escaped=row.key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),section=new RegExp('<div data-stat="'+escaped+'"[\\s\\S]*?<dd>([\\s\\S]*?)</dd>[\\s\\S]*?--stat-fill:hsl\\(([\\d.]+) 58% 38%\\)[\\s\\S]*?width:([\\d.]+)%').exec(html);assert.ok(section,name+' '+row.key+' actual numeric/color bar');assert.equal(section[1],row.text);assert.equal(Number(section[2]),Number((row.ratio*120).toFixed(1)));assert.equal(Number(section[3]),Number((row.ratio*100).toFixed(2)));}}
  // Synthetic metric rows exercise the exact presentation mapping boundaries;
  // this fixture does not change or persist any authoritative weapon constants.
  const boundarySource=exposed(current).replace('const stats=weaponDisplayMetrics(name);','const stats=[0,.25,.5,1].map((ratio,i)=>({key:"boundary"+i,label:"Boundary",value:i,text:String(i),maximum:3,ratio,shorter:false}));'),boundary=engine({},boundarySource,{wallNow:()=>clock}).context.__VISUAL_AUDIT.loadoutCard(names[0],[],true);
  for(const hue of [0,30,60,120])assert.match(boundary,new RegExp('hsl\\('+hue.toFixed(1)+' 58% 38%\\)'));
  return {hueBoundaries:[0,30,60,120],meaning:['red','orange','yellow','green']};
 });
 if(baselinePath)pass('Sixty seconds of real before/after combat retains full actor/simulation state, balance, careers, progression and saved account/world bytes',()=>{
  const baseline=fs.readFileSync(path.resolve(baselinePath),'utf8'),creator=engine({},baseline,{wallNow:()=>clock});
  for(let tick=0;tick<300;tick++){clock+=1000/30;creator.step(1/30);}creator.dev.queueForMatch();const m=creator.dev.inspect().state.matches.find(match=>match.hasPlayer),p=m.participants.find(actor=>actor.isPlayer),victim=m.participants.find(actor=>actor.team!==p.team);m.status='active';creator.dev.fire(p,0,12000);creator.dev.tryDash(p,1,0,12000);creator.dev.applyDamage(victim,{owner:p,weapon:p.slots[0].name,travel:70},250,false,12001);creator.dev.endMatch(m,p.team,'time');creator.ui.flush();
  const saved=copy(creator.dev.inspect().SAVE);assert.ok(saved.progression.totalXPUnits>0);saved.futureWorld={retain:'audit-3'};saved.config.futurePreference='retain';const account=JSON.stringify({audit:{username:'AuditFixture',hash:'isolated-not-a-real-credential',createdAt:17}}),storage={'sar-persistent-save':JSON.stringify(saved),'sar-local-accounts-v1':account,'sar-local-session-v1':'audit'},start=clock,checkpoints=[];
  function run(source){clock=start;const env=engine(storage,source,{wallNow:()=>clock}),observations=[];function snapshot(){const inspected=env.dev.inspect();return {world:graph(inspected.SAVE),state:graph(inspected.state),diagnostics:graph(inspected.diagnostics),weapons:env.context.SAR.getWeapons(),fingerprint:env.dev.balanceFingerprint(),profiles:env.context.SAR.getProfiles(),storage:Object.fromEntries(env.data)};}observations.push(snapshot());for(let tick=0;tick<1800;tick++){clock+=1000/30;env.step(1/30);if((tick+1)%300===0)observations.push(snapshot());}env.dev.saveTelemetry();observations.push(snapshot());return observations;}
  const before=run(baseline),after=run(current);for(let index=0;index<before.length;index++){assert.deepEqual(after[index],before[index],'actual world/actor state at checkpoint '+index);checkpoints.push({seconds:Math.min(index*10,60),sha256:hash(JSON.stringify(after[index]))});}
  assert.equal(after.at(-1).storage['sar-local-accounts-v1'],account);assert.equal(after.at(-1).storage['sar-local-session-v1'],'audit');assert.equal(after.at(-1).fingerprint,'b-b9bdf00b');assert.equal(after.at(-1).world.patchState.balanceVersion,'8.0');
  return {baselineSHA256:hash(baseline),currentSHA256:hash(current),checkpoints,simulationSeconds:60,identical:true};
 });
 if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(path.resolve(out),JSON.stringify({result:'PASS',groups:checks.length,currentSHA256:hash(current),checks},null,2)+'\n');}
 console.log(JSON.stringify({result:'PASS',groups:checks.length}));
}finally{Date.now=dateNow;}
