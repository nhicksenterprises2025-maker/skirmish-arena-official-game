'use strict';
const assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const {load,event,settle}=require('./tournaments-ui-check.cjs');
const checks=[];const pass=name=>{checks.push(name);console.log('PASS '+name);};
(async()=>{
 let wall=1900000000000,commits=0,pending;
 const e=engine({},undefined,{wallNow:()=>wall});e.context.SARCloud.state={account:{id:'scheduled-owner',username:'Fixture'}};e.context.SARCloud.commitMatch=()=>commits++;
 const bots=Object.values(e.context.SAR.getProfiles()).slice(0,9).map(p=>({id:p.id,name:p.name,kind:'bot'})),people=[{id:'scheduled-owner',kind:'user',name:'Fixture'},...bots];
 const context={tournamentId:'scheduled-cup',tournamentKind:'official',seriesId:'scheduled-QF0',gameId:'scheduled-QF0:game1',teamIds:['a','b'],userId:'scheduled-owner',hasPlayer:true,teams:[{id:'a',name:'Alpha',participants:people.slice(0,5)},{id:'b',name:'Bravo',participants:people.slice(5)}],schedule:{countdownAt:wall,matchStartAt:wall+3000}};
 const match=e.context.SAR.startTournamentGame(context);for(const other of e.dev.inspect().state.matches)if(other&&other!==match)other.status='ended';wall+=3000;e.step(3);
 const player=match.participants[0];Object.assign(player.stats,{kills:7,deaths:3,assists:2,damage:420,headshots:1,shots:25,hits:15,timeAlive:100});match.score=[60,30];
 const before=JSON.stringify(e.context.SAR.getProgression());e.context.SARTournaments={onResult:(context,result,rewardSnapshot)=>{pending={context,result,rewardSnapshot};}};
 e.dev.endMatch(match,0,'score');e.ui.flush();assert.equal(JSON.stringify(e.context.SAR.getProgression()),before);assert.equal(commits,0);assert.equal(pending.result.xp,null);assert.ok(Object.isFrozen(pending.rewardSnapshot));pass('A completed scheduled official game retains immutable performance and awards no XP before acknowledgement');
 const canonical={...structuredClone(pending.result),seriesId:context.seriesId},tournament=event({id:context.tournamentId,kind:'official',status:'ACTIVE',teams:context.teams,series:[{id:context.seriesId,round:'QF',requiredGames:3,teamIds:context.teamIds,games:[canonical]}]});
 await assert.rejects(()=>e.context.SAR.acceptTournamentXP(context,{...canonical,stats:canonical.stats.map((r,i)=>i? r:{...r,kills:r.kills+1})},pending.rewardSnapshot),/performance/);
 await assert.rejects(()=>e.context.SAR.acceptTournamentXP({...context,userId:'foreign'},canonical,pending.rewardSnapshot),/reward/);assert.equal(JSON.stringify(e.context.SAR.getProgression()),before);pass('Account, game identity and authoritative player statistics must match the saved reward snapshot');
 const ui=await load([tournament]);ui.window.SARCloud.state.account=e.context.SARCloud.state.account;ui.window.SAR.acceptTournamentXP=e.context.SAR.acceptTournamentXP;const key='sar.tournament.pending.scheduled-owner';let answer='network';
 ui.window.SARCloud.api=async(path)=>{if(path.endsWith('/result')){if(answer==='network')throw Error('Connection unavailable');if(answer==='cancelled')throw Object.assign(Error('This event was cancelled'),{status:409});if(answer==='missing')throw Object.assign(Error('Unavailable event'),{status:404});if(answer==='mismatch')return {tournament:{...tournament,series:[{...tournament.series[0],games:[{...canonical,winnerTeamId:'b'}]}]}};}return {tournament,tournaments:[tournament],earnings:[],stats:[]};};
 const deliver=async()=>{ui.window.SARTournaments.onResult(pending.context,pending.result,pending.rewardSnapshot);await settle();await settle();};
 for(const state of ['network','cancelled','missing','mismatch']){answer=state;await deliver();assert.equal(JSON.stringify(e.context.SAR.getProgression()),before);assert.ok(ui.store.has(key));assert.deepEqual(JSON.parse(ui.store.get(key)).rewardSnapshot,pending.rewardSnapshot);}
 pass('No acknowledgement, cancelled/missing events and a mismatched canonical receipt preserve the result without XP');
 answer='accepted';await deliver();const after=e.context.SAR.getProgression();assert.ok(after.totalXP>0);assert.equal(commits,1);assert.ok(!ui.store.has(key));assert.ok(ui.window.SARTournaments.getState().lastXP.receipt);const total=e.dev.inspect().SAVE.progression.totalXPUnits;
 await deliver();assert.equal(e.dev.inspect().SAVE.progression.totalXPUnits,total);assert.equal(commits,1);assert.ok(!ui.store.has(key));pass('Exact canonical acknowledgement applies the unchanged official XP formula once across repeated delivery');
 const reopened=engine(Object.fromEntries(e.data),undefined,{wallNow:()=>wall});reopened.context.SARCloud.state=e.context.SARCloud.state;ui.window.SAR.acceptTournamentXP=reopened.context.SAR.acceptTournamentXP;await deliver();assert.equal(reopened.dev.inspect().SAVE.progression.totalXPUnits,total);assert.equal(Object.keys(reopened.dev.inspect().SAVE.progression.awards).length,1);pass('Persisted receipts survive restart and acknowledge a saved retry without duplicating XP');
 console.log(checks.length+' scheduled XP acknowledgement acceptance groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
