// === frontend/js/usuarios-admin.js — PARTE 1/3 ===
(function () {
  'use strict';

  // ================== Config API (soporta CORS / túneles) ==================
  //   localStorage.setItem('API_BASE', 'http://localhost:3001/api')
  //   localStorage.setItem('API_BASE', 'https://tu-subdominio.ngrok.io/api')
  const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  // ===== UI: Hooks a utilidades globales (sin estilos locales) =====
  function __stripTags(html){ try{ const d=document.createElement('div'); d.innerHTML=String(html||''); return d.textContent||d.innerText||'';}catch{return String(html||'');} }
  function showToast(message, type='info', title=''){
    const T = String(type || 'info').toLowerCase();
    const M = String(message || '');
    const opts = title ? { title } : undefined;
    const count = ()=> document.querySelectorAll('.toast-container .toast').length;
    const before = count();

    try { if (typeof window.showToast === 'function') window.showToast(T, M, opts); } catch {}
    try { if (typeof window.showToast === 'function') window.showToast(M, T, title); } catch {}
    try { if (typeof window.mostrarToast === 'function') window.mostrarToast(T, M, opts); } catch {}
    try { if (typeof window.mostrarToast === 'function') window.mostrarToast(M, T, title); } catch {}

    setTimeout(() => {
      if (count() > before) return;
      let c = document.querySelector('.toast-container');
      if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
      }
      const el = document.createElement('div');
      el.className = `toast toast-${T}`;
      el.innerHTML = `
        <div>
          <div class="toast-title">${opts?.title || T}</div>
          <div class="toast-msg">${M}</div>
        </div>
        <button class="toast-close" aria-label="Cerrar">×</button>
      `;
      c.appendChild(el);
      const close = () => { el.style.animation = 'toast-out .18s ease-in forwards'; setTimeout(() => el.remove(), 180); };
      el.querySelector('.toast-close').addEventListener('click', close);
      setTimeout(close, 3200);
    }, 0);
  }
  function showConfirm(message){
    if (typeof window.confirmModal === 'function') return window.confirmModal(message);
    if (typeof window.showConfirm === 'function')  return window.showConfirm(message);
    return Promise.resolve(confirm(message));
  }
  function showInfoModal(title, htmlContent){
    if (typeof window.infoModal === 'function')    return window.infoModal(title, htmlContent);
    if (typeof window.showInfoModal === 'function')return window.showInfoModal(title, htmlContent);
    alert((title? (title + ':\n\n') : '') + __stripTags(htmlContent));
    return Promise.resolve();
  }

  // ===== Inyección de estilos para paginación/skeleton (no toca tu CSS global) =====
  function ensurePagStyles(){
    if (document.getElementById('pag-skel-styles')) return;
    const css = `
    .paginator{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
    .paginator .btn{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer}
    .paginator .btn[disabled]{opacity:.5;cursor:not-allowed}
    .paginator .meta{font-size:.9rem;color:var(--muted)}
    .paginator select{border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px}
    .skel{position:relative;overflow:hidden;background:#f6f7f8}
    .skel::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg, rgba(246,247,248,0) 0%, rgba(0,0,0,0.06) 50%, rgba(246,247,248,0) 0%);animation:skel-shimmer 1.2s infinite}
    @keyframes skel-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    .skel-row td{height:38px}
    .empty-row td{color:var(--muted);text-align:center}
    `;
    const s = document.createElement('style');
    s.id = 'pag-skel-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // =====================================================

  // Sesión y headers del actor (para backend/bitácora)
  function sesionActual() { try { return JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch { return {}; } }
  function actorHeaders() {
    const u = sesionActual();
    const actor = u?.usuario || u?.nombre || 'sistema';
    return { 'X-Actor': actor, 'X-Actor-Usuario': actor };
  }

  // fetch con base y CORS
  async function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('access_token');

    const headers = { ...(options.headers || {}), ...actorHeaders(), Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json';

    const opts = { ...options, mode: 'cors', headers, credentials: 'omit' };
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      console.warn('[apiFetch] ERROR', { url, method: opts.method || 'GET', status: res.status, body: options.body, data });
      throw new Error(msg);
    }
    return data;
  }

  // ===== Helpers de bitácora: normaliza campos + formato legible de "detalles"
  function __pick(obj, ...keys) {
    for (const k of keys) if (obj && obj[k] != null) return obj[k];
    return undefined;
  }
  function __toEstado(v) {
    const s = String(v ?? '').toLowerCase();
    return (v === true || s === '1' || s === 'activo' || s === 'on' || s === 'true') ? 'Activo' : 'Inactivo';
  }
  function __toYesNo(v) { return v ? 'sí' : 'no'; }
  function formatBitacoraDetalles(accion, detallesRaw) {
    if (detallesRaw == null) return '';
    if (typeof detallesRaw === 'string') { try { return formatBitacoraDetalles(accion, JSON.parse(detallesRaw)); } catch { return detallesRaw; } }
    const d = detallesRaw;
    switch (String(accion || '').toLowerCase()) {
      case 'usuarios:estado': {
        const de = __toEstado(__pick(d, 'de','desde','from'));
        const a  = __toEstado(__pick(d, 'a','hacia','to'));
        if (de || a) return `Estado: ${de || '?'} → ${a || '?'}`;
        break;
      }
      case 'usuarios:reset-password': {
        const fc = !!__pick(d, 'forzarCambio','force','forceChange');
        return `forzarCambio: ${__toYesNo(fc)}`;
      }
      case 'usuarios:permisos': {
        const ag = __pick(d,'agregados','added') || [];
        const rm = __pick(d,'removidos','removed') || [];
        const p1 = ag.length ? `Agregados: ${ag.join(', ')}` : '';
        const p2 = rm.length ? `Removidos: ${rm.join(', ')}` : '';
        return [p1, p2].filter(Boolean).join(' · ');
      }
      case 'usuarios:update': {
        const cambios = __pick(d, 'cambios') || d;
        if (cambios && typeof cambios === 'object') {
          const parts = [];
          for (const [k, v] of Object.entries(cambios)) {
            if (v && typeof v === 'object' && ('de' in v || 'a' in v)) parts.push(`${k[0].toUpperCase()+k.slice(1)}: ${v.de ?? '?'} → ${v.a ?? '?'}`);
            else parts.push(`${k[0].toUpperCase()+k.slice(1)}: ${v}`);
          }
          if (parts.length) return parts.join(' · ');
        }
        break;
      }
    }
    try { return JSON.stringify(d); } catch { return String(detallesRaw); }
  }

  // ===== Cliente local API =====
  const API = {
    UsuariosAPI: {
      listar: (q = '') => apiFetch(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),
      obtener: (id) => apiFetch(`/usuarios/${id}`),
      crear: (body) => apiFetch(`/usuarios`, { method: 'POST', body: JSON.stringify(body) }),
      actualizar: (id, body) => apiFetch(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      estado: (id, estado) => apiFetch(`/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
      resetPass: (id, nueva = null) => apiFetch(`/usuarios/${id}/reset-password`, { method: 'POST', body: JSON.stringify(nueva ? { nueva } : {}) } ),
      eliminar: (id) => apiFetch(`/usuarios/${id}`, { method: 'DELETE' }),
      actualizarPermisos: (id, permisos) => apiFetch(`/usuarios/${id}/permisos`, { method: 'PUT', body: JSON.stringify({ permisos }) }),
    },
    BitacoraAPI: {
      listar: () => apiFetch(`/bitacora`),
      // intenta server-side y si no, filtra en cliente
      listarPorUsuario: async (usuario) => {
        try {
          return await apiFetch(`/bitacora?usuario=${encodeURIComponent(usuario)}`);
        } catch {
          const all = await apiFetch(`/bitacora`).catch(()=>[]);
          const arr = Array.isArray(all.items) ? all.items : all;
          return arr.filter(r=>{
            const u = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
            return String(u) === String(usuario);
          });
        }
      }
    }
  };
  // ========================================================================

  // --- Guard de rol: solo ADMIN puede estar aquí ---
  const _u = sesionActual();
  const _rol = String(_u.rol || '').toLowerCase();
  const _perms = Array.isArray(_u.permisos) ? _u.permisos : [];
  if (!(_rol === 'administrador' || _perms.includes('usuarios:admin'))) {
    alert('No tienes permiso para acceder a Gestión de usuarios.');
    window.location.href = 'admin.html';
    return;
  }

  // --- Live guard + cierre de overlays ---
  function __canStay(u){
    const rol = String(u?.rol || '').toLowerCase();
    const perms = Array.isArray(u?.permisos) ? u.permisos : [];
    return rol === 'administrador' || perms.includes('usuarios:admin');
  }
  function __readUser(){ try { return JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch { return {}; } }
  function __closeOverlays(){
    const dr = document.getElementById('drawerEditar');
    if (dr) { dr.classList.remove('open'); dr.setAttribute('aria-hidden','true'); }
    const mp = document.getElementById('modalPerms');
    if (mp) mp.classList.remove('open');
    const dlg = document.getElementById('dlgBitacoraUsuario');
    if (dlg && typeof dlg.close === 'function') dlg.close();
  }
  function __enforceAccess(){
    const u = __readUser();
    if (!__canStay(u)) {
      showToast('Tu permiso para "Usuarios" fue revocado. Redirigiendo…','warning');
      __closeOverlays();
      setTimeout(()=>{ location.href = 'admin.html'; }, 800);
    }
  }
  window.addEventListener('storage', (e)=>{ if (e.key === 'usuarioActual') __enforceAccess(); });
  let __permPoll = setInterval(async ()=>{ try {
    if (!window.API || !window.API.AuthAPI || !window.API.AuthAPI.verify) return;
    const out = await window.API.AuthAPI.verify();
    let srv = null;
    if (out && typeof out === 'object') {
      if (out.usuario) srv = out.usuario;
      else if (out.user) srv = out.user;
      else if (out.currentUser) srv = out.currentUser;
      else if (out.me) srv = out.me;
      else if (out.data && out.data.usuario) srv = out.data.usuario;
      else if ('rol' in out || 'permisos' in out) srv = out;
    }
    if (srv) {
      const saved = __readUser();
      const changed = (saved.rol !== srv.rol) || (JSON.stringify(saved.permisos||[]) !== JSON.stringify(srv.permisos||[]));
      if (changed) {
        localStorage.setItem('usuarioActual', JSON.stringify({ ...saved, ...srv }));
        __enforceAccess();
      }
    }
  } catch(_e){} }, 5000);

  // --- Helpers varios ---
  const $ = (s) => document.querySelector(s);
  const fmtFecha = (v) => (v ? new Date(v).toLocaleString() : '-');
  function ucFirst(s){ s=String(s||''); return s.charAt(0).toUpperCase()+s.slice(1); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function hoy(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  function getUsuarioActual(){ try{const u=JSON.parse(localStorage.getItem('usuarioActual')); return (u&&u.usuario)||'';}catch{return '';} }
  function isValidEmail(email) { const s = String(email || '').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function __create(el, attrs={}, children=[]){
    const n = document.createElement(el);
    Object.entries(attrs||{}).forEach(([k,v])=>{ if(k==='class') n.className=v; else if(k==='text') n.textContent=v; else n.setAttribute(k,v); });
    (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>{ if(typeof c==='string') n.appendChild(document.createTextNode(c)); else n.appendChild(c); });
    return n;
  }

  // ===== Branding / metadatos
  const BRAND = { nombre: 'Taller RCV', logo: 'img/logo.png' };
  function nowStr() { return new Date().toLocaleString(); }
  function actorNombre() { try { const u = JSON.parse(localStorage.getItem('usuarioActual')) || {}; return u.usuario || u.nombre || 'sistema'; } catch { return 'sistema'; } }
  function headerHTML(titulo){
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <img src="${BRAND.logo}" alt="logo" style="height:44px;object-fit:contain"/>
        <div>
          <div style="font-weight:700;font-size:18px;line-height:1">${BRAND.nombre}</div>
          <div style="font-size:12px;color:#555">${titulo}</div>
        </div>
        <div style="margin-left:auto;text-align:right;font-size:12px;color:#555">
          <div>Generado: ${nowStr()}</div>
          <div>Por: ${actorNombre()}</div>
        </div>
      </div>
    `;
  }

  // ===== Paginación (estado global) =====
  const PAG_DEFAULT = { page: 1, pageSize: 10, total: 0, q: "" };
  const pagUsuarios = { ...PAG_DEFAULT };
  const pagBitacora = { ...PAG_DEFAULT };

  // ===== Páginas personalizadas =====
  const PAGES_STORE_KEY = 'app_pages';
  function loadCustomPages() { try { return JSON.parse(localStorage.getItem(PAGES_STORE_KEY)) || []; } catch { return []; } }
  function saveCustomPages(arr) { localStorage.setItem(PAGES_STORE_KEY, JSON.stringify(arr)); }
  function normalizeSlug(s) { return String(s||'').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''); }

  // --- DOM refs ---
  const tbody = document.querySelector('#tablaUsuarios tbody');
  const tbodyBit = document.querySelector('#tablaBitacora tbody');
  const formCrear = $('#formCrear');
  const formEditar = $('#formEditar');
  const drawer = $('#drawerEditar');
  const btnCerrarDrawer = $('#btnCerrarDrawer');
  const btnCancelarEdit = $('#btnCancelarEdit');
  const inpBuscar = $('#buscarUsuario');
  const btnRefrescar = $('#btnRefrescar');
  const btnExportUsuarios = $('#btnExportUsuarios');
  const btnExportUsuariosCsv = $('#btnExportUsuariosCsv');
  const btnExportBitacora = $('#btnExportBitacora');
  const btnExportBitacoraCsv = $('#btnExportBitacoraCsv');
  const btnGuardarEdit = formEditar ? formEditar.querySelector('[type="submit"]') : null;

  // === Filtros Bitácora ===
  function ensureBitFilters(){
    const table = document.getElementById('tablaBitacora');
    if (!table) return;
    if (!document.getElementById('bitFilters')) {
      const panel = document.createElement('div');
      panel.id = 'bitFilters';
      panel.className = 'filters';
      panel.style.cssText = 'margin:8px 0; display:flex; gap:8px; flex-wrap:wrap';
      panel.innerHTML = `
        <input type="date" id="bitFrom" />
        <input type="date" id="bitTo" />
        <input type="text" id="bitQ" placeholder="Buscar acción/usuario/detalles..." />
        <button id="bitApply" class="btn-ghost">Filtrar</button>
        <button id="bitClear" class="btn-ghost">Limpiar</button>
      `;
      table.parentElement.insertBefore(panel, table);
    }
  }
  let bitFrom, bitTo, bitQ, bitApply, bitClear;
  function wireBitFilterEvents(){
    bitFrom = document.getElementById('bitFrom');
    bitTo   = document.getElementById('bitTo');
    bitQ    = document.getElementById('bitQ');
    bitApply= document.getElementById('bitApply');
    bitClear= document.getElementById('bitClear');
    if (bitApply && !bitApply._wired) {
      bitApply._wired = true;
      bitApply.addEventListener('click', ()=>{ const rows = applyBitFilters(listaBitacora); renderBitacora(rows); });
    }
    if (bitClear && !bitClear._wired) {
      bitClear._wired = true;
      bitClear.addEventListener('click', ()=>{ if (bitFrom) bitFrom.value=''; if (bitTo) bitTo.value=''; if (bitQ) bitQ.value=''; renderBitacora(listaBitacora); });
    }
  }
  function applyBitFilters(all){
    const from = bitFrom?.value ? new Date(bitFrom.value+'T00:00:00') : null;
    const to   = bitTo?.value   ? new Date(bitTo.value  +'T23:59:59') : null;
    const q    = (bitQ?.value||'').trim().toLowerCase();
    return (all||[]).filter(r=>{
      const d = r.fecha ? new Date(r.fecha) : null;
      if (from && d && d < from) return false;
      if (to   && d && d > to)   return false;
      if (q){
        const afect = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
        const hecho = __pick(r,'hechoPor','hecho_por','actor','hecho') || '';
        const det   = formatBitacoraDetalles(r.accion || r.action || '', __pick(r,'detalles','detalle','details'));
        const line = `${r.accion||''} ${afect} ${hecho} ${det}`.toLowerCase();
        if (!line.includes(q)) return false;
      }
      return true;
    });
  }

  let listaUsuarios = [];
  let listaBitacora = [];
  window.getUsuarios = () => listaUsuarios;
  window.getBitacora = () => listaBitacora;

  // ====== PERMISOS ======
  const FIXED_PERMS = [
    { key: 'action:view',   label: 'Ver registros' },
    { key: 'action:create', label: 'Crear registros' },
    { key: 'action:edit',   label: 'Editar registros' },
    { key: 'action:delete', label: 'Eliminar registros' },
    { key: 'bitacora:leer', label: 'Ver Bitácora' },
    { key: 'usuarios:admin', label: 'Administrar Usuarios' },
  ];

  // === Plantillas de roles ===
  const ROLE_TEMPLATES = {
    administrador: [
      'usuarios:admin','bitacora:leer',
      'action:view','action:create','action:edit','action:delete',
      'page:usuarios','page:crear-orden','page:listado-ordenes','page:admin','page:inventario'
    ],
    mecanico: [ 'action:view','action:edit','bitacora:leer','page:crear-orden','page:listado-ordenes' ],
    recepcion:[ 'action:view','action:create','bitacora:leer','page:crear-orden','page:listado-ordenes','page:usuarios' ],
    gerencia: [ 'action:view','bitacora:leer','page:listado-ordenes','page:usuarios','page:admin' ],
    calidad:  [ 'action:view','action:edit','bitacora:leer','page:listado-ordenes' ],
    bodega:   [ 'action:view','action:edit','page:inventario','page:listado-ordenes' ],
  };

  function discoverPagePerms() {
    const items = [];
    document.querySelectorAll('a[id^="nav"]').forEach(a => {
      const key = 'page:' + a.id.replace(/^nav/, '').toLowerCase();
      const label = (a.textContent || a.id).trim();
      items.push({ key, label });
    });
    document.querySelectorAll('[data-page-key]').forEach(el => {
      const raw = String(el.getAttribute('data-page-key')||'').trim();
      if (!raw) return;
      const key = raw.startsWith('page:') ? raw.toLowerCase() : ('page:' + raw.toLowerCase());
      const label = (el.textContent || raw).trim();
      items.push({ key, label });
    });
    const custom = loadCustomPages();
    custom.forEach(p => { const key = 'page:' + normalizeSlug(p.slug); const label = String(p.label || p.slug).trim(); items.push({ key, label }); });
    if (!items.length && Array.isArray(window.APP_PAGES)) {
      window.APP_PAGES.forEach(k => { const key = 'page:' + String(k).toLowerCase(); const label = String(k).replace(/[_-]/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); items.push({ key, label }); });
    }
    const seen = new Set();
    return items.filter(p => !seen.has(p.key) && seen.add(p.key));
  }

  // ====== MODAL Permisos ======
  let PERM_MODAL, PERM_BODY;
  function ensurePermModal() {
    if (PERM_MODAL) return;
    const wrap = document.createElement('div');
    wrap.id = 'modalPerms';
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__card" role="dialog" aria-modal="true">
        <div class="modal__header">
          <h3 class="modal__title">Permisos</h3>
          <button class="modal__close" title="Cerrar" id="permCloseBtn">✕</button>
        </div>
        <div class="modal__sub" id="permUserLabel"></div>
        <div class="modal__body" id="permBody"></div>
        <div class="modal__footer">
          <button id="btnSavePerms" class="btn btn-primary">Guardar</button>
          <button id="btnCancelPerms" class="btn">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    PERM_MODAL = wrap;
    PERM_BODY = $('#permBody');

    $('#permCloseBtn').onclick = closePermModal;
    $('#btnCancelPerms').onclick = closePermModal;
  }
  function openPermModal(){ ensurePermModal(); PERM_MODAL.classList.add('open'); }
  function closePermModal(){ PERM_MODAL && PERM_MODAL.classList.remove('open'); }

  function collectModalPerms() {
    return Array.from(document.querySelectorAll('#modalPerms input.perm-chk:checked')).map(chk => chk.value);
  }

  function renderPermModal(user) {
    ensurePermModal();
    $('#permUserLabel').textContent = `${user.usuario} — ${user.nombre}`;
    const current = new Set(Array.isArray(user.permisos) ? user.permisos : []);
    const pages = discoverPagePerms();

    const mk = (perm, text, checked, title='') =>
      `<label class="perm-item" title="${escapeHtml(title || perm)}">
        <input type="checkbox" class="perm-chk" value="${perm}" ${checked ? 'checked' : ''}>
        ${escapeHtml(text)}
      </label>`;

    const htmlAcciones = `
      <div class="perm-group">
        <h4>Acciones globales</h4>
        <div class="perm-grid">
          ${FIXED_PERMS.map(p => mk(p.key, p.label, current.has(p.key))).join('')}
        </div>
        <small style="opacity:.8">Si marcas “Editar/Crear/Eliminar”, aplica en las páginas a las que tenga acceso.</small>
      </div>
    `;

    const custom = loadCustomPages();
    const chips = custom.length
      ? custom.map(p=>`
          <span class="perm-chip">
            ${escapeHtml(p.label || p.slug)}
            <button type="button" class="btnDelPage" data-slug="${escapeHtml(p.slug)}" title="Quitar">✕</button>
          </span>
        `).join('')
      : '<em>No hay páginas personalizadas (aún).</em>';

    const htmlPaginas = `
      <div class="perm-group">
        <h4>Acceso a páginas</h4>
        <div class="perm-grid">
          ${pages.length ? pages.map(p => mk(p.key, p.label, current.has(p.key), p.key)).join('') : '<em>No se detectaron páginas.</em>'}
        </div>

        <div class="perm-add">
          <input id="permPageSlug" placeholder="clave (ej. ordenes)" />
          <input id="permPageLabel" placeholder="Etiqueta visible (ej. Órdenes)" />
          <button type="button" id="btnAddPage">+ Agregar página</button>
          <div class="hint">Se guarda localmente. Clave: minúsculas, guiones, sin caracteres raros.</div>
        </div>
        <div id="permPageChips">${chips}</div>
      </div>
    `;

    const tplBar = `
      <div class="perm-group" style="margin-bottom:8px">
        <h4>Plantillas de rol</h4>
        <div class="perm-templates" style="display:flex;flex-wrap:wrap;gap:8px">
          ${Object.keys(ROLE_TEMPLATES).map(k=>`<button type="button" class="btn tpl-btn" data-role="${k}">${ucFirst(k)}</button>`).join('')}
          <button type="button" class="btn" id="tplClear">Limpiar selección</button>
        </div>
      </div>
    `;

    PERM_BODY.innerHTML = tplBar + htmlAcciones + htmlPaginas;

    // Wiring de plantillas / chips
    PERM_BODY.querySelectorAll('.tpl-btn').forEach(b=>{
      b.onclick = ()=>{
        const role = b.getAttribute('data-role');
        const set = new Set(ROLE_TEMPLATES[role] || []);
        PERM_BODY.querySelectorAll('input.perm-chk').forEach(chk=>{
          const val = chk.value;
          chk.checked = set.has(val) || chk.checked;
        });
        const meUser = getUsuarioActual();
        if (meUser && meUser === user.usuario) {
          const adminChk = PERM_BODY.querySelector('input.perm-chk[value="usuarios:admin"]');
          if (adminChk) adminChk.checked = true;
        }
      };
    });
    const btnClear = document.getElementById('tplClear');
    btnClear && (btnClear.onclick = ()=>{
      PERM_BODY.querySelectorAll('input.perm-chk').forEach(chk=>chk.checked=false);
      const meUser = getUsuarioActual();
      if (meUser && meUser === user.usuario && String(sesionActual()?.rol||'').toLowerCase()==='administrador') {
        const adminChk = PERM_BODY.querySelector('input.perm-chk[value="usuarios:admin"]');
        if (adminChk) adminChk.checked = true;
      }
    });

    const btnAdd = document.getElementById('btnAddPage');
    btnAdd && (btnAdd.onclick = () => {
      const keep = new Set(collectModalPerms());
      const slug = normalizeSlug(document.getElementById('permPageSlug').value);
      const label = String(document.getElementById('permPageLabel').value||'').trim() || slug;
      if (!slug) return alert('Clave inválida. Usa letras/números, guiones o guion bajo.');
      let list = loadCustomPages();
      if (list.some(p=>normalizeSlug(p.slug) === slug)) return alert('Esa clave ya existe.');
      list.push({ slug, label });
      saveCustomPages(list);
      const u2 = { ...user, permisos: Array.from(keep) };
      renderPermModal(u2);
    });

    PERM_BODY.querySelectorAll('.btnDelPage').forEach(btn=>{
      btn.onclick = () => {
        const keep = new Set(collectModalPerms());
        const slug = btn.getAttribute('data-slug');
        let list = loadCustomPages().filter(p => normalizeSlug(p.slug) !== normalizeSlug(slug));
        saveCustomPages(list);
        const u2 = { ...user, permisos: Array.from(keep) };
        renderPermModal(u2);
      };
    });

    // Guardado robusto (sin duplicar handlers)
    const saveBtn = document.getElementById('btnSavePerms');
    if (!saveBtn._wired) {
      saveBtn._wired = true;
      saveBtn.addEventListener('click', async ()=>{
        try {
          const permisos = collectModalPerms();
          const meUser = getUsuarioActual();
          const soyYo = (meUser && meUser === user.usuario);
          const soyAdminActual = String(sesionActual()?.rol || '').toLowerCase() === 'administrador';
          if (soyYo && soyAdminActual && !permisos.includes('usuarios:admin')) {
            showToast('No puedes quitarte el permiso de administrador a ti mismo.','warning');
            return;
          }
          saveBtn.disabled = true;
          await API.UsuariosAPI.actualizarPermisos(user.id, permisos);

          if (soyYo) {
            let meObj = {}; try { meObj = JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch {}
            meObj.permisos = permisos;
            localStorage.setItem('usuarioActual', JSON.stringify(meObj));
            showToast('Se actualizaron tus permisos. Se recargará la página.','success');
            window.__requestAppReload ? window.__requestAppReload(650) : setTimeout(()=>location.reload(), 650);
            return;
          }

          await Promise.all([ cargarUsuarios(document.querySelector('#buscarUsuario')?.value || ''), cargarBitacora() ]);
          closePermModal();
          showToast('Permisos actualizados.','success');
        } catch (err) {
          showToast(err.message || 'Error al actualizar permisos','error');
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  }

  // ===== Skeletons / Empty =====
  function renderSkeletonRows(tbodyEl, cols, rows=6){
    if (!tbodyEl) return;
    tbodyEl.innerHTML = "";
    for(let i=0;i<rows;i++){
      const tr = __create('tr', { class:'skel-row skel' });
      for(let c=0;c<cols;c++){ tr.appendChild(__create('td')); }
      tbodyEl.appendChild(tr);
    }
  }
  function renderEmptyRow(tbodyEl, cols, msg="No hay datos"){
    if (!tbodyEl) return;
    const tr = __create('tr', { class:'empty-row' });
    const td = __create('td', { colspan:String(cols), text:msg });
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
  }

  // ===== Paginador =====
  function ensurePaginador(key){
    const table = key==='usuarios' ? $('#tablaUsuarios') : $('#tablaBitacora');
    if(!table) return null;
    let cont = document.getElementById(`paginador-${key}`);
    if(!cont){
      cont = __create('div', { id:`paginador-${key}`, class:'paginator' });
      table.parentElement.appendChild(cont);
    }
    return cont;
  }
  function buildPaginador(container, state, onChange){
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    container.innerHTML = "";

    const prev = __create('button', { class:'btn', text:'« Anterior' });
    prev.disabled = state.page <= 1;
    const next = __create('button', { class:'btn', text:'Siguiente »' });
    next.disabled = state.page >= maxPage;

    const pageInfo = __create('span', { class:'meta', text:`Página ${state.page} de ${maxPage} · ${state.total} registros` });

    const sel = __create('select');
    [5,10,20,50,100].forEach(n=>{
      const opt = __create('option', { value:String(n), text:String(n) });
      if(n===state.pageSize) opt.selected = true;
      sel.appendChild(opt);
    });
    const selLabel = __create('span', { class:'meta', text:'Por página:' });

    prev.addEventListener('click', ()=>{ if(state.page>1){ state.page--; onChange(); }});
    next.addEventListener('click', ()=>{ if(state.page<maxPage){ state.page++; onChange(); }});
    sel.addEventListener('change', ()=>{ state.pageSize = parseInt(sel.value,10) || 10; state.page = 1; onChange(); });

    container.appendChild(prev); container.appendChild(next);
    container.appendChild(pageInfo); container.appendChild(selLabel); container.appendChild(sel);
  }

  // ====== Tabla Usuarios ======
  function renderUsuarios() {
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!listaUsuarios.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7">Sin usuarios</td>`;
      tbody.appendChild(tr);
      return;
    }
    const baseIndex = ((pagUsuarios.page || 1) - 1) * (pagUsuarios.pageSize || listaUsuarios.length || 10);

    listaUsuarios.forEach((u, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = String(u.id);

      const estadoBool = (typeof u.estado === 'boolean') ? u.estado
                         : (String(u.estado ?? '').toLowerCase() === 'activo' || String(u.estado ?? '') === '1' || String(u.estado ?? '').toLowerCase() === 'true');

      const estadoHtml = `<span class="status-pill ${estadoBool ? 'status-on' : 'status-off'}">${estadoBool ? 'Activo' : 'Inactivo'}</span>`;
      const lastAcc = u.ultimoAcceso || u.ultimoacceso || u['ultimo acceso'] || u.lastAccess || null;

      tr.innerHTML = `
        <td>${baseIndex + idx + 1}</td>
        <td>${escapeHtml(u.usuario)}</td>
        <td title="${escapeHtml(u.nombre)}">${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(ucFirst(u.rol))}</td>
        <td>${estadoHtml}</td>
        <td>${fmtFecha(lastAcc)}</td>
        <td class="td-acciones">
          <button class="kebab-btn btn-menu" title="Acciones">⋮</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }
// === frontend/js/usuarios-admin.js — PARTE 2/3 ===

  // ===== Bitácora (render legible) =====
  function renderBitacora(rows) {
    if (!tbodyBit) return;
    tbodyBit.innerHTML = '';
    if (!rows || !rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5">Sin registros</td>`;
      tbodyBit.appendChild(tr);
      return;
    }
    rows.forEach(r => {
      const accion = r.accion || r.action || '';
      const afect  = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
      const hecho  = __pick(r,'hechoPor','hecho_por','actor','hecho') || '';
      const detallesR = __pick(r,'detalles','detalle','details');
      const detTxt = formatBitacoraDetalles(accion, detallesR);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtFecha(r.fecha)}</td>
        <td>${escapeHtml(accion)}</td>
        <td>${escapeHtml(afect)}</td>
        <td>${escapeHtml(hecho)}</td>
        <td>${escapeHtml(detTxt)}</td>`;
      tbodyBit.appendChild(tr);
    });
  }

  // --- Menú expandible bajo la fila (lista) ---
  function closeMenuRows() { document.querySelectorAll('tr.menu-row').forEach(r => r.remove()); }
  function toggleMenuRow(tr, u) {
    const next = tr.nextElementSibling;
    const isOpen = next && next.classList && next.classList.contains('menu-row');
    closeMenuRows();
    if (isOpen) return;

    const row = document.createElement('tr');
    row.className = 'menu-row';
    const td = document.createElement('td');
    td.colSpan = 7;
    const activar = (typeof u.estado === 'boolean') ? (u.estado ? 0 : 1)
                    : (String(u.estado ?? '').toLowerCase() === 'activo' || String(u.estado ?? '') === '1' || String(u.estado ?? '').toLowerCase() === 'true' ? 0 : 1);
    const labelToggle = activar ? 'Activar' : 'Desactivar';
    const iconToggle = activar ? '▶️' : '⏸';
    td.innerHTML = `
      <div class="row-menu">
        <button class="act-editar">✏️ Editar</button>
        <button class="act-toggle" data-next="${activar}">${iconToggle} ${labelToggle}</button>
        <button class="act-reset">🔑 Reiniciar contraseña</button>
        <button class="act-permisos">⚙️ Permisos</button>
        <button class="act-eliminar">🗑️ Eliminar</button>
        <button class="act-bitacora">📒 Ver bitácora</button>
      </div>`;
    row.appendChild(td);
    tr.after(row);
  }

  // ===== Carga paginada =====
  async function cargarUsuarios(q='') {
    if (!tbody) return;

    if (typeof q === 'string') {
      const newQ = q.trim();
      if (newQ !== (pagUsuarios.q||'')) { pagUsuarios.page = 1; }
      pagUsuarios.q = newQ;
    }

    renderSkeletonRows(tbody, 7, 6);

    const url = new URL(`${API_BASE}/usuarios`);
    url.searchParams.set('page', String(pagUsuarios.page));
    url.searchParams.set('pageSize', String(pagUsuarios.pageSize));
    if (pagUsuarios.q) url.searchParams.set('q', pagUsuarios.q);

    let resp;
    try{
      const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('access_token');
      const headers = { ...actorHeaders(), Accept:'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      resp = await fetch(url.toString(), { headers, mode:'cors', credentials:'omit' });
    }catch(e){
      console.error('[usuarios] fetch error', e);
      renderEmptyRow(tbody, 7, 'Error de red cargando usuarios');
      return;
    }

    let json = null;
    try { json = await resp.json(); } catch {}
    if (!resp.ok) {
      const msg = (json && (json.error||json.message)) || `HTTP ${resp.status}`;
      console.warn('[usuarios] error', msg);
      renderEmptyRow(tbody, 7, msg || 'Error cargando usuarios');
      return;
    }

    let items = [];
    let total = 0, page = pagUsuarios.page, pageSize = pagUsuarios.pageSize;

    if (Array.isArray(json)) {
      const all = json;
      total = all.length;
      page = Math.max(1, Number(pagUsuarios.page) || 1);
      pageSize = Math.max(1, Number(pagUsuarios.pageSize) || 10);
      const start = (page - 1) * pageSize;
      items = all.slice(start, start + pageSize);
    } else {
      items = Array.isArray(json.items) ? json.items : [];
      total = Number(json.total || items.length || 0);
      page = Number(json.page || pagUsuarios.page);
      pageSize = Number(json.pageSize || pagUsuarios.pageSize);
    }

    pagUsuarios.total = total;
    pagUsuarios.page = page;
    pagUsuarios.pageSize = pageSize;

    if (!items.length) {
      renderEmptyRow(tbody, 7, pagUsuarios.q ? 'Sin resultados para tu búsqueda' : 'Aún no hay usuarios');
      const cont = ensurePaginador('usuarios');
      cont && buildPaginador(cont, pagUsuarios, ()=>cargarUsuarios(pagUsuarios.q||'')); listaUsuarios = [];
      return;
    }

    listaUsuarios = items;
    renderUsuarios();

    const cont = ensurePaginador('usuarios');
    cont && buildPaginador(cont, pagUsuarios, ()=>cargarUsuarios(pagUsuarios.q||'')); closeMenuRows();
  }

  async function cargarBitacora() {
    if (!tbodyBit) return;

    renderSkeletonRows(tbodyBit, 5, 6);

    const url = new URL(`${API_BASE}/bitacora`);
    url.searchParams.set('page', String(pagBitacora.page));
    url.searchParams.set('pageSize', String(pagBitacora.pageSize));
    if (pagBitacora.q) url.searchParams.set('q', pagBitacora.q);

    let resp;
    try{
      const token = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('access_token');
      const headers = { ...actorHeaders(), Accept:'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      resp = await fetch(url.toString(), { headers, mode:'cors', credentials:'omit' });
    }catch(e){
      console.error('[bitacora] fetch error', e);
      renderEmptyRow(tbodyBit, 5, 'Error de red cargando bitácora');
      return;
    }

    let json=null;
    try { json = await resp.json(); } catch {}
    if (!resp.ok) {
      const msg = (json && (json.error||json.message)) || `HTTP ${resp.status}`;
      if (/bitacora/i.test(String(msg)) && /does not exist/i.test(String(msg))) {
        renderEmptyRow(tbodyBit, 5, 'La bitácora aún no está habilitada en el servidor.');
        return;
      }
      renderEmptyRow(tbodyBit, 5, msg || 'Error cargando bitácora'); return;
    }

    let items = [];
    let total = 0, page = pagBitacora.page, pageSize = pagBitacora.pageSize;

    if (Array.isArray(json)) {
      const all = json;
      total = all.length;
      page = Math.max(1, Number(pagBitacora.page) || 1);
      pageSize = Math.max(1, Number(pagBitacora.pageSize) || 10);
      const start = (page - 1) * pageSize;
      items = all.slice(start, start + pageSize);
    } else {
      items = Array.isArray(json.items) ? json.items : [];
      total = Number(json.total || items.length || 0);
      page = Number(json.page || pagBitacora.page);
      pageSize = Number(json.pageSize || pagBitacora.pageSize);
    }

    pagBitacora.total = total;
    pagBitacora.page = page;
    pagBitacora.pageSize = pageSize;

    if (!items.length) {
      renderEmptyRow(tbodyBit, 5, pagBitacora.q ? 'Sin resultados' : 'Aún no hay registros');
      const cont = ensurePaginador('bitacora');
      cont && buildPaginador(cont, pagBitacora, cargarBitacora);
      listaBitacora = []; return;
    }

    listaBitacora = items;
    const filtered = applyBitFilters ? applyBitFilters(listaBitacora) : listaBitacora;
    renderBitacora(filtered);

    const cont = ensurePaginador('bitacora');
    cont && buildPaginador(cont, pagBitacora, cargarBitacora);
  }

  // ===== Modal "Bitácora del usuario" (desde menú) =====
  function ensureBitacoraUsuarioModal(){
    let dlg = document.getElementById('dlgBitacoraUsuario');
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'dlgBitacoraUsuario';
    dlg.style.cssText = 'width:min(980px,92vw);border-radius:12px;padding:0;border:0';
    dlg.innerHTML = `
      <form method="dialog" style="margin:0">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eee">
          <strong id="bitUserTitle" style="font-size:16px">Bitácora</strong>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button id="btuCsv" type="button" class="btn">Exportar CSV</button>
            <button id="btuClose" class="btn" value="close">Cerrar</button>
          </div>
        </div>
        <div style="max-height:min(70vh,520px);overflow:auto">
          <table class="table" style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Fecha</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Acción</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Usuario afectado</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Hecha por</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Detalles</th>
              </tr>
            </thead>
            <tbody id="bitUserTbody"></tbody>
          </table>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.querySelector('#btuClose').addEventListener('click', ()=>dlg.close());
    return dlg;
  }

  async function abrirBitacoraDeUsuario(usuario){
    const dlg = ensureBitacoraUsuarioModal();
    dlg.querySelector('#bitUserTitle').textContent = `Bitácora — ${usuario}`;
    const tb = dlg.querySelector('#bitUserTbody');
    tb.innerHTML = `<tr><td colspan="5">Cargando…</td></tr>`;

    let rows = [];
    try { rows = await API.BitacoraAPI.listarPorUsuario(usuario); } catch { rows = []; }

    tb.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5">Sin registros para este usuario</td>`;
      tb.appendChild(tr);
    } else {
      rows.forEach(r=>{
        const acc = r.accion || r.action || '';
        const afect = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
        const actor = __pick(r,'hechoPor','hecho_por','actor','hecho') || '';
        const det   = formatBitacoraDetalles(acc, __pick(r,'detalles','detalle','details'));
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid #f1f1f1">${fmtFecha(r.fecha)}</td>
          <td style="padding:8px;border-bottom:1px solid #f1f1f1">${escapeHtml(acc)}</td>
          <td style="padding:8px;border-bottom:1px solid #f1f1f1">${escapeHtml(afect)}</td>
          <td style="padding:8px;border-bottom:1px solid #f1f1f1">${escapeHtml(actor)}</td>
          <td style="padding:8px;border-bottom:1px solid #f1f1f1">${escapeHtml(det)}</td>`;
        tb.appendChild(tr);
      });
    }

    dlg.querySelector('#btuCsv').onclick = ()=>{
      const meta = [
        [BRAND.nombre],
        ['Reporte:', `Bitácora de ${usuario}`],
        ['Generado:', nowStr()],
        ['Por:', actorNombre()],
        ['']
      ];
      const data = [
        ['Fecha','Acción','Usuario afectado','Hecha por','Detalles'],
        ...rows.map(r=>{
          const acc = r.accion || r.action || '';
          const afect = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
          const actor = __pick(r,'hechoPor','hecho_por','actor','hecho') || '';
          const det   = formatBitacoraDetalles(acc, __pick(r,'detalles','detalle','details'));
          return [fmtFecha(r.fecha), acc, afect, actor, det];
        })
      ];
      descargarCSV([...meta, ...data], `bitacora-${usuario}-${hoy()}.csv`);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open','');
  }

  // Hook global invocado por el menú “📒 Ver bitácora”
  window.accionVerBitacora = async function(idUsuario){
    let u = (window.getUsuarios?.() || []).find(x => Number(x.id) === Number(idUsuario));
    if (!u) { try { u = await API.UsuariosAPI.obtener(idUsuario); } catch {} }
    const usuario = u?.usuario || String(idUsuario);
    abrirBitacoraDeUsuario(usuario);
  };

  // --- Crear ---
  formCrear && formCrear.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = $('#usuario').value.trim();
    const nombre = $('#nombre').value.trim();
    const email  = ($('#email')?.value || '').trim().toLowerCase();
    const rol = $('#rol').value;
    const password = $('#password').value;
    const forzarCambio = $('#forzarCambio').checked;

    if (!usuario || !nombre || !email || !rol || !password) {
      showToast('Completa todos los campos.','warning'); return msgCrear('Completa todos los campos.');
    }
    if (!isValidEmail(email)) {
      showToast('El correo electrónico no es válido.','warning'); return msgCrear('El correo electrónico no es válido.');
    }

    try {
      await API.UsuariosAPI.crear({ usuario, nombre, email, rol, password, forzarCambio });
      e.target.reset(); msgCrear('');
      pagUsuarios.page = 1;
      await cargarUsuarios(inpBuscar?.value || '');
      await cargarBitacora();
      showToast('Usuario creado correctamente.','success');
    } catch (err) { msgCrear(err.message || 'Error al crear usuario'); showToast(err.message,'error'); }
  });
  function msgCrear(t){ const n=$('#msgFormCrear'); if(n) n.textContent=t||''; }

  // --- Tabla: abrir/cerrar menú ---
  tbody && tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-menu');
    if (!btn) return;
    const tr = btn.closest('tr'); if (!tr) return;
    const id = Number(tr.dataset.id);
    const u = listaUsuarios.find(x => x.id === id);
    if (!u) return;
    toggleMenuRow(tr, u);
  });

  // --- Acciones del menú (lista) ---
  tbody && tbody.addEventListener('click', async (e) => {
    const actBtn = e.target.closest('.menu-row .row-menu button');
    if (!actBtn) return;
    const row = actBtn.closest('tr.menu-row');
    const tr = row?.previousElementSibling;
    const id = Number(tr?.dataset.id);
    if (!id) return;

    const u = listaUsuarios.find(x=>x.id===id);
    if (!u) return;

    if (actBtn.classList.contains('act-editar')) { closeMenuRows(); abrirEditar(id); return; }

    if (actBtn.classList.contains('act-toggle')) {
      if (u.usuario === getUsuarioActual()) { showToast('No puedes desactivarte a ti mismo.','warning'); return; }
      const next = Number(actBtn.getAttribute('data-next')) || ((typeof u.estado==='boolean') ? (u.estado?0:1) :
                    (String(u.estado ?? '').toLowerCase() === 'activo' || String(u.estado ?? '') === '1' || String(u.estado ?? '').toLowerCase() === 'true' ? 0 : 1));
      try {
        await API.UsuariosAPI.estado(id, next);
        await cargarUsuarios(inpBuscar?.value || '');
        await cargarBitacora();
        showToast(next? 'Usuario activado.' : 'Usuario desactivado.','info');
      } catch(err){ showToast(err.message,'error'); }
      closeMenuRows(); return;
    }

    if (actBtn.classList.contains('act-reset')) {
      const ok = await showConfirm('¿Reiniciar la contraseña de este usuario? Se forzará cambio al próximo inicio.');
      if (!ok) return;
      try {
        const r = await API.UsuariosAPI.resetPass(id);
        const html = `<div class="code-box">${escapeHtml(r.nueva)}</div><div style="margin-top:8px;color:#555">Guárdala y compártela de forma segura.</div>`;
        await showInfoModal('Contraseña temporal generada', html);
        await cargarBitacora();
      } catch(err){ showToast(err.message,'error'); }
      closeMenuRows(); return;
    }

    if (actBtn.classList.contains('act-permisos')) {
      try { const user = await API.UsuariosAPI.obtener(id); renderPermModal(user); openPermModal(); }
      catch (err) { showToast(err.message || 'No se pudo abrir permisos','error'); }
      return;
    }

    if (actBtn.classList.contains('act-eliminar')) {
      if (u.usuario === getUsuarioActual()) { showToast('No puedes eliminar tu propia cuenta.','warning'); return; }
      const ok = await showConfirm('¿Eliminar este usuario? Esta acción no se puede deshacer.');
      if (!ok) return;
      try {
        await API.UsuariosAPI.eliminar(id);
        if (listaUsuarios.length === 1 && pagUsuarios.page > 1) pagUsuarios.page--;
        await cargarUsuarios(inpBuscar?.value || '');
        await cargarBitacora();
        showToast('Usuario eliminado.','success');
      } catch(err){ showToast(err.message,'error'); }
      closeMenuRows(); return;
    }

    if (actBtn.classList.contains('act-bitacora')) {
      if (typeof window.accionVerBitacora === 'function') window.accionVerBitacora(u.id);
      else showToast('Abriendo bitácora…','info');
      closeMenuRows(); return;
    }
  });

  // --- Drawer editar ---
  async function abrirEditar(id){
    try{
      const u = await API.UsuariosAPI.obtener(id);
      $('#editId').value = u.id;
      $('#editUsuario').value = u.usuario;
      $('#editNombre').value = u.nombre;
      $('#editRol').value = u.rol;
      if (document.getElementById('editEmail')) document.getElementById('editEmail').value = (u.email || '');
      $('#editPassword').value = '';
      const fc = (typeof u.forzarCambio !== 'undefined') ? u.forzarCambio : u.forzarcambio;
      $('#editForzarCambio').checked = !!fc;
      drawer && drawer.classList.add('open');
      drawer && drawer.setAttribute('aria-hidden','false');
    }catch(e){ showToast(e.message,'error'); }
  }
  function cerrarDrawer(){
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    const m = $('#msgFormEditar'); if (m) m.textContent='';
  }
  window.abrirEditar = abrirEditar;
  window.cerrarDrawer = cerrarDrawer;

  btnCerrarDrawer && btnCerrarDrawer.addEventListener('click', cerrarDrawer);
  btnCancelarEdit && btnCancelarEdit.addEventListener('click', cerrarDrawer);

  let __savingEdit = false;
  formEditar && formEditar.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (__savingEdit) return;

    const idRaw = $('#editId')?.value;
    const id = Number(idRaw);
    const nombre = $('#editNombre')?.value?.trim();
    const rol = $('#editRol')?.value;
    const password = $('#editPassword')?.value;
    const forzarCambio = $('#editForzarCambio')?.checked;
    const email = ($('#editEmail')?.value || '').trim().toLowerCase();

    if (!Number.isFinite(id) || id <= 0) {
      msgEditar('ID de usuario inválido. Vuelve a abrir la edición.');
      showToast('ID de usuario inválido (no se pudo determinar).','error');
      console.warn('guardarEdicion(): editId inválido ->', idRaw);
      return;
    }
    if (!nombre || !rol) { showToast('Completa los campos requeridos.','warning'); return msgEditar('Completa los campos requeridos.'); }
    if (document.getElementById('editEmail')) {
      if (!email) { showToast('El correo electrónico es obligatorio.','warning'); return msgEditar('El correo electrónico es obligatorio.'); }
      if (!isValidEmail(email)) { showToast('El correo electrónico no es válido.','warning'); return msgEditar('El correo electrónico no es válido.'); }
    }

    const btn = btnGuardarEdit;
    btn && (btn.disabled = true);
    __savingEdit = true;

    try{
      const body = { nombre, rol, forzarCambio };
      if (password) body.password = password;
      if (document.getElementById('editEmail')) body.email = email;

      const me = sesionActual() || {};
      const editedUser = $('#editUsuario').value?.trim();
      const soyYo = (me?.usuario || '') === (editedUser || '');
      const eraAdmin = String(me?.rol || '').toLowerCase() === 'administrador';
      const nuevoEsAdmin = String(rol || '').toLowerCase() === 'administrador';
      if (soyYo && eraAdmin && !nuevoEsAdmin) {
        msgEditar('No puedes quitarte el rol de administrador a ti mismo.');
        showToast('No puedes quitarte el rol de administrador a ti mismo.','warning');
        btn && (btn.disabled = false);
        __savingEdit = false;
        return;
      }

      await API.UsuariosAPI.actualizar(id, body);

      let meObj = {}; try { meObj = JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch {}
      if (meObj && meObj.usuario === editedUser) {
        meObj.nombre = nombre; meObj.rol = rol;
        if (body.email) meObj.email = body.email;
        localStorage.setItem('usuarioActual', JSON.stringify(meObj));
        showToast('Se actualizaron tus datos. Se recargará la página.','success');
        window.__requestAppReload ? window.__requestAppReload(650) : setTimeout(()=>location.reload(), 650);
        return;
      }

      msgEditar(''); cerrarDrawer();
      await cargarUsuarios(inpBuscar?.value || '');
      await cargarBitacora();
      showToast('Cambios guardados.','success');
    }catch(err){
      msgEditar(err.message || 'Error al guardar');
      showToast(err.message || 'Error al guardar','error');
    }finally{
      __savingEdit = false;
      btn && (btn.disabled = false);
    }
  });
  function msgEditar(t){ const n=$('#msgFormEditar'); if(n) n.textContent=t||''; }
// === frontend/js/usuarios-admin.js — PARTE 3/3 ===

  // --- Buscar / refrescar ---
  let buscarTimer;
  const inpBuscar = document.getElementById('buscarUsuario') || document.getElementById('buscarUsuario'); // safety
  inpBuscar && inpBuscar.addEventListener('input', ()=>{
    clearTimeout(buscarTimer);
    buscarTimer = setTimeout(()=>{ pagUsuarios.page = 1; cargarUsuarios(inpBuscar.value.trim()); }, 250);
  });
  btnRefrescar && btnRefrescar.addEventListener('click', ()=>cargarUsuarios(inpBuscar?.value || ''));

  // --- Exportar: CSV ---
  btnExportUsuariosCsv && btnExportUsuariosCsv.addEventListener('click', ()=>{
    const meta = [
      [BRAND.nombre],
      ['Reporte:', 'Usuarios'],
      ['Generado:', nowStr()],
      ['Por:', actorNombre()],
      ['']
    ];
    const rows = [
      ['#','Usuario','Nombre','Rol','Estado','Último acceso'],
      ...listaUsuarios.map((u,i)=>{
        const estadoTxt = ((typeof u.estado==='boolean') ? (u.estado?'Activo':'Inactivo')
          : (String(u.estado ?? '').toLowerCase() === 'activo' || String(u.estado ?? '') === '1' || String(u.estado ?? '').toLowerCase() === 'true' ? 'Activo' : 'Inactivo'));
        const lastAcc = u.ultimoAcceso || u.ultimoacceso || u['ultimo acceso'] || u.lastAccess || null;
        return [ ((pagUsuarios.page-1)*pagUsuarios.pageSize) + i + 1, u.usuario, u.nombre, u.rol, estadoTxt, fmtFecha(lastAcc) ];
      })
    ];
    descargarCSV([...meta, ...rows], `usuarios-${hoy()}.csv`);
  });

  btnExportBitacoraCsv && btnExportBitacoraCsv.addEventListener('click', async ()=>{
    const meta = [
      [BRAND.nombre],
      ['Reporte:', 'Bitácora'],
      ['Generado:', nowStr()],
      ['Por:', actorNombre()],
      ['']
    ];
    const fallback = await API.BitacoraAPI.listar().catch(()=>[]);
    const rows = listaBitacora.length ? listaBitacora : fallback;
    const data = [
      ['Fecha','Acción','Usuario afectado','Hecho por','Detalles'],
      ...rows.map(r=>{
        const accion = r.accion || r.action || '';
        const afect  = __pick(r,'usuarioAfectado','usuario_afectado','user','usuario') || '';
        const hecho  = __pick(r,'hechoPor','hecho_por','actor','hecho') || '';
        const detTxt = formatBitacoraDetalles(accion, __pick(r,'detalles','detalle','details'));
        return [ fmtFecha(r.fecha), accion, afect, hecho, detTxt ];
      })
    ];
    descargarCSV([...meta, ...data], `bitacora-${hoy()}.csv`);
  });

  // --- Exportar: Imprimir ---
  btnExportUsuarios && btnExportUsuarios.addEventListener('click', ()=>imprimirTabla('#tablaUsuarios','Usuarios - Taller RCV'));
  btnExportBitacora && btnExportBitacora.addEventListener('click', ()=>imprimirTabla('#tablaBitacora','Bitácora - Taller RCV'));

  function imprimirTabla(sel, titulo){
    const el = document.querySelector(sel); if(!el) return;
    const win = window.open('', '_blank');
    const styles = `
      body{font-family:Arial,sans-serif;padding:16px}
      h1{font-size:18px;margin:0 0 12px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}
      thead th{background:#f8fafc}
      .footer{margin-top:8px;font-size:11px;color:#777}
    `;
    win.document.write(`
      <html>
        <head><meta charset="utf-8"><title>${titulo}</title>
        <style>${styles}</style></head>
        <body>
          ${headerHTML(titulo)}
          ${el.outerHTML}
          <div class="footer">© ${new Date().getFullYear()} ${BRAND.nombre}</div>
          <script>
            window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };
          <\/script>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
  }

  function descargarCSV(rows, filename){
    const csv = rows.map(r=>r.map(v=>{
      if(v==null) v='';
      v=String(v).replace(/"/g,'""');
      return /[",\n;]/.test(v) ? `"${v}"` : v;
    }).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      ensurePagStyles();
      ensureBitFilters();
      await cargarUsuarios();
      await cargarBitacora();
      wireBitFilterEvents();
    }catch(e){
      console.error(e);
      showToast('No se pudo cargar usuarios desde la API. ¿Backend activo?','error');
    }

    // ===================== KEBAB MENU (⋮) flotante =====================
    (function () {
      const tabla = document.querySelector('#tablaUsuarios tbody');
      if (!tabla) return;

      let menu = document.getElementById('kebabMenu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'kebabMenu';
        menu.className = 'kebab-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-hidden', 'true');
        menu.style.display = 'none';
        document.body.appendChild(menu);
      }

      let currentBtn = null;
      let currentUser = null;

      function isActivo(u) {
        const v = u?.estado;
        if (typeof v === 'boolean') return v;
        const s = String(v ?? '').toLowerCase();
        return !(s === 'inactivo' || s === '0' || s === 'false' || s === 'off');
      }

      function buildMenu(u) {
        const toggleText = isActivo(u) ? 'Desactivar' : 'Activar';
        const soyYo = (u?.usuario || '') === (getUsuarioActual() || '');
        menu.innerHTML = `
          <button type="button" role="menuitem" data-act="editar">Editar</button>
          <button type="button" role="menuitem" data-act="permisos">Permisos</button>
          <button type="button" role="menuitem" data-act="toggle">${toggleText}</button>
          <button type="button" role="menuitem" data-act="reset">Restablecer contraseña</button>
          <button type="button" role="menuitem" data-act="bitacora">Ver bitácora</button>
          <button type="button" role="menuitem" data-act="eliminar" ${soyYo ? 'disabled aria-disabled="true" title="No puedes eliminar tu propia cuenta"' : ''}>Eliminar</button>
        `;
      }

      function positionMenu(btn) {
        menu.style.display = 'block';
        menu.setAttribute('aria-hidden', 'false');

        const rect = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;

        let left = window.scrollX + rect.left;
        let top  = window.scrollY + rect.bottom + 6;

        if (left + mw > window.scrollX + vw) left = window.scrollX + rect.right - mw;
        if (top + mh > window.scrollY + vh)   top  = window.scrollY + rect.top - mh - 6;

        menu.style.left = `${left}px`;
        menu.style.top  = `${top}px`;

        const first = menu.querySelector('button[role="menuitem"]:not([disabled])');
        first?.focus();
      }

      function openKebabMenu(btn, u) {
        if (!u) return;
        closeKebabMenu();
        currentBtn = btn;
        currentUser = u;
        currentBtn.setAttribute('aria-expanded', 'true');
        buildMenu(u);
        positionMenu(btn);
        bindOutsideHandlers(true);
      }

      function closeKebabMenu() {
        if (!menu) return;
        menu.style.display = 'none';
        menu.setAttribute('aria-hidden', 'true');
        if (currentBtn) currentBtn.setAttribute('aria-expanded', 'false');
        currentBtn?.focus();
        currentBtn = null;
        currentUser = null;
        bindOutsideHandlers(false);
      }

      function bindOutsideHandlers(enable) {
        const onDocClick = (e) => { if (!menu.contains(e.target) && e.target !== currentBtn) closeKebabMenu(); };
        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); closeKebabMenu(); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
            if (!items.length) return;
            const i = items.indexOf(document.activeElement);
            let next = 0;
            if (e.key === 'ArrowDown') next = (i + 1) % items.length;
            if (e.key === 'ArrowUp')   next = (i - 1 + items.length) % items.length;
            items[next].focus();
          }
        };
        const onScroll = () => closeKebabMenu();
        const onResize = () => closeKebabMenu();

        if (enable) {
          document.addEventListener('click', onDocClick);
          document.addEventListener('keydown', onKey);
          window.addEventListener('scroll', onScroll, true);
          window.addEventListener('resize', onResize);

          menu._off = () => {
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            menu._off = null;
          };
        } else if (menu._off) {
          menu._off();
        }
      }

      // delegación: botón kebab en la tabla
      tabla.addEventListener('click', function (e) {
        const btn = e.target.closest('.kebab-btn, .btn-menu');
        if (!btn) return;
        const tr = btn.closest('tr'); if (!tr) return;
        const id = Number(tr.dataset.id);
        const u = (window.getUsuarios?.() || []).find(x=>Number(x.id)===id);
        if (!u) return;
        openKebabMenu(btn, u);
      });

      // clicks dentro del menú flotante
      menu.addEventListener('click', async function (e) {
        const item = e.target.closest('button[role="menuitem"]');
        if (!item || !currentUser) return;

        const act = item.dataset.act;
        const u = currentUser;

        try {
          if (act === 'editar') { if (typeof window.abrirEditar === 'function') window.abrirEditar(u.id); closeKebabMenu(); return; }

          if (act === 'permisos') {
            const user = await API.UsuariosAPI.obtener(u.id);
            renderPermModal(user);
            openPermModal();
            closeKebabMenu(); return;
          }

          if (act === 'toggle') {
            if ((u?.usuario || '') === (getUsuarioActual() || '')) { showToast('No puedes desactivarte a ti mismo.','warning'); closeKebabMenu(); return; }
            const next = isActivo(u) ? 0 : 1;
            await API.UsuariosAPI.estado(u.id, next);
            await cargarUsuarios(document.querySelector('#buscarUsuario')?.value || '');
            await cargarBitacora();
            showToast(next ? 'Usuario activado.' : 'Usuario desactivado.','info');
            closeKebabMenu(); return;
          }

          if (act === 'reset') {
            const ok = await showConfirm('¿Reiniciar la contraseña de este usuario? Se forzará cambio al próximo inicio.');
            if (!ok) { closeKebabMenu(); return; }
            const r = await API.UsuariosAPI.resetPass(u.id);
            const html = `<div class="code-box">${(r?.nueva ? String(r.nueva).replace(/&/g,'&amp;').replace(/</g,'&lt;') : '')}</div><div style="margin-top:8px;color:#555">Guárdala y compártela de forma segura.</div>`;
            await showInfoModal('Contraseña temporal generada', html);
            await cargarBitacora();
            closeKebabMenu(); return;
          }

          if (act === 'bitacora') {
            if (typeof window.accionVerBitacora === 'function') window.accionVerBitacora(u.id);
            else showToast('Abriendo bitácora…','info');
            closeKebabMenu(); return;
          }

          if (act === 'eliminar') {
            if ((u?.usuario || '') === (getUsuarioActual() || '')) { showToast('No puedes eliminar tu propia cuenta.','warning'); closeKebabMenu(); return; }
            const ok = await showConfirm('¿Eliminar este usuario? Esta acción no se puede deshacer.');
            if (!ok) { closeKebabMenu(); return; }
            await API.UsuariosAPI.eliminar(u.id);
            await cargarUsuarios(document.querySelector('#buscarUsuario')?.value || '');
            await cargarBitacora();
            showToast('Usuario eliminado.','success');
            closeKebabMenu(); return;
          }
        } catch (err) {
          showToast(err.message || 'Ocurrió un error','error');
          closeKebabMenu();
        }
      });

    })();
  });

  // ===================== ENHANCEMENTS =====================
  (function(){
    const tbody = document.querySelector('#tablaUsuarios tbody');

    function __applyRoleGuardsToRow(menuRow, user){
      if (!menuRow || !user) return;
      const soyYo   = (user?.usuario || '') === (getUsuarioActual() || '');
      const esAdmin = String((sesionActual()?.rol || '')).toLowerCase() === 'administrador';

      const btnToggle = menuRow.querySelector('.act-toggle');
      const btnReset  = menuRow.querySelector('.act-reset');
      const btnDel    = menuRow.querySelector('.act-eliminar');

      if (btnToggle && soyYo) { btnToggle.disabled = true; btnToggle.setAttribute('aria-disabled','true'); btnToggle.title = 'No puedes desactivarte a ti mismo'; }
      if (btnReset && !esAdmin) { btnReset.disabled = true; btnReset.setAttribute('aria-disabled','true'); btnReset.title = 'Solo administradores pueden restablecer contraseñas'; }
      if (btnDel && (!esAdmin || soyYo)) { btnDel.disabled = true; btnDel.setAttribute('aria-disabled','true'); btnDel.title = soyYo ? 'No puedes eliminar tu propia cuenta' : 'Solo administradores pueden eliminar usuarios'; }
    }

    if (tbody) {
      const mo = new MutationObserver((muts)=>{
        muts.forEach(m=>{
          m.addedNodes.forEach(n=>{
            if (n.nodeType===1 && n.matches('tr.menu-row')) {
              const tr = n.previousElementSibling;
              const id = Number(tr?.dataset?.id);
              const user = (window.getUsuarios?.()||[]).find(x=>Number(x.id)===id);
              const menu = n.querySelector('.row-menu');
              __applyRoleGuardsToRow(menu, user);
            }
          });
        });
      });
      mo.observe(tbody, { childList: true });
    }

    (function watchKebab(){
      const kebab = document.getElementById('kebabMenu');
      if (!kebab) { document.addEventListener('DOMContentLoaded', watchKebab, { once:true }); return; }
      const mo2 = new MutationObserver(()=>{
        const esAdmin = String((sesionActual()?.rol || '')).toLowerCase() === 'administrador';
        if (esAdmin) return;
        const btnReset = kebab.querySelector('button[data-act="reset"]');
        const btnDel   = kebab.querySelector('button[data-act="eliminar"]');
        [btnReset, btnDel].forEach(b=>{
          if (!b) return;
          b.disabled = true; b.setAttribute('aria-disabled','true');
          if (b.dataset.act==='reset') b.title = 'Solo administradores pueden restablecer contraseñas';
          if (b.dataset.act==='eliminar') b.title = 'Solo administradores pueden eliminar usuarios';
        });
      });
      mo2.observe(kebab, { childList: true, subtree: true });
    })();

    const toolbar = document.querySelector('.toolbar') || document.querySelector('.card .toolbar');
    const inpBuscarLocal = document.getElementById('buscarUsuario');

    let spanCount = document.getElementById('countUsuarios');
    if (!spanCount) {
      spanCount = document.createElement('span');
      spanCount.id = 'countUsuarios';
      spanCount.className = 'muted';
      spanCount.style.marginRight = '8px';
      spanCount.textContent = 'Usuarios (0)';
      toolbar?.prepend(spanCount);
    }

    let selRol = document.getElementById('filtroRol');
    if (!selRol) {
      selRol = document.createElement('select');
      selRol.id = 'filtroRol';
      selRol.title = 'Filtrar por rol';
      selRol.style.marginRight = '8px';
      selRol.innerHTML = `
        <option value="todos">Todos los roles</option>
        <option value="administrador">Administrador</option>
        <option value="mecanico">Mecánico</option>
        <option value="recepcion">Recepción</option>
        <option value="gerencia">Gerencia</option>
        <option value="calidad">Control de Calidad</option>
        <option value="bodega">Bodega / Repuestos</option>
      `;
      toolbar?.prepend(selRol);
    }

    let selEstado = document.getElementById('filtroEstado');
    if (!selEstado) {
      selEstado = document.createElement('select');
      selEstado.id = 'filtroEstado';
      selEstado.title = 'Filtrar por estado';
      selEstado.style.marginRight = '8px';
      selEstado.innerHTML = `
        <option value="todos">Todos</option>
        <option value="activos">Activos</option>
        <option value="inactivos">Inactivos</option>
      `;
      toolbar?.prepend(selEstado);
    }

    let __listaBase = [];

    function __normalizaEstado(v){
      if (typeof v === 'boolean') return v ? 'activos' : 'inactivos';
      const s = String(v ?? '').toLowerCase();
      if (s === '1' || s === 'true' || s === 'activo') return 'activos';
      return 'inactivos';
    }
    function __escRegex(s){ return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
    function __highlightCell(td, query){
      if (!td) return;
      const q = String(query||'').trim();
      const original = td.getAttribute('data-original-text');
      let baseText = original ?? td.textContent;
      if (!original) td.setAttribute('data-original-text', baseText);
      if (!q) { td.innerHTML = escapeHtml(baseText); return; }
      const re = new RegExp(__escRegex(q), 'ig');
      td.innerHTML = escapeHtml(baseText).replace(re, m=>`<mark>${escapeHtml(m)}</mark>`);
    }

    function __aplicarFiltros(){
      let arr = Array.isArray(__listaBase) ? __listaBase.slice() : [];
      const rol = (selRol?.value || 'todos').toLowerCase();
      const est = (selEstado?.value || 'todos').toLowerCase();

      if (rol !== 'todos') arr = arr.filter(u => String(u.rol||'').toLowerCase() === rol);
      if (est !== 'todos') arr = arr.filter(u => __normalizaEstado(u.estado) === est);

      listaUsuarios = arr;
      renderUsuarios();

      const q = (inpBuscarLocal?.value || '').trim();
      if (q) {
        document.querySelectorAll('#tablaUsuarios tbody tr').forEach(tr=>{
          __highlightCell(tr.children[1], q);
          __highlightCell(tr.children[2], q);
        });
      } else {
        document.querySelectorAll('#tablaUsuarios tbody tr').forEach(tr=>{
          __highlightCell(tr.children[1], '');
          __highlightCell(tr.children[2], '');
        });
      }

      document.querySelectorAll('#tablaUsuarios .btn-menu').forEach(b=>b.setAttribute('aria-label','Acciones'));
      spanCount.textContent = `Usuarios (${arr.length})`;
    }

    const __cargarUsuarios = cargarUsuarios;
    cargarUsuarios = async function(q=''){
      await __cargarUsuarios(q);
      __listaBase = Array.isArray(window.getUsuarios?.()) ? window.getUsuarios().slice() : [];
      __aplicarFiltros();
    };

    selRol?.addEventListener('change', __aplicarFiltros);
    selEstado?.addEventListener('change', __aplicarFiltros);

    let __drawerLastFocus = null;
    const __abrirEditar = abrirEditar;
    const __cerrarDrawer = cerrarDrawer;

    abrirEditar = async function(id){
      __drawerLastFocus = document.activeElement;
      await __abrirEditar(id);
      const ov = document.getElementById('drawerOverlay'); if (ov) ov.hidden = false;
      setTimeout(()=>__setupDrawerA11y(), 0);
    };

    cerrarDrawer = function(){
      const dr = document.getElementById('drawerEditar');
      if (dr && dr._cleanupA11y) dr._cleanupA11y();
      __cerrarDrawer();
      const ov = document.getElementById('drawerOverlay'); if (ov) ov.hidden = true;
      try { __drawerLastFocus?.focus(); } catch {}
      __drawerLastFocus = null;
    };

    function __setupDrawerA11y(){
      const dr = document.getElementById('drawerEditar');
      if (!dr) return;
      const focusables = dr.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;

      focusables[0].focus();

      function onKey(e){
        if (e.key === 'Escape') { e.preventDefault(); cerrarDrawer(); }
        if (e.key === 'Tab') {
          const first = focusables[0];
          const last  = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      dr.addEventListener('keydown', onKey);
      dr._cleanupA11y = () => dr.removeEventListener('keydown', onKey);
    }

    function __pwdScore(pw){
      const s = String(pw||'');
      let score = 0;
      if (s.length >= 8) score++;
      if (/[a-z]/.test(s)) score++;
      if (/[A-Z]/.test(s)) score++;
      if (/[0-9]/.test(s)) score++;
      if (/[^A-Za-z0-9]/.test(s)) score++;
      const labels = ['Muy débil','Débil','Media','Fuerte','Muy fuerte'];
      return { score, label: labels[Math.max(0, score-1)] || 'Muy débil' };
    }
    function __attachMeter(inputId){
      const inp = document.getElementById(inputId);
      if (!inp) return;
      let meter = inp.nextElementSibling;
      if (!(meter && meter.classList?.contains('pwd-meter'))) {
        meter = document.createElement('div');
        meter.className = 'pwd-meter';
        meter.style.fontSize = '12px';
        meter.style.marginTop = '6px';
        meter.style.opacity = '0.9';
        meter.style.userSelect = 'none';
        inp.insertAdjacentElement('afterend', meter);
      }
      const update = () => {
        const { score, label } = __pwdScore(inp.value);
        meter.textContent = `Seguridad: ${label}`;
        meter.style.background = `linear-gradient(90deg, currentColor ${score*20}%, #e5e7eb ${score*20}%)`;
        meter.style.padding = '4px 8px';
        meter.style.borderRadius = '6px';
      };
      inp.addEventListener('input', update);
      update();
    }

    document.addEventListener('DOMContentLoaded', ()=>{
      try { /* la base se setea tras cargarUsuarios */ } catch {}
      __attachMeter('password');
      __attachMeter('editPassword');
    });

  })();

  // ===== Persistencia UI (filtros/paginación) =====
  (function(){
    const KEY = 'ua_state';
    function load(){ try { return JSON.parse(localStorage.getItem(KEY))||{}; } catch { return {}; } }
    function save(obj){ localStorage.setItem(KEY, JSON.stringify(obj)); }

    document.addEventListener('DOMContentLoaded', ()=>{
      const st = load();
      const applySoon = () => {
        const q   = document.getElementById('buscarUsuario');
        const rol = document.getElementById('filtroRol');
        const est = document.getElementById('filtroEstado');

        if (q && typeof st.q === 'string') q.value = st.q;
        if (rol && st.filtroRol)  rol.value = st.filtroRol;
        if (est && st.filtroEstado) est.value = st.filtroEstado;

        if (typeof pagUsuarios !== 'undefined') {
          if (Number.isFinite(st.page))     pagUsuarios.page     = Math.max(1, st.page|0);
          if (Number.isFinite(st.pageSize)) pagUsuarios.pageSize = Math.max(5, st.pageSize|0);
        }
        if (typeof cargarUsuarios === 'function') cargarUsuarios(q ? q.value.trim() : '');
        if (typeof cargarBitacora === 'function') cargarBitacora();
      };
      setTimeout(applySoon, 120);
    });

    function persist(){
      const q   = document.getElementById('buscarUsuario');
      const rol = document.getElementById('filtroRol');
      const est = document.getElementById('filtroEstado');
      const st = {
        q: q ? q.value.trim() : '',
        filtroRol: rol ? rol.value : 'todos',
        filtroEstado: est ? est.value : 'todos',
        page: (pagUsuarios && pagUsuarios.page) || 1,
        pageSize: (pagUsuarios && pagUsuarios.pageSize) || 10
      };
      save(st);
    }

    document.addEventListener('input', (e)=>{ if (e.target && e.target.id === 'buscarUsuario') persist(); });
    document.addEventListener('change', (e)=>{ if (e.target && (e.target.id === 'filtroRol' || e.target.id === 'filtroEstado')) persist(); });

    const _build = buildPaginador;
    if (typeof _build === 'function') {
      buildPaginador = function(container, state, onChange){
        _build(container, state, function(){ onChange(); persist(); });
        container?.querySelector('select')?.addEventListener('change', persist);
      };
    }

    const _cargarUsuarios2 = cargarUsuarios;
    if (typeof _cargarUsuarios2 === 'function') {
      cargarUsuarios = async function(q=''){ const r = await _cargarUsuarios2(q); persist(); return r; };
    }
  })();

  // ===== Ordenamiento por cabecera =====
  (function(){
    const table = document.getElementById('tablaUsuarios');
    if (!table) return;

    const HEAD_MAP = {
      1: { key: 'usuario',      type: 'text' },
      2: { key: 'nombre',       type: 'text' },
      3: { key: 'rol',          type: 'text' },
      5: { key: 'ultimoAcceso', type: 'date' }
    };
    let sort = { idx: null, dir: 1 };

    function cmp(a,b,type){
      if (type === 'date') {
        const av = a ? new Date(a).getTime() : 0;
        const bv = b ? new Date(b).getTime() : 0;
        return av - bv;
      }
      const av = String(a||'').toLowerCase();
      const bv = String(b||'').toLowerCase();
      return av.localeCompare(bv, 'es');
    }

    function applySort(idx){
      if (!window.getUsuarios) return;
      const meta = HEAD_MAP[idx];
      if (!meta) return;

      if (sort.idx === idx) sort.dir = -sort.dir; else { sort.idx = idx; sort.dir = 1; }

      const arr = (getUsuarios() || []).slice().sort((a,b)=>{
        const aV = (meta.key==='ultimoAcceso') ? (a.ultimoAcceso||a.ultimoacceso||a['ultimo acceso']||a.lastAccess) : a[meta.key];
        const bV = (meta.key==='ultimoAcceso') ? (b.ultimoAcceso||b.ultimoacceso||b['ultimo acceso']||b.lastAccess) : b[meta.key];
        return cmp(aV, bV, meta.type) * sort.dir;
      });

      window.listaUsuarios = arr;
      if (typeof window.renderUsuarios === 'function') renderUsuarios();

      const ths = table.querySelectorAll('thead th');
      ths.forEach((th,i)=>{ th.removeAttribute('data-sort'); if (i === idx) th.setAttribute('data-sort', sort.dir === 1 ? 'asc' : 'desc'); });
    }

    table.querySelectorAll('thead th').forEach((th, i)=>{ if (!HEAD_MAP[i]) return; th.style.cursor = 'pointer'; th.title = 'Ordenar'; th.addEventListener('click', ()=>applySort(i)); });

    const s = document.createElement('style');
    s.textContent = `
      #tablaUsuarios thead th[data-sort="asc"]::after{content:" \\25B2"; opacity:.6}
      #tablaUsuarios thead th[data-sort="desc"]::after{content:" \\25BC"; opacity:.6}
    `;
    document.head.appendChild(s);
  })();

  // ===== Atajos de teclado =====
  (function(){
    function focusBuscar(){ const i = document.getElementById('buscarUsuario'); if (i){ i.focus(); i.select(); } }
    function openCrear(){ const u = document.getElementById('usuario'); if (u){ u.focus(); } window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function tryClose(){
      const dr = document.getElementById('drawerEditar');
      if (dr && dr.classList.contains('open')) { const btn = document.getElementById('btnCancelarEdit') || document.getElementById('btnCerrarDrawer'); btn?.click(); return; }
      const dlg = document.getElementById('dlgBitacoraUsuario');
      if (dlg && typeof dlg.close === 'function' && dlg.open) { dlg.close(); }
    }

    document.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      if (e.key === '/' && !typing){ e.preventDefault(); focusBuscar(); }
      if (e.key.toLowerCase() === 'r' && !typing){
        e.preventDefault();
        const btn = document.getElementById('btnRefrescar');
        if (btn) btn.click(); else if (typeof cargarUsuarios==='function') cargarUsuarios(document.getElementById('buscarUsuario')?.value||'');
      }
      if (e.key.toLowerCase() === 'n' && !typing){ e.preventDefault(); openCrear(); }
      if (e.key === 'Escape'){ tryClose(); }
    });
  })();

  // ===== Indicador de red + reintentos =====
  (function(){
    let bar = document.getElementById('netBanner');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'netBanner';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fff3cd;border-bottom:1px solid #ffeeba;padding:6px 10px;font-size:13px;color:#856404;display:none;z-index:1200;text-align:center';
      bar.textContent = 'Sin conexión o servidor no disponible. Intentando reconectar…';
      document.body.appendChild(bar);
    }
    const show = ()=>{ bar.style.display='block'; };
    const hide = ()=>{ bar.style.display='none'; };

    window.addEventListener('online', hide);
    window.addEventListener('offline', show);

    function withRetry(fn){
      return async function(...args){
        try{
          const out = await fn.apply(this, args);
          if (navigator.onLine) hide();
          return out;
        }catch(e){
          show();
          try{
            await new Promise(r=>setTimeout(r, 800));
            const out2 = await fn.apply(this, args);
            if (navigator.onLine) hide();
            return out2;
          }catch(e2){
            show(); throw e2;
          }
        }
      };
    }

    if (typeof cargarUsuarios === 'function'){ cargarUsuarios = withRetry(cargarUsuarios); }
    if (typeof cargarBitacora === 'function'){ cargarBitacora = withRetry(cargarBitacora); }

    if (!navigator.onLine) show();
  })();

  // ===== Overlay del drawer =====
  (function(){
    let overlay = document.getElementById('drawerOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drawerOverlay';
      overlay.className = 'drawer-overlay';
      overlay.hidden = true;
      document.body.appendChild(overlay);
    }

    const _abrir = abrirEditar;
    const _cerrar = cerrarDrawer;

    abrirEditar = async function(id){ await _abrir(id); if (overlay) overlay.hidden = false; };
    cerrarDrawer = function(){ if (overlay) overlay.hidden = true; _cerrar(); };

    const btnCerrar = document.getElementById('btnCerrarDrawer');
    btnCerrar?.addEventListener('click', cerrarDrawer);
    overlay?.addEventListener('click', cerrarDrawer);
  })();

})(); // << FIN DEL ARCHIVO
