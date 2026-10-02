importScripts('./build-meta.js');
const APP_VERSION = self.SARBuild.version;
const CACHE_NAME = `sar-shell-${APP_VERSION}-${self.SARBuild.shellRevision||'live-circuit-2'}`;
const CORE = ['./index.html', './styles.css', './game.js', './cloud.js', './ai-ui.js', './ai-ui.css', './fullscreen.js', './audio.js', './assets/audio/LICENSES.json', './renderer-25d.mjs', './environment-25d.mjs', './models-25d.mjs', './inspect-25d.mjs', './asset-loader-25d.mjs', './vendor/three.module.js', './vendor/three.core.js', './vendor/addons/loaders/GLTFLoader.js', './vendor/addons/utils/BufferGeometryUtils.js', './vendor/addons/utils/SkeletonUtils.js', './assets/25d/manifest.json', './assets/25d/brightfield-props.glb', './updater.js', './manifest.webmanifest', './app-icon.svg'];
CORE.push('./desktop-launch.html','./build-meta.js','./tournaments-ui.js','./assets/25d/live-circuit-details.glb');
const shellUrls = new Set(CORE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  // Download the complete release before allowing it to replace the active shell.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    const manifest=await (await cache.match(new URL('./assets/audio/LICENSES.json',self.registration.scope))).json();
    await cache.addAll(Object.values(manifest.assets).filter(asset=>asset.critical).map(asset=>new Request(new URL('./assets/audio/'+asset.file,self.registration.scope),{cache:'reload'})));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('sar-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'SW_VERSION', version: APP_VERSION, cache: CACHE_NAME });
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) {
    // Offline checks must fail truthfully; never invent an up-to-date response.
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  const scope = new URL(self.registration.scope);
  const navigation = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html' || url.pathname === scope.pathname + 'index');
  const canonical = new URL(url.href); canonical.search = ''; canonical.hash = '';
  const audio=url.pathname.startsWith(scope.pathname+'assets/audio/')&&/\.(wav|ogg)$/.test(url.pathname)&&!url.pathname.includes('/source/');
  if (!navigation && !shellUrls.has(canonical.href) && !audio) return;
  event.respondWith((async () => {
    // Releases are immutable: never combine fresh HTML with stale JS or CSS.
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(navigation ? new URL('./index.html', scope).href : canonical.href);
    if(cached)return cached;
    if(audio){const manifest=await (await cache.match(new URL('./assets/audio/LICENSES.json',scope))).json();const allowed=new Set(Object.values(manifest.assets).map(asset=>new URL('./assets/audio/'+asset.file,scope).href));if(!allowed.has(canonical.href))return fetch(request);const response=await fetch(request);if(response.ok)await cache.put(canonical.href,response.clone());return response;}
    return fetch(request);
  })());
});

