'use strict';
// Isolated worlds exercise the shipped allocator and resolved combat hooks.
// No live account or installed save is opened by this check.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs'),XP=require('../progression.js');
const clone=value=>JSON.parse(JSON.stringify(value)),checks=[];
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__BLUE_TEST={commitMatchXP,commitMatchRanked,renderPlayerProfile};window.SAR = {');
function fresh(world){return engine(world?{'sar-persistent-save':JSON.stringify(world)}:{},source);}
function pass(label){checks.push(label);console.log('PASS '+label);}
function activate(e,match){match.status='active';for(const actor of e.dev.inspect().state.actors){actor.spawnFlash=0;actor.dead=false;}return match;}
function ranked(e){e.context.SAR.startRanked();const m=e.dev.inspect().state.matches.find(row=>row?.hasPlayer);assert.ok(m,'Ranked allocator supplies a player match');activate(e,m);return {m,p:m.participants.find(a=>a.isPlayer)};}
function id(actor){return actor.participantId||(actor.isPlayer?'local-player':actor.profile.id);}
function noDoubleBooking(e){const seen=new Map();for(const m of e.dev.inspect().state.matches){if(!m||!['active','countdown','cooldown'].includes(m.status)||m.sessionType==='custom'||m.context?.tournamentKind==='custom')continue;for(const actor of m.participants){const key=id(actor);assert.ok(!seen.has(key),key+' is booked in slots '+seen.get(key)+' and '+m.id);seen.set(key,m.id);}}}
function kill(e,m,killer,victim,{head=false,amount=250}={}){if(victim.dead)e.dev.respawnActor(victim);victim.spawnFlash=0;e.dev.applyDamage(victim,{owner:killer,weapon:killer.slots[0].name,travel:1},amount,head,10000+m.score.reduce((a,b)=>a+b,0)*1000);}
function winByScore(e,m,p){const team=p.team,target=m.participants.find(a=>a.team!==team);while(m.status==='active')kill(e,m,p,target);e.ui.flush();assert.equal(m.score[team],60);assert.equal(m.result.reason,'score');return target;}
function rewards(world){return clone({progression:world.progression,ranked:world.ranked,rankedResults:world.rankedResults});}
function officialContext(e,kind='official',hasPlayer=true){const ids=Object.values(e.context.SAR.getProfiles()).slice(0,hasPlayer?9:10).map(p=>({kind:'bot',id:p.id}));if(hasPlayer)ids.unshift({kind:'user',id:'local-player'});return {mode:'tdm',sessionType:'tournament',tournamentKind:kind,tournamentId:'fixture:'+kind,seriesId:'fixture:series',gameId:'fixture:game:'+kind,teamIds:['fixture:blue','fixture:red'],teams:[{participants:ids.slice(0,5)},{participants:ids.slice(5)}],hasPlayer};}

{
 const e=fresh(),initial=e.context.SAR.getUniverse(),{m,p}=ranked(e),participantIds=m.participants.map(id);
 assert.equal(m.mode,'tdm');assert.equal(m.limit,60);assert.equal(m.durationMs,300000);assert.equal(m.balanceFingerprint,'b-b9bdf00b');assert.equal(new Set(participantIds).size,10);assert.equal(m.participants.filter(a=>a.isPlayer).length,1);noDoubleBooking(e);
 const beforeProfiles=clone(initial.bots),weapon=p.slots[0].name;
 e.dev.fire(p,0,10000);e.dev.tryDash(p,1,0,10000);assert.equal(p.xpEvents.dashes,1);
 const loser=winByScore(e,m,p),world=e.context.SAR.getUniverse(),humanId=id(p),record=world.ranked.participants[humanId],receipt=record.awards[m.matchId],xp=world.progression.awards[m.matchId];
 assert.ok(Object.isFrozen(m.result));assert.ok(Object.isFrozen(m.result.rows));assert.equal(Object.keys(world.ranked.participants).length,10);
 assert.equal(xp.units,48520,'60 solo kills, first use, dash and highest milestones award exact XP');assert.equal(receipt.appliedUnits,23010);assert.equal(receipt.transactionKey,JSON.stringify([humanId,m.matchId,'ranked']));assert.equal(xp.transactionKey,JSON.stringify([humanId,m.matchId,'xp']));assert.deepEqual(xp.firstWeapons,[weapon]);
 assert.equal(world.ranked.participants[id(loser)].ratingUnits,0);assert.ok(world.ranked.participants[id(loser)].awards[m.matchId].calculatedUnits<0);assert.equal(world.ranked.participants[id(loser)].awards[m.matchId].appliedUnits,0);
 for(const bot of m.result.rows.filter(row=>!row.isPlayer&&row.team===m.result.rows.find(row=>row.isPlayer).team)){const br=world.ranked.participants[bot.participantId].awards[m.matchId];assert.equal(br.appliedUnits,1000,'Equal winning inputs use same rule regardless of Power');}
 for(const [name,bot] of Object.entries(world.bots))assert.equal(bot.profile.power,beforeProfiles[name].profile.power);
 XP.validate(world.progression);XP.validateRanked(world.ranked);
 assert.equal(e.context.SAR.getProgressionSummary().xp.totalXPUnits,xp.units);assert.equal(e.context.SAR.getProgressionSummary().ranked.ratingUnits,23010);assert.equal(e.context.SAR.getRewardBreakdown(m.matchId).ranked.appliedUnits,23010);
 const fixed=rewards(world);p.stats.kills=0;p.xpEvents.soloKills=0;e.dev.endMatch(m,1-p.team);e.context.__BLUE_TEST.commitMatchXP(m);e.context.__BLUE_TEST.commitMatchRanked(m);e.context.SAR.openPlayerProfile();assert.deepEqual(rewards(e.context.SAR.getUniverse()),fixed);assert.match(e.ui.element('modalContent').innerHTML,/LIFETIME XP/);const rankedProfile=e.ui.element('modalContent').innerHTML.split('class="profile-ranked"')[1].split('</section>')[0];assert.match(rankedProfile,/<strong>Beginner III<\/strong>/);assert.match(rankedProfile,/<span>230\.1 ELO<\/span>/);
 const restarted=fresh(world);assert.deepEqual(rewards(restarted.context.SAR.getUniverse()),fixed);assert.equal(restarted.context.SAR.getProgressionSummary().ranked.ratingUnits,23010);noDoubleBooking(restarted);
 pass('Ranked allocator, canonical identity, real 60-kill finalization, human/bot exact rewards, zero floor, immutable retry, Profile and restart');
}

{
 const e=fresh(),{m,p}=ranked(e),bot=m.participants.find(a=>!a.isPlayer&&a.team===p.team),enemy=m.participants.find(a=>a.team!==p.team);
 e.dev.fire(bot,0,10000);e.dev.tryDash(bot,1,0,10000);kill(e,m,bot,enemy,{head:true});
 assert.equal(bot.stats.headshots,1);assert.equal(bot.xpEvents.soloKills,1);assert.equal(bot.xpEvents.dashes,1);assert.deepEqual(bot.xpEvents.usedWeapons,[bot.slots[0].name]);
 e.dev.endMatch(m,p.team,'time');const receipt=e.context.SAR.getUniverse().ranked.participants[id(bot)].awards[m.matchId],lines=e.context.SAR.getRewardBreakdown(m.matchId,id(bot)).ranked.lines;
 assert.equal(receipt.stats.headshots,1);assert.equal(receipt.events.soloKills,1);assert.equal(lines.find(line=>line.key==='solo').units,150);assert.equal(lines.find(line=>line.key==='dash').units,10);assert.ok(!lines.some(line=>line.key.startsWith('weapon:')));
 pass('Bots record real fire/dash/physical lethal-head events and share the exact ELO schedule without first-use ELO');
}

{
 for(const mode of ['tdm','deathmatch']){const e=fresh(),before=e.context.SAR.getUniverse();if(mode==='tdm')e.dev.queueForMatch();else e.context.SAR.startDeathmatch();const m=activate(e,e.dev.inspect().state.matches.find(row=>row?.hasPlayer)),p=m.participants.find(a=>a.isPlayer);e.dev.endMatch(m,mode==='tdm'?p.team:p.id,'time');assert.ok(e.context.SAR.getUniverse().progression.totalXPUnits>0);assert.deepEqual(e.context.SAR.getUniverse().ranked,before.ranked);}
 for(const mode of ['tdm','deathmatch']){const e=fresh(),before=e.context.SAR.getUniverse(),m=activate(e,e.context.SAR.startCustomMatch({mode,bots:[]})),p=m.participants.find(a=>a.isPlayer);e.dev.fire(p,0,10000);e.dev.tryDash(p,1,0,10000);e.dev.endMatch(m,mode==='tdm'?p.team:p.id,'time');const after=e.context.SAR.getUniverse();assert.deepEqual(rewards(after),rewards(before));assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.bots,before.bots);}
 pass('Standard TDM/Deathmatch grant XP only; custom/practice preserve XP, ranked, first-use sets, careers and familiarity');
}

