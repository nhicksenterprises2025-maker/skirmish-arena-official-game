'use strict';
// Current Balance8 boundary/guard checks. Historical Balance7 is loaded only into
// isolated engine fixtures; this script never edits active constants or owner data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs'),{validateWorld}=require('../server/world.cjs');
const root=path.resolve(__dirname,'..'),rawSource=fs.readFileSync(path.join(root,'game.js'),'utf8'),source=rawSource.replace(/\r\n/g,'\n'),beforeDir=process.env.ARENA_REFINED_AUDIT4_BEFORE||path.join(os.homedir(),'OneDrive','Documents','ChatGPT','freeshui','arena-refined-audit-4','before');
const original=fs.readFileSync(path.join(beforeDir,'game.js'),'utf8').replace(/\r\n/g,'\n'),prior=require('./fixtures/balance-7.0.json'),current=require('./fixtures/balance-8.0.json');
const copy=value=>JSON.parse(JSON.stringify(value)),epoch=Date.parse('2026-10-07T16:00:00Z'),checks=[],pass=test=>{checks.push(test);console.log('PASS '+test);};
const exposed=text=>text.replace('window.SAR = {','window.__BOUNDARY={matchUsesCurrentBalance,makeWeaponState,updateBurst,registerPick,recordPatchEvent,recordParticipantEvent,recordParticipantCompletion,recordEngagementRange,updateOfficialSlots,waitForTournamentPool,matchRemainingMs};window.SAR = {');
function make(storage={},text=source,startAt=epoch){const clock={value:startAt},e=engine(storage,exposed(text),{wallNow:()=>clock.value});e.clock=clock;e.advance=(ms)=>{clock.value+=ms;};e.tick=(dt=1/30)=>{e.advance(dt*1000);e.step(dt);};return e;}
function snapshot(text=source){const e=make({},text);return {e,world:e.context.SAR.getUniverse()};}
const base=make();assert.deepEqual(base.context.SAR.getWeapons(),current.weapons);assert.equal(base.dev.balanceFingerprint(),'b-b9bdf00b');assert.equal(base.context.SAR.getUniverse().patchState.balanceVersion,'8.0');assert.equal(base.context.SAR.getVersion().version,'1.12.1');assert.equal(Object.keys(base.context.SAR.getWeapons()).length,14);
pass('Active configuration remains the exact14-weapon Balance8 fixture with separate application1.12.1 identity');

{
 const clockA={value:epoch},clockB={value:epoch},before=engine({},original,{wallNow:()=>clockA.value}),after=make();
 for(let tick=0;tick<600;tick++){clockA.value+=1000/30;before.step();after.tick();}
 const a=before.context.SAR.getUniverse(),b=after.context.SAR.getUniverse();for(const slot of Object.values(b.matchSlots))delete slot.balanceFingerprint;
 assert.deepEqual(b,a,'guard additions do not change a valid20-second seeded combat/save');
 assert.ok(Object.values(b.patchState.meta).reduce((n,w)=>n+w.shots,0)>0);assert.ok(Object.values(b.modeStats.deathmatch.meta).reduce((n,w)=>n+w.shots,0)>0);
 pass('Twenty seconds of actual current-config AI/projectiles produce identical complete saved progress against the captured pre-audit source');
}

