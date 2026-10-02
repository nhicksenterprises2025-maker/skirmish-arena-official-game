/* Exercises shipped event handlers. Synthetic setup defines boundary conditions;
   reported combat outcomes are produced by the real game functions. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine,migrationTests}=require('./simulate.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const fields=['engagementDistance','engagementDistanceN','classifiedKills','soloKills','finisherKills'];
const checks=[];
function pass(test,detail){checks.push({test,result:'PASS',detail});console.log('PASS',test,detail||'');}
function pair(e){const {state}=e.dev.inspect(),a=state.actors.find(a=>a.matchId===0&&a.team===0),b=state.actors.find(a=>a.matchId===0&&a.team===1);for(const o of state.actors)if(o!==a&&o!==b){o.dead=true;o.respawnAt=1e12;}return [a,b];}
function open(e,separation=200){for(let y=100;y<2700;y+=40)for(let x=100;x<3900-separation;x+=40)if(!e.dev.collides(x,y)&&!e.dev.collides(x+separation,y)&&e.dev.pathClear(x,y,x+separation,y))return {x,y};throw Error('No clear firing lane');}
function damage(e,victim,owner,weapon,amount,now=10000,travel=176){e.dev.applyDamage(victim,{owner,weapon,travel},amount,false,now);}
function approx(a,b,epsilon=1e-7){assert.ok(Math.abs(a-b)<epsilon,a+' != '+b);}

for(const [contribution,solo,finisher] of [[200,1,0],[199.999,0,0],[100,0,1],[100.001,0,0],[150,0,0],[250,1,0]]){
 const e=engine(),[a,b]=pair(e),m=e.dev.inspect().meta;
 if(contribution<250)damage(e,b,a,'AK47',250-contribution);
 damage(e,b,a,'X16',contribution,10001);
 assert.equal(b.hp,0);assert.equal(m.X16.kills,1);assert.equal(m.X16.classifiedKills,1);
 assert.equal(m.X16.soloKills,solo,'solo at '+contribution);assert.equal(m.X16.finisherKills,finisher,'finisher at '+contribution);
 assert.equal(m.AK47.classifiedKills,0);approx(m.X16.damage,contribution);
 const band=e.dev.inspect().SAVE.patchState.skillStrata[String(Math.floor((a.profile.power-20)/20)*20+20)].X16;
 assert.equal(band.classifiedKills,1);assert.equal(band.soloKills,solo);assert.equal(band.finisherKills,finisher);
}
pass('Solo ≥200 HP and finisher ≤100 HP boundaries use actual finishing-weapon damage; middle kills remain separate');
{
 const e=engine(),[a,b]=pair(e),m=e.dev.inspect().meta;
 damage(e,b,a,'AK47',240);damage(e,b,a,'9mm',1000,10001);
 assert.equal(m['9mm'].damage,10);assert.equal(b.damageByWeapon.get('9mm'),10);assert.equal(m['9mm'].finisherKills,1);
 e.dev.respawnActor(b,false);assert.equal(b.hp,250);assert.equal(b.damageByWeapon.size,0);assert.equal(b.damageLedger.size,0);
 damage(e,b,a,'9mm',250,10002);assert.equal(m['9mm'].classifiedKills,2);assert.equal(m['9mm'].soloKills,1);assert.equal(m['9mm'].finisherKills,1);
 const metrics=e.dev.weaponMetrics().find(r=>r.m.name==='9mm');approx(metrics.soloPct,.5);approx(metrics.finisherPct,.5);
 pass('Overkill cannot inflate contribution; respawn clears both damage ledgers and percentages use classified kills only');
}
{
 const e=engine(),[a,b]=pair(e),p=open(e),m=e.dev.inspect().meta;
 Object.assign(a,p);Object.assign(b,{x:p.x+200,y:p.y});a.currentSlot=0;a.slots[0]={name:'P90',ammo:36,reserve:144,lastShot:-999,reloading:false,reloadEnd:0};
 a.target={id:b.id,name:b.name,x:b.x,y:b.y,visible:true,at:10000};
 assert.ok(e.dev.fire(a,0,10000));assert.equal(m.P90.shots,1);assert.equal(m.P90.engagementDistanceN,1);approx(m.P90.engagementDistance,200);
 assert.ok(e.dev.fire(a,Math.PI/2,10300));assert.equal(m.P90.shots,2);assert.equal(m.P90.engagementDistanceN,1);
 a.target.visible=false;assert.ok(e.dev.fire(a,0,10600));assert.equal(m.P90.shots,3);assert.equal(m.P90.engagementDistanceN,1);
 damage(e,b,a,'P90',250,10601,400);
 const metrics=e.dev.weaponMetrics().find(r=>r.m.name==='P90');approx(metrics.engRange,200/70);approx(metrics.range,400/70);assert.notEqual(metrics.range,metrics.engRange);
 assert.equal(e.dev.botTacticalRange('P90'),700);assert.equal(e.context.SAR.getWeapons().P90.preferred,720);
 const row=e.dev.currentMetaRows().find(r=>r.name==='P90'),html=e.dev.metaDetailHtml([row]);
 assert.match(html,/Designed Range/);assert.match(html,/7–12 tiles/);assert.match(html,/Avg Engagement Range/);assert.match(html,/Avg Kill Range/);
 pass('Only aimed visible-enemy trigger pulls record engagement range; kill range is independent; P90 tactical range preserves base balance');
}
{
 const e=engine(),save=JSON.parse(JSON.stringify(e.dev.inspect().SAVE));
 save.schema=16;save.meta.P90.kills=90;save.patchState.meta.P90.kills=90;
 for(const m of Object.values(save.meta))for(const field of fields)delete m[field];
 for(const m of Object.values(save.patchState.meta))for(const field of fields)delete m[field];
 for(const b of Object.values(save.bots))delete b.profile.id;
 delete save.playerCareer;
 const migrated=engine({'sar-persistent-save':JSON.stringify(save)}),world=migrated.dev.inspect().SAVE,ids=Object.values(world.bots).map(b=>b.profile.id);
 assert.equal(world.schema,17);assert.equal(world.meta.P90.kills,90);assert.equal(new Set(ids).size,50);
 for(const m of Object.values(world.meta))for(const field of fields)assert.equal(m[field],0);
 const r=migrated.dev.weaponMetrics().find(r=>r.m.name==='P90');assert.equal(r.engRange,null);assert.equal(r.soloPct,null);assert.equal(r.finisherPct,null);
 assert.equal(migrated.dev.metaMeasured(7,0),'—');assert.equal(migrated.dev.metaMeasured(7,4),'LOW SAMPLE');assert.equal(migrated.dev.metaMeasured(7,5),'7.0');
 assert.equal(world.playerCareer.kills,0,'old human history must not be reconstructed');
 migrated.dev.saveTelemetry();const reloaded=engine(Object.fromEntries(migrated.data));assert.deepEqual(Object.values(reloaded.dev.inspect().SAVE.bots).map(b=>b.profile.id),ids);
 assert.equal(reloaded.dev.inspect().SAVE.meta.P90.classifiedKills,0);assert.equal(reloaded.dev.inspect().SAVE.meta.P90.kills,90);
 pass('Schema16 migration/reload retain stable IDs and historical kills while missing analytics/player history remain unmeasured');
}
{
 const e=engine(),[a,b]=pair(e);damage(e,b,a,'P90',250);e.dev.saveTelemetry();
 const before=e.dev.inspect().SAVE.patchState.id,changed=source.replace("'AK47': { type:'primary', damage:34, spread:4","'AK47': { type:'primary', damage:30, spread:4.2");
 assert.ok(source!==changed,'migration fixture changes active AK47 damage and spread');const next=engine(Object.fromEntries(e.data),changed),save=next.dev.inspect().SAVE;
 assert.notEqual(save.patchState.id,before);assert.equal(save.patchArchives.length,1);assert.equal(save.patchArchives[0].id,before);assert.equal(save.patchArchives[0].meta.P90.soloKills,1);assert.equal(save.patchArchives[0].meta.P90.classifiedKills,1);
 for(const m of Object.values(save.meta))for(const f of fields)assert.equal(m[f],0,'current patch '+f);
 assert.equal(save.bots[a.name].career.kills,1);
 pass('Balance fingerprint change archives new counters and cleans current patch while lifetime careers survive');
}
{
 const e=engine(),m=e.dev.inspect().SAVE.patchState.aiSamples[e.dev.inspect().SAVE.aiRevision].meta,w=e.context.SAR.getWeapons();
 assert.equal(e.dev.visibleMetaRows().length,11);assert.ok(e.dev.visibleMetaRows().every(r=>w[r.name].type==='primary'));e.dev.setMetaKind('sidearm');assert.deepEqual(e.dev.visibleMetaRows().map(r=>r.name).sort(),['9mm','X-16 Auto','X16']);
 for(const v of Object.values(m))Object.assign(v,{kills:20,deaths:20,damage:5000,shots:100,hits:70,headshots:4,equippedTime:600});const equal=e.dev.weaponMetrics();approx(equal.find(r=>r.m.name==='9mm').score,equal.find(r=>r.m.name==='AR-15').score);
 for(const [name,v] of Object.entries(m))Object.assign(v,{kills:name==='X16'?30:20,deaths:10,damage:5000,shots:100,hits:70,headshots:4,equippedTime:600});
 const sideBefore=e.dev.weaponMetrics().filter(r=>w[r.m.name].type==='sidearm').map(r=>({name:r.m.name,score:r.score,usage:r.usage,confidence:r.confidence}));
 for(const [name,v] of Object.entries(m))if(w[name].type==='primary')Object.assign(v,{kills:10000,deaths:1,damage:2500000,shots:12000,hits:11999,headshots:10000,equippedTime:500000});
 const sideAfter=e.dev.weaponMetrics().filter(r=>w[r.m.name].type==='sidearm').map(r=>({name:r.m.name,score:r.score,usage:r.usage,confidence:r.confidence}));
 assert.deepEqual(sideAfter,sideBefore);
 for(const category of ['primary','sidearm'])approx(e.dev.weaponMetrics().filter(r=>w[r.m.name].type===category).reduce((s,r)=>s+r.usage,0),1);
 assert.deepEqual(sideAfter.map(r=>r.name).sort(),['9mm','X-16 Auto','X16']);
 pass('Tabs filter nine primaries/three sidearms; no sidearm penalty; score/confidence/usage stay independent and usage sums to one per category');
}
fs.writeFileSync(path.join(__dirname,'meta-results.json'),JSON.stringify({result:'PASS',sourceHash:require('node:crypto').createHash('sha256').update(source).digest('hex'),checks,migrations:migrationTests()},null,2));


