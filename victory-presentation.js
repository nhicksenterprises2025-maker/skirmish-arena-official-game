(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const poses=new Set(['quiet-confidence','arms-folded','weapon-rest','champion-stance','tactical-ready','over-the-shoulder','black-ice','aegis','monarch']);
  const title=id=>id.split('-').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' ');
  function html({title:heading='VICTORY',participants=[]}={}){
    const actors=participants.filter(actor=>actor&&typeof actor.operatorId==='string').slice(0,3);if(!actors.length)return '';
    return `<section class="victory-presentation" data-victory-presentation aria-label="Winning operator presentation"><h3>${esc(heading)}</h3><div class="victory-presentation-roster">${actors.map((actor,index)=>{const poseId=poses.has(actor.poseId)?actor.poseId:'quiet-confidence',snapshot={...actor,poseId};return `<figure class="${actor.primary===true||index===0?'primary':''}"><canvas data-victory-actor="${esc(JSON.stringify(snapshot))}" width="360" height="340" role="img" aria-label="${esc(actor.name)} · ${esc(title(poseId))} victory pose"></canvas><figcaption><strong>${esc(actor.name)}</strong><small>${esc(title(poseId))}</small></figcaption></figure>`;}).join('')}</div></section>`;
  }
  function mount(root=document.getElementById('modalContent')){
    for(const canvas of root?.querySelectorAll('[data-victory-actor]')||[]){if(!canvas.isConnected)continue;let actor;try{actor=JSON.parse(canvas.dataset.victoryActor);}catch{continue;}
      const result=window.SAR?.paintCosmeticPreview?.(canvas,{operatorId:actor.operatorId,palette:actor.palette,cosmeticId:actor.cosmetic?.id||null,styleId:actor.cosmetic?.styleId||'main',victoryPose:actor.poseId,weapon:actor.weapon||(typeof actor.primary==='string'?actor.primary:'AR-15'),motion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?null:'operator-breathe',interactive:false});
      Promise.resolve(result).catch(error=>{canvas.setAttribute('aria-label','Victory model unavailable');console.warn('Victory presentation:',error.message);});
    }
  }
  window.SARVictoryPresentation={html,mount};
})();
