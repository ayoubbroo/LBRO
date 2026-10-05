/* TRAFFIC MAROC service worker.
   - Precaches the app shell; navigations fall back to the cached shell when offline.
   - Static assets: stale-while-revalidate.  Map tiles: cache-first with a size cap.
   - API: only public, non-sensitive GETs are cached for offline reading (incidents, cities).
     Live traffic, auth, notifications, favorites, admin and ALL non-GET requests are never cached. */
const VERSION = 'v3'
const SHELL = 'tm-shell-' + VERSION, TILES = 'tm-tiles-' + VERSION, DATA = 'tm-data-' + VERSION
const CACHEABLE_API = [/^\/api\/incidents(\?|$)/, /^\/api\/cities$/]
const MAX_TILES = 400

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tm-') && !k.endsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting() })

// Background Sync: wake the page so it flushes the offline report queue (the queue lives in page storage).
self.addEventListener('sync', e => {
  if (e.tag === 'tm-sync') e.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'tm-sync' }))))
})

async function trim(cache, max) { const ks = await cache.keys(); if (ks.length > max) await Promise.all(ks.slice(0, ks.length - max).map(k => cache.delete(k))) }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET') return
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit
      try { const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); trim(c, MAX_TILES) } return r } catch { return new Response('', { status: 504 }) }
    }))
    return
  }
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) {
    if (!CACHEABLE_API.some(re => re.test(url.pathname + url.search)) || req.headers.get('authorization')) return
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(DATA).then(c => c.put(req, copy)) } return r })
      .catch(() => caches.match(req).then(r => r || new Response(JSON.stringify({ error: 'network_error' }), { status: 503, headers: { 'content-type': 'application/json' } }))))
    return
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return r }).catch(() => caches.match('/')))
    return
  }
  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(req)
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r }).catch(() => hit)
    return hit || net
  }))
})
