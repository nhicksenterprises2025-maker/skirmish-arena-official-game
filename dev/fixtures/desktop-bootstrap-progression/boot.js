(function(){
 'use strict';
 const desktop=document.currentScript?.dataset.mode==='desktop',MINIMUM=3000,transferKey='sar-boot-transfer';
 let started=Date.now(),ready=false,failed=false,closed=false,timer;
 try{const prior=Number(sessionStorage.getItem(transferKey));sessionStorage.removeItem(transferKey);if(!desktop&&prior>0&&started-prior<150000)started=prior;}catch{}
 const screen=document.createElement('section');screen.id='sarBoot';screen.setAttribute('aria-label','Skirmish Arena startup');
 screen.innerHTML='<div class="sar-boot-content"><div class="sar-boot-edition"><span>VERSION 1.9</span><span>BETA</span></div><h1>SKIRMISH<br>ARENA</h1><p class="sar-boot-balance">WEAPON BALANCE: <span id="sarBootBalance">8.0</span></p><div class="sar-boot-rule"></div><p id="'+(desktop?'status':'sarBootStatus')+'" role="status">Preparing your game…</p><button id="'+(desktop?'retry':'sarBootRetry')+'" hidden>RETRY</button></div>';
 document.body.appendChild(screen);document.documentElement.classList.add('sar-boot-active');
 const status=screen.querySelector('[role="status"]'),retry=screen.querySelector('button');
 function dismiss(){if(closed||failed||!ready)return;const remaining=MINIMUM-(Date.now()-started);if(remaining>0){clearTimeout(timer);timer=setTimeout(dismiss,remaining);return;}closed=true;clearTimeout(watchdog);screen.remove();document.documentElement.classList.remove('sar-boot-active');window.dispatchEvent(new Event('sar:boot-ready'));}
 function fail(message='Your game could not finish loading. Retry to continue.'){if(closed)return;failed=true;clearTimeout(timer);clearTimeout(watchdog);status.textContent=message;retry.hidden=false;}
 const watchdog=setTimeout(()=>fail('Startup is taking longer than expected. Retry to continue.'),desktop?130000:45000);
 if(!desktop)retry.addEventListener('click',()=>location.reload());
 async function gameReady(){
  if(!window.SAR){fail();return;}
  const until=Date.now()+30000;
  while(Date.now()<until){const renderer=window.SAR25D,state=renderer?.diagnostics?.();if(renderer&&state?.assetState!=='loading'){ready=true;dismiss();return;}await new Promise(resolve=>setTimeout(resolve,50));}
  fail('The arena could not finish loading. Retry to continue.');
 }
 function setBuild(build){if(build?.weaponBalance)screen.querySelector('#sarBootBalance').textContent=build.weaponBalance;if(build?.applicationVersion)screen.querySelector('.sar-boot-edition span').textContent='VERSION '+build.applicationVersion;}
 document.addEventListener('DOMContentLoaded',()=>setBuild(window.SARBuild),{once:true});
 window.SARBoot={ready(){ready=true;dismiss();},gameReady,fail,setBuild,handoff(){try{sessionStorage.setItem(transferKey,String(started));}catch{}},getState:()=>({started,ready,failed,closed,minimum:MINIMUM})};
})();
