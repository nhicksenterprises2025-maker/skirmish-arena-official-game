'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Stats=require('../profile-stats.js'),XP=require('../progression.js'),{engine}=require('./simulate.cjs');
const {profileFixture,clone}=require('./arena-refined-profile-fixture.cjs');
const output=process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-arena-refined-profile');fs.mkdirSync(output,{recursive:true});
const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);},hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),fixture=profileFixture();
const read=(world=fixture.world,kind='combined',scope='lifetime',extra={})=>Stats.project(world,{participantId:fixture.participantId,accountId:fixture.participantId,kind,scope,...extra});
const before=JSON.stringify(fixture.world),combined=read(),ranked=read(fixture.world,'ranked');
assert.deepEqual(combined.totals,fixture.expected.combined);assert.deepEqual(ranked.totals,fixture.expected.ranked);
assert.deepEqual(combined.records.map(row=>row.matchId),['match:audit9:casual-tdm','match:audit9:casual-dm','match:audit9:ranked-tdm']);
assert.equal(ranked.records.length,1);assert.equal(ranked.records[0].sources.length,4);
assert.equal(combined.ratios.kd,32/15);assert.equal(combined.ratios.accuracy,59/130);assert.equal(combined.ratios.winRate,2/3);
assert.notEqual(combined.ratios.accuracy,(.4+.9+.5)/3);assert.equal(JSON.stringify(fixture.world),before);
pass('Casual TDM, casual DM and Ranked TDM unique records reconcile; official/custom excluded; raw weighted ratios and read-only source');
const current=read(fixture.world,'combined','season',{seasonNumber:2}),old=read(fixture.world,'combined','season',{seasonNumber:1});
assert.equal(current.totals.games,2);assert.equal(current.totals.kills,22);assert.equal(old.totals.games,1);assert.equal(old.totals.kills,10);
assert.equal(read(fixture.world,'ranked','season',{seasonNumber:1}).totals.games,0);
assert.equal(read(fixture.world,'combined','season',{seasonNumber:999}).coverage.seasonAvailable,false);
pass('Saved lifetime/current/historical season scopes use completion timestamps and preserve current lifetime rating');
const partial=clone(fixture.world);for(const store of [partial.progression.awards,partial.ranked.participants[fixture.participantId].awards]){delete store['match:audit9:ranked-tdm'].stats.shots;delete store['match:audit9:ranked-tdm'].stats.hits;}
delete partial.rankedResults['match:audit9:ranked-tdm'].rows[0].stats.shots;delete partial.rankedResults['match:audit9:ranked-tdm'].rows[0].stats.hits;
const rr=partial.playerCareer.recentMatches.find(r=>r.matchId==='match:audit9:ranked-tdm');delete rr.shots;delete rr.hits;
assert.equal(read(partial).totals.shots,null);assert.equal(read(partial).ratios.accuracy,null);assert.equal(read(partial).coverage.accuracyGames,2);
const empty=clone(fixture.world);empty.progression.awards={};empty.ranked={version:1,participants:{}};empty.rankedResults={};empty.playerCareer.recentMatches=[];empty.modeStats.deathmatch.recentMatches=[];
assert.equal(read(empty).totals.games,0);assert.equal(read(empty).ratios.winRate,null);assert.equal(read(empty).ratios.accuracy,null);assert.equal(read(empty).coverage.missingGames,3);
const foreign=Stats.project(fixture.world,{participantId:'foreign-account',accountId:fixture.participantId});assert.equal(foreign.coverage.authorized,false);assert.equal(foreign.totals.games,0);
pass('Old missing shot measurements, missing histories, zero denominators and another account remain honestly unavailable');

