(function(root){
 'use strict';
 // A mode describes participation and eligibility. It never changes weapon rules.
 const entries=new Map();
 function register(id,definition){
  if(typeof id!=='string'||!id||entries.has(id))throw Error('Duplicate or invalid match mode');
  if(!['tdm','deathmatch'].includes(definition.mode)||!['standard','ranked'].includes(definition.sessionType)||definition.ranked&&definition.mode!=='tdm')throw Error('Unsupported match rules');
  const value=Object.freeze({id,...definition});entries.set(id,value);return value;
 }
 register('tdm',{mode:'tdm',sessionType:'standard',label:'Team Deathmatch',bots:true,humans:true,officialStats:true,ranked:false,participants:10,teamSize:5,target:60,durationMs:300000});
 register('deathmatch',{mode:'deathmatch',sessionType:'standard',label:'Deathmatch',bots:true,humans:true,officialStats:true,ranked:false,participants:10,teamSize:1,target:30,durationMs:240000});
 register('ranked-tdm',{mode:'tdm',sessionType:'ranked',label:'Ranked TDM',bots:true,humans:true,officialStats:true,ranked:true,participants:10,teamSize:5,target:60,durationMs:300000});
 const get=id=>entries.get(id)||null;
 function resolve(match){return [...entries.values()].find(r=>r.mode===match?.mode&&r.sessionType===match?.sessionType)||null;}
 const officialStats=match=>!!(match?.eligible===true&&!match.practice&&resolve(match)?.officialStats);
 const ranked=match=>officialStats(match)&&resolve(match)?.ranked===true;
 const botEligible=(actor,id)=>!!(get(id)?.bots&&actor?.isPlayer===false&&actor.profile?.id&&!actor.sandbox&&!actor.officialReservation);
 const api={register,get,resolve,officialStats,ranked,botEligible,list:()=>[...entries.values()]};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARMatchModes=api;
})(typeof window!=='undefined'?window:globalThis);
