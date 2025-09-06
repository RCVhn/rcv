// frontend/js/cambiar-clave.js
(function(){
  'use strict';

  const $ = (s) => document.querySelector(s);

  // Usa la misma base que el resto del sistema
  const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  const form          = $('#formCambioClave');
  const inputActual   = $('#passwordActual');
  const inputNueva    = $('#nuevaClave');
  const inputConfirma = $('#confirmarClave');
  const btnGuardar    = $('#btnGuardar');

  const u = leerSesion();

  if(!u || !u.usuario){
    // Si no hay sesión iniciada, redirige al login
    window.location.href = 'login.html';
    return;
  }

  function leerSesion(){
    try { return JSON.parse(localStorage.getItem('usuarioActual') || '{}'); }
    catch { return {}; }
  }

  function mostrarAlerta(texto, ok=false){
    Swal.fire({
      icon: ok ? 'success' : 'error',
      title: texto,
      confirmButtonText: 'Aceptar'
    });
  }

  function strongPassword(pwd){
    return /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd) && String(pwd||'').length >= 8;
  }

  // Verifica la contraseña ACTUAL contra la API
  async function verificarActual(usuario, password){
    if(!password) return false;
    try{
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password })
      });
      return res.ok;
    }catch(err){
      console.error('Fallo al contactar /auth/login:', err);
      throw new Error('No se pudo contactar al servidor de autenticación.');
    }
  }

  function actorHeaders() {
    const actor = u?.usuario || u?.nombre || 'sistema';
    return { 'Content-Type': 'application/json', 'X-Actor': actor, 'X-Actor-Usuario': actor };
  }

  // Siempre redirigir al panel de control
  function destinoPostCambio() {
    return new URL('admin.html', document.baseURI).href;
  }

  form && form.addEventListener('submit', async function(e){
    e.preventDefault();

    const actual = (inputActual.value || '').trim();
    const nueva  = (inputNueva.value || '').trim();
    const conf   = (inputConfirma.value || '').trim();

    if(!actual || !nueva || !conf){
      return mostrarAlerta('Todos los campos son obligatorios');
    }
    if(nueva !== conf){
      return mostrarAlerta('La nueva contraseña y su confirmación no coinciden');
    }
    if(!strongPassword(nueva)){
      return mostrarAlerta('La nueva contraseña no cumple requisitos (8+, mayús, minús, número y símbolo).');
    }

    try{
      btnGuardar?.setAttribute('disabled','disabled');

      const okActual = await verificarActual(u.usuario, actual);
      if(!okActual){
        return mostrarAlerta('La contraseña actual es incorrecta');
      }

      const resp = await fetch(`${API_BASE}/usuarios/${u.id}`, {
        method: 'PUT',
        headers: actorHeaders(),
        body: JSON.stringify({ password: nueva, forzarCambio: 0 })
      });

      const data = await resp.json().catch(()=> ({}));
      if(!resp.ok){
        throw new Error(data.error || 'Error al actualizar la contraseña');
      }

      // Actualiza sesión local
      localStorage.setItem('usuarioActual', JSON.stringify({ ...u, forzarCambio: 0 }));

      // Mensaje de éxito y redirección
      await Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada correctamente',
        confirmButtonText: 'Ir al panel'
      });

      window.location.href = destinoPostCambio();

    }catch(err){
      console.error(err);
      mostrarAlerta(err.message || 'Error al actualizar la contraseña');
    }finally{
      btnGuardar?.removeAttribute('disabled');
    }
  });

})();

