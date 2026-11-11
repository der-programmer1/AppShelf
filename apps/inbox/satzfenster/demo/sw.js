const prefix = "appshelf-satzfenster-";
const cacheName = prefix + "v1";
const scope = self.registration.scope;
const shell = new URL("index.html", scope).href;
const assets = new Set([
  "index.html", "style.css", "app.js", "model.js", "manifest.webmanifest",
  "icon-180.png", "icon-192.png", "icon-512.png",
].map((file) => new URL(file, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll([...assets].map((url) => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isEntry = event.request.mode === "navigate" && (url.origin + url.pathname === scope || url.origin + url.pathname === shell);
  const key = isEntry ? shell : url.href;
  if (!assets.has(key)) return;
  event.respondWith(caches.open(cacheName)
    .then(async (cache) => await cache.match(key) ?? fetch(event.request)));
});
