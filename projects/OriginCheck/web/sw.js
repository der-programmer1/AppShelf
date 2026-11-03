const CACHE='origincheck-shell-0.1.0';
const FILES=['./','./index.html','./app.js','./style.css','./media-core.js','./contracts.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
const ALLOWED=new Set(FILES.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('origincheck-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!ALLOWED.has(event.request.url))return;
  // Versioned static shell: serve installed bytes without waiting on an unavailable network.
  // API requests and media are outside ALLOWED and never enter this cache.
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const installed=await cache.match(event.request);if(installed)return installed;
    const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
  }));
});
