// Replaces the old offline shell on its existing scope so cached app pages stop opening.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("appshelf-gymdelay-"))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
    .then(() => self.registration.unregister()));
});
