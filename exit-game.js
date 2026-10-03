(function(){
  'use strict';
  let pending=null;
  function status(message,error=false){window.SAR?.showPanel?.('<div class="eyebrow">SKIRMISH ARENA</div><h2>'+(error?'Could not save yet':'Progress saved')+'</h2><p role="status">'+message+'</p><button data-action="quit-game">'+(error?'RETRY SAVE & EXIT':'TRY CLOSING WINDOW')+'</button>','exit-confirmation');}
  async function quit(){
    if(pending)return pending;
    let resume,saved=false;
    pending=Promise.resolve().then(async()=>{
      try{
        resume=window.SAR?.prepareReload?.();
        // prepareReload writes the world and account-owned pending sync record.
        // Only the durable local commit gates exit; cloud connectivity does not.
        let timeout;
        try{await Promise.race([window.SARStorage?.flush?.(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('The local save is still pending.')),10000);})]);}finally{clearTimeout(timeout);}
        if(window.SARStorage?.error)throw new Error(window.SARStorage.error);
        saved=true;
        if(window.__SAR_NATIVE_GAME__&&window.__TAURI__?.core?.invoke){await window.__TAURI__.core.invoke('quit_game');return;}
        window.close();
        if(!window.closed)status('Your progress and pending synchronization are saved on this device. This browser cannot close this window automatically. You can close the tab or app window now.');
      }catch(error){console.error('Local exit checkpoint failed',error);status(saved?'Your progress is saved. The desktop app could not close yet; finish any pending update and retry, or close the window.':'Your game is still open. The local save could not finish; free storage if needed, then retry. Your existing data has been retained.',!saved);}
      finally{resume?.();pending=null;}
    });
    return pending;
  }
  window.SARLifecycle={quit};
})();
