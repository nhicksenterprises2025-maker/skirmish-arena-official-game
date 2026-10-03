'use strict';
// Execute the shipped resolver, projectiles, settings and Classic drawing in
// the existing VM harness. No real account, save file or model is touched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{engine}=require('./simulate.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const injected=source.replace('window.SAR = {','window.__DAMAGE={damageNumbers,damageNumberSnapshot,drawDamageNumbers,renderSettingsModal,settingsTabs,changeHandlers:[]};const originalAddListener=document.addEventListener;document.addEventListener=(type,fn,...rest)=>{if(type===\'change\')window.__DAMAGE.changeHandlers.push(fn);return originalAddListener(type,fn,...rest);};window.SAR = {');
// Change handlers are installed before the debug surface: capture them as they
// are registered, without changing the shipped event handler.
const testSource=injected.replace("document.addEventListener('change',e=>{if(e.target?.id==='damageNumbers')","window.__damageToggle=e=>{if(e.target?.id==='damageNumbers')").replace("damageNumbers.length=0;saveTelemetry();}});","damageNumbers.length=0;saveTelemetry();}};");
const checks=[];function pass(test){checks.push({test,result:'PASS'});console.log('PASS',test);}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
function playerGame(){
  const e=engine({},testSource);e.dev.queueForMatch();for(let i=0;i<92;i++)e.step();
  const {state}=e.dev.inspect(),player=state.actors.find(a=>a.isPlayer),victim=state.actors.find(a=>a.matchId===player.matchId&&a.team!==player.team);
  for(const a of state.actors)if(a!==player&&a!==victim){a.dead=true;a.respawnAt=1e12;}
  state.projectiles=[];state.matches[player.matchId].limit=500;Object.assign(victim,{hp:250,dead:false});
  e.context.__DAMAGE.damageNumbers.length=0;
  return {e,state,player,victim,d:e.context.__DAMAGE};
}
function hit(e,owner,victim,amount,head=false,shot={id:1},now=e.dev.now(),weapon='AR-15'){
  e.dev.applyDamage(victim,{owner,weapon,travel:150,shot},amount,head,now);
}
{
  const {e,player,victim,d}=playerGame(),now=e.dev.now();
  hit(e,player,victim,28,false,{id:1},now);let n=d.damageNumberSnapshot(now);
  assert.equal(n.length,1);assert.equal(n[0].amount,28);assert.equal(n[0].text,'28');assert.equal(n[0].head,false);assert.equal(n[0].killing,false);
  victim.hp=6.75;hit(e,player,victim,500,true,{id:2},now+1);n=d.damageNumberSnapshot(now+1);
  assert.equal(n.length,2);assert.equal(n[1].amount,6.75);assert.equal(n[1].text,'6.8');assert.equal(n[1].head,true);assert.equal(n[1].killing,true);assert.equal(victim.hp,0);
  hit(e,player,victim,99,true,{id:3},now+2);assert.equal(d.damageNumbers.length,2,'dead targets must never emit damage');
  const normal=d.damageNumberSnapshot(now+390)[0];approx(normal.alpha,.5);approx(normal.rise,13);
  assert.equal(d.damageNumberSnapshot(now+780).length,1);assert.equal(d.damageNumberSnapshot(now+841).length,0);
  pass('Resolved body/head/kill feedback uses exact HP removed, suppresses dead-target hits, rises and expires at 0.78/0.84 seconds');
}
{
  const {e,player,victim,d}=playerGame(),now=e.dev.now(),shot={id:4};
  victim.hp=50;hit(e,player,victim,15.5,false,shot,now,'Pump Shotgun');hit(e,player,victim,15.5,true,shot,now+20,'Pump Shotgun');hit(e,player,victim,31.25,true,shot,now+40,'Pump Shotgun');
  const n=d.damageNumberSnapshot(now+40);assert.equal(n.length,1);assert.equal(n[0].amount,50);assert.equal(n[0].text,'50');assert.equal(n[0].head,true);assert.equal(n[0].killing,true);
  const second=e.dev.inspect().state.actors.find(a=>a.matchId===victim.matchId&&a.team===victim.team&&a!==victim);second.dead=false;second.hp=250;
  hit(e,player,second,15.5,false,shot,now+50,'Pump Shotgun');assert.equal(d.damageNumberSnapshot(now+50).length,2,'different enemies receive separate blast totals');
  pass('Pellets from the same blast accumulate once per enemy across frames, including clamped killing damage');
}
{
  const {e,state,player,victim,d}=playerGame();let p;
  for(let y=100;y<2700&&!p;y+=40)for(let x=100;x<3750;x+=40)if(!e.dev.collides(x,y)&&!e.dev.collides(x+150,y)&&e.dev.pathClear(x,y,x+150,y)){p={x,y};break;}
  assert.ok(p);Object.assign(player,{...p,currentSlot:0,vx:0,vy:0});Object.assign(victim,{x:p.x+150,y:p.y,hp:250,dead:false});
  player.slots[0]={name:'Pump Shotgun',ammo:5,reserve:30,lastShot:-999,reloading:false,reloadEnd:0};
  const before=player.stats.damage,now=e.dev.now()+1000;assert.ok(e.dev.fire(player,0,now));assert.equal(state.projectiles.length,8);
  for(let i=1;i<=15;i++)e.dev.updateProjectiles(.01,now+i*10);
  const n=d.damageNumberSnapshot(now+150);assert.equal(n.length,1);assert.ok(n[0].amount>0);approx(n[0].amount,250-victim.hp);approx(n[0].amount,player.stats.damage-before);
  pass('A real eight-pellet projectile blast produces one feedback total matching authoritative HP and damage telemetry');
}
{
  const {e,state,player,victim,d}=playerGame(),now=e.dev.now();
  for(let i=0;i<10;i++)hit(e,player,victim,1,false,{id:10+i},now+i*10,'X-16 Auto');
  const n=d.damageNumberSnapshot(now+100);assert.equal(n.length,4);assert.ok(n.every(v=>v.amount===1));assert.equal(new Set(n.map(v=>v.offsetX)).size,3);
  victim.x+=70;victim.y+=30;assert.equal(d.damageNumberSnapshot(now+100)[0].x,victim.x);
  const bot=state.actors.find(a=>a.matchId===player.matchId&&a.team===player.team&&!a.isPlayer);bot.dead=false;
  hit(e,bot,victim,10);assert.equal(d.damageNumbers.length,4);hit(e,player,bot,1);assert.equal(d.damageNumbers.length,4);
  const foreign=state.actors.find(a=>a.matchId!==player.matchId);foreign.dead=false;hit(e,player,foreign,1);assert.equal(d.damageNumbers.length,4);
  state.mode='spectate';assert.equal(d.damageNumberSnapshot(now+100).length,0);state.mode='menu';assert.equal(d.damageNumberSnapshot(now+100).length,0);state.mode='play';e.dev.input.fullMap=true;assert.equal(d.damageNumberSnapshot(now+100).length,0);e.dev.input.fullMap=false;
  e.dev.CONFIG.damageNumbers=false;hit(e,player,victim,1,false,{id:100},now+110);assert.equal(d.damageNumbers.length,4);assert.equal(d.damageNumberSnapshot(now+110).length,0);
  pass('Automatic bullets remain individual with bounded/staggered feedback; bot, friendly, foreign-match, spectator, menu and full-map feedback stays hidden');
}
{
  const {e,state,player,victim,d}=playerGame(),now=e.dev.now();hit(e,player,victim,28,false,{id:50},now);
  state.camera.x=victim.x;state.camera.y=victim.y;
  const canvas=e.context.document.getElementById('game'),g=canvas.getContext('2d'),drawn=[],previous=g.fillText;g.fillText=(text,x,y)=>drawn.push({text,x,y,font:g.font});
  d.drawDamageNumbers(now);g.fillText=previous;assert.equal(drawn.length,1);assert.equal(drawn[0].text,'28');assert.ok(drawn[0].font.includes('16px'));
  const before=JSON.stringify(e.context.SAR.getUniverse());const snap=e.dev.renderSnapshot();assert.equal(snap.damageNumbers.length,1);assert.equal(snap.damageNumbers[0].amount,28);e.dev.renderSnapshot();assert.equal(JSON.stringify(e.context.SAR.getUniverse()),before);
  d.renderSettingsModal('gameplay');const html=e.context.document.getElementById('modalContent').innerHTML;assert.match(html,/data-settings-tab="game"/);assert.match(html,/data-settings-section="gameplay"/);assert.match(html,/id="damageNumbers"[^>]*checked/);assert.match(html,/class="camera-setting"/);
  e.context.__damageToggle({target:{id:'damageNumbers',checked:false}});assert.equal(e.dev.CONFIG.damageNumbers,false);assert.equal(d.damageNumbers.length,0);assert.equal(JSON.parse(e.data.get('sar-persistent-save')).config.damageNumbers,false);
  const stored=JSON.parse(e.data.get('sar-persistent-save')),reload=engine(Object.fromEntries(e.data),testSource);assert.equal(reload.dev.CONFIG.damageNumbers,false);assert.equal(reload.dev.inspect().SAVE.schema,stored.schema);assert.equal(reload.dev.inspect().SAVE.patchState.id,stored.patchState.id);
  delete stored.config.damageNumbers;const legacy=engine({'sar-persistent-save':JSON.stringify(stored)},testSource);assert.equal(legacy.dev.CONFIG.damageNumbers,true);assert.equal(legacy.dev.inspect().SAVE.schema,stored.schema);assert.equal(legacy.dev.inspect().SAVE.patchState.id,stored.patchState.id);
  assert.equal(state.mode,'play');
  pass('Classic draw and 2.5D snapshot share resolved values; Gameplay checkbox persists OFF, legacy saves default ON without schema/patch changes');
}
{
  // Run the actual 2.5D label function with a projection stub and a fake canvas:
  // verify numbers still render after the enemy model has died/disappeared.
  const renderer=fs.readFileSync(path.join(root,'renderer-25d.mjs'),'utf8'),start=renderer.indexOf('  function drawLabels(s){'),end=renderer.indexOf('  function updateShots(s){',start),drawn=[];
  const g=new Proxy({save(){},restore(){},setTransform(){},clearRect(){},strokeText(){},fillText(text,x,y){drawn.push({text,x,y,font:this.font,alpha:this.globalAlpha});}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  const projected={x:0,y:0,z:0,set(x,h,y){this.world={x,h,y};return this;},project(){this.x=.2;this.y=.1;return this;}};
  const labels={width:1440,getContext:()=>g},camera={right:800,left:-800};
  const draw=new Function('labels','width','height','clamp','camera','actors','projected','TEAM',renderer.slice(start,end)+';return drawLabels;')(labels,1440,900,(x,min,max)=>Math.min(max,Math.max(min,x)),camera,new Map(),projected,[]);
  const n={x:100,y:100,text:'12.5',amount:12.5,head:true,killing:true,offsetX:18,rise:13,alpha:.5};
  draw({mode:'play',fullMap:false,actors:[{id:5,dead:true}],damageNumbers:[n]});assert.equal(drawn.length,1);assert.equal(drawn[0].text,'12.5');assert.equal(drawn[0].alpha,.5);assert.ok(drawn[0].font.includes('800 19px'));
  draw({mode:'spectate',fullMap:false,actors:[],damageNumbers:[]});assert.equal(drawn.length,1);draw({mode:'play',fullMap:true,actors:[],damageNumbers:[n]});assert.equal(drawn.length,1);
  pass('2.5D label overlay draws retained killing/headshot feedback with rise/fade and suppresses full-map feedback');
}
console.log(`${checks.length} damage-number checks passed`);
