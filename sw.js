const CACHE_NAME = 'cinetray-v1.3';
const STATIC_CACHE_URLS = [
  '/CineTray/',
  '/CineTray/index.html',
  '/CineTray/manifest.json',
  '/CineTray/sw.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('cinetray-') && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event with network-first strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response
        const responseToCache = response.clone();
        // Cache the response if it's valid
        if (response.status === 200) {
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => {
        // If network fails, try to get from cache
        return caches.match(event.request)
          .then(response => response || caches.match('/CineTray/index.html'));
      })
  );
});
