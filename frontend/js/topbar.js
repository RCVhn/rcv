// js/topbar.js
(function () {
  async function loadTopbar() {
    // A) Garantiza contenedor
    let container = document.getElementById('topbarContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'topbarContainer';
      (document.body || document.documentElement).insertAdjacentElement('afterbegin', container);
    }

    // Limpia wiring previo
    if (window.__topbar_off) {
      try { window.__topbar_off(); } catch {}
      window.__topbar_off = null;
    }

    // B) Carga HTML del topbar
    let html = '';
    try {
      const res = await fetch('topbar.html', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo cargar topbar.html');
      html = await res.text();
    } catch (e) {
      console.error('[topbar] Error cargando topbar.html:', e);
      return;
    }
    container.innerHTML = html;

    // C) Usuario actual
    let usuario = {};
    try { usuario = JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch {}
    const nombre = usuario.nombre || usuario.usuario || '—';
    const rol = (usuario.rol || '—');

    const $ = (s, root = container) => root.querySelector(s);
    $('#nombreUsuarioTopbar') && ($('#nombreUsuarioTopbar').textContent = nombre);
    $('#rolUsuarioTopbar') && ($('#rolUsuarioTopbar').textContent = rol);

    // --- NUEVO: modo admin (por rol o flag adminMode) ---
    const rolLc = String(rol).toLowerCase();
    const permisos = Array.isArray(usuario.permisos) ? usuario.permisos.map(p => String(p).toLowerCase()) : null;
    const esAdminPorRol = rolLc.includes('admin'); // "administrador", "admin", "superadmin"
    const esAdminPorPermiso = (permisos || []).some(p => ['admin','superadmin','panel_admin','dashboard_admin'].includes(p));
    const adminModeFlag = localStorage.getItem('adminMode') === 'true';
    const isAdmin = esAdminPorRol || esAdminPorPermiso || adminModeFlag;

    // D) Filtrar links por permisos (fail-open si no hay permisos)
    container.querySelectorAll('[data-page-key]').forEach(a => {
      const key = String(a.getAttribute('data-page-key') || '').toLowerCase();
      const allowed = isAdmin || permisos === null || permisos.includes(`page:${key}`);
      a.style.display = allowed ? '' : 'none';
    });

    // --- NUEVO: mostrar enlaces solo-admin cuando adminMode/isAdmin ---
    container.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    // E) Marcar enlace activo
    (function markActiveNav(){
      try {
        const nav = $('#topnav');
        if (!nav) return;

        const here = location.pathname.split('/').pop() || 'index.html';
        const links = nav.querySelectorAll('a[href]');
        let matched = false;

        function baseName(href) {
          try { return new URL(href, location.href).pathname.split('/').pop(); }
          catch { return (href || '').split('#')[0].split('?')[0].split('/').pop(); }
        }

        links.forEach(a => {
          const name = baseName(a.getAttribute('href') || a.href);
          if (name === here) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
            matched = true;
          } else {
            a.classList.remove('active');
            a.removeAttribute('aria-current');
          }
        });

        if (!matched) {
          const pageKey = document.body.getAttribute('data-page-key');
          if (pageKey) {
            const alt = nav.querySelector(`a[data-page-key="${pageKey}"]`);
            if (alt) {
              alt.classList.add('active');
              alt.setAttribute('aria-current', 'page');
            }
          }
        }
      } catch (err) {
        console.error('[Topbar] Error marcando enlace activo:', err);
      }
    })();

    // F) Hamburguesa (responsive)
    const burger = $('#tbBurger');
    const nav = $('#topnav');
    if (burger && nav) {
      const MQ_PX = 860;
      const mql = window.matchMedia(`(max-width: ${MQ_PX}px)`);
      const isMobile = () => mql.matches;

      let backdrop = null;
      const ensureBackdrop = () => {
        if (backdrop) return backdrop;
        backdrop = document.createElement('div');
        backdrop.id = 'topnavBackdrop';
        Object.assign(backdrop.style, { position:'fixed', inset:'0', background:'transparent', zIndex:'9' });
        backdrop.addEventListener('click', () => closeNav());
        return backdrop;
      };
      const addBackdrop = () => { if (!document.getElementById('topnavBackdrop')) document.body.appendChild(ensureBackdrop()); };
      const removeBackdrop = () => { const b = document.getElementById('topnavBackdrop'); if (b) b.remove(); };

      const openNav  = () => { nav.classList.add('open'); burger.setAttribute('aria-expanded','true'); if (isMobile()) nav.style.display='flex'; else nav.style.display=''; addBackdrop(); };
      const closeNav = () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded','false'); if (isMobile()) nav.style.display='none'; else nav.style.display=''; removeBackdrop(); };

      if (isMobile()) { closeNav(); } else { nav.style.display = ''; nav.classList.remove('open'); }

      const toggleNav = (e) => { e?.preventDefault?.(); e?.stopPropagation?.(); (nav.classList.contains('open') ? closeNav : openNav)(); };
      burger.addEventListener('click', toggleNav);

      const onNavClick = (e) => { const a = e.target.closest('a'); if (a && isMobile()) closeNav(); };
      nav.addEventListener('click', onNavClick);

      const onKey = (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { closeNav(); burger.focus?.(); } };
      document.addEventListener('keydown', onKey, true);

      const onViewportChange = () => {
        if (isMobile()) { nav.classList.remove('open'); nav.style.display='none'; burger.setAttribute('aria-expanded','false'); removeBackdrop(); }
        else { nav.classList.remove('open'); nav.style.display=''; burger.setAttribute('aria-expanded','false'); removeBackdrop(); }
      };
      window.addEventListener('resize', onViewportChange);
      mql.addEventListener?.('change', onViewportChange);
      window.addEventListener('orientationchange', onViewportChange);
      window.addEventListener('pageshow', (e) => { if (e.persisted) onViewportChange(); });

      window.__topbar_off = function () {
        try {
          burger.removeEventListener('click', toggleNav);
          nav.removeEventListener('click', onNavClick);
          document.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onViewportChange);
          window.removeEventListener('orientationchange', onViewportChange);
          mql.removeEventListener?.('change', onViewportChange);
          removeBackdrop();
        } catch {}
      };
    }

    // G) Logout integrado con js/logout.js
    const btnLogout = $('#btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        if (typeof window.rcvLogout === 'function') {
          // Usa la función centralizada (limpia tokens, adminMode y redirige a login)
          await window.rcvLogout();
        } else {
          // Fallback por si no cargó logout.js
          try {
            localStorage.removeItem('usuarioActual');
            localStorage.removeItem('paginaDestino');
            localStorage.removeItem('token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('adminMode');
          } finally {
            window.location.href = 'login.html';
          }
        }
      }, { once: true });
    }
    // ...tu código actual de topbar.js...

    // H) Enlaces Admin convenientes (si están en tu topbar.html)
    //    - Ej: <a id="linkEditorPaginas" data-admin-only href="paginas-admin.html">Editor de páginas</a>
    //         <a id="linkServiciosAdmin" data-admin-only href="servicios-admin.html">Editar servicios</a>
    // Ya se muestran/ocultan por [data-admin-only] arriba. No hay que tocar nada más.

    // I) Emitir evento "listo"
    document.dispatchEvent(new CustomEvent('topbar:loaded', { detail: { usuario, isAdmin } }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTopbar);
  } else {
    loadTopbar();
  }
// === Filtrado por rol de items del topbar (parche mínimo) ===
(function () {
  function applyTopbarPerms() {
    try {
      const App = window.App || {};
      const u   = App.getUsuarioActual ? App.getUsuarioActual() : null;
      const rol = String(u?.rol || '').toLowerCase();

      // Qué enlaces se permiten por rol
      const allow = new Set(
        (rol.includes('admin') || rol.includes('geren')) ? ['*'] :
        rol.includes('mec')   ? ['inicio','kardex','mis-ordenes'] :
        rol.includes('rep')   ? ['inicio','inventario','kardex'] :
        rol.includes('recep') ? ['inicio','crear-orden','clientes','vehiculos'] :
                                ['inicio']
      );

      const nav = document.querySelector('#topbarContainer nav') || document.querySelector('nav');
      if (!nav) return;

      nav.querySelectorAll('a[href]').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        const key =
          href.includes('crear-orden')     ? 'crear-orden' :
          href.includes('usuarios')        ? 'usuarios' :
          href.includes('clientes')        ? 'clientes' :
          href.includes('vehiculos')       ? 'vehiculos' :
          href.includes('inventario')      ? 'inventario' :
          href.includes('report')          ? 'reportes' :
          href.includes('gasto')           ? 'gastos' :
          href.includes('kardex')          ? 'kardex' :
          href.includes('listado-ordenes') ? 'mis-ordenes' :
                                             'inicio';

        if (!allow.has('*') && !allow.has(key)) a.style.display = 'none';
      });
    } catch (e) {
      console.warn('[topbar perms]', e);
    }
  }

  // Ejecuta una vez cuando haya DOM
  if (document.readyState !== 'loading') applyTopbarPerms();
  else document.addEventListener('DOMContentLoaded', applyTopbarPerms);

  // Reaplica si el topbar se vuelve a montar
  document.addEventListener('topbar:loaded', applyTopbarPerms);

  // Por si quieres llamarlo manualmente desde consola
  window.__applyTopbarPerms = applyTopbarPerms;
})();

})();

