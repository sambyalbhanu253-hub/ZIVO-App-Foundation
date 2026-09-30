const CACHE_NAME = 'zivo-shell-v8';
const APP_SHELL = [
  '/manifest.json',
  '/icons/zivo-icon-192.svg',
  '/icons/zivo-icon-512.svg',
  '/icons/zivo-icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('zivo-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // OAuth callbacks and app navigation must reach the server, not an old cached
  // HTML shell. Otherwise a redirect can reopen an obsolete bundle as a blank page.
  if (event.request.mode === 'navigate' || event.request.destination === 'document' ||
      url.searchParams.has('code') || url.searchParams.has('state') ||
      url.searchParams.has('magic_token') || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') || url.pathname.startsWith('/oauth/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && ['image', 'manifest'].includes(event.request.destination)) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }),
  );
});
