/* Version the cache when publishing changes. All paths are relative for project GitHub Pages. */
const CACHE = "logic-cam-v1.0.0";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/app.js",
  "./js/camera.js",
  "./js/vision.js",
  "./js/visionWorker.js",
  "./js/logicEngine.js",
  "./js/aiCoach.js",
  "./assets/icon.svg",
  "./assets/print-template.svg",
  "./manifest.webmanifest",
  "./vendor/opencv.js",
  "./README.md",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("logic-cam-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  // Cache only packaged assets. Camera frames and circuit edits never become requests.
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
