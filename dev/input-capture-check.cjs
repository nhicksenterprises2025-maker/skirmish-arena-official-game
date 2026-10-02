/* Pointer-capture regression checks execute shipped handlers with a deterministic DOM.
   The additional function exports exist only in this in-memory test source. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {engine}=require('./simulate.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace('window.SAR = {','window.__INPUT_DEV={getPlayer,showModal,closeModal,renderSettingsModal,updatePlayer,gameplayMouseActive,gameplayViewportActive};window.SAR = {');
const checks=[];
function pass(test){checks.push({test,result:'PASS'});console.log('PASS',test);}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);}
function launched(options){const e=engine({},source,options);e.dev.queueForMatch();e.ui.flush();e.capture=e.context.__INPUT_DEV;e.player=e.capture.getPlayer();assert.ok(e.player);e.dev.inspect().state.matches.find(m=>m.id===e.player.matchId).status='active';e.player.slots[e.player.currentSlot].lastShot=-Infinity;return e;}
function armed(e){e.dev.input.keys.add('MouseRight');e.dev.input.keys.add('KeyW');e.dev.input.mouseDown=true;e.player.ads=true;e.player.adsBlend=1;}
function cleared(e){assert.equal(e.dev.input.keys.size,0);assert.equal(e.dev.input.mouseDown,false);assert.equal(e.player.ads,false);assert.equal(e.player.adsBlend,0);}
function unlocked(e){assert.equal(e.ui.document.pointerLockElement,null);assert.equal(e.ui.canvas.style.cursor,'auto');assert.equal(e.capture.gameplayMouseActive(),false);}
function locked(e){assert.equal(e.ui.document.pointerLockElement,e.ui.canvas);assert.equal(e.ui.canvas.style.cursor,'none');assert.equal(e.capture.gameplayMouseActive(),true);}
function move(e,x,y){e.ui.dispatch('document','mousemove',{movementX:x,movementY:y,clientX:1,clientY:1});}

(async()=>{
  {
    const e=launched(),i=e.dev.input;locked(e);assert.ok(e.ui.lockRequests>=1);
    // Document deltas must work regardless of the OS cursor's absolute location.
    for(const [dx,dy,x,y] of [[-10000,-10000,0,0],[10000,-10000,1440,0],[-10000,10000,0,900],[10000,10000,1440,900]]){move(e,dx,dy);assert.equal(i.aimX,x);assert.equal(i.aimY,y);assert.equal(e.ui.element('crosshair').style.left,x+'px');assert.equal(e.ui.element('crosshair').style.top,y+'px');}
    pass('Launch captures and hides cursor; document relative motion reaches all four exact viewport corners');
    const originalSensitivity=e.dev.CONFIG.mouseSensitivity,originalADS=e.dev.CONFIG.adsSensitivity;
    assert.equal(originalSensitivity,1);assert.equal(originalADS,.65);
    for(const blend of [0,.4,1]){e.player.adsBlend=blend;i.aimX=700;i.aimY=400;const sensitivity=originalSensitivity*(1-(1-originalADS)*blend);move(e,10,-20);close(i.aimX,700+10*sensitivity);close(i.aimY,400-20*sensitivity);}
    e.dev.CONFIG.mouseSensitivity=1.85;e.dev.CONFIG.adsSensitivity=.4;e.player.adsBlend=.6;i.aimX=700;i.aimY=400;move(e,10,-20);close(i.aimX,700+10*1.85*(1-.6*.6));close(i.aimY,400-20*1.85*(1-.6*.6));
    pass('Existing mouse sensitivity and blended ADS multiplier apply exactly to relative deltas');
    e.ui.dispatch('canvas','mousedown',{button:2});e.capture.updatePlayer(e.player,.1,e.dev.now());assert.equal(e.player.ads,true);
    armed(e);e.capture.renderSettingsModal('aim');e.ui.flush();unlocked(e);cleared(e);const before=[i.aimX,i.aimY];move(e,50,50);assert.deepEqual([i.aimX,i.aimY],before);e.ui.dispatch('canvas','mousedown',{button:2});e.capture.updatePlayer(e.player,.1,e.dev.now());assert.equal(e.player.ads,false);
    e.capture.closeModal();e.ui.flush();locked(e);cleared(e);
    pass('Settings release capture and clear fire, movement and ADS; modal close captures again');
    // Messages/AI/cloud UI opens the shared modal independently of showModal.
    for(const id of ['modal','menu','accountGate','cloudAccountMenu']){
      armed(e);const el=e.ui.element(id),hidden=id==='accountGate'||id==='cloudAccountMenu';if(hidden)el.classList.remove('hidden');else el.classList.add('visible');e.ui.flush();unlocked(e);cleared(e);
      if(hidden)el.classList.add('hidden');else el.classList.remove('visible');e.ui.flush();locked(e);
    }
    pass('Independent Messages-style modal, menu and cloud account overlays gate input and recapture on close');
    e.capture.showModal('<h2>Loadout</h2>','loadout');e.ui.flush();unlocked(e);e.capture.closeModal();e.ui.flush();locked(e);
    armed(e);e.ui.dispatch('window','keydown',{code:'Escape',repeat:false});e.ui.flush();assert.equal(e.dev.inspect().state.paused,true);unlocked(e);cleared(e);e.ui.action('resume');e.ui.flush();locked(e);assert.equal(e.dev.inspect().state.paused,false);
    pass('Loadout and pause release capture; Resume returns to captured gameplay');
    armed(e);e.ui.setFocus(false);e.ui.dispatch('window','blur');e.ui.flush();unlocked(e);cleared(e);assert.equal(e.dev.inspect().state.paused,true);e.ui.setFocus(true);e.ui.dispatch('window','focus');e.ui.flush();unlocked(e);e.ui.action('resume');e.ui.flush();locked(e);
    armed(e);e.ui.document.hidden=true;e.ui.dispatch('document','visibilitychange');e.ui.flush();unlocked(e);cleared(e);assert.equal(e.dev.inspect().state.paused,true);e.ui.document.hidden=false;e.ui.dispatch('document','visibilitychange');e.ui.flush();unlocked(e);e.ui.action('resume');e.ui.flush();locked(e);
    pass('Alt+Tab blur and hidden-page transitions pause and clear held input; explicit Resume recaptures');
    armed(e);e.ui.document.exitPointerLock();e.ui.flush();unlocked(e);cleared(e);assert.equal(e.dev.inspect().state.paused,true);
    e.ui.dispatch('window','keydown',{code:'Escape',repeat:false});assert.equal(e.dev.inspect().state.paused,true);e.ui.advance(251);e.ui.action('resume');e.ui.flush();locked(e);
    pass('Unexpected capture loss pauses; the same Escape cannot immediately resume unlocked gameplay');
    // The generic stub creates optional DOM nodes; give the unrelated meta preview a valid weapon.
    e.ui.element('metaWeaponPreview').dataset.weaponPreview=e.dev.CONFIG.primary;
    e.player.adsBlend=0;e.dev.CONFIG.mouseSensitivity=1;i.aimX=1440;i.aimY=900;e.ui.setViewport(800,600);e.ui.flush();assert.equal(i.aimX,800);assert.equal(i.aimY,600);assert.equal(e.ui.canvas.width,800);assert.equal(e.ui.canvas.height,600);move(e,-10000,-10000);assert.equal(i.aimX,0);assert.equal(i.aimY,0);move(e,10000,10000);assert.equal(i.aimX,800);assert.equal(i.aimY,600);locked(e);
    pass('Resize clamps the virtual cursor and preserves access to every point of the new viewport');
  }
  {
    const e=launched({pointerLockMode:'reject'});await Promise.resolve();e.ui.flush();unlocked(e);const slot=e.player.slots[e.player.currentSlot],ammo=slot.ammo,aim=[e.dev.input.aimX,e.dev.input.aimY];
    e.ui.dispatch('canvas','mousedown',{button:0});e.ui.dispatch('canvas','mousedown',{button:2});move(e,100,100);e.capture.updatePlayer(e.player,.1,e.dev.now());await Promise.resolve();e.ui.flush();assert.equal(slot.ammo,ammo);assert.equal(e.dev.input.mouseDown,false);assert.equal(e.player.ads,false);assert.deepEqual([e.dev.input.aimX,e.dev.input.aimY],aim);
    e.ui.setPointerLockMode('sync');e.ui.dispatch('canvas','mousedown',{button:0});e.ui.flush();locked(e);assert.equal(slot.ammo,ammo);e.ui.dispatch('canvas','mousedown',{button:0});assert.equal(slot.ammo,ammo-1);
    pass('Rejected pointer-lock Promise blocks firing/ADS/aim; fresh gameplay click captures before a later click fires');
  }
  {
    const e=launched({pointerLockMode:'throw'});unlocked(e);const ammo=e.player.slots[e.player.currentSlot].ammo;e.ui.dispatch('canvas','mousedown',{button:0});assert.equal(e.player.slots[e.player.currentSlot].ammo,ammo);assert.equal(e.dev.input.mouseDown,false);
    pass('Synchronous capture rejection also blocks unlocked firing');
  }
  {
    const e=launched({pointerLockMode:'pending'});unlocked(e);assert.equal(e.ui.lockRequests,1);e.capture.showModal('<h2>Messages</h2>','messages');e.ui.flush();e.ui.resolvePointerLock();await Promise.resolve();e.ui.flush();unlocked(e);cleared(e);assert.equal(e.ui.element('modal').classList.contains('visible'),true);assert.equal(e.dev.inspect().state.paused,false);
    e.ui.setPointerLockMode('sync');e.capture.closeModal();e.ui.flush();locked(e);
    pass('A late asynchronous lock arriving after a modal opens is released; closing the modal reacquires');
  }
  const result={result:'PASS',checks};fs.writeFileSync(path.resolve(__dirname,'input-capture-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',checks:checks.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
