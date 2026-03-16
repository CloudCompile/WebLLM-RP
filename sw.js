// TavernLocal Service Worker
// Caches the app shell (HTML) so the UI loads offline.
// Model weights are handled by WebLLM's own Cache API internally.

const CACHE_NAME = 'tavernlocal-v1';

// Files to cache on install (app shell only — models are cached by WebLLM itself)
const APP_SHELL = [
  './index.html',
  './manifest.json'
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app shell, network-first for CDN/external ─────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // App shell: serve from cache, fall back to network
  if (APP_SHELL.some(path => url.pathname.endsWith(path.replace('./', '/')))
      || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          // Update cache with fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CDN resources (WebLLM ESM, Google Fonts): network-first with cache fallback
  // WebLLM handles its OWN model weight caching internally via Cache API
  // We just need to not interfere with those requests
  if (url.hostname.includes('esm.run') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('huggingface.co')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Message handler: allow app to send cache-bust signal ─────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});