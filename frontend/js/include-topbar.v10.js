// frontend/js/include-topbar.v10.js
(function () {
  // --- util: estado de sesión ---
  function getSession() {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    let user = null;
    try { user = JSON.parse(localStorage.getItem('usuarioActual') || 'null'); } catch {}
    return { token, user, loggedIn: !!(token && user) };
  }

  // --- rutas candidatas para cargar el topbar parcial ---
  function candidatePaths() {
    const here = location.href;
    const raw = [
      'partials/topbar.html',
      '../partials/topbar.html',
      '../../partials/topbar.html',
      'frontend/partials/topbar.html',
      '../frontend/partials/topbar.html'
    ];
    return raw.map(p => {
      const u = new URL(p, here);
      u.searchParams.set('v', '10'); // cache-bust del parcial
      return u.href;
    });
  }

  async function fetchFirstOk(urls) {
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-cache' });
        if (res.ok) return await res.text();
        console.warn('[topbar] intento fallido:', u, res.status);
      } catch (e) { console.warn('[topbar] error al intentar:', u, e); }
    }
    throw new Error('No se encontró partials/topbar.html en rutas candidatas.');
  }

  function markActiveLink() {
    try {
      const path = (location.pathname || '').toLowerCase();
      const hash = (location.hash || '').toLowerCase();
      document.querySelectorAll('header.topbar nav a[data-page]')
        .forEach(a => a.classList.remove('active'));
      if (path.endsWith('/servicios.html')) {
        document.querySelector('a[data-page="servicios"]')?.classList.add('active');
      } else if (hash.includes('consulta')) {
        document.querySelector('a[data-page="consulta"]')?.classList.add('active');
      } else if (hash.includes('contacto')) {
        document.querySelector('a[data-page="contacto"]')?.classList.add('active');
      } else if (path.endsWith('/index.html') || /\/$/.test(path)) {
        document.querySelector('a[data-page="inicio"]')?.classList.add('active');
      }
    } catch (e) { console.warn('[topbar] no se pudo marcar el link activo:', e); }
  }

  function applyWhatsAppCTA() {
    const cta = document.getElementById('ctaWhatsApp');
    if (cta) {
      const href = window.__waHrefCTA || window.__waHref;
      if (href) cta.href = href;
    }
  }

  // ===== Drawer =====
  function getDrawerEls() {
    return {
      drawer:   document.getElementById('drawer'),
      backdrop: document.getElementById('drawerBackdrop')
    };
  }

  function forceStyle(el, prop, val) {
    if (el) el.style.setProperty(prop, val, 'important');
  }

  function ensureDrawer() {
    let { drawer, backdrop } = getDrawerEls();
    if (!drawer || !backdrop) {
      document.body.insertAdjacentHTML('beforeend', `
<div id="drawerBackdrop"></div>
<aside id="drawer" aria-hidden="true" aria-labelledby="drawerTitle" role="dialog">
  <div class="drawer-header">
    <div id="drawerTitle" class="drawer-title">Área interna</div>
    <button class="btn btn-ghost" id="btnCloseDrawer" aria-label="Cerrar">✕</button>
  </div>
  <div class="drawer-body">
    <div class="drawer-note"><strong>Espacio único para empleados</strong><br/>Acceso a panel, kardex, órdenes, facturación y más.</div>
    <p class="muted" style="margin:0">Si eres parte del equipo, inicia sesión para continuar.</p>
    <div id="drawerUserInfo" class="muted" style="margin-top:6px"></div>
  </div>
  <div class="drawer-actions" id="drawerActions"></div>
</aside>`);
      ({ drawer, backdrop } = getDrawerEls());
    }

    // mover al final del body para z-index natural máximo
    try { document.body.appendChild(backdrop); } catch {}
    try { document.body.appendChild(drawer); } catch {}

    // estilos base (forzados)
    if (backdrop) {
      forceStyle(backdrop,'position','fixed');
      forceStyle(backdrop,'inset','0');
      forceStyle(backdrop,'background','rgba(0,0,0,.35)');
      forceStyle(backdrop,'opacity','0');
      forceStyle(backdrop,'pointer-events','none');
      forceStyle(backdrop,'transition','opacity .2s ease');
      forceStyle(backdrop,'z-index','2147483646');
    }
    if (drawer) {
      forceStyle(drawer,'position','fixed');
      forceStyle(drawer,'top','0'); forceStyle(drawer,'right','0');
      forceStyle(drawer,'height','100%'); forceStyle(drawer,'width','min(92vw,360px)');
      forceStyle(drawer,'background','#fff');
      forceStyle(drawer,'box-shadow','-8px 0 24px rgba(15,23,42,.18)');
      forceStyle(drawer,'transform','translateX(100%)');
      forceStyle(drawer,'transition','transform .25s ease');
      forceStyle(drawer,'z-index','2147483647');
      forceStyle(drawer,'display','flex'); forceStyle(drawer,'flex-direction','column');

      const header  = drawer.querySelector('.drawer-header');
      const actions = drawer.querySelector('.drawer-actions');
      const note    = drawer.querySelector('.drawer-note');
      const body    = drawer.querySelector('.drawer-body');
      const closeBtn= drawer.querySelector('#btnCloseDrawer');

      if (header) { forceStyle(header,'display','flex'); forceStyle(header,'align-items','center'); forceStyle(header,'justify-content','space-between'); forceStyle(header,'padding','14px 16px'); forceStyle(header,'border-bottom','1px solid #f1f5f9'); }
      if (actions){ forceStyle(actions,'margin-top','auto'); forceStyle(actions,'padding','16px'); forceStyle(actions,'border-top','1px solid #f1f5f9'); }
      if (note)   { forceStyle(note,'color','#6b7280'); forceStyle(note,'background','#f8fafc'); forceStyle(note,'padding','12px'); forceStyle(note,'border-radius','12px'); forceStyle(note,'border','1px dashed #e5e7eb'); }
      if (body)   { forceStyle(body,'padding','16px'); forceStyle(body,'display','flex'); forceStyle(body,'flex-direction','column'); forceStyle(body,'gap','12px'); }
      if (closeBtn){ forceStyle(closeBtn,'background','#fff'); forceStyle(closeBtn,'border','1px solid #e5e7eb'); forceStyle(closeBtn,'border-radius','12px'); forceStyle(closeBtn,'padding','8px 12px'); forceStyle(closeBtn,'cursor','pointer'); }
    }
  }

  // botón dinámico: login / logout
  function renderAuthAction() {
    ensureDrawer();
    const { user, loggedIn } = getSession();
    const actions = document.getElementById('drawerActions');
    const info    = document.getElementById('drawerUserInfo');
    if (!actions) return;

    if (loggedIn) {
      const nombre  = user?.nombre || user?.usuario || 'Usuario';
      actions.innerHTML = `<a href="#" class="btn btn-primary" data-logout style="display:inline-block;border:none;border-radius:12px;padding:10px 14px;cursor:pointer;background:#245C8D;color:#fff;text-decoration:none">Cerrar sesión</a>`;
      if (info) info.textContent = `Sesión activa: ${nombre}`;
    } else {
      actions.innerHTML = `<a class="btn btn-primary" href="login.html" style="display:inline-block;border:none;border-radius:12px;padding:10px 14px;cursor:pointer;background:#245C8D;color:#fff;text-decoration:none">Iniciar sesión</a>`;
      if (info) info.textContent = '';
    }
  }

  function openDrawer(){
    ensureDrawer();
    renderAuthAction(); // actualizar justo antes de abrir (por si cambió la sesión)
    const { drawer, backdrop } = getDrawerEls();
    if (!drawer || !backdrop) return;
    forceStyle(drawer,'transform','none');
    forceStyle(backdrop,'opacity','1');
    forceStyle(backdrop,'pointer-events','auto');
    drawer.setAttribute('aria-hidden','false');
    document.documentElement.style.setProperty('overflow','hidden','important');
    document.body.style.setProperty('overflow','hidden','important');
  }

  function closeDrawer(){
    const { drawer, backdrop } = getDrawerEls();
    if (!drawer || !backdrop) return;
    forceStyle(drawer,'transform','translateX(100%)');
    forceStyle(backdrop,'opacity','0');
    forceStyle(backdrop,'pointer-events','none');
    drawer.setAttribute('aria-hidden','true');
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
  }

  // eventos globales
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#btnHamb') || t.closest('.hamb') || t.closest('[data-drawer-open]')) {
      e.preventDefault(); openDrawer();
    }
    if (t.closest('#btnCloseDrawer') || t.closest('#drawerBackdrop') || t.closest('[data-drawer-close]')) {
      e.preventDefault(); closeDrawer();
    }
  }, true);

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // si la sesión cambia en otra pestaña, re-render
  window.addEventListener('storage', (e) => {
    if (['token','authToken','usuarioActual'].includes(e.key)) {
      renderAuthAction();
    }
  });

  // limpieza duplicados, inyección del topbar
  function removeDuplicates(keepHeader) {
    const headers = Array.from(document.querySelectorAll('header.topbar'));
    headers.forEach(h => { if (h !== keepHeader) h.remove(); });
    const drawers = Array.from(document.querySelectorAll('#drawer'));
    const backs   = Array.from(document.querySelectorAll('#drawerBackdrop'));
    drawers.slice(1).forEach(n => n.remove());
    backs.slice(1).forEach(n => n.remove());
  }

  async function injectTopbar() {
    let anchor = document.querySelector('header.topbar') || document.getElementById('topbarSlot');
    let created = false;
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'topbarSlotAuto';
      document.body.insertBefore(anchor, document.body.firstChild);
      created = true;
    }

    let html = '';
    try { html = await fetchFirstOk(candidatePaths()); }
    catch (e) {
      console.error('[topbar] No se pudo cargar parcial. Continúo sólo con drawer.', e);
      ensureDrawer(); renderAuthAction();
      return;
    }

    anchor.insertAdjacentHTML('beforebegin', html);
    const newHeader = document.querySelector('header.topbar');
    if (created || anchor.matches('header.topbar') || anchor.id === 'topbarSlot') {
      try { anchor.remove(); } catch {}
    }
    if (newHeader) removeDuplicates(newHeader);

    ensureDrawer();
    renderAuthAction();
    markActiveLink();
    applyWhatsAppCTA();

    setTimeout(() => { ensureDrawer(); renderAuthAction(); }, 0);
  }

  function boot() {
    ensureDrawer();
    renderAuthAction();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectTopbar);
    } else {
      injectTopbar();
    }
  }
  boot();

  // helpers consola
  window.__openDrawer  = openDrawer;
  window.__closeDrawer = closeDrawer;
})();
