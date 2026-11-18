// Gündem Raporu · basit servis çalışanı: önce ağ, olmazsa önbellek. API ve veri dosyaları asla önbelleğe alınmaz.
const CACHE = 'gundem-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('.php') || u.pathname.includes('/data/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const copy = res.clone();
        if (ct.includes('text/html')) {
          // Barındırıcının güvenlik sayfası yanlışlıkla saklanmasın
          copy.text().then(t => { if (t.includes('id="favs"')) caches.open(CACHE).then(c => c.put(req, new Response(t, {headers: {'content-type': 'text/html; charset=utf-8'}}))); });
        } else if (/image|json|javascript/.test(ct)) {
          caches.open(CACHE).then(c => c.put(req, copy));
        }
      }
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('index.html')))
  );
});
