(function(){
 'use strict';
 const desktop=document.currentScript?.dataset.mode==='desktop',MINIMUM=3000,transferKey='sar-boot-transfer';
 let started=Date.now(),ready=false,failed=false,closed=false,timer,watchdog,stageName='local-storage';
 try{const prior=Number(sessionStorage.getItem(transferKey));sessionStorage.removeItem(transferKey);if(!desktop&&prior>0&&started-prior<150000)started=prior;}catch{}
 const screen=document.createElement('section');screen.id='sarBoot';screen.setAttribute('aria-label','Skirmish Arena startup');
 screen.innerHTML='<div class="sar-boot-content"><div class="sar-boot-edition"><span>VERSION …</span><span>BETA</span></div><h1><img class="brand-wordmark" src="assets/branding/wordmark.svg" alt="SKIRMISH ARENA"></h1><p class="sar-boot-balance">WEAPON BALANCE: <span id="sarBootBalance">…</span></p><div class="sar-boot-rule"></div><p id="'+(desktop?'status':'sarBootStatus')+'" role="status">Preparing your game…</p><button id="'+(desktop?'retry':'sarBootRetry')+'" hidden>RETRY</button></div>';
 document.body.appendChild(screen);document.documentElement.classList.add('sar-boot-active');
 const status=screen.querySelector('[role="status"]'),retry=screen.querySelector('button');
 function dismiss(){if(closed||failed||!ready)return;const remaining=MINIMUM-(Date.now()-started);if(remaining>0){clearTimeout(timer);timer=setTimeout(dismiss,remaining);return;}closed=true;clearTimeout(watchdog);screen.remove();document.documentElement.classList.remove('sar-boot-active');window.dispatchEvent(new Event('sar:boot-ready'));}
 function fail(message='Your game could not finish loading. Retry to continue.',error){if(closed||failed)return;failed=true;clearTimeout(timer);clearTimeout(watchdog);window.__SAR_BOOT_FAILURE__={stage:stageName,message,stack:error?.stack||null,elapsedMs:Date.now()-started};console.error('Skirmish startup failed',window.__SAR_BOOT_FAILURE__);status.textContent=message;retry.hidden=false;}
 function stage(name,message,timeout=45000){if(closed||failed)return;stageName=name;status.textContent=message;clearTimeout(watchdog);watchdog=setTimeout(()=>fail('Startup is taking longer than expected ('+name+'). Retry to continue.'),timeout);}
 stage(desktop?'installed-release':'local-storage','Preparing your game…',desktop?130000:45000);
 addEventListener('error',event=>{if(!closed&&event.error&&/(?:game|cloud|progression|tactical-instinct|renderer-25d)\.(?:js|mjs)(?:\?|$)/.test(event.filename||''))fail('Startup failed during '+stageName.replaceAll('-',' ')+'. Retry to continue.',event.error);});
 // A new document invalidates every pending promise/listener from the old
 // attempt. Never append another game script or simulation on a failed attempt.
 retry.addEventListener('click',()=>location.reload());
 async function gameReady(){
  if(!window.SAR){fail();return;}
  stage('arena-renderer','Preparing your arena…',30000);
  const until=Date.now()+30000;
  while(!failed&&Date.now()<until){const renderer=window.SAR25D;if(renderer?.diagnostics){ready=true;dismiss();return;}await new Promise(resolve=>setTimeout(resolve,50));}
  fail('The arena could not finish loading. Retry to continue.');
 }
 function setBuild(build){if(build?.weaponBalance)screen.querySelector('#sarBootBalance').textContent=build.weaponBalance;if(build?.applicationVersion)screen.querySelector('.sar-boot-edition span').textContent='VERSION '+build.applicationVersion;}
 document.addEventListener('DOMContentLoaded',()=>setBuild(window.SARBuild),{once:true});
 window.SARBoot={ready(){ready=true;clearTimeout(watchdog);dismiss();},stage,gameReady,fail,setBuild,handoff(){try{sessionStorage.setItem(transferKey,String(started));}catch{}},getState:()=>({started,ready,failed,closed,stage:stageName,minimum:MINIMUM})};
})();
