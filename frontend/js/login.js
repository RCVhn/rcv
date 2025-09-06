// js/login.js
(function () {
  const form = document.getElementById('loginForm');
  const inputUsuario = document.getElementById('usuario');
  const inputPassword = document.getElementById('password');
  const mensajeError = document.getElementById('mensajeError');
  const chkMostrar = document.getElementById('mostrarPassword');

  // ==== CONFIG (mejora mínima) ====
  // 1) Tomar primero window.API_BASE (que setea env.js), luego localStorage, y por último dev.
  // 2) Si API_BASE viene como ruta relativa (ej. "/api"), convertir a absoluta con el origin.
  // 3) Aviso si en GitHub Pages se quedó apuntando a localhost.
  (function guardAPIBase(){
    var raw = (window.API_BASE || localStorage.getItem('API_BASE') || 'http://localhost:3001/api');
    if (typeof raw === 'string' && raw.startsWith('/')) raw = location.origin + raw;
    if (location.hostname.endsWith('.github.io') && /localhost|127\.0\.0\.1/.test(raw)) {
      // limpiar un valor malo heredado para no confundir
      localStorage.removeItem('API_BASE');
    }
    // reexpone por si otros módulos lo miran
    window.API_BASE = raw;
  })();
  const API_BASE = window.API_BASE;

  // --- Helper: detectar admin ---
  function esAdmin(user) {
    const rol = (user?.rol || '').toString().toLowerCase().trim();
    const perms = Array.isArray(user?.permisos) ? user.permisos.map(p => (p || '').toString().toLowerCase()) : [];
    const porRol = rol.includes('admin');
    const clavesAdmin = ['admin', 'superadmin', 'panel_admin', 'dashboard_admin'];
    const porPermiso = perms.some(p => clavesAdmin.includes(p));
    return porRol || porPermiso;
  }
  function aplicarAdminMode(user) {
    if (esAdmin(user)) localStorage.setItem('adminMode', 'true');
    else localStorage.removeItem('adminMode');
  }

  // Toggle mostrar/ocultar contraseña
  if (chkMostrar) {
    chkMostrar.addEventListener('change', function () {
      inputPassword.type = this.checked ? 'text' : 'password';
    });
  }

  function mostrarError(msg) {
    const m = msg || 'Ocurrió un error.';
    if (mensajeError) {
      mensajeError.textContent = m;
      mensajeError.style.color = 'red';
    } else {
      alert(m);
    }
  }

  function obtenerDestino() {
    const dest = localStorage.getItem('paginaDestino') || '';
    if (!dest) return 'admin.html';
    if (/^https?:\/\//i.test(dest)) return dest;
    return dest;
  }

  async function loginBD(usuario, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });

    let data = null;
    try { data = await res.json(); } catch {}

    if (!res.ok || !data?.ok) {
      const msg = (data && (data.error || data.message)) || `Error de autenticación (HTTP ${res.status})`;
      throw new Error(msg);
    }
    if (!data.token || !data.user) {
      throw new Error('Respuesta de login incompleta (falta token o user)');
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('authToken', data.token); // compatibilidad
    return data;
  }

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const usuario = (inputUsuario.value || '').trim();
    const password = (inputPassword.value || '').trim();
    if (!usuario || !password) {
      mostrarError('Por favor, complete todos los campos.');
      return;
    }

    // Evitar doble envío
    const btn = form.querySelector('button[type="submit"]');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Ingresando…'; btn.setAttribute('aria-busy','true'); }
    if (mensajeError) mensajeError.textContent = '';

    try {
      const r = await loginBD(usuario, password);
      const u = r.user;
      const usuarioActual = {
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        estado: u.estado,
        forzarCambio: !!u.forzarCambio,
        ultimoAcceso: u.ultimoAcceso || null,
        permisos: Array.isArray(u.permisos) ? u.permisos : (u.permisos || [])
      };
      localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
      aplicarAdminMode(usuarioActual);

      if (usuarioActual.forzarCambio) {
        window.location.href = 'cambiar-clave.html';
        return;
      }
      const destino = obtenerDestino();
      localStorage.removeItem('paginaDestino');
      window.location.href = destino || 'admin.html';
    } catch (err) {
      const netErr = /NetworkError|Failed to fetch|TypeError/i.test(String(err?.message || err));
      if (location.hostname.endsWith('.github.io') && /localhost|127\.0\.0\.1/.test(API_BASE)) {
        mostrarError('No se pudo contactar la API porque API_BASE apunta a localhost. Ajusta API_BASE en producción con tu URL de backend.');
      } else if (netErr) {
        mostrarError('No se pudo contactar la API. Verifica tu conexión o la URL de API_BASE.');
      } else {
        mostrarError(err.message || 'Usuario o contraseña incorrectos.');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevTxt; btn.removeAttribute('aria-busy'); }
    }
  });
})();
