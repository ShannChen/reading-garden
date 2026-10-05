const CACHE = 'reading-garden-20261005-starred-people-no-checklist-v22';
const ASSETS = ['./', './index.html', './sync-core.js', './cloud-sync.js', './paper-feed.js', './feed-preferences.js', './people-core.js', './people.js', './404.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-192.png',
  './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('reading-garden-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Cache only the public SDK, never Supabase auth or private API responses.
  if (req.url === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
      return r;
    })));
    return;
  }
  if (new URL(req.url).origin !== location.origin) return;
  // Pages are network-first so a redeploy lands immediately; cache is the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, {cache: 'no-cache'})
      .then(r => { if (!r.ok) throw new Error('Page unavailable'); const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./'))));
    return;
  }
  // Static assets are cache-first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});


