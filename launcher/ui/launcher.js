(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const native = window.__TAURI__?.core?.invoke;
  let pending = null;
  let busy = false;
  const sizeText = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  const notice = message => { el('notice').textContent = message || ''; };
  const invoke = (command, args) => native ? native(command, args) : Promise.reject(new Error('Open the desktop application to use this action.'));
  function setBusy(value) {
    busy = value;
    el('update').disabled = value;
    el('server-form').querySelector('button').disabled = value;
    el('play').disabled = value;
  }
  async function refreshServer() {
    try {
      const result = await invoke('server_status');
      el('connection').textContent = result.online ? 'Arena server online' : 'Cloud offline — local mode available';
      el('status-dot').className = `status-dot ${result.online ? 'online' : 'offline'}`;
      el('game-version').textContent = result.gameVersion ? `GAME VERSION ${result.gameVersion}` : '—';
      el('play').disabled = busy;
      el('play-note').textContent = result.online ? 'Sign in to continue your account and universe.' : 'Previously authenticated accounts can continue their saved local world.';
      if (!result.online && result.startupError) notice(String(result.startupError));
      if (typeof result.news === 'string' && result.news.trim()) {
        el('news').replaceChildren(...result.news.split(/\r?\n/).filter(Boolean).map(text => {
          const li = document.createElement('li'); li.textContent = text.replace(/^[-*]\s*/, ''); return li;
        }));
      }
    } catch (error) {
      el('connection').textContent = 'Server unavailable';
      el('status-dot').className = 'status-dot offline';
      el('game-version').textContent = 'Connection unavailable; saved local worlds remain playable.';
      el('play').disabled = busy || !native;
      el('play-note').textContent = 'The desktop app starts its included local backend automatically.';
      notice(native ? 'Could not reach the configured server.' : 'Desktop launcher preview. Native actions run inside the Tauri application.');
    }
  }
  async function checkUpdate() {
    setBusy(true);
    notice('');
    el('update-title').textContent = 'Checking signed manifest…';
    try {
      const result = await invoke('check_launcher_update');
      pending = result.available ? result : null;
      el('update-title').textContent = pending ? `Version ${pending.version}` : 'Launcher is current';
      el('update-label').textContent = pending ? 'UPDATE AVAILABLE' : 'LAUNCHER UPDATE';
      el('update-info').textContent = pending ? `${sizeText(pending.size)} · signed release · account data preserved` : 'No newer signed launcher release is available.';
      el('update').textContent = pending ? 'UPDATE' : 'CHECK FOR UPDATE';
    } catch (error) {
      pending = null;
      el('update-title').textContent = 'Update check unavailable';
      el('update-info').textContent = 'Connect to the server and check again.';
      el('update').textContent = 'CHECK FOR UPDATE';
      notice(String(error.message || error));
    } finally { setBusy(false); }
  }
  el('update').addEventListener('click', async () => {
    if (busy) return;
    if (!pending) { await checkUpdate(); return; }
    setBusy(true); notice(''); el('progress').hidden = false; el('progress').value = 0;
    try {
      await invoke('install_launcher_update', {manifestDigest: pending.manifestDigest});
      notice('Update verified. The launcher will restart after installation.');
    } catch (error) {
      notice(String(error.message || error)); setBusy(false); el('progress').hidden = true;
    }
  });
  el('play').addEventListener('click', async () => {
    try { await invoke('play'); notice('Game opened.'); } catch (error) { notice(String(error.message || error)); }
  });
  el('server-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; notice('');
    try {
      await invoke('save_server', {serverOrigin: el('server').value});
      el('server-details').open = false; pending = null;
      await refreshServer(); await checkUpdate();
    } catch (error) { notice(String(error.message || error)); }
  });
  async function boot() {
    if (window.__TAURI__?.event?.listen) {
      await window.__TAURI__.event.listen('backend-startup', event => {
        const data = event.payload;
        if (!data || typeof data.message !== 'string') return;
        el('connection').textContent = 'Preparing your saved account';
        el('status-dot').className = 'status-dot offline';
        el('play').disabled = true;
        el('play-note').textContent = data.message;
        notice(data.message);
      });
      await window.__TAURI__.event.listen('launcher-update-progress', event => {
        const data = event.payload;
        el('progress').value = data.total ? Math.min(100, data.downloaded / data.total * 100) : 0;
        el('update-title').textContent = data.phase;
        el('update-info').textContent = `${sizeText(data.downloaded)} / ${sizeText(data.total)}`;
      });
    }
    if (native) {
      try { const settings = await invoke('launcher_settings'); el('server').value = settings.serverOrigin; el('version').textContent = settings.launcherVersion; } catch (error) { notice(String(error)); }
      await refreshServer(); await checkUpdate();
    } else {
      el('connection').textContent = 'Desktop preview';
      el('game-version').textContent = 'Native shell connects to your arena server.';
      el('play-note').textContent = 'Play opens the game in a persistent desktop window.';
      notice('This is a visual preview of the Tauri launcher.');
    }
  }
  boot();
})();
