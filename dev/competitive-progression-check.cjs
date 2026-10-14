'use strict';
// Uses the current shared rules and shipped simulation. DOM stubs expose HTML;
// browser/native behavior is checked separately through the actual packaged UI.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const XP=require('../progression.js'),Stats=require('../profile-stats.js');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
const output=process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-competitive-progression');fs.mkdirSync(output,{recursive:true});
const requirements=[100,110,125,150,175,225,275,325,400,475,550,625,700,800,900,1000,1250,1500,1750,2000,2250,2500,2750,3000,3300,3600,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500,9000,9500,10000,10750,11500,12250,13000,14500,16000,17500,19000,21000,23000,25000];
const ranks=[['Beginner I',0],['Beginner II',100],['Beginner III',200],['Rookie I',350],['Rookie II',500],['Rookie III',650],['Trainer I',850],['Trainer II',1050],['Trainer III',1250],['Challenger I',1500],['Challenger II',1750],['Challenger III',2000],['Veteran I',2350],['Veteran II',2700],['Veteran III',3000],['Elite Veteran I',3400],['Elite Veteran II',3800],['Pro I',4250],['Pro II',4700],['Master I',5200],['Master II',5700],['Grandmaster I',6300],['Grandmaster II',6900],['Champion',7750],['Legend',8750],['Ascendant',10000]];
const formulaHashes={view:'b5618e5542a98716502c6aecb6bc48a090ea6c961e6b4d4a344e28c28717866e',breakdown:'53aac7a9af9b7654dc272b23589258897fd711f8cc21fe012da354e0d50f9c5a',totals:'5aad0ead6af276ff1419908a55bffb0c472c46342ea8fd5d33bf05b510b237f8',rankView:'c1a1084d69bb74aec23557ac28940845fba3145c7b962382b77c7f4a7f70dbfa',rankedBreakdown:'43dec11f8065d48e307c126e0ac728c0d66209f363b4c3042c097123c4cc2a1f',rankedTotals:'869064c565242d162b0e8d36018d8882ca4843e73b8dfc04f73fb7de32f92d00'};
const account='competitive-source-fixture',stats=(extra={})=>({kills:0,deaths:0,assists:0,damage:0,taken:0,headshots:0,timeAlive:0,timePlayed:0,shots:0,hits:0,...extra});
const input=(extra={})=>({participantId:account,matchId:'match:competitive',kind:'ranked',sessionType:'ranked',mode:'tdm',eligible:true,practice:false,at:2000,stats:stats(),events:XP.events(),leaders:{kills:false,assists:false,alive:false},won:true,winStreak:0,...extra});
assert.equal(XP.SCALE,100);assert.equal(XP.MAX_LEVEL,50);assert.equal(XP.XP_RULES_VERSION,2);assert.equal(XP.RANKED_RULES_VERSION,1);assert.deepEqual(XP.requirements,requirements);assert.deepEqual(XP.ranks.map(r=>[r.name,r.threshold]),ranks);
for(const[key,expected]of Object.entries(formulaHashes))assert.equal(hash(XP[key].toString()),expected,key+' formula changed from protected baseline');
pass('Exact XP amounts, 26 competitive thresholds and six production formula fingerprints remain unchanged');

let cumulative=0;
for(let level=1;level<50;level++){
 assert.equal(XP.view(cumulative).currentLevel,level);assert.equal(XP.view(cumulative).currentXP,0);assert.equal(XP.view(cumulative).requiredXP,requirements[level-1]);
 cumulative+=requirements[level-1]*100;assert.equal(XP.view(cumulative-1).currentLevel,level);assert.equal(XP.view(cumulative).currentLevel,level+1);
}
assert.equal(XP.view(cumulative+100000000).currentLevel,50);assert.equal(XP.view(cumulative+100000000).totalXP,(cumulative+100000000)/100);
for(let index=0;index<ranks.length;index++){
 const threshold=ranks[index][1]*100;assert.equal(XP.rankView(threshold).rankIndex,index);assert.equal(XP.rankView(threshold+1).rankIndex,index);if(index)assert.equal(XP.rankView(threshold-1).rankIndex,index-1);
}
pass('All 49 level boundaries/carry/cap and every below/at/above rank threshold match authoritative tables');

