(function(root){
 'use strict';
 // A projection of existing completed participation records. It never writes a
 // career, reward, rank, match identity or tournament result.
 const fields=['kills','deaths','assists','damage','headshots','shots','hits'];
 const count=value=>Number.isSafeInteger(value)&&value>=0;
 const measured=(key,value)=>key==='damage'?Number.isFinite(value)&&value>=0:count(value);
 const identity=value=>typeof value==='string'&&value.length>0&&value.length<=200;
 const ordinary=(mode,queue,eligible,practice)=>!practice&&eligible!==false&&((queue==='standard'&&['tdm','deathmatch'].includes(mode))||(queue==='ranked'&&mode==='tdm'&&eligible===true));
 const copyStats=row=>Object.fromEntries(fields.map(key=>[key,measured(key,row?.[key])?row[key]:null]));
 function project(world,options={}){
  const participantId=options.participantId,kind=options.kind==='ranked'?'ranked':'combined',scope=options.scope==='season'?'season':'lifetime';
  const botEntry=Object.entries(world?.bots||{}).find(([,bot])=>bot.profile?.id===participantId),botName=botEntry?.[0],human=!botEntry;
  // The caller supplies its already-authorized account world. A different human
  // profile cannot borrow that world's account-owned receipts or career rows.
  const savedHumans=new Set(Object.values(world?.progression?.awards||{}).map(r=>r.participantId).filter(identity));
  const authorized=!human||(!options.accountId||options.accountId===participantId)&&(!savedHumans.size||savedHumans.has(participantId));
  const seasons=human?world?.playerSeasons:world?.seasons,seasonList=[seasons?.current,...(seasons?.history||[])].filter(Boolean);
  const seasonNumber=options.seasonNumber??seasons?.current?.number,season=seasonList.find(row=>row.number===Number(seasonNumber));
  const validSeason=!!season&&Number.isFinite(season.startAt)&&Number.isFinite(season.endAt)&&season.endAt>season.startAt;
  const all=new Map(),conflicting=new Set();let missingIdentity=0,unclassified=0,unknownSeason=0;
  function add(id,row,source){
   if(!ordinary(row.mode,row.queue,row.eligible,row.practice)){if(!row.mode||!row.queue)unclassified++;return;}
   if(kind==='ranked'&&row.queue!=='ranked')return;
   if(!identity(id)){missingIdentity++;return;}
   const stats=copyStats(row.stats),won=[true,false,null].includes(row.won)?row.won:undefined;
   const next={matchId:id,participantId,mode:row.mode,queue:row.queue,at:Number.isFinite(row.at)&&row.at>0?row.at:null,won,stats,sources:[source]};
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
   for(const [id,row]of Object.entries(world?.ranked?.participants?.[participantId]?.awards||{}))add(id,{mode:row.mode,queue:row.sessionType,eligible:row.eligible,practice:row.practice,at:row.at,won:row.won,stats:row.stats},'ranked-receipt');
   if(human)for(const [id,row]of Object.entries(world?.progression?.awards||{})){
    if(row.participantId!==undefined&&row.participantId!==participantId||!['standard','ranked'].includes(row.kind))continue;
    add(id,{mode:row.mode,queue:row.sessionType||row.kind,eligible:row.eligible,practice:row.practice,at:row.at,won:row.won,stats:row.stats},'xp-receipt');
   }
   // Immutable ranked evidence can supplement old receipts only with that
   // participant's actual resolved row, never a share of a team score.
   for(const [id,result]of Object.entries(world?.rankedResults||{})){
    const row=result.rows?.find(r=>r.participantId===participantId);if(!row)continue;
    add(id,{mode:result.mode,queue:result.sessionType,eligible:result.eligible,practice:result.practice,at:result.at,won:row.won,stats:row.stats},'ranked-result');
   }
   const career=human?world?.playerCareer:botEntry[1].career,recent=human?career?.recentMatches:botEntry[1].recentMatches;
   for(const row of recent||[])add(row.matchId,{mode:row.mode,queue:row.sessionType,eligible:row.eligible,practice:row.practice,at:row.at,won:row.won,stats:row},'tdm-recent');
   // Deathmatch result snapshots retain canonical IDs, outcomes and full rows.
   // Human/bot career summaries can overlap these snapshots and are not summed.
   for(const result of world?.modeStats?.deathmatch?.recentMatches||[]){
    const row=result.rows?.find(r=>r.participantId===participantId||!human&&r.sourceBotId===participantId);if(!row)continue;
    const winners=result.winnerIds||[],won=winners.includes(row.id)?(winners.length===1?true:null):winners.length?false:null;
    add(result.matchId,{mode:result.mode,queue:result.sessionType,eligible:result.eligible,practice:result.practice,at:result.endedAtWall??result.at??result.xp?.at,won,stats:row},'deathmatch-result');
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
   const key=row.mode+':'+row.queue,item=modes.get(key)||{mode:row.mode,queue:row.queue,label:row.queue==='ranked'?'Ranked TDM':row.mode==='deathmatch'?'Casual Deathmatch':'Casual TDM',games:0};item.games++;modes.set(key,item);
  }
  for(const key of fields)totals[key]=missingMeasurements[key]?null:knownTotals[key];
  const outcomes=totals.wins+totals.losses+totals.draws,zeroDeaths=totals.deaths===0&&totals.kills>0;
  const ratios={kd:totals.kills===null||totals.deaths===null||zeroDeaths?null:totals.deaths?totals.kills/totals.deaths:0,accuracy:totals.shots===null||totals.hits===null||!totals.shots?null:totals.hits/totals.shots,winRate:outcomes?totals.wins/outcomes:null};
  const career=human?world?.playerCareer:botEntry?.[1]?.career,dmCareer=human?world?.modeStats?.deathmatch?.player:world?.modeStats?.deathmatch?.bots?.[botName];
  const rankedGames=Object.keys(world?.ranked?.participants?.[participantId]?.awards||{}).length;
  const expectedGames=scope==='lifetime'&&authorized?(kind==='ranked'?rankedGames:(count(career?.games)?career.games:0)+(count(dmCareer?.games)?dmCareer.games:0)):null;
  const missingGames=expectedGames===null?null:Math.max(0,expectedGames-records.length);
  return {participantId,kind,scope,season:scope==='season'&&validSeason?{number:season.number,startAt:season.startAt,endAt:season.endAt}:null,totals,knownTotals,ratios,zeroDeaths,outcomes,included:[...modes.values()],records,
   policy:{included:kind==='ranked'?['Ranked TDM']:['Casual TDM','Casual Deathmatch','Ranked TDM'],excluded:['Official tournaments','Custom matches','Practice'],tournamentStatsSeparate:true},
   coverage:{authorized,recordedGames:records.length,expectedGames,missingGames,missingIdentity,unclassified,conflictingRecords:conflicting.size,unknownSeason,unknownOutcomes,missingMeasurements,accuracyGames:records.filter(r=>r.stats.shots!==null&&r.stats.hits!==null).length,seasonAvailable:scope==='lifetime'||validSeason,complete:scope==='lifetime'&&missingGames===0&&missingIdentity===0&&unclassified===0&&conflicting.size===0,source:'Unique saved completed match participation; no career-summary addition'}};
 }
 const api={project};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARProfileStats=api;
})(typeof window!=='undefined'?window:globalThis);
