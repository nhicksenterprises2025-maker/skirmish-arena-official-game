'use strict';
// Actual exported GLB through the game's shared inspection renderer, at badge size.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'weapon-mastery-assets'));
const weapons=require('./simulate.cjs').engine().context.SAR.getWeapons(),M=require('../weapon-mastery.js');
const checks=[],errors=[],requests=[];let browser;
const fixture='<!doctype html><meta charset="utf-8"><style>:root{--sky-panel-light:#ececdf}body{margin:16px;background:#ececdf;color:#283d32;font:14px Arial}h1{font-size:18px;font-weight:600;margin:0 0 14px}#sheet{display:grid;grid-template-columns:repeat(5,164px);gap:12px}figure{margin:0;display:grid;justify-items:center}canvas{width:96px;height:96px;display:block}figcaption{font-size:12px;margin:6px 0;text-align:center}#turntable{width:180px;height:180px}</style><h1>Weapon mastery · exported badges</h1><div id="sheet"></div><script src="/weapon-mastery.js"></script>';
const server=http.createServer((req,res)=>{const url=decodeURIComponent(new URL(req.url,'http://fixture').pathname);if(url==='/fixture'){res.setHeader('content-type','text/html');return res.end(fixture);}const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
function pass(label){checks.push(label);console.log('PASS '+label);}
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});
 const context=await browser.newContext({viewport:{width:900,height:1160},serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 await page.evaluate(async weapons=>{window.weapons=weapons;window.inspection=await import('/inspect-25d.mjs');window.pixelData=canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let filled=0,edge=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const offset=(y*canvas.width+x)*4;if(pixels[offset+3]>20){filled++;if(!x||!y||x===canvas.width-1||y===canvas.height-1)edge++;}}return {filled,edge,data:Array.from(pixels)};};},weapons);
 const classes=new Map(Object.entries(weapons).map(([name,definition])=>[M.weaponClass(name,definition),name]));
 const identities=await page.evaluate(async families=>{
  const results=[];for(const [family,name]of families)for(const tier of SARWeaponMastery.CONFIG.badgeTiers){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),label=document.createElement('figcaption');canvas.width=96;canvas.height=96;label.textContent=family+' · Tier '+tier;figure.append(canvas,label);document.getElementById('sheet').append(figure);await inspection.paintInspection(canvas,{kind:'mastery',weapon:name,weaponDef:weapons[name],tier});const {data,...pixels}=pixelData(canvas);results.push({family,tier,...pixels});}return results;
 },[...classes]);
 assert.equal(identities.length,40);assert(identities.every(value=>value.filled>1200&&value.edge===0));
 await page.locator('body').screenshot({path:path.join(out,'mastery-40-badges-96px.png')});pass('40 class/tier GLB badges render at 96 pixels, with valid relief and unclipped framing');
 const mappings=await page.evaluate(async()=>{
  const results=[];document.getElementById('sheet').replaceChildren();for(const [name,definition]of Object.entries(weapons))for(const tier of SARWeaponMastery.CONFIG.badgeTiers){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;canvas.style.width=canvas.style.height='64px';document.getElementById('sheet').append(canvas);await inspection.paintInspection(canvas,{kind:'mastery',weapon:name,weaponDef:definition,tier});const {data,...pixels}=pixelData(canvas);results.push({name,tier,...pixels});canvas.remove();}return results;
 });
 assert.equal(mappings.length,Object.keys(weapons).length*5);assert(mappings.every(value=>value.filled>500&&value.edge===0));pass('All 15 live weapons, including FAL, render five distinct tiers at 64 pixels');
 const rotations=await page.evaluate(async()=>{
  const results=[];document.getElementById('sheet').replaceChildren();for(let i=0;i<=8;i++){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),label=document.createElement('figcaption');canvas.width=canvas.height=128;canvas.style.width=canvas.style.height='128px';label.textContent=(i*45)+'°';figure.append(canvas,label);document.getElementById('sheet').append(figure);await inspection.paintInspection(canvas,{kind:'mastery',weapon:'FAL',weaponDef:weapons.FAL,tier:10,rotation:i*Math.PI/4});results.push({angle:i*45,...pixelData(canvas)});}return results;
 });
 assert(rotations.every(value=>value.filled>400&&value.edge===0));assert.deepEqual(rotations[0].data,rotations[8].data);assert.notDeepEqual(rotations[0].data,rotations[2].data);assert.notDeepEqual(rotations[0].data,rotations[4].data);
 await page.locator('body').screenshot({path:path.join(out,'fal-mastery-full-360.png')});pass('Actual FAL mastery badge completes a full 360° inspection with genuine side/back depth');
 await page.evaluate(()=>{document.getElementById('sheet').replaceChildren();const canvas=document.createElement('canvas');canvas.id='turntable';document.getElementById('sheet').append(canvas);window.card=inspection.mountCardPreview(canvas,{kind:'mastery',weapon:'FAL',weaponDef:weapons.FAL,tier:10});});
 await page.waitForFunction(()=>document.getElementById('turntable').dataset.previewReady==='true');
 await page.locator('#turntable').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(120);const turned=await page.evaluate(()=>card.state());assert(Math.abs(turned.rotation-Math.PI/12)<.001);
 await page.keyboard.press('Home');await page.waitForTimeout(120);assert.equal((await page.evaluate(()=>card.state())).rotation,0);
 const box=await page.locator('#turntable').boundingBox();await page.mouse.move(box.x+70,box.y+80);await page.mouse.down();await page.mouse.move(box.x+105,box.y+80);await page.mouse.up();await page.waitForTimeout(120);assert((await page.evaluate(()=>card.state())).rotation>.3);
 await page.evaluate(()=>card.dispose());pass('Shared preview keyboard and drag controls work; disposal removes mounted badge');
 const diagnostics=await page.evaluate(()=>inspection.previewDiagnostics());assert.equal(diagnostics.webglContexts,1);assert.equal(diagnostics.mountedCards,0);assert.equal(diagnostics.animationScheduled,false);assert(diagnostics.staticModels<=3&&diagnostics.thumbnailCount<=48);
 assert.equal(requests.filter(value=>value==='/assets/25d/mastery/weapon-mastery.glb').length,1);assert(!requests.some(value=>value.endsWith('blue-circuit-ranks.glb')||value.endsWith('live-circuit-details.glb')));pass('One shared WebGL context, one lazy GLB fetch, bounded caches and no background render loop');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'mastery-badge-browser-results.json'),JSON.stringify({ok:true,checks,identities,mappings,rotations:rotations.map(({data,...value})=>value),diagnostics,requests,errors},null,2)+'\n');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