const results=[];
for(const mode of ['tdm','deathmatch','ranked-tdm']){
 const e=engine({},source),queued=[],id='audit9-real-'+mode,originalNow=e.context.SARCloud.now;
 e.context.SARCloud={now:originalNow,state:{account:{id,username:'Audit9RealFixture'},loaded:true,localMode:true},queueSave:world=>queued.push(clone(world)),commitMatch(){}};
 if(mode==='tdm')e.dev.queueForMatch();else if(mode==='deathmatch')e.context.SAR.startDeathmatch();else e.context.SAR.startRanked();
 const {state,SAVE}=e.dev.inspect(),match=state.matches.find(m=>m?.hasPlayer),player=match.participants.find(a=>a.isPlayer),enemy=match.participants.find(a=>a.team!==player.team);
 for(const a of state.actors)if(!a.isPlayer)Object.assign(a,{dead:true,respawnAt:Infinity});e.step(3.001);assert.equal(match.status,'active');
 let lane;for(let y=100;y<2200&&!lane;y+=80)for(let x=100;x<3500&&!lane;x+=80)if(!e.dev.collides(x,y)&&e.dev.pathClear(x,y+12,x+210,y+12))lane={x,y};assert.ok(lane);
 Object.assign(player,{x:lane.x,y:lane.y,currentSlot:0,dead:false});Object.assign(enemy,{x:lane.x+120,y:lane.y,dead:false,hp:250,spawnFlash:0});
 let clock=e.dev.now()+1000;while(!enemy.dead){state.projectiles=[];clock+=500;assert.equal(e.dev.fire(player,0,clock),true);const bullet=state.projectiles[0];assert.ok(bullet);Object.assign(bullet,{x:lane.x+30,y:lane.y+12,vx:1000,vy:0,travel:30});e.dev.updateProjectiles(.14,clock+150);}
 assert.equal(player.stats.kills,1);assert.equal(player.stats.damage,250);assert.equal(player.stats.shots,9);assert.equal(player.stats.hits,9);
 const kind=mode==='ranked-tdm'?'ranked':'combined';if(kind==='ranked')e.context.SAR.openRankedProfile();else e.context.SAR.openCombinedProfile();assert.match(e.ui.element('modalContent').innerHTML,/data-profile-metric="games"[\s\S]*?<strong>0<\/strong>/);
 const beforeRank=clone(SAVE.ranked),beforeXP=clone(SAVE.progression);e.dev.endMatch(match,mode==='deathmatch'?player.id:player.team,'time');
 const immediate=e.ui.element('modalContent').innerHTML;assert.equal(e.ui.element('modalContent').dataset.view,kind+'-profile');assert.match(immediate,/data-profile-metric="games"[\s\S]*?<strong>1<\/strong>/);assert.match(immediate,/data-profile-metric="accuracy"[\s\S]*?<strong>100\.0%<\/strong>/);assert.match(immediate,/data-profile-metric="kd"[\s\S]*?<strong>∞<\/strong>/);
 const result=e.context.SAR.getProfileStats({kind}),world=e.context.SAR.getUniverse();assert.equal(result.totals.games,1);assert.equal(result.totals.kills,1);assert.equal(result.totals.shots,9);assert.equal(result.totals.hits,9);
 assert.equal(world.progression.awards[match.matchId].stats.shots,9);assert.equal(world.progression.awards[match.matchId].stats.hits,9);XP.validate(world.progression);XP.validateRanked(world.ranked);
 if(mode!=='ranked-tdm')assert.deepEqual(world.ranked,beforeRank);assert.ok(world.progression.totalXPUnits>beforeXP.totalXPUnits);
 e.dev.endMatch(match,mode==='deathmatch'?enemy.id:1-player.team,'time');assert.deepEqual(e.context.SAR.getUniverse(),world,'repeated finalization leaves all progress intact');
 if(kind==='ranked')e.context.SAR.openRankedProfile();else e.context.SAR.openCombinedProfile();assert.equal(e.ui.element('modalContent').innerHTML,immediate,'reopen same tab uses same committed totals');
 const storage=Object.fromEntries(e.data),fresh=engine(storage,source);fresh.context.SARCloud={now:fresh.context.SARCloud.now,state:{account:{id,username:'Audit9RealFixture'},loaded:true,localMode:true}};assert.deepEqual(fresh.context.SAR.getProfileStats({kind}),result,'offline account restart restores unique participation view');
 results.push({mode,matchId:match.matchId,totals:result.totals,rankedDelta:world.ranked.participants[id]?.awards[match.matchId]?.appliedUnits||0,queued:queued.length});
 pass(mode+': actual body projectiles and HP removed; immediate open-tab refresh, 100% accuracy/∞ K/D, one receipt, repeat/reopen/offline restart');
}
fs.writeFileSync(path.join(output,'profile-runtime-results.json'),JSON.stringify({result:'PASS',checks,fixtures:fixture.expected,results,sourceHashes:{game:hash(source),progression:hash(fs.readFileSync(path.join(__dirname,'../progression.js'),'utf8')),projection:hash(fs.readFileSync(path.join(__dirname,'../profile-stats.js'),'utf8'))}},null,2));
console.log(JSON.stringify({ok:true,groups:checks.length}));
