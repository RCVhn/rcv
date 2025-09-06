// js/common.js
(function () {
  'use strict';

  // ============== Config global (API_BASE) ==============
  try {
    const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
    window.APP_CONFIG = Object.freeze({ API_BASE });
  } catch {}
// ============== Logo global ==============
try {
  if (!localStorage.getItem('LOGO_URL')) {
    localStorage.setItem('LOGO_URL', 'http://localhost:3001/frontend/img/logo.png');
  }
} catch (e) {}

  // ============== Helpers de sesión (globales) ==========
  function getUsuarioActual(){ try{ return JSON.parse(localStorage.getItem('usuarioActual'))||null; }catch{ return null; } }
  function setUsuarioActual(u){ if(u && typeof u==='object'){ localStorage.setItem('usuarioActual', JSON.stringify(u)); } }
  function clearUsuarioActual(){ localStorage.removeItem('usuarioActual'); }
  function getRolUsuarioActual(){ const u=getUsuarioActual(); return u?u.rol:null; }
  function getNombreUsuarioActual(){ const u=getUsuarioActual(); return u?(u.nombre||u.usuario||null):null; }
  function protegerPagina(){
    const u=getUsuarioActual();
    if(!u){ localStorage.setItem('paginaDestino', window.location.pathname.split('/').pop()); window.location.href='login.html'; }
  }
  function redirigirAPaginaDestino(){
    const d=localStorage.getItem('paginaDestino');
    if(d){ localStorage.removeItem('paginaDestino'); window.location.href=d; }
  }
  window.getUsuarioActual=getUsuarioActual;
  window.setUsuarioActual=setUsuarioActual;
  window.clearUsuarioActual=clearUsuarioActual;
  window.getRolUsuarioActual=getRolUsuarioActual;
  window.getNombreUsuarioActual=getNombreUsuarioActual;
  window.protegerPagina=protegerPagina;
  window.redirigirAPaginaDestino=redirigirAPaginaDestino;

  // ============== Scroll a la parte superior =============
  (function(){ try{
    if('scrollRestoration' in history) history.scrollRestoration='manual';
    const up=()=>setTimeout(()=>window.scrollTo({top:0,left:0,behavior:'auto'}),0);
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',up); else up();
    window.addEventListener('pageshow',e=>{ if(e.persisted) up(); });
  }catch{}})();

  // ============== Estado "standalone" (PWA) =============
  (function(){ try{
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
    if(isStandalone){
      document.documentElement.setAttribute('data-standalone','true');
      document.body?.classList?.add('is-standalone');
      const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.setAttribute('content','#0b6efd');
    }
  }catch{}})();

  // ============== PWA / Service Worker ==================
  (function(){
    // Helper de recarga (queda disponible, pero NO se usará automáticamente)
    if(!window.__requestAppReload){
      window.__requestAppReload=(delayMs=200)=>{
        if(window.__appReloadQueued) return;
        window.__appReloadQueued=true;
        console.debug('[PWA] Recarga solicitada…');
        setTimeout(()=>{ try{ window.location.reload(); }catch{ location.reload(); } }, delayMs);
      };
    }

    if(!('serviceWorker' in navigator)) return;
    if(window.__pwa_sw_registered) return;
    window.__pwa_sw_registered=true;

    // 🔕 Switch maestro: sin recarga automática (diagnóstico)
    window.__PWA_AUTO_RELOAD=false;

    function detectScope(){ const p=window.location.pathname||'/'; return p.includes('/frontend/')?'/frontend/':'/'; }
    const scope=detectScope();
    const swUrl=scope.replace(/\/+$/,'')+'/sw.js';

    // Nunca recargamos automáticamente en controllerchange (diagnóstico)
    if(!window.__pwa_controllerchange_wired){
      window.__pwa_controllerchange_wired=true;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        console.debug('[PWA] controllerchange capturado (diagnóstico, sin recarga).');
        // if(window.__PWA_AUTO_RELOAD) window.__requestAppReload(200);
      });
    }

    // Registro del SW sin forzar updates
    window.addEventListener('load', async ()=>{
      try{
        const existing=(await navigator.serviceWorker.getRegistration(scope))||(await navigator.serviceWorker.getRegistration());
        const reg=existing||await navigator.serviceWorker.register(swUrl,{scope});
        console.log('[PWA] SW activo en scope:', reg.scope);

        // No enviamos SKIP_WAITING desde la página en ningún entorno (diagnóstico)
        reg.addEventListener?.('updatefound',()=>{
          const nw=reg.installing; if(!nw) return;
          nw.addEventListener('statechange',()=>{
            if(nw.state==='installed' && navigator.serviceWorker.controller){
              console.log('[PWA] Nueva versión instalada (waiting) – sin activar automática (diagnóstico).');
            }
          });
        });
      }catch(err){ console.error('[PWA] Error registrando SW:', err); }
    });

    // Búsqueda manual por botón/console (no dispara recarga)
    window.checkForSWUpdate=async function(){
      try{
        const s=detectScope();
        const reg=await navigator.serviceWorker.getRegistration(s)||await navigator.serviceWorker.getRegistration();
        await reg?.update?.();
        console.log('[PWA] Búsqueda de actualización forzada (diagnóstico).');
      }catch(e){ console.warn('[PWA] No se pudo forzar actualización:', e); }
    };
  })();

  // ============== Notas de Toast/Modal ==================
  // (Reservado para helpers de toast/modal)
})();

/* ============================================================
   ⬇️ PERMISOS TOPBAR (UI) — ocultar links según /api/auth/me
   Mantiene seguridad real en backend; esto solo es UX.
   ============================================================ */
(function () {
  'use strict';

  // Base de API (mismo criterio que arriba)
  const API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || localStorage.getItem('API_BASE') || '/api';
  const token = localStorage.getItem('AUTH_TOKEN') || '';

  // Mapa por href -> permiso requerido (puedes extenderlo cuando agregues páginas)
  const HREF_PERM_MAP = {
    'admin.html':        'usuarios.admin',
    'clientes.html':     'clientes.view',
    'cotizaciones.html': 'cotizaciones.view',
    'facturacion.html':  'facturacion.view',
  };

  async function cargarPermisosEfectivos() {
    if (!token) return null; // si no hay token, no tocamos la UI aquí
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      const arr = Array.isArray(data?.perms) ? data.perms : [];
      return new Set(arr);
    } catch {
      return null;
    }
  }

  function aplicarTopnav(perms) {
    const links = document.querySelectorAll('.topnav a');
    links.forEach(a => {
      // 1) Si el <a> tiene data-perm, se usa eso
      // 2) Si no, se mapea por el nombre del archivo del href
      const need =
        (a.dataset && a.dataset.perm) ||
        HREF_PERM_MAP[(a.getAttribute('href') || '').split('/').pop()];
      if (!need) return; // sin regla explícita, no tocamos el enlace

      // Si no hay permisos (falló /me) o no lo tiene, se oculta
      if (!perms || !perms.has(need)) {
        a.style.display = 'none';
      }
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(async () => {
    const perms = await cargarPermisosEfectivos();
    aplicarTopnav(perms);
  });

  // Utilidad para forzar re-evaluación desde consola si cambias de usuario sin recargar
  window.__applyTopnavPermissions = async function () {
    const perms = await cargarPermisosEfectivos();
    aplicarTopnav(perms);
  };
})();
