// frontend/js/vehiculos.js
(function(){
  'use strict';

  const API_BASE = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
  const $  = (s, r=document)=>r.querySelector(s);

  // ===== Helpers =====
  function showToast(message, type='info'){
    try { if (typeof window.showToast === 'function') return window.showToast(type, message); } catch {}
    try { if (typeof window.mostrarToast === 'function') return window.mostrarToast(type, message); } catch {}
    console.log(`[${type}] ${message}`);
  }
  function actorHeaders(){
    let u={}; try{u=JSON.parse(localStorage.getItem('usuarioActual'))||{}}catch{}
    const actor = u?.usuario || u?.nombre || 'sistema';
    return { 'Content-Type':'application/json','Accept':'application/json','X-Actor':actor,'X-Actor-Usuario':actor };
  }
  async function apiFetch(path, options={}){
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, { mode:'cors', credentials:'omit', headers:{...actorHeaders(), ...(options.headers||{})}, ...options });
    let data=null; try{ data = await res.json(); }catch{}
    if (!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data;
  }
  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ===== Código cliente 0007 ⇄ 7 =====
  function formatClientCode(id){
    const n = parseInt(String(id||'').replace(/\D+/g,''),10);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(n).padStart(4,'0');
  }
  function parseClientCode(code){
    const raw = String(code||'').trim().toUpperCase();
    const m = raw.match(/^([A-Z]*)(\d{1,6})$/);
    if (!m) return null;
    const num = parseInt(m[2],10);
    return Number.isFinite(num) ? num : null;
  }
  function wireClientCodeInput(inp){
    if (!inp) return;
    inp.addEventListener('input', ()=>{
      const v = String(inp.value||'').toUpperCase();
      inp.value = v.replace(/[^A-Z0-9]/g,'');
    });
    inp.addEventListener('blur', ()=>{
      const id = parseClientCode(inp.value);
      inp.value = id ? formatClientCode(id) : (inp.value||'').trim();
    });
  }
  async function resolveClienteId(codeInputId, hiddenId){
    const hid = $(hiddenId)?.value?.trim();
    if (hid) return parseInt(hid,10);
    const codeVal = $(codeInputId)?.value || '';
    const id = parseClientCode(codeVal);
    if (!id) return null;
    // confirmar que exista
    const c = await apiFetch(`/clientes/${encodeURIComponent(id)}`).catch(()=>null);
    if (!c || !c.id) throw new Error(`Cliente ${formatClientCode(id)} no existe`);
    return id;
  }

  // ===== Estado =====
  const pag = { page:1, pageSize:10, total:0, q:'' };
  let LIST = [];
  let ALL_CACHE = [];
  let LOADING = false;

  // ===== Tabla =====
  function renderSkeletonRows(tbody, cols, rows=6){
    tbody.innerHTML='';
    for(let i=0;i<rows;i++){
      const tr = document.createElement('tr'); tr.className='skel-row skel';
      for(let c=0;c<cols;c++) tr.appendChild(document.createElement('td'));
      tbody.appendChild(tr);
    }
  }
  function renderEmptyRow(tbody, cols, msg){ tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">${escapeHtml(msg)}</td></tr>`; }

  function renderTabla(items){
    const tbody = $('#tablaVehiculos tbody');
    tbody.innerHTML='';
    if (!items.length) return renderEmptyRow(tbody, 5, pag.q ? 'Sin resultados' : 'Aún no hay vehículos');

    const base = (pag.page-1)*pag.pageSize;
    items.forEach((v,i)=>{
      const code = v.cliente_id ? formatClientCode(v.cliente_id) : '';
      const tr = document.createElement('tr'); tr.dataset.id=String(v.id);
      tr.innerHTML = `
        <td>${base + i + 1}</td>
        <td><strong>${escapeHtml(v.placa||'(sin placa)')}</strong></td>
        <td>${escapeHtml(v.marca||'')} ${escapeHtml(v.modelo||'')}</td>
        <td>${code || '-'}</td>
        <td class="td-acciones"><button class="kebab-btn btn-menu" title="Acciones" aria-haspopup="true" aria-expanded="false">⋮</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===== Listado completo (3ra card) =====
  function renderDetalleTabla(all){
    const host = $('#detalleVehiculo'); if (!host) return;
    if (!all.length) { host.textContent = 'Sin datos para mostrar.'; return; }
    const rows = all.map(v => {
      const code = v.cliente_id ? formatClientCode(v.cliente_id) : '';
      const nombre = v.cliente_nombre ?? v.clienteNombre ?? '';
      const clienteTxt = code ? `${code} — ${escapeHtml(nombre)}` : (escapeHtml(nombre) || '-');
      return `
        <tr>
          <td>${escapeHtml(v.placa||'-')}</td>
          <td>${escapeHtml(v.marca||'-')}</td>
          <td>${escapeHtml(v.modelo||'-')}</td>
          <td>${escapeHtml(v.anio??'-')}</td>
          <td>${escapeHtml(v.vin||'-')}</td>
          <td>${escapeHtml(v.color||'-')}</td>
          <td>${clienteTxt}</td>
        </tr>
      `;
    }).join('');
    host.innerHTML = `
      <div style="overflow:auto">
        <table class="tabla">
          <thead>
            <tr>
              <th>Placa</th><th>Marca</th><th>Modelo</th><th>Año</th><th>VIN</th><th>Color</th><th>Cliente</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ===== Paginador =====
  function buildPaginador(container, state, onChange){
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    container.innerHTML='';
    const mk=(t)=>{const b=document.createElement('button'); b.className='btn'; b.textContent=t; return b;};
    const prev=mk('« Anterior'), next=mk('Siguiente »');
    prev.disabled = state.page<=1; next.disabled = state.page>=maxPage;
    const meta = document.createElement('span'); meta.className='meta'; meta.textContent=`Página ${state.page} de ${maxPage} · ${state.total} registros`;
    const sel=document.createElement('select'); [5,10,20,50,100].forEach(n=>{const o=document.createElement('option'); o.value=n; o.textContent=n; if(n===state.pageSize) o.selected=true; sel.appendChild(o);});
    const selLabel=document.createElement('span'); selLabel.className='meta'; selLabel.textContent='Por página:';
    prev.onclick=()=>{ if(state.page>1){ state.page--; onChange(); } };
    next.onclick=()=>{ if(state.page<maxPage){ state.page++; onChange(); } };
    sel.onchange=()=>{ state.pageSize=parseInt(sel.value,10)||10; state.page=1; onChange(); };
    container.append(prev,next,meta,selLabel,sel);
  }

  // ===== Cargar =====
  async function cargar(qStr){
    if (LOADING) return;
    LOADING = true;

    const tbody = $('#tablaVehiculos tbody');
    renderSkeletonRows(tbody, 5, 6);

    if (typeof qStr==='string'){ const nq=qStr.trim(); if (nq!==pag.q) pag.page=1; pag.q=nq; }

    try {
      const resp = await apiFetch(`/vehiculos${pag.q ? `?q=${encodeURIComponent(pag.q)}`:''}`);
      const all = Array.isArray(resp) ? resp : (Array.isArray(resp.items) ? resp.items : []);
      ALL_CACHE = all;
      pag.total = all.length;
      const start=(pag.page-1)*pag.pageSize;
      LIST = all.slice(start, start+pag.pageSize);

      renderTabla(LIST);
      renderDetalleTabla(all);

      const cont = document.getElementById('paginador-vehiculos');
      cont && buildPaginador(cont, pag, ()=>cargar(pag.q));
      const count = document.getElementById('countVehiculos');
      if (count) count.textContent = `Vehículos (${all.length})`;
    } catch(err){
      renderEmptyRow(tbody, 5, 'Error cargando vehículos');
      showToast(err.message || 'Error cargando vehículos','error');
    } finally {
      LOADING = false;
    }
  }

  // ===== Dialog de Ver =====
  function printCurrentDialog(){
    const body = $('#dlgVehiculoBody')?.innerHTML || '';
    const win = window.open('', '_blank');
    const styles = `
      body{font-family:Arial,sans-serif;padding:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}
      thead th{background:#f8fafc}
    `;
    win.document.write(`<html><head><meta charset="utf-8"><title>Vehículo</title><style>${styles}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    win.document.close(); win.focus();
  }

  async function abrirDialogVehiculo(id){
    const dlg = $('#dlgVehiculo'); const body = $('#dlgVehiculoBody'); const title = $('#dlgVehiculoTitulo');
    try{
      const data = await apiFetch(`/vehiculos/${encodeURIComponent(id)}`);
      const v = data?.vehiculo || data || {};
      const c = data?.cliente || {};
      const ords = Array.isArray(data?.ordenes) ? data.ordenes : [];

      const clienteId  = c?.id ?? v?.cliente_id ?? null;
      // <- aquí aceptamos tanto cliente_nombre (snake) como clienteNombre (camel)
      const clienteNom = c?.nombre ?? v?.cliente_nombre ?? v?.clienteNombre ?? '';
      const clienteCode = clienteId ? formatClientCode(clienteId) : '';

      title.textContent = `Vehículo ${escapeHtml(v.placa||'')} — ${escapeHtml(v.marca||'')} ${escapeHtml(v.modelo||'')}`;
      const ordHtml = ords.length
        ? `<ul>${ords.map(o=>`<li>#${escapeHtml(o.numero||String(o.id))} · ${escapeHtml(o.estado||'')}
               <a class="btn-ghost" href="listado-ordenes.html#id=${encodeURIComponent(o.id)}" style="margin-left:8px">Ir</a></li>`).join('')}</ul>`
        : '<em>Sin órdenes</em>';

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <div><strong>Placa:</strong> ${escapeHtml(v.placa||'-')}</div>
          <div><strong>Año:</strong> ${escapeHtml(v.anio??'-')}</div>
          <div><strong>Marca / Modelo:</strong> ${escapeHtml(v.marca||'-')} ${escapeHtml(v.modelo||'')}</div>
          <div><strong>Color:</strong> ${escapeHtml(v.color||'-')}</div>
          <div class="full"><strong>VIN:</strong> ${escapeHtml(v.vin||'-')}</div>
          <div class="full"><strong>Cliente:</strong> ${
            clienteId
              ? `${clienteCode} — <a href="clientes.html#id=${encodeURIComponent(clienteId)}">${escapeHtml(clienteNom||'-')}</a>`
              : '-'
          }</div>
        </div>
        <hr>
        <h3>Órdenes relacionadas</h3>${ordHtml}
      `;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open','open');
    }catch(e){ showToast(e.message,'error'); }
  }

  // botones del dialog
  $('#btnDlgPrint')?.addEventListener('click', ()=>printCurrentDialog());
  $('#btnDlgPdf')?.addEventListener('click', ()=>printCurrentDialog());
  $('#btnCerrarDlgVehiculo')?.addEventListener('click', ()=>{ const d=$('#dlgVehiculo'); if(d?.close) d.close(); else d?.removeAttribute('open'); });

  // ===== Drawer Edición =====
  const drawerEl  = document.getElementById('drawerEditar');
  const overlayEl = document.getElementById('drawerOverlay');
  const tituloEl  = document.getElementById('drawerTitulo');

  const edClienteCode = document.getElementById('ed_cliente_code');
  const edClienteId   = document.getElementById('ed_cliente_id');
  const edPlaca = document.getElementById('ed_placa');
  const edMarca = document.getElementById('ed_marca');
  const edModelo= document.getElementById('ed_modelo');
  const edAnio  = document.getElementById('ed_anio');
  const edColor = document.getElementById('ed_color');
  const edVin   = document.getElementById('ed_vin');

  let _vehiculoActual = null;

  function openDrawerVehiculo(v){
    _vehiculoActual = v || null;
    tituloEl.textContent = v ? `Editar vehículo #${v.id}` : 'Editar vehículo';

    edClienteCode.value = v?.cliente_id ? formatClientCode(v.cliente_id) : '';
    edClienteId.value   = v?.cliente_id ?? '';
    edPlaca.value  = v?.placa  || '';
    edMarca.value  = v?.marca  || '';
    edModelo.value = v?.modelo || '';
    edAnio.value   = v?.anio   || '';
    edColor.value  = v?.color  || '';
    edVin.value    = v?.vin    || '';

    drawerEl.classList.add('open');
    drawerEl.setAttribute('aria-hidden','false');

    overlayEl.hidden = false;
    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';
  }
  function closeDrawerVehiculo(){
    drawerEl.classList.remove('open');
    drawerEl.setAttribute('aria-hidden','true');
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
    setTimeout(()=>{ overlayEl.hidden = true; }, 200);
  }

  document.getElementById('btnCerrarDrawer')?.addEventListener('click', closeDrawerVehiculo);
  document.getElementById('btnCancelarEditar')?.addEventListener('click', closeDrawerVehiculo);
  overlayEl?.addEventListener('click', closeDrawerVehiculo);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawerVehiculo(); });
  wireClientCodeInput(edClienteCode);

  // Guardar desde drawer (permite cambiar cliente)
  document.getElementById('btnGuardarEditar')?.addEventListener('click', async ()=>{
    try{
      if(!_vehiculoActual?.id){ return showToast('No hay vehículo para editar','error'); }
      const cliente_id = await resolveClienteId('#ed_cliente_code', '#ed_cliente_id'); // puede ser null si no cambian nada
      const p = {
        placa:   edPlaca.value.trim(),
        marca:   edMarca.value.trim(),
        modelo:  edModelo.value.trim(),
        anio:    edAnio.value ? parseInt(edAnio.value,10) : null,
        color:   edColor.value.trim(),
        vin:     edVin.value.trim()
      };
      if (cliente_id) p.cliente_id = cliente_id; // solo si lo cambian
      await apiFetch(`/vehiculos/${encodeURIComponent(_vehiculoActual.id)}`, { method:'PUT', body: JSON.stringify(p) });
      showToast('Vehículo actualizado','success');
      closeDrawerVehiculo();
      await cargar($('#q')?.value || '');
    }catch(e){ showToast(e.message,'error'); }
  });

  // ===== Kebab inline (Ver / Editar / Eliminar) =====
  (function kebabInline() {
    const tbody = $('#tablaVehiculos tbody');
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
      td.colSpan = 5;
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
        if (act==='ver') return abrirDialogVehiculo(id);
        if (act==='editar') {
          const v = LIST.find(x => String(x.id) === String(id)) || ALL_CACHE.find(x => String(x.id) === String(id));
          if (v) openDrawerVehiculo(v);
          return;
        }
        if (act==='eliminar') return eliminar(id);
      });

      const onDoc = (ev)=>{ if (!menuTr.contains(ev.target) && ev.target!==btn) { closeMenuRow(); document.removeEventListener('click', onDoc, true); } };
      setTimeout(()=>document.addEventListener('click', onDoc, true),0);
    });
  })();

  // ===== Form crear/editar (principal) =====
  wireClientCodeInput($('#v_cliente_code'));

  function getPayloadBase(){
    return {
      placa:   ($('#v_placa')?.value||'').trim(),
      marca:   ($('#v_marca')?.value||'').trim(),
      modelo:  ($('#v_modelo')?.value||'').trim(),
      anio:    $('#v_anio')?.value ? parseInt($('#v_anio').value,10) : null,
      vin:     ($('#v_vin')?.value||'').trim(),
      color:   ($('#v_color')?.value||'').trim(),
    };
  }
  function msgForm(t){ const n=$('#msgFormVehiculo'); if(n) n.textContent=t||''; }
  function fillForm(v){
    $('#v_id')      && ($('#v_id').value      = v?.id || '');
    $('#v_cliente_code') && ($('#v_cliente_code').value = v?.cliente_id ? formatClientCode(v.cliente_id) : '');
    $('#v_cliente_id')   && ($('#v_cliente_id').value   = v?.cliente_id ?? '');
    $('#v_placa')   && ($('#v_placa').value   = v?.placa ?? '');
    $('#v_marca')   && ($('#v_marca').value   = v?.marca ?? '');
    $('#v_modelo')  && ($('#v_modelo').value  = v?.modelo ?? '');
    $('#v_anio')    && ($('#v_anio').value    = v?.anio ?? '');
    $('#v_vin')     && ($('#v_vin').value     = v?.vin ?? '');
    $('#v_color')   && ($('#v_color').value   = v?.color ?? '');
    $('#formTitle') && ($('#formTitle').textContent = v?.id ? `Editar vehículo #${v.id}` : 'Nuevo vehículo');
    $('#btnCancelarEdicion') && ($('#btnCancelarEdicion').style.display = v?.id ? '' : 'none');
  }
  function resetForm(){ fillForm({}); }

  async function guardar(e){
    e?.preventDefault?.();
    const id = ($('#v_id')?.value||'').trim();

    // Resuelve cliente_id desde código 0007 o hidden
    let cliente_id = null;
    try{
      cliente_id = await resolveClienteId('#v_cliente_code', '#v_cliente_id');
    }catch(err){
      msgForm(err.message || 'Debes indicar un cliente válido.'); return;
    }

    const p = { ...getPayloadBase(), cliente_id };
    if (!p.placa){ msgForm('La Placa es obligatoria.'); return; }
    msgForm('');

    try{
      if (id) await apiFetch(`/vehiculos/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(p) });
      else    await apiFetch(`/vehiculos`, { method:'POST', body: JSON.stringify(p) });
      showToast(id ? 'Vehículo actualizado' : 'Vehículo creado','success');
      resetForm();
      await cargar($('#q')?.value || '');
    }catch(err){ showToast(err.message,'error'); }
  }
  async function eliminar(id){
    if (!confirm('¿Eliminar este vehículo? Esta acción no se puede deshacer.')) return;
    try{
      await apiFetch(`/vehiculos/${encodeURIComponent(id)}`, { method:'DELETE' });
      showToast('Vehículo eliminado','success');
      if ($('#v_id')?.value === String(id)) resetForm();
      await cargar($('#q')?.value || '');
      const det = $('#detalleVehiculo'); if (det) det.textContent = 'Sin datos para mostrar.';
    }catch(err){ showToast(err.message,'error'); }
  }

  // ===== Búsqueda / export =====
  function wireSearch(){
    const inp = $('#q');
    const btnBuscar = $('#btnBuscar');
    const btnRefrescar = $('#btnRefrescar');

    if (inp && !inp._wired) {
      inp._wired = true;
      let t; inp.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=>{ pag.page=1; cargar(inp.value.trim()); }, 300); });
      inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); pag.page=1; cargar(inp.value.trim()); } });
    }
    btnBuscar && !btnBuscar._wired && (btnBuscar._wired = btnBuscar.addEventListener('click', ()=>{ pag.page=1; cargar(inp?.value.trim()||''); }));
    btnRefrescar && !btnRefrescar._wired && (btnRefrescar._wired = btnRefrescar.addEventListener('click', ()=>cargar(inp?.value.trim()||'')));
  }

  function descargarCSV(rows, filename){
    const csv = rows.map(r=>r.map(v=>{
      if(v==null) v=''; v=String(v).replace(/"/g,'""'); return /[",\n;]/.test(v) ? `"${v}"` : v;
    }).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV(){
    const headers = ['#','Placa','Marca','Modelo','Cliente','Año','VIN','Color'];
    const base = (pag.page-1)*pag.pageSize;
    const rows = LIST.map((v,i)=>{
      const code = v.cliente_id ? formatClientCode(v.cliente_id) : '';
      const nombre = v.cliente_nombre ?? v.clienteNombre ?? '';
      const clienteTxt = code ? `${code} — ${nombre}` : (nombre || '');
      return [ base + i + 1, v.placa||'', v.marca||'', v.modelo||'', clienteTxt, v.anio||'', v.vin||'', v.color||'' ];
    });
    descargarCSV([headers, ...rows], `vehiculos-${new Date().toISOString().slice(0,10)}.csv`);
  }
  function imprimirTabla(){
    const table = document.getElementById('tablaVehiculos');
    const win = window.open('', '_blank');
    const styles = `
      body{font-family:Arial,sans-serif;padding:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}
      thead th{background:#f8fafc}
    `;
    win.document.write(`
      <html><head><meta charset="utf-8"><title>Vehículos - RCV</title><style>${styles}</style></head>
      <body>
        ${table.outerHTML}
        <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 300); }<\/script>
      </body></html>
    `);
    win.document.close(); win.focus();
  }

  // ===== Wire & Init =====
  function wire(){
    wireSearch();
    document.getElementById('formVehiculo')?.addEventListener('submit', guardar);
    document.getElementById('btnGuardarVehiculo')?.addEventListener('click', guardar);
    document.getElementById('btnCancelarEdicion')?.addEventListener('click', ()=>fillForm({}));
    document.getElementById('btnExportVehiculos')?.addEventListener('click', imprimirTabla);
    document.getElementById('btnExportVehiculosCsv')?.addEventListener('click', exportCSV);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try { wire(); await cargar(''); }
    catch (e) { showToast('No se pudo cargar vehículos. ¿Backend activo?', 'error'); }
  });
})();

