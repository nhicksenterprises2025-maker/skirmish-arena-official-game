  (()=>{
    'use strict';
    const status=document.getElementById('status'),retry=document.getElementById('retry');
    const expected=String(window.__SAR_EXPECTED_VERSION__||'');
    let expectedCache='';
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const currentCache=name=>name===expectedCache;
    function workerVersion(worker){
      if(!worker)return Promise.resolve(null);
      return new Promise(resolve=>{
        const done=value=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',message);resolve(value);};
        const message=event=>{if(event.source===worker&&event.data?.type==='SW_VERSION')done(event.data);};
        const timer=setTimeout(()=>done(null),900);
        navigator.serviceWorker.addEventListener('message',message);
        worker.postMessage({type:'GET_VERSION'});
      });
    }
    async function activateRelease(){
      if(!navigator.serviceWorker)throw Error('This desktop environment cannot activate the installed game shell.');
      let registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      // An update job can wait on a worker already awaiting activation. Start
      // the check without blocking the loop that sends that worker SKIP_WAITING.
      void registration.update().catch(error=>console.warn('Installed shell update check failed',error));
      // A same-build balance patch still downloads a complete immutable shell.
      const until=Date.now()+120000;
      while(Date.now()<until){
        // Refresh the browser's registration after asynchronous installation;
        // an older WebView registration object can retain its previous worker.
        registration=await navigator.serviceWorker.getRegistration('./')||registration;
        const waiting=registration.waiting;
        if(waiting){
          const version=await workerVersion(waiting);
          if(version?.version!==expected||version?.cache!==expectedCache)throw Error(`Version mismatch: installed launcher ${expected}, downloaded game ${version?.version||'unknown'}.`);
          // A fresh worker can activate while its version response is in flight.
          // Only ask it to skip waiting if that same worker is still waiting.
          if(registration.waiting===waiting){
            // Let activation finish before sending more messages to the old
            // controller. Repeated version probes can keep it busy retiring.
            await new Promise(resolve=>{
              const done=()=>{clearTimeout(timer);waiting.removeEventListener?.('statechange',changed);resolve();};
              const changed=()=>{if(['activated','redundant'].includes(waiting.state))done();};
              const timer=setTimeout(done,1500);waiting.addEventListener?.('statechange',changed);
              waiting.postMessage({type:'SKIP_WAITING'});changed();
            });
          }
        }
        const active=await workerVersion(registration.active),controller=await workerVersion(navigator.serviceWorker.controller);
        if(active?.version===expected&&controller?.version===expected&&active.cache===expectedCache&&controller.cache===expectedCache){registration.active.postMessage({type:'WARM_OPTIONAL_ASSETS'});return;}
        await pause(100);
      }
      throw Error('The installed game shell did not activate. Your account and local saves were left intact.');
    }
    async function launch(){
      retry.hidden=true;status.textContent='Preparing the installed release…';
      window.SARBoot?.stage?.('installed-release','Checking the installed release…',15000);
      let stage='installed-release';
      try{
        if(!/^\d+\.\d+\.\d+$/.test(expected))throw Error('The desktop launcher did not identify its expected release. Open the game from its installed shortcut.');
        const response=await fetch('./version.json?desktop='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('The installed game release could not be read. Check the desktop startup log.');
        const version=await response.json();const balance=document.getElementById('sarBootBalance');if(balance)balance.textContent=version.weaponBalance||'8.0';
        if(version.version!==expected)throw Error(`Version mismatch: installed launcher ${expected}, running backend ${version.version||'unknown'}. Reopen the updated desktop app.`);
        expectedCache=`sar-shell-${expected}-${version.shellRevision||'live-circuit-2'}`;
        // An installer may replace static files while a legacy HTTP process is
        // still alive. Validate its running health metadata as well as disk files.
        stage='local-service';window.SARBoot?.stage?.(stage,'Checking your local service…',15000);
        const healthResponse=await fetch('./api/status?desktop='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        const health=await healthResponse.json();
        if(healthResponse.ok&&health.ok===true){
          if(health.version!==expected||health.databaseSchema!==10)throw Error(`Startup compatibility mismatch: desktop ${expected}, active backend ${health.version||'unknown'}, account schema ${health.databaseSchema??'unknown'} (expected 10). Reopen the updated app to finish its service handoff.`);
        }else if(health.localShell!==true)throw Error('The game service has not completed startup. Retry after it becomes healthy.');
        stage='shell-activation';window.SARBoot?.stage?.(stage,'Preparing the installed game files…',125000);
        await activateRelease();
        const names=await caches.keys();
        await Promise.all(names.filter(name=>name.startsWith('sar-shell-')&&!currentCache(name)).map(name=>caches.delete(name)));
        window.SARBoot?.handoff();window.location.replace(`./index.html?launcher=1&build=${encodeURIComponent(expected)}`);
      }catch(error){window.__SAR_DESKTOP_LAUNCH_ERROR__=String(error.message||error);window.__SAR_DESKTOP_LAUNCH_DIAGNOSTIC__={stage,expected,message:String(error.message||error),stack:error.stack};console.error('Installed game startup failed',window.__SAR_DESKTOP_LAUNCH_DIAGNOSTIC__);window.SARBoot?.fail(`Startup failed while checking ${stage.replaceAll('-',' ')}. ${error.message||'Retry to continue.'}`,error);retry.hidden=false;}
    }
    // A 1.9.2 controller may supply its cached boot.js until activation. Its
    // desktop Retry had no handler; the current boot owns its own clean reload.
    if(!window.SARBoot?.stage)retry.addEventListener('click',()=>location.reload());
    void launch();
  })();
