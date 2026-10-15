const C = 'yesmo-scan-v7';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/ui.js', '/js/supabase.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try { await (await caches.open(C)).addAll(SHELL); } catch { /* repris au prochain chargement */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== C).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Le réseau a 6 secondes. S'il ne répond pas, on sert la copie déjà ouverte,
// au lieu de laisser la fenêtre rouge et vide.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(C);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(e.request, { signal: ctrl.signal });
      if (r && r.ok) cache.put(e.request, r.clone()).catch(() => {});
      return r;
    } catch {
      const hit = (await cache.match(e.request)) || (e.request.mode === 'navigate' ? await cache.match('/') : null);
      if (hit) return hit;
      return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    } finally {
      clearTimeout(timer);
    }
  })());
});
