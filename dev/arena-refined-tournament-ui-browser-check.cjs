'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {teams}=require('./tournaments-ui-check.cjs'),rulesetId='arena-refined-aggregate-kills-v1';
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-arena-refined-tournament-ui'));
fs.mkdirSync(output,{recursive:true});
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
let browser,events=[],requests=[],page;const errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const fixture=(owner,kind='final')=>{
 const roster=teams();roster[1].participants[0]={id:owner,name:'Fixture',kind:'user'};
 const make=(round,index,extra={})=>({id:'cup:'+round+index,round,rulesetId,requiredGames:round==='FINAL'?5:3,teamIds:round==='QF'?['team'+index*2,'team'+(index*2+1)]:[null,null],wins:[0,0],games:[],aggregateKills:[0,0],completedGames:0,remainingGames:round==='FINAL'?5:3,status:round==='QF'?'in-progress':'waiting-opponents',advancement:{status:'pending'},winnerTeamId:null,...extra});
 const qf=make('QF',0,{wins:[2,1],aggregateKills:[128,136],completedGames:3,remainingGames:0,games:[{id:'g1',score:[56,30]},{id:'g2',score:[52,46]},{id:'g3',score:[20,60]}],status:'complete',winnerTeamId:'team1',advancement:{status:'decided',winnerTeamId:'team1'}});
 const final=make('FINAL',0,{teamIds:['team0','team1'],wins:[3,1],aggregateKills:[210,187],completedGames:4,remainingGames:1,status:'in-progress',games:[{score:[60,30]},{score:[60,42]},{score:[60,55]},{score:[30,60]}]});
 if(kind==='tie'){qf.winnerTeamId=null;qf.aggregateKills=[136,136];qf.status='awaiting-tie-policy';qf.advancement={status:'tied'};}
 if(kind==='legacy'){delete qf.rulesetId;qf.bestOf=3;}
 return {id:'cup',name:'Arena Refined Fixture',kind:'custom',creatorId:owner,canDelete:true,startsAt:Date.now()-1000,status:'ACTIVE',...(kind==='legacy'?{}:{rulesetId}),teams:roster,series:kind==='final'?[qf,make('QF',1),make('QF',2),make('QF',3),make('SF',0),make('SF',1),final]:[qf],placements:[],earnings:[],invites:[]};
};
async function show(){await page.evaluate(()=>SARTournaments.show());await page.locator('[data-circuit-event="cup"]').first().click();await page.locator('[data-circuit-action="detail-tab"][data-value="bracket"]').click();}
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const signup=await context.request.post(base+'/api/auth/signup',{data:{username:'audit6_ui_'+Date.now().toString(36),password:crypto.randomBytes(18).toString('hex')},headers:{origin:base}});assert.equal(signup.status(),201);const owner=(await signup.json()).account.id;
 events=[fixture(owner)];await context.route('**/api/tournaments',async route=>{requests.push({method:route.request().method(),url:route.request().url()});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tournaments:events,earnings:[]})});});
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/?diagnostics=1');
 await page.waitForFunction(()=>window.SAR&&window.SARTournaments&&window.SARCloud?.state.loaded&&!document.getElementById('sarBoot'),null,{timeout:45000});await page.evaluate(()=>SARFullscreen.setAutoEnter(false));
 await show();const host=page.locator('#modalContent');assert.doesNotMatch(await host.innerText(),/BO3|BO5/);
 assert.match(await page.locator('.circuit-series[data-round="QF"]').first().innerText(),/128 — 136/);
 assert.equal(await page.locator('.circuit-series[data-round="QF"]').first().locator('[data-winner="true"]').innerText(),'Team 1\nBLUE');
 const final=page.locator('.circuit-series[data-round="FINAL"]');assert.match(await final.innerText(),/5-game aggregate kills/);assert.match(await final.innerText(),/4 \/ 5 games complete · 1 remaining/);assert.equal(await final.locator('.circuit-game-kills td').count(),8);
 await final.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'aggregate-desktop.png')});
 pass('Actual game shell presents all series aggregate totals, each resolved game and five-game final progress');
 for(const width of [1440,900,390]){await page.setViewportSize({width,height:1000});await final.scrollIntoViewIfNeeded();const layout=await host.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,cards:[...el.querySelectorAll('.circuit-series,.circuit-game-kills')].map(item=>({width:item.clientWidth,scroll:item.scrollWidth}))}));assert.ok(layout.scroll<=layout.width+1,'modal fits at '+width);assert.ok(layout.cards.every(item=>item.scroll<=item.width+1),'series and game table fit at '+width);}
 await page.screenshot({path:path.join(output,'aggregate-mobile.png')});pass('Desktop, tablet and 390px mobile keep aggregate cards/game tables within current modal width');
 events=[fixture(owner,'tie')];await show();assert.equal(await page.locator('[data-circuit-action="play"]').isDisabled(),true);assert.match(await host.innerText(),/Aggregate tied · awaiting a confirmed tie policy/);assert.equal(await page.locator('[data-winner="true"]').count(),0);await page.locator('.circuit-tie').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'aggregate-tie.png')});
 const before=JSON.stringify(events);await page.locator('[data-circuit-action="calendar"]').click();await page.locator('[data-circuit-event="cup"]').first().click();assert.equal(JSON.stringify(events),before);assert.ok(requests.every(r=>r.method==='GET'));
 pass('Tie blocks Play without winner/advancement, and reopening sends only read requests');
 events=[fixture(owner,'legacy')];await show();assert.match(await host.innerText(),/HISTORICAL FORMAT/);assert.match(await page.locator('.circuit-series').innerText(),/Historical · BO3/);assert.match(await page.locator('.circuit-series').innerText(),/2 — 1/);await page.screenshot({path:path.join(output,'historical-format.png')});pass('Historical tournament stays intelligible with its original best-of score');
 await page.locator('[data-circuit-action="calendar"]').click();await page.locator('[data-circuit-action="create"]').click();assert.match(await host.innerText(),/3-game aggregate kills/);assert.match(await host.innerText(),/5-game aggregate kills/);assert.doesNotMatch(await host.innerText(),/BO3|BO5/);assert.match(await host.innerText(),/No in-game earnings or official progression/);pass('Custom creation explains complete-series kills and preserves progression exclusion');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'tournament-ui-browser-results.json'),JSON.stringify({checks,errors,readOnlyRequests:requests.length,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../tournaments-ui.js'))).digest('hex')},null,2));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'tournament-ui-failure.png')}).catch(()=>{});throw error;}finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
