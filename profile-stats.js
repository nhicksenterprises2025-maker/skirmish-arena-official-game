(function(root){
 'use strict';
 // A projection of existing completed participation records. It never writes a
 // career, reward, rank, match identity or tournament result.
 const standardModes=['tdm','deathmatch','gun-game','domination','hardpoint'];
 const recordModes=world=>[...standardModes.filter(mode=>mode!=='tdm'),...Object.keys(world?.modeStats||{}).filter(id=>id.startsWith('ltm:'))];
 const labels={tdm:'TDM',deathmatch:'Deathmatch','gun-game':'Gun Game',domination:'Domination',hardpoint:'Hardpoint'};
 const fields=['kills','deaths','assists','damage','taken','headshots','shots','hits','timeAlive','timePlayed'];
 const count=value=>Number.isSafeInteger(value)&&value>=0;
 const measured=(key,value)=>['damage','taken','timeAlive','timePlayed'].includes(key)?Number.isFinite(value)&&value>=0:count(value);
 const identity=value=>typeof value==='string'&&value.length>0&&value.length<=200;
 const ordinary=(mode,queue,eligible,practice)=>!practice&&eligible!==false&&((['standard','ltm'].includes(queue)&&standardModes.includes(mode))||(queue==='ranked'&&['tdm','deathmatch'].includes(mode)&&eligible===true));
 const copyStats=row=>Object.fromEntries(fields.map(key=>{const value=key==='taken'?row?.taken??row?.damageTaken:row?.[key];return [key,measured(key,value)?value:null];}));
 // Only finalized, account-owned official game records are projected. In-flight
 // checkpoints, tournament summaries and XP receipts are not result evidence.
 function officialParticipations(events,participantId){
  if(!identity(participantId))return [];
  const records=[];
  for(const event of Array.isArray(events)?events:[]){
   if(event?.kind!=='official'||event.practice||event.debug||event.statisticsEligible===false)continue;
   for(const series of event.series||[])for(const game of series.games||[]){
    if(!identity(game?.id)||!Number.isFinite(game.completedAt)||game.completedAt<=0||game.practice||game.debug||game.statisticsEligible===false||game.mode&&game.mode!=='tdm'||game.sessionType&&game.sessionType!=='tournament')continue;
    const rows=(game.stats||[]).filter(row=>row.participantId===participantId);if(rows.length!==1)continue;
    // A per-game roster snapshot preserves no-show ownership. Historical games
    // without one may use the original roster only if it has never changed.
    const teams=game.teams||(!(event.replacementHistory||[]).length?event.teams:[]),team=teams?.find(team=>team.participants?.some(person=>person.id===participantId));
    const won=team&&identity(game.winnerTeamId)?team.id===game.winnerTeamId:undefined;
    records.push({matchId:game.id,participantId,tournamentId:event.id,seriesId:series.id,mode:'tdm',queue:'tournament',official:true,finalized:true,at:game.completedAt,won,stats:copyStats(rows[0])});
   }
  }
  return records;
 }
 function project(world,options={}){
  const participantId=options.participantId,kind=options.kind==='ranked'?'ranked':'combined',scope=options.scope==='season'?'season':'lifetime';
  const botEntry=Object.entries(world?.bots||{}).find(([,bot])=>bot.profile?.id===participantId),botName=botEntry?.[0],human=!botEntry;
  // The caller supplies its already-authorized account world. A different human
  // profile cannot borrow that world's account-owned receipts or career rows.
  const savedHumans=new Set(Object.values(world?.progression?.awards||{}).map(r=>r.participantId).filter(identity));
  const authorized=!human||(!options.accountId||options.accountId===participantId)&&(!savedHumans.size||savedHumans.has(participantId));
  const seasons=human?world?.playerSeasons:world?.seasons,seasonList=[seasons?.current,...(seasons?.history||[])].filter(Boolean);
  const seasonNumber=options.seasonNumber??seasons?.current?.number,season=kind==='ranked'&&human&&options.seasonWindow!==undefined?options.seasonWindow:seasonList.find(row=>row.number===Number(seasonNumber));
  const validSeason=!!season&&Number.isFinite(season.startAt)&&Number.isFinite(season.endAt)&&season.endAt>season.startAt;
  const all=new Map(),conflicting=new Set(),officialIds=new Set();let missingIdentity=0,unclassified=0,unknownSeason=0;
  function add(id,row,source){
   if(row.queue==='ltm'&&row.ltmDefinition?.statEligible!==true)return;
   const resolvedAbandonment=source==='server-multiplayer-ledger'&&row.authority==='server-multiplayer'&&row.abandoned===true&&row.finalized===true;
   if(row.debug||row.completed===false&&!resolvedAbandonment||row.finalized===false&&row.queue==='tournament')return;
   const official=row.queue==='tournament'&&row.official===true&&row.finalized===true&&row.mode==='tdm'&&row.participantId===participantId&&!row.practice&&!row.debug;
   if(!(kind==='combined'&&official)&&!ordinary(row.mode,row.queue,row.eligible,row.practice)){if(!row.mode||!row.queue)unclassified++;return;}
   if(kind==='ranked'&&row.queue!=='ranked')return;
   if(!identity(id)){missingIdentity++;return;}
   // A copied tournament result in an ordinary receipt/recent list is still
   // that one official game, never another TDM or Ranked participation.
   if(officialIds.has(id)&&!official)return;
   if(official)officialIds.add(id);
   const stats=copyStats(row.stats),won=[true,false,null].includes(row.won)?row.won:undefined;
   const next={matchId:id,participantId,mode:row.mode,queue:row.queue,at:Number.isFinite(row.at)&&row.at>0?row.at:null,won,stats,...(row.ltmDefinition?{ltmDefinition:clone(row.ltmDefinition)}:{}),abandoned:!!row.abandoned,sources:[source]};
   const old=all.get(id);
   if(!old){all.set(id,next);return;}
   // Duplicate reward tracks and retained result rows describe one participation.
   // Only supplement absent measurements; conflicting facts are never summed.
   if(old.mode!==next.mode||old.queue!==next.queue||old.won!==undefined&&won!==undefined&&old.won!==won){conflicting.add(id);return;}
   for(const key of fields)if(old.stats[key]!==null&&stats[key]!==null&&Math.abs(old.stats[key]-stats[key])>Math.max(.0001,Math.abs(old.stats[key])*1e-9)){conflicting.add(id);return;}
   for(const key of fields)if(old.stats[key]===null&&stats[key]!==null)old.stats[key]=stats[key];
   if(old.won===undefined)old.won=won;if(old.at===null)old.at=next.at;old.sources.push(source);
  }
  if(identity(participantId)&&authorized){
   for(const row of options.networkRecords||[])if(row.participantId===participantId&&row.eligible===true)add(row.matchId,{...row,queue:row.sessionType,practice:row.input?.practice,official:row.kind==='official',finalized:true},'server-multiplayer-ledger');
   if(kind==='combined')for(const row of options.officialRecords||[])add(row.matchId,row,'official-tournament-ledger');
   for(const [id,row]of Object.entries(world?.ranked?.participants?.[participantId]?.awards||{}))add(id,{mode:row.mode,queue:row.sessionType,eligible:row.eligible,practice:row.practice,debug:row.debug,completed:row.completed,at:row.at,won:row.won,stats:row.stats},'ranked-receipt');
   if(human)for(const [id,row]of Object.entries(world?.progression?.awards||{})){
    if(row.participantId!==undefined&&row.participantId!==participantId||!['standard','ranked'].includes(row.kind))continue;
    add(id,{mode:row.mode,queue:row.sessionType||row.kind,ltmDefinition:row.ltmDefinition,eligible:row.eligible,practice:row.practice,debug:row.debug,completed:row.completed,at:row.at,won:row.won,stats:row.stats},'xp-receipt');
   }
   // Immutable ranked evidence can supplement old receipts only with that
   // participant's actual resolved row, never a share of a team score.
   for(const [id,result]of Object.entries(world?.rankedResults||{})){
    const row=result.rows?.find(r=>r.participantId===participantId);if(!row)continue;
    add(id,{mode:result.mode,queue:result.sessionType,ltmDefinition:result.ltmDefinition||result.context?.ltmDefinition,eligible:result.eligible,practice:result.practice,debug:result.debug,completed:result.completed,at:result.at,won:row.won,stats:row.stats},'ranked-result');
   }
   const career=human?world?.playerCareer:botEntry[1].career,recent=human?career?.recentMatches:botEntry[1].recentMatches;
   for(const row of recent||[])add(row.matchId,{mode:row.mode,queue:row.sessionType,eligible:row.eligible,practice:row.practice,debug:row.debug,completed:row.completed,at:row.at,won:row.won,stats:row},'tdm-recent');
   // Deathmatch result snapshots retain canonical IDs, outcomes and full rows.
   // Human/bot career summaries can overlap these snapshots and are not summed.
   for(const scope of recordModes(world))for(const result of world?.modeStats?.[scope]?.recentMatches||[]){
    const mode=result.mode||scope;
    const row=result.rows?.find(r=>r.participantId===participantId||!human&&r.sourceBotId===participantId);if(!row)continue;
    const winners=result.winnerIds||[],won=[true,false,null].includes(row.won)?row.won:['tdm','domination','hardpoint'].includes(mode)?(result.winner===null?null:row.team===result.winner):winners.includes(row.id)?(winners.length===1?true:null):winners.length?false:null;
    add(result.matchId,{mode,queue:result.sessionType,ltmDefinition:result.ltmDefinition||result.context?.ltmDefinition,eligible:result.eligible,practice:result.practice,debug:result.debug,completed:result.completed,at:result.endedAtWall??result.at??result.xp?.at,won,stats:row},mode+'-result');
   }
  }
  const records=[...all.values()].filter(row=>{
   if(conflicting.has(row.matchId))return false;
   if(scope==='lifetime')return true;
   if(!validSeason)return false;
   if(row.at===null){unknownSeason++;return false;}
   return row.at>=season.startAt&&row.at<season.endAt;
  }).sort((a,b)=>(a.at||0)-(b.at||0)||a.matchId.localeCompare(b.matchId));
  const totals={games:records.length,wins:0,losses:0,draws:0,...Object.fromEntries(fields.map(key=>[key,0]))};
  const knownTotals=Object.fromEntries(fields.map(key=>[key,0])),missingMeasurements=Object.fromEntries(fields.map(key=>[key,0]));
  const modes=new Map();let unknownOutcomes=0;
  for(const row of records){
   if(row.won===true)totals.wins++;else if(row.won===false)totals.losses++;else if(row.won===null)totals.draws++;else unknownOutcomes++;
   for(const key of fields)if(row.stats[key]===null)missingMeasurements[key]++;else knownTotals[key]+=row.stats[key];
   const key=row.mode+':'+row.queue+(row.ltmDefinition?':'+row.ltmDefinition.id:''),item=modes.get(key)||{mode:row.mode,queue:row.queue,label:row.queue==='ltm'?(row.ltmDefinition?.name||'Limited-time mode'):row.queue==='tournament'?'Official Tournaments':row.queue==='ranked'?'Ranked '+labels[row.mode]:'Casual '+labels[row.mode],games:0};item.games++;modes.set(key,item);
  }
  for(const key of fields)totals[key]=missingMeasurements[key]?null:knownTotals[key];
  const outcomes=totals.wins+totals.losses+totals.draws,zeroDeaths=totals.deaths===0&&totals.kills>0;
  const ratios={kd:totals.kills===null||totals.deaths===null||zeroDeaths?null:totals.deaths?totals.kills/totals.deaths:0,accuracy:totals.shots===null||totals.hits===null||!totals.shots?null:totals.hits/totals.shots,winRate:outcomes?totals.wins/outcomes:null,headshotKillRate:totals.headshots===null||totals.kills===null||!totals.kills?null:totals.headshots/totals.kills};
  const career=human?world?.playerCareer:botEntry?.[1]?.career,modeGames=recordModes(world).reduce((sum,mode)=>sum+((human?world?.modeStats?.[mode]?.player?.games:world?.modeStats?.[mode]?.bots?.[botName]?.games)||0),0);
  const rankedGames=Object.keys(world?.ranked?.participants?.[participantId]?.awards||{}).length;
  const networkOnlyGames=[...all.values()].filter(row=>row.queue!=='tournament'&&row.sources.every(source=>source==='server-multiplayer-ledger')).length;
  const expectedGames=scope==='lifetime'&&authorized?(kind==='ranked'?rankedGames+networkOnlyGames:(count(career?.games)?career.games:0)+(count(modeGames)?modeGames:0)+officialIds.size+networkOnlyGames):null;
  const missingGames=expectedGames===null?null:Math.max(0,expectedGames-records.length);
  return {participantId,kind,scope,season:scope==='season'&&validSeason?{number:season.number,startAt:season.startAt,endAt:season.endAt}:null,totals,knownTotals,ratios,zeroDeaths,outcomes,included:[...modes.values()],records,
   policy:{included:kind==='ranked'?['Ranked TDM','Ranked Deathmatch']:['Casual TDM','Casual Deathmatch','Casual Gun Game','Casual Domination','Casual Hardpoint','Ranked TDM','Ranked Deathmatch','Official Tournaments','Eligible limited-time modes'],excluded:kind==='ranked'?['Official tournaments','Custom matches','Custom tournaments','Practice','Debug/test']:['Custom matches','Custom tournaments','Practice','Debug/test'],tournamentStatsSeparate:true},
   coverage:{authorized,recordedGames:records.length,expectedGames,missingGames,missingIdentity,unclassified,conflictingRecords:conflicting.size,unknownSeason,unknownOutcomes,missingMeasurements,accuracyGames:records.filter(r=>r.stats.shots!==null&&r.stats.hits!==null).length,officialAvailable:options.officialAvailable!==false,officialMissingGames:count(options.officialMissingGames)?options.officialMissingGames:0,seasonAvailable:scope==='lifetime'||validSeason,complete:scope==='lifetime'&&missingGames===0&&missingIdentity===0&&unclassified===0&&conflicting.size===0&&(kind==='ranked'||options.officialAvailable!==false&&!(options.officialMissingGames>0)),source:'Unique saved completed match participation; no career-summary addition'}};
 }
 const clone=value=>JSON.parse(JSON.stringify(value));
 function displayRecords(world,{participantId,accountId,networkRecords=[]}={}){
  if(!identity(participantId)||accountId&&accountId!==participantId)return [];
  const known=new Set();for(const [id,row]of Object.entries(world?.progression?.awards||{}))if(!row.participantId||row.participantId===participantId)known.add(id);
  for(const id of Object.keys(world?.ranked?.participants?.[participantId]?.awards||{}))known.add(id);
  for(const row of world?.playerCareer?.recentMatches||[])if(identity(row.matchId))known.add(row.matchId);
  for(const scope of recordModes(world))for(const result of world?.modeStats?.[scope]?.recentMatches||[])if(result.rows?.some(row=>row.participantId===participantId))known.add(result.matchId);
  const records=[];for(const row of networkRecords){if(row?.authority!=='server-multiplayer'||row.participantId!==participantId||!identity(row.matchId)||known.has(row.matchId)||!ordinary(row.mode,row.sessionType,row.eligible,row.practice||row.input?.practice)||row.eligible!==true||row.debug||row.completed===false&&!row.abandoned)continue;known.add(row.matchId);records.push(row);}
  return records.sort((a,b)=>(a.at||0)-(b.at||0)||a.matchId.localeCompare(b.matchId));
 }
 function displayCareer(world,options={}){
  const mode=standardModes.includes(options.mode)?options.mode:'tdm',base=mode==='tdm'?world?.playerCareer:world?.modeStats?.[mode]?.player;
  const career=clone(base||{name:'YOU',games:0,wins:0,losses:0,...Object.fromEntries(fields.map(key=>[key,0])),weapons:{},recentMatches:[]});career.weapons??={};career.recentMatches??=[];
  for(const record of displayRecords(world,options).filter(row=>row.mode===mode&&row.sessionType!=='ltm')){
   const stats=copyStats(record.stats);career.games=(career.games||0)+1;const outcome=record.won===true?'wins':record.won===false?'losses':'draws';career[outcome]=(career[outcome]||0)+1;
   for(const key of fields)if(stats[key]!==null)career[key]=(career[key]||0)+stats[key];career.bestKills=Math.max(career.bestKills||0,stats.kills||0);career.bestDamage=Math.max(career.bestDamage||0,stats.damage||0);career.bestStreak=Math.max(career.bestStreak||0,record.events?.bestStreak||0);
   career.currentWinStreak=record.won===true?(career.currentWinStreak||0)+1:0;career.bestWinStreak=Math.max(career.bestWinStreak||0,career.currentWinStreak);
   const kd=(stats.kills||0)/Math.max(1,stats.deaths||0),best=career.bestKdGame;if(!best||kd>best.kd||kd===best.kd&&(stats.kills||0)>best.kills)career.bestKdGame={kd,kills:stats.kills||0,deaths:stats.deaths||0,at:record.at};
   for(const [name,sample]of Object.entries(record.weaponStats||{})){
    const target=career.weapons[name]??={k:0,d:0,picks:0,games:0,damage:0,shots:0,hits:0,headshots:0,equippedTime:0};
    for(const key of ['k','d','picks','damage','shots','hits','headshots','equippedTime']){const value=sample[key]??sample[key==='k'?'kills':key==='d'?'deaths':key];if(Number.isFinite(value)&&value>=0)target[key]=(target[key]||0)+value;}if(sample.picks>0||sample.equippedTime>0)target.games=(target.games||0)+1;
   }
   const names=Object.keys(record.weaponStats||{}),primary=record.primary||names.find(name=>world?.patchState?.weaponStats?.[name]?.type==='primary')||null,sidearm=record.sidearm||names.find(name=>world?.patchState?.weaponStats?.[name]?.type==='sidearm')||null;
   career.recentMatches.push({matchId:record.matchId,participantId:record.participantId,mode,sessionType:record.sessionType,eligible:true,practice:false,at:record.at,won:record.won,abandoned:!!record.abandoned,primary,sidearm,...stats});
  }
  career.recentMatches=career.recentMatches.slice(-30);return career;
 }
 function displaySeasons(world,options={}){
  const seasons=clone(world?.playerSeasons||{current:null,history:[]}),list=[seasons.current,...(seasons.history||[])].filter(Boolean);
  for(const record of displayRecords(world,options).filter(row=>row.mode==='tdm'&&row.sessionType!=='ltm')){
   const season=list.find(row=>Number.isFinite(record.at)&&record.at>=row.startAt&&record.at<row.endAt);if(!season)continue;season.stats??={};const stats=copyStats(record.stats),target=season.stats;
   target.games=(target.games||0)+1;const outcome=record.won===true?'wins':record.won===false?'losses':'draws';target[outcome]=(target[outcome]||0)+1;for(const key of fields)if(stats[key]!==null)target[key]=(target[key]||0)+stats[key];
  }
  return seasons;
 }
 const api={project,officialParticipations,displayCareer,displaySeasons};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARProfileStats=api;
})(typeof window!=='undefined'?window:globalThis);
