// Kill switch — wipes all caches, unregisters this SW, force-reloads all tabs
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((c) => c.navigate(c.url));
      })
      .then(() => self.registration.unregister()),
  );
});
