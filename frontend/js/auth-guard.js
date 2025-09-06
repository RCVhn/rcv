// frontend/js/auth-guard.js
(function () {
  try {
    const href = location.pathname + location.search + location.hash;

    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const userRaw = localStorage.getItem('usuarioActual');
    const user = userRaw ? JSON.parse(userRaw) : null;

    function esAdmin(u) {
      const rol = (u?.rol || '').toString().toLowerCase().trim();
      const perms = Array.isArray(u?.permisos) ? u.permisos.map(p => (p || '').toString().toLowerCase()) : [];
      if (rol.includes('admin')) return true;
      const claves = ['admin','superadmin','panel_admin','dashboard_admin'];
      return perms.some(p => claves.includes(p));
    }

    // Si no hay sesión → guardar a dónde iba y mandar a login
    if (!token || !user) {
      try {
        // guarda ruta completa; funciona en GitHub Pages
        localStorage.setItem('paginaDestino', href);
      } catch {}
      location.replace('login.html');
      return;
    }

    // Si la página requiere admin, valida permisos
    if (window.REQUIERE_ADMIN && !esAdmin(user)) {
      alert('No tienes permisos para acceder a esta sección.');
      location.replace('index.html');
      return;
    }
  } catch (e) {
    console.error('[auth-guard] error:', e);
    try { localStorage.setItem('paginaDestino', location.pathname + location.search + location.hash); } catch {}
    location.replace('login.html');
  }
})();
