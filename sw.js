'use strict';
const SHELL = 'shell-1';
const SHELL_FILES = ['./', 'index.html', 'loader.js', 'manifest.webmanifest', 'icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith('app/')) {
    e.respondWith((async () => {
      const keys = (await caches.keys()).filter(k => k.startsWith('app-'));
      for (const k of keys) {
        const r = await (await caches.open(k)).match(scope.pathname + rel);
        if (r) return r;
      }
      return Response.redirect(scope.pathname, 302);
    })());
    return;
  }
  if (rel === 'v.json' || rel.startsWith('b/')) return;
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('offline', { status: 503 });
  })());
});
