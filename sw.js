const CACHE = 'reading-garden-20261007-collapsed-menus-v54';
const ASSETS = ['./', './index.html', './nih-reporter.js?v=20261007-54', './funding-feed.js?v=20261007-54', './data/funding-feed.json', './book-lookup.js?v=20261007-54', './sync-core.js?v=20261007-54', './cloud-sync.js?v=20261007-54', './paper-feed.js?v=20261007-54', './pubmed-feed.js?v=20261007-54', './journal-lookup.js?v=20261007-54', './feed-preferences.js?v=20261007-54', './people-core.js?v=20261007-54', './people.js?v=20261007-54', './404.html', './manifest.webmanifest',
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
      .then(r => { if (!r.ok) throw new Error('Page unavailable'); const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', './nih-reporter.js?v=20261007-54', './funding-feed.js?v=20261007-54', './data/funding-feed.json', copy)); return r; })
      .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./'))));
    return;
  }
  if (new URL(req.url).pathname.endsWith('/data/funding-feed.json')) {
    e.respondWith(fetch(req, {cache: 'no-store'}).then(r => {
      if (!r.ok) throw new Error('Funding feed unavailable');
      const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));return r;
    }).catch(()=>caches.match(req)));return;
  }
  // Static assets are cache-first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});










