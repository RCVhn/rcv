/* sw.js — RCV Taller PWA (anti-loop diagnóstico) */
const APP_VERSION   = 'v1.0.1';
const CACHE_STATIC  = `rcv-static-${APP_VERSION}`;
const CACHE_PAGES   = `rcv-pages-${APP_VERSION}`;
const CACHE_RUNTIME = `rcv-runtime-${APP_VERSION}`;

// 🔒 Archivos críticos
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './crear-orden.html',
  './listado-ordenes.html',
  './usuarios-admin.html',
  './clientes.html',
  './vehiculos.html',
  './cotizaciones.html',
  './facturacion.html',
  './inventario.html',
  './topbar.html',
  './css/estilos.css',
  './js/topbar.js',
  './js/common.js',
  './js/usuarios-admin.js',
  './img/logo.png',
  './img/icons/icon-192.png',
  './img/icons/icon-512.png'
];

// Fallback offline
const OFFLINE_FALLBACK_HTML = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><style>body{font-family:system-ui,Arial,sans-serif;background:#0b1324;color:#e7eefc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}.card{max-width:520px;background:#101b33;border:1px solid #1b2a4a;border-radius:14px;box-shadow:0 8px 28px rgba(11,19,36,0.4);padding:18px}h1{margin:0 0 8px}p{margin:6px 0 0;color:#93a0b4}a{color:#58b6ff}</style><div class="card"><h1>Estás sin conexión</h1><p>No pudimos cargar esta página desde la red. Inténtalo de nuevo más tarde.</p><p>Si ya instalaste la app, muchas secciones deberían seguir funcionando.</p></div></html>`;

// Utilidades
const isHTMLNavigation = (req) => req.mode==='navigate' || (req.headers && req.headers.get('accept')?.includes('text/html'));
const isAPI = (url) => /\/api(\/|$)/i.test(url.pathname);
const isStaticAsset = (url) =>
  /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|map)$/i.test(url.pathname) || url.pathname.endsWith('/topbar.html');
const IGNORED_QUERY_KEYS = ['v','ver','version','t','ts','cache','_','cb'];

function normalizedRequest(request){
  try{
    const url=new URL(request.url);
    const params=new URLSearchParams(url.search);
    let changed=false;
    IGNORED_QUERY_KEYS.forEach(k=>{ if(params.has(k)){ params.delete(k); changed=true; }});
    if(changed){
      url.search=params.toString();
      return new Request(url.toString(), { method:request.method, headers:request.headers, mode:request.mode, credentials:request.credentials, redirect:request.redirect, referrer:request.referrer });
    }
  }catch{}
  return request;
}

// Install: precache (sin activar inmediata)
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    const results = await Promise.allSettled(
      PRECACHE_ASSETS.map(async (path) => {
        const url = new URL(path, self.location);
        try {
          const res = await fetch(url.toString(), { cache: 'reload' });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          await cache.put(url.toString(), res.clone());
          return { ok: true, url: url.pathname };
        } catch (err) {
          return { ok: false, url: url.pathname, err: String(err) };
        }
      })
    );
    const failed = results.filter(r => r.value && !r.value.ok).map(r => r.value);
    if (failed.length) console.warn('[SW] Precaching omitió algunos archivos:', failed);
    // ❌ NO skipWaiting (diagnóstico anti-loop)
  })());
});

// Activate: limpiar caches viejos (sin claim inmediato)
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) { try{ await self.registration.navigationPreload.enable(); }catch{} }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![CACHE_STATIC, CACHE_PAGES, CACHE_RUNTIME].includes(k)).map(k => caches.delete(k)));
    // ❌ NO clients.claim (diagnóstico anti-loop)
  })());
});

// Mensajes desde la app: ignorar activaciones automáticas (diagnóstico)
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING' || type === 'CLAIM') {
    // Ignorado en diagnóstico para garantizar cero activación automática
    // console.debug('[SW] Mensaje ignorado en diagnóstico:', type);
  }
});

// Fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const nReq = normalizedRequest(req);

  // 1) HTML: network-first + preload + fallback
  if (isHTMLNavigation(req)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const fresh = preload || await fetch(req);
        const cache = await caches.open(CACHE_PAGES);
        cache.put(nReq, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(nReq);
        if (cached) return cached;
        return new Response(OFFLINE_FALLBACK_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) API: network-first + fallback cache
  if (isAPI(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.type !== 'opaque') {
          const cache = await caches.open(CACHE_RUNTIME);
          cache.put(nReq, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(nReq);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Sin conexión' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
      }
    })());
    return;
  }

  // 3) Estáticos: Stale-While-Revalidate
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIC);
      const cached = await cache.match(nReq);
      const netPromise = fetch(req).then((res)=>{ if(res && res.ok) cache.put(nReq, res.clone()); return res; }).catch(()=>null);
      return cached || netPromise || fetch(req);
    })());
    return;
  }

  // 4) Por defecto: pasa
});