const ranked=XP.normalizeRanked(),xp=XP.normalize(null);
for(let i=1;i<=34;i++){
 const row=input({matchId:'match:win-'+i,at:2000+i,mode:i%2?'tdm':'deathmatch'});assert.equal(XP.awardRanked(ranked,row).applied,true);assert.equal(XP.award(xp,row).applied,true);
}
assert.equal(ranked.participants[account].ratingUnits,10250);assert.equal(XP.rankView(ranked.participants[account].ratingUnits).rankName,'Beginner II');
const promoted=clone(ranked),loss=input({matchId:'match:loss',at:2100,won:false,mode:'deathmatch'}),demotion=XP.awardRanked(ranked,loss);
assert.equal(demotion.receipt.calculatedUnits,-3100);assert.equal(demotion.receipt.afterUnits,7150);assert.equal(XP.rankView(demotion.receipt.afterUnits).rankName,'Beginner I');
const fixed=clone(ranked);assert.equal(XP.awardRanked(ranked,loss).applied,false);assert.deepEqual(ranked,fixed);assert.deepEqual(XP.normalizeRanked(ranked),fixed);XP.validateRanked(ranked,promoted);XP.validate(xp);
for(const mode of ['gun-game','domination','hardpoint'])assert.equal(XP.awardRanked(ranked,input({matchId:'match:excluded-'+mode,mode})),null);
assert.deepEqual(ranked,fixed);assert.equal(xp.totalXPUnits,17000);
pass('Actual Ranked TDM/DM receipts promote/demote, duplicate delivery/restart preserve rating, account XP stays independent');

const world={progression:XP.normalize(null),ranked:XP.normalizeRanked(),rankedResults:{},playerCareer:{games:3,recentMatches:[]},modeStats:{deathmatch:{player:{games:1},recentMatches:[]}},playerSeasons:{current:{number:2,startAt:2000,endAt:4000,stats:{}},history:[{number:1,startAt:1000,endAt:2000,stats:{}}]}};
const ordinary=[input({matchId:'match:casual-tdm',kind:'standard',sessionType:'standard',at:1500,stats:stats({kills:10,deaths:2,assists:1,damage:1000,shots:100,hits:25})}),input({matchId:'match:casual-dm',kind:'standard',sessionType:'standard',mode:'deathmatch',at:2200,won:false,stats:stats({kills:7,deaths:8,damage:500,shots:10,hits:8})}),input({matchId:'match:ranked-tdm',at:2300,stats:stats({kills:4,deaths:3,assists:2,damage:450,shots:20,hits:10})}),input({matchId:'match:ranked-dm',mode:'deathmatch',at:2400,won:false,stats:stats({kills:3,deaths:6,damage:300,shots:30,hits:15})})];
for(const row of ordinary){XP.award(world.progression,row);if(row.kind==='ranked'){XP.awardRanked(world.ranked,row);world.rankedResults[row.matchId]={matchId:row.matchId,mode:row.mode,sessionType:'ranked',eligible:true,practice:false,at:row.at,rows:[{participantId:account,won:row.won,stats:clone(row.stats)}]};}world.playerCareer.recentMatches.push({...row.stats,participantId:account,matchId:row.matchId,mode:row.mode,sessionType:row.sessionType,eligible:true,at:row.at,won:row.won});}
world.playerCareer.recentMatches.push({...stats({kills:1000}),matchId:'match:custom',mode:'tdm',sessionType:'custom',eligible:false,at:2500,won:true},{...stats({kills:1000}),matchId:'match:practice',mode:'tdm',sessionType:'standard',eligible:true,practice:true,at:2500,won:true});
const teams=[{id:'team:one',participants:[{id:account}]},{id:'team:two',participants:[{id:'other'}]}];
const officialEvents=[{id:'official:event',kind:'official',teams,series:[{id:'official:series',games:[{id:'official:game',completedAt:2600,winnerTeamId:'team:one',mode:'tdm',sessionType:'tournament',teams,stats:[{participantId:account,...stats({kills:8,deaths:4,assists:3,damage:900,shots:40,hits:20})}]}]}]},{id:'custom:event',kind:'custom',teams,series:[{id:'custom:series',games:[{id:'custom:game',completedAt:2600,teams,stats:[{participantId:account,...stats({kills:1000})}]}]}]}];
const officialRecords=Stats.officialParticipations(officialEvents,account),networkRecords=ordinary.map(r=>({...r,queue:r.sessionType,authority:'server-multiplayer',finalized:true,completed:true}));
const snapshot=clone(world),options={participantId:account,accountId:account,officialRecords,officialAvailable:true,networkRecords},combined=Stats.project(world,options),rankedStats=Stats.project(world,{...options,kind:'ranked'});
assert.equal(combined.totals.games,5);assert.equal(combined.totals.kills,32);assert.equal(combined.totals.deaths,23);assert.equal(combined.ratios.kd,32/23);assert.equal(combined.ratios.accuracy,78/200);assert.equal(combined.ratios.winRate,3/5);
assert.equal(rankedStats.totals.games,2);assert.equal(rankedStats.totals.kills,7);assert.equal(rankedStats.ratios.kd,7/9);assert.equal(rankedStats.ratios.accuracy,25/50);assert.equal(rankedStats.ratios.winRate,.5);
assert.equal(Stats.project(world,{...options,kind:'ranked',scope:'season',seasonNumber:1}).totals.games,0);assert.equal(Stats.project(world,{...options,scope:'season',seasonNumber:1}).totals.games,1);assert.equal(Stats.project(world,{...options,scope:'season',seasonNumber:2}).totals.games,4);
assert.deepEqual(world,snapshot);assert.deepEqual(Stats.project(world,options),combined);assert.equal(Stats.project(world,{...options,participantId:'foreign'}).coverage.authorized,false);
pass('Combined de-duplicates casual/Ranked/network/official records; custom/practice excluded, raw ratios and saved season scopes reconcile');

