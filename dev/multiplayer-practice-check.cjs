'use strict';
// Real shipped combat/time/respawn/finalization in synthetic RAM worlds only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__PRACTICE={restoreDeathmatchStats};window.SAR = {');
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(actual,expected,message)=>{for(const key of Object.keys(expected))assert(require('node:util').isDeepStrictEqual(actual[key],expected[key]),(message||'Practice changed protected data')+': '+key);};
function protectedStats(save){return copy({playerCareer:save.playerCareer,modeStats:save.modeStats,progression:save.progression,ranked:save.ranked,playerSeasons:save.playerSeasons,seasons:save.seasons,patchState:save.patchState,bots:Object.fromEntries(Object.entries(save.bots).map(([name,bot])=>[name,{career:bot.career,familiarity:bot.familiarity,recentForm:bot.recentForm,recentMatches:bot.recentMatches}]))});}
function offline(){const e=engine({},source);e.context.SARCloud.state={account:{id:'practice-owner'},loaded:true,localMode:true};e.context.SARMultiplayer={state:()=>({connected:false,background:{required:true,poolOwnerId:'practice-owner',ready:false,validUntil:0,grantedSlots:[]}})};return e;}
function exercise(e,match){
 const {state}=e.dev.inspect(),player=match.participants.find(a=>a.isPlayer),victim=match.participants.find(a=>a!==player&&a.team!==player.team);
 assert(player&&victim);match.status='active';match.limit=1000;
 for(const actor of state.actors){actor.dead=true;actor.respawnAt=1e12;}Object.assign(player,{dead:false,hp:250});Object.assign(victim,{dead:false,hp:250});
 const weapon=player.slots[0].name;assert.equal(e.dev.fire(player,0,e.dev.now()+1000),true);
 e.dev.applyDamage(victim,{owner:player,weapon,travel:150},250,true,e.dev.now()+1100);
 assert.equal(player.stats.kills,1);assert.equal(player.stats.damage,250);e.dev.respawnActor(victim,false);victim.dead=true;victim.respawnAt=1e12;
 for(let tick=0;tick<30;tick++)e.step();
 assert(player.stats.timeAlive>.9);assert(player.stats.timePlayed>.9);assert(player.matchWeaponStats[weapon].equippedTime>.9);assert(player.matchWeaponStats[weapon].picks>0);
 return {player,victim,weapon};
}
let groups=0;const pass=label=>{groups++;console.log('PASS '+label);};
{
 const e=offline(),{SAVE,state}=e.dev.inspect(),before=protectedStats(SAVE),match=e.dev.queueForMatch('tdm');
 assert.equal(match.eligible,false);assert.equal(match.practice,true);const {player}=exercise(e,match);
 assert.notEqual(player.career,SAVE.playerCareer);same(protectedStats(SAVE),before);
 e.dev.endMatch(match,player.team,'time');e.ui.flush();same(protectedStats(SAVE),before,'Practice completion must not add career games, seasons, XP/rating or Meta');
 for(const bot of match.participants){e.context.__PRACTICE.restoreDeathmatchStats(bot);assert.equal(bot.career,SAVE.bots[bot.name].career);assert.equal(bot.weaponUsage,SAVE.bots[bot.name].career.weaponUsage);assert.equal(bot.sandbox,false);assert.equal(bot.practiceBindings,undefined);}
 assert.equal(state.mode,'menu');pass('Offline TDM real firing, killing, respawn, equipped time, picks and completion stay disposable; canonical bot bindings restore');
}
{
 const e=offline(),{SAVE}=e.dev.inspect(),before=protectedStats(SAVE),match=e.context.SAR.startDeathmatch();assert.equal(match.eligible,false);
 const {player}=exercise(e,match);assert.notEqual(player.career,SAVE.modeStats.deathmatch.player);same(protectedStats(SAVE),before);
 e.dev.endMatch(match,player.id,'time');e.ui.flush();same(protectedStats(SAVE),before);
 pass('Offline Deathmatch does not mutate its lifetime career, raw weapon records, familiarity or completion telemetry');
}
{
 const e=offline(),{SAVE}=e.dev.inspect(),before=protectedStats(SAVE),names=SAVE.activeBotNames.slice(0,9),match=e.context.SAR.startCustomMatch({mode:'tdm',player:true,playerTeam:0,bots:names.map((name,index)=>({name,team:index<4?0:1}))});assert.equal(match.sessionType,'custom');assert.equal(match.eligible,false);
 const {player}=exercise(e,match);e.dev.endMatch(match,player.team,'time');e.ui.flush();same(protectedStats(SAVE),before);
 pass('Existing Custom real combat/time/result paths retain exact career, XP, Ranked, season and Meta exclusions');
}
{
 const e=engine({},source),{SAVE}=e.dev.inspect(),before=copy(SAVE.playerCareer),match=e.dev.queueForMatch('tdm');assert.equal(match.eligible,true);assert.equal(match.practice,undefined);
 const {player,weapon}=exercise(e,match);assert.equal(player.career,SAVE.playerCareer);assert(SAVE.playerCareer.timeAlive>before.timeAlive);assert(SAVE.playerCareer.timePlayed>before.timePlayed);assert(SAVE.playerCareer.weapons[weapon].equippedTime>before.weapons[weapon].equippedTime);assert(SAVE.playerCareer.weapons[weapon].picks>before.weapons[weapon].picks);assert(SAVE.playerCareer.kills>before.kills);
 e.dev.endMatch(match,player.team,'time');assert.equal(SAVE.playerCareer.games,before.games+1);assert.equal(match.xpAward.kind,'standard');e.ui.flush();
 pass('Eligible authoritative standard matches continue to record real raw career counters, one completion and existing XP');
}
console.log(groups+' practice isolation groups passed');
