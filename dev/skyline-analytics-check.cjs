/* Real combat events, explicit participant identity, additive analytics migration. */
'use strict';
const assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const {validateWorld}=require('../server/world.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const total=(rows,key)=>rows.reduce((sum,r)=>sum+Number(r.m[key]||0),0);
const query=(e,cohort,mode='tdm')=>e.context.SAR.metaRowsForCohort({cohort,mode});
const row=(e,cohort,name,mode='tdm')=>query(e,cohort,mode).find(r=>r.name===name).m;
const hit=(e,target,owner,weapon,amount,head=false)=>e.dev.applyDamage(target,{owner,weapon,travel:140},amount,head,e.dev.now()+1000);
function humanMatch(e){e.dev.queueForMatch();const state=e.dev.inspect().state,match=state.matches[state.playerMatchId];match.status='active';match.limit=500;return {state,match,player:state.actors.find(a=>a.isPlayer)};}
function open(e){for(let y=100;y<2700;y+=40)for(let x=100;x<3600;x+=40)if(!e.dev.collides(x,y)&&!e.dev.collides(x+100,y)&&e.dev.pathClear(x,y,x+100,y))return {x,y};throw Error('No firing lane');}
function conservation(e,mode='tdm'){
 const s=e.dev.inspect().SAVE,a=s.patchState.participantAnalytics,raw=mode==='tdm'?s.patchState.meta:s.modeStats.deathmatch.meta;
 for(const name of Object.keys(raw))for(const key of Object.keys(raw[name]).filter(k=>typeof raw[name][k]==='number'))near(raw[name][key],(a.legacy[mode][name]?.[key]||0)+row(e,'human',name,mode)[key]+row(e,'bot',name,mode)[key]);
 validateWorld(e.context.SAR.getUniverse());
}
{
 const e=engine();
 e.context.SARCloud.state={account:{id:'account-stable-719',username:'Display name changes'}};
 const {state,match,player}=humanMatch(e),enemy=state.actors.find(a=>a.matchId===match.id&&a.team!==player.team),ally=state.actors.find(a=>a.matchId===match.id&&a!==player&&a.team===player.team);
 const before=e.context.SAR.getUniverse(),humanKills=total(query(e,'human'),'kills'),botKills=total(query(e,'bot'),'kills'),enemyWeapon=enemy.slots[0].name;
 hit(e,enemy,player,'AR-15',1000,true);
 assert.equal(total(query(e,'human'),'kills')-humanKills,1);assert.equal(total(query(e,'bot'),'kills')-botKills,0);
 assert.equal(row(e,'human','AR-15').damage,250);assert.equal(row(e,'human','AR-15').headshots,1);assert.equal(row(e,'human','AR-15').soloKills,1);assert.equal(row(e,'human','AR-15').killDistance,140);
 assert.equal(row(e,'bot',enemyWeapon).deaths,1);
 player.currentSlot=1;const sidearm=player.slots[1].name;e.dev.respawnActor(enemy,false);hit(e,player,enemy,'AK47',1000);
 assert.equal(row(e,'human',sidearm).deaths,1);assert.equal(row(e,'human','AR-15').deaths,0);assert.equal(row(e,'bot','AK47').kills,1);
 e.dev.respawnActor(player,false);e.dev.respawnActor(enemy,false);hit(e,enemy,ally,'AR-15',240);hit(e,enemy,player,'9mm',1000);
 assert.equal(row(e,'human','9mm').damage,10);assert.equal(row(e,'human','9mm').finisherKills,1);
 const actor=e.dev.inspect().SAVE.patchState.participantAnalytics.samples[e.dev.inspect().SAVE.aiRevision].tdm.human.participants['account-stable-719'];
 assert.equal(actor.type,'human');assert.equal(actor.meta['AR-15'].kills,1);
 conservation(e);validateWorld(e.context.SAR.getUniverse(),{save:before});
 const completedBefore=e.dev.inspect().SAVE.patchState.participantAnalytics.samples[e.dev.inspect().SAVE.aiRevision].tdm.human.completedMatches;e.dev.endMatch(match,player.team);e.dev.endMatch(match,player.team);
 assert.equal(e.dev.inspect().SAVE.patchState.participantAnalytics.samples[e.dev.inspect().SAVE.aiRevision].tdm.human.completedMatches,completedBefore+1);
 console.log('PASS mixed-match event attribution, overkill, contribution credit, headshots, victim-equipped deaths, stable account ID and one completion');
}
{
 const e=engine(),{state,match,player}=humanMatch(e),enemy=state.actors.find(a=>a.matchId===match.id&&a.team!==player.team),p=open(e);
 for(const a of state.actors)if(a!==player&&a!==enemy){a.dead=true;a.respawnAt=1e12;}
 Object.assign(player,p,{angle:0,currentSlot:0});Object.assign(enemy,{x:p.x+100,y:p.y,hp:250,dead:false});
 player.slots[0]={name:'SR-Aug',ammo:39,reserve:156,lastShot:-100000,reloading:false,reloadEnd:0};
 assert.ok(e.dev.fire(player,0,10000));
 for(let i=0;i<30;i++)e.dev.updateProjectiles(.01,10000+i*10);
 assert.equal(row(e,'human','SR-Aug').shots,1,'burst activation is one measured trigger pull');assert.ok(row(e,'human','SR-Aug').hits<=1);
 assert.equal(row(e,'bot','SR-Aug').shots,0);
 e.dev.respawnActor(enemy,false);Object.assign(enemy,{x:p.x+100,y:p.y,hp:10,dead:false});
 player.slots[0]={name:'Pump Shotgun',ammo:5,reserve:30,lastShot:-100000,reloading:false,reloadEnd:0};
 assert.ok(e.dev.fire(player,0,20000));for(let i=0;i<30;i++)e.dev.updateProjectiles(.01,20000+i*10);
 assert.equal(row(e,'human','Pump Shotgun').shots,1);assert.equal(row(e,'human','Pump Shotgun').hits,1);assert.equal(row(e,'human','Pump Shotgun').damage,10);assert.equal(row(e,'human','Pump Shotgun').kills,1);
 e.dev.recordEquipped(player,60);player.currentSlot=1;e.dev.recordEquipped(player,30);
 const human=query(e,'human');near(human.filter(r=>e.context.SAR.getWeapons()[r.name].type==='primary').reduce((n,r)=>n+r.usage,0),1);near(human.filter(r=>e.context.SAR.getWeapons()[r.name].type==='sidearm').reduce((n,r)=>n+r.usage,0),1);
 const unchanged=clone(human),bot=enemy;bot.currentSlot=0;e.dev.recordEquipped(bot,600);
 assert.deepEqual(query(e,'human'),unchanged,'bot time cannot change human rates, confidence, usage or Gun Score');
 const findElement=e.context.document.getElementById;e.context.document.getElementById=id=>id==='metaWeaponPreview'?null:findElement(id);
 const localBefore=e.context.SAR.getUniverse();e.context.SAR.showWeaponMeta();e.context.SAR.showWeaponMeta({cohort:'bot'});e.context.SAR.compactMetaHtml({cohort:'bot'});e.context.SAR.showWeaponMeta();
 assert.deepEqual(e.context.SAR.getUniverse(),localBefore,'UI queries do not create statistics');
 const html=e.context.document.getElementById('modalContent').innerHTML;assert.match(html,/Human participant performance against humans or bots/);assert.match(html,/prospective|separate samples begin with SKYLINE/);assert.ok(!html.includes('Top 3 bots with'));
 console.log('PASS burst/shotgun trigger accounting, resolved pellet damage, scoped usage/Gun Score and read-only human/bot queries');
}
{
 const e=engine(),findElement=e.context.document.getElementById;e.context.document.getElementById=id=>id==='metaWeaponPreview'?null:findElement(id);
 e.context.SAR.showWeaponMeta({cohort:'bot'});e.ui.dispatch('document','change',{target:{id:'metaMobileSort',value:'name'}});
 const ordered=query(e,'bot').map(r=>r.name),compact=e.context.SAR.compactMetaHtml({cohort:'bot'});
 assert.deepEqual(ordered,[...ordered].sort((a,b)=>a.localeCompare(b)));
 e.context.SAR.showWeaponMeta({cohort:'human'});e.ui.dispatch('document','change',{target:{id:'metaMobileSort',value:'name'}});
 const sortButton={dataset:{sortView:'meta',sortKey:'name'},closest:selector=>selector==='[data-sort-view]'?sortButton:null};e.ui.dispatch('document','click',{target:sortButton});
 assert.deepEqual(query(e,'human').map(r=>r.name),[...ordered].reverse());
 assert.deepEqual(query(e,'bot').map(r=>r.name),ordered,'compact/query bot sort survives a different human sort');
 assert.equal(e.context.SAR.compactMetaHtml({cohort:'bot'}),compact);
 e.context.SAR.showWeaponMeta({cohort:'bot'});assert.deepEqual(e.context.SAR.getMetaSelection('bot').sort,{key:'name',dir:1});
 console.log('PASS independent human/bot sorting across compact and expanded Meta views');
}
{
 const e=engine(),legacy=e.context.SAR.getUniverse();delete legacy.patchState.participantAnalytics;
 const histories=clone({patch:legacy.patchState,careers:legacy.playerCareer,bots:legacy.bots,archives:legacy.patchArchives,progression:legacy.progression});
 const first=e.dev.normalizeSave(legacy),twice=e.dev.normalizeSave(first);
 assert.deepEqual(first.patchState.participantAnalytics,twice.patchState.participantAnalytics);
 const restorePatch=clone(first.patchState);delete restorePatch.participantAnalytics;
 assert.deepEqual(restorePatch,histories.patch);assert.deepEqual(first.playerCareer,histories.careers);assert.deepEqual(first.bots,histories.bots);assert.deepEqual(first.patchArchives,histories.archives);assert.deepEqual(first.progression,histories.progression);
 for(const sample of Object.values(first.patchState.participantAnalytics.samples))for(const mode of ['tdm','deathmatch'])for(const type of ['human','bot'])assert.equal(Object.values(sample[mode][type].meta).reduce((s,m)=>s+m.picks,0),0);
 validateWorld(first,{save:legacy});const malicious=clone(first);malicious.patchState.participantAnalytics.legacy.tdm['AR-15'].picks++;assert.throws(()=>validateWorld(malicious,{save:first}),/coverage changed/);
 const removed=clone(first);delete removed.patchState.participantAnalytics;assert.throws(()=>validateWorld(removed,{save:first}),/analytics were removed/);
 console.log('PASS repeatable additive migration preserves histories/XP and cannot invent a human historical share');
}
{
 const e=engine(),match=e.context.SAR.startDeathmatch(),state=e.dev.inspect().state,player=state.actors.find(a=>a.isPlayer),enemy=state.actors.find(a=>a.matchId===match.id&&!a.isPlayer);
 match.status='active';match.limit=500;const tdm=clone(query(e,'human')),before=e.context.SAR.getUniverse();hit(e,enemy,player,'P90',250);
 assert.equal(row(e,'human','P90','deathmatch').kills,1);assert.deepEqual(query(e,'human'),tdm);assert.equal(total(query(e,'bot','deathmatch'),'deaths'),1);conservation(e,'deathmatch');validateWorld(e.context.SAR.getUniverse(),{save:before});
 const second=engine(),custom=second.context.SAR.startCustomMatch({mode:'tdm',player:true,playerTeam:0,bots:[{name:second.dev.inspect().SAVE.activeBotNames[0],team:1}]}),actors=second.dev.inspect().state.actors.filter(a=>a.matchId===custom.id),customBefore=clone(second.dev.inspect().SAVE.patchState.participantAnalytics);custom.status='active';
 hit(second,actors.find(a=>!a.isPlayer),actors.find(a=>a.isPlayer),'AR-15',250);second.dev.endMatch(custom,0);
 assert.deepEqual(second.dev.inspect().SAVE.patchState.participantAnalytics,customBefore);
 console.log('PASS Deathmatch separation and custom/practice exclusion');
}
{
 const e=engine(),state=e.dev.inspect().state,bot=state.actors.find(a=>a.matchId===0&&a.team===0),victim=state.actors.find(a=>a.matchId===0&&a.team===1),prior=total(query(e,'bot'),'kills');bot.name='YOU';
 hit(e,victim,bot,'AR-15',250);assert.equal(total(query(e,'bot'),'kills'),prior+1);assert.equal(total(query(e,'human'),'kills'),0);
 console.log('PASS displayed name never determines participant cohort');
}
console.log('SKYLINE analytics checks passed');
