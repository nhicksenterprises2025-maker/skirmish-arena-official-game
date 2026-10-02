/* Player-world integrity checks run the exact shipped simulation with DOM/canvas stubs. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const checks=[];function pass(test,detail){checks.push({test,result:'PASS',detail});console.log('PASS',test,detail||'');}
function approx(a,b,epsilon=1e-6){assert.ok(Math.abs(a-b)<epsilon,a+' != '+b);}
function open(e,separation=120){for(let y=100;y<2700;y+=40)for(let x=100;x<3900-separation;x+=40)if(!e.dev.collides(x,y)&&!e.dev.collides(x+separation,y)&&e.dev.pathClear(x,y,x+separation,y))return {x,y};throw Error('No clear firing lane');}
function damage(e,victim,owner,weapon,amount){e.dev.applyDamage(victim,{owner,weapon,travel:120},amount,false,e.dev.now());}
{
 const e=engine();e.dev.queueForMatch();const {state}=e.dev.inspect(),id=state.playerMatchId,match=state.matches[id],player=state.actors.find(a=>a.isPlayer),group=state.actors.filter(a=>a.matchId===id);
 assert.equal(match.status,'countdown');assert.equal(group.length,10);assert.equal(group.filter(a=>a.team===0).length,5);assert.equal(group.filter(a=>a.team===1).length,5);
 const before=group.map(a=>({id:a.id,x:a.x,y:a.y,hp:a.hp,shots:a.stats.shots,alive:a.stats.timeAlive})),otherBefore=state.actors.filter(a=>a.matchId!==null&&a.matchId!==id).map(a=>({id:a.id,x:a.x,y:a.y,shots:a.stats.shots})),ammo=player.slots[0].ammo;
 assert.ok(!e.dev.fire(player,0,e.dev.now()));assert.equal(player.slots[0].ammo,ammo);
 for(let i=0;i<60;i++)e.step();
 assert.equal(match.status,'countdown');assert.equal(e.context.SAR.getState().matches[id].timeLeftMs,match.durationMs);assert.equal(state.elapsed,0);
 assert.deepEqual(group.map(a=>({id:a.id,x:a.x,y:a.y,hp:a.hp,shots:a.stats.shots,alive:a.stats.timeAlive})),before);
 assert.ok(otherBefore.some(p=>{const a=state.actors.find(a=>a.id===p.id);return a.x!==p.x||a.y!==p.y||a.stats.shots!==p.shots;}),'other bot games must keep playing');
 for(let i=0;i<32;i++)e.step();
 assert.equal(match.status,'active');assert.equal(e.context.document.getElementById('matchCountdown').querySelector('strong').textContent,'FIGHT');assert.ok(state.elapsed>0);assert.ok(e.context.SAR.getState().matches[id].timeLeftMs>match.durationMs-150);
 e.dev.exitGame();assert.equal(state.playerMatchId,null);assert.equal(state.actors.filter(a=>a.isPlayer).length,0);assert.equal(state.actors.length,50);assert.equal(state.matches[id].status,'active');
 pass('Player countdown freezes participants/firing/clock while other games continue; FIGHT starts the full clock');
 const second=engine();second.dev.queueForMatch();second.dev.exitGame();assert.equal(second.dev.inspect().state.playerMatchId,null);assert.equal(second.dev.inspect().state.actors.length,50);assert.equal(second.dev.inspect().SAVE.playerCareer.games,0);
 pass('Leaving during countdown restores the 50-bot roster without awarding a player match');
}
{
 const e=engine();e.dev.queueForMatch();for(let i=0;i<92;i++)e.step();
 const {state,SAVE,meta}=e.dev.inspect(),id=state.playerMatchId,match=state.matches[id],player=state.actors.find(a=>a.isPlayer),enemy=state.actors.find(a=>a.matchId===id&&a.team!==player.team),ally=state.actors.find(a=>a.matchId===id&&!a.isPlayer&&a.team===player.team);
 match.limit=500;for(const a of state.actors)if(a!==player&&a!==enemy&&a!==ally){a.dead=true;a.respawnAt=1e12;}
 const p=open(e);Object.assign(player,{...p,currentSlot:0});Object.assign(enemy,{x:p.x+120,y:p.y,hp:250,dead:false});ally.x=p.x;ally.y=p.y+80;
 const primary=player.slots[0].name,shotsBefore=SAVE.playerCareer.shots,hitsBefore=SAVE.playerCareer.hits,damageBefore=SAVE.playerCareer.damage,killsBefore=SAVE.playerCareer.kills;
 assert.ok(e.dev.fire(player,0,e.dev.now()+1000));for(let i=0;i<10&&!enemy.stats.taken;i++)e.dev.updateProjectiles(.01,e.dev.now()+1000+i*10);
 assert.equal(SAVE.playerCareer.shots,shotsBefore+1);assert.equal(SAVE.playerCareer.hits,hitsBefore+1);assert.ok(SAVE.playerCareer.damage>damageBefore);
 damage(e,enemy,player,primary,1000);assert.equal(SAVE.playerCareer.kills,killsBefore+1);approx(SAVE.playerCareer.damage-damageBefore,250);
 e.dev.respawnActor(enemy,false);damage(e,enemy,player,primary,40);damage(e,enemy,ally,'AK47',210);assert.equal(SAVE.playerCareer.assists,1);
 e.dev.respawnActor(enemy,false);damage(e,player,enemy,'AK47',1000);assert.equal(SAVE.playerCareer.deaths,1);assert.equal(SAVE.playerCareer.currentStreak,0);assert.ok(SAVE.playerCareer.bestStreak>=1);
 const aliveBefore=SAVE.playerCareer.timeAlive,playedBefore=SAVE.playerCareer.timePlayed;for(const a of state.actors)if(!a.isPlayer){a.dead=true;a.respawnAt=1e12;}player.respawnAt=1e12;e.step(.5);approx(SAVE.playerCareer.timeAlive,aliveBefore);approx(SAVE.playerCareer.timePlayed-playedBefore,.5);
 for(const key of ['kills','deaths','assists','damage','taken','shots','hits','headshots','timeAlive'])approx(SAVE.playerSeasons.current.stats[key],player.stats[key]);
 const sum=(rows,k)=>rows.reduce((n,r)=>n+(r[k]||0),0),careers=[...Object.values(SAVE.bots).map(b=>b.career),SAVE.playerCareer],weapons=Object.values(meta);
 for(const [careerKey,metaKey] of [['kills','kills'],['deaths','deaths'],['shots','shots'],['hits','hits'],['headshots','headshots'],['damage','damage'],['timeAlive','equippedTime']])approx(sum(careers,careerKey),sum(weapons,metaKey));
 for(const [careerKey,weaponKey] of [['kills','k'],['deaths','d'],['shots','shots'],['hits','hits'],['headshots','headshots'],['damage','damage'],['timeAlive','equippedTime']])approx(SAVE.playerCareer[careerKey],sum(Object.values(SAVE.playerCareer.weapons),weaponKey));
 const expected={...player.stats},team=player.team;e.dev.endMatch(match,team,'score');e.step(.001);
 assert.equal(SAVE.playerCareer.games,1);assert.equal(SAVE.playerCareer.wins,1);assert.equal(SAVE.playerCareer.losses,0);assert.equal(SAVE.playerCareer.bestKills,expected.kills);assert.equal(SAVE.playerCareer.bestDamage,expected.damage);
 assert.equal(SAVE.playerCareer.currentWinStreak,1);assert.equal(SAVE.playerCareer.bestWinStreak,1);assert.equal(SAVE.playerCareer.bestKdGame.kills,expected.kills);assert.equal(SAVE.playerCareer.bestKdGame.deaths,expected.deaths);assert.equal(SAVE.playerCareer.weapons[primary].games,1);assert.equal(SAVE.playerCareer.weapons[player.slots[1].name].games,1);assert.equal(SAVE.playerSeasons.current.stats.games,1);assert.equal(SAVE.playerSeasons.current.stats.wins,1);
 assert.equal(SAVE.playerCareer.recentMatches.length,1);assert.equal(SAVE.playerCareer.recentMatches[0].kills,expected.kills);assert.equal(SAVE.playerCareer.recentMatches[0].deaths,expected.deaths);assert.equal(SAVE.playerCareer.recentMatches[0].patchId,SAVE.patchState.id);
 assert.match(e.context.document.getElementById('modalContent').innerHTML,/<h2>VICTORY<\/h2>/);assert.match(e.context.document.getElementById('modalContent').innerHTML,/PLAY AGAIN/);assert.match(e.context.document.getElementById('modalContent').innerHTML,/MATCH MVP/);
 const resultHtml=e.context.document.getElementById('modalContent').innerHTML;assert.match(resultHtml,/TEAM SCOREBOARD/);assert.match(resultHtml,/ACCURACY/);assert.match(resultHtml,/HEADSHOTS/);assert.match(resultHtml,/MOST-USED WEAPON/);assert.match(resultHtml,/100\.0%/);assert.equal((resultHtml.match(/<tr class=/g)||[]).length,10);assert.equal(match.playerReport.rows.length,10);assert.equal(match.playerReport.mostUsed,primary);assert.equal(match.playerReport.kills,expected.kills);assert.equal(match.playerReport.deaths,expected.deaths);
 assert.equal(state.playerMatchId,null);assert.equal(state.actors.length,50);assert.equal(state.actors.filter(a=>a.isPlayer).length,0);
 e.dev.saveTelemetry();const reload=engine(Object.fromEntries(e.data));assert.deepEqual(reload.dev.inspect().SAVE.playerCareer,SAVE.playerCareer);
 e.dev.queueForMatch();assert.equal(state.matches[state.playerMatchId].status,'countdown');assert.equal(SAVE.playerCareer.games,1);assert.equal(state.actors.filter(a=>a.isPlayer).length,1);
 for(let i=0;i<92;i++)e.step();const nextPlayer=state.actors.find(a=>a.isPlayer),nextMatch=state.matches[state.playerMatchId];e.dev.endMatch(nextMatch,1-nextPlayer.team,'time');e.step(.001);assert.equal(SAVE.playerCareer.games,2);assert.equal(SAVE.playerCareer.losses,1);assert.equal(SAVE.playerCareer.currentWinStreak,0);assert.equal(SAVE.playerCareer.bestWinStreak,1);assert.match(e.context.document.getElementById('modalContent').innerHTML,/<h2>DEFEAT<\/h2>/);
 const previousSeason=JSON.parse(JSON.stringify(SAVE.playerSeasons.current));e.dev.ensureSeasonFresh(SAVE.seasons.current.endAt+1);assert.deepEqual(SAVE.playerSeasons.history[0],previousSeason);assert.equal(SAVE.playerSeasons.current.number,previousSeason.number+1);assert.equal(SAVE.playerSeasons.current.stats.games,0);assert.equal(SAVE.playerCareer.games,2);assert.equal(SAVE.playerCareer.weapons[primary].games,2);
 pass('Player event/weapon totals, dead playtime, season archives and win streaks reconcile; real reports/reload/restart retain career',expected);
}
{
 const e=engine();e.dev.queueForMatch();for(let i=0;i<92;i++)e.step();
 const before=e.context.SAR.getUniverse(),stateBefore=e.context.SAR.getState(),snap=e.dev.renderSnapshot(),again=e.dev.renderSnapshot();
 assert.deepEqual(e.context.SAR.getUniverse(),before);assert.deepEqual(e.context.SAR.getState(),stateBefore);assert.deepEqual(again,snap);assert.equal(snap.actors.length,10);assert.equal(snap.matchId,stateBefore.playerMatchId);
 assert.ok(snap.projectiles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 pass('2.5D snapshot observes the selected match without advancing/changing simulation, telemetry, identities or careers');
 const {state}=e.dev.inspect(),player=state.actors.find(a=>a.isPlayer),enemy=state.actors.find(a=>a.matchId===player.matchId&&a.team!==player.team),ally=state.actors.find(a=>a.matchId===player.matchId&&!a.isPlayer&&a.team===player.team),id=player.matchId;
 const marker=actor=>e.dev.renderSnapshot().actors.find(row=>row.id===actor.id).mapVisible;
 const clear=open(e);Object.assign(player,clear);Object.assign(enemy,{x:clear.x+120,y:clear.y});Object.assign(state.camera,{x:player.x,y:player.y,zoom:1});assert.ok(e.dev.pointLOS(player.x,player.y,enemy));assert.equal(marker(enemy),true);assert.equal(marker(player),true);
 let barrier;for(const solid of snap.geometry.solids){if(solid.type!=='rect')continue;const x=solid.x-55,y=solid.y+solid.h/2,bx=solid.x+solid.w+55;if(!e.dev.collides(x,y)&&!e.dev.collides(bx,y)&&bx-x<650&&!e.dev.pointLOS(x,y,{x:bx,y})){barrier={x,y,bx};break;}}
 assert.ok(barrier,'real wall must provide an occluded marker case');Object.assign(player,{x:barrier.x,y:barrier.y});Object.assign(enemy,{x:barrier.bx,y:barrier.y});Object.assign(state.camera,{x:player.x,y:player.y,zoom:1});assert.equal(marker(enemy),false,'nearby enemy behind actual geometry stays hidden');assert.equal(marker(ally),true,'friendly markers retain their original visibility');
 Object.assign(player,{x:2160,y:200});Object.assign(enemy,{x:2160,y:1300});Object.assign(state.camera,{x:player.x,y:player.y,zoom:1});assert.ok(e.dev.pointLOS(player.x,player.y,enemy));assert.equal(marker(enemy),false,'clear-line enemy outside player view stays hidden');
 state.mode='spectate';state.spectateMatchId=id;assert.equal(marker(enemy),true,'spectators retain the full match map');enemy.dead=true;assert.equal(marker(enemy),false,'dead operators have no marker');
 pass('2.5D minimap snapshot preserves real player LOS/view spotting, friendlies, spectator visibility and dead-marker suppression');
}
fs.writeFileSync(path.join(__dirname,'platform-game-results.json'),JSON.stringify({result:'PASS',sourceHash:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../game.js'))).digest('hex'),checks},null,2));

