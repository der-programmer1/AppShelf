// Generated from all shell assets. No user data or selected media are cached here.
const CACHE="appshelf-weiter-99d797687a2478b4", PREFIX="appshelf-weiter-", ASSETS=["./", "./app.js", "./audio.js", "./icon-192.png", "./icon-512.png", "./icon.svg", "./index.html", "./manifest.webmanifest", "./model.js", "./storage.js", "./style.css"];
const ALLOWED=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url), scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const relative='./'+url.pathname.slice(scope.pathname.length);
  // Strip incoming shared text only for navigation, never cache a user's query.
  if(event.request.mode==='navigate'&&(relative==='./'||relative==='./index.html'))url.search='';
  if(!ALLOWED.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
