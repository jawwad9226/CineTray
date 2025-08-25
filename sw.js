const CACHE_NAME = 'cinetray-v1.4';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Cache with network fallback
const fromNetwork = (request, cacheResponse) => {
  return fetch(request)
    .then(response => {
      const responseToCache = response.clone();
      if (response.status === 200) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
      }
      return response;
    })
    .catch(() => cacheResponse || new Response('Offline', { status: 503 }));
};

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

// Fetch event with cache-first strategy for static assets, network-first for others
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and cross-origin requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Handle static assets
  if (STATIC_CACHE_URLS.some(url => event.request.url.includes(url))) {
    event.respondWith(
      caches.match(event.request).then(cacheResponse => {
        return cacheResponse || fromNetwork(event.request);
      })
    );
  } else {
    // For other resources, try network first, then cache
    event.respondWith(
      fromNetwork(
        event.request, 
        caches.match(event.request).then(response => response || caches.match('/index.html'))
      )
    );
  }
});
