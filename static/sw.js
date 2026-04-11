const CACHE = 'focusflow-v1';
const SHELL = ['/', '/tasks', '/history', '/settings'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API requests: network only
  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({error: 'offline'}),
          {status: 503, headers: {'Content-Type': 'application/json'}})
      )
    );
    return;
  }
  // Shell: cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
