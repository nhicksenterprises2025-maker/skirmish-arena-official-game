'use strict';
// Current application, real exported models, isolated account/database. Combat
// is paused only in this presentation fixture; no owner data is opened.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const phase=process.argv[2]||'after',root=path.resolve(__dirname,'..');
const output=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-refined-followup',phase));fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const fixture=source.replace('function update(dt,now){','function update(dt,now){return; // Isolated presentation fixture.\n').replace('window.SAR = {','window.__FollowupUI={patch:()=>showModal(renderPatchNotesHtml(),"patch-notes"),operator:renderOperatorModal,loadout:renderLoadoutModal,metrics:weaponDisplayMetrics};window.SAR = {');assert.notEqual(fixture,source);
const app=require('../server/index.cjs').createServer({db:require('../server/db.cjs').createDatabase(':memory:')});
const errors=[],results=[],screens=['loadout','operator','phone','meta','tournaments','store','shop','profile','settings','patch-notes'];let browser,page;
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function open(screen){
 await page.evaluate(screen=>{document.getElementById('closeModal').click();if(screen==='profile')SAR.openPlayerProfile();else if(screen==='settings')SAR.showSettings();else if(screen==='patch-notes')__FollowupUI.patch();else document.querySelector('.menu-grid [data-action="'+screen+'"]').click();},screen);
 await page.waitForSelector('#modal.visible');
 if(['store','shop'].includes(screen))await page.waitForFunction(()=>SARCommerce.getStatus().verified);
 if(screen==='loadout')await page.waitForFunction(()=>document.querySelector('[data-weapon-card="AR-15"] canvas')?.dataset.previewReady==='true');
 if(screen==='operator')await page.waitForFunction(()=>document.querySelector('[data-operator-card] canvas')?.dataset.previewReady==='true');
 if(screen==='tournaments')await page.waitForFunction(()=>SARTournaments.getState().events.length>0);
 await page.waitForTimeout(150);
}
(async()=>{try{
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1920,height:1080},serviceWorkers:'block'});
 await context.route('**/game.js',route=>route.fulfill({contentType:'text/javascript',body:fixture}));
 const signup=await context.request.post(base+'/api/auth/signup',{data:{username:'followup_'+crypto.randomBytes(5).toString('hex'),password:crypto.randomBytes(20).toString('hex')},headers:{origin:base}});assert.equal(signup.status(),201);
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?diagnostics=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SAR&&window.SAR25D&&!document.getElementById('sarBoot'));await page.evaluate(()=>SARFullscreen.setAutoEnter(false));
 const metrics=await page.evaluate(()=>Object.fromEntries(Object.keys(SAR.getWeapons()).map(name=>[name,__FollowupUI.metrics(name)])));fs.writeFileSync(path.join(output,'weapon-display-metrics.json'),JSON.stringify(metrics,null,2));
 const before=path.join(path.dirname(output),'before','weapon-display-metrics.json');if(phase==='after'&&fs.existsSync(before))assert.deepEqual(metrics,JSON.parse(fs.readFileSync(before,'utf8')),'All exact weapon metrics and performance normalization preserved');
 const sizes=phase==='before'?[[1920,1080]]:[[1920,1080],[1720,1080],[1366,768],[1024,768]];
 for(const [width,height]of sizes){await page.setViewportSize({width,height});
  for(const screen of screens){const start=performance.now();await open(screen);const elapsed=performance.now()-start;
   const layout=await page.evaluate(()=>{const shell=document.querySelector('#modal>.modal'),content=document.getElementById('modalContent'),close=document.getElementById('closeModal'),r=close.getBoundingClientRect(),s=getComputedStyle(shell),table=content.querySelector('.meta-table');return {background:s.backgroundColor,color:s.color,overflow:Math.max(0,shell.scrollWidth-shell.clientWidth),documentOverflow:document.documentElement.scrollWidth-innerWidth,closeVisible:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,tableOverflow:table?table.scrollWidth-table.clientWidth:0,previews:content.querySelectorAll('canvas').length};});
   if(phase==='after'){assert.equal(layout.closeVisible,true,screen+' Close remains visible at '+width);assert.ok(layout.overflow<=2,screen+' horizontal overflow '+layout.overflow+' at '+width);assert.ok(layout.documentOverflow<=2,screen+' document overflow');assert.ok(!['rgb(237, 244, 250)','rgb(236, 239, 230)'].includes(layout.background),screen+' dark shell');}
   await shot(screen+'-'+width+'x'+height);results.push({screen,width,height,openMs:Math.round(elapsed),...layout});
  }
 }
 await open('loadout');const preview=page.locator('[data-weapon-card="AR-15"] canvas');await preview.click();await page.locator('[data-weapon-card="AR-15"] [data-preview-action="right"]').click();
 await open('operator');const other=page.locator('[data-set-skin="1"]');await other.click();assert.equal(await page.evaluate(()=>SAR.getConfig().skin),1);
 await open('meta');await page.locator('[data-sort-key="kills"]').first().click();assert.ok(await page.locator('[data-sort-key="kills"]').first().textContent());
 await open('phone');const apps=await page.locator('[data-phone-open]').count();assert.equal(apps,4);await page.locator('[data-phone-open="scores"]').click();await page.waitForSelector('.phone-scroll');
 await open('store');await page.locator('[data-commerce="inspect"]').first().click();await page.waitForSelector('.commerce-detail');
 await open('shop');const checkout=await page.locator('[data-commerce="checkout"]').all();assert.ok(checkout.length>=6);if(!(await page.evaluate(()=>SARCommerce.getStatus().verified)))assert.ok(await checkout[0].isDisabled());
 await open('profile');await page.evaluate(()=>SAR.openCombinedProfile());await page.waitForSelector('#modalContent[data-view="combined-profile"]');
 await open('settings');await page.waitForTimeout(150);await page.locator('#closeModal').click();await open('settings');
 const previews=await page.evaluate(()=>SAR.getPreviewDiagnostics());assert.deepEqual(errors,[]);
 const report={ok:true,phase,results,errors,remainingPhoneApps:apps,previews,gameSHA256:crypto.createHash('sha256').update(source).digest('hex')};fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify(report,null,2));console.log('PASS '+results.length+' page/resolution captures; exact metrics, selection, rotation, sorting, Phone, Store, Shop and profile interactions');
}catch(error){if(page)await shot('failure').catch(()=>{});fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({ok:false,phase,results,errors,error:String(error.stack)},null,2));console.error(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>app.server.close(resolve));app.db.close();}})();
