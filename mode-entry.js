(function(root){
 'use strict';
 // One cancellable client-entry attempt. Combat and the slot scheduler stay in game.js.
 function createController({view,now=()=>performance.now(),delay=setTimeout,clear=clearTimeout,focused=()=>true}){
  let current=null,serial=0;
  const alive=attempt=>current===attempt&&!attempt.abort.signal.aborted;
  function stop(attempt){attempt.abort.abort();for(const timer of attempt.timers)clear(timer);attempt.timers.clear();}
  function wait(attempt,ms){return new Promise((resolve,reject)=>{
   if(!alive(attempt)){reject(new Error('Entry cancelled'));return;}
   const cancelled=()=>{clear(timer);attempt.timers.delete(timer);reject(attempt.abort.signal.reason||new Error('Entry cancelled'));};
   const timer=delay(()=>{attempt.timers.delete(timer);attempt.abort.signal.removeEventListener('abort',cancelled);resolve();},ms);
   attempt.timers.add(timer);attempt.abort.signal.addEventListener('abort',cancelled,{once:true});
  });}
  function cancel({restore=true}={}){const attempt=current;if(!attempt)return;current=null;stop(attempt);view.hide();if(restore)attempt.options.cancel?.();}
  function begin(options){
   if(current&&current.options.key===options.key&&current.phase!=='failed')return current.promise;
   cancel({restore:false});
   const attempt={id:++serial,options,abort:new AbortController(),timers:new Set(),started:now(),phase:'preparing'};current=attempt;
   view.show(options.label);view.status('Preparing your arena…');
   const status=text=>{if(alive(attempt))view.status(text);};
   const stage=async(name,timeout,work)=>{
    if(!alive(attempt))throw new Error('Entry cancelled');status(name+'…');
    let timer,cancelled;const bound=new Promise((resolve,reject)=>{
     timer=delay(()=>reject(new Error(name+' did not finish within '+Math.round(timeout/1000)+' seconds. Retry when it is available.')),timeout);attempt.timers.add(timer);
     cancelled=()=>reject(attempt.abort.signal.reason||new Error('Entry cancelled'));attempt.abort.signal.addEventListener('abort',cancelled,{once:true});
    });
    try{return await Promise.race([Promise.resolve().then(()=>{if(!alive(attempt))throw new Error('Entry cancelled');return work(attempt.abort.signal,status);}),bound]);}
    finally{clear(timer);attempt.timers.delete(timer);attempt.abort.signal.removeEventListener('abort',cancelled);}
   };
   attempt.promise=(async()=>{
    try{
     // Start preparation immediately; three seconds is only a display minimum.
     const prepared=await options.prepare({signal:attempt.abort.signal,status,stage});
     if(!alive(attempt))return {cancelled:true};
     view.ready?.(true);status('Arena prepared. Entering after the preparation screen.');
     await wait(attempt,Math.max(0,3000-(now()-attempt.started)));
     while(alive(attempt)){
      if(!focused()){attempt.phase='ready';status('Arena ready. Return to the game to enter safely.');await wait(attempt,100);continue;}
      attempt.phase='committing';const entered=options.commit(prepared);
      if(entered!==false){current=null;stop(attempt);view.hide();return {entered:true};}
      // Recheck the shared pool if a slot changed while the minimum elapsed.
      attempt.phase='preparing';view.ready?.(false);await stage('Waiting for an available roster',60000,signal=>options.waitForRoster(signal,status));view.ready?.(true);
     }
     return {cancelled:true};
    }catch(error){
     if(!alive(attempt))return {cancelled:true};
     attempt.phase='failed';for(const timer of attempt.timers)clear(timer);attempt.timers.clear();attempt.abort.abort();
     view.fail(error.message);options.diagnostic?.(error);return {failed:true,error};
    }
   })();return attempt.promise;
  }
  return {begin,cancel,retry(){const options=current?.options;if(options){cancel({restore:false});return begin(options);}},isVisible:()=>current!==null,state:()=>current?{id:current.id,key:current.options.key,phase:current.phase,started:current.started}:null};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={createController};return;}
 if(root.SARModeEntry)return;
 const panel=document.createElement('section');panel.id='sarModeEntry';panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','sarModeTitle');
 panel.innerHTML='<div class="mode-entry-content"><img class="brand-wordmark" src="assets/branding/wordmark.svg" alt="Skirmish Arena"><div class="mode-entry-kicker">BRIGHTFIELD BLOCKS / MATCH PREPARATION</div><h2 id="sarModeTitle"></h2><div class="mode-entry-rule" aria-hidden="true"><i></i></div><p id="sarModeStatus" role="status" aria-live="polite"></p><p class="mode-entry-note">Your arena must be ready before the pre-match countdown.</p><div class="mode-entry-actions"><button id="sarModeRetry" type="button" hidden>RETRY</button><button id="sarModeCancel" type="button">RETURN TO MODES</button></div></div>';
 document.body.appendChild(panel);let returnFocus;
 const controller=createController({focused:()=>!document.hidden&&document.hasFocus(),view:{
  show(label){returnFocus=document.activeElement;panel.querySelector('h2').textContent=label;panel.querySelector('#sarModeRetry').hidden=true;panel.classList.remove('mode-entry-failed','mode-entry-ready');panel.hidden=false;panel.focus({preventScroll:true});},
  ready(value){panel.classList.toggle('mode-entry-ready',value);},
  status(text){panel.querySelector('#sarModeStatus').textContent=text;},
  hide(){panel.hidden=true;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});},
  fail(text){panel.classList.add('mode-entry-failed');panel.querySelector('#sarModeStatus').textContent=text;panel.querySelector('#sarModeRetry').hidden=false;panel.querySelector('#sarModeRetry').focus();}
 }});
 panel.addEventListener('click',event=>{if(event.target.closest('#sarModeCancel'))controller.cancel();if(event.target.closest('#sarModeRetry'))void controller.retry();});
 root.addEventListener('keydown',event=>{
  if(!controller.isVisible())return;event.stopImmediatePropagation();
  if(event.code==='Escape'){event.preventDefault();controller.cancel();}
  else if(event.code==='Tab'){event.preventDefault();const buttons=[...panel.querySelectorAll('button')].filter(button=>!button.hidden);const index=buttons.indexOf(document.activeElement);buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
  else if(!['Enter','Space'].includes(event.code))event.preventDefault();
 },true);
 root.SARModeEntry=controller;
})(typeof window!=='undefined'?window:globalThis);
