'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {engine}=require('./simulate.cjs'),sourcePath=path.resolve(process.argv[2]||path.join(__dirname,'../game.js')),source=fs.readFileSync(sourcePath,'utf8');
const injected=source.replace('window.SAR = {','window.__profileChecks={makeWeaponState,startReload,finishReload,recordEquipped};window.SAR = {');
const clone=value=>JSON.parse(JSON.stringify(value)),checks=[],cases=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const strip=value=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
function visibleProfile(e,career){
 e.context.SAR.openPlayerProfile();const modal=e.ui.element('modalContent'),html=modal.innerHTML;
 assert.equal(modal.dataset.view,'player-profile');assert.ok(e.ui.element('modal').classList.contains('visible'));
 const cells=new Map([...html.matchAll(/<div><span>([^<]*)<\/span><strong>([^<]*)<\/strong>/g)].map(m=>[strip(m[1]),strip(m[2])]));
 for(const [label,value] of [['GAMES',career.games],['W / L',career.wins+' / '+career.losses],['KILLS',career.kills],['DEATHS',career.deaths],['ASSISTS',career.assists],['HEADSHOTS',career.headshots],['SHOTS / HITS',career.shots+' / '+career.hits],['DAMAGE',Math.round(career.damage).toLocaleString()],['DAMAGE TAKEN',Math.round(career.taken).toLocaleString()],['MOST KILLS IN GAME',career.bestKills],['MOST DAMAGE IN GAME',Math.round(career.bestDamage).toLocaleString()]])assert.equal(cells.get(label),String(value),'visible '+label);
 assert.equal(cells.get('WIN %'),career.games?(100*career.wins/career.games).toFixed(1)+'%':'—');
 assert.equal(cells.get('ACCURACY'),career.shots?(100*career.hits/career.shots).toFixed(1)+'%':'—');
 assert.equal(cells.get('HEADSHOT KILL %'),career.kills?(100*career.headshots/career.kills).toFixed(1)+'%':'—');
 assert.equal(cells.get('PLAYTIME'),(career.timePlayed/3600).toFixed(2)+'h');
 const table=html.match(/<table class="meta-table profile-weapons">([\s\S]*?)<\/table>/)?.[1];assert.ok(table);
 const headings=[...table.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map(m=>strip(m[1]).replace(/\*/g,''));
 const rows=[...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td(?:\s[^>]*)?>(.*?)<\/td>/g)].map(t=>strip(t[1]))).filter(row=>row.length);
 for(const name of ['AR-15','9mm']){const row=rows.find(r=>r[0]===name),w=career.weapons[name];assert.ok(row,name+' visible weapon row');const fields=Object.fromEntries(headings.map((h,i)=>[h,row[i]]));assert.equal(fields.K,String(w.k));assert.equal(fields.D,String(w.d));assert.equal(fields.GAMES,w.games?String(w.games):'—');assert.equal(fields.DAMAGE,Math.round(w.damage).toLocaleString());assert.equal(fields.ACCURACY,w.shots?(100*w.hits/w.shots).toFixed(1)+'%':'—');assert.equal(fields.HEADSHOTS,String(w.headshots));}
 return html;
}
let storage={};
for(const scenario of [{name:'win',won:true,combat:true},{name:'loss',won:false,combat:true},{name:'zero-kill',won:false,combat:false}]){
 const e=engine(storage,injected),before=clone(e.dev.inspect().SAVE.playerCareer),queued=[];
 const fixtureNow=e.context.SARCloud.now;
 e.context.SARCloud={now:fixtureNow,state:{account:{id:'profile-regression-account',username:'Profile Regression'},loaded:true,localMode:true},queueSave:world=>queued.push(clone(world))};
 e.dev.queueForMatch();
 // Previous scenarios persist both TDM slots' legitimate 15-second cooldowns.
 // Wait through the real slot scheduler rather than assuming every queue call
 // admits synchronously; keep the prior career and all combat assertions.
 for(let i=0;i<1800&&!e.dev.inspect().state.actors.some(a=>a.isPlayer);i++)e.step(1/30);
 queued.length=0;const {state,SAVE}=e.dev.inspect(),p=state.actors.find(a=>a.isPlayer);assert.ok(p,'real scheduler admits the queued player after cooldown');const match=state.matches.find(m=>m.id===p.matchId);assert.ok(match.hasPlayer);assert.equal(match.participants.length,10);assert.strictEqual(p.career,SAVE.playerCareer,'player actor shares authoritative career');assert.strictEqual(p.weaponUsage,SAVE.playerCareer.weapons,'player actor shares authoritative weapon records');
 // Freeze only fixture bots; actual human countdown/movement/equipped-time paths run.
 for(const a of state.actors)if(!a.isPlayer)Object.assign(a,{dead:true,respawnAt:Infinity});
 e.step(3.001);assert.equal(match.status,'active');e.step(2.5);p.currentSlot=1;e.step(1.5);p.currentSlot=0;
 const team=match.participants.filter(a=>!a.isPlayer&&a.team===p.team),opponents=match.participants.filter(a=>a.team!==p.team),ally=team[0],enemy=opponents[0];
 let lane;for(let y=100;y<2200&&!lane;y+=80)for(let x=100;x<3500&&!lane;x+=80)if(!e.dev.collides(x,y)&&[-35,0,35].every(o=>e.dev.pathClear(x,y+o,x+210,y+o)))lane={x,y};assert.ok(lane);
 let clock=e.dev.now()+1000,shots=0,hits=0;
 function revive(a){Object.assign(a,{dead:false,hp:250,respawnAt:Infinity});a.damageLedger.clear();a.damageByWeapon.clear();}
 function shoot(owner,victim,weapon,offset){
  Object.assign(owner,{x:lane.x,y:lane.y,dead:false});Object.assign(victim,{x:lane.x+120,y:lane.y});
  owner.currentSlot=owner.isPlayer?(weapon==='9mm'?1:0):0;
  if(owner.slots[owner.currentSlot].name!==weapon)owner.slots[owner.currentSlot]=e.context.__profileChecks.makeWeaponState(weapon);
  const slot=owner.slots[owner.currentSlot];if(slot.reloading){clock+=e.context.SAR.getWeapons()[weapon].reload*1000;e.context.__profileChecks.finishReload(slot,owner);}
  state.projectiles=[];clock+=500;assert.equal(e.dev.fire(owner,0,clock),true,weapon+' actual trigger');assert.equal(state.projectiles.length,1);
  const hp=victim.hp;Object.assign(state.projectiles[0],{x:lane.x+30,y:lane.y+offset,vx:1000,vy:0,travel:30});e.dev.updateProjectiles(.14,clock+150);if(owner===p){shots++;if(victim.hp<hp)hits++;}
 }
 function kill(owner,victim,weapon,offset,preserveDamage=false){if(!preserveDamage)revive(victim);let fired=0;while(!victim.dead&&fired++<20)shoot(owner,victim,weapon,offset);assert.ok(victim.dead,'real projectile kill');}
 if(scenario.combat){
  kill(p,enemy,'AR-15',0);kill(p,enemy,'9mm',12);revive(enemy);shoot(p,enemy,'AR-15',35);shoot(p,enemy,'AR-15',12);
  kill(ally,enemy,'AR-15',0,true); // Human's real 28 HP contribution is below assist threshold.
  // A second, qualifying contribution exercises the existing assist ledger.
  revive(enemy);shoot(p,enemy,'AR-15',12);shoot(p,enemy,'AR-15',12);kill(ally,enemy,'AR-15',0,true);
 }else{revive(enemy);shoot(p,enemy,'AR-15',35);shoot(p,enemy,'AR-15',35);}
 kill(enemy,p,'AR-15',12);
 if(!scenario.won&&scenario.combat)for(const teammate of team)kill(enemy,teammate,'AR-15',12);
 const stats=clone(p.stats),expectedWeapon=clone(p.matchWeaponStats),beforeFinal=clone(SAVE.playerCareer),score=[...match.score];
 assert.equal(stats.kills,scenario.combat?2:0);assert.equal(stats.deaths,1);assert.equal(stats.assists,scenario.combat?1:0);assert.equal(stats.headshots,scenario.combat?1:0);assert.equal(stats.shots,shots);assert.equal(stats.hits,hits);
 const winner=scenario.won?p.team:1-p.team;
 // Another background slot may finish its persisted cooldown while this fixture
 // is playing. Count completion checkpoints from the finalization boundary.
 queued.length=0;
 assert.ok(score[winner]>score[1-winner],'resolved winning team matches actual score');e.dev.endMatch(match,winner,'time');const committed=clone(SAVE.playerCareer);
 assert.equal(committed.games,before.games+1);assert.equal(committed.wins,before.wins+(scenario.won?1:0));assert.equal(committed.losses,before.losses+(scenario.won?0:1));
 for(const key of ['kills','deaths','assists','damage','taken','shots','hits','headshots','timeAlive'])near(committed[key],before[key]+stats[key]);near(committed.timePlayed,before.timePlayed+stats.timeAlive);
 for(const name of ['AR-15','9mm']){const w=committed.weapons[name],previous=before.weapons[name],sample=expectedWeapon[name];assert.equal(w.games,previous.games+1);for(const key of ['k','d','damage','shots','hits','headshots','equippedTime','picks'])near(w[key],previous[key]+(sample[key]||0));}
 assert.equal(committed.bestKills,Math.max(before.bestKills,stats.kills));assert.equal(committed.bestDamage,Math.max(before.bestDamage,stats.damage));assert.equal(committed.currentStreak,0,'physical death clears current kill streak');assert.equal(committed.bestStreak,Math.max(before.bestStreak,scenario.combat?2:0));assert.equal(committed.currentWinStreak,scenario.won?before.currentWinStreak+1:0);assert.equal(committed.bestWinStreak,Math.max(before.bestWinStreak,committed.currentWinStreak));
 const kd=stats.kills/Math.max(1,stats.deaths),oldBest=before.bestKdGame,expectedBest=!oldBest||kd>oldBest.kd||(kd===oldBest.kd&&stats.kills>oldBest.kills)?{kd,kills:stats.kills,deaths:stats.deaths}:oldBest;for(const key of ['kd','kills','deaths'])assert.equal(committed.bestKdGame[key],expectedBest[key],'best K/D record '+key);
 assert.equal(committed.recentMatches.length,before.recentMatches.length+1);const recent=committed.recentMatches.at(-1);assert.equal(recent.won,scenario.won);for(const key of ['kills','deaths','assists','damage','headshots'])assert.equal(recent[key],stats[key]);
 assert.equal(queued.length,1,'one completed match checkpoint');assert.deepEqual(queued[0].playerCareer,committed,'offline sync queue receives committed profile');const persisted=JSON.parse(e.data.get('sar-persistent-save'));assert.deepEqual(persisted.playerCareer,committed,'local commit available immediately');
 const first=visibleProfile(e,committed);e.dev.endMatch(match,winner,'time');assert.deepEqual(SAVE.playerCareer,committed,'repeated completion has no duplicate delta');assert.equal(queued.length,1);e.ui.flush();assert.equal(state.playerMatchId,null);e.ui.action('close-result');assert.equal(e.ui.element('modal').classList.contains('visible'),false);assert.equal(state.mode,'menu');visibleProfile(e,committed);assert.equal(e.ui.element('modalContent').innerHTML,first,'reopening renders latest identical committed totals');
 e.dev.saveTelemetry();const fresh=engine(Object.fromEntries(e.data),injected);assert.deepEqual(clone(fresh.dev.inspect().SAVE.playerCareer),committed,'restart preserves all committed profile fields');visibleProfile(fresh,committed);storage=Object.fromEntries(e.data);
 cases.push({name:scenario.name,won:scenario.won,score,stats,careerBefore:before,careerImmediatelyAfter:committed,liveCareerBeforeFinalization:beforeFinal,weaponDelta:expectedWeapon});
 pass(`${scenario.name}: real shots/kills/death, immediate profile and weapon delta, reopened UI, offline checkpoint, restart persistence and repeated-finalization guard`);
}
if(source.includes('function startTournamentGame(')){
 const e=engine(storage,injected),{state,SAVE,meta}=e.dev.inspect(),queued=[],results=[],events=[];
 e.context.SARCloud={state:{account:{id:'profile-regression-account',username:'Profile Regression'},loaded:true,localMode:true},queueSave:world=>queued.push(clone(world)),commitMatch:()=>assert.fail('Tournament must not commit a standard match')};
 e.context.SARTournaments={onResult:(context,result)=>results.push({context:clone(context),result:clone(result)})};e.context.SARAudio={emit:event=>events.push(event),flush(){}};
 // Hold the four normal games still so the only running combat is this fifth,
 // isolated tournament game. Their real actors and persistent data remain present.
 for(const match of state.matches)match.status='fixture-paused';
 const before=clone(SAVE),beforeMeta=clone(meta),bots=Object.values(e.context.SAR.getProfiles()).slice(0,9),context={tournamentId:'profile-isolation',seriesId:'profile-isolation:qf1',gameId:'profile-isolation:qf1:g1',teamIds:['blue','red'],teams:[{id:'blue',participants:[{id:'profile-regression-account',kind:'user'},...bots.slice(0,4).map(b=>({id:b.id,kind:'bot'}))]},{id:'red',participants:bots.slice(4).map(b=>({id:b.id,kind:'bot'}))}],hasPlayer:true};
 const match=e.context.SAR.startTournamentGame(context),p=match.participants.find(a=>a.isPlayer),ally=match.participants.find(a=>!a.isPlayer&&a.team===p.team),enemy=match.participants.find(a=>a.team!==p.team);
 assert.equal(state.matches.length,5);assert.equal(match.participants.length,10);assert.notStrictEqual(p.career,SAVE.playerCareer);assert.notStrictEqual(ally.career,SAVE.bots[ally.name].career);assert.notStrictEqual(ally.tournamentBot.familiarity,SAVE.bots[ally.name].familiarity);
 for(const a of match.participants)if(!a.isPlayer)Object.assign(a,{dead:true,respawnAt:Infinity});
 e.step(3.001);assert.equal(match.status,'active','real tournament countdown completes before combat');
 e.step(1.25);p.currentSlot=1;e.step(.75);p.currentSlot=0;
 let lane;for(let y=100;y<2200&&!lane;y+=80)for(let x=100;x<3500&&!lane;x+=80)if(!e.dev.collides(x,y)&&[-35,0,35].every(o=>e.dev.pathClear(x,y+o,x+210,y+o)))lane={x,y};assert.ok(lane);
 let clock=e.dev.now()+1000;
 function revive(a){Object.assign(a,{dead:false,hp:250,respawnAt:Infinity});a.damageLedger.clear();a.damageByWeapon.clear();}
 function shoot(owner,victim,weapon,offset=12){
  Object.assign(owner,{x:lane.x,y:lane.y,dead:false,currentSlot:owner.isPlayer&&weapon==='9mm'?1:0});Object.assign(victim,{x:lane.x+120,y:lane.y});
  if(owner.slots[owner.currentSlot].name!==weapon)owner.slots[owner.currentSlot]=e.context.__profileChecks.makeWeaponState(weapon);
  const slot=owner.slots[owner.currentSlot];if(slot.reloading){clock+=e.context.SAR.getWeapons()[weapon].reload*1000;e.context.__profileChecks.finishReload(slot,owner);}
  state.projectiles=[];clock+=500;assert.equal(e.dev.fire(owner,0,clock),true);assert.equal(state.projectiles.length,1);Object.assign(state.projectiles[0],{x:lane.x+30,y:lane.y+offset,vx:1000,vy:0,travel:30});e.dev.updateProjectiles(.14,clock+150);
 }
 function kill(owner,victim,weapon,offset=12,preserveDamage=false){if(!preserveDamage)revive(victim);let count=0;while(!victim.dead&&count++<20)shoot(owner,victim,weapon,offset);assert.ok(victim.dead);}
 kill(p,enemy,'AR-15',0);kill(p,enemy,'9mm');revive(enemy);shoot(p,enemy,'AR-15',35);shoot(p,enemy,'AR-15');shoot(p,enemy,'AR-15');kill(ally,enemy,'AR-15',12,true);kill(enemy,p,'AR-15');
 e.context.__profileChecks.recordEquipped(ally,1.5);assert.ok(ally.tournamentBot.familiarity['AR-15']>before.bots[ally.name].familiarity['AR-15'],'isolated copied bot familiarity learns from actual equipped time');
 revive(p);p.currentSlot=0;const slot=p.slots[0],ammo=slot.ammo,reserve=slot.reserve;e.context.__profileChecks.startReload(p,clock);assert.equal(slot.reloadEnd,clock+2100);e.context.__profileChecks.finishReload(slot,p);assert.equal(slot.ammo,40);assert.equal(slot.reserve,reserve-(40-ammo));assert.ok(events.some(event=>event.type==='mag-out'&&event.weapon==='AR-15'));
 assert.equal(p.stats.kills,2);assert.equal(p.stats.deaths,1);assert.equal(p.stats.assists,1);assert.equal(p.stats.headshots,1);assert.ok(p.stats.hits<p.stats.shots);assert.ok(p.stats.damage>500);assert.ok(p.matchWeaponStats['AR-15'].equippedTime>=1.25);assert.ok(p.matchWeaponStats['9mm'].equippedTime>=.75);assert.equal(ally.stats.kills,1);assert.equal(enemy.stats.kills,1);
 assert.deepEqual(clone(SAVE),before,'real tournament shots, damage, kills, assists, deaths, time, reload and familiarity must leave every normal persistent field intact');assert.deepEqual(clone(meta),beforeMeta);
 e.dev.endMatch(match,p.team,'time');e.ui.flush();assert.equal(results.length,1);assert.deepEqual(results[0].context,context);assert.equal(results[0].result.stats.length,10);assert.deepEqual(results[0].result.stats.find(a=>a.participantId===p.participantId).weaponStats,clone(p.matchWeaponStats));assert.equal(results[0].result.score[0],3);assert.equal(results[0].result.score[1],1);assert.equal(results[0].result.winnerTeamId,'blue');
 e.dev.endMatch(match,p.team,'time');e.ui.flush();assert.equal(results.length,1,'tournament result emitted exactly once');assert.equal(queued.length,0,'no normal match checkpoint');assert.equal(state.matches[4],null);assert.equal(state.playerMatchId,null);assert.equal(state.actors.some(a=>a.sandbox),false);assert.deepEqual(clone(SAVE),before,'completion does not leak tournament results into normal data');visibleProfile(e,before.playerCareer);
 e.dev.saveTelemetry();const persisted=JSON.parse(e.data.get('sar-persistent-save'));assert.deepEqual({...persisted,updatedAt:before.updatedAt},before,'normal save contains only its ordinary updatedAt checkpoint timestamp after tournament');
 // A normal boot selects fresh match loadouts and records their picks. Compare
 // the restart with a control boot of the pre-tournament world, not with a world
 // that has never initialized its next four matches.
 const restartStorage=Object.fromEntries(e.data),fresh=engine(restartStorage,injected),controlBoot=engine({...restartStorage,'sar-persistent-save':JSON.stringify({...before,updatedAt:persisted.updatedAt})},injected);assert.deepEqual({...clone(fresh.dev.inspect().SAVE),updatedAt:0},{...clone(controlBoot.dev.inspect().SAVE),updatedAt:0},'restart matches ordinary boot of the pre-tournament world, apart from checkpoint time');visibleProfile(fresh,before.playerCareer);
 cases.push({name:'tournament-isolation',score:results[0].result.score,result:results[0].result,normalWorldHash:crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex')});
 pass('Tournament: actual human and bot combat, assists, reload, equipped time, copied familiarity, exactly-once result and full normal career/meta/patch/season/save/restart isolation');
}
fs.writeFileSync(process.argv[3]||path.join(__dirname,'live-circuit-profile-results.json'),JSON.stringify({result:'PASS',sourcePath,sourceHash:crypto.createHash('sha256').update(source).digest('hex'),checks,cases},null,2)+'\n');
