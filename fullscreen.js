/* Real browser/native fullscreen; presentation preferences stay outside game saves. */
(function(root){
  'use strict';
  function createFullscreenController(win,doc,nav=win.navigator,storage=win.localStorage){
    const read=(key,fallback)=>{try{const value=storage?.getItem(key);return value===null||value===undefined?fallback:value==='true';}catch(_){return fallback;}};
    const write=(key,value)=>{try{storage?.setItem(key,String(value));}catch(_){/* Private browsing may disable preference storage. */}};
    const preferenceKey='sar.fullscreen.autoEnter',keyboardKey='sar.fullscreen.keyboardLock';
    const buttons=new Map(),native=!!win.__SAR_NATIVE_GAME__,invoke=win.__TAURI__?.core?.invoke;
    const state={fullscreen:false,native,pending:false,autoEnter:read(preferenceKey,true),keyboardLocked:false,keyboardLockPreferred:read(keyboardKey,false),combatActive:false,message:''};
    let pending=null,lockAttempted=false,destroyed=false;
    const browserActive=()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement);
    const getStatus=()=>({...state});
    function renderStatus(){
      for(const button of buttons.keys()){
        button.textContent=state.pending?'PLEASE WAIT':state.fullscreen?'EXIT FULLSCREEN':'FULLSCREEN';
        button.disabled=state.pending;
        button.setAttribute('aria-pressed',String(state.fullscreen));
        button.title=state.fullscreen?(state.native?'Return to a window (F11)':'Return to a window (Esc or F11)'):'Fill the screen for play (F11 is also available)';
      }
      for(const element of doc.querySelectorAll?.('[data-fullscreen-status]')||[])element.textContent=state.message;
      for(const button of doc.querySelectorAll?.('[data-action="fullscreen"]')||[]){button.textContent=state.fullscreen?'EXIT FULLSCREEN':'FULLSCREEN';button.disabled=state.pending;button.setAttribute('aria-pressed',String(state.fullscreen));}
      if(typeof win.CustomEvent==='function')win.dispatchEvent(new win.CustomEvent('sarfullscreenchange',{detail:getStatus()}));
    }
    function focusGame(){
      win.focus?.();
      const canvas=doc.getElementById?.('game');
      if(canvas){canvas.setAttribute('tabindex','-1');canvas.focus?.({preventScroll:true});}
    }
    function unlockKeyboard(){
      try{nav?.keyboard?.unlock?.();}catch(_){}
      state.keyboardLocked=false;lockAttempted=false;
    }
    async function maybeLockKeyboard(){
      if(!state.fullscreen||!state.combatActive||!state.keyboardLockPreferred||state.native||lockAttempted)return;
      lockAttempted=true;
      if(!nav?.keyboard?.lock)return;
      try{
        // Optional opt-in. Never capture OS task switching or the deliberate F11 exit.
        await nav.keyboard.lock(['Escape']);
        if(!state.fullscreen||!state.combatActive||!state.keyboardLockPreferred||destroyed){unlockKeyboard();return;}
        state.keyboardLocked=true;
      }catch(_){state.keyboardLocked=false;}
      renderStatus();
    }
    function syncBrowser(){
      if(state.native||destroyed)return;
      state.fullscreen=browserActive();
      if(state.fullscreen){state.message='Fullscreen enabled. Use Exit Fullscreen or F11 to return to a window.';void maybeLockKeyboard();}
      else{unlockKeyboard();state.message='Window mode. Click Fullscreen to fill the screen.';}
      renderStatus();
    }
    async function syncNative(){
      if(!state.native||typeof invoke!=='function')return;
      try{
        const result=await invoke('game_fullscreen_state');
        state.fullscreen=!!result.fullscreen;
        state.message=state.fullscreen?'Fullscreen enabled. Use Exit Fullscreen or F11 to return to a window.':'Window mode. Click Fullscreen or press F11 to fill the screen.';
      }catch(_){state.message='The launcher could not read the fullscreen state. Use F11 or try Fullscreen again.';}
      renderStatus();
    }
    function run(action){
      if(pending)return pending;
      state.pending=true;renderStatus();
      // Calling action immediately preserves the PLAY/SPECTATE user activation.
      let result;
      try{result=action();}catch(error){result=Promise.reject(error);}
      pending=Promise.resolve(result).then(()=>{
        if(state.fullscreen)state.message='Fullscreen enabled. Use Exit Fullscreen or F11 to return to a window.';
        else state.message='Window mode. Click Fullscreen to fill the screen.';
        return true;
      }).catch(error=>{
        if(!state.native)state.fullscreen=browserActive();
        state.message='Fullscreen could not change. Click Fullscreen again or press F11.';
        state.lastError=String(error?.message||error||'Fullscreen unavailable');return false;
      }).finally(()=>{pending=null;state.pending=false;renderStatus();if(state.combatActive)focusGame();});
      return pending;
    }
    function enter(){
      if(state.fullscreen){focusGame();void maybeLockKeyboard();return Promise.resolve(true);}
      return run(()=>{
        if(state.native){
          if(typeof invoke!=='function')throw Error('Native fullscreen bridge unavailable');
          return invoke('set_game_fullscreen',{fullscreen:true}).then(result=>{state.fullscreen=!!result.fullscreen;focusGame();});
        }
        const target=doc.documentElement,request=target.requestFullscreen||target.webkitRequestFullscreen;
        if(typeof request!=='function')throw Error('This browser does not support fullscreen');
        const requestResult=request===target.requestFullscreen?request.call(target,{navigationUI:'hide'}):request.call(target);
        return Promise.resolve(requestResult).then(()=>{state.fullscreen=browserActive();focusGame();void maybeLockKeyboard();});
      });
    }
    function exit(){
      unlockKeyboard();
      return run(()=>{
        if(state.native){
          if(typeof invoke!=='function')throw Error('Native fullscreen bridge unavailable');
          return invoke('set_game_fullscreen',{fullscreen:false}).then(result=>{state.fullscreen=!!result.fullscreen;});
        }
        if(!browserActive()){state.fullscreen=false;return;}
        const leave=doc.exitFullscreen||doc.webkitExitFullscreen;
        if(typeof leave!=='function')throw Error('Fullscreen exit is unavailable');
        return Promise.resolve(leave.call(doc)).then(()=>{state.fullscreen=browserActive();});
      });
    }
    const toggle=()=>state.fullscreen?exit():enter();
    function onPlay(){
      const result=state.autoEnter?enter():Promise.resolve(true);focusGame();return result;
    }
    function setCombatActive(active){
      active=!!active;if(state.combatActive===active)return;
      state.combatActive=active;
      if(!active)unlockKeyboard();else if(state.fullscreen)void maybeLockKeyboard();
    }
    function setAutoEnter(value){state.autoEnter=!!value;write(preferenceKey,state.autoEnter);renderStatus();return state.autoEnter;}
    function setKeyboardLock(value){
      state.keyboardLockPreferred=!!value;write(keyboardKey,state.keyboardLockPreferred);
      if(!value)unlockKeyboard();else void maybeLockKeyboard();renderStatus();return state.keyboardLockPreferred;
    }
    function bindButton(button){
      if(!button||buttons.has(button))return ()=>{};
      const listener=()=>{void toggle();};button.addEventListener('click',listener);buttons.set(button,listener);renderStatus();
      return ()=>{button.removeEventListener('click',listener);buttons.delete(button);};
    }
    function nativeShortcut(event){
      if(state.native&&event.code==='F11'&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.repeat){event.preventDefault();void toggle();}
    }
    doc.addEventListener('fullscreenchange',syncBrowser);doc.addEventListener('webkitfullscreenchange',syncBrowser);
    win.addEventListener('keydown',nativeShortcut,true);
    for(const button of doc.querySelectorAll?.('[data-fullscreen-toggle]')||[])bindButton(button);
    if(state.native)void syncNative();else syncBrowser();
    return {enter,exit,toggle,onPlay,setCombatActive,bindButton,getStatus,getAutoEnter:()=>state.autoEnter,setAutoEnter,setKeyboardLock,
      destroy(){destroyed=true;unlockKeyboard();doc.removeEventListener('fullscreenchange',syncBrowser);doc.removeEventListener('webkitfullscreenchange',syncBrowser);win.removeEventListener('keydown',nativeShortcut,true);for(const [button,listener] of buttons)button.removeEventListener('click',listener);buttons.clear();}};
  }
  if(typeof module==='object'&&module.exports)module.exports={createFullscreenController};
  if(root?.document){root.SARFullscreen=createFullscreenController(root,root.document);root.document.addEventListener('change',event=>{if(event.target.id==='fullscreenAutoEnter')root.SARFullscreen.setAutoEnter(event.target.checked);if(event.target.id==='fullscreenKeepEscape')root.SARFullscreen.setKeyboardLock(event.target.checked);});}
})(typeof window==='object'?window:null);