{
 for(const kind of ['official','custom']){const e=fresh(),before=e.context.SAR.getUniverse(),m=activate(e,e.context.SAR.startTournamentGame(officialContext(e,kind))),p=m.participants.find(a=>a.isPlayer);if(kind==='official')noDoubleBooking(e);const allocated=e.context.SAR.getUniverse();e.dev.fire(p,0,10000);e.dev.tryDash(p,1,0,10000);e.dev.endMatch(m,p.team,'time');e.ui.flush();const after=e.context.SAR.getUniverse();assert.deepEqual(after.ranked,before.ranked);assert.deepEqual(after.playerCareer,before.playerCareer);assert.deepEqual(after.bots,allocated.bots);if(kind==='official'){const receipt=after.progression.awards[m.matchId];assert.equal(receipt.units,Math.round(receipt.baseUnits*13/10));assert.equal(receipt.events.dashes,1);noDoubleBooking(e);const state=e.dev.inspect().state;assert.equal(state.actors.filter(a=>!a.isPlayer&&!a.sandbox).length,50);assert.equal(state.idleBots.length,10);}else assert.deepEqual(rewards(after),rewards(before));}
 pass('Official tournament reservations release once, multiply XP once and keep ELO/careers separate; custom tournament consumes no rewards');
}

{
 for(const release of ['cancel','abandon']){const e=fresh(),before=e.context.SAR.getUniverse(),slots=e.dev.inspect().state.matches.slice(0,4).map(m=>({matchId:m.matchId,score:clone(m.score),startedAt:m.startedAt})),m=e.context.SAR.startTournamentGame(officialContext(e));
  noDoubleBooking(e);for(const [index,saved] of slots.entries()){const current=e.dev.inspect().state.matches[index];assert.equal(current.matchId,saved.matchId);assert.deepEqual(current.score,saved.score);assert.equal(current.startedAt,saved.startedAt);}
  if(release==='cancel'){assert.equal(e.context.SAR.cancelTournament(m.context.tournamentId),true);assert.equal(e.context.SAR.cancelTournament(m.context.tournamentId),false);}else{e.dev.exitGame();e.dev.exitGame();}
  const state=e.dev.inspect().state;assert.equal(state.idleBots.length,10);assert.equal(new Set(state.idleBots.map(id)).size,10);assert.equal(state.actors.filter(a=>!a.isPlayer&&!a.sandbox).length,50);assert.ok(state.actors.every(a=>!a.officialReservation));assert.deepEqual(rewards(e.context.SAR.getUniverse()),rewards(before));noDoubleBooking(e);
 }
 const e=fresh(),{m}=ranked(e),before=e.context.SAR.getState();assert.throws(()=>e.context.SAR.startTournamentGame(officialContext(e)),/current game|reserved/);assert.deepEqual(e.context.SAR.getState(),before);assert.equal(m.status,'active');
 pass('Tournament reserve preserves casual clocks/scores; cancel/abandon release once and an active Ranked game cannot be preempted');
}

console.log(JSON.stringify({ok:true,groups:checks.length}));
