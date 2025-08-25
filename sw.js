// CineTray Service Worker - Enhanced for Android PWA
const CACHE_NAME = 'cinetray-v1.3';
const STATIC_CACHE_URLS = [
    './',
    './index.html'
];

// Install event - cache resources with better error handling
self.addEventListener('install', (event) => {
    console.log('CineTray SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('CineTray SW: Caching app resources');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('CineTray SW: Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('CineTray SW: Installation failed', error);
            })
    );
});

// Activate event - clean old caches and take control
self.addEventListener('activate', (event) => {
    console.log('CineTray SW: Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('CineTray SW: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('CineTray SW: Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - enhanced caching strategy for Android
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if available
                if (response) {
                    return response;
                }

                // For network requests, try fetch with timeout for Android
                return fetch(event.request, {
                    // Add timeout for slower Android connections
                    signal: AbortSignal.timeout(5000)
                }).then((networkResponse) => {
                    // Cache successful responses for HTML, CSS, JS
                    if (networkResponse.ok && 
                        (event.request.destination === 'document' ||
                         event.request.destination === 'script' ||
                         event.request.destination === 'style')) {
                        
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fallback for offline or failed requests
                    if (event.request.destination === 'document') {
                        return new Response(
                            `<!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>CineTray - Offline</title>
                                <style>
                                    body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 2rem; color: #374151; }
                                    .container { max-width: 400px; margin: 0 auto; }
                                    .icon { font-size: 4rem; margin-bottom: 1rem; }
                                    h1 { color: #6366f1; margin-bottom: 1rem; }
                                    p { margin-bottom: 1rem; color: #6b7280; }
                                    .btn { background: #6366f1; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="icon">🎬</div>
                                    <h1>CineTray</h1>
                                    <p>You're offline, but your watchlist data is safe!</p>
                                    <p>Connect to the internet and refresh to sync your data.</p>
                                    <button class="btn" onclick="location.reload()">Try Again</button>
                                </div>
                            </body>
                            </html>`,
                            { 
                                headers: { 
                                    'Content-Type': 'text/html',
                                    'Cache-Control': 'no-cache'
                                } 
                            }
                        );
                    }
                    // For other resources, return a basic 404
                    return new Response('Resource not available offline', {
                        status: 404,
                        statusText: 'Not Found'
                    });
                });
            })
    );
});
