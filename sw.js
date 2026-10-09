importScripts('./build-meta.js');
const APP_VERSION = self.SARBuild.version;
const CACHE_NAME = `sar-shell-${APP_VERSION}-${self.SARBuild.shellRevision||'live-circuit-2'}`;
const CORE = ['./index.html', './styles.css', './game.js', './cloud.js', './mode-entry.js', './phone-ui.js', './phone-ui.css', './fullscreen.js', './audio.js', './assets/audio/LICENSES.json', './renderer-25d.mjs', './environment-25d.mjs', './models-25d.mjs', './inspect-25d.mjs', './asset-loader-25d.mjs', './vendor/three.module.js', './vendor/three.core.js', './vendor/addons/loaders/GLTFLoader.js', './vendor/addons/utils/BufferGeometryUtils.js', './vendor/addons/utils/SkeletonUtils.js', './assets/25d/manifest.json', './assets/25d/brightfield-props.glb', './updater.js', './manifest.webmanifest', './app-icon.svg'];
CORE.push('./theme.css','./skyline.css','./phone-apps.css','./skyline-tournaments.css','./phone-apps.js','./team-presentation.js','./exit-game.js','./assets/branding/wordmark.svg','./assets/branding/wordmark-mono.svg','./assets/branding/monogram.svg','./assets/branding/monogram-mono.svg','./assets/branding/app-256.png','./assets/branding/app-512.png','./match-modes.js','./progression.js','./boot.js','./boot.css','./tactical-instinct.js','./desktop-launch.html','./build-meta.js','./tournaments-ui.js','./assets/25d/live-circuit-details.glb');
CORE.push('./fonts.css','./blue-circuit.css','./assets/fonts/Inter-Variable.ttf','./assets/fonts/Oxanium-Variable.ttf','./assets/fonts/Inter-OFL.txt','./assets/fonts/Oxanium-OFL.txt','./assets/fonts/manifest.json','./assets/25d/ranks/manifest.json','./assets/25d/ranks/blue-circuit-ranks.glb');
const COSMETIC_MANIFEST='./assets/25d/cosmetics/manifest.json';
CORE.push('./profile-stats.js','./distance-units.js');
CORE.push('./commerce.js','./commerce.css','./refined-ui.css','./cosmetics-25d.mjs',COSMETIC_MANIFEST);
const OPTIONAL=CORE.filter(path=>path.startsWith('./assets/')&&path!==COSMETIC_MANIFEST);
const ESSENTIAL=CORE.filter(path=>!OPTIONAL.includes(path));
const shellUrls = new Set(CORE.map(path => new URL(path, self.registration.scope).href));
function cosmeticFiles(manifest){
  const files=new Map();
  for(const item of Object.values(manifest?.cosmetics||{}))for(const style of Object.values(item.styles||{})){
    if(/^assets\/25d\/cosmetics\/[a-z0-9.-]+\.glb$/.test(style.file)&&/^[a-f0-9]{64}$/.test(style.sha256))files.set(new URL(style.file,self.registration.scope).href,style.sha256);
  }
  return files;
}
let warming;
function warmOptional(){return warming??=(async()=>{const cache=await caches.open(CACHE_NAME);const store=async path=>{const request=new Request(new URL(path,self.registration.scope),{cache:'reload',signal:AbortSignal.timeout(15000)});const response=await fetch(request);if(response.ok)await cache.put(request,response);};await Promise.allSettled(OPTIONAL.filter(path=>!path.startsWith('./assets/25d/ranks/')).map(store));const response=await cache.match(new URL('./assets/audio/LICENSES.json',self.registration.scope));if(response){const manifest=await response.json();await Promise.allSettled(Object.values(manifest.assets).filter(asset=>asset.critical).map(asset=>store('./assets/audio/'+asset.file)));}})();}

self.addEventListener('install', event => {
  // Download the complete release before allowing it to replace the active shell.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ESSENTIAL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Carry forward only previously fetched, byte-identical cosmetic assets.
    // This preserves offline outfits without downloading the whole wardrobe.
    const next=await caches.open(CACHE_NAME),description=await next.match(new URL(COSMETIC_MANIFEST,self.registration.scope));
    const wanted=cosmeticFiles(description?await description.json():null);
    for(const key of keys.filter(key=>key.startsWith('sar-shell-')&&key!==CACHE_NAME)){
      const previous=await caches.open(key),priorDescription=await previous.match(new URL(COSMETIC_MANIFEST,self.registration.scope));
      if(!priorDescription)continue;
      for(const [url,hash]of cosmeticFiles(await priorDescription.json()))if(wanted.get(url)===hash){const cached=await previous.match(url);if(cached)await next.put(url,cached);}
    }
    await Promise.all(keys.filter(key => key.startsWith('sar-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'SW_VERSION', version: APP_VERSION, cache: CACHE_NAME });
  if (event.data?.type === 'WARM_OPTIONAL_ASSETS') event.waitUntil(warmOptional().catch(error=>console.warn('Optional asset cache unavailable',error.message)));
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
  const rankThumbnail=url.pathname.startsWith(scope.pathname+'assets/25d/ranks/')&&/\/[a-z-]+\.png$/.test(url.pathname);
  const cosmetic=url.pathname.startsWith(scope.pathname+'assets/25d/cosmetics/')&&/\/[a-z0-9.-]+\.glb$/.test(url.pathname);
  if (!navigation && !shellUrls.has(canonical.href) && !audio && !rankThumbnail && !cosmetic) return;
  event.respondWith((async () => {
    // Releases are immutable: never combine fresh HTML with stale JS or CSS.
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(navigation ? new URL('./index.html', scope).href : canonical.href);
    if(cached)return cached;
    if(cosmetic){
      const description=await cache.match(new URL(COSMETIC_MANIFEST,scope));
      const expected=description&&cosmeticFiles(await description.json()).get(canonical.href);
      if(!expected)return fetch(request);
      const response=await fetch(request);
      if(response.ok){
        const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
        const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        if(actual!==expected)return new Response('Appearance update incomplete. Reconnect and retry.',{status:503});
        await cache.put(canonical.href,response.clone());
      }
      return response;
    }
    if(audio||rankThumbnail){const description=await cache.match(new URL(audio?'./assets/audio/LICENSES.json':'./assets/25d/ranks/manifest.json',scope));if(!description)return fetch(request);const manifest=await description.json();const allowed=new Set(audio?Object.values(manifest.assets).map(asset=>new URL('./assets/audio/'+asset.file,scope).href):manifest.models.map(entry=>new URL('./assets/25d/ranks/'+entry.thumbnail,scope).href));if(!allowed.has(canonical.href))return fetch(request);const response=await fetch(request);if(response.ok)await cache.put(canonical.href,response.clone());return response;}
    if(OPTIONAL.some(path=>new URL(path,scope).href===canonical.href)){const response=await fetch(request);if(response.ok)await cache.put(canonical.href,response.clone());return response;}
    return fetch(request);
  })());
});

