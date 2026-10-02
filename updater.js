(() => {
  'use strict';
  const APP_VERSION = window.SARBuild.version;
  let registration = null, deferredInstall = null, waitingWorker = null;
  let pending = null, boot = null, reloading = false, activationPrepared = false;
  let controlled = !!navigator.serviceWorker?.controller;
  const supported = 'serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:';

  function standalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function status(message, tone = '') {
    const el = document.getElementById('sarUpdateStatus');
    el.textContent = message;
    el.className = 'lobby-update-status ' + tone;
    const settings = document.getElementById('appUpdateMessage');
    if (settings) settings.textContent = message;
    return message;
  }
  function updateButton(busy = false) {
    const btn = document.getElementById('sarUpdateApp');
    btn.disabled = busy;
    btn.setAttribute('aria-busy', String(busy));
    btn.querySelector('strong').textContent = busy ? 'UPDATING…' : waitingWorker ? 'INSTALL UPDATE' : 'UPDATE GAME';
    btn.classList.toggle('update-ready', !!waitingWorker);
  }
  function showUpdate(worker) {
    if (!worker || worker.state === 'redundant') return;
    waitingWorker = worker;
    updateButton(!!pending);
    status('A new release is ready. Hit Update Game to install.', 'ok');
  }
  function showInstall() {
    document.getElementById('sarInstallApp')?.classList.toggle('hidden', !deferredInstall || standalone());
  }
  async function installApp() {
    if (!deferredInstall) return;
    const prompt = deferredInstall;
    deferredInstall = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { status('Installation was not completed. Use your browser’s install menu to try again.', 'error'); }
    showInstall();
  }
  function installed(worker) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('The update download timed out. Try again.')), 25000);
      function finish(error) {
        clearTimeout(timer);
        worker.removeEventListener('statechange', change);
        error ? reject(error) : resolve();
      }
      function change() {
        if (worker.state === 'installed' || worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('The update could not be downloaded. Try again.'));
      }
      worker.addEventListener('statechange', change);
      change();
    });
  }
  async function activate(worker) {
    status('Saving progress before the update…');
    const resume=window.SARCloud?.checkpoint?await window.SARCloud.checkpoint():window.SAR?.prepareReload?.();
    activationPrepared=true;
    status('Installing the new release. The game will reload…', 'ok');
    try{await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('The update did not activate. Try again.')), 15000);
      function finish(error) {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        error ? reject(error) : resolve();
      }
      function changed() { finish(); }
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      worker.postMessage({ type: 'SKIP_WAITING' });
    });}catch(error){activationPrepared=false;resume?.();throw error;}
  }
  async function runCheck(manual, apply) {
    if (!supported) {
      status('Updates need the game’s HTTPS address or localhost. A downloaded folder cannot receive releases.', 'error');
      return false;
    }
    if (navigator.onLine === false) throw new Error('You’re offline. Connect to the internet and hit Update Game again.');
    if (manual) status('Checking for a new release…');
    registration = registration || await boot;
    if (!registration) {
      status('The updater could not start. Reopen the hosted game and try again.', 'error');
      return false;
    }
    if (apply && registration.waiting) {
      waitingWorker = registration.waiting;
      await activate(waitingWorker);
      return true;
    }
    await registration.update();
    // update() may resolve while a worker is still downloading.
    if (registration.installing) await installed(registration.installing);
    waitingWorker = registration.waiting || null;
    if (waitingWorker) {
      if (apply) await activate(waitingWorker);
      else showUpdate(waitingWorker);
      return true;
    }
    if (manual) {
      const response = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Could not read the release information. Try again when connected.');
      const remote = await response.json();
      if (typeof remote.version !== 'string') throw new Error('The release information is invalid. Try again later.');
      status(remote.version === APP_VERSION ? 'You’re up to date. Build ' + APP_VERSION + '.' : 'Release ' + remote.version + ' is still publishing. Try again shortly.', remote.version === APP_VERSION ? 'ok' : '');
    }
    return false;
  }
  function checkForUpdates(manual = false, apply = false) {
    if (pending) {
      // A manual click during the automatic startup check must still install afterwards.
      return manual ? pending.then(() => checkForUpdates(true, apply)) : pending;
    }
    if (manual) updateButton(true);
    pending = runCheck(manual, apply).catch(error => {
      if (manual) status(navigator.onLine === false ? 'You’re offline. Connect to the internet and hit Update Game again.' : error.name === 'TypeError' ? 'Couldn’t reach the update server. Check your connection and hit Update Game again.' : error.message || 'Update failed. Check your connection and try again.', 'error');
      return false;
    }).finally(() => { pending = null; updateButton(); });
    return pending;
  }
  window.SARUpdater = {
    version: APP_VERSION,
    check: () => checkForUpdates(true),
    apply: () => checkForUpdates(true, true),
    install: installApp, isInstalled: standalone,
    canInstall: () => !!deferredInstall,
    hasUpdate: () => !!waitingWorker || !!registration?.waiting,
    getStatus: () => document.getElementById('sarUpdateStatus').textContent
  };
  document.getElementById('sarUpdateApp').addEventListener('click', () => checkForUpdates(true, true));
  const dock = document.createElement('div');
  dock.className = 'sar-update-dock';
  dock.innerHTML = '<button id="sarInstallApp" class="sar-app-action hidden" type="button">INSTALL APP ↗</button>';
  document.body.appendChild(dock);
  document.getElementById('sarInstallApp').addEventListener('click', installApp);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; showInstall(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; showInstall(); status('Skirmish Arena installed.', 'ok'); });
  if (!supported) return;
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (controlled && !reloading) {
      reloading = true;
      try{
        if(!activationPrepared){if(window.SARCloud?.checkpoint)await window.SARCloud.checkpoint();else window.dispatchEvent(new Event('sar-before-update'));}
        location.reload();
      }catch(error){reloading=false;status(error.message,'error');}
    }
    controlled = true;
  });
  boot = navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    registration = reg;
    if (reg.waiting && controlled) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && controlled) showUpdate(worker);
      });
    });
    return reg;
  }).catch(() => null);
  boot.then(reg => { if (reg) checkForUpdates(); });
  setInterval(() => checkForUpdates(), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });
})();



