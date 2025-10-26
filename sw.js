// Basic service worker with precaching and runtime strategies
const CACHE_NAME = 'habit-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/index/',
  '/login.html',
  '/login/',
  '/register.html',
  '/register/',
  '/styles.css',
  '/favicon.svg',
  '/index.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

function isSameOrigin(request) {
  try { return new URL(request.url).origin === self.location.origin; } catch { return false; }
}

function isAsset(request) {
  const url = new URL(request.url);
  return ['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp'].some(ext => url.pathname.endsWith(ext));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Navigation requests: network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return res;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('<!doctype html><title>Offline</title><h1>Offline</h1><p>You appear to be offline.</p>', { headers: { 'Content-Type': 'text/html' } });
      })
    );
    return;
  }

  // Same-origin static assets: cache-first, update in background
  if (isSameOrigin(request) && isAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkPromise = fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Fonts: stale-while-revalidate
  if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkPromise = fetch(request).then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone())).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Default: pass-through
});