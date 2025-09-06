// frontend/js/clientes.js
(function () {
  'use strict';

  const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- helpers ----------
  function showToast(message, type = 'info') {
    try { if (typeof window.showToast === 'function') return window.showToast(type, message); } catch {}
    try { if (typeof window.mostrarToast === 'function') return window.mostrarToast(type, message); } catch {}
    console.log(`[${type}] ${message}`);
  }
  function actorHeaders() {
    let u = {}; try { u = JSON.parse(localStorage.getItem('usuarioActual')) || {}; } catch {}
    const actor = u?.usuario || u?.nombre || 'sistema';
    return { 'Content-Type': 'application/json', 'X-Actor': actor, 'X-Actor-Usuario': actor };
  }
  async function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', headers: { ...actorHeaders(), ...(options.headers || {}) }, ...options });
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data;
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // ---------- formateos ----------
  function formatClientId(n) {
    const id = Number(n) || 0;
    const index = id - 1;
    if (index < 0) return '0000';
    const block = Math.floor(index / 10000);
    const rem = (index % 10000) + 1;
    const num = String(rem).padStart(4, '0');
    if (block === 0) return num;
    let prefix = '', b = block;
    while (b > 0) { b--; prefix = String.fromCharCode(65 + (b % 26)) + prefix; b = Math.floor(b / 26); }
    return prefix + num;
  }
  function whatsappLink(tel) {
    const digits = String(tel || '').replace(/\D+/g, '');
    if (!digits) return null;
    const withCC = (/^(504|52|57|34)/.test(digits)) ? digits : '504' + digits;
    return `https://wa.me/${withCC}`;
  }
  const WA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" aria-hidden="true"><path fill="#25D366" d="M19.11 17.09c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.6.14-.17.27-.69.88-.84 1.06-.15.18-.31.2-.58.07-.27-.13-1.13-.42-2.16-1.33-.8-.7-1.34-1.56-1.5-1.82-.15-.27-.02-.42.11-.55.11-.11.27-.31.4-.46.13-.15.17-.27.25-.45.08-.18.04-.34-.02-.48-.06-.14-.6-1.43-.82-1.96-.22-.53-.43-.45-.6-.46-.15-.01-.34-.01-.53-.01-.19 0-.5.07-.76.34-.26.27-1 1-1 2.43s1.02 2.82 1.16 3.01c.14.18 2 3.07 4.84 4.3.68.29 1.21.47 1.62.6.68.22 1.31.19 1.8.12.55-.08 1.69-.69 1.93-1.35.24-.66.24-1.23.17-1.35-.07-.12-.23-.19-.48-.31z"/><path fill="#25D366" d="M26.67 5.33C24.13 2.79 20.66 1.33 17 1.33 9.64 1.33 3.66 7.3 3.66 14.67c0 2.49.67 4.86 1.95 6.96L3.33 30.67l9.28-2.22c1.98 1.08 4.22 1.65 6.39 1.65 7.36 0 13.34-5.97 13.34-13.34 0-3.55-1.38-6.9-3.67-9.33zM18.99 27.11c-1.93 0-3.83-.52-5.49-1.5l-.39-.23-5.52 1.32 1.4-5.38-.25-.4c-1.21-1.92-1.85-4.14-1.85-6.43 0-6.73 5.48-12.21 12.21-12.21 3.27 0 6.35 1.27 8.67 3.58 2.32 2.31 3.6 5.39 3.6 8.67 0 6.73-5.48 12.21-12.21 12.21z"/></svg>`.replace(/\n\s+/g, '');

  // ---------- paginación ----------
  const pag = { page: 1, pageSize: 10, total: 0, q: '' };
  let LIST = [];
  let ALL_CACHE = [];

  function renderSkeletonRows(tbody, cols, rows = 6) {
    tbody.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement('tr'); tr.className = 'skel-row skel';
      for (let c = 0; c < cols; c++) tr.appendChild(document.createElement('td'));
      tbody.appendChild(tr);
    }
  }
  function renderEmptyRow(tbody, cols, msg) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">${escapeHtml(msg)}</td></tr>`;
  }
  function buildPaginador(container, state, onChange) {
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    container.innerHTML = '';
    const mk = (t) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = t; return b; };
    const prev = mk('« Anterior'), next = mk('Siguiente »');
    prev.disabled = state.page <= 1; next.disabled = state.page >= maxPage;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `Página ${state.page} de ${maxPage} · ${state.total} registros`;
    const sel = document.createElement('select'); [5, 10, 20, 50, 100].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; if (n === state.pageSize) o.selected = true; sel.appendChild(o); });
    const selLabel = document.createElement('span'); selLabel.className = 'meta'; selLabel.textContent = 'Por página:';
    prev.onclick = () => { if (state.page > 1) { state.page--; onChange(); } };
    next.onclick = () => { if (state.page < maxPage) { state.page++; onChange(); } };
    sel.onchange = () => { state.pageSize = parseInt(sel.value, 10) || 10; state.page = 1; onChange(); };
    container.append(prev, next, meta, selLabel, sel);
  }

  // ---------- cabecera ----------
  function adjustTableHead() {
    const thead = $('#tablaClientes thead');
    if (!thead) return;
    thead.innerHTML = `
      <tr>
        <th>Código</th>
        <th>Nombre</th>
        <th>Teléfono</th>
        <th style="width:90px">Acciones</th>
      </tr>
    `;
  }

  // ---------- tabla ----------
  function renderTabla(items) {
    const tbody = $('#tablaClientes tbody');
    tbody.innerHTML = '';
    if (!items.length) return renderEmptyRow(tbody, 4, pag.q ? 'Sin resultados' : 'Aún no hay clientes');

    items.forEach((c) => {
      const tr = document.createElement('tr'); tr.dataset.id = String(c.id);
      const idFmt = formatClientId(c.id);
      const tel = c.telefono || '';
      const wa = whatsappLink(tel);
      tr.innerHTML = `
        <td>${idFmt}</td>
        <td>${escapeHtml(c.nombre || '(sin nombre)')}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:6px">
            ${escapeHtml(tel || '-')}
            ${wa ? `<a href="${wa}" target="_blank" rel="noopener" title="Chatear por WhatsApp" aria-label="WhatsApp" style="display:inline-flex;align-items:center">${WA_SVG}</a>` : ''}
          </span>
        </td>
        <td class="td-acciones"><button class="kebab-btn btn-menu" title="Acciones" aria-haspopup="true" aria-expanded="false">⋮</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------- detalle (card) ----------
  function renderDetalleTabla(all) {
    const host = $('#detalleCliente'); if (!host) return;
    if (!all.length) { host.textContent = 'Sin datos para mostrar.'; return; }
    const rows = all.map(c => `
      <tr>
        <td>${formatClientId(c.id)}</td>
        <td>${escapeHtml(c.nombre||'-')}</td>
        <td>${escapeHtml(c.documento||'-')}</td>
        <td>${escapeHtml(c.telefono||'-')}</td>
        <td>${escapeHtml(c.email||'-')}</td>
        <td>${escapeHtml(c.direccion||'-')}</td>
        <td>${escapeHtml(c.notas||'-')}</td>
      </tr>
    `).join('');
    host.innerHTML = `
      <div style="overflow:auto">
        <table class="tabla">
          <thead>
            <tr>
              <th>Código</th><th>Nombre</th><th>Documento</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Notas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- cargar ----------
  async function cargar(qStr){
    const tbody = $('#tablaClientes tbody');
    renderSkeletonRows(tbody, 4, 6);

    if (typeof qStr==='string'){
      const nq = qStr.trim();
      if (nq !== pag.q) pag.page = 1;
      pag.q = nq;
    }

    const resp = await apiFetch(`/clientes${pag.q ? `?q=${encodeURIComponent(pag.q)}` : ''}`);

    const toArray = (r) => {
      if (Array.isArray(r)) return r;
      if (r && Array.isArray(r.items)) return r.items;
      if (r && Array.isArray(r.data)) return r.data;
      if (r && Array.isArray(r.rows)) return r.rows;
      if (r && Array.isArray(r.clientes)) return r.clientes;
      if (r && typeof r === 'object') return Object.values(r);
      return [];
    };

    const all = toArray(resp);
    ALL_CACHE = all;

    const total = Number(resp?.total ?? resp?.count ?? resp?.pagination?.total ?? all.length) || all.length;
    pag.total = total;

    const start = (pag.page - 1) * pag.pageSize;
    LIST = all.slice(start, start + pag.pageSize);

    renderTabla(LIST);
    renderDetalleTabla(all);

    const cont = document.getElementById('paginador-clientes');
    buildPaginador(cont, pag, () => cargar(pag.q));

    const count = document.getElementById('countClientes');
    if (count) count.textContent = `Clientes (${total})`;
  }

  // ---------- drawer fijo (idéntico a usuarios-admin) ----------
  const drawerEl  = document.getElementById('drawerEditar');
  const overlayEl = document.getElementById('drawerOverlay');
  const tituloEl  = document.getElementById('drawerTitulo');

  const edNombre = document.getElementById('ed_nombre');
  const edDoc    = document.getElementById('ed_documento');
  const edTel    = document.getElementById('ed_telefono');
  const edEmail  = document.getElementById('ed_email');
  const edDir    = document.getElementById('ed_direccion');
  const edNotas  = document.getElementById('ed_notas');

  let _clienteActual = null;

  function openDrawerCliente(c){
    _clienteActual = c || null;
    tituloEl.textContent = c ? `Editar ${formatClientId(c.id)} — ${c.nombre || ''}` : 'Editar cliente';

    edNombre.value = c?.nombre || '';
    edDoc.value    = c?.documento || '';
    edTel.value    = c?.telefono || '';
    edEmail.value  = c?.email || '';
    edDir.value    = c?.direccion || '';
    edNotas.value  = c?.notas || '';

    drawerEl.classList.add('open');
    drawerEl.setAttribute('aria-hidden','false');

    overlayEl.hidden = false;
    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';
  }

  function closeDrawerCliente(){
    drawerEl.classList.remove('open');
    drawerEl.setAttribute('aria-hidden','true');

    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
    setTimeout(()=>{ overlayEl.hidden = true; }, 200);
  }

  // Botones/overlay/esc
  document.getElementById('btnCerrarDrawer')?.addEventListener('click', closeDrawerCliente);
  document.getElementById('btnCancelarEditar')?.addEventListener('click', closeDrawerCliente);
  overlayEl?.addEventListener('click', closeDrawerCliente);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawerCliente(); });

  // Guardar desde drawer
  document.getElementById('btnGuardarEditar')?.addEventListener('click', async ()=>{
    try{
      if(!_clienteActual?.id){ return showToast('No hay cliente para editar','error'); }
      const p = {
        nombre:   edNombre.value.trim(),
        documento:edDoc.value.trim(),
        telefono: edTel.value.trim(),
        email:    edEmail.value.trim(),
        direccion:edDir.value.trim(),
        notas:    edNotas.value.trim(),
      };
      await apiFetch(`/clientes/${encodeURIComponent(_clienteActual.id)}`, { method:'PUT', body: JSON.stringify(p) });
      showToast('Cliente actualizado','success');
      closeDrawerCliente();
      await cargar(document.getElementById('buscarCliente')?.value || '');
    }catch(e){ showToast(e.message,'error'); }
  });

  // ---------- impresión / diálogo ----------
  function printCurrentDialog(){
    const body = $('#dlgClienteBody')?.innerHTML || '';
    const win = window.open('', '_blank');
    const styles = `
      body{font-family:Arial,sans-serif;padding:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}
      thead th{background:#f8fafc}
    `;
    win.document.write(`<html><head><meta charset="utf-8"><title>Cliente</title><style>${styles}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    win.document.close(); win.focus();
  }

  async function abrirDialogCliente(id) {
    const dlg = $('#dlgCliente'); const body = $('#dlgClienteBody'); const title = $('#dlgClienteTitulo');
    try {
      const data = await apiFetch(`/clientes/${encodeURIComponent(id)}`);
      const c = data?.cliente || data || {};
      title.textContent = `Cliente ${formatClientId(c.id)} — ${c.nombre || ''}`;
      const wa = c.telefono ? whatsappLink(c.telefono) : null;
      const ord = Array.isArray(data?.ordenes) ? data.ordenes : [];
      const veh = Array.isArray(data?.vehiculos) ? data.vehiculos : [];
      const visitas = Array.isArray(data?.visitas) ? data.visitas : [];
      const ordHtml = ord.length
        ? `<ul>${ord.map(o=>`<li>#${escapeHtml(o.numero||String(o.id))} · ${escapeHtml(o.estado||'')}
            <a class="btn-ghost" href="listado-ordenes.html#id=${encodeURIComponent(o.id)}" style="margin-left:8px">Ir</a></li>`).join('')}</ul>`
        : '<em>Sin órdenes</em>';
      const vehHtml = veh.length
        ? `<ul>${veh.map(v=>`<li>${escapeHtml(v.placa||'(sin placa)')} — ${escapeHtml(v.marca||'')} ${escapeHtml(v.modelo||'')}
            <a class="btn-ghost" href="vehiculos.html#id=${encodeURIComponent(v.id)}" style="margin-left:8px">Ir</a></li>`).join('')}</ul>`
        : '<em>Sin vehículos</em>';
      const visHtml = visitas.length
        ? `<ul>${visitas.slice(0,5).map(v=>`<li>${escapeHtml(v.fecha||'')} · ${escapeHtml(v.detalle||'')}</li>`).join('')}</ul>`
        : '<em>No hay visitas registradas</em>';

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <div><strong>Nombre:</strong> ${escapeHtml(c.nombre||'-')}</div>
          <div><strong>Documento:</strong> ${escapeHtml(c.documento||'-')}</div>
          <div><strong>Teléfono:</strong>
            <span style="display:inline-flex;align-items:center;gap:6px">
              ${escapeHtml(c.telefono||'-')}
              ${wa?`<a href="${wa}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp" style="display:inline-flex;align-items:center">${WA_SVG}</a>`:''}
            </span>
          </div>
          <div><strong>Email:</strong> ${escapeHtml(c.email||'-')}</div>
          <div class="full"><strong>Dirección:</strong> ${escapeHtml(c.direccion||'-')}</div>
          <div class="full"><strong>Notas:</strong> ${escapeHtml(c.notas||'-')}</div>
        </div>
        <hr>
        <h3>Órdenes relacionadas</h3>${ordHtml}
        <h3>Vehículos relacionados</h3>${vehHtml}
        <h3>Últimas visitas</h3>${visHtml}
      `;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', 'open');
    } catch (e) { showToast(e.message || 'No se pudo cargar el cliente', 'error'); }
  }

  // ---------- kebab en línea (Ver / Editar / Eliminar) ----------
  (function kebabInline() {
    const tbody = $('#tablaClientes tbody');
    if (!tbody) return;

    let openRow = null;

    function closeMenuRow(){
      if (openRow){ openRow.remove(); openRow = null; }
      document.querySelector('.kebab-btn[aria-expanded="true"]')?.setAttribute('aria-expanded','false');
    }

    tbody.addEventListener('click', (e)=>{
      const btn = e.target.closest('.kebab-btn, .btn-menu'); if (!btn) return;
      const tr = btn.closest('tr'); const id = tr?.dataset?.id; if (!id) return;

      if (btn.getAttribute('aria-expanded') === 'true'){ closeMenuRow(); return; }
      document.querySelectorAll('.kebab-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false'));
      btn.setAttribute('aria-expanded','true');
      closeMenuRow();

      const menuTr = document.createElement('tr');
      menuTr.className = 'menu-row';
      const td = document.createElement('td');
      td.colSpan = 4;
      td.innerHTML = `
        <div class="row-menu">
          <button type="button" data-act="ver">👁️ Ver</button>
          <button type="button" data-act="editar">✏️ Editar</button>
          <button type="button" data-act="eliminar">🗑️ Eliminar</button>
        </div>
      `;
      menuTr.appendChild(td);
      tr.insertAdjacentElement('afterend', menuTr);
      openRow = menuTr;

      td.addEventListener('click', async (ev)=>{
        const b = ev.target.closest('button[data-act]'); if(!b) return;
        const act = b.dataset.act;
        closeMenuRow();
        if (act==='ver') return abrirDialogCliente(id);
        if (act==='editar') {
          const c = LIST.find(x => String(x.id) === String(id)) || ALL_CACHE.find(x => String(x.id) === String(id));
          if (c) openDrawerCliente(c);
          return;
        }
        if (act==='eliminar') return eliminar(id);
      });

      const onDoc = (ev)=>{ if (!menuTr.contains(ev.target) && ev.target!==btn) { closeMenuRow(); document.removeEventListener('click', onDoc, true); } };
      setTimeout(()=>document.addEventListener('click', onDoc, true),0);
    });
  })();

  // ---------- CRUD desde formulario principal ----------
  function payloadFromMain(){
    return {
      nombre: ($('#c_nombre').value||'').trim(),
      documento: ($('#c_documento').value||'').trim(),
      telefono: ($('#c_telefono').value||'').trim(),
      email: ($('#c_email').value||'').trim(),
      direccion: ($('#c_direccion').value||'').trim(),
      notas: ($('#c_notas').value||'').trim(),
    };
  }
  async function guardar(e){
    e?.preventDefault?.();
    const id = ($('#c_id').value||'').trim();
    const p = payloadFromMain();
    const n = $('#msgFormCliente');
    if (!p.nombre){ if(n) n.textContent='El nombre es obligatorio.'; return; }
    try{
      if (id) {
        await apiFetch(`/clientes/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(p) });
        showToast('Cliente actualizado','success');
      } else {
        await apiFetch(`/clientes`, { method:'POST', body: JSON.stringify(p) });
        showToast('Cliente creado','success');
      }
      resetMainForm();
      await cargar('');
    }catch(err){ showToast(err.message,'error'); }
  }
  async function eliminar(id){
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
    try{
      await apiFetch(`/clientes/${encodeURIComponent(id)}`, { method:'DELETE' });
      showToast('Cliente eliminado','success');
      if ($('#c_id').value === String(id)) resetMainForm();
      await cargar($('#buscarCliente')?.value||'');
      $('#detalleCliente').textContent = 'Selecciona un cliente…';
    }catch(err){ showToast(err.message,'error'); }
  }
  function fillMainForm(c){
    $('#c_id').value = c?.id || '';
    $('#c_nombre').value = c?.nombre || '';
    $('#c_documento').value = c?.documento || '';
    $('#c_telefono').value = c?.telefono || '';
    $('#c_email').value = c?.email || '';
    $('#c_direccion').value = c?.direccion || '';
    $('#c_notas').value = c?.notas || '';
    $('#formTitle').textContent = c?.id ? `Editar cliente ${formatClientId(c.id)}` : 'Nuevo cliente';
    $('#btnCancelarEdicion').style.display = c?.id ? '' : 'none';
  }
  function resetMainForm(){ fillMainForm({}); }

  // ---------- eventos ----------
  function wire() {
    adjustTableHead();

    $('#btnBuscar')?.addEventListener('click', () => cargar($('#buscarCliente')?.value || ''));
    $('#buscarCliente')?.addEventListener('keydown', e => { if (e.key === 'Enter') cargar($('#buscarCliente').value); });
    $('#btnRefrescar')?.addEventListener('click', () => cargar($('#buscarCliente')?.value || ''));

    $('#formCliente')?.addEventListener('submit', guardar);
    $('#btnGuardarCliente')?.addEventListener('click', guardar);
    $('#btnCancelarEdicion')?.addEventListener('click', resetMainForm);

    $('#btnDlgPrint')?.addEventListener('click', () => printCurrentDialog());
    $('#btnDlgPdf')?.addEventListener('click', () => printCurrentDialog());
    $('#btnCerrarDlgCliente')?.addEventListener('click', () => {
      const d = $('#dlgCliente'); if (d?.close) d.close(); else d?.removeAttribute('open');
    });
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', async () => {
    try { wire(); await cargar(''); }
    catch (e) { showToast('No se pudo cargar clientes. ¿Backend activo?', 'error'); }
  });
})();

