// frontend/js/cotizaciones.js
(function(){
  'use strict';
  const el = sel => document.querySelector(sel);
  const tbody = el('#tblItems tbody');
  const preview = el('#preview');

  // === API base ===
  const API = (window.API?.BASE) || localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  // === Auth helper ===
  function getToken(){ return localStorage.getItem('AUTH_TOKEN') || ''; }
  function authHeaders(extra) {
    const h = { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` };
    return extra ? { ...h, ...extra } : h;
  }

  // === Helpers ===
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  const fetchJSON = async (url, opts={}) => {
    const res = await fetch(url, { headers: authHeaders(opts.headers), cache:'no-store', ...opts });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { return await res.json(); } catch { return null; }
  };
  const fetchMaybe = async (url)=>{
    try {
      const r = await fetch(url, { cache:'no-store', headers: authHeaders() });
      if(!r.ok) return null; return await r.json();
    } catch { return null; }
  };
  const toast = (msg, type='info')=>{
    try { if (window.showToast) return window.showToast(type, msg); } catch {}
    alert(msg);
  };

  // === UI: sugerencias de catálogo (ul flotante) ===
  let suggestBox = null, suggestOwner = null, blurTimer=null;
  function ensureSuggestBox(){
    if (suggestBox) return suggestBox;
    suggestBox = document.createElement('ul');
    suggestBox.id = 'catalogSuggest';
    suggestBox.style.position = 'fixed';
    suggestBox.style.zIndex = '1000';
    suggestBox.style.margin = '0';
    suggestBox.style.padding = '6px';
    suggestBox.style.listStyle = 'none';
    suggestBox.style.maxHeight = '240px';
    suggestBox.style.overflowY = 'auto';
    suggestBox.style.background = '#fff';
    suggestBox.style.border = '1px solid #e5e7eb';
    suggestBox.style.borderRadius = '8px';
    suggestBox.style.boxShadow = '0 8px 24px rgba(0,0,0,.08)';
    suggestBox.hidden = true;
    document.body.appendChild(suggestBox);

    const handlePick = (target)=>{
      const li = target.closest('li[data-id]');
      if (!li || !suggestOwner) return;
      const tr = suggestOwner.closest('tr');
      const inputs = Array.from(tr.querySelectorAll('input'));
      const [inpDesc, inpCant, inpPrecio, inpDescPct] = inputs;

      // setear valores desde dataset
      inpDesc.value = li.dataset.nombre || '';
      inpPrecio.value = Number(li.dataset.precio || 0).toFixed(2);
      if (!inpCant.value) inpCant.value = 1;
      if (!inpDescPct.value) inpDescPct.value = 0;

      // guardar info para post y cálculo
      tr.dataset.impuestoPct = String(Number(li.dataset.imp || 0) || 0);
      tr.dataset.itemId = li.dataset.id || '';
      tr.dataset.tipo = li.dataset.tipo || '';
      tr.dataset.itemRef = li.dataset.ref || ''; // << nuevo: prod:123 | cat:456

      hideSuggest();
      recalc(); // actualiza subtotales
    };

    suggestBox.addEventListener('mousedown', (e)=>{ e.preventDefault(); handlePick(e.target); });
    suggestBox.addEventListener('click', (e)=>{ handlePick(e.target); });

    document.addEventListener('click', (e)=>{
      if (e.target === suggestBox || e.target === suggestOwner) return;
      if (!e.target.closest('#catalogSuggest')) hideSuggest();
    });
    return suggestBox;
  }
  function positionSuggestFor(input){
    const r = input.getBoundingClientRect();
    const sb = ensureSuggestBox();
    sb.style.left = `${Math.max(8, r.left)}px`;
    sb.style.top  = `${r.bottom + 4}px`;
    sb.style.minWidth = `${Math.max(260, r.width)}px`;
  }
  function showSuggest(input, items){
    const sb = ensureSuggestBox();
    suggestOwner = input;
    positionSuggestFor(input);
    if (!Array.isArray(items) || !items.length){
      sb.innerHTML = `<li class="muted" style="padding:6px 8px;color:#6b7280">Sin resultados</li>`;
      sb.hidden = false;
      return;
    }
    // Soportar tanto el viejo /catalogo como el nuevo /cotizaciones/items/buscar
    sb.innerHTML = items.map(it => {
      const id   = (it.item_id != null ? it.item_id : it.id);
      const tipo = it.tipo || '';
      const imp  = (it.tarifa_isv != null ? it.tarifa_isv : (it.impuesto_pct || 0));
      const precio = (it.precio_sugerido != null ? it.precio_sugerido
                    : (typeof it.precio_base === 'number' ? it.precio_base
                    : (it.precio || 0)));
      const nombre = it.nombre || '';
      const sku = it.sku ? ` (#${escapeHtml(it.sku)})` : '';
      const ref = it.item_ref || ''; // prod:123 | cat:456
      return `
        <li
          data-id="${id}"
          data-ref="${ref}"
          data-nombre="${escapeHtml(nombre)}"
          data-precio="${Number(precio)}"
          data-imp="${Number(imp)}"
          data-tipo="${escapeHtml(tipo)}"
          style="padding:6px 8px;cursor:pointer"
        >
          <div style="font-weight:600">${escapeHtml(nombre)}</div>
          <div style="font-size:12px;color:#6b7280">
            ${(tipo||'').charAt(0).toUpperCase() + (tipo||'').slice(1)}
            ${sku}
            ${Number.isFinite(precio) ? ' · L ' + Number(precio).toFixed(2) : ''}
            ${Number.isFinite(imp) ? ' · ISV ' + Number(imp) + '%' : ''}
          </div>
        </li>
      `;
    }).join('');
    sb.hidden = false;
  }
  function hideSuggest(){
    if (!suggestBox) return;
    suggestBox.hidden = true;
    suggestOwner = null;
  }

  // === Búsqueda unificada (backend /cotizaciones/items/buscar) ===
  let catTimer = null;
  async function buscarCatalogo(q){
    if (!q || q.length < 2) return [];
    const tipo = el('#catTipo')?.value || '';
    // URL simple (soporta API absoluto o relativo)
    const url = `${API}/cotizaciones/items/buscar?q=${encodeURIComponent(q)}${tipo ? `&tipo=${encodeURIComponent(tipo)}` : ''}`;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }

  // (Opcional) cargar combos si existen endpoints
  async function cargarFiltros(){
    const secciones = await fetchMaybe(`${API}/catalogo/secciones`);
    if (Array.isArray(secciones) && secciones.length){
      const s = el('#catSeccion');
      s.innerHTML = `<option value="">Todas</option>` + secciones.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');
      el('#boxArea').style.display = 'block';
      s.addEventListener('change', async ()=>{
        const sid = s.value;
        const areas = await fetchMaybe(`${API}/catalogo/areas?seccion_id=${encodeURIComponent(sid)}`);
        const a = el('#catArea');
        a.innerHTML = `<option value="">Todas</option>` + (Array.isArray(areas)?areas.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join(''):'');

        // Nota: los filtros se usan solo visualmente; el endpoint unificado no filtra por seccion/area
      });
    } else {
      el('#boxArea').style.display = 'none';
    }
  }

  // === Tabla/items ===
  function nuevaFila(desc='', cant=1, precio=0, descPct=0){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input value="${desc}" placeholder="Descripción (catálogo para autocompletar)" /></td>
      <td><input type="number" value="${cant}" step="1" min="1" style="width:80px" /></td>
      <td><input type="number" value="${precio}" step="0.01" style="width:120px" /></td>
      <td><input type="number" value="${descPct}" step="0.01" style="width:100px" /></td>
      <td class="sub">0.00</td>
      <td><button class="btn-ghost" data-del>✕</button></td>
    `;
    tr.dataset.tipo = el('#catTipo')?.value || 'servicio';
    tbody.appendChild(tr);
    recalc();
  }

  function recalc(){
    let subtotal = 0;
    tbody.querySelectorAll('tr').forEach(tr=>{
      const [desc,cant,precio,descPct] = Array.from(tr.querySelectorAll('input')).map(i=>i.value);
      const q = parseFloat(cant)||0, p = parseFloat(precio)||0, d = parseFloat(descPct)||0;
      const s = q*p*(1 - d/100);
      tr.querySelector('.sub').textContent = s.toFixed(2);
      subtotal += s;
    });
    return subtotal;
  }

  // ——— Totales: impuesto por ítem (si viene del pick) + global para resto ———
  function totales(subtotal){
    const isvGlobal = parseFloat(el('#isv').value)||15;

    let baseGlobal = 0;
    let impLineas  = 0;

    tbody.querySelectorAll('tr').forEach(tr=>{
      const base = parseFloat(tr.querySelector('.sub')?.textContent)||0;
      const pct  = Number(tr.dataset.impuestoPct || 0) || 0;
      if (pct > 0) impLineas += base*(pct/100);
      else baseGlobal += base;
    });

    const impGlobal = baseGlobal * (isvGlobal/100);
    const isvAmt = impLineas + impGlobal;
    const total  = subtotal + isvAmt;

    return { subtotal, isv: isvGlobal, isvAmt, total };
  }

  function renderPreview(){
    const C = (window.PUBLIC_CONTENT && window.PUBLIC_CONTENT.taller) || {};
    const data = tomarData();
    const { subtotal, isv, isvAmt, total } = totales(recalc());
    const logo = 'img/logo.png';
    preview.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <img src="${logo}" style="max-height:80px"/>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:700">COTIZACIÓN</div>
          <div>${new Date().toLocaleString()}</div>
        </div>
      </div>
      <div style="font-size:12px;margin-top:6px"><strong>Taller:</strong> ${escapeHtml(C.nombre||"")} &nbsp; <strong>Tel:</strong> ${escapeHtml(C.telefono||"")} &nbsp; <strong>Email:</strong> ${escapeHtml(C.email||"")} &nbsp; <strong>Dirección:</strong> ${escapeHtml(C.direccion||"")}</div>
      <hr/>
      <div style="display:flex;gap:24px;margin:10px 0;flex-wrap:wrap">
        <div><strong>Cliente:</strong> ${escapeHtml(data.cNombre||'')}</div>
        <div><strong>Tel:</strong> ${escapeHtml(data.cTel||'')}</div>
        <div><strong>Email:</strong> ${escapeHtml(data.cEmail||'')}</div>
        <div><strong>Vehículo:</strong> ${escapeHtml(data.cVehiculo||'')}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ddd">Descripción</th>
            <th style="text-align:right;border-bottom:1px solid #ddd">Cant</th>
            <th style="text-align:right;border-bottom:1px solid #ddd">Precio</th>
            <th style="text-align:right;border-bottom:1px solid #ddd">Desc %</th>
            <th style="text-align:right;border-bottom:1px solid #ddd">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(tbody.querySelectorAll('tr')).map(tr=>{
            const [d,q,p,dp] = Array.from(tr.querySelectorAll('input')).map(i=>i.value);
            const s = parseFloat(tr.querySelector('.sub').textContent)||0;
            return `<tr>
              <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">${escapeHtml(d)}</td>
              <td style="text-align:right">${q}</td>
              <td style="text-align:right">${Number(p||0).toFixed(2)}</td>
              <td style="text-align:right">${dp||0}</td>
              <td style="text-align:right">${s.toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:10px">
        <table>
          <tr><td style="padding:4px 8px">Subtotal</td><td style="text-align:right">${subtotal.toFixed(2)}</td></tr>
          <tr><td style="padding:4px 8px">ISV (${isv}%)</td><td style="text-align:right">${isvAmt.toFixed(2)}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:700">Total</td><td style="text-align:right;font-weight:700">${total.toFixed(2)}</td></tr>
        </table>
      </div>
      ${ (data.notas && data.notas.trim())
        ? `<div style="margin-top:10px;font-size:12px"><strong>Notas:</strong> ${escapeHtml(data.notas)}</div>`
        : '' }
      <div style="margin-top:16px;font-size:12px;color:#333">
        <em>Esta cotización tiene una vigencia de 10 días. Sujeto a inspección del vehículo. No incluye trabajos adicionales no contemplados.</em><br/>
        <em>Firma: ____________________________  (Gerente General)</em>
      </div>
    `;
  }

  function tomarData(){
    return {
      cNombre: document.getElementById('cNombre').value.trim(),
      cTel: document.getElementById('cTel').value.trim(),
      cEmail: document.getElementById('cEmail').value.trim(),
      cVehiculo: document.getElementById('cVehiculo').value.trim(),
      notas: document.getElementById('notas').value.trim(),
    };
  }

  // Construir payload para /cotizaciones
  function buildPayload(){
    const items = [];
    tbody.querySelectorAll('tr').forEach(tr=>{
      const ins = Array.from(tr.querySelectorAll('input'));
      const [inpDesc, inpCant, inpPrecio, inpDescPct] = ins;

      const it = {
        // si el usuario eligió del autocompletar unificado:
        item_ref: tr.dataset.itemRef || undefined,    // "prod:123" | "cat:456"

        // si lo escribió manual (o quieres explicitar igual):
        tipo: (tr.dataset.tipo || el('#catTipo')?.value || 'servicio'),
        descripcion: (inpDesc.value || '').trim() || null,
        cantidad: Number(inpCant.value || 0),
        precio_unitario: Number(inpPrecio.value || 0),

        // descuento como % (backend lo entiende igual que "descuento")
        descuento_pct: Number(inpDescPct.value || 0),
      };

      // Si tenemos impuesto del ítem del catálogo, lo enviamos para que el backend cuadre con el preview
      if (tr.dataset.impuestoPct != null && tr.dataset.impuestoPct !== '') {
        it.impuesto_pct = Number(tr.dataset.impuestoPct);
      }

      // Solo empujar si hay cantidad y desc o item_ref
      if (it.cantidad > 0 && (it.descripcion || it.item_ref)) items.push(it);
    });

    return {
      cliente_id: null,
      fecha: new Date().toISOString().slice(0,10),
      items
    };
  }

  // Guardar en backend
  async function guardar(){
    const payload = buildPayload();
    if (!payload.items.length){
      toast('Agrega al menos un ítem', 'warning'); return;
    }
    try{
      const res = await fetch(`${API}/cotizaciones`, {
        method:'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>null);
      if (!res.ok){
        const msg = (data && (data.error||data.message)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast(`Cotización guardada (id ${data.id})`, 'success');
    }catch(e){
      toast(`Error al guardar: ${e.message}`, 'error');
    }
  }

  // === Wire general ===
  document.getElementById('agregarItem').addEventListener('click',()=>nuevaFila());
  tbody.addEventListener('input', recalc);
  tbody.addEventListener('click', (e)=>{ if(e.target.hasAttribute('data-del')) e.target.closest('tr').remove(); recalc(); });
  document.getElementById('btnPreview').addEventListener('click', renderPreview);
  document.getElementById('btnGuardar').addEventListener('click', guardar);

  document.getElementById('btnPDF').addEventListener('click', async ()=>{
    renderPreview();
    const node = document.getElementById('preview');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const canvas = await html2canvas(node, { scale: 2 });
    const img = canvas.toDataURL('image/png');
    const w = doc.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    doc.addImage(img, 'PNG', 0, 0, w, h);
    doc.save('cotizacion.pdf');
  });

  document.getElementById('btnDOC').addEventListener('click', ()=>{
    renderPreview();
    const html = '<html><head><meta charset="utf-8"></head><body>'+document.getElementById('preview').innerHTML+'</body></html>';
    const blob = new Blob([html], { type:'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cotizacion.doc';
    a.click();
  });

  // === Wire: autocompletado en "Descripción" (usa endpoint unificado) ===
  tbody.addEventListener('input', (e)=>{
    const input = e.target;
    const isDesc = input && input.tagName==='INPUT' && input.closest('td')?.cellIndex === 0;
    if (!isDesc) return;

    clearTimeout(catTimer);
    const q = (input.value||'').trim();
    if (q.length < 2){ hideSuggest(); return; }

    catTimer = setTimeout(async ()=>{
      try{
        positionSuggestFor(input);
        const items = await buscarCatalogo(q);
        showSuggest(input, items);
      }catch{ hideSuggest(); }
    }, 180);
  });

  tbody.addEventListener('focusin', (e)=>{
    const input = e.target;
    const isDesc = input && input.tagName==='INPUT' && input.closest('td')?.cellIndex === 0;
    if (isDesc && input.value && input.value.length >= 2){
      clearTimeout(catTimer);
      catTimer = setTimeout(async ()=>{
        try{
          positionSuggestFor(input);
          const items = await buscarCatalogo(input.value.trim());
          showSuggest(input, items);
        }catch{ hideSuggest(); }
      }, 150);
    }
  });

  tbody.addEventListener('focusout', ()=>{
    clearTimeout(blurTimer);
    blurTimer = setTimeout(hideSuggest, 120);
  });

  // === Inicial ===
  cargarFiltros();
  nuevaFila('Diagnóstico', 1, 0, 0);
  nuevaFila('Mano de obra', 1, 0, 0);
  renderPreview();
})();
