const CACHE_NAME = 'cinetray-v1.7';
const BASE_PATH = '/CineTray/';
const STATIC_CACHE_URLS = [
    BASE_PATH,
    `${BASE_PATH}index.html`,
    `${BASE_PATH}manifest.json`,
    `${BASE_PATH}sw.js`,
    `${BASE_PATH}app.js`,
    `${BASE_PATH}favicon.ico`,
    `${BASE_PATH}icon-192.png`,
    `${BASE_PATH}icon-512.png`,
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app shell');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name.startsWith('cinetray-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event with network-first strategy
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and cross-origin requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Handle navigation requests
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(`${BASE_PATH}index.html`))
        );
        return;
    }

        // For other requests, try network first, then cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(response => response || caches.match(`${BASE_PATH}index.html`));
            })
    );
});