// Faithful historical constants, with the existing firing model, isolated in RAM.
let historical=original;const start=historical.indexOf('const WEAPONS = '),end=historical.indexOf('const PRIMARYS',start);historical=historical.slice(0,start)+'const WEAPONS = '+JSON.stringify(prior.weapons)+';\n'+historical.slice(end);historical=historical.replace('const WEAPON_PATCH_NOTES = [','const WEAPON_PATCH_NOTES = [{version:"WEAPON BALANCE UPDATE 7.0",date:"OCTOBER 1, 2026",title:"META REWORK / AUG TUNING",changes:[]},');
const oldClock={value:epoch},oldEngine=engine({},historical,{wallNow:()=>oldClock.value});assert.equal(oldEngine.dev.balanceFingerprint(),prior.fingerprint);assert.deepEqual(oldEngine.context.SAR.getWeapons(),prior.weapons);
for(let tick=0;tick<300;tick++){oldClock.value+=1000/30;oldEngine.step();}
oldEngine.context.SARCloud.state={account:{id:'audit-boundary-fixture',username:'AuditBoundaryFixture'}};oldEngine.dev.queueForMatch();const humanMatch=oldEngine.dev.inspect().state.matches.find(m=>m?.hasPlayer),human=humanMatch.participants.find(a=>a.isPlayer);humanMatch.status='active';oldEngine.dev.fire(human,0,10000);oldEngine.dev.endMatch(humanMatch,human.team,'time');oldEngine.ui.flush();
const oldState=oldEngine.dev.inspect().state;for(const match of oldState.matches.slice(0,3))if(match.status==='active')oldEngine.dev.endMatch(match,match.mode==='tdm'?0:null,'time');
const old=oldEngine.context.SAR.getUniverse();old.matchSlots[2]={...old.matchSlots[2],phase:'waiting',resumeStatus:'cooldown'};old.futureWallet={balanceUnits:71999,orders:['retain']};const previous=copy(old),normalized=base.dev.normalizeSave(old),oldPatch=previous.patchState;
{
 assert.equal(normalized.patchArchives.length,previous.patchArchives.length+1);assert.deepEqual(normalized.patchArchives.slice(0,-1),previous.patchArchives);
 const archive=normalized.patchArchives.at(-1);for(const key of Object.keys(oldPatch).filter(key=>key!=='reason'))assert.deepEqual(archive[key],oldPatch[key],'complete prior archive '+key);
 assert.equal(normalized.patchState.balanceVersion,'8.0');assert.equal(normalized.patchState.fingerprint,current.fingerprint);assert.equal(normalized.patchState.generation,oldPatch.generation+1);
 for(const [name,row]of Object.entries(normalized.patchState.meta))assert.deepEqual(row,base.dev.blankWeaponMeta(name));
 for(const key of ['bots','playerCareer','seasons','playerSeasons','progression','ranked','modeStats','tournamentHistory','futureWallet','config'])assert.deepEqual(normalized[key],previous[key],key+' remains intact');
 assert.ok(normalized.progression.totalXPUnits>0,'fixture includes real prior human XP');
 const changes=[];for(const [name,row]of Object.entries(base.dev.balanceSnapshot()))for(const [field,value]of Object.entries(row))if(oldPatch.weaponStats[name]?.[field]!==value)changes.push({weapon:name,field,before:oldPatch.weaponStats[name]?.[field]??null,after:value});assert.deepEqual(normalized.balancePatchHistory.at(-1).changes,copy(changes));
 const again=base.dev.normalizeSave(normalized);assert.equal(again.patchArchives.length,normalized.patchArchives.length);assert.equal(again.balancePatchHistory.length,normalized.balancePatchHistory.length);assert.equal(again.patchState.id,normalized.patchState.id);
 for(const id of [0,1,2])assert.deepEqual(normalized.matchSlots[id],{...previous.matchSlots[id],balanceFingerprint:oldPatch.fingerprint},'ordinary and suspended finished cooldown is preserved');
 const unfinished=normalized.matchSlots[3];assert.equal(unfinished.phase,'pending');assert.equal(unfinished.previousMatchId,previous.matchSlots[3].matchId);assert.equal(unfinished.matchId,undefined);assert.equal(unfinished.balanceFingerprint,current.fingerprint);
 pass('Real historical combat/XP archives completely once, all permanent scopes survive, only unfinished IDs invalidate, and ordinary/suspended cooldowns preserve their exact result identity/deadline');
}

{
 const accounts=JSON.stringify({fixture:{hash:'retained',salt:'retained'}}),cold=make({'sar-persistent-save':JSON.stringify(normalized),'sar-local-accounts-v1':accounts},source,oldClock.value+1000),{state,SAVE}=cold.dev.inspect();
 assert.equal(cold.data.get('sar-local-accounts-v1'),accounts);assert.deepEqual(SAVE.progression,previous.progression);assert.equal(SAVE.patchArchives.length,normalized.patchArchives.length);assert.equal(SAVE.patchState.id,normalized.patchState.id);
 assert.notEqual(state.matches[3].matchId,previous.matchSlots[3].matchId);assert.equal(state.matches[3].balanceFingerprint,current.fingerprint);assert.equal(SAVE.matchSlots[3].generation,previous.matchSlots[3].generation+1);
 for(const id of [0,1,2]){assert.equal(state.matches[id].status,'cooldown');assert.equal(state.matches[id].matchId,previous.matchSlots[id].matchId);assert.equal(state.matches[id].balanceFingerprint,prior.fingerprint);assert.equal(state.matches[id].cooldownUntil,previous.matchSlots[id].readyAt);}
 const deadline=previous.matchSlots[2].readyAt;cold.clock.value=deadline-1;cold.context.__BOUNDARY.updateOfficialSlots();assert.equal(state.matches[2].matchId,previous.matchSlots[2].matchId);assert.equal(state.matches[2].status,'cooldown');cold.advance(1);cold.context.__BOUNDARY.updateOfficialSlots();const fresh=state.matches[2];assert.equal(fresh.status,'active');assert.notEqual(fresh.matchId,previous.matchSlots[2].matchId);assert.equal(fresh.balanceFingerprint,current.fingerprint);assert.equal(SAVE.matchSlots[2].generation,previous.matchSlots[2].generation+1);cold.context.__BOUNDARY.updateOfficialSlots();assert.equal(state.matches[2].matchId,fresh.matchId,'one deadline consumes one replacement');
 pass('Reload uses fresh current-config identities for unfinished matches, retains historical cooldown fingerprints, and advances each completed/suspended cooldown once at its original deadline');
}