const configuredPast={id:'ranked:past',label:'Ranked past',status:'completed',startAt:2000,endAt:2350},configuredCurrent={id:'ranked:current',label:'Ranked current',status:'current',startAt:2350,endAt:2600};
const pastRanked=Stats.project(world,{...options,kind:'ranked',scope:'season',seasonWindow:configuredPast}),currentRanked=Stats.project(world,{...options,kind:'ranked',scope:'season',seasonWindow:configuredCurrent});
assert.deepEqual(pastRanked.records.map(r=>r.matchId),['match:ranked-tdm']);assert.equal(pastRanked.totals.kills,4);assert.deepEqual(currentRanked.records.map(r=>r.matchId),['match:ranked-dm']);assert.equal(currentRanked.totals.kills,3);
for(const seasonWindow of [null,{}, {...configuredCurrent,endAt:2350},{...configuredCurrent,startAt:NaN},{...configuredCurrent,endAt:Infinity}]){const invalid=Stats.project(world,{...options,kind:'ranked',scope:'season',seasonWindow});assert.equal(invalid.totals.games,0);assert.equal(invalid.coverage.seasonAvailable,false);assert.deepEqual(Stats.project(world,{...options,scope:'season',seasonNumber:2,seasonWindow}),Stats.project(world,{...options,scope:'season',seasonNumber:2}),'Combined keeps its original season calendar');}
const botWorld=clone(world),bot='bot:season-fixture';botWorld.bots={Ace:{profile:{id:bot},career:{games:1},recentMatches:[]}};botWorld.seasons=clone(world.playerSeasons);XP.awardRanked(botWorld.ranked,input({participantId:bot,matchId:'match:bot-season',at:2300}));
assert.equal(Stats.project(botWorld,{participantId:bot,kind:'ranked',scope:'season',seasonWindow:configuredCurrent}).totals.games,1,'Bot calendar is unaffected by the human Ranked UI window');assert.deepEqual(world,snapshot);
pass('Configured Ranked calendars use exact completion boundaries; invalid windows fail honestly while Combined and bot calendars stay unchanged');

