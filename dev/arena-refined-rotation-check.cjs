/* ARENA REFINED Audit 2: exercise the shipped match allocator, combat rules and
   save-bound scheduler with isolated worlds. No production profile is modified. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(process.argv[2]&&path.extname(process.argv[2]).toLowerCase()!=='.json')throw Error('Usage: node dev/arena-refined-rotation-check.cjs [results.json] [baseline-game.js]. The output must be a JSON report, never a source file.');
const {engine}=require('./simulate.cjs');
const {validateWorld}=require('../server/world.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8');
const hook='window.__AUDIT2={updateOfficialSlots,slotCooldownRemaining,finishBotMatch,updateMatchClocks,matchRemainingMs,standings,matchHudState,updateHud,updateSpectatorHud,renderScoreboard,sessionResultHtml,startSpectate,startTournamentGame,endTournamentGame,reserveTournamentBots,releaseTournamentReservations,isAlly,isEnemy,publishBotIntention};window.SAR = {';
assert.ok(source.includes('window.SAR = {'),'real engine diagnostic insertion point');
const exposed=source.replace('window.SAR = {',hook),copy=value=>JSON.parse(JSON.stringify(value)),checks=[];
function make(storage={}){let clock=Date.now();const e=engine(storage,exposed,{wallNow:()=>clock});return Object.assign(e,{audit:e.context.__AUDIT2,wallAdvance(ms){clock+=ms;},wallNow:()=>clock});}
function pass(name,fn){fn();checks.push({test:name,result:'PASS'});console.log('PASS '+name);}
function invariant(e){
 const {state}=e.dev.inspect(),canonical=state.actors.filter(a=>!a.isPlayer&&!a.sandbox),ids=canonical.map(a=>a.profile.id);
 assert.equal(canonical.length,50,'exactly 50 permanent actors');assert.equal(new Set(ids).size,50,'permanent IDs unique');
 const assigned=new Set();
 for(const m of state.matches.slice(0,4)){assert.ok(m,'four configured background slots survive');for(const a of m.participants){if(a.isPlayer)continue;assert.equal(a.matchId,m.id,'canonical slot binding');assert.ok(!a.officialReservation,'officially reserved actor absent from background roster');assert.ok(!assigned.has(a.profile.id),'background actor booked only once');assigned.add(a.profile.id);}}
 for(const a of state.idleBots){assert.equal(a.matchId,null,'waiting actor unbound');assert.ok(!a.officialReservation,'reserved actors are not idle');assert.ok(!assigned.has(a.profile.id),'waiting/active rosters disjoint');assigned.add(a.profile.id);}
 const reserved=canonical.filter(a=>a.officialReservation);for(const a of reserved){assert.equal(a.matchId,null,'reserved canonical actor unbound');assert.ok(!assigned.has(a.profile.id));assigned.add(a.profile.id);}
 assert.equal(assigned.size,50,'every permanent actor is allocated, waiting or reserved');
 const officialPlaying=new Set();for(const m of state.matches.filter(m=>m&&['active','countdown'].includes(m.status))){for(const a of m.participants.filter(a=>!a.isPlayer)){const id=a.sourceBotId||a.profile?.id;assert.ok(!officialPlaying.has(id),'no persistent ID in two active official/background matches: '+id);officialPlaying.add(id);}}
 return {state,reserved:reserved.length};
}
function lethal(e,m,a,v){v.dead=false;v.hp=1;v.spawnFlash=0;e.dev.applyDamage(v,{owner:a,weapon:a.slots[a.currentSlot].name,travel:70},28,false,e.dev.now());}
function modes(e){return e.dev.inspect().state.matches.slice(0,4).map(m=>m.mode);}

pass('Normal allocation: two true 5v5 TDM slots, two ten-player FFA slots, 40 active and 10 waiting',()=>{
 const e=make(),{state,SAVE}=e.dev.inspect();invariant(e);assert.deepEqual(modes(e),['tdm','tdm','deathmatch','deathmatch']);
 assert.equal(state.idleBots.length,10);assert.equal(state.matches.slice(0,4).reduce((n,m)=>n+m.participants.length,0),40);
 for(const m of state.matches){assert.equal(m.status,'active');assert.equal(m.participants.length,10);assert.equal(m.limit,m.mode==='tdm'?60:30);assert.equal(m.durationMs,m.mode==='tdm'?300000:240000);assert.equal(new Set(m.participants.map(a=>a.team)).size,m.mode==='tdm'?2:10);if(m.mode==='tdm')for(const team of [0,1])assert.equal(m.participants.filter(a=>a.team===team).length,5);}
 assert.equal(SAVE.patchState.balanceVersion,'9.0');assert.equal(e.dev.balanceFingerprint(),'b-59670f2d');assert.equal(SAVE.patchArchives.length,0);
});

pass('Both TDM slots perceive/publish allies; both FFA slots target every competitor and publish no team intentions',()=>{
 const e=make(),{state}=e.dev.inspect();
 for(const m of state.matches){m.participants.forEach((a,i)=>{Object.assign(a,{x:2160+i*34,y:1440,dead:false,spawnFlash:0});a.memory.clear();});for(const a of m.participants){e.dev.selectTarget(a,e.dev.now());assert.equal(a.visibleAllies.length,m.mode==='tdm'?4:0);assert.equal(a.visibleEnemies.length,m.mode==='tdm'?5:9);assert.ok(a.target);assert.ok(e.audit.isEnemy(a,m.participants.find(b=>b.id===a.target.id)));a.tactic='ADVANCE';a.tacticalAdvice={intention:'push'};e.audit.publishBotIntention(a,e.dev.now());}assert.equal(m.teamIntentions.size,m.mode==='tdm'?10:0);}
 invariant(e);
});

pass('Twenty seconds of actual AI movement/firing keeps both modes active with finite state and separated observed combat',()=>{
 const e=make(),{state,SAVE}=e.dev.inspect();for(let tick=0;tick<600;tick++)e.step(1/30);invariant(e);
 for(const a of state.actors){for(const key of ['x','y','vx','vy','hp'])assert.ok(Number.isFinite(a[key]),a.name+' finite '+key);assert.ok(a.hp>=0&&a.hp<=250);}
 for(const m of state.matches.slice(0,4)){assert.equal(m.status,'active');assert.ok(m.participants.reduce((n,a)=>n+a.stats.shots,0)>0,'actual shots in slot '+m.id);if(m.mode==='deathmatch'){assert.equal(m.teamIntentions.size,0);assert.ok(m.participants.every(a=>a.visibleAllies.length===0));}else assert.ok(m.teamIntentions.size>0,'team coordination in TDM slot '+m.id);}
 const samples=SAVE.patchState.participantAnalytics.samples[SAVE.aiRevision];for(const mode of ['tdm','deathmatch'])assert.ok(Object.values(samples[mode].bot.meta).reduce((n,w)=>n+w.damage,0)>0,'actual resolved '+mode+' damage');assert.equal(JSON.stringify(e.context.SAR.getProfiles()),e.initialProfiles);assert.equal(SAVE.progression.totalXPUnits,0,'background combat awards no human XP');
});

pass('Real projectiles and resolved lethal hits write only the correct TDM or Deathmatch telemetry/career scope',()=>{
 for(const mode of ['tdm','deathmatch']){
  const e=make(),{state,SAVE}=e.dev.inspect(),m=state.matches.find(m=>m.mode===mode),a=m.participants[0],v=m.participants.find(b=>e.audit.isEnemy(a,b));
  for(const b of state.actors)b.dead=true;Object.assign(a,{dead:false,x:2160,y:1440,ads:true,adsBlend:1,vx:0,vy:0,angle:0,spawnFlash:0});Object.assign(v,{dead:false,x:2290,y:1440,spawnFlash:0,hp:250});a.currentSlot=1;const weapon=a.slots[1].name,tdmBefore=copy(SAVE.patchState.meta[weapon]),dmBefore=copy(SAVE.modeStats.deathmatch.meta[weapon]);
  assert.equal(e.dev.fire(a,0,10000),true);assert.ok(state.projectiles.some(p=>p.owner===a));for(let tick=0;tick<60&&v.hp===250;tick++)e.dev.updateProjectiles(1/240,10000+tick*1000/240);assert.ok(v.hp<250,'actual projectile removes competitor HP');
  const samples=SAVE.patchState.participantAnalytics.samples[SAVE.aiRevision];assert.equal(samples[mode].bot.meta[weapon].shots,1);assert.ok(samples[mode].bot.meta[weapon].damage>0);assert.equal(samples[mode==='tdm'?'deathmatch':'tdm'].bot.meta[weapon].shots,0);
  if(mode==='tdm'){assert.equal(SAVE.patchState.meta[weapon].shots,tdmBefore.shots+1);assert.deepEqual(SAVE.modeStats.deathmatch.meta[weapon],dmBefore);}else{assert.equal(SAVE.modeStats.deathmatch.meta[weapon].shots,dmBefore.shots+1);assert.deepEqual(SAVE.patchState.meta[weapon],tdmBefore);assert.equal(a.career,SAVE.modeStats.deathmatch.bots[a.name]);assert.notEqual(a.career,SAVE.bots[a.name].career);}
  invariant(e);
 }
});

pass('Actual target-60 TDM and target-30 FFA finishing kills produce mode-correct immutable results exactly once',()=>{
 for(const mode of ['tdm','deathmatch']){
  const e=make(),{state,SAVE}=e.dev.inspect(),m=state.matches.find(m=>m.mode===mode),a=m.participants[0],v=m.participants.find(b=>e.audit.isEnemy(a,b));
  if(mode==='tdm')m.score[a.team]=58;else a.stats.kills=28;lethal(e,m,a,v);assert.equal(m.status,'active');lethal(e,m,a,v);assert.equal(m.status,'cooldown');assert.equal(m.result.mode,mode);assert.equal(m.result.reason,'score');assert.equal(m.result.winner,mode==='tdm'?a.team:a.id);assert.ok(Object.isFrozen(m.result));
  if(mode==='deathmatch'){assert.equal(m.result.rows[0].kills,30);assert.deepEqual(m.result.winnerIds,[a.id]);assert.equal(m.result.rows[0].placement,1);assert.deepEqual(m.score,[0,0]);assert.equal(SAVE.modeStats.deathmatch.completedMatches,1);assert.equal(SAVE.patchState.completedMatches,0);const html=e.audit.sessionResultHtml(m.result);assert.match(html,/DEATHMATCH/);assert.match(html,/<th>PLACE<\/th>/);assert.doesNotMatch(html,/TEAM SCOREBOARD/);}else assert.equal(SAVE.patchState.completedMatches,1);
  const result=m.result,world=JSON.stringify(SAVE);e.dev.endMatch(m,mode==='tdm'?1-a.team:v.id);e.ui.flush();assert.equal(m.result,result);assert.equal(JSON.stringify(SAVE),world);assert.equal(state.matches[m.id],m,'background result never releases its configured slot');invariant(e);
 }
});

pass('Five-minute TDM preserves sudden-death ties; four-minute FFA resolves standings and exact draws without team scores',()=>{
 const t=make(),tm=t.dev.inspect().state.matches[0];tm.score=[8,8];t.audit.updateMatchClocks(tm.startedAt+300000);assert.equal(tm.status,'active');assert.equal(tm.overtime,true);const a=tm.participants[0],v=tm.participants.find(b=>b.team!==a.team);lethal(t,tm,a,v);assert.equal(tm.result.reason,'overtime');
 for(const tie of [false,true]){const e=make(),m=e.dev.inspect().state.matches[2];if(!tie)Object.assign(m.participants[0].stats,{kills:7,deaths:2,damage:300});e.audit.updateMatchClocks(m.startedAt+239999);assert.equal(m.status,'active');e.audit.updateMatchClocks(m.startedAt+240000);assert.equal(m.status,'cooldown');assert.equal(m.result.reason,'time');assert.equal(m.overtime,false);assert.equal(m.result.winnerIds.length,tie?10:1);assert.equal(m.result.winner,tie?null:m.participants[0].id);assert.deepEqual(m.result.score,[0,0]);}
});

pass('Spectator HUD/scoreboard across all four slots switches FFA placement/leader and TDM team score presentation',()=>{
 const e=make(),{state}=e.dev.inspect();for(let id=0;id<4;id++){const m=state.matches[id],a=m.participants[0];e.audit.startSpectate(id);e.audit.updateSpectatorHud(e.dev.now());e.audit.renderScoreboard();const hud=e.audit.matchHudState(m,a,e.dev.now());assert.equal(hud.clock,id<2?'05:00':'04:00');assert.match(e.ui.element('spectateGame').textContent,id<2?/5V5 TDM/:/DEATHMATCH/);assert.equal(e.ui.element('scoreGroupHeading').textContent,id<2?'Team':'Place');if(id>=2){assert.match(e.ui.element('spectateScore').innerHTML,/LEADER/);assert.doesNotMatch(e.ui.element('spectateScore').innerHTML,/\b(?:BLUE|RED|TEAM)\b/);assert.doesNotMatch(e.ui.element('spectatePower').textContent,/\b(?:BLUE|RED)\b/);}else assert.match(e.ui.element('spectateScore').innerHTML,/BLUE.*RED/);}invariant(e);
});

pass('Both mode cooldowns retain the 15-second deadline, mode/identity across reload, and restart only once',()=>{
 for(const id of [0,1,2,3]){
  const e=make(),{state,SAVE}=e.dev.inspect(),m=state.matches[id];e.dev.endMatch(m,m.mode==='tdm'?0:m.participants[0].id);e.ui.flush();const deadline=SAVE.matchSlots[id].readyAt,oldID=m.matchId;assert.equal(deadline-e.wallNow(),15000);e.wallAdvance(14999);e.audit.updateOfficialSlots();assert.equal(state.matches[id],m);assert.equal(e.audit.slotCooldownRemaining(m),1);
  const reload=engine({'sar-persistent-save':JSON.stringify(SAVE)},exposed,{wallNow:e.wallNow}),r=reload.context.__AUDIT2,rs=reload.dev.inspect().state;assert.equal(rs.matches[id].mode,m.mode);assert.equal(rs.matches[id].matchId,oldID);assert.equal(rs.matches[id].status,'cooldown');invariant(reload);
  e.wallAdvance(1);r.updateOfficialSlots();const next=rs.matches[id],generation=reload.dev.inspect().SAVE.matchSlots[id].generation;assert.equal(next.status,'active');assert.equal(next.mode,m.mode);assert.notEqual(next.matchId,oldID);assert.equal(next.durationMs,m.durationMs);for(let attempt=0;attempt<4;attempt++){r.finishBotMatch(rs.matches[id]===m?m:next);r.updateOfficialSlots();}assert.equal(rs.matches[id],next);assert.equal(reload.dev.inspect().SAVE.matchSlots[id].generation,generation);invariant(reload);
 }
});

pass('Waiting-pool priority rotates every permanent bot through both modes without fixing Power to a mode',()=>{
 const e=make(),{state}=e.dev.inspect(),seen=new Map(state.actors.map(a=>[a.name,new Set()]));
 function observe(){for(const m of state.matches.slice(0,4))for(const a of m.participants)seen.get(a.name).add(m.mode);}observe();
 for(let cycle=0;cycle<5;cycle++)for(let id=0;id<4;id++){const waiting=state.idleBots.map(a=>a.name),m=state.matches[id];e.dev.endMatch(m,m.mode==='tdm'?0:m.participants[0].id,'time');e.wallAdvance(15000);e.audit.updateOfficialSlots();assert.ok(waiting.every(name=>state.matches[id].participants.some(a=>a.name===name)),'all ten longest-waiting bots enter the next completed slot');observe();invariant(e);}
 assert.ok([...seen.values()].every(set=>set.has('tdm')&&set.has('deathmatch')),'all 50 identities rotate across both modes');assert.equal(JSON.stringify(e.context.SAR.getProfiles()),e.initialProfiles,'permanent identities, personality and Power unchanged');
});

pass('Human TDM entry remains one safe countdown reservation; human FFA remains ten independent participants; abandoning awards no XP',()=>{
 const e=make(),{state,SAVE}=e.dev.inspect(),xp=copy(SAVE.progression);e.dev.queueForMatch();const m=state.matches.find(m=>m.hasPlayer);assert.ok(m);assert.equal(m.mode,'tdm');assert.equal(m.participants.length,10);assert.equal(m.status,'countdown');assert.equal(state.matches.filter(m=>m.hasPlayer).length,1);const id=m.matchId;e.dev.queueForMatch();assert.equal(state.matches.find(m=>m.hasPlayer).matchId,id);invariant(e);e.dev.exitGame();assert.deepEqual(SAVE.progression,xp);invariant(e);assert.deepEqual(modes(e),['tdm','tdm','deathmatch','deathmatch']);
 const dm=e.context.SAR.startDeathmatch();assert.equal(dm.mode,'deathmatch');assert.equal(dm.participants.length,10);assert.equal(new Set(dm.participants.map(a=>a.team)).size,10);assert.equal(dm.status,'countdown');assert.equal(dm.limit,30);e.audit.updateHud(e.dev.now());assert.equal(e.ui.element('hudIdentityHeading').textContent,'YOUR PLACEMENT');assert.match(e.ui.element('teamScoreLabel').innerHTML,/LEADER/);assert.doesNotMatch(e.ui.element('teamScoreLabel').innerHTML,/BLUE|RED|TEAM/);assert.equal(new Set(state.matches.filter(Boolean).flatMap(m=>m.participants.filter(a=>!a.isPlayer).map(a=>a.profile.id))).size,49,'49 distinct bots across four background matches and human FFA');e.dev.exitGame();assert.deepEqual(SAVE.progression,xp);invariant(e);
});

pass('A queued TDM player waits for a TDM slot while both live Deathmatch slots continue unchanged',()=>{
 const e=make(),{state}=e.dev.inspect();for(const m of state.matches.slice(0,2))e.dev.endMatch(m,0,'time');const dmIDs=state.matches.slice(2,4).map(m=>m.matchId);e.dev.queueForMatch();assert.equal(state.playerMatchId,null);assert.equal(state.queued,true);assert.deepEqual(state.matches.slice(2,4).map(m=>m.matchId),dmIDs);assert.ok(state.matches.slice(2,4).every(m=>m.mode==='deathmatch'&&m.status==='active'));e.wallAdvance(15000);e.audit.updateOfficialSlots();assert.equal(state.matches.filter(m=>m.hasPlayer).length,1);assert.ok(state.playerMatchId<2);assert.deepEqual(state.matches.slice(2,4).map(m=>m.matchId),dmIDs);invariant(e);
});

pass('Shared official tournament reservations suspend affected configured slots instead of cloning bots, then restore normal allocation',()=>{
 const e=make(),{state,SAVE}=e.dev.inspect(),profiles=copy(e.context.SAR.getProfiles()),xp=copy(SAVE.progression),patch=SAVE.patchState.id,archiveCount=SAVE.patchArchives.length,names=state.actors.map(a=>a.name),matches=[];
 for(let group=0;group<4;group++){
  const selected=names.slice(group*10,group*10+10),context={tournamentId:'audit-official',tournamentKind:'official',gameId:'audit-official-game-'+group,seriesId:'audit-series-'+group,hasPlayer:false,teamIds:['audit-team-'+(group*2),'audit-team-'+(group*2+1)],teams:[0,1].map(team=>({participants:selected.slice(team*5,team*5+5).map(name=>({id:profiles[name].id,kind:'bot',name}))}))};
  matches.push(e.audit.startTournamentGame(context));invariant(e);
 }
 assert.deepEqual(modes(e),['tdm','tdm','deathmatch','deathmatch']);assert.equal(invariant(e).reserved,40);assert.ok(state.matches.slice(0,4).some(m=>m.status==='waiting'),'honest resource shortage suspends slots');assert.ok(state.matches.slice(0,4).filter(m=>m.status==='active').reduce((n,m)=>n+m.participants.length,0)<=10,'only remaining canonical pool is available');const held=state.matches.slice(0,4).map(m=>({id:m.matchId,score:copy(m.score),remaining:e.audit.matchHudState(m,m.participants[0],e.dev.now()).clock}));
 e.wallAdvance(60000);e.audit.updateOfficialSlots();invariant(e);assert.deepEqual(state.matches.slice(0,4).map(m=>m.matchId),held.map(m=>m.id),'waiting does not create replacement matches');
 // Tournament combat now begins only after its authoritative countdown.
 assert.ok(matches.every(m=>m.status==='countdown'));for(let tick=0;tick<91;tick++)e.step(1/30);assert.ok(matches.every(m=>m.status==='active'));
 for(const m of matches)e.audit.endTournamentGame(m,0,'time');e.audit.updateOfficialSlots();invariant(e);assert.equal(state.matches.slice(0,4).filter(m=>m.status==='active').length,4);assert.equal(state.matches.slice(0,4).reduce((n,m)=>n+m.participants.length,0),40);assert.equal(state.idleBots.length,10);assert.equal(invariant(e).reserved,0);assert.deepEqual(e.context.SAR.getProfiles(),profiles);assert.deepEqual(SAVE.progression,xp,'bot tournaments/startup reserve no human XP');assert.equal(SAVE.patchState.id,patch);assert.equal(SAVE.patchArchives.length,archiveCount);
});

pass('The full ACTIVE official roster stays reserved across games/reload; suspended background clocks resume without shifting official schedules',()=>{
 const e=make(),{state,SAVE}=e.dev.inspect(),profiles=e.context.SAR.getProfiles(),names=state.actors.slice(0,40).map(a=>a.name),event={id:'audit-full-roster',kind:'official',status:'ACTIVE',startsAt:e.wallNow()-1000,teams:Array.from({length:8},(_,team)=>({participants:names.slice(team*5,team*5+5).map(name=>({kind:'bot',id:profiles[name].id,name}))}))},schedule=copy(event);
 state.matches[0].score=[7,3];const prior=state.matches.slice(0,4).map(m=>({matchId:m.matchId,score:copy(m.score),remaining:e.audit.matchRemainingMs(m,e.dev.now())}));e.context.SAR.syncTournamentReservations([event]);const firstIDs=state.matches.slice(0,4).map(m=>m.matchId);e.context.SAR.syncTournamentReservations([event]);assert.deepEqual(state.matches.slice(0,4).map(m=>m.matchId),firstIDs,'repeat sync cannot reallocate matches');assert.equal(invariant(e).reserved,40);assert.ok(state.matches.slice(0,4).every(m=>m.status==='waiting'));
 for(let tick=0;tick<900;tick++){e.wallAdvance(1000/30);e.step(1/30);}for(const [id,m]of state.matches.slice(0,4).entries()){assert.equal(m.matchId,prior[id].matchId);assert.deepEqual(m.score,prior[id].score);assert.equal(e.audit.matchRemainingMs(m,e.dev.now()),prior[id].remaining);}
 const account={id:'audit-reservation-owner',username:'AuditReservationOwner'},key='sar.tournament.calendar.'+account.id,storage={'sar-persistent-save':JSON.stringify(SAVE),[key]:JSON.stringify({tournaments:[event]})};const reloadedSource=exposed.replace('initializeLeague();\nupdateLobbyUi();\npaintLobbyKit();','window.SARCloud.state={account:'+JSON.stringify(account)+'};initializeLeague();\nupdateLobbyUi();\npaintLobbyKit();');const reload=engine(storage,reloadedSource,{wallNow:e.wallNow});assert.equal(invariant(reload).reserved,40);assert.deepEqual(reload.dev.inspect().state.matches.slice(0,4).map(m=>m.mode),['tdm','tdm','deathmatch','deathmatch']);assert.ok(reload.dev.inspect().state.matches.slice(0,4).some(m=>m.status==='waiting'));reload.context.SAR.syncTournamentReservations([]);invariant(reload);assert.equal(reload.dev.inspect().state.idleBots.length,10);
 e.context.SAR.syncTournamentReservations([]);invariant(e);for(const [id,m]of state.matches.slice(0,4).entries()){assert.equal(m.status,'active');assert.equal(m.matchId,prior[id].matchId);assert.deepEqual(m.score,prior[id].score);assert.equal(e.audit.matchRemainingMs(m,e.dev.now()),prior[id].remaining,'suspended background clock resumes at exact prior remaining time');}assert.equal(state.idleBots.length,10);assert.deepEqual(event,schedule,'client wait never changes authoritative tournament timestamps');
});

if(process.argv[3])pass('Audit 1 saved-world upgrade preserves XP/levels, records, personalities, familiarity, seasons and balance history; changed mode slots get new identities',()=>{
 const baseline=fs.readFileSync(path.resolve(process.argv[3]),'utf8'),old=engine({},baseline);assert.equal(old.dev.balanceFingerprint(),'b-b9bdf00b');for(let tick=0;tick<600;tick++)old.step(1/30);
 old.dev.queueForMatch();let m=old.dev.inspect().state.matches.find(m=>m.hasPlayer),player=m.participants.find(a=>a.isPlayer),victim=m.participants.find(a=>a.team!==player.team);m.status='active';old.dev.fire(player,0,10000);old.dev.tryDash(player,1,0,11000);old.dev.applyDamage(victim,{owner:player,weapon:player.slots[0].name,travel:70},250,false,12000);old.dev.endMatch(m,player.team,'time');old.ui.flush();
 m=old.context.SAR.startDeathmatch();player=m.participants.find(a=>a.isPlayer);victim=m.participants.find(a=>a!==player);m.status='active';old.dev.fire(player,0,14000);old.dev.applyDamage(victim,{owner:player,weapon:player.slots[0].name,travel:70},250,false,15000);old.dev.endMatch(m,player.id,'time');old.ui.flush();
 const before=copy(old.dev.inspect().SAVE),storage=Object.fromEntries(old.data);storage['sar-persistent-save']=JSON.stringify(before);const e=make(storage),after=e.dev.inspect().SAVE;invariant(e);assert.deepEqual(modes(e),['tdm','tdm','deathmatch','deathmatch']);
 const withoutPicks=value=>{if(Array.isArray(value))return value.map(withoutPicks);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='picks').map(([key,item])=>[key,withoutPicks(item)]));return value;};
 assert.ok(before.progression.totalXPUnits>0);for(const key of ['playerCareer','playerSeasons','progression','ranked','seasons','patchArchives','balancePatchHistory'])assert.deepEqual(withoutPicks(after[key]),withoutPicks(before[key]),key+' retained');
 for(const [name,bot]of Object.entries(before.bots)){assert.deepEqual(after.bots[name].profile,bot.profile,name+' identity/Power/personality');assert.deepEqual(after.bots[name].familiarity,bot.familiarity,name+' familiarity');assert.deepEqual(withoutPicks(after.bots[name].career),withoutPicks(bot.career),name+' career');assert.deepEqual(after.bots[name].recentMatches,bot.recentMatches,name+' match history');}
 for(const key of ['id','fingerprint','balanceVersion','weaponStats','observedSeconds','completedMatches'])assert.deepEqual(after.patchState[key],before.patchState[key],key+' current-patch identity/sample retained');assert.deepEqual(withoutPicks(after.patchState.meta),withoutPicks(before.patchState.meta),'current-patch counters retained');
 assert.deepEqual(withoutPicks(after.modeStats.deathmatch.player),withoutPicks(before.modeStats.deathmatch.player));assert.deepEqual(after.modeStats.deathmatch.recentMatches,before.modeStats.deathmatch.recentMatches);assert.equal(after.modeStats.deathmatch.completedMatches,before.modeStats.deathmatch.completedMatches);for(const [name,record]of Object.entries(before.modeStats.deathmatch.bots))assert.deepEqual(withoutPicks(after.modeStats.deathmatch.bots[name]),withoutPicks(record),'prior Deathmatch bot '+name+' retained');
 for(const id of [2,3]){assert.equal(after.matchSlots[id].mode,'deathmatch');assert.notEqual(after.matchSlots[id].matchId,before.matchSlots[id].matchId,'mode change cannot reuse a TDM result identity');assert.equal(after.matchSlots[id].generation,before.matchSlots[id].generation+1);}validateWorld(copy(after),{save:before});const reload=make({'sar-persistent-save':JSON.stringify(after)});assert.deepEqual(reload.dev.inspect().SAVE.progression,after.progression);assert.equal(reload.dev.inspect().SAVE.patchArchives.length,after.patchArchives.length);
});

if(process.argv[2]){const out=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({result:'PASS',gameSHA256:crypto.createHash('sha256').update(source).digest('hex'),groups:checks.length,checks},null,2)+'\n');}
console.log(JSON.stringify({result:'PASS',groups:checks.length}));
