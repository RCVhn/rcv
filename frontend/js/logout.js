// frontend/js/logout.js
(function () {
  // Devuelve la base de API si es válida para llamar desde el entorno actual; si no, null
  function getApiBase() {
    const val = (localStorage.getItem('API_BASE') || '').trim();
    if (!val) return null; // no hay API configurada => omite logout remoto

    const isLocal = /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(val);
    const onGithubPages = /github\.io$/i.test(location.hostname);

    // Si estamos en GitHub Pages y la API apunta a localhost => omite llamada remota
    if (onGithubPages && isLocal) return null;

    return val;
  }

  // Intenta notificar al backend (opcional). No bloquea el logout local.
  async function logoutBackend() {
    const API_BASE = getApiBase();
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');

    if (!API_BASE || !token) return; // nada que hacer

    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (_) {
      // Silencio: aunque falle, seguimos con el logout local
    }
  }

  // ===== Función de cierre de sesión =====
  async function logout() {
    try {
      await logoutBackend(); // opcional; no detiene el flujo si falla
    } finally {
      // Borra datos de sesión (local)
      localStorage.removeItem('usuarioActual');
      localStorage.removeItem('paginaDestino');
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('adminMode'); // ocultar enlaces admin si los hubiera
      // (Si guardas otros flags de sesión, límpialos aquí)
    }

    // Redirige siempre al login
    location.replace('login.html');
  }

  // ===== Enganche por ID (si existe un botón estático con ese id) =====
  function initLogoutButton() {
    const btn = document.getElementById('btnLogout');
    if (btn && !btn.dataset.logoutWired) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        logout();
      });
      btn.dataset.logoutWired = 'true'; // evita doble binding
    }
  }

  // ===== Delegación global (funciona aunque el botón se inyecte después) =====
  function wireDelegatedClicks() {
    document.addEventListener('click', function (e) {
      const t = e.target && e.target.closest('#btnLogout, [data-logout]');
      if (t) {
        e.preventDefault();
        logout();
      }
    }, true); // captura para adelantarnos a otros handlers
  }

  document.addEventListener('DOMContentLoaded', initLogoutButton);
  window.addEventListener('load', initLogoutButton);
  wireDelegatedClicks();

  // Exponer para uso manual
  window.rcvLogout = logout;
  window.__logout = logout;
})();
