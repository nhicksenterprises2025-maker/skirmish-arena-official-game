'use strict';
// Pure presentation helpers and isolated engine fixtures. No installed account,
// runtime test API, reward balance or real saved world is modified.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs'),XP=require('../progression.js');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replace('window.SAR = {',
  'window.__PRESENTATION_TEST={WEAPONS,TILE,MAX_HP,weaponDisplayMetrics,loadoutCard,levelProgressHtml,rankProgressHtml,rankedSummaryHtml,progressionProfileHtml,sessionResultHtml};window.SAR = {');
const e=engine({},source),ui=e.context.__PRESENTATION_TEST,checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-9,message+`: ${a} != ${b}`);
const names=Object.keys(ui.WEAPONS),before=JSON.stringify(e.context.SAR.getUniverse());
assert.equal(names.length,14);assert.equal(ui.TILE,70);assert.equal(ui.MAX_HP,250);

// Independently walk the ideal bullet timeline, including separate burst rounds
// and reloads, instead of calling the display's TTK helper to verify itself.
function expectedTTK(w,damage){
  let hp=250,time=0,inMag=0;
  while(hp>0){
    hp-=damage;if(hp<=0)return time;
    inMag++;
    if(inMag===w.mag){time+=w.reload;inMag=0;continue;}
    if(w.burstCount&&inMag%w.burstCount)time+=w.burstSpacing;
    else time+=w.hitSpeed-(w.burstCount?(w.burstCount-1)*w.burstSpacing:0);
  }
}
const expected=Object.fromEntries(names.map(name=>{
  const w=ui.WEAPONS[name];return [name,{body:w.damage,head:w.head,bodyTtk:expectedTTK(w,w.damage),
    headTtk:expectedTTK(w,w.head),magazine:w.mag,reserve:w.reserve,reload:w.reload,range:w.preferred}];
}));
const maxima=Object.fromEntries(Object.keys(expected[names[0]]).map(key=>[key,Math.max(...Object.values(expected).map(row=>row[key]))]));
for(const name of names){
  const w=ui.WEAPONS[name],metrics=ui.weaponDisplayMetrics(name),html=ui.loadoutCard(name,[]);
  assert.equal(metrics.length,8);
  for(const row of metrics){
    near(row.value,expected[name][row.key],`${name} ${row.key} authoritative number`);
    near(row.maximum,maxima[row.key],`${name} ${row.key} shared arsenal maximum`);
    const shorter=['bodyTtk','headTtk','reload'].includes(row.key);
    assert.equal(row.shorter,shorter);
    near(row.ratio,shorter?1-row.value/maxima[row.key]:row.value/maxima[row.key],`${name} ${row.key} normalization`);
    assert(row.ratio>=0&&row.ratio<=1);
    assert(html.includes(`data-stat="${row.key}" data-value="${row.value}" data-maximum="${row.maximum}"`));
    assert(html.includes(`<dd>${row.text}</dd>`),`${name} retains the exact visible value alongside its bar`);
    if(shorter)assert.equal(row.text,row.value.toFixed(2)+' s');
    if(row.key==='range')assert(row.text.endsWith('wu / '+(w.preferred/70).toFixed(2)+' tiles'));
    if(['body','head'].includes(row.key))assert.equal(row.text.includes('/ shell'),w.pellets>1);
  }
  assert.match(html,/ADVANCED STATS/);assert.match(html,/data-preview-action="reset"/);
  assert.match(html,/data-set-(primary|sidearm)=/);assert(!html.includes('data-inspect-weapon'));
}
const aug=ui.weaponDisplayMetrics('SR-Aug');
assert(aug.find(row=>row.key==='bodyTtk').value>0,'Burst damage is not simultaneous');
assert(!aug.find(row=>row.key==='body').text.includes('/ shell'));
pass('All 14 weapons: eight shared-normalization bars, exact source values/units, independent real-cadence TTK, shotgun full-shell damage and separate burst rounds');

const level50Units=XP.requirements.slice(0,49).reduce((sum,value)=>sum+value,0)*100;
const capped=XP.view(level50Units+32145),levelHtml=ui.levelProgressHtml(capped);
assert.equal(capped.currentLevel,50);assert.equal(capped.currentXP,321.45);
assert.match(levelHtml,/LVL 50/);assert.match(levelHtml,/MAX LEVEL/);
assert.match(levelHtml,/<progress max="1" value="1" aria-label="Level progress">/);
assert(!/null|undefined|NaN/.test(levelHtml));
const low=ui.levelProgressHtml(XP.view(1234));
assert.match(low,/LVL 1/);assert.match(low,/12\.34 \/ 100 XP/);
for(const rank of XP.ranks){
  const view=XP.rankView(rank.thresholdUnits),html=ui.rankProgressHtml(view);
  assert(html.includes('<strong>'+rank.name+'</strong>'));assert(html.includes(' ELO'));
  assert.equal(html.includes('TOP RANK'),rank.name==='Ascendant');
  assert(!/null|undefined|NaN/.test(html));
}
const ascendant=ui.rankProgressHtml(XP.rankView(1_234_567));
assert.match(ascendant,/<strong>Ascendant<\/strong>/);assert.match(ascendant,/12,345\.67 ELO · TOP RANK/);
assert.match(ascendant,/Ascendant · highest rank/);assert(!ascendant.includes('ELO to'));
assert.equal(ui.rankedSummaryHtml(null),'');assert.equal(ui.rankedSummaryHtml(undefined),'');
const profile=ui.progressionProfileHtml();
assert.match(profile,/ACCOUNT LEVEL/);assert.match(profile,/RANKED ELO/);assert.match(profile,/<strong>Beginner I<\/strong>/);
assert.equal(JSON.stringify(e.context.SAR.getUniverse()),before,'Inspecting all presentation helpers never mutates a world');
pass('Level 50 retains overflow and a truthful cap; all 26 exact ranks including Ascendant display without invented next thresholds or state mutation');

for(const mode of ['tdm','deathmatch']){
  const fixture=engine({},source),worldBefore=fixture.context.SAR.getUniverse();
  const match=fixture.context.SAR.startCustomMatch({mode,bots:[]}),human=match.participants.find(actor=>actor.isPlayer);
  match.status='active';fixture.dev.endMatch(match,mode==='tdm'?human.team:human.id,'time');
  const html=fixture.context.__PRESENTATION_TEST.sessionResultHtml(match.result),worldAfter=fixture.context.SAR.getUniverse();
  assert.equal(match.result.xp,null);assert.equal(match.result.ranked,null);
  assert(!html.includes('XP EARNED'));assert(!html.includes('RANKED ELO'));assert(!html.includes('rank-badge'));
  assert.match(html,/No career, season, weapon meta or reward progress/);
  assert.deepEqual(worldAfter.progression,worldBefore.progression);assert.deepEqual(worldAfter.ranked,worldBefore.ranked);
}
pass('Actual isolated custom TDM/Deathmatch result panels show no fabricated XP, ELO, badge or reward gain');
console.log(JSON.stringify({ok:true,groups:checks.length,weapons:names.length,ranks:XP.ranks.length}));
