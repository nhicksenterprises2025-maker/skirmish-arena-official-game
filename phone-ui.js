(() => {
  'use strict';
  if(window.SARPhoneUI)return;
  const apps=[
    ['scores','Live Scores','<path d="M4 18V9h4v9M10 18V4h4v14M16 18v-7h4v7"/>'],
    ['spectate','Spectate','<path d="m9 5 10 7-10 7V5Z"/>'],
    ['bots','Bot Leaderboard','<path d="M8 3h8v8a4 4 0 0 1-8 0V3ZM8 6H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 0h8"/>'],
    ['botmeta','Bot Weapon Meta','<path d="M4 4v16h16M8 15l4-6 4 3 4-7"/>']
  ];
  const appTitles=Object.fromEntries(apps.map(([id,title])=>[id,title.toUpperCase()]));
  let phoneView='home',phoneModule;
  function phoneScreen(body){
    return `<div class="phone-status"><span>${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span class="phone-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div><nav class="phone-navigation" aria-label="Phone navigation"><button data-phone-action="back" aria-label="Back" ${phoneView==='home'?'disabled':''}>‹ <span>Back</span></button><span>${phoneView==='home'?'SKIRMISH':appTitles[phoneView]}</span><button data-phone-action="home" aria-label="Phone home">⌂</button></nav><div class="phone-app">${body}</div><div class="phone-home-indicator" aria-hidden="true"></div>`;
  }
  function phoneFrame(body){return `<div class="phone-device"><canvas id="phoneModel" width="440" height="828" aria-label="Phone device"></canvas><section class="phone-screen" data-phone-screen="${phoneView}">${phoneScreen(body)}</section></div>`;}
  function paintPhone(){
    const canvas=document.getElementById('phoneModel');if(!canvas)return;
    phoneModule??=import('./inspect-25d.mjs');
    phoneModule.then(module=>canvas.isConnected?module.paintInspection(canvas,{kind:'phone'}):undefined).catch(error=>console.error('Phone device preview unavailable',error));
  }
  function modal(html,view){
    const panel=document.querySelector('#modal'),content=document.querySelector('#modalContent');if(!panel||!content)return;
    const screen=content.querySelector('.phone-screen');
    if(screen){screen.dataset.phoneScreen=phoneView;screen.innerHTML=phoneScreen(html);}else content.innerHTML=phoneFrame(html);
    content.dataset.view=view;document.querySelector('#modal .modal')?.classList.remove('meta-wide');panel.classList.add('visible');
    window.SAR?.preparePanel?.();window.SARFullscreen?.setCombatActive(false);if(!screen)paintPhone();
  }
  function showPhone(){
    window.SARPhone?.didHome?.();phoneView='home';
    modal(`<div class="phone-home-clock"><strong>${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</strong><span>${new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}</span></div><div class="phone-home-title"><h2>Your circuit</h2></div><div class="phone-app-grid">${apps.map(([id,title,icon])=>`<button class="phone-app-icon" data-phone-open="${id}"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icon}</svg></span>${title}</button>`).join('')}</div>`,'phone');
  }
  function showApp(id,html){if(!appTitles[id])return;phoneView=id;modal(html,'phone-app');}
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-phone-action]')?.dataset.phoneAction;
    if(action==='home')showPhone();else if(action==='back'&&phoneView!=='home')window.SARPhone?.back?.();
  });
  window.SARPhoneUI={showPhone,showApp};
})();
