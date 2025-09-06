// frontend/js/perms.js
(function () {
  'use strict';

  function getUser() {
    try { return JSON.parse(localStorage.getItem('usuarioActual')) || {}; }
    catch { return {}; }
  }
  function isAdmin(u){ return String(u.rol||'').toLowerCase()==='administrador'; }
  function hasPerm(u, perm){
    if (!u) return false;
    if (isAdmin(u)) return true;
    const p = Array.isArray(u.permisos) ? u.permisos : [];
    return p.includes(perm);
  }

  // Deriva page key: main[data-page], nav activo, o nombre del archivo
  function inferPageKey() {
    const main = document.querySelector('main[data-page]');
    if (main) return 'page:' + String(main.getAttribute('data-page')).toLowerCase();

    const active = document.querySelector('a[id^="nav"].active');
    if (active) return 'page:' + active.id.replace(/^nav/, '').toLowerCase();

    const file = (location.pathname.split('/').pop() || '').replace(/\.[a-z0-9]+$/i,'');
    return file ? 'page:' + file.toLowerCase() : null;
  }

  function requirePage(pageKey, redirect = 'admin.html') {
    const u = getUser();
    const key = pageKey || inferPageKey();
    if (!key) return; // sin key inferida, no bloqueamos
    if (isAdmin(u)) return;
    const ok = hasPerm(u, key);
    if (!ok) {
      alert('No tienes permiso para acceder a esta página.');
      location.href = redirect;
    }
  }

  // Gateo para ver/crear/editar/eliminar
  function gateUI(root) {
    const u = getUser();
    const checks = {
      view:   isAdmin(u) || hasPerm(u, 'action:view'),
      create: isAdmin(u) || hasPerm(u, 'action:create'),
      edit:   isAdmin(u) || hasPerm(u, 'action:edit'),
      delete: isAdmin(u) || hasPerm(u, 'action:delete'),
    };
    const scope = (root || document);
    scope.querySelectorAll('[data-requires]').forEach(el => {
      const reqs = String(el.getAttribute('data-requires')||'').toLowerCase().split(/\s+/).filter(Boolean);
      if (!reqs.length) return;
      const ok = reqs.every(r => checks[r] === true);
      const hide = el.hasAttribute('data-perms-hide');
      if (ok) {
        el.classList.remove('is-disabled');
        el.removeAttribute('disabled');
        if (hide) el.style.display = '';
        if (el.isContentEditable) el.setAttribute('contenteditable','true');
      } else {
        if (hide) el.style.display = 'none';
        el.classList.add('is-disabled');
        el.setAttribute('disabled','disabled');
        if (el.isContentEditable) el.setAttribute('contenteditable','false');
        el.title = el.title || 'Sin permiso';
      }
    });
  }

  function watchMutations() {
    const obs = new MutationObserver(muts=>{
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(n=>{
          if (!(n instanceof Element)) return;
          if (n.matches('[data-requires]') || n.querySelector('[data-requires]')) {
            gateUI(n);
          }
        });
      }
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.Perms = { getUser, hasPerm, isAdmin, requirePage, gateUI, watchMutations };
})();

