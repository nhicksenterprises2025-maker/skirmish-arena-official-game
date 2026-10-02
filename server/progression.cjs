'use strict';
const XP=require('../progression.js'),Circuit=require('./tournaments.cjs');
const fail=message=>Object.assign(new Error(message),{status:409,code:'SAVE_REJECTED'});
const fresh=(p,old)=>Object.entries(p?.awards||{}).filter(([id])=>!Object.hasOwn(old?.awards||{},id));
function validateProgression(world,previous){
 const p=world.progression,old=previous?.progression;
 try{XP.validate(p,old);}catch(e){throw fail(e.message);}
 if(!p)return; // Older installed clients may checkpoint before upgrading.
 const names=Object.keys(world.patchState.weaponStats),added=fresh(p,old),discoveries=new Set(added.flatMap(([,r])=>r.firstWeapons)),known=new Set(old?.usedWeapons||(previous?XP.legacyWeapons(previous):p.usedWeapons.filter(w=>!discoveries.has(w))));
 for(const [id,r]of added){
  if(r.events.usedWeapons.some(w=>!names.includes(w)))throw fail('Unknown XP weapon');
  const expected=r.events.usedWeapons.filter(w=>!known.has(w)).sort();
  if(JSON.stringify(expected)!==JSON.stringify(r.firstWeapons))throw fail('First-use XP does not match account history');
  expected.forEach(w=>known.add(w));
  if(r.kind==='standard'){
   if(!id.startsWith('match:'))throw fail('Standard XP requires a standard match');
   const career=r.mode==='deathmatch'?world.modeStats?.deathmatch?.player:world.playerCareer;
   const record=career?.recentMatches?.find(m=>m.matchId===id);
   if(record){if(record.sessionType!=='standard'||record.mode!==r.mode||['kills','deaths','assists','damage','headshots'].some(k=>record[k]!==r.stats[k])||record.won!==(r.won===true))throw fail('XP differs from the completed match');}
  }else if(!r.tournamentId||!r.seriesId||r.mode!=='tdm'||r.winStreak!==0)throw fail('Invalid tournament XP context');
 }
 if(p.usedWeapons.some(w=>!names.includes(w)||!known.has(w))||[...known].some(w=>!p.usedWeapons.includes(w)))throw fail('Weapon discovery history changed');
 for(const mode of ['tdm','deathmatch']){
  const career=w=>mode==='tdm'?w?.playerCareer:w?.modeStats?.deathmatch?.player;
  const rows=added.filter(([,r])=>r.kind==='standard'&&r.mode===mode),games=(career(world)?.games||0)-(career(previous)?.games||0);
  if(rows.length>games)throw fail('XP requires newly completed standard games');
  if(rows.length&&old){let streak=career(previous)?.currentWinStreak||0;for(const [,r]of rows){streak=r.won?streak+1:0;if(r.winStreak!==streak)throw fail('XP win streak does not match standard results');}}
 }
}
function validateTournamentProgression(db,userId,world,previous){
 for(const [id,r]of fresh(world.progression,previous?.progression)){
  if(r.kind!=='official')continue;
  const t=Circuit.getTournament(db,userId,r.tournamentId),series=t.series.find(s=>s.id===r.seriesId),team=t.teams.find(t=>t.participants.some(p=>p.id===userId));
  if(t.kind!=='official'||!series||!team||!series.teamIds.includes(team.id))throw fail('XP is only available in your official tournament games');
  const completed=db.prepare('SELECT result_json FROM tournament_matches WHERE id=? AND tournament_id=? AND series_id=?').get(id,t.id,series.id);
  if(!completed){
   // World sync can arrive just before the resolved game upload. Authorize only
   // the one registered, active game ID; retries retain the same transaction.
   if(t.status!=='ACTIVE'||series.winnerTeamId||id!==series.id+':game'+(series.games.length+1))throw fail('Tournament XP requires a registered game');
  }else{
   const result=JSON.parse(completed.result_json),player=result.stats.find(s=>s.participantId===userId);
   if(!player||['kills','deaths','assists','damage','headshots','timeAlive'].some(k=>player[k]!==r.stats[k])||r.won!==(result.winnerTeamId===team.id))throw fail('Tournament XP differs from the resolved game');
  }
 }
}
module.exports={validateProgression,validateTournamentProgression};
