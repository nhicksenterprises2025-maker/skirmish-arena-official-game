'use strict';
// Shipped scheduler, decisions, projectile collisions and resolved telemetry.
// No owner data, forced hits, synthetic results or shortened match rules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {engine}=require('./simulate.cjs'),TACTICS=require('../tactical-instinct.js');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8'),exposed=source.replace('window.SAR = {','window.__COVERAGE={PRIMARYS,SIDEARMS,botSelectionSample,botMetaContext,styleFitForWeapon,chooseBotPrimary,chooseBotSidearm,coverageState,underSampledWeaponBoost,recordCoveragePick};window.SAR = {');
const checks=[],evidence={},pass=name=>{checks.push(name);console.log('PASS '+name);},make=()=>engine({},exposed),copy=value=>JSON.parse(JSON.stringify(value));
{
 const e=make(),a=e.context.__COVERAGE,definitions=e.context.SAR.getWeapons(),bots=e.dev.inspect().state.actors.filter(b=>!b.isPlayer),primaries=Object.keys(definitions).filter(n=>definitions[n].type==='primary'),sidearms=Object.keys(definitions).filter(n=>definitions[n].type==='sidearm');
 assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');assert.deepEqual([...a.PRIMARYS],primaries);assert.deepEqual([...a.SIDEARMS],sidearms);assert.equal(primaries.length,12);assert.equal(sidearms.length,3);
 for(const bot of bots)for(const name of primaries)assert.ok(a.styleFitForWeapon(bot,name)>=.18&&Number.isFinite(a.styleFitForWeapon(bot,name)),bot.name+' '+name+' usable role fit');
 const before=copy(e.context.SAR.getUniverse());for(const bot of bots){const primary=a.chooseBotPrimary(bot,'life'),side=a.chooseBotSidearm(bot);assert.ok(primaries.includes(primary));assert.ok(sidearms.includes(side));}const after=e.context.SAR.getUniverse();
 assert.deepEqual(after.patchState.weaponStats,before.patchState.weaponStats);assert.deepEqual(after.patchArchives,before.patchArchives);assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.seasons,before.seasons);
 for(const name of Object.keys(before.bots)){assert.deepEqual(after.bots[name].profile,before.bots[name].profile);assert.deepEqual(after.bots[name].familiarity,before.bots[name].familiarity);assert.deepEqual(after.bots[name].career,before.bots[name].career);}
 pass('Registry-derived 12 primary / 3 sidearm pools and generic role fit preserve Balance9 fingerprint, Power, playstyles, familiarity, careers and archives');
}
{
 const e=make(),a=e.context.__COVERAGE,{SAVE}=e.dev.inspect(),samples=SAVE.patchState.participantAnalytics.samples[SAVE.aiRevision],name='FAL';
 samples.deathmatch.bot.meta[name].shots=17;samples.deathmatch.bot.meta[name].equippedTime=43;samples.deathmatch.bot.meta[name].damage=100;
 samples.tdm.bot.meta[name].shots=3;samples.tdm.bot.meta[name].equippedTime=8;
 samples.tdm.human.meta[name].shots=999999;SAVE.patchState.meta[name].shots=999999;SAVE.bots.Ace.career.weaponUsage[name].shots=999999;
 const original=copy(samples),sample=a.botSelectionSample();assert.equal(sample.meta[name].shots,20);assert.equal(sample.meta[name].equippedTime,51);assert.equal(sample.meta[name].damage,100);assert.deepEqual(samples,original,'Merged selection view never writes cohort records');
 const first=a.botMetaContext();samples.deathmatch.bot.meta[name].shots++;assert.equal(a.botMetaContext(),first,'same-tick candidates reuse shared context');e.ui.advance(1001);assert.equal(a.botMetaContext().rows.find(r=>r.m.name===name).m.shots,21,'one-second refresh observes real mode events');
 pass('Selection includes actual bot TDM + Deathmatch events, excludes human/lifetime/legacy evidence, keeps public mode samples separate, and caches assessment');
}
{
 const e=make(),a=e.context.__COVERAGE,counts=a.coverageState().counts;for(const n of Object.keys(counts))counts[n]=0;
 for(const name of [...a.PRIMARYS,...a.SIDEARMS]){
  const empty={m:e.dev.blankWeaponMeta(name)},ready={m:{...e.dev.blankWeaponMeta(name),shots:400,equippedTime:1800,kills:80}},phases=['DISCOVERY','DEVELOPING','STABLE'],boosts=phases.map(phase=>a.underSampledWeaponBoost(name,empty,phase,1));
  assert.ok(boosts[0]>boosts[1]&&boosts[1]>boosts[2]&&boosts[2]>1&&boosts[0]<=5);for(const phase of phases)assert.equal(a.underSampledWeaponBoost(name,ready,phase,1),1,'sufficient exposure retires extra pressure');
  assert.ok(a.underSampledWeaponBoost(name,empty,'DISCOVERY',.2)<boosts[0],'compatibility remains relevant');counts[name]=4;assert.ok(a.underSampledWeaponBoost(name,empty,'DISCOVERY',1)<boosts[0],'pending real loadouts bound duplicate batch exposure');counts[name]=0;
 }
 const base={confidence:1,score:80,awareness:.9,style:.7,familiarity:.2,personal:0,personalConfidence:0,surprise:0},strength=['DISCOVERY','DEVELOPING','STABLE'].map(phase=>TACTICS.weaponWeight({...base,phase})/TACTICS.weaponWeight({...base,phase,score:30}));assert.ok(strength[2]>strength[1]&&strength[1]>strength[0]);
 assert.ok(TACTICS.weaponWeight({...base,phase:'STABLE',familiarity:.9})>TACTICS.weaponWeight({...base,phase:'STABLE'}));
 evidence.phaseBoosts=['DISCOVERY','DEVELOPING','STABLE'].map(phase=>({phase,empty:a.underSampledWeaponBoost('FAL',{m:e.dev.blankWeaponMeta('FAL')},phase,1)}));
 pass('Bounded under-sampled probability fades with legitimate observations; Discovery > Developing > Stable; existing strength, compatibility and familiarity weights remain relevant');
}
{
 const e=make(),before=e.context.SAR.getWeapons(),profiles=copy(e.context.SAR.getProfiles()),start=performance.now(),cycles=[];let prior=0;
 for(let frame=0;frame<54000;frame++){
  e.step();const{SAVE,state}=e.dev.inspect(),cycle=Math.min(...[0,1,2,3].map(id=>(SAVE.matchSlots[id]?.generation||1)-1));
  if(cycle>prior){const sample=e.context.__COVERAGE.botSelectionSample();cycles.push({cycle,simulationSeconds:e.dev.now()/1000,modes:state.matches.slice(0,4).map(m=>m.mode),samples:Object.values(sample.meta).map(m=>({name:m.name,shots:m.shots,hits:m.hits,damage:m.damage,equippedSeconds:m.equippedTime}))});console.log('CYCLE '+cycle+' · '+Math.round(e.dev.now()/1000)+' simulated seconds');prior=cycle;}
  if(cycle>=4)break;
 }
 assert.ok(prior>=4,'Four unshortened normal scheduler cycles must finish');assert.deepEqual(e.context.SAR.getWeapons(),before);assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');assert.deepEqual(e.context.SAR.getProfiles(),profiles);
 const{state,SAVE}=e.dev.inspect(),samples=e.context.__COVERAGE.botSelectionSample(),definitions=e.context.SAR.getWeapons();assert.deepEqual(state.matches.slice(0,4).map(m=>m.mode),['tdm','tdm','deathmatch','deathmatch']);
 const rows=Object.values(samples.meta).map(m=>({name:m.name,type:definitions[m.name].type,shots:m.shots,hits:m.hits,damage:m.damage,equippedSeconds:m.equippedTime,rangeObservations:m.engagementDistanceN,kills:m.kills,deaths:m.deaths}));
 for(const row of rows){assert.ok(row.shots>=5,row.name+' actual firing');assert.ok(row.equippedSeconds>=3,row.name+' alive equipped exposure');assert.ok(row.rangeObservations>=5,row.name+' legitimate observed engagement range');assert.ok(row.hits>0&&row.damage>0,row.name+' actual projectile collision / HP removed');assert.ok(row.hits<=row.shots);}
 const primaryTimes=rows.filter(r=>r.type==='primary').map(r=>r.equippedSeconds);assert.ok(Math.max(...primaryTimes)>Math.min(...primaryTimes)*1.25,'Exploration does not force equal weapon usage');
 for(const mode of ['tdm','deathmatch'])assert.ok(SAVE.patchState.participantAnalytics.samples[SAVE.aiRevision][mode].bot.completedMatches>=8,'four full cycles for each mode');
 const active=state.actors.filter(a=>a.matchId!==null);assert.equal(new Set(active.map(a=>a.profile.id)).size,active.length,'persistent bot identities never double-book');
 evidence.cycles=cycles;evidence.final={cpuSeconds:(performance.now()-start)/1000,simulationSeconds:e.dev.now()/1000,rows,completedGames:samples.completedMatches,primaryUsageRatio:Math.max(...primaryTimes)/Math.min(...primaryTimes)};
 pass('Four real 2-TDM/2-DM match cycles produce genuine firing, hits, resolved damage, alive equipped time and range samples for every weapon including sidearms/FAL, with nonuniform usage and unchanged physics');
}
const report={ok:true,groups:checks.length,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),checks,evidence};
if(process.argv[2]){const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:true,groups:checks.length,completedGames:evidence.final.completedGames,cpuSeconds:Math.round(evidence.final.cpuSeconds),minimumShots:Math.min(...evidence.final.rows.map(r=>r.shots))}));
