// Service worker: muestra las notificaciones (recordatorio del domingo), abre la app al tocarlas y deja que la app
// abra sin cobertura. Solo se guarda lo propio de la app (mismo origen, GET): la red va siempre primero, así nunca
// se queda una versión vieja si hay conexión; la caché solo se usa cuando la red falla. Las librerías de vendor/
// (versionadas en el nombre) van de caché primero. Supabase y demás servidores externos no pasan por aquí.
const CACHE = 'enxarxa-app-v2';
const PRECACHE = ['./', 'index.html', 'config.js', 'i18n-ca.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'apple-touch-icon.png', 'vendor/supabase-2.45.4.js', 'legal.css', 'legal.js', 'condiciones.html', 'privacidad.html', 'aviso-legal.html', 'eliminar-cuenta.html', 'ayuda.html'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('enxarxa-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
let slowAt = 0;
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js') || url.pathname.includes('/app/')) return;
  const net = () => fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  });
  const hit = () => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  if (url.pathname.includes('/vendor/')) { e.respondWith(hit().then((r) => r || net())); return; }
  // Con cobertura muy débil la red puede tardar muchísimo en contestar: a los 4 s sale de la caché lo que haya (la
  // petición sigue y renueva la caché para la próxima vez). Después de eso, durante 30 s, la caché va primero para
  // que el resto de ficheros de la página no espere otros 4 s cada uno.
  const fromNet = net();
  const wait = Date.now() - slowAt < 30e3 ? 0 : 4000;
  const slow = new Promise((ok) => setTimeout(ok, wait)).then(hit).then((r) => { if (r && wait) slowAt = Date.now(); return r || fromNet; });
  e.waitUntil(fromNet.catch(() => {}));
  e.respondWith(Promise.race([fromNet.catch(hit), slow]).then((r) => r || Response.error(), () => hit().then((r) => r || Response.error())));
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
    // Con la app ya abierta, además de traerla al frente hay que llevarla a la vista del aviso (?vista=…, &avisos=1).
    for (const w of wins) if (w.url.startsWith(self.registration.scope) && 'focus' in w)
      return w.focus().then((c) => (c && 'navigate' in c ? c.navigate(url).catch(() => c) : c));
    return self.clients.openWindow(url);
  }));
});
