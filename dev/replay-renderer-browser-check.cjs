'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{fixture}=require('./replay-playback-check.cjs');
const {chromium}=require(process.env.SAR_PLAYWRIGHT||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SAR_TEST_OUTPUT||path.join(os.tmpdir(),'sar-replay-renderer')),checks=[],errors=[];
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;background:#253b30}#game{width:100vw;height:100vh}:root{--arena-hud-panel:#1B241F;--arena-hud-border:#47534B;--arena-hud-text:#EDF1E9}</style><canvas id="game"></canvas><script src="/match-modes.js"></script><script src="/team-presentation.js"></script><script src="/replay-playback.js"></script>';
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture').pathname;if(url==='/fixture')return res.writeHead(200,{'content-type':'text/html'}).end(html);const file=path.resolve(root,'.'+decodeURIComponent(url));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
let browser;
function pass(name){checks.push(name);console.log('PASS',name);}
(async()=>{try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,...(process.env.SAR_CHROMIUM?{executablePath:process.env.SAR_CHROMIUM}:{channel:'msedge'})});const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(async()=>{const module=await import('/renderer-25d.mjs');window.makeRenderer=module.createRenderer;window.SARCloud={state:{account:{id:'fixture-owner'}}};window.SAR={beginReplayView:async()=>{},finishReplayView:()=>window.view?.releaseReplay()};});
  for(const mode of ['tdm','deathmatch','gun-game','domination','hardpoint'])for(const mapId of ['brightfield-blocks','foundry-crossing','relay-fields']){
    const {record}=fixture(mode,mapId);record.metadata.weaponConfiguration.FAL.damage=48;
    const result=await page.evaluate(async record=>{
      await SARReplayPlayback.open(record);if(!window.view)window.view=makeRenderer(SARReplayPlayback.snapshot());view.resize(innerWidth,innerHeight);
      SARReplayPlayback.seek(500);view.render(SARReplayPlayback.snapshot());SARReplayPlayback.camera('tactical');view.render(SARReplayPlayback.snapshot());const first=view.diagnostics();
      SARReplayPlayback.seek(1900);view.render(SARReplayPlayback.snapshot());SARReplayPlayback.seek(500);view.render(SARReplayPlayback.snapshot());const returned=view.diagnostics();
      SARReplayPlayback.close();const closed=view.diagnostics();return {first,returned,closed};
    },record);
    assert.equal(result.first.mapId,mapId);assert.equal(result.first.actors,10);assert.equal(result.first.labels,true);assert.equal(result.first.view.houses,record.geometry.floors.length);assert.equal(result.first.world.w,record.frames[0].snapshot.world.w);assert.ok(result.first.drawCalls>0);assert.equal(result.returned.actors,10);assert.equal(result.closed.environmentCount,0);assert.equal(result.closed.actors,0);
  }
  pass('Actual Edge WebGL renders all five modes on all three archived maps, camera switches and backward scrubs');
  const {record}=fixture('tdm','brightfield-blocks');const result=await page.evaluate(async record=>{
    const current=JSON.parse(JSON.stringify(record.frames[0].snapshot));current.geometry={...record.geometry,floors:[]};current.replay=null;view.render(current);const live=view.diagnostics();
    await SARReplayPlayback.open(record);SARReplayPlayback.seek(1500);view.render(SARReplayPlayback.snapshot());const replay=view.diagnostics(),time=SARReplayPlayback.snapshot().time;SARReplayPlayback.pause();await new Promise(resolve=>setTimeout(resolve,150));view.render(SARReplayPlayback.snapshot());const pausedTime=SARReplayPlayback.snapshot().time;
    SARReplayPlayback.camera('free');const start=SARReplayPlayback.snapshot().focus;document.body.tabIndex=-1;document.body.focus();window.archivedStart=start;return {live,replay,time,pausedTime};
  },record);
  assert.equal(result.live.view.houses,0);assert.equal(result.replay.view.houses,record.geometry.floors.length);assert.equal(result.time,result.pausedTime);
  await page.keyboard.press('ArrowRight');const moved=await page.evaluate(()=>SARReplayPlayback.snapshot().focus.x>archivedStart.x);assert.equal(moved,true);await page.mouse.move(700,300);await page.mouse.down();await page.mouse.move(600,350);await page.mouse.up();assert.equal(await page.evaluate(()=>SARReplayPlayback.snapshot().focus.x>archivedStart.x+70),true);
  await page.screenshot({path:path.join(out,'replay-tactical-archived-map.png')});
  pass('Archived geometry overrides same-ID current map; pause, free arrows and arena drag operate in real WebGL');
  await page.evaluate(()=>SARReplayPlayback.close());assert.deepEqual(errors,[]);pass('Replay environments/actors release after repeated inspection; no browser console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks:checks.length,passed:checks,errors,scope:'Real Edge WebGL renderer and production replay module; fixtures from actual game render snapshots, no owner account opened'},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
