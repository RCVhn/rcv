// frontend/js/core/session.js
(function () {
  'use strict';

  const API = (window.API?.BASE) || localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  let _user = null;
  let _perms = new Set();
  let _loaded = false;

  async function fetchMe() {
    const res = await fetch(`${API}/auth/me`, { credentials: 'include' }).catch(() => null);
    if (!res || !res.ok) return null;
    return res.json();
  }

  async function initSession() {
    if (_loaded) return;
    // Fallback local (si no hay backend auth): lee auth simulado de localStorage
    const localAuth = localStorage.getItem('AUTH_USER_JSON');

    const me = await fetchMe();
    if (me && me.usuario) {
      _user = {
        id: me.usuario.id,
        nombre: me.usuario.nombre,
        email: me.usuario.email,
        rol: me.rol,
        permisos_extras: me.permisos_extras || [],
      };
      _perms = new Set(me.permisos_efectivos || []);
    } else if (localAuth) {
      try {
        const mock = JSON.parse(localAuth);
        _user = { id: mock.id, nombre: mock.nombre, email: mock.email, rol: mock.rol, permisos_extras: mock.permisos_extras || [] };
        _perms = new Set((mock.permisos_efectivos || []).map(String));
      } catch {
        _user = null; _perms = new Set();
      }
    }
    _loaded = true;
  }

  function getUser() { return _user; }
  function getPerms() { return _perms; }
  function hasPerm(p) { return _perms.has(p); }

  window.Session = { init: initSession, getUser, getPerms, has: hasPerm, API };
})();
