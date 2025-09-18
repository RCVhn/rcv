// js/login.js
(function () {
  const form          = document.getElementById('loginForm');
  const inputUsuario  = document.getElementById('usuario');
  const inputPassword = document.getElementById('password');
  const mensajeError  = document.getElementById('mensajeError');
  const chkMostrar    = document.getElementById('mostrarPassword');

  // =======================
  //  Configurar API_BASE
  // =======================
  (function guardAPIBase(){
    // Prioridad: env.js (window.API_BASE) → localStorage → fallback dev
    var raw = (window.API_BASE || localStorage.getItem('API_BASE') || 'http://localhost:3001/api');

    // Si viene relativo ("/api"), conviértelo a absoluto con el origin actual
    if (typeof raw === 'string' && raw.startsWith('/')) raw = location.origin + raw;

    // Si estamos en GitHub Pages y alguien dejó "localhost" guardado, limpiarlo
    if (location.hostname.endsWith('.github.io') && /localhost|127\.0\.0\.1/.test(raw)) {
      localStorage.removeItem('API_BASE');
      raw = window.API_BASE || 'https://example.invalid/api';
    }

    window.API_BASE = raw;
  })();
  const API_BASE = window.API_BASE;

  // =======================
  //  Helpers de UI
  // =======================
  function mostrarError(msg) {
    const m = msg || 'Ocurrió un error.';
    if (mensajeError) {
      mensajeError.textContent = m;
      mensajeError.style.color = 'red';
    } else {
      alert(m);
    }
  }

  // Mostrar/ocultar contraseña
  chkMostrar?.addEventListener('change', () => {
    inputPassword.type = chkMostrar.checked ? 'text' : 'password';
  });

  // Redirección después de login
  function obtenerDestino() {
    const urlParam = new URLSearchParams(location.search).get('next');
    if (urlParam) return urlParam;
    const dest = localStorage.getItem('paginaDestino') || '';
    if (!dest) return 'admin.html';
    if (/^https?:\/\//i.test(dest)) return dest;
    return dest;
  }

  // Modo admin (opcional, según rol/permisos)
  function esAdmin(user) {
    const rol = (user?.rol || '').toString().toLowerCase().trim();
    const perms = Array.isArray(user?.permisos) ? user.permisos.map(p => (p || '').toString().toLowerCase()) : [];
    const porRol = rol.includes('admin');
    const clavesAdmin = ['admin', 'superadmin', 'panel_admin', 'dashboard_admin', '*'];
    const porPermiso = perms.some(p => clavesAdmin.includes(p));
    return porRol || porPermiso;
  }
  function aplicarAdminMode(user) {
    if (esAdmin(user)) localStorage.setItem('adminMode', 'true');
    else localStorage.removeItem('adminMode');
  }

  // =======================
  //  Login API
  // =======================
  async function loginConWrapper(usuario, password) {
    // Usa window.API.AuthAPI si está disponible (js/api.js)
    if (window.API?.AuthAPI?.login) {
      const out = await window.API.AuthAPI.login(usuario, password);
      return out;
    }
    // Fallback con fetch directo
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ usuario, password }),
      mode: 'cors',
      credentials: 'omit'
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data?.ok) {
      const msg = (data && (data.error || data.message)) || `Error de autenticación (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function verificarTokenSiFaltaUsuario(token) {
    // Si el login no devolvió user, intenta /auth/verify para poblar perfil
    if (!token) return null;
    try {
      if (window.API?.AuthAPI?.verify) {
        return await window.API.AuthAPI.verify();
      }
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        mode: 'cors',
        credentials: 'omit'
      });
      const data = await res.json().catch(() => null);
      return data?.ok ? data : null;
    } catch {
      return null;
    }
  }

  // =======================
  //  Preflight / Alive
  // =======================
  (async () => {
    if (!API_BASE) return;
    try {
      const r = await fetch(`${API_BASE}/auth/_alive`, { mode: 'cors' });
      if (!r.ok) throw 0;
    } catch {
      // Mensaje suave; si el usuario intenta loguear, se mostrará otro más claro
      mensajeError && (mensajeError.textContent = 'Aviso: no se pudo confirmar el API en este momento.');
    }
  })();

  if (!form) return;

  // =======================
  //  Submit
  // =======================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario  = (inputUsuario.value || '').trim();
    const password = (inputPassword.value || '').trim();

    if (!usuario || !password) {
      mostrarError('Por favor, complete todos los campos.');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Ingresando…'; btn.setAttribute('aria-busy','true'); }
    if (mensajeError) mensajeError.textContent = '';

    try {
      const out = await loginConWrapper(usuario, password);

      // token
      const token = out?.token || localStorage.getItem('authToken') || localStorage.getItem('token');
      if (token) {
        // Si existe wrapper, úsalo para mantener compatibilidad
        if (window.API?.setAuthToken) window.API.setAuthToken(token);
        else {
          localStorage.setItem('authToken', token);
          localStorage.setItem('token', token);
        }
      } else {
        throw new Error('Respuesta de login incompleta (falta token).');
      }

      // user
      let user = out?.user || null;
      if (!user) {
        const ver = await verificarTokenSiFaltaUsuario(token);
        user = ver?.user || null;
      }
      // Normaliza y guarda usuarioActual
      if (user) {
        const usuarioActual = {
          id: user.id,
          usuario: user.usuario,
          nombre: user.nombre || null,
          email: user.email || null,
          rol: user.rol || 'usuario',
          // Campos opcionales si existieran:
          estado: user.estado ?? null,
          forzarCambio: !!(user.forzarCambio || user.forzarcambio),
          ultimoAcceso: user.ultimoAcceso || user.ultimoacceso || null,
          permisos: Array.isArray(user.permisos) ? user.permisos
                   : Array.isArray(user.permisos_extras) ? user.permisos_extras
                   : (user.permisos || user.permisos_extras || [])
        };
        localStorage.setItem('usuarioActual', JSON.stringify(usuarioActual));
        aplicarAdminMode(usuarioActual);

        if (usuarioActual.forzarCambio) {
          window.location.href = 'cambiar-clave.html';
          return;
        }
      }

      // Redirige
      const destino = obtenerDestino();
      localStorage.removeItem('paginaDestino');
      window.location.href = destino || 'admin.html';

    } catch (err) {
      const text = String(err?.message || err || '');
      const netErr = /NetworkError|Failed to fetch|TypeError/i.test(text);

      if (location.hostname.endsWith('.github.io') && /localhost|127\.0\.0\.1/.test(API_BASE)) {
        mostrarError('API_BASE apunta a localhost. Ajusta la URL del API para producción.');
      } else if (/inactivo/i.test(text)) {
        mostrarError('Usuario inactivo. Contacte al administrador.');
      } else if (/credenciales|password|contrase/i.test(text)) {
        mostrarError('Usuario o contraseña incorrectos.');
      } else if (netErr) {
        mostrarError('No se pudo contactar la API. Verifique su conexión o la URL de API_BASE.');
      } else {
        mostrarError(text || 'No se pudo iniciar sesión.');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevTxt; btn.removeAttribute('aria-busy'); }
    }
  });

  // Enter en inputs → submit
  [inputUsuario, inputPassword].forEach(el => el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') form?.requestSubmit();
  }));
})();
