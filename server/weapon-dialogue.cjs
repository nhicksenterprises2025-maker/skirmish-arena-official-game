'use strict';
// Reuse the shipped game's exact Gun Score implementation without advancing it.
const {engine}=require('../dev/simulate.cjs');
let scorer=null,lastKey='',lastRows=[];
function runtime(){return scorer||(scorer=engine());}
function registry(){return runtime().context.SAR.getWeapons();}
function balanceNotes(){return runtime().context.SAR.getBalanceNotes();}
function publicQueries(world,options={}){
  const e=runtime(),save=e.dev.inspect().SAVE;
  // Only public aggregate state enters this dormant scorer. Never advance its
  // simulation or copy account configuration, positions, inventory or messages.
  save.patchState=world.patchState;
  for(const [name,bot] of Object.entries(world.bots||{})){
    if(!save.bots[name])continue;
    Object.assign(save.bots[name].career,bot.career);
    save.bots[name].profile=bot.profile;save.bots[name].recentForm=bot.recentForm;
  }
  const leaderboard=e.context.SAR.botLeaderboardRows({sort:options.sort||{key:'kd',dir:-1}});
  let meta=[];
  const scope=world.patchState?.participantAnalytics?.samples?.[world.aiRevision]?.[options.mode||'tdm']?.[options.cohort||'bot'];
  if(scope)meta=e.context.SAR.metaRowsForCohort({mode:options.mode||'tdm',cohort:options.cohort||'bot',sort:{key:'score',dir:-1}});
  return {leaderboard,meta,sample:scope||null};
}
function scores(patch){const key=JSON.stringify([patch.id,patch.meta,patch.powerBands]);if(key===lastKey)return lastRows;if(!scorer)scorer=engine();const save=scorer.dev.inspect().SAVE;save.patchState=patch;for(const name of Object.keys(save.meta))Object.assign(save.meta[name],patch.meta[name]||{kills:0,deaths:0,shots:0,hits:0,damage:0,equippedTime:0});lastRows=scorer.context.SAR.getWeaponScores().map(r=>({...r,category:patch.weaponStats[r.name]?.type||null,sampled:(patch.meta[r.name]?.kills||0)+(patch.meta[r.name]?.deaths||0)>=5}));lastKey=key;return lastRows;}
function ranking(patch,type){return scores(patch).filter(r=>r.category===type&&r.sampled).sort((a,b)=>b.score-a.score);}
module.exports={scores,ranking,registry,publicQueries,balanceNotes};