// New production helpers below are exercised after their implementation lands.
const Competitive=require('../competitive-progression.js');
for(const total of [0,9999,10000,50000,cumulative,cumulative+100000000]){
 const before=XP.view(total),track=Competitive.xpTrack(total);assert.equal(track.length,50);assert.equal(track.filter(row=>row.state==='current').length,1);assert.equal(track.find(row=>row.state==='current').level,before.currentLevel);
 assert.equal(track.filter(row=>row.state==='completed').length,before.currentLevel-1);assert.equal(track.filter(row=>row.state==='upcoming').length,50-before.currentLevel);
 let start=0;for(const row of track){assert.equal(row.requiredXP,row.level===50?null:requirements[row.level-1]);assert.equal(row.startXP,start);if(row.level<50){start+=requirements[row.level-1];assert.equal(row.endXP,start);}else assert.equal(row.endXP,null);}
 assert.deepEqual(XP.view(total),before);
}
pass('Production XP screen track derives exactly 50 completed/current/upcoming rows from the unchanged XP table');

const profile=Competitive.rankedProfile(ranked,account,[{id:'s:1',label:'Historical fixture',startAt:2000,endAt:2050},{id:'s:2',label:'Current fixture',startAt:2050,endAt:3000}]);
assert.equal(profile.ratingUnits,7150);assert.equal(profile.careerBest.ratingUnits,10250);assert.equal(profile.history.length,35);assert.equal(profile.history.find(row=>row.matchId==='match:win-33').presentation,'promotion');assert.equal(profile.history.find(row=>row.matchId==='match:loss').presentation,'demotion');
assert.deepEqual(ranked,fixed);assert.deepEqual(Competitive.rankedProfile(XP.normalizeRanked(),account).history,[]);
pass('Production competitive profile exposes real promotion/demotion history, current rating/career best; inspection does not mutate progression');

const resetStore=clone(ranked),originalAwards=clone(resetStore.participants[account].awards),carryBefore=clone(resetStore);
assert.deepEqual(XP.applyRankedReset(resetStore,{participantId:account,seasonId:'season:carry',at:3000,policy:{type:'carry'}}),{applied:false,receipt:null});assert.deepEqual(resetStore,carryBefore);
const softInput={participantId:account,seasonId:'season:soft',at:3000,policy:{type:'retain',numerator:1,denominator:2}},soft=XP.applyRankedReset(resetStore,softInput);
assert.equal(soft.applied,true);assert.equal(soft.receipt.afterUnits,3575);assert.equal(soft.receipt.afterMatchCount,35);assert.equal(resetStore.participants[account].winStreak,0);assert.deepEqual(resetStore.participants[account].awards,originalAwards);XP.validateRanked(resetStore,ranked);
const softFixed=clone(resetStore);assert.equal(XP.applyRankedReset(resetStore,softInput).applied,false);assert.deepEqual(resetStore,softFixed);assert.throws(()=>XP.applyRankedReset(resetStore,{...softInput,policy:{type:'retain',numerator:1,denominator:3}}),/changed/);
XP.awardRanked(resetStore,input({matchId:'match:after-reset',at:3100}));assert.equal(resetStore.participants[account].ratingUnits,3825);XP.validateRanked(resetStore,softFixed);
const seasons=[{id:'season:old',label:'Prior season',startAt:2000,endAt:3000,status:'completed'},{id:'season:soft',label:'Current season',startAt:3000,endAt:4000,status:'current'}],seasonProfile=Competitive.rankedProfile(resetStore,account,seasons);
assert.equal(seasonProfile.seasons[0].final.ratingUnits,7150);assert.equal(seasonProfile.seasons[0].best.ratingUnits,10250);assert.equal(seasonProfile.seasons[0].games,35);assert.equal(seasonProfile.seasons[1].initial.ratingUnits,3575);assert.equal(seasonProfile.seasons[1].current.ratingUnits,3825);assert.equal(seasonProfile.seasonBest.ratingUnits,3825);assert.equal(seasonProfile.careerBest.ratingUnits,10250);
const restored=XP.normalizeRanked(clone(resetStore));assert.deepEqual(restored,resetStore);const altered=clone(restored);altered.participants[account].resets['season:soft'].afterUnits++;assert.throws(()=>XP.validateRanked(altered),/reconcile/);
for(const policy of [{type:'retain',numerator:1,denominator:0},{type:'retain',numerator:3,denominator:2},{type:'set',ratingUnits:-1},{type:'random'},{type:'carry',extra:true}])assert.throws(()=>XP.applyRankedReset(restored,{participantId:account,seasonId:'season:bad',at:4100,policy}),/policy/);
pass('Configured soft reset preserves historical final/best rank and immutable awards; carry defaults, restart and repeat reset remain safe');

