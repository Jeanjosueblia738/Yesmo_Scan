const C = 'yesmo-scan-v8';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/ui.js', '/js/supabase.js', '/vendor/supabase.js'];

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

// On demande l'adresse, pas la requête de navigation : celle-ci peut rester
// bloquée et laisser la fenêtre blanche.
function network(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  return fetch(url, { signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin' }).finally(() => clearTimeout(timer));
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const path = url.origin + (url.pathname || '/');
    if (url.searchParams.has('reset')) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const cache = await caches.open(C);
    try {
      const r = await network(e.request.url);
      if (r && r.ok && r.type === 'basic' && !url.searchParams.has('reset')) cache.put(path, r.clone()).catch(() => {});
      return r;
    } catch {
      const hit = (await cache.match(path)) || (e.request.mode === 'navigate' ? await cache.match(url.origin + '/') : undefined);
      if (hit) return hit;
      return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
