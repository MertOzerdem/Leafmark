const cacheName = 'leafmark-shell-__LEAFMARK_CACHE_VERSION__';
const appRoot = new URL('/Leafmark/', self.location.origin);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('precache-manifest.json', appRoot));
    if (!response.ok) throw new Error('Could not load the Leafmark offline file list.');
    const manifest = await response.json();
    const cache = await caches.open(cacheName);
    await cache.addAll(manifest.urls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const oldCaches = (await caches.keys()).filter(
      (name) => name.startsWith('leafmark-shell-') && name !== cacheName,
    );
    await Promise.all(oldCaches.map((name) => caches.delete(name)));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(appRoot.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      if (request.mode === 'navigate') return caches.match(new URL('index.html', appRoot));
      return new Response('', { status: 503, statusText: 'Leafmark is offline and this page has not been saved yet.' });
    }
  })());
});
