// js/admin.js (migración a backend /api/admin/*)
document.addEventListener("DOMContentLoaded", () => {
  const API = () => (localStorage.getItem('API_BASE') || window.API_BASE || '');
  const sessionUser = JSON.parse(localStorage.getItem("usuarioActual") || "null");
  const userForm = document.getElementById("userForm");
  const userList = document.getElementById("userList");
  const bitacoraList = document.getElementById("bitacoraList");
  const secciones = document.querySelectorAll("main section");
  const botonesNav = document.querySelectorAll("nav button[data-section]");
  const tituloBienvenida = document.getElementById("tituloBienvenida");
  const responsabilidades = document.getElementById("responsabilidades");

  const rolesResponsabilidades = {
    administrador: "Puede crear y modificar usuarios, acceder a todas las áreas, y personalizar la página pública.",
    mecanico: "Revisar, reparar y actualizar el estado de los vehículos asignados.",
    gerencia: "Supervisa rendimiento, verifica estadísticas y controla aprobaciones.",
    calidad: "Valida la calidad antes de la entrega.",
    recepcion: "Registra clientes, vehículos y genera órdenes iniciales.",
    repuestos: "Gestiona inventario y control de repuestos."
  };

  if (sessionUser) {
    const userDisp = document.getElementById("userDisplay");
    if (userDisp) userDisp.textContent = `Bienvenido, ${sessionUser.usuario || sessionUser.nombre || ''} (${sessionUser.rol || '—'})`;
    if (tituloBienvenida) tituloBienvenida.textContent = `Hola, ${sessionUser.usuario || 'Usuario'} - Rol: ${sessionUser.rol || '—'}`;
    if (responsabilidades) responsabilidades.textContent = rolesResponsabilidades[sessionUser.rol] || "";
  }

  botonesNav.forEach(btn => {
    btn.addEventListener("click", () => {
      botonesNav.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-section");
      secciones.forEach(sec => sec.classList.toggle("active", sec.id === target));
    });
  });

  if (sessionUser?.rol !== "administrador") {
    const secUsuarios = document.getElementById("usuarios");
    if (secUsuarios) secUsuarios.style.display = "none";
  }

  async function apiGet(p) {
    const r = await fetch(API()+p, { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function apiPost(p, body) {
    const r = await fetch(API()+p, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function apiPut(p, body) {
    const r = await fetch(API()+p, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  // === Usuarios ===
  async function loadUsers() {
    if (!userList) return;
    try {
      const users = await apiGet('/admin/usuarios');
      userList.innerHTML = "";
      (users||[]).forEach((user) => {
        const li = document.createElement("li");
        li.textContent = `${user.usuario} - Rol: ${user.rol}`;
        if (sessionUser?.rol === "administrador") {
          const resetBtn = document.createElement("button");
          resetBtn.textContent = "Reiniciar contraseña";
          resetBtn.style.marginLeft = "12px";
          resetBtn.onclick = async () => {
            const nueva = prompt(`Nueva contraseña para ${user.usuario}`);
            if (!nueva) return;
            await apiPut(`/admin/usuarios/${user.id}/password`, { contrasena: nueva });
            await logBitacora(`Contraseña reiniciada para: ${user.usuario}`);
            alert("Contraseña actualizada.");
          };
          li.appendChild(resetBtn);
        }
        userList.appendChild(li);
      });
    } catch (e) {
      userList.innerHTML = `<li>Error cargando usuarios</li>`;
      console.warn('[admin.js] usuarios:', e.message);
    }
  }

  if (userForm) {
    userForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = userForm.usuario.value.trim();
      const password = userForm.contrasena.value.trim();
      const rol = userForm.rol.value;
      if (!username || !password) { alert("Usuario y contraseña son obligatorios."); return; }
      try {
        await apiPost('/admin/usuarios', { usuario: username, contrasena: password, rol });
        await logBitacora(`Usuario creado: ${username} (Rol: ${rol})`);
        userForm.reset();
        loadUsers();
      } catch (e) {
        if (/USUARIO_EXISTE/.test(e.message)) alert('Ese nombre de usuario ya existe.');
        else alert('Error creando usuario');
      }
    });
  }

  // === Bitácora ===
  async function logBitacora(accion) {
    try {
      await apiPost('/admin/bitacora', { usuario: sessionUser?.usuario || 'Desconocido', accion });
      loadBitacora();
    } catch (e) { console.warn('[admin.js] bitacora post:', e.message); }
  }

  async function loadBitacora() {
    if (!bitacoraList) return;
    try {
      const bitacora = await apiGet('/admin/bitacora');
      bitacoraList.innerHTML = "";
      (bitacora||[]).forEach(entry => {
        const li = document.createElement("li");
        li.textContent = `${entry.ts} - ${entry.usuario || '—'} - ${entry.accion}`;
        bitacoraList.appendChild(li);
      });
    } catch (e) {
      bitacoraList.innerHTML = `<li>Error cargando bitácora</li>`;
      console.warn('[admin.js] bitacora get:', e.message);
    }
  }

  // === Inicializar ===
  loadUsers();
  loadBitacora();
});
