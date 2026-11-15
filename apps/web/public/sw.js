// VoteMax service worker (SYSTEM_ARCHITECTURE §web): static assets ONLY.
// Pages, API responses, ballot content, and session tokens are never cached -
// navigations and all /api or cross-origin traffic go straight to network.
const CACHE = 'votemax-static-v1';
const PRECACHE = ['/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only immutable build assets and the app icon are cacheable.
  const cacheable = url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname);
  if (!cacheable) return; // everything else: network only, never cached

  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return res;
    })),
  );
});
