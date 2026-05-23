// Service worker for Martha Episodes mobile SPA.
// Caches: app shell (HTML + CSS + JS) and the compact episode JSON.
// Strategy: cache-first for static assets, network-first with cache fallback for data.

// CACHE_VERSION is rewritten at request time by src/routes/mobile-sw.tsx to
// `martha-<hash>` where <hash> is a SHA-1 over the shell file contents
// (sw.js + style.css + app.js). The literal below is the dev/fallback value
// used only if someone fetches this file directly off disk.
const CACHE_VERSION = '__CACHE_VERSION__';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

const SHELL_URLS = [
  '/m/',
  '/static/m/style.css',
  '/static/m/app.js',
  '/static/favicon.svg',
];

const DATA_URL = '/api/episodes/compact';

// ── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('martha-') && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route strategy ─────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Episode data: network-first, fall back to cache
  if (url.pathname === DATA_URL) {
    e.respondWith(networkFirst(e.request, DATA_CACHE));
    return;
  }

  // Static assets + shell: cache-first, fall back to network
  if (
    url.pathname.startsWith('/static/') ||
    url.pathname === '/m/' ||
    url.pathname.startsWith('/m/')
  ) {
    e.respondWith(cacheFirst(e.request, SHELL_CACHE));
    return;
  }

  // Episode images: cache-first (they're immutable from imgix)
  if (url.pathname.startsWith('/static/episode-images/')) {
    e.respondWith(cacheFirst(e.request, `${CACHE_VERSION}-images`));
    return;
  }

  // Everything else: network pass-through
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}
