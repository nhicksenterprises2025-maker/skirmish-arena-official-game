(function(root){
 'use strict';
 const revision='tactical-adaptation-1';
 const presets=Object.freeze({Easy:{reaction:1.28,decision:1.22,error:1.25},Medium:{reaction:1,decision:1,error:1},Hard:{reaction:.90,decision:.90,error:.80},Pro:{reaction:.80,decision:.82,error:.62}});
 const clamp=(v,l=0,h=1)=>Math.max(l,Math.min(h,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function quality(power){return .28+.72*clamp((power-20)/79);}
 function memory(){return {routes:[],cover:[],teamLosses:[],damageReports:[],recent:[],chases:0,pushes:0,isolation:0,badRange:0,lifeDealt:0,lifeTaken:0,waitUntil:0,waitCooldown:0};}
 function observeDamage(m,id,amount,now){
  m.damageReports=(m.damageReports||[]).filter(r=>now-r.at<9000);let r=m.damageReports.find(r=>r.id===id);
  if(!r){r={id,damage:0,at:now};m.damageReports.push(r);}r.damage=Math.min(250,r.damage*Math.exp(-Math.max(0,now-r.at-1200)/2600)+Math.max(0,amount));r.at=now;m.damageReports=m.damageReports.slice(-10);
 }
 function forgetHealth(m,id){m.damageReports=(m.damageReports||[]).filter(r=>r.id!==id);}
 function estimateHealth(m,id,now){
  const r=m.damageReports?.find(r=>r.id===id),age=r?Math.max(0,now-r.at):Infinity;
  // This is an upper-HP estimate from this bot's own confirmed hits, never a
  // read of live enemy HP. Unobserved healing and other damage remain unknown.
  const retained=r?Math.exp(-Math.max(0,age-1200)/2600):0;
  return {hp:250-(r?.damage||0)*retained,healthConfidence:r?.damage>=50?.85*Math.exp(-age/3600):0,observedDamage:r?.damage||0,healthEstimated:true};
 }
 function teamAssessment(members){const count=members.length,averagePower=count?members.reduce((sum,a)=>sum+a.power,0)/count:50;return {count,averagePower,quality:quality(averagePower)};}
 function routePenalty(m,from,goal,now){
  const dx=goal.x-from.x,dy=goal.y-from.y,length2=dx*dx+dy*dy;
  return m.routes.reduce((sum,r)=>{const age=now-r.at;if(age>60000)return sum;const t=length2?clamp(((r.x-from.x)*dx+(r.y-from.y)*dy)/length2):0,near=distance(r,{x:from.x+dx*t,y:from.y+dy*t});return sum+(near<220?r.weight*(1-age/60000)*(1-near/220):0);},0);
 }
 function remember(m,event){
  if(event.kind==='ally_down'){m.teamLosses=(m.teamLosses||[]).filter(r=>event.at-r.at<2500&&r.id!==event.id);m.teamLosses.push({id:event.id,x:event.x,y:event.y,at:event.at});m.teamLosses=m.teamLosses.slice(-4);return;}
  if(event.kind==='damage'){m[event.received?'lifeTaken':'lifeDealt']+=event.amount;m.recent=(m.recent||[]).filter(r=>event.at-r.at<15000);m.recent.push({at:event.at,received:!!event.received,amount:event.amount});m.recent=m.recent.slice(-16);return;}
  if(event.kind==='death'){
   m.routes.push({x:event.x,y:event.y,at:event.at,door:event.door,approach:event.approach,weight:1+(m.lifeTaken>m.lifeDealt?1:0)});m.routes=m.routes.slice(-6);
   m.chases=clamp(m.chases*.7+(event.tactic==='CHASE'?.5:0));m.pushes=clamp(m.pushes*.7+(['PUSH','DASH_ATTACK'].includes(event.tactic)?.5:0));
   m.isolation=clamp(m.isolation*.7+(event.isolated?.4:0));m.badRange=clamp(m.badRange*.7+(event.badRange?.4:0));m.lifeTaken=m.lifeDealt=0;
  }else if(event.kind==='cover'&&m.lifeDealt>m.lifeTaken){m.cover.push({x:event.x,y:event.y,at:event.at});m.cover=m.cover.slice(-3);}
  else if(event.kind==='chase_end'){m.chases=clamp(m.chases*.8+(event.success?-.15:.2));}
 }
 // Only already-visible observations and delayed, imprecise reports cross this boundary.
 // No live opponent actor, ammunition, or simulation prediction is accepted.
 function publish(board,actor,now){
  if(!board)return;for(const [id,item] of board)if(item.expires<=now)board.delete(id);
  if(board.get(actor.id)?.expires>now)return;
  const q=clamp(quality(actor.power)/(actor.executionError||1),.2,1),delay=220+(1-q)*500;
  board.set(actor.id,{id:actor.id,team:actor.team,x:Math.round(actor.x/80)*80,y:Math.round(actor.y/80)*80,action:actor.action,
   intent:actor.intent||'HOLD',confidence:.45+q*.4,ready:actor.ready,quality:q,availableAt:now+delay,expires:now+1900,
   reports:(actor.enemies||[]).filter(e=>e.visible).slice(0,2).map(e=>({id:e.id,name:e.name,isPlayer:e.isPlayer,x:Math.round(e.x/140)*140,y:Math.round(e.y/140)*140,at:e.at,visible:false,reported:true,confidence:(.45+q*.25),vx:0,vy:0,hp:250,healthConfidence:0,healthEstimated:true,power:50,weapon:e.weapon,angle:0}))});
 }
 function reports(board,actor,now){if(!board)return [];return [...board.values()].filter(i=>i.id!==actor.id&&i.team===actor.team&&i.availableAt<=now&&i.expires>now&&distance(i,actor)<1250).flatMap(i=>i.reports).filter(r=>now-r.at<2100);}
 function chaseAssessment(s){
  const t=s.target;if(!t)return {confidence:0,utility:0};
  const age=Math.max(0,s.now-t.at),confidence=(t.healthConfidence||0)*(t.visible?1:.55)*Math.exp(-age/2200),range=distance(s,t),w=s.weapon,p=s.personality||{};
  if(confidence<.18||t.hp>=115||s.hp<.28||s.reloading||s.ammo<.12||age>2600)return {confidence,utility:0};
  const allies=s.ffa?[]:s.allies||[],pressure=Math.max(0,(s.enemies||[]).length-allies.length-1),reach=clamp(1-Math.max(0,range-w.preferred)/Math.max(200,w.preferred));
  const role={Rusher:.6,Flanker:.3,Marksman:-1.15,Anchor:-.8,Flex:.15}[s.style]||0,rounds=s.ammo*w.mag,needed=Math.ceil(t.hp/Math.max(1,w.damage||28));
  const utility=2.6+confidence*1.25+clamp((115-t.hp)/115)*.7+role+(p.chasePreference??.5)*.45+(s.dashReady?.12:0)-pressure*.85-(1-reach)*1.2-(rounds<needed?.9:0)-(s.memory?.chases||0)*.65;
  return {confidence,utility:Math.max(0,utility),estimatedHp:t.hp,alternate:s.style==='Flanker'};
 }
 function weaponWeight(s){
  const gravity={DISCOVERY:.10,DEVELOPING:.55,STABLE:1}[s.phase]??.10,confidence=clamp(s.confidence),strength=clamp((s.score-50)/30,-1,1);
  const log=gravity*confidence*strength*(.65+s.awareness*.45)+.5*s.style+.25*s.familiarity+.25*s.personal*clamp(s.personalConfidence)+.22*(1-confidence)*(s.phase==='DISCOVERY'?1:.35)+.16*s.surprise;
  return Math.max(.05,Math.exp(log*2.2));
 }
 function chooseAction(utilities,s,random=Math.random){
  const q=clamp(quality(s.power)/(s.executionError||1),.2,1),m=s.memory;let action='FIGHT',best=-Infinity;
  for(const [key,value]of Object.entries(utilities)){const score=value+(random()-.5)*.6*(1.15-q)*(s.executionError||1);if(score>best){best=score;action=key;}}
  const emergency=s.hp<.22||s.ammo===0||s.regenActive||s.pressure>(m.lastPressure??s.pressure)+1||s.hp<(m.lastHp??s.hp)-.22;
  const sameTarget=m.lastTarget===s.targetId,margin=.55+q*.25;
  const hysteresis=s.now<(m.commitUntil||0)?margin:.2+q*.1;
  if(!emergency&&sameTarget&&Number.isFinite(utilities[s.current])&&utilities[s.current]>=best-hysteresis)action=s.current;
  if(action!==s.current){m.commitUntil=s.now+650+q*300+(s.persistence||0)*300;m.switchedAt=s.now;}
  m.lastTarget=s.targetId;m.lastHp=s.hp;m.lastPressure=s.pressure;
  return {action,commitUntil:m.commitUntil||0,emergency,top:Object.entries(utilities).sort((a,b)=>b[1]-a[1]).slice(0,4)};
 }
 function evaluate(s){
  const q=clamp(quality(s.power)/(s.executionError||1),.2,1),m=s.memory,u={},notes=[],adjust=(key,value)=>{u[key]=(u[key]||0)+value;},teamQ=s.ffa?0:clamp((s.teamAssessment?.quality??q)/(s.executionError||1),.2,1);
  const late=Math.max(clamp(1-s.remaining/65000),clamp((s.leadingScore-((s.targetScore|| (s.ffa?30:60))-6))/6)),behind=s.ownScore<s.leadingScore,lead=s.ownScore-s.opponentScore,close=Math.abs(lead)<=3,phase=late>.15?'LATE':s.remaining>(s.duration||300000)*.7?'EARLY':'MID';
  const enemies=s.enemies||[],allies=s.ffa?[]:(s.allies||[]),near=allies.filter(a=>distance(a,s)<800),outnumbered=enemies.length>near.length+1;
  if(phase==='EARLY'){adjust('FLANK',.2);adjust('REPOSITION',.15);notes.push('establish lanes');}else if(phase==='MID')notes.push('adapt to observations');
  if(late>.1){if(s.ffa?behind:lead<0){adjust('PUSH',late*(.6+q*.55));adjust('FLANK',late*.65);notes.push('late pressure');}
   else if(lead>0||s.ffa&&!behind){adjust('PEEK',late*.5*q);adjust('SUPPORT',late*.65*q);adjust('CHASE',-late*.9*q);notes.push('protect lead');}
   if(close&&!s.ffa){adjust('SUPPORT',.4*q);adjust('DASH_ATTACK',-.35*q);}}
  if(s.ffa){adjust('RETREAT',Math.max(0,enemies.length-1)*(.6+q*.4));adjust('CHASE',-Math.max(0,enemies.length-1)*.6);adjust('FLANK',enemies.length>1?.45:0);if(enemies.length>1){const angles=enemies.map(e=>Math.atan2(e.y-s.y,e.x-s.x));if(angles.some(a=>angles.some(b=>Math.cos(a-b)<-.3)))adjust('RETREAT',.8);}if(s.target?.engaged){adjust('FIGHT',.35+q*.3);notes.push('observed third party');}notes.push('free-for-all awareness');}
  if(s.ffa&&behind&&late>.1){adjust('PUSH',late*clamp(((s.placement||2)-1)/9)*.35);notes.push('placement pressure');}
  const t=s.target;
  let support=null,goal=null;
  if(!s.ffa&&t){
   support=near.filter(a=>a.reloading||a.retreating||a.attacked).sort((a,b)=>Number(b.attacked)-Number(a.attacked)||distance(a,s)-distance(b,s))[0];
   const ready=near.filter(a=>!a.reloading&&!a.retreating&&a.hp>80).length;
   const intentions=(s.intentions||[]).filter(i=>i.team===s.team&&i.id!==s.id&&i.availableAt<=s.now&&i.expires>s.now&&distance(i,s)<850);
   if(support&&s.hp>.4&&s.ammo>.25){u.SUPPORT=3.1+q*.8+teamQ*.5+(support.attacked?.25:0);notes.push(support.reloading?'cover reload':support.attacked?'trade pressure':'cover retreat');}
   if(ready>0&&!outnumbered){const committed=intentions.filter(i=>i.ready&&['PUSH','SUPPORT','FLANK'].includes(i.action)).reduce((sum,i)=>sum+(i.confidence??.5),0);adjust('PUSH',.15+teamQ*.35+Math.min(2,committed)*teamQ*.4);notes.push('paired opportunity');}
   if(t.visible&&s.hp>.4&&s.ammo>.25&&!outnumbered&&(m.teamLosses||[]).some(r=>s.now-r.at<2200&&distance(r,t)<550)){adjust('FIGHT',.3+teamQ*.35);adjust('PUSH',.25+teamQ*.35);notes.push('trade observed loss');}
   if(outnumbered&&near.length&&!s.reloading&&s.hp>.4&&s.ammo>.25&&s.now>=m.waitCooldown){m.waitUntil=s.now+450+q*450;m.waitCooldown=s.now+5200;}
   if(s.now<m.waitUntil&&!ready){u.WAIT_SUPPORT=3.7+q*.5;notes.push('brief support wait');}
   // Distinct left/right lanes based on the individual actor; never all one doorway.
   if(support){const angle=Math.atan2(t.y-support.y,t.x-support.x),side=s.id%2?1:-1,spacing=140+(s.id%3)*55;goal={x:support.x+Math.cos(angle+side*Math.PI/2)*spacing-Math.cos(angle)*60,y:support.y+Math.sin(angle+side*Math.PI/2)*spacing-Math.sin(angle)*60};}
   const crowd=near.filter(a=>distance(a,s)<220).length;if(crowd>1){adjust('FLANK',crowd*(.35+teamQ*.3));adjust('HOLD',-crowd*.4);notes.push('separate lanes');}
   const rejoin=allies.filter(a=>distance(a,s)>350).sort((a,b)=>distance(a,s)-distance(b,s))[0];if(rejoin&&m.isolation>.2&&s.hp>.28){u.REGROUP=2.9+m.isolation*(.5+teamQ);if(!support)goal={x:rejoin.x,y:rejoin.y};notes.push('rejoin support');}
  }
  if(t){
   const range=distance(s,t),travel=range/(s.weapon.speed*70),spread=s.spread;
   if(t.visible&&s.hp>.4&&s.ammo>.3&&(m.cover||[]).some(c=>s.now-c.at<45000&&distance(c,s)<230)){adjust('PEEK',.25+q*.2);adjust('HOLD',.2);notes.push('recent successful hold');}
   if(s.weapon.pellets>1&&range>s.weapon.preferred*1.7){adjust('FIGHT',-.7);adjust('FLANK',.6*q);adjust('DASH_ATTACK',-.5);notes.push('shotgun approach');}
   if(s.weapon.preferred>=1200&&range<350){adjust('RETREAT',1.3);adjust('REPOSITION',1.1);}
   if(travel>.2&&spread>4){adjust('PEEK',.4*q);adjust('CHASE',-.5*q);}
   if(s.weapon.burstCount&&s.ammo*s.weapon.mag<s.weapon.burstCount*2){adjust('RELOAD',.9*q);adjust('PUSH',-.8);}
   if(t.visible&&t.reloading&&s.now-t.at<300&&range<s.weapon.preferred*1.3&&s.ammo>.35&&s.hp>.5){adjust('PUSH',.7*q);notes.push('observed reload');}
   const routeRisk=routePenalty(m,s,t,s.now);if(routeRisk>.6){adjust('FLANK',Math.min(1.8,routeRisk*.5)*(.5+q*.5));adjust('PUSH',-Math.min(1.3,routeRisk*.4));notes.push('avoid failed route');}
   if(s.ammo<.3&&!s.reloading&&(!t.visible||near.some(a=>!a.reloading))){adjust('RELOAD',.7+q*.4+(s.weapon.reload>3?.3:0));notes.push('reload with support');}
  }
  adjust('CHASE',-m.chases*q);adjust('DASH_ATTACK',-m.pushes*q);if(outnumbered)adjust('PUSH',-m.isolation*q);
  if(s.ammo<.2){adjust('PUSH',-1.5);adjust('CHASE',-1);adjust('SUPPORT',-1);}
  if(s.regenNear){adjust('REGEN_HIDE',q*.65);adjust('PUSH',-1);notes.push('protect recovery');}
  if(m.badRange>.2){adjust('REPOSITION',m.badRange*q);adjust('CHASE',-m.badRange*q);}
  const recent=(m.recent||[]).filter(r=>s.now-r.at<8000),taken=recent.filter(r=>r.received).reduce((sum,r)=>sum+r.amount,0),dealt=recent.filter(r=>!r.received).reduce((sum,r)=>sum+r.amount,0);
  if(taken>dealt+70&&s.hp<.6){adjust('PEEK',.4);adjust('RETREAT',.35+q*.3);notes.push('recent pressure');}
  const chase=chaseAssessment(s);adjust('CHASE',chase.utility);
  if(s.ffa){delete u.SUPPORT;delete u.REGROUP;delete u.WAIT_SUPPORT;}
  const intention=s.ffa?null:support?.reloading?'COVER RELOAD':support?.attacked?'CROSSFIRE':u.REGROUP?'REGROUP':late>.1&&lead>0?'DEFEND LEAD':late>.1&&lead<0?'COMEBACK PRESSURE':(s.style==='Flanker'?'FLANK SUPPORT':outnumbered?'HOLD':'PUSH');
  return {utilities:u,goal,supportId:support?.id,quality:q,teamQuality:teamQ,phase,intention,chase,notes,waitUntil:m.waitUntil};
 }
 const api={revision,presets,quality,memory,remember,observeDamage,forgetHealth,estimateHealth,teamAssessment,routePenalty,publish,reports,chaseAssessment,weaponWeight,chooseAction,evaluate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SARTactics=api;
})(typeof window!=='undefined'?window:globalThis);
