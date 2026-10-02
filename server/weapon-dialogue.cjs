'use strict';
// Reuse the shipped game's exact Gun Score implementation without advancing it.
const {engine}=require('../dev/simulate.cjs');
let scorer=null,lastKey='',lastRows=[];
function scores(patch){const key=JSON.stringify([patch.id,patch.meta,patch.powerBands]);if(key===lastKey)return lastRows;if(!scorer)scorer=engine();const save=scorer.dev.inspect().SAVE;save.patchState=patch;for(const name of Object.keys(save.meta))Object.assign(save.meta[name],patch.meta[name]||{kills:0,deaths:0,shots:0,hits:0,damage:0,equippedTime:0});lastRows=scorer.context.SAR.getWeaponScores().map(r=>({...r,category:patch.weaponStats[r.name]?.type||null,sampled:(patch.meta[r.name]?.kills||0)+(patch.meta[r.name]?.deaths||0)>=5}));lastKey=key;return lastRows;}
function ranking(patch,type){return scores(patch).filter(r=>r.category===type&&r.sampled).sort((a,b)=>b.score-a.score);}
module.exports={scores,ranking};