{
 const f=make(),d=f.context.__BOUNDARY,{state,SAVE}=f.dev.inspect(),match=state.matches[0],owner=match.participants[0],victim=match.participants.find(a=>a.team!==owner.team);
 for(const other of state.matches)if(other!==match)other.status='ended';owner.slots[0]=d.makeWeaponState('SR-Aug');owner.currentSlot=0;owner.dead=false;state.projectiles=[];assert.equal(f.dev.fire(owner,0,10000),true);assert.ok(owner.slots[0].pendingBurst);const before=f.context.SAR.getUniverse(),ownerCareer=copy(owner.career),ownerStats=copy(owner.stats),hp=victim.hp,ammo=owner.slots[0].ammo;
 match.balanceFingerprint=prior.fingerprint;assert.equal(d.matchUsesCurrentBalance(match),false);assert.equal(f.dev.fire(owner,0,20000),false);d.updateBurst(owner,10130);assert.equal(owner.slots[0].pendingBurst,null);assert.equal(owner.slots[0].ammo,ammo);f.dev.updateProjectiles(.14,10200);assert.equal(state.projectiles.length,0);
 d.registerPick(owner);f.dev.recordEquipped(owner,1);d.recordPatchEvent(owner,owner.slots[0].name,'shots',1);d.recordParticipantEvent(owner,owner.slots[0].name,'shots',1);d.recordParticipantCompletion(match,match.participants);d.recordEngagementRange(owner,0,owner.slots[0].name,20000);f.dev.applyDamage(victim,{owner,weapon:owner.slots[0].name,travel:70},250,true,20000);assert.equal(victim.hp,hp);f.dev.endMatch(match,0,'time');
 match.startedAt=f.dev.now()-match.durationMs;f.tick();assert.equal(match.status,'active','defensive mismatch remains frozen pending reload');assert.equal(match.result,undefined);assert.deepEqual(owner.career,ownerCareer);assert.deepEqual(owner.stats,ownerStats);assert.deepEqual(f.context.SAR.getUniverse(),before,'no mismatched career, XP, season, sample, completion or equipped time writes');
 // Normal pages keep one immutable configuration. A reload rehydrates this
 // defensive frozen slot under current constants rather than inventing a result.
 const staleSave=f.context.SAR.getUniverse();staleSave.matchSlots[0].balanceFingerprint=prior.fingerprint;const restarted=make({'sar-persistent-save':JSON.stringify(staleSave)},source,f.clock.value+1000);assert.equal(restarted.dev.inspect().state.matches[0].balanceFingerprint,current.fingerprint);assert.notEqual(restarted.dev.inspect().state.matches[0].matchId,match.matchId);assert.equal(restarted.context.SAR.getUniverse().patchArchives.length,staleSave.patchArchives.length);
 pass('Defensive stale matches cannot fire, resolve damage/pending rounds, accrue career time, write telemetry or finalize; they freeze until reload, which creates a valid identity without fabricated results');
}

{
 const f=make(),d=f.context.__BOUNDARY,{state,SAVE}=f.dev.inspect(),match=state.matches[0],owner=match.participants[0];SAVE.patchState.generation++;SAVE.patchState.id=SAVE.patchState.fingerprint+'-'+SAVE.patchState.generation;assert.equal(d.matchUsesCurrentBalance(match),true);assert.equal(f.dev.fire(owner,0,10000),true,'same constants remain usable when only manual sample generation changes');
 const legacy=base.context.SAR.getUniverse();for(const slot of Object.values(legacy.matchSlots))delete slot.balanceFingerprint;const reloaded=make({'sar-persistent-save':JSON.stringify(legacy)},source,oldClock.value+1000);for(const [id,slot]of Object.entries(legacy.matchSlots)){assert.equal(reloaded.dev.inspect().state.matches[id].matchId,slot.matchId);assert.equal(reloaded.dev.inspect().SAVE.matchSlots[id].generation,slot.generation);assert.equal(reloaded.dev.inspect().state.matches[id].balanceFingerprint,current.fingerprint);}
 pass('Fingerprint guards preserve compatible same-config manual generations and legacy slot restoration');
}

{
 assert.throws(()=>validateWorld(previous),/balance/i,'a fresh arbitrary old configuration is rejected');validateWorld(previous,{save:previous});validateWorld(normalized,{save:previous});assert.throws(()=>validateWorld(previous,{save:normalized}),/balance/i,'after migration an old client cannot write against the new account patch');
 pass('Server accepts only the exact persisted old account checkpoint before migration, validates one complete forward archive, and rejects old-client writes once that account activates the new patch');
}

const report={result:'PASS',sourceHash:crypto.createHash('sha256').update(rawSource).digest('hex'),normalizedSourceHash:crypto.createHash('sha256').update(source).digest('hex'),balanceVersion:'8.0',fingerprint:current.fingerprint,priorFingerprint:prior.fingerprint,appVersion:'1.12.1',limits:['Synthetic engine fixtures and graphics/DOM stubs; no owner data writes.','A defensive impossible-in-normal-page fingerprint mismatch freezes until reload; this test does not implement hot activation.','Balance9 activation and full new-weapon acceptance remain pending the user-supplied FAL PreferredWorld.'],checks};fs.writeFileSync(path.join(__dirname,'arena-refined-balance-boundary-results.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS '+checks.length+' groups');
