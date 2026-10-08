'use strict';
const XP=require('../progression.js'),Circuit=require('./tournaments.cjs');
const {isDeepStrictEqual}=require('node:util');
const fail=message=>Object.assign(new Error(message),{status:409,code:'SAVE_REJECTED'});
const fresh=(p,old)=>Object.entries(p?.awards||{}).filter(([id])=>!Object.hasOwn(old?.awards||{},id));
const ordinary=r=>r.kind==='standard'||r.kind==='ranked';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const statsKeys=['kills','deaths','assists','damage','headshots','timeAlive','shots','hits'];
function validateProgression(world,previous){
 const p=world.progression,old=previous?.progression;
 try{XP.validate(p,old);}catch(e){throw fail(e.message);}
 if(!p)return; // Older installed clients may checkpoint before upgrading.
 const names=Object.keys(world.patchState.weaponStats),added=fresh(p,old),discoveries=new Set(added.flatMap(([,r])=>r.firstWeapons)),known=new Set(old?.usedWeapons||(previous?XP.legacyWeapons(previous):p.usedWeapons.filter(w=>!discoveries.has(w))));
 for(const [id,r]of added){
  if(r.rulesVersion>=2&&(!r.participantId||r.transactionKey!==JSON.stringify([r.participantId,id,'xp'])||r.sessionType!==(r.kind==='official'?'tournament':r.kind)||r.eligible!==true||r.practice!==false))throw fail('XP requires canonical eligible participant and session identity');
  if(r.events.usedWeapons.some(w=>!names.includes(w)))throw fail('Unknown XP weapon');
  const expected=r.events.usedWeapons.filter(w=>!known.has(w)).sort();
  if(JSON.stringify(expected)!==JSON.stringify(r.firstWeapons))throw fail('First-use XP does not match account history');
  expected.forEach(w=>known.add(w));
  if(ordinary(r)){
   if(!id.startsWith('match:'))throw fail('Standard XP requires a standard match');
   const career=r.mode==='deathmatch'?world.modeStats?.deathmatch?.player:world.playerCareer;
   const record=career?.recentMatches?.find(m=>m.matchId===id);
   if(record){if(record.sessionType!==r.kind||record.mode!==r.mode||['kills','deaths','assists','damage','headshots'].some(k=>record[k]!==r.stats[k])||record.won!==(r.won===true))throw fail('XP differs from the completed match');for(const key of ['shots','hits'])if(r.stats[key]!==undefined&&record[key]!==undefined&&r.stats[key]!==record[key])throw fail('XP accuracy differs from the completed match');}
   if(r.kind==='ranked'&&r.mode!=='tdm')throw fail('Ranked XP requires Team Deathmatch');
  }else if(!r.tournamentId||!r.seriesId||r.mode!=='tdm'||r.winStreak!==0)throw fail('Invalid tournament XP context');
 }
 if(p.usedWeapons.some(w=>!names.includes(w)||!known.has(w))||[...known].some(w=>!p.usedWeapons.includes(w)))throw fail('Weapon discovery history changed');
 for(const mode of ['tdm','deathmatch']){
  const career=w=>mode==='tdm'?w?.playerCareer:w?.modeStats?.deathmatch?.player;
  const rows=added.filter(([,r])=>ordinary(r)&&r.mode===mode),games=(career(world)?.games||0)-(career(previous)?.games||0);
  if(rows.length>games)throw fail('XP requires newly completed standard games');
  if(rows.length&&old){let streak=career(previous)?.currentWinStreak||0;for(const [,r]of rows){streak=r.won?streak+1:0;if(r.winStreak!==streak)throw fail('XP win streak does not match standard results');}}
  for(const key of ['shots','hits']){const measured=Object.values(p.awards).filter(r=>ordinary(r)&&r.mode===mode).reduce((sum,r)=>sum+(r.stats[key]||0),0);if(measured>(career(world)?.[key]||0))throw fail('XP accuracy exceeds lifetime mode measurements');}
 }
}
function validateRankedProgression(world,previous){
 try{XP.validateRanked(world.ranked,previous?.ranked);}catch(e){throw fail(e.message);}
 const results=world.rankedResults,oldResults=previous?.rankedResults;
 for(const [id,r]of Object.entries(world.progression?.awards||{}))if(r.kind==='ranked'){
  const rows=results?.[id]?.rows;if(!Array.isArray(rows)||!rows.some(row=>row?.type==='human'&&row.participantId===r.participantId)||!world.ranked?.participants?.[r.participantId]?.awards?.[id])throw fail('Ranked XP lacks its immutable ELO result evidence');
 }
 if(results===undefined){if(oldResults||Object.values(world.ranked?.participants||{}).some(p=>Object.keys(p.awards||{}).length))throw fail('Ranked result evidence was removed');return;}
 if(!record(results))throw fail('Invalid ranked result registry');
 for(const [id,result]of Object.entries(oldResults||{}))if(!isDeepStrictEqual(results[id],result))throw fail('Finalized ranked result changed');
 const bots=new Map(Object.entries(world.bots||{}).map(([name,b])=>[b.profile?.id,{name,bot:b}]));
 const added=new Map(),completed=new Map(),knownParticipants=new Set();
 for(const [id,result]of Object.entries(results)){
  if(id!==result?.matchId||!id.startsWith('match:')||id.length>200||result.sessionType!=='ranked'||result.mode!=='tdm'||result.eligible!==true||result.practice!==false||![0,1].includes(result.winnerTeam)||!Number.isFinite(result.at)||result.at<=0||!Array.isArray(result.rows)||result.rows.length!==10)throw fail('Invalid canonical ranked match evidence');
  const ids=new Set(),teams=[0,0];let humans=0;
  for(const row of result.rows){
   const participantId=row?.participantId;
   if(typeof participantId!=='string'||!participantId||participantId.length>180||ids.has(participantId)||!['human','bot'].includes(row.type)||![0,1].includes(row.team)||(row.type==='bot'?!bots.has(participantId):bots.has(participantId)))throw fail('Invalid ranked participant identity');
   ids.add(participantId);knownParticipants.add(participantId);teams[row.team]++;if(row.type==='human')humans++;
   const history=completed.get(participantId)||[];history.push(row);completed.set(participantId,history);
   const receipt=world.ranked?.participants?.[participantId]?.awards?.[id];
   if(!receipt||receipt.participantId!==participantId||receipt.kind!=='ranked'||receipt.mode!=='tdm'||receipt.sessionType!=='ranked'||receipt.eligible!==true||receipt.practice!==false||receipt.at!==result.at||!isDeepStrictEqual(receipt.stats,row.stats)||!isDeepStrictEqual(receipt.events,row.events)||!isDeepStrictEqual(receipt.leaders,row.leaders)||receipt.won!==(row.team===result.winnerTeam)||row.won!==receipt.won)throw fail('Ranked award differs from the immutable match');
   for(const [key,stat]of [['kills','kills'],['assists','assists'],['alive','timeAlive']])if(row.leaders?.[key]!==(row.stats?.[stat]===Math.max(...result.rows.map(r=>r.stats?.[stat]))))throw fail('Ranked leader award differs from resolved standings');
   if(row.type==='human'){
    const xp=world.progression?.awards?.[id];
    if(!xp||xp.participantId!==participantId||xp.kind!=='ranked'||!isDeepStrictEqual(xp.stats,row.stats)||!isDeepStrictEqual(xp.events,row.events)||!isDeepStrictEqual(xp.leaders,row.leaders)||xp.won!==row.won)throw fail('Ranked human XP differs from the immutable match');
   }
   if(!Object.hasOwn(oldResults||{},id)){
    if(row.events.usedWeapons.some(name=>!Object.hasOwn(world.patchState.weaponStats,name)))throw fail('Unknown ranked weapon');
    const rows=added.get(participantId)||[];rows.push({id,row});added.set(participantId,rows);
    const career=row.type==='human'?world.playerCareer:bots.get(participantId).bot.career;
    const history=row.type==='human'?career.recentMatches:bots.get(participantId).bot.recentMatches;
    const recent=history?.find(r=>r.matchId===id);
    if(recent&&(recent.sessionType!=='ranked'||recent.mode!=='tdm'||recent.eligible!==true||recent.won!==row.won||['kills','deaths','damage'].some(k=>recent[k]!==row.stats[k])))throw fail('Ranked result differs from the completed career match');
   }
  }
  if(teams[0]!==5||teams[1]!==5||humans>1)throw fail('Ranked result requires the canonical five-versus-five roster');
 }
 for(const [participantId,p]of Object.entries(world.ranked?.participants||{})){
  if(!knownParticipants.has(participantId)&&Object.keys(p.awards||{}).length)throw fail('Ranked participant lacks completed match evidence');
  for(const id of Object.keys(p.awards||{}))if(!results[id]?.rows.some(r=>r.participantId===participantId))throw fail('Ranked reward lacks its immutable match');
 }
 for(const [participantId,rows]of added){
  const human=rows[0].row.type==='human',name=bots.get(participantId)?.name;
  const next=human?world.playerCareer:world.bots[name].career,old=human?previous?.playerCareer:previous?.bots?.[name]?.career;
  if(rows.length>(next?.games||0)-(old?.games||0))throw fail('Ranked ELO requires newly completed eligible games');
 }
 // Combat totals are checkpointed while a match is active. A final receipt
 // contains its whole match, not merely the combat since the latest sync.
 for(const [participantId,rows]of completed){
  const career=rows[0].type==='human'?world.playerCareer:bots.get(participantId).bot.career;
  if(rows.length>career.games)throw fail('Ranked history exceeds completed career games');
  for(const key of statsKeys){const measured=rows.reduce((sum,row)=>sum+(row.stats[key]||0),0),total=career[key]||0;if(measured>total+Math.max(.0001,Math.abs(total)*1e-9))throw fail('Ranked measurements exceed lifetime career totals');}
 }
}
function validateRewardOwnership(userId,world,previous){
 for(const [,r]of fresh(world.progression,previous?.progression))if(r.rulesVersion>=2&&r.participantId!==userId)throw fail('XP belongs to a different account');
 for(const [id,result]of Object.entries(world.rankedResults||{}))if(!Object.hasOwn(previous?.rankedResults||{},id))for(const row of result.rows)if(row.type==='human'&&row.participantId!==userId)throw fail('Ranked result belongs to a different account');
}
function validateTournamentProgression(db,userId,world,previous){
 for(const [id,r]of fresh(world.progression,previous?.progression)){
  if(r.kind!=='official')continue;
  const t=Circuit.getTournament(db,userId,r.tournamentId),series=t.series.find(s=>s.id===r.seriesId),roster=series?(Circuit.gameRoster?.(t,series,id)||t.teams):[],team=roster.find(t=>t.participants.some(p=>p.id===userId));
  if(t.kind!=='official'||!series||!team||!series.teamIds.includes(team.id))throw fail('XP is only available in your official tournament games');
  const completed=db.prepare('SELECT result_json FROM tournament_matches WHERE id=? AND tournament_id=? AND series_id=?').get(id,t.id,series.id);
  if(!completed){
   // World sync can arrive just before the resolved game upload. Authorize only
   // the one registered, active game ID; retries retain the same transaction.
   const playable=Circuit.canPlaySeries(series,t);
   if(t.status!=='ACTIVE'||!playable||id!==series.id+':game'+(series.games.length+1))throw fail('Tournament XP requires a registered game');
   if(t.schedulePolicy){const scheduled=t.scheduling?.games?.[id];if(!scheduled||scheduled.startedAt==null||scheduled.finalizedAt||scheduled.error||!scheduled.teams?.some(team=>team.participants.some(p=>p.id===userId&&p.kind==='user')))throw fail('Tournament XP requires your actual scheduled game participation');}
  }else{
   const result=JSON.parse(completed.result_json),player=result.stats.find(s=>s.participantId===userId);
   if(!player||['kills','deaths','assists','damage','headshots','timeAlive'].some(k=>player[k]!==r.stats[k])||r.won!==(result.winnerTeamId===team.id))throw fail('Tournament XP differs from the resolved game');
  }
 }
}
module.exports={validateProgression,validateRankedProgression,validateRewardOwnership,validateTournamentProgression};
