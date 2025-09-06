// js/panel.js — integra /api/dashboard/panel (con fallback) + timers backend
(function () {
  const App = window.App || {};
  const $  = App.$  || ((sel, root=document) => root.querySelector(sel));
  const $$ = App.$$ || ((sel, root=document) => Array.from(root.querySelectorAll(sel)));
  const API = () => (localStorage.getItem('API_BASE') || window.API_BASE || '');

  const api = {
    async get(p) {
      const r = await fetch(API()+p, { cache:'no-store' });
      if (!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    },
    async post(p, body) {
      const r = await fetch(API()+p, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body||{})
      });
      if (!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }
  };

  // ---------- Helpers ----------
  const now = () => new Date();
  const toDate = (x) => (x instanceof Date) ? x : (x ? new Date(x) : null);
  const fmtHN = (n) => typeof n === 'number' ? ('L ' + n.toLocaleString('es-HN')) : String(n ?? '—');
  function myUser() { return App.getUsuarioActual?.() || JSON.parse(localStorage.getItem('usuarioActual')||'null') || {}; }
  function roleGroup() {
    const u = myUser();
    const rol = String(u.rol||'').toLowerCase();
    if (/(admin|gerenc|dueñ|propiet)/.test(rol)) return 'manager';
    if (/mec[aá]n/.test(rol)) return 'tech';
    if (/recep/.test(rol)) return 'frontdesk';
    if (/repuesto|almac[eé]n|bodega/.test(rol)) return 'parts';
    if (/calidad|qa/.test(rol)) return 'qa';
    return 'general';
  }
  function setHeaderByRole() {
    const rg = roleGroup();
    const title = $('#panelTitle');
    const sub   = $('#panelSub');
    if (!title || !sub) return;
    const uName = App.getNombreUsuarioActual?.() || (App.getUsuarioActual?.()?.usuario) || '';
    const map = {
      manager: ['Panel ejecutivo', 'Indicadores y auditoría del taller.'],
      tech:    ['Mi trabajo del día', 'Órdenes asignadas, tiempos y rendimiento.'],
      frontdesk: ['Recepción', 'Citas, ingresos y seguimiento de clientes.'],
      parts:   ['Repuestos / Almacén', 'Stock crítico, reservas y pedidos.'],
      qa:      ['Control de calidad', 'Órdenes listas para validar y métricas.'],
      general: ['Panel principal', 'Resumen rápido del taller.']
    };
    const [t, s] = map[rg] || map.general;
    title.textContent = t + (uName ? ` — ${uName}` : '');
    sub.textContent   = s;
  }

  // ---------- KPIs ----------
  async function cargarKPIs() {
    try {
      const data = await api.get('/dashboard/kpis');
      const activas        = data?.activas ?? data?.ordenesActivas ?? 0;
      const paraHoy        = data?.paraHoy ?? data?.entregasHoy ?? 0;
      const ingresosMes    = data?.ingresosMes ?? data?.ventasMes ?? 0;
      const clientesNuevos = data?.clientesNuevos ?? data?.nuevosClientes ?? 0;
      const t = data?.tendencias || {};

      $('#kpiActivas')?.textContent  = String(activas);
      $('#kpiHoy')?.textContent      = String(paraHoy);
      $('#kpiIngresos')?.textContent = fmtHN(Number(ingresosMes) || 0);
      $('#kpiClientes')?.textContent = String(clientesNuevos);

      $('#kpiActivasTrend')?.textContent  = t?.activas ?? '';
      $('#kpiHoyTrend')?.textContent      = t?.paraHoy ?? '';
      $('#kpiIngresosTrend')?.textContent = t?.ingresosMes ?? '';
      $('#kpiClientesTrend')?.textContent = t?.clientesNuevos ?? '';
    } catch (err) { console.warn('[KPIs]', err.message); }
  }

  // ---------- Datos de panel por rol (nuevo) ----------
  async function fetchPanelPorRol() {
    const rg = roleGroup();
    const u  = myUser();
    const userName = (App.getNombreUsuarioActual?.() || u?.usuario || '').toString().trim();
    const qs = new URLSearchParams({ rol: rg, user: userName });
    return api.get('/dashboard/panel?' + qs.toString());
  }

  // ---------- Fallback: órdenes recientes ----------
  async function fetchOrdenesBase() {
    try {
      const res = await api.get('/ordenes?limit=50&sort=-fecha');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.items)) return res.items;
      return [];
    } catch (e) { console.warn('[Ordenes]', e.message); return []; }
  }

  // ---------- Normalizadores ----------
  const getId     = (o) => (o?.id || o?.numero || o?._id || '—');
  const getPlaca  = (o) => (o?.placa || o?.vehiPlaca || o?.patente || '—');
  const getEstado = (o) => (o?.estado || o?.estatus || '').toString().toLowerCase();
  const getFEnt   = (o) => toDate(o?.fecha_entrega || o?.entrega);
  const getFCre   = (o) => toDate(o?.fecha || o?.fecha_creacion || o?.createdAt || o?.creadoEn);
  function uniqById(list) {
    const m = new Map();
    list.forEach(x => m.set(getId(x), x));
    return Array.from(m.values());
  }

  // ---------- Render: Órdenes recientes ----------
  function renderOrdenesRecientesDesdePanel(panel) {
    const cont = $('#listaOrdenes'); if (!cont) return;
    const all = uniqById([...(panel?.en_proceso||[]), ...(panel?.vencidas||[]), ...(panel?.asignadas||[])]);
    all.sort((a,b) => (getFCre(b)?.getTime()||0) - (getFCre(a)?.getTime()||0));
    cont.innerHTML = '';
    if (!all.length) { cont.innerHTML = '<div class="row"><span>No hay órdenes recientes.</span></div>'; return; }
    all.slice(0,5).forEach(o=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span><strong>#${getId(o)}</strong> · ${getPlaca(o)}</span><span class="sub">${getEstado(o) || '—'}</span>`;
      cont.appendChild(row);
    });
  }

  function renderOrdenesRecientesFallback(items) {
    const cont = $('#listaOrdenes'); if (!cont) return;
    cont.innerHTML = '';
    if (!items.length) { cont.innerHTML = '<div class="row"><span>No hay órdenes recientes.</span></div>'; return; }
    items.slice(0,5).forEach(o=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span><strong>#${getId(o)}</strong> · ${getPlaca(o)}</span><span class="sub">${getEstado(o) || '—'}</span>`;
      cont.appendChild(row);
    });
  }

  // ---------- Timers backend + fallback local ----------
  const KEY_TIME = 'timers_os';
  async function startTimerBackend(ordenId) {
    const u = myUser();
    return api.post(`/ordenes/${ordenId}/timer/start`, { user_id: u.id || u.usuario || '' });
  }
  async function stopTimerBackend(ordenId) {
    const u = myUser();
    return api.post(`/ordenes/${ordenId}/timer/stop`, { user_id: u.id || u.usuario || '' });
  }
  function startTimerLocal(ordenId, btn) {
    const t = JSON.parse(localStorage.getItem(KEY_TIME)||'{}');
    const rec = t[ordenId] || { running:false, start:0, total:0 };
    rec.running = true; rec.start = Date.now();
    t[ordenId] = rec; localStorage.setItem(KEY_TIME, JSON.stringify(t));
    if (btn) { btn.classList.add('btn-primary'); btn.classList.remove('btn-ghost'); btn.textContent='Detener tiempo'; }
  }
  function stopTimerLocal(ordenId, btn) {
    const t = JSON.parse(localStorage.getItem(KEY_TIME)||'{}');
    const rec = t[ordenId] || { running:false, start:0, total:0 };
    if (rec.running && rec.start) rec.total = (rec.total||0) + (Date.now()-rec.start);
    rec.running = false; rec.start = 0;
    t[ordenId] = rec; localStorage.setItem(KEY_TIME, JSON.stringify(t));
    if (btn) { btn.classList.remove('btn-primary'); btn.classList.add('btn-ghost'); btn.textContent='Iniciar tiempo'; }
  }
  function attachTimerHandlers(container) {
    container.querySelectorAll('[data-timer]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-timer');
        const running = btn.classList.contains('btn-primary');
        try {
          if (running) { await stopTimerBackend(id); stopTimerLocal(id, btn); }
          else { await startTimerBackend(id); startTimerLocal(id, btn); }
        } catch {
          if (running) stopTimerLocal(id, btn); else startTimerLocal(id, btn);
        }
      });
    });
  }

  // ---------- Render: Mi Día ----------
  function renderMiDiaDesdePanel(panel) {
    const box = $('#miDia'); if (!box) return; // si no existe en el HTML, no hacemos nada
    const rg = roleGroup();
    const u  = myUser();
    const myName = (App.getNombreUsuarioActual?.() || u?.usuario || '').toString().trim().toLowerCase();

    box.innerHTML = '';

    if (rg === 'tech') {
      const mine = (panel?.asignadas || []).length ? panel.asignadas : (panel?.en_proceso || []);
      if (!mine.length) { box.innerHTML = `<div class="row"><span>No tienes órdenes asignadas.</span></div>`; return; }
      const actuales = mine.filter(o => /proceso|diagn|pend|repar|trabaj|espera/.test(getEstado(o))).slice(0,5);
      const frag = document.createDocumentFragment();
      actuales.forEach(o=>{
        const li = document.createElement('div');
        li.className = 'row';
        li.innerHTML = `<span><strong>#${getId(o)}</strong> · ${getPlaca(o)}</span><span class="sub">${getEstado(o) || '—'}</span>`;
        frag.appendChild(li);
        const actions = document.createElement('div');
        actions.className = 'row';
        actions.innerHTML = `<span class="muted">Tiempo</span><span><button class="btn btn-sm btn-ghost" data-timer="${getId(o)}">Iniciar tiempo</button></span>`;
        frag.appendChild(actions);
      });
      box.appendChild(frag);
      attachTimerHandlers(box);
      return;
    }

    if (rg === 'manager') {
      const total      = uniqById([...(panel?.en_proceso||[]), ...(panel?.vencidas||[]), ...(panel?.asignadas||[])]).length;
      const enProceso  = (panel?.en_proceso||[]).length;
      const vencidas   = (panel?.vencidas||[]).length;
      box.innerHTML = `
        <div class="row"><span>Total órdenes (recientes)</span><strong>${total}</strong></div>
        <div class="row"><span>En proceso</span><strong>${enProceso}</strong></div>
        <div class="row"><span>Entregas vencidas</span><strong class="text-danger">${vencidas}</strong></div>
      `;
      return;
    }

    // Otros roles (si existiera contenedor)
    if (rg === 'frontdesk') { box.innerHTML = `<div class="row"><span>Citas y recepciones del día</span><strong>—</strong></div>`; return; }
    if (rg === 'parts')     { box.innerHTML = `<div class="row"><span>Stock crítico / pedidos</span><strong>—</strong></div>`; return; }
    if (rg === 'qa')        { box.innerHTML = `<div class="row"><span>Para control de calidad</span><strong>—</strong></div>`; return; }
    box.innerHTML = `<div class="row"><span>Bienvenido 👋</span><span class="muted">Revisa las acciones rápidas o las órdenes.</span></div>`;
  }

  // ---------- Render: Alertas -> #listaNotif (existe en admin.html) ----------
  function renderAlertasDesdePanel(panel) {
    const box = $('#listaNotif'); if (!box) return;
    const hoy = now();
    const alertas = [];

    (panel?.vencidas||[]).forEach(o=>{
      alertas.push({ tipo:'roja', msg:`Entrega vencida #${getId(o)} · ${getPlaca(o)}` });
    });

    (panel?.en_proceso||[]).forEach(o=>{
      const est = getEstado(o);
      const fCre = getFCre(o);
      if (fCre && /proceso|diagn|pend|repar|trabaj|espera/.test(est)) {
        const dias = Math.floor((hoy - fCre)/(1000*60*60*24));
        if (dias >= 5) alertas.push({ tipo:'amarilla', msg:`Orden estancada #${getId(o)} (${dias} días)` });
      }
    });

    box.innerHTML = '';
    if (!alertas.length) { box.innerHTML = '<div class="row"><span>Sin novedades por ahora.</span></div>'; return; }
    alertas.slice(0,6).forEach(a=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${a.msg}</span><span class="sub ${a.tipo==='roja'?'text-danger':''}">${a.tipo.toUpperCase()}</span>`;
      box.appendChild(row);
    });
  }

  // ---------- Fallback alertas (si no hay panel endpoint) ----------
  function renderAlertasFallback(items) {
    const box = $('#listaNotif'); if (!box) return;
    const hoy = now();
    const alertas = [];
    items.forEach(o=>{
      const est = getEstado(o);
      const fEnt = getFEnt(o);
      const fCre = getFCre(o);
      if (fEnt && !/entreg/.test(est) && fEnt < hoy) alertas.push({ tipo:'roja', msg:`Entrega vencida #${getId(o)} · ${getPlaca(o)}` });
      if (fCre && /proceso|diagn|pend|repar|trabaj|espera/.test(est)) {
        const dias = Math.floor((hoy - fCre)/(1000*60*60*24));
        if (dias >= 5) alertas.push({ tipo:'amarilla', msg:`Orden estancada #${getId(o)} (${dias} días)` });
      }
    });
    box.innerHTML = '';
    if (!alertas.length) { box.innerHTML = '<div class="row"><span>Sin novedades por ahora.</span></div>'; return; }
    alertas.slice(0,6).forEach(a=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${a.msg}</span><span class="sub ${a.tipo==='roja'?'text-danger':''}">${a.tipo.toUpperCase()}</span>`;
      box.appendChild(row);
    });
  }

  // ---------- Init ----------
  async function initPanel() {
    try {
      if (App.applyTheme && App.getTheme) App.applyTheme(App.getTheme());
      setHeaderByRole();
      await cargarKPIs();

      // 1) Intentar panel por rol
      try {
        const panel = await fetchPanelPorRol();
        renderOrdenesRecientesDesdePanel(panel);
        renderMiDiaDesdePanel(panel);
        renderAlertasDesdePanel(panel);
      } catch (e) {
        // 2) Fallback si el endpoint no existe / falla
        console.warn('[Panel role] fallback:', e.message);
        const ordenes = await fetchOrdenesBase();
        renderOrdenesRecientesFallback(ordenes);
        renderAlertasFallback(ordenes);
        // Mi Día no se renderiza en fallback si no existe contenedor; si existe, mostramos mensaje simple
        const miDia = $('#miDia');
        if (miDia) miDia.innerHTML = `<div class="row"><span>Sin datos del panel por rol (usando fallback).</span></div>`;
      }

      // Mostrar botones admin-only
      const adminMode = localStorage.getItem('adminMode') === 'true';
      const u = myUser();
      const isAdminRole = (u?.rol||'').toString().toLowerCase().includes('admin') || (u?.rol||'').toString().toLowerCase().includes('gerenc');
      const show = adminMode || isAdminRole;
      const el1 = $('#btnEditorPaginas'); if (el1) el1.style.display = show ? '' : 'none';
      const el2 = $('#btnServiciosAdmin'); if (el2) el2.style.display = show ? '' : 'none';
    } catch (e) {
      console.warn('[Panel] init error:', e?.message);
    }
  }

  document.addEventListener('global:ready', initPanel);
  document.addEventListener('topbar:loaded', ()=> {
    if (App.applyTheme && App.getTheme) App.applyTheme(App.getTheme());
  });
})();
