(() => {
  'use strict';
  const SAVE_KEY='sar-persistent-save',OWNER_KEY='sar-cloud-owner',PENDING_KEY='sar-cloud-pending',ACCOUNT_KEY='sar-cloud-authenticated-account';
  const state={available:false,online:false,localMode:false,account:null,revision:0,updatedAt:0,serverNow:0,clockPerformance:0,loaded:false,dirty:null,sending:false,retry:null,mode:'signup'};
  // Worlds and retained branches exceed localStorage's small synchronous quota.
  // Hydrate once, keep game reads synchronous, and commit queued writes before
  // replacing an authenticated world or closing for an update.
  const storage=window.SARStorage=(()=>{
    const values=new Map(),dirty=new Map();let db=null,inFlight=null,scheduled=false,error=null,backupSerial=0;
    const retiredArchiveKey='sar-dialogue-retirement-backup-v1',isRetiredDraft=key=>/^sar\.social\.replyDrafts\..+$/.test(key);
    const managed=key=>[SAVE_KEY,OWNER_KEY,PENDING_KEY,ACCOUNT_KEY].includes(key)||/^sar-.*(?:backup|migration-original|previous-local|skipped-local)/.test(key)||values.has(key);
    const local=key=>{try{return localStorage.getItem(key);}catch{return null;}};
    const removeLocal=key=>{try{localStorage.removeItem(key);}catch{}};
    const readAll=()=>new Promise((resolve,reject)=>{const request=db.transaction('entries','readonly').objectStore('entries').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    async function flush(){
      if(inFlight){await inFlight;if(dirty.size)return flush();return;}
      if(!db){if(error)throw error;return;}
      if(!dirty.size)return;
      const batch=new Map(dirty);dirty.clear();
      inFlight=new Promise((resolve,reject)=>{
        const transaction=db.transaction('entries','readwrite'),store=transaction.objectStore('entries');
        for(const[key,value]of batch){if(value===null)store.delete(key);else store.put({key,value});}
        transaction.oncomplete=()=>{for(const[key,value]of batch)if(values.get(key)===value)removeLocal(key);error=null;resolve();};
        transaction.onerror=transaction.onabort=()=>reject(transaction.error||new Error('Local world storage could not be committed.'));
      });
      try{await inFlight;}catch(failure){error=failure;for(const[key,value]of batch)if(!dirty.has(key))dirty.set(key,value);throw failure;}
      finally{inFlight=null;}
      if(dirty.size)return flush();
    }
    function schedule(){if(scheduled)return;scheduled=true;Promise.resolve().then(()=>{scheduled=false;void flush().catch(()=>{});});}
    async function archiveRetiredDrafts(){
      // Only the removed inbox owned these keys. Keep their exact contents in
      // the existing complete-save export before deleting any active entry.
      const key=retiredArchiveKey,drafts=[];
      const keep=(name,value)=>{if(value!==null&&!drafts.some(entry=>entry.key===name&&entry.value===value))drafts.push({key:name,value});};
      for(let index=0;index<localStorage.length;index++){const name=localStorage.key(index);if(isRetiredDraft(name))keep(name,local(name));}
      for(const[name,value]of values)if(isRetiredDraft(name))keep(name,value);
      const localArchive=local(key);
      if(!drafts.length&&localArchive===null)return;
      const parsed=value=>{const archive=JSON.parse(value);if(archive.version!==1||!Array.isArray(archive.entries)||archive.entries.some(entry=>!isRetiredDraft(entry?.key)||typeof entry.value!=='string'))throw new Error('The retained draft archive needs recovery.');return archive;};
      const merge=current=>{
        const archive=current?parsed(current):{version:1,retiredAt:Date.now(),entries:[]};
        for(const entry of [...(localArchive?parsed(localArchive).entries:[]),...drafts])if(!archive.entries.some(saved=>saved.key===entry.key&&saved.value===entry.value))archive.entries.push(entry);
        return JSON.stringify(archive);
      };
      const names=[...new Set(drafts.map(entry=>entry.key))],archived=(name,value)=>drafts.some(entry=>entry.key===name&&entry.value===value);
      if(db){
        // Read + merge + write share one serialized transaction. A second game
        // window must append to the committed archive, never replace a stale copy.
        await new Promise((resolve,reject)=>{let failure;const tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries'),request=store.get(key);request.onsuccess=()=>{try{store.put({key,value:merge(request.result?.value)});}catch(error){failure=error;tx.abort();}};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('Draft archive commit failed.'));});
        const committed=(await readAll()).find(row=>row.key===key)?.value;
        if(!committed||drafts.some(entry=>!parsed(committed).entries.some(saved=>saved.key===entry.key&&saved.value===entry.value)))throw new Error('Draft archive verification failed.');
        values.set(key,committed);
        if(localArchive!==null&&local(key)===localArchive)removeLocal(key);
        // Another still-open old shell may save a newer reply. Read and compare
        // within the cleanup transaction so that unarchived change survives.
        const remaining=new Map();
        await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries');for(const name of names){const request=store.get(name);request.onsuccess=()=>{const current=request.result?.value;if(current===undefined||archived(name,current))store.delete(name);else remaining.set(name,current);};}tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Draft cleanup deferred.'));});
        for(const name of names){if(remaining.has(name))values.set(name,remaining.get(name));else values.delete(name);}
      }else{
        const serialized=merge(localArchive);
        localStorage.setItem(key,serialized);
        if(local(key)!==serialized)throw new Error('Draft archive verification failed.');
        // localStorage has no cross-window transaction. Keep originals until a
        // later IndexedDB startup can archive and retire them safely.
        return;
      }
      for(const name of names)if(archived(name,local(name)))removeLocal(name);
    }
    async function retireDraftsSafely(){try{await archiveRetiredDrafts();}catch(failure){console.warn('Saved reply draft retirement deferred; original data retained.',failure.message);}}
    const ready=(async()=>{
      if(!window.indexedDB){await retireDraftsSafely();return;}
      try{
        db=await new Promise((resolve,reject)=>{const request=indexedDB.open('sar-world-cache-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('entries',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Local world storage is busy in another game window.'));});
        for(const row of await readAll())values.set(row.key,row.value);
        // A legacy build may have written a newer local branch. Migrate it only
        // after the full transaction commits; never discard quota-filling backups.
        const keys=Array.from({length:localStorage.length},(_,index)=>localStorage.key(index));
        for(const key of keys){if(isRetiredDraft(key)||key===retiredArchiveKey)continue;const value=local(key);if(managed(key)||(key?.startsWith('sar-')&&value?.length>65536)){values.set(key,value);dirty.set(key,value);}}
        await flush();
        await retireDraftsSafely();
      }catch(failure){error=failure;throw failure;}
    })();
    return {ready,flush,get error(){return error?.message||null;},
      get(key){return values.has(key)?values.get(key):local(key);},
      // Tournament checkpoints retain cyclic actor/projectile references and
      // Maps through IndexedDB's structured clone, independently of world JSON.
      getTournament(key){return key.startsWith('sar.tournament.runtime.')&&values.has(key)?structuredClone(values.get(key)):null;},
      canTournamentCheckpoint(){return !!db;},
      async putTournament(key,value){if(!key.startsWith('sar.tournament.runtime.'))throw new Error('Invalid tournament checkpoint key');await ready;if(!db)throw new Error('Durable tournament recovery requires local storage.');const copy=structuredClone(value);values.set(key,copy);dirty.set(key,copy);await flush();},
      set(key,value){value=String(value);if(db&&(managed(key)||(key.startsWith('sar-')&&value.length>65536))){const previous=values.get(key);if(previous&&previous!==value&&/^sar-.*(?:backup|migration-original|previous-local|skipped-local)/.test(key)&&!key.includes(':retained:')){const retained=key+':retained:'+Date.now()+':'+(++backupSerial);values.set(retained,previous);dirty.set(retained,previous);}values.set(key,value);dirty.set(key,value);schedule();return true;}try{localStorage.setItem(key,value);return true;}catch(failure){error=failure;return false;}},
      remove(key){if(db&&managed(key)){values.set(key,null);dirty.set(key,null);schedule();}else removeLocal(key);},
      entries(){const all=new Map();for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);all.set(key,local(key));}for(const[key,value]of values){if(value===null)all.delete(key);else all.set(key,value);}return [...all];}
    };
  })();
  let reconnectTimer=null,reconnecting=null;
  function observeClock(time){if(Number.isFinite(time)){state.serverNow=time;state.clockPerformance=performance.now();}}
  function now(){return state.serverNow?state.serverNow+Math.max(0,performance.now()-state.clockPerformance):Date.now();}
  const host=document.createElement('div');host.id='accountGate';host.className='account-gate hidden';document.body.appendChild(host);
  const badge=document.createElement('button');badge.id='cloudBadge';badge.type='button';badge.className='cloud-badge hidden';document.body.appendChild(badge);
  const accountMenu=document.createElement('div');accountMenu.id='cloudAccountMenu';accountMenu.className='cloud-account-menu hidden';accountMenu.innerHTML='<button data-action="player-profile">PLAYER PROFILE</button><button data-action="settings">SETTINGS</button><button data-settings-tab="account">ACCOUNT</button><button class="hidden" data-cloud-action="reauth">SIGN IN TO SYNC</button><button data-action="cloud-logout">LOG OUT</button>';document.body.appendChild(accountMenu);
  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function localGet(key){return storage.get(key);}
  function localSet(key,value){return storage.set(key,value);}
  function localRemove(key){storage.remove(key);}
  function readJSON(key){try{return JSON.parse(localGet(key));}catch{return null;}}
  function nativeLocalBackend(){return !!window.__SAR_NATIVE_GAME__&&typeof window.__TAURI__?.core?.invoke==='function'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);}
  function rememberAccount(){
    if(!state.account)return;
    const owner=localGet(OWNER_KEY);if(owner&&owner!==state.account.id)return;
    localSet(ACCOUNT_KEY,JSON.stringify({account:{id:state.account.id,username:state.account.username},revision:state.revision,updatedAt:state.updatedAt,origin:location.origin||'',authenticatedAt:Date.now(),serverNow:now()}));
  }
  function cachedAccount(){
    const owner=localGet(OWNER_KEY),save=readJSON(SAVE_KEY),record=readJSON(ACCOUNT_KEY),pending=readJSON(PENDING_KEY);
    if(!owner||!save||!Number.isFinite(save.schema)||save.schema<1||!save.config||typeof save.config!=='object')return null;
    if(record&&(record.account?.id!==owner||record.origin!==(location.origin||'')))return null;
    // OWNER_KEY is written only after successful authentication in older builds.
    // Keep those already authenticated worlds usable while upgrading the client.
    const account=record?.account||(state.account?.id===owner?state.account:{id:owner,username:'PLAYER'});
    // A bootstrap revision describes the server world, not the cached world.
    // Legacy caches without a recorded base must reconnect as an unknown branch.
    const known=record?.revision??null;
    return {account,revision:pending?.owner===owner?pending.baseRevision:known,updatedAt:record?.updatedAt||0,record,save};
  }
  function connectionLabel(){
    if(!state.account)return;
    badge.classList.remove('hidden');badge.textContent=state.localMode?'CLOUD OFFLINE — LOCAL MODE':state.account.username.toUpperCase()+' / CLOUD';
    accountMenu.querySelector('[data-cloud-action="reauth"]')?.classList.toggle('hidden',!(state.localMode&&state.reauthNeeded));
  }
  function scheduleReconnect(){if(!reconnectTimer)reconnectTimer=setTimeout(()=>{reconnectTimer=null;void reconnect();},10000);}
  function enterLocalMode(){
    const cached=cachedAccount();if(!cached)return false;
    state.account=cached.account;state.revision=cached.revision??state.revision;state.unknownRevision=cached.revision==null;state.updatedAt=cached.updatedAt;
    if(cached.record?.serverNow)observeClock(cached.record.serverNow+Math.max(0,Date.now()-cached.record.authenticatedAt));
    state.localMode=true;state.online=false;state.available=false;state.suspending=false;state.replacing=false;
    state.authExpired=false;
    state.dirty=localGet(SAVE_KEY);pendingCheckpoint(state.dirty);host.classList.add('hidden');loadGame();connectionLabel();scheduleReconnect();return true;
  }
  function pendingCheckpoint(save){if(state.account)localSet(PENDING_KEY,JSON.stringify({owner:state.account.id,baseRevision:state.unknownRevision?null:state.revision,save,at:now()}));}
  function status(message,error=false){
    const el=document.querySelector('#cloudStatus');if(el){el.textContent=message;el.classList.toggle('error',error);}
    const update=document.querySelector('#sarUpdateStatus');if(update&&state.account)update.textContent=message;
  }
  async function api(path,options={}){
    const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),...options,headers:{'content-type':'application/json',...options.headers}});
    let body={};try{body=await response.json();}catch{}
    observeClock(body.serverNow);
    if(!response.ok){const error=new Error(body.error||'Server request failed');error.status=response.status;error.code=body.code;throw error;}
    return body;
  }
  function showGate(mode='signup',message=''){
    window.SARBoot?.ready();state.mode=mode;host.classList.remove('hidden');
    const title=mode==='login'?'LOG IN':mode==='recover'?'RECOVER ACCOUNT':'CREATE ACCOUNT';
    host.innerHTML=`<div class="account-gate-card"><div class="account-gate-brand"><span>SKIRMISH / ACCOUNT ACCESS</span><h1>SKIRMISH<br><em>ARENA</em></h1><p>Your bot league, seasons and career follow your account.</p></div><div class="account-gate-form"><div class="eyebrow">${title}</div><label>USERNAME<input id="cloudUsername" autocomplete="username" maxlength="24" spellcheck="false"></label>${mode==='recover'?'':`<label>PASSWORD<input id="cloudPassword" type="password" autocomplete="${mode==='signup'?'new-password':'current-password'}"></label>`}${mode==='recover'?'<label>RECOVERY CODE<input id="cloudRecovery" autocomplete="off" spellcheck="false"></label><label>NEW PASSWORD<input id="cloudNewPassword" type="password" autocomplete="new-password"></label>':''}<p id="cloudStatus" class="account-gate-status" role="status">${safe(message)}</p><button class="primary" data-cloud-action="submit">${mode==='login'?'LOG IN':mode==='recover'?'RESET PASSWORD':'CREATE ACCOUNT'}</button><div class="account-gate-links">${mode==='signup'?'<button data-cloud-action="login">ALREADY HAVE AN ACCOUNT? LOG IN</button>':'<button data-cloud-action="signup">CREATE AN ACCOUNT</button>'}${mode==='login'?'<button data-cloud-action="recover">USE RECOVERY CODE</button>':''}</div><small>No email required. Passwords and recovery codes stay on the server.</small></div></div>`;
    if(state.loaded&&state.localMode){const back=document.createElement('button');back.dataset.cloudAction='local-mode';back.textContent='RETURN TO LOCAL GAME';host.querySelector('.account-gate-links')?.appendChild(back);}
    host.querySelector('#cloudUsername')?.focus();
  }
  function showRecovery(code){
    host.classList.remove('hidden');
    host.innerHTML=`<div class="account-gate-card account-gate-recovery"><div class="account-gate-brand"><span>RECOVERY / ONE TIME</span><h1>KEEP THIS CODE</h1><p>This is the only way to reset your password without an email address. Save it somewhere private; it will not appear again.</p></div><div class="account-gate-form"><span class="label">RECOVERY CODE</span><code id="recoveryCode">${safe(code)}</code><button data-cloud-action="copy-recovery">COPY CODE</button><button class="primary" data-cloud-action="continue">I SAVED THE CODE — CONTINUE</button><p id="cloudStatus" role="status"></p></div></div>`;
  }
  function showImport(){
    window.SARBoot?.ready();
    const name=state.account?.username||'your account';
    host.classList.remove('hidden');
    host.innerHTML=`<div class="account-gate-card account-gate-recovery"><div class="account-gate-brand"><span>SAVE MIGRATION</span><h1>FOUND LOCAL PROGRESS</h1><p>This browser has an existing Skirmish world. Copy its bot careers, seasons and current patch telemetry into ${safe(name)}'s cloud account?</p></div><div class="account-gate-form"><button class="primary" data-cloud-action="import">IMPORT LOCAL PROGRESS</button><button data-cloud-action="fresh">START A NEW WORLD</button><p id="cloudStatus" role="status">The local original is kept as a migration backup.</p></div></div>`;
  }
  function notifyCommerce(method='init'){
    // Optional account commerce never holds the saved-world/game startup gate.
    void Promise.resolve(window.SARCommerce?.[method]?.()).catch(error=>console.warn('Arena Credits:',error.message));
  }
  function loadGame(){
    notifyCommerce();
    if(state.loaded){if(state.reauthNeeded&&!state.localMode)location.reload();return;}
    if(!state.localMode)rememberAccount();
    state.loaded=true;host.classList.add('hidden');
    badge.classList.toggle('hidden',!state.account);
    connectionLabel();
    window.SARBoot?.stage('game-module','Loading your saved arena…');
    const script=document.createElement('script');script.src='game.js';script.onload=()=>{window.SARBoot?.gameReady();window.SARTournaments?.init?.();};script.onerror=()=>window.SARBoot?.fail('The game module could not be loaded. Retry to continue.',new Error('game.js failed to load'));document.body.appendChild(script);
    const notice=localGet('sar-cloud-recovery-notice');if(notice){const panel=document.createElement('div');panel.id='cloudRecoveryNotice';panel.className='cloud-recovery-notice';panel.setAttribute('role','alert');panel.innerHTML='<span>'+safe(notice)+'</span><button data-cloud-action="export-recovery">EXPORT BACKUP</button><button data-cloud-action="dismiss-recovery" aria-label="Dismiss recovery notice">×</button>';document.body.appendChild(panel);}
  }
  async function cacheWorld(world){
    if(state.loaded)state.replacing=true;
    const previous=localGet(SAVE_KEY);
    if(previous&&previous!==JSON.stringify(world.save))localSet('sar-cloud-previous-local',previous);
    if(!localSet(SAVE_KEY,JSON.stringify(world.save))||!localSet(OWNER_KEY,state.account.id))throw new Error('The accepted world could not be saved on this device. Export local backups to preserve your progress.');
    await storage.flush();
    state.revision=world.revision;state.updatedAt=world.updatedAt;state.unknownRevision=false;
    rememberAccount();
    await storage.flush();
  }
  async function cloudWorld(){
    if(state.loaded&&state.reauthNeeded)state.replacing=true;
    const body=await api('/world');let world=body.world;
    if(Array.isArray(body.tournamentReservations)){state.tournamentReservations=body.tournamentReservations;const key='sar.tournament.calendar.'+state.account.id;let cached={};try{cached=JSON.parse(localGet(key)||'{}')||{};}catch{}const retained=(Array.isArray(cached.tournaments)?cached.tournaments:[]).filter(t=>t.kind!=='official'||t.status!=='ACTIVE');localSet(key,JSON.stringify({...cached,tournaments:[...retained,...body.tournamentReservations]}));}
    const rawPending=localGet(PENDING_KEY);
    if(rawPending){
      try{
        const pending=JSON.parse(rawPending);
        if(pending.owner===state.account.id){
          if(pending.baseRevision===(world?.revision||0)){
            const recovered=await api('/world',{method:'PUT',body:JSON.stringify({baseRevision:pending.baseRevision,save:JSON.parse(pending.save)})});
            world={save:JSON.parse(pending.save),revision:recovered.revision,updatedAt:recovered.updatedAt};localRemove(PENDING_KEY);
          }else{localSet('sar-cloud-conflict-backup',pending.save);localSet('sar-cloud-recovery-source','sar-cloud-conflict-backup');localSet('sar-cloud-recovery-notice','Another session changed the cloud world. The cloud copy was loaded and your unsynced branch was retained as a backup.');localRemove(PENDING_KEY);}
        }
      }catch(error){
        if(error.code==='REVISION_CONFLICT'){const latest=await api('/world');world=latest.world;localSet('sar-cloud-conflict-backup',JSON.parse(rawPending).save);localSet('sar-cloud-recovery-source','sar-cloud-conflict-backup');localSet('sar-cloud-recovery-notice','Another session changed the cloud world. The cloud copy was loaded and your unsynced branch was retained as a backup.');localRemove(PENDING_KEY);}
        else if(error.code==='SAVE_REJECTED'||[400,413].includes(error.status)){localSet('sar-cloud-rejected-backup',JSON.parse(rawPending).save);localSet('sar-cloud-recovery-source','sar-cloud-rejected-backup');localSet('sar-cloud-recovery-notice','The server rejected an unsynced save: '+error.message+'. The accepted cloud copy was loaded; the rejected branch is retained as a backup.');localRemove(PENDING_KEY);}
        else throw error;
      }
    }
    if(world){await cacheWorld(world);loadGame();return;}
    const prior=localGet(SAVE_KEY),owner=localGet(OWNER_KEY);
    if(prior&&(!owner||owner===state.account.id)){showImport();return;}
    if(prior&&owner&&owner!==state.account.id){
      localSet('sar-cloud-previous-local',prior);
      localRemove(SAVE_KEY);
    }
    state.revision=0;localSet(OWNER_KEY,state.account.id);loadGame();
  }
  async function authSubmit(){
    const username=host.querySelector('#cloudUsername')?.value?.trim()||'';
    const password=host.querySelector('#cloudPassword')?.value||'';
    const mode=state.mode,wasLocal=state.loaded&&state.localMode;let authenticated=false;status('CONNECTING…');
    state.authenticating=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    try{
      const body=await api('/auth/'+(mode==='signup'?'signup':mode==='login'?'login':'recover'),{method:'POST',body:JSON.stringify(mode==='recover'?{username,recoveryCode:host.querySelector('#cloudRecovery')?.value||'',newPassword:host.querySelector('#cloudNewPassword')?.value||''}:{username,password})});
      authenticated=true;state.account=body.account;state.revision=body.account.revision||0;
      if(wasLocal&&window.SAR?.getUniverse){const cached=readJSON(PENDING_KEY);state.dirty=JSON.stringify(window.SAR.getUniverse());localSet(SAVE_KEY,state.dirty);if(cached)localSet(PENDING_KEY,JSON.stringify({...cached,save:state.dirty}));}
      state.authExpired=false;state.suspending=false;state.online=true;state.localMode=false;state.available=true;
      if(body.recoveryCode){showRecovery(body.recoveryCode);return;}
      await cloudWorld();
    }catch(error){if(!(authenticated&&wasLocal&&enterLocalMode()))status(error.message,true);}
    finally{state.authenticating=false;if(state.localMode)scheduleReconnect();}
  }
  async function importLocal(){
    const text=localGet(SAVE_KEY);if(!text){status('Local save missing',true);return;}
    status('MIGRATING YOUR WORLD…');
    try{
      localSet('sar-cloud-migration-original',text);
      const result=await api('/world/import',{method:'POST',body:JSON.stringify({save:JSON.parse(text)})});
      await cacheWorld({save:result.save,revision:result.revision,updatedAt:result.updatedAt});loadGame();
    }catch(error){status(error.message,true);}
  }
  function queueSave(world){
    if(!state.account||!state.loaded)return;
    if(state.suspending||state.replacing)return;
    state.dirty=JSON.stringify(world);pendingCheckpoint(state.dirty);
    if(state.localMode){localSet(SAVE_KEY,state.dirty);scheduleReconnect();return;}
    if(!state.sending&&!state.retry&&!state.saveRejected)state.retry=setTimeout(flush,1800);
  }
  function commitMatch(world,matchId){
    // The complete local snapshot is already committed by game finalization.
    // Publish that same snapshot immediately; offline checkpoints stay account-owned.
    if(state.profileCommit?.matchId===matchId)return;
    state.profileCommit={matchId,at:world.updatedAt,career:JSON.parse(JSON.stringify(world.playerCareer))};
    queueSave(world);if(!state.localMode)void flush().catch(error=>status(error.message,true));
  }
  async function flush(){
    if(state.retry){clearTimeout(state.retry);state.retry=null;}
    if(state.localMode){if(state.dirty)pendingCheckpoint(state.dirty);scheduleReconnect();if(!reconnecting)return reconnect();return;}
    if(state.authExpired)return;
    if(state.sending){await state.inFlight;return flush();}
    if(!state.dirty||!state.account)return;
    let finish;state.inFlight=new Promise(resolve=>{finish=resolve;});
    state.sending=true;const save=state.dirty;state.dirty=null;
    try{
      const result=await api('/world',{method:'PUT',body:JSON.stringify({baseRevision:state.revision,save:JSON.parse(save)})});
      state.revision=result.revision;state.updatedAt=result.updatedAt;
      rememberAccount();
      state.saveRejected=null;
      if(state.dirty)pendingCheckpoint(state.dirty);else localRemove(PENDING_KEY);
      const update=document.querySelector('#sarUpdateStatus');if(update)update.textContent='CLOUD SYNCED · '+new Date(result.updatedAt).toLocaleTimeString();
    }catch(error){
      if(error.status===401){
        state.dirty=state.dirty||save;pendingCheckpoint(state.dirty);
        state.authExpired=true;state.reauthNeeded=true;
        if(!enterLocalMode()){window.SAR?.prepareReload?.();state.suspending=true;showGate('login','Your session expired. Sign in again to recover your pending progress.');}
      }else if(error.status===409&&error.code==='REVISION_CONFLICT'){
        localSet('sar-cloud-conflict-backup',state.dirty||save);
        localSet('sar-cloud-recovery-source','sar-cloud-conflict-backup');localSet('sar-cloud-recovery-notice','Another session changed the cloud world. The cloud copy was loaded and your newest unsynced progress was retained as a backup.');
        state.dirty=null;localRemove(PENDING_KEY);
        const update=document.querySelector('#sarUpdateStatus');if(update)update.textContent='CLOUD CHANGED IN ANOTHER SESSION · LOCAL BACKUP KEPT';
        await cloudWorld();location.reload();
      }else if(error.code==='SAVE_REJECTED'||[400,413].includes(error.status)){
        state.dirty=state.dirty||save;state.saveRejected=error.message;
        localSet('sar-cloud-rejected-backup',state.dirty);
        const update=document.querySelector('#sarUpdateStatus');if(update)update.textContent='CLOUD SAVE REJECTED · LOCAL BACKUP KEPT · '+error.message;
      }else{
        state.dirty=state.dirty||save;
        const update=document.querySelector('#sarUpdateStatus');if(update)update.textContent='CLOUD OFFLINE — LOCAL MODE';
        if(!enterLocalMode())state.retry=setTimeout(flush,10000);
      }
    }finally{
      state.sending=false;
      state.inFlight=null;finish();
      if(state.dirty&&!state.retry&&!state.saveRejected&&!state.authExpired&&!state.localMode)state.retry=setTimeout(flush,1800);
    }
  }
  async function checkpoint(){
    let resume;if(window.SAR?.prepareReload)resume=window.SAR.prepareReload();else{window.dispatchEvent(new Event('sar-before-update'));resume=()=>{};}
    state.suspending=true;
    try{await window.SARTournaments?.checkpoint?.();await flush();await storage.flush();if(state.dirty||state.sending)throw new Error(state.saveRejected?'Cloud rejected this save. A local backup was retained.':'Progress is waiting for cloud sync. Reconnect before updating or signing out.');return ()=>{state.suspending=false;resume();};}
    catch(error){state.suspending=!!state.authExpired;if(!state.authExpired)resume();throw error;}
  }
  async function importWorld(save){
    const resume=await checkpoint();
    try{
      const result=await api('/world',{method:'PUT',body:JSON.stringify({baseRevision:state.revision,save})});
      localSet('sar-import-backup',localGet(SAVE_KEY)||'null');await cacheWorld({save,revision:result.revision,updatedAt:result.updatedAt});localRemove(PENDING_KEY);await storage.flush();
    }finally{resume();}
  }
  async function logout(){
    if(!state.account)return;
    let resume;try{resume=await checkpoint();await api('/auth/logout',{method:'POST',body:'{}'});}catch(error){resume?.();alert(error.message);return;}
    const raw=localGet(SAVE_KEY);if(raw)localSet('sar-cloud-logout-backup-'+state.account.id,raw);
    state.replacing=true;
    window.SARCommerce?.reset?.();
    localRemove(ACCOUNT_KEY);localRemove(OWNER_KEY);localRemove(PENDING_KEY);localRemove(SAVE_KEY);await storage.flush();
    location.reload();
  }
  function modal(html,view){const el=document.querySelector('#modalContent'),panel=document.querySelector('#modal');if(!el||!panel)return;el.innerHTML=html;el.dataset.view=view;panel.classList.add('visible');}
  async function showProfile(){
    if(window.SAR?.openPlayerProfile){window.SAR.openPlayerProfile();return;}
    try{
      const {career,account,seasons,loadout}=await api('/profile');
      const c=career||{},weapons=Object.entries(c.weapons||{}).sort((a,b)=>(b[1].equippedTime||0)-(a[1].equippedTime||0));
      modal(`<div class="eyebrow">PERMANENT CAREER / ${safe(account.username)}</div><h2>PLAYER PROFILE</h2><div class="match-report-grid"><div><span>MATCHES</span><strong>${c.games||0}</strong><small>${c.wins||0} W · ${c.losses||0} L</small></div><div><span>K / D / A</span><strong>${c.kills||0} / ${c.deaths||0} / ${c.assists||0}</strong></div><div><span>DAMAGE</span><strong>${Math.round(c.damage||0).toLocaleString()}</strong></div><div><span>BEST GAME</span><strong>${c.bestKills||0} K</strong><small>${Math.round(c.bestDamage||0)} damage</small></div><div><span>BEST STREAK</span><strong>${c.bestStreak||0}</strong></div><div><span>SEASON</span><strong>${seasons?.current?.number||1}</strong><small>Cloud revision ${account.revision}</small></div></div><h3>WEAPON HISTORY</h3><div class="meta-table-scroll"><table class="meta-table"><thead><tr><th>WEAPON</th><th>KILLS</th><th>SHOTS</th><th>HITS</th><th>DAMAGE</th><th>TIME</th></tr></thead><tbody>${weapons.map(([name,w])=>`<tr><td>${safe(name)}</td><td>${w.k||0}</td><td>${w.shots||0}</td><td>${w.hits||0}</td><td>${Math.round(w.damage||0)}</td><td>${((w.equippedTime||0)/60).toFixed(1)}m</td></tr>`).join('')}</tbody></table></div><p class="meta-note">Current loadout: ${safe(loadout?.primary||'—')} / ${safe(loadout?.sidearm||'—')}</p>`,'player-profile');
    }catch(error){alert(error.message);}
  }
  async function showTournaments(){
    if(window.SARTournaments)return window.SARTournaments.show();
    if(!state.available||!state.account){modal('<div class="eyebrow">LEAGUE / EVENT BOARD</div><h2>TOURNAMENTS</h2><p class="analytics-note">Connect to the account server to see scheduled events.</p>','tournaments');return;}
    try{
      const data=await api('/tournaments');
      modal(`<div class="eyebrow">LEAGUE / EVENT BOARD</div><h2>TOURNAMENTS</h2><p class="meta-note">Scheduled events are announced from the server. Match results and brackets appear only after actual play.</p><div class="tournament-list">${data.tournaments.length?data.tournaments.map(t=>`<article class="tournament-card"><div><strong>${safe(t.name)}</strong><span>${safe(t.status)}</span></div><p>${new Date(t.startsAt).toLocaleString()}</p></article>`).join(''):'<p class="analytics-note">No tournaments announced.</p>'}</div>`,'tournaments');
    }catch(error){alert(error.message);}
  }
  host.addEventListener('click',async event=>{
    const action=event.target.closest('[data-cloud-action]')?.dataset.cloudAction;
    if(action==='signup'||action==='login'||action==='recover')showGate(action);
    else if(action==='submit')await authSubmit();
    else if(action==='local-mode'){host.classList.add('hidden');connectionLabel();}
    else if(action==='continue')await cloudWorld();
    else if(action==='copy-recovery'){try{await navigator.clipboard.writeText(host.querySelector('#recoveryCode')?.textContent||'');status('COPIED');}catch{status('Select and copy the code above.');}}
    else if(action==='import')await importLocal();
    else if(action==='fresh'){
      const existing=localGet(SAVE_KEY);if(existing)localSet('sar-cloud-skipped-local',existing);
      localRemove(SAVE_KEY);await storage.flush();
      localSet(OWNER_KEY,state.account.id);loadGame();
    }
  });
  host.addEventListener('keydown',event=>{if(event.key==='Enter'&&['INPUT'].includes(event.target.tagName)){event.preventDefault();authSubmit();}});
  badge.setAttribute('aria-haspopup','menu');badge.setAttribute('aria-expanded','false');accountMenu.setAttribute('role','menu');for(const button of accountMenu.querySelectorAll('button'))button.setAttribute('role','menuitem');
  badge.addEventListener('click',()=>{accountMenu.classList.toggle('hidden');badge.setAttribute('aria-expanded',String(!accountMenu.classList.contains('hidden')));if(!accountMenu.classList.contains('hidden'))accountMenu.querySelector('button')?.focus();});
  document.addEventListener('keydown',event=>{if(accountMenu.classList.contains('hidden'))return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();accountMenu.classList.add('hidden');badge.setAttribute('aria-expanded','false');badge.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...accountMenu.querySelectorAll('button:not(.hidden)')],i=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}},true);
  document.addEventListener('click',async event=>{
    if(!event.target.closest('#cloudBadge')){accountMenu.classList.add('hidden');badge.setAttribute('aria-expanded','false');}
    const action=event.target.closest('[data-cloud-action]')?.dataset.cloudAction;
    if(action==='reauth')showGate('login','Sign in to synchronize your locally saved progress.');
    if(action==='dismiss-recovery'){localRemove('sar-cloud-recovery-notice');document.querySelector('#cloudRecoveryNotice')?.remove();}
    if(action==='export-recovery'){const raw=localGet(localGet('sar-cloud-recovery-source')||'sar-cloud-conflict-backup');if(raw){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));link.download='skirmish-unsynced-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}}
  });
  async function bootstrap(){
    const response=await fetch('/api/bootstrap',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok||!String(response.headers.get('content-type')).includes('application/json'))throw new Error('Cloud server unavailable');
    return response.json();
  }
  async function reconnect(){
    if(state.authenticating)return false;
    if(reconnecting)return reconnecting;
    reconnecting=(async()=>{
      try{
        // The native launcher owns local process management. Remote origins never
        // invoke this command or start a localhost service.
        if(nativeLocalBackend())await window.__TAURI__.core.invoke('check_local_backend').catch(()=>{});
        const body=await bootstrap();
        if(!body.authenticated){
          state.reauthNeeded=true;
          if(!state.loaded){state.available=true;state.online=true;if(!enterLocalMode())showGate('signup');}
          connectionLabel();scheduleReconnect();return false;
        }
        if(state.account&&body.account.id!==state.account.id){state.reauthNeeded=true;connectionLabel();scheduleReconnect();return false;}
        observeClock(body.serverNow);
        const cachedId=state.account?.id;state.account=body.account;
        if(!state.loaded){state.available=true;state.online=true;state.localMode=false;state.revision=body.account.revision||0;await cloudWorld();return true;}
        // Snapshot before checking the revision so current local play survives
        // a connection returning between the usual two-second save intervals.
        if(window.SAR?.getUniverse)queueSave(window.SAR.getUniverse());
        const result=await api('/world'),world=result.world,remoteRevision=world?.revision||0;
        const pending=readJSON(PENDING_KEY);
        if(state.unknownRevision||remoteRevision!==(pending?.baseRevision??state.revision)){
          if(state.dirty)localSet('sar-cloud-conflict-backup',state.dirty);
          localSet('sar-cloud-recovery-source','sar-cloud-conflict-backup');localSet('sar-cloud-recovery-notice','Another session changed the cloud world. Your offline progress was retained as a backup before loading the cloud copy.');
          state.dirty=null;localRemove(PENDING_KEY);state.localMode=false;state.online=true;state.available=true;state.reauthNeeded=false;
          if(world){await cacheWorld(world);location.reload();return true;}
          state.account=cachedId?{...body.account,id:cachedId}:body.account;enterLocalMode();return false;
        }
        state.localMode=false;state.online=true;state.available=true;state.authExpired=false;state.reauthNeeded=false;state.unknownRevision=false;
        state.revision=remoteRevision;connectionLabel();rememberAccount();await flush();
        if(!state.localMode){connectionLabel();notifyCommerce('refresh');}return !state.localMode;
      }catch(_){enterLocalMode();scheduleReconnect();return false;}
      finally{reconnecting=null;}
    })();
    return reconnecting;
  }
  addEventListener('online',()=>{void reconnect();});
  addEventListener('focus',()=>{if(state.localMode)void reconnect();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.localMode)void reconnect();});
  async function boot(){
    try{
      await storage.ready;
      window.SARBoot?.stage('account-access','Loading your account…');
      const body=await bootstrap();state.available=true;state.online=true;observeClock(body.serverNow);
      if(!body.authenticated){state.reauthNeeded=true;if(!enterLocalMode())showGate('signup');return;}
      const prior=cachedAccount();if(prior&&prior.account.id!==body.account.id){state.reauthNeeded=true;enterLocalMode();return;}
      state.account=body.account;state.revision=body.account.revision||0;window.SARBoot?.stage('saved-world','Loading your saved world…');await cloudWorld();
    }catch(error){
      state.available=false;state.online=false;
      if(error.status===401)state.reauthNeeded=true;
      if(!enterLocalMode()){
        host.classList.remove('hidden');host.innerHTML='<div class="account-gate-card account-gate-recovery"><div class="account-gate-brand"><span>CLOUD CONNECTION</span><h1>SERVER OFFLINE</h1><p>Connect once to sign in or create an account on this PC. No authenticated local world is available yet.</p><button class="primary" id="cloudRetry">RETRY CONNECTION</button></div></div>';
        window.SARBoot?.ready();host.querySelector('#cloudRetry')?.addEventListener('click',()=>{void reconnect();});scheduleReconnect();
      }
    }
  }
  window.SARCloud={state,queueSave,commitMatch,flush,checkpoint,importWorld,logout,showProfile,showTournaments,api,now,reconnect};
  boot();
})();
