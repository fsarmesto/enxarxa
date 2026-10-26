// Service worker: muestra las notificaciones (recordatorio del domingo), abre la app al tocarlas y deja que la app
// abra sin cobertura. Solo se guarda lo propio de la app (mismo origen, GET): la red va siempre primero, así nunca
// se queda una versión vieja si hay conexión; la caché solo se usa cuando la red falla. Las librerías de vendor/
// (versionadas en el nombre) van de caché primero. Supabase y demás servidores externos no pasan por aquí.
const CACHE = 'enxarxa-app-v1';
const PRECACHE = ['./', 'index.html', 'config.js', 'i18n-ca.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'apple-touch-icon.png', 'vendor/supabase-2.45.4.js', 'legal.css', 'legal.js', 'condiciones.html', 'privacidad.html', 'aviso-legal.html', 'eliminar-cuenta.html'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('enxarxa-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js') || url.pathname.includes('/app/')) return;
  const vendor = url.pathname.includes('/vendor/');
  const net = () => fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  const hit = () => caches.match(req, { ignoreSearch: true });
  e.respondWith(vendor
    ? hit().then((r) => r || net())
    : net().catch(() => hit().then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Vòlei EnXarxa', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'recordatorio', renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus();
    return self.clients.openWindow(url);
  }));
});