const {engine}=require('./simulate.cjs');
const gameSource=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__COMPETITIVETEST={rankedSummaryHtml,updateProgressionUi};window.SAR = {');
const e=engine({},gameSource);e.context.SARCloud.state={account:{id:account,username:'CompetitiveFixture'},loaded:true,localMode:true};
e.ui.action('account-progression');let html=e.ui.element('modalContent').innerHTML;
assert.equal(e.ui.element('modalContent').dataset.view,'account-progression');assert.equal([...html.matchAll(/data-level="\d+"/g)].length,50);assert.equal([...html.matchAll(/data-level-state="current"/g)].length,1);assert.match(html,/data-level="1" data-level-state="current" aria-current="step"/);assert.match(html,/100 XP to next level/);assert.match(html,/Competitive Rank is a separate rating/);
const promotedHtml=e.context.__COMPETITIVETEST.rankedSummaryHtml(promoted.participants[account].awards['match:win-33']),demotedHtml=e.context.__COMPETITIVETEST.rankedSummaryHtml(demotion.receipt);assert.match(promotedHtml,/data-rank-change="promoted"/);assert.match(promotedHtml,/Beginner I → Beginner II/);assert.match(demotedHtml,/data-rank-change="demoted"/);assert.match(demotedHtml,/Beginner II → Beginner I/);
const beforeSource=e.context.SAR.getUniverse();e.context.SAR.startRanked();const m=e.dev.inspect().state.matches.find(match=>match?.hasPlayer),p=m.participants.find(actor=>actor.isPlayer);for(const other of e.dev.inspect().state.matches)if(other&&other!==m)other.status='ended';for(const actor of e.dev.inspect().state.actors)if(actor!==p){actor.dead=true;actor.respawnAt=Infinity;}e.step(3.001);assert.equal(m.status,'active');
e.context.SAR.openRankedProfile();assert.match(e.ui.element('modalContent').innerHTML,/data-profile-metric="games"[\s\S]*?<strong>0<\/strong>/);e.dev.endMatch(m,p.team,'time');
assert.equal(e.ui.element('modalContent').dataset.view,'ranked-profile');assert.match(e.ui.element('modalContent').innerHTML,/data-profile-metric="games"[\s\S]*?<strong>1<\/strong>/);const committed=e.context.SAR.getUniverse();assert.equal(Object.keys(committed.ranked.participants[account].awards).length,1);assert(committed.progression.totalXPUnits>beforeSource.progression.totalXPUnits);const stableProjection=e.context.SAR.getProfileStats({kind:'ranked'});e.dev.endMatch(m,1-p.team,'time');assert.deepEqual(e.context.SAR.getUniverse(),committed);
e.ui.action('account-progression');html=e.ui.element('modalContent').innerHTML;const actualXP=XP.view(committed.progression.totalXPUnits);assert.match(html,new RegExp('data-level="'+actualXP.currentLevel+'" data-level-state="current"'));e.context.__COMPETITIVETEST.updateProgressionUi();assert.match(e.ui.element('lobbyProgression').innerHTML,new RegExp('LVL '+actualXP.currentLevel));
const reopened=engine(Object.fromEntries(e.data),gameSource);reopened.context.SARCloud.state=e.context.SARCloud.state;assert.deepEqual(reopened.context.SAR.getProfileStats({kind:'ranked'}),stableProjection);assert.deepEqual(reopened.context.SAR.getUniverse().progression,committed.progression);reopened.ui.action('rank-list');const rankList=reopened.ui.element('modalContent').innerHTML;assert.equal([...rankList.matchAll(/data-rank-preview=/g)].length,26);assert.match(rankList,/Ascendant/);assert.match(rankList,/10,000 ELO/);
pass('Actual source ACCOUNT LEVEL click opens all50 rows; live finalization refreshes Ranked once, promotion/demotion HTML and offline restart preserve records');

const report={ok:true,groups:checks.length,checks,protected:{formulaHashes,requirements,ranks},sourceHashes:Object.fromEntries(['game.js','progression.js','profile-stats.js','competitive-progression.js'].map(file=>[file,hash(fs.readFileSync(path.join(__dirname,'..',file)))]))};
fs.writeFileSync(path.join(output,'competitive-source-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,groups:checks.length}));
