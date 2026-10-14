'use strict';
// Exercises the shipped view helpers with synthetic authoritative records; it
// never saves these fixtures or advances gameplay/progression.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.__NETWORK_VIEWS={bot:displayedBotData,sample:displayedParticipantSample,career:displayPlayerCareer};})();'),e=engine({},source),save=e.dev.inspect().SAVE,copy=x=>JSON.parse(JSON.stringify(x));
let network={};e.context.SARMultiplayer={state:()=>network};const name=Object.keys(save.bots)[0],bot=save.bots[name],weapon='FAL';bot.career.kills=100;bot.career.games=20;bot.career.weaponUsage[weapon]={k:10,d:3,shots:40,hits:20,equippedTime:80};bot.familiarity[weapon]=40;bot.recentForm=2;
const prior=JSON.stringify(save),delta={career:{games:40,wins:20,losses:20,kills:200,deaths:80,damage:10000,weaponUsage:{[weapon]:{k:200,d:80,shots:300,hits:150,equippedTime:400}}},deathmatchCareer:{games:2,kills:10,deaths:4,weaponUsage:{}},familiarity:{[weapon]:.25},form:{multiplier:.76,offset:1},recentMatches:[{matchId:'network:bot:1',at:Date.now(),won:true,kills:5,deaths:2,assists:1,damage:1000,primary:weapon}]};
network.botProgression={authoritative:true,bots:{[name]:{sourceBotId:bot.profile.id,network:delta}}};
let view=e.context.__NETWORK_VIEWS.bot(name);assert.equal(view.career.kills,300);assert.equal(view.career.games,60);assert.equal(view.career.weaponUsage.FAL.k,210);assert.equal(view.familiarity.FAL,55);assert.equal(view.recentForm,2*.76+1);assert.equal(view.deathmatchCareer.kills,10);assert.equal(JSON.stringify(save),prior);assert.equal(e.context.SAR.botLeaderboardRows({mode:'tdm'}).find(row=>row.name===name).kills,300);
assert.equal(e.context.__NETWORK_VIEWS.bot(name).career.kills,300);bot.career.kills+=7;assert.equal(e.context.__NETWORK_VIEWS.bot(name).career.kills,307);bot.career.kills-=7;
console.log('PASS bot views add all network results once, preserve newer local growth/familiarity and never mutate saved data');
network.botProgression.bots[name].sourceBotId='unrelated-bot';assert.equal(e.context.__NETWORK_VIEWS.bot(name),bot);network.botProgression.bots[name].sourceBotId=bot.profile.id;
console.log('PASS bot identity mismatches cannot apply another competitor’s records');
const revision=e.context.SARTactics.revision,base=save.patchState.participantAnalytics.samples[revision].tdm.bot,sample={aiRevision:revision,rulesetRevision:base.rulesetRevision,distanceProvenance:copy(base.distanceProvenance),completedMatches:2,meta:{FAL:{name:weapon,kills:4,shots:10,hits:6}},perBot:{[name]:{FAL:{kills:4,shots:10,hits:6}}}};
// The world sample’s ruleset is owned by the current patch rather than a camera.
sample.rulesetRevision=save.patchState.rulesetRevision;
const key=JSON.stringify([sample.aiRevision,sample.rulesetRevision,sample.distanceProvenance]);network.botProgression.balanceMeta={[save.patchState.fingerprint]:{byMode:{tdm:{cohorts:{[key]:sample}}}}};
const projected=e.context.__NETWORK_VIEWS.sample('bot','tdm');assert.equal(projected.meta.FAL.kills,base.meta.FAL.kills+4);assert.equal(projected.completedMatches,base.completedMatches+2);assert.equal(projected.participants[bot.profile.id].meta.FAL.kills,4);assert.equal(JSON.stringify(save),prior);
sample.aiRevision='different-ai';assert.equal(e.context.__NETWORK_VIEWS.sample('bot','tdm'),base);
console.log('PASS displayed weapon tables/detail samples match the exact balance, AI/ruleset and unit provenance');
network.progression={participantId:'local-player',records:[{authority:'server-multiplayer',participantId:'local-player',matchId:'network:human:tdm',mode:'tdm',sessionType:'standard',eligible:true,completed:true,won:true,at:Date.now(),stats:{kills:5,deaths:2,shots:10,hits:6},weaponStats:{FAL:{k:5,d:2,shots:10,hits:6,picks:1,equippedTime:20}}}]};
const career=e.context.__NETWORK_VIEWS.career('tdm');assert.equal(career.kills,save.playerCareer.kills+5);assert.equal(career.shots,save.playerCareer.shots+10);assert.equal(career.weapons.FAL.k,5);assert.equal(JSON.stringify(save),prior);
console.log('PASS actual profile read view adds unique server human records without client rewards or career rewrites');
