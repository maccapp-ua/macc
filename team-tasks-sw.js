const CACHE = 'macc-team-tasks-v2';
const APP_FILES = [
  './team-tasks.html',
  './team-tasks.webmanifest',
  './logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const cached = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, cached));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
