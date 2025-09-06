(function () {
  'use strict';
  const API_BASE = (window.API?.BASE) || localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  function toast(m,t='info'){ try{ if(window.showToast) return window.showToast(t,m);}catch{} console.log(`[${t}] ${m}`); }
  async function fetchJSON(url, opt={}) {
    const headers = {'Content-Type':'application/json', ...(opt.headers||{})};
    const res = await fetch(url, { cache:'no-store', ...opt, headers });
    let data=null; try{ data = await res.json(); }catch{}
    if (!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data;
  }

  // ----- dialog helpers -----
  const getDialog  = (ref)=>{ const el=document.getElementById(String(ref).replace(/^#/,'')); return el && typeof el.showModal==='function' ? el : null; };
  const openDialog = (ref)=>{ const d=getDialog(ref); if (d && !d.open) d.showModal(); };
  const closeDialog= (ref)=>{ const d=getDialog(ref); if (d && d.open)  d.close(); };

  // ----- selects con placeholder -----
  function fillSelect(el, items, placeholder) {
    if (!el) return;
    const ph  = placeholder ? `<option value="" selected disabled>${placeholder}</option>` : '';
    const opts = items.map(it => `<option value="${it.id}">${it.nombre}</option>`).join('');
    el.innerHTML = ph + opts;
  }

  // ----- vocab -----
  let VOCAB = { secciones: [], areas: [] };

  async function fallbackVocabFromCatalog(){
    const [serv, rep] = await Promise.all([
      fetchJSON(`${API_BASE}/catalogo?tipo=servicio&limit=1000`).catch(()=>[]),
      fetchJSON(`${API_BASE}/catalogo?tipo=repuesto&limit=1000`).catch(()=>[]),
    ]);
    const uniq = (rows, idKey, nameKey) => {
      const m = new Map();
      rows.forEach(r=>{
        const id = r[idKey]; const nombre = r[nameKey];
        if (id != null && nombre && !m.has(id)) m.set(id, { id, nombre });
      });
      return Array.from(m.values()).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    };
    if (!VOCAB.secciones.length) VOCAB.secciones = uniq(serv, 'seccion_id', 'seccion_nombre');
    if (!VOCAB.areas.length)     VOCAB.areas     = uniq(rep,  'area_id',    'area_nombre');
  }

  async function loadVocab() {
    const [secciones, areas] = await Promise.all([
      fetchJSON(`${API_BASE}/catalogo/secciones`).catch(()=>[]),
      fetchJSON(`${API_BASE}/catalogo/areas`).catch(()=>[]),
    ]);
    VOCAB.secciones = Array.isArray(secciones)?secciones:[];
    VOCAB.areas     = Array.isArray(areas)?areas:[];

    // fallback si vinieron vacías
    if (!VOCAB.secciones.length || !VOCAB.areas.length) {
      await fallbackVocabFromCatalog().catch(()=>{});
    }

    // filtros
    const fsec = $('#f_seccion'), fare = $('#f_area');
    if (fsec) fsec.innerHTML = `<option value="">(todas)</option>` + VOCAB.secciones.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
    if (fare) fare.innerHTML = `<option value="">(todas)</option>`   + VOCAB.areas.map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');

    // formularios (con placeholder seleccionado)
    fillSelect($('#n_seccion'), VOCAB.secciones, 'Selecciona sección');
    fillSelect($('#n_area'),    VOCAB.areas,     'Selecciona área');
    fillSelect($('#e_seccion'), VOCAB.secciones, 'Selecciona sección');
    fillSelect($('#e_area'),    VOCAB.areas,     'Selecciona área');

    // visibilidad Nuevo
    const t = $('#n_tipo')?.value || 'servicio';
    $('#n_boxSeccion').style.display = (t==='servicio') ? '' : 'none';
    $('#n_boxArea').style.display    = (t==='repuesto') ? '' : 'none';
  }

  // ----- filtros -----
  function buildQuery(){
    const p = new URLSearchParams();
    const q    = $('#f_search').value.trim();
    const tipo = $('#f_tipo').value;
    const sec  = $('#f_seccion').value;
    const are  = $('#f_area').value;
    const lim  = $('#f_limit').value || '50';
    if (q) p.set('search', q);
    if (tipo) p.set('tipo', tipo);
    if (tipo==='servicio' && sec) p.set('seccion_id', sec);
    if (tipo==='repuesto' && are) p.set('area_id', are);
    p.set('limit', lim);
    return p.toString();
  }
  function hintFiltro(){
    const t   = $('#f_tipo').value || 'todos';
    const sec = $('#f_seccion').selectedOptions[0]?.textContent || '';
    const are = $('#f_area').selectedOptions[0]?.textContent || '';
    let txt = `Mostrando: ${t}.`;
    if (t==='servicio' && $('#f_seccion').value) txt += ` Sección: ${sec}.`;
    if (t==='repuesto' && $('#f_area').value)   txt += ` Área: ${are}.`;
    $('#hintFiltro').textContent = txt;
  }

  // ----- listado -----
  const CACHE = new Map();

  async function loadList(){
    hintFiltro();
    const tb = $('#tabCat tbody');
    tb.innerHTML = `<tr><td colspan="10">Cargando…</td></tr>`;
    try {
      const rows = await fetchJSON(`${API_BASE}/catalogo?` + buildQuery());
      if (!Array.isArray(rows) || !rows.length){
        tb.innerHTML = `<tr><td colspan="10">Sin resultados.</td></tr>`;
        return;
      }
      tb.innerHTML = '';
      CACHE.clear();

      rows.forEach(r=>{
        CACHE.set(String(r.id), r);
        const tr = document.createElement('tr');
        const tipoTxt = (r.tipo==='repuesto'?'repuesto':(r.tipo==='producto'?'producto':'servicio'));
        const secArea = r.tipo==='servicio' ? (r.seccion_nombre||'—') : (r.tipo==='repuesto' ? (r.area_nombre||'—') : '—');
        const precioFinal = Number((r.precio_final!=null ? r.precio_final : ((r.precio_base||0)*(1+(r.impuesto_pct||0)/100)))).toFixed(2);

        tr.innerHTML = `
          <td>${r.id}</td>
          <td>${r.sku||''}</td>
          <td>${r.nombre||''}</td>
          <td>${tipoTxt}</td>
          <td>${secArea}</td>
          <td>${r.unidad||'unidad'}</td>
          <td>L ${precioFinal}</td>
          <td>${Number(r.impuesto_pct||0).toFixed(2)}</td>
          <td>${r.activo ? 'Sí' : 'No'}</td>
          <td class="td-acciones ta-r">
            <button class="kebab-btn btn-menu" data-kebab="${r.id}" title="Acciones" aria-haspopup="true" aria-expanded="false">⋮</button>
          </td>
        `;
        tb.appendChild(tr);
      });
    } catch (e) {
      tb.innerHTML = `<tr><td colspan="10">Error: ${e.message}</td></tr>`;
    }
  }

  // ----- menú en línea -----
  function closeMenuRow(){
    $$('#tabCat tr.menu-row').forEach(tr=>tr.remove());
    $$('#tabCat .kebab-btn[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));
  }
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('#tabCat .kebab-btn.btn-menu');
    if (btn){
      e.preventDefault();
      const tr = btn.closest('tr'); const id = btn.dataset.kebab;
      if (!tr || !id) return;
      if (btn.getAttribute('aria-expanded')==='true'){ closeMenuRow(); return; }
      closeMenuRow(); btn.setAttribute('aria-expanded','true');

      const actionsTr = document.createElement('tr');
      actionsTr.className = 'menu-row';
      const td = document.createElement('td'); td.colSpan = 10; td.className = 'ta-r';
      td.innerHTML = `
        <div class="row-menu">
          <button type="button" data-view="${id}">👁️ Ver</button>
          <button type="button" data-edit="${id}">✏️ Editar</button>
          ${
            (CACHE.get(String(id))?.activo)
            ? `<button type="button" class="danger" data-off="${id}">🚫 Deshabilitar</button>`
            : `<button type="button" data-on="${id}">✅ Activar</button>`
          }
        </div>
      `;
      actionsTr.appendChild(td);
      tr.after(actionsTr);

      td.addEventListener('click',(ev)=>{
        const t = ev.target.closest('button[data-view],button[data-edit],button[data-off],button[data-on]');
        if(!t) return;
        if (t.dataset.view) onView(t.dataset.view);
        else if (t.dataset.edit) onEdit(t.dataset.edit);
        else if (t.dataset.off) onDisable(t.dataset.off);
        else if (t.dataset.on) onEnable(t.dataset.on);
        closeMenuRow();
      });

      const onDoc = (ev)=>{ if(!actionsTr.contains(ev.target) && ev.target!==btn){ closeMenuRow(); document.removeEventListener('click', onDoc, true); } };
      setTimeout(()=>document.addEventListener('click', onDoc, true),0);
      return;
    }
    if (!e.target.closest('#tabCat')) closeMenuRow();
  });

  // ----- payload seguro -----
  function payloadFromCache(it, overrides={}){
    // NOTA: ahora usamos precio_final hacia el backend
    const precio_final = (it.precio_final != null)
      ? Number(it.precio_final)
      : Number((it.precio_base||0) * (1 + (it.impuesto_pct||0)/100));

    const base = {
      sku: it.sku ?? null,
      nombre: it.nombre,
      tipo: it.tipo,
      seccion_id: it.tipo==='servicio' ? (it.seccion_id ?? null) : null,
      area_id:     it.tipo==='repuesto' ? (it.area_id ?? null)   : null,
      categoria: it.categoria ?? null,
      unidad: it.unidad ?? 'unidad',
      precio_final,                         // << clave
      impuesto_pct: Number(it.impuesto_pct||0),
      activo: Number(it.activo ? 1 : 0)
    };
    return Object.assign(base, overrides);
  }

  // ----- acciones -----
  function onView(id){
    const it = CACHE.get(String(id)); if(!it) return;
    const precioFinal = Number((it.precio_final!=null ? it.precio_final : ((it.precio_base||0)*(1+(it.impuesto_pct||0)/100)))).toFixed(2);
    const html = `
      <p><strong>#${it.id}</strong> — ${it.nombre}</p>
      <p><strong>SKU:</strong> ${it.sku||'—'}</p>
      <p><strong>Tipo:</strong> ${it.tipo}</p>
      <p><strong>Sección/Área:</strong> ${it.seccion_nombre || it.area_nombre || '—'}</p>
      <p><strong>Unidad:</strong> ${it.unidad||'unidad'}</p>
      <p><strong>Precio final:</strong> L ${precioFinal}</p>
      <p><strong>Impuesto %:</strong> ${Number(it.impuesto_pct||0).toFixed(2)}</p>
      <p><strong>Activo:</strong> ${it.activo ? 'Sí':'No'}</p>
    `;
    $('#viewBody').innerHTML = html;
    openDialog('#dlgView');
  }

  async function onDisable(id){
    if (!confirm('¿Deshabilitar este ítem del catálogo?')) return;
    try{
      await fetchJSON(`${API_BASE}/catalogo/${encodeURIComponent(id)}`, { method:'DELETE' });
      toast('Ítem deshabilitado','success');
      loadList();
    }catch(e){ toast(e.message || 'Error','error'); }
  }

  async function onEnable(id){
    const it = CACHE.get(String(id));
    if (!it) return;
    const payload = payloadFromCache(it, { activo: 1 });
    try{
      await fetchJSON(`${API_BASE}/catalogo/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Ítem activado','success');
      loadList();
    }catch(e){ toast(e.message || 'Error','error'); }
  }

  function onEdit(id){
    const it = CACHE.get(String(id)); if(!it) return;
    const precioFinal = Number((it.precio_final!=null ? it.precio_final : ((it.precio_base||0)*(1+(it.impuesto_pct||0)/100))));

    $('#e_id').value      = it.id;
    $('#e_nombre').value  = it.nombre || '';
    $('#e_sku').value     = it.sku || '';
    $('#e_tipo').value    = it.tipo || 'servicio';
    $('#e_unidad').value  = it.unidad || 'unidad';
    $('#e_precio').value  = precioFinal.toFixed(2);  // << precio final
    $('#e_impuesto').value= Number(it.impuesto_pct||0);
    $('#e_activo').value  = it.activo ? '1' : '0';

    if (it.tipo === 'servicio'){
      $('#e_boxSeccion').style.display = '';
      $('#e_boxArea').style.display    = 'none';
      const secId = it.seccion_id ?? (VOCAB.secciones.find(s=>s.nombre===it.seccion_nombre)?.id);
      if (secId != null) $('#e_seccion').value = String(secId); else $('#e_seccion').selectedIndex = 0;
    } else if (it.tipo === 'repuesto') {
      $('#e_boxSeccion').style.display = 'none';
      $('#e_boxArea').style.display    = '';
      const areaId = it.area_id ?? (VOCAB.areas.find(a=>a.nombre===it.area_nombre)?.id);
      if (areaId != null) $('#e_area').value = String(areaId); else $('#e_area').selectedIndex = 0;
    } else {
      // producto: ocultar ambas
      $('#e_boxSeccion').style.display = 'none';
      $('#e_boxArea').style.display    = 'none';
    }
    openDrawer();
  }

  // ----- drawer (con overlay) -----
  const overlay = (function ensureOverlay(){
    let el = document.getElementById('drawerOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'drawerOverlay';
      el.className = 'drawer-overlay';
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  })();

  function openDrawer(){
    const d=$('#drawerCat');
    d.classList.add('open'); d.setAttribute('aria-hidden','false');
    overlay.hidden=false; overlay.style.opacity='1'; overlay.style.pointerEvents='auto';
  }
  function closeDrawer(){
    const d=$('#drawerCat');
    d.classList.remove('open'); d.setAttribute('aria-hidden','true');
    $('#formEdit').reset();
    overlay.style.opacity='0'; overlay.style.pointerEvents='none';
    setTimeout(()=>{ overlay.hidden=true; }, 200);
  }
  $('#btnCloseDrawer')?.addEventListener('click', closeDrawer);
  $('#btnCancelEdit')?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });

  $('#e_tipo').addEventListener('change', ()=>{
    if ($('#e_tipo').value==='servicio'){ $('#e_boxSeccion').style.display=''; $('#e_boxArea').style.display='none'; }
    else if ($('#e_tipo').value==='repuesto'){ $('#e_boxSeccion').style.display='none'; $('#e_boxArea').style.display=''; }
    else { $('#e_boxSeccion').style.display='none'; $('#e_boxArea').style.display='none'; } // producto
  });

  $('#formEdit').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id = $('#e_id').value;
    const itCache = CACHE.get(String(id)) || {};
    const tipoSel = $('#e_tipo').value;

    const payload = payloadFromCache(itCache, {
      sku: $('#e_sku').value.trim() || null,
      nombre: $('#e_nombre').value.trim(),
      tipo: tipoSel,
      seccion_id: tipoSel==='servicio' ? Number($('#e_seccion').value||0) : null,
      area_id:     tipoSel==='repuesto' ? Number($('#e_area').value||0)    : null,
      unidad: $('#e_unidad').value.trim() || 'unidad',
      precio_final: Number($('#e_precio').value||0),   // << precio final
      impuesto_pct: Number($('#e_impuesto').value||0),
      activo: Number($('#e_activo').value||1)
    });

    if (!payload.nombre) return toast('Nombre es obligatorio','warning');
    if (payload.tipo==='servicio' && !payload.seccion_id) return toast('Selecciona sección','warning');
    if (payload.tipo==='repuesto' && !payload.area_id)    return toast('Selecciona área','warning');

    try{
      await fetchJSON(`${API_BASE}/catalogo/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Ítem actualizado','success');

      const filtroTipo = $('#f_tipo').value;
      const filtroSec  = $('#f_seccion').value;
      const filtroArea = $('#f_area').value;
      const salePorFiltro =
        (filtroTipo==='servicio' && filtroSec  && String(payload.seccion_id)!==String(filtroSec)) ||
        (filtroTipo==='repuesto' && filtroArea && String(payload.area_id)!==String(filtroArea));
      if (salePorFiltro) toast('El ítem editado ya no coincide con el filtro actual y puede desaparecer de la lista.','info');

      closeDrawer();
      loadList();
    }catch(err){ toast(err.message || 'Error','error'); }
  });

  // ----- Nuevo (dialog) -----
  function openNew(){
    $('#formNew')?.reset();
    $('#n_tipo').value   = 'servicio';
    $('#n_unidad').value = 'unidad';
    $('#n_boxSeccion').style.display = '';
    $('#n_boxArea').style.display    = 'none';
    openDialog('#dlgNew');
  }
  function closeNew(){ closeDialog('#dlgNew'); $('#formNew').reset(); }
  $('#btnNew').addEventListener('click', openNew);
  $('#n_tipo').addEventListener('change', ()=>{
    if ($('#n_tipo').value==='servicio'){ $('#n_boxSeccion').style.display=''; $('#n_boxArea').style.display='none'; }
    else if ($('#n_tipo').value==='repuesto'){ $('#n_boxSeccion').style.display='none'; $('#n_boxArea').style.display=''; }
    else { $('#n_boxSeccion').style.display='none'; $('#n_boxArea').style.display='none'; } // producto
  });

  $('#btnCancelNew')?.addEventListener('click', (e)=>{ e.preventDefault(); closeNew(); });
  $('#btnCancelNewFooter')?.addEventListener('click', (e)=>{ e.preventDefault(); closeNew(); });

  $('#btnAddSeccion').addEventListener('click', async ()=>{
    const nombre = prompt('Nombre de la nueva sección:','');
    if (!nombre) return;
    try{ await fetchJSON(`${API_BASE}/catalogo/secciones`, { method:'POST', body: JSON.stringify({ nombre }) }); await loadVocab(); toast('Sección creada','success'); }
    catch(e){ toast(e.message || 'Error creando sección','error'); }
  });
  $('#btnAddArea').addEventListener('click', async ()=>{
    const nombre = prompt('Nombre del área del vehículo:','');
    if (!nombre) return;
    try{ await fetchJSON(`${API_BASE}/catalogo/areas`, { method:'POST', body: JSON.stringify({ nombre }) }); await loadVocab(); toast('Área creada','success'); }
    catch(e){ toast(e.message || 'Error creando área','error'); }
  });

  $('#formNew').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const tipoSel = $('#n_tipo').value;
    const payload = {
      sku: $('#n_sku').value.trim() || null,
      nombre: $('#n_nombre').value.trim(),
      tipo: tipoSel,
      seccion_id: tipoSel==='servicio' ? Number($('#n_seccion').value||0) : null,
      area_id:     tipoSel==='repuesto' ? Number($('#n_area').value||0)    : null,
      unidad: $('#n_unidad').value.trim() || 'unidad',
      precio_final: Number($('#n_precio').value||0), // << precio final
      impuesto_pct: Number($('#n_impuesto').value||0),
      activo: 1
    };
    if (!payload.nombre) return toast('Nombre es obligatorio','warning');
    if (payload.tipo==='servicio' && !payload.seccion_id) return toast('Selecciona sección','warning');
    if (payload.tipo==='repuesto' && !payload.area_id)    return toast('Selecciona área','warning');

    try{
      await fetchJSON(`${API_BASE}/catalogo`, { method:'POST', body: JSON.stringify(payload) });
      toast('Ítem creado','success');
      closeNew();
      loadList();
    }catch(err){ toast(err.message || 'Error','error'); }
  });

  // ----- filtros / inicio -----
  $('#f_tipo').addEventListener('change', ()=>{
    const t = $('#f_tipo').value;
    $('#boxSeccion').style.display = (t==='servicio') ? '' : 'none';
    $('#boxArea').style.display    = (t==='repuesto') ? '' : 'none';
    hintFiltro();
    loadList();
  });
  ['f_search','f_seccion','f_area','f_limit'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', ()=>{ clearTimeout(el._t); el._t = setTimeout(loadList, 200); });
    el.addEventListener('change', loadList);
  });
  $('#btnReload').addEventListener('click', loadList);
  $('#btnCloseView').addEventListener('click', ()=> closeDialog('#dlgView'));

  // ---- arranque ----
  loadVocab().then(loadList).catch(()=>loadList());
  document.addEventListener('topbar:loaded', ()=>{ loadVocab().then(loadList).catch(()=>loadList()); });
})();

// === Catálogo: Autocomplete + impuestos (ajustado para precio_final) ===
(function(){
  const API = (localStorage.getItem('API_BASE') || 'http://localhost:3001/api').replace(/\/+$/,'');
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  async function fetchJSON(u,opt={}) {
    const r = await fetch(u,{headers:{'Content-Type':'application/json'},...opt});
    try { const d = await r.json(); if(!r.ok) throw new Error(d?.error||d?.message||`HTTP ${r.status}`); return d; }
    catch { if(!r.ok) throw new Error(`HTTP ${r.status}`); return null; }
  }

  // ---------- Autocomplete genérico para catálogo ----------
  function attachAutocompleteCatalogo(input, getCtx, onPick){
    let t, box, list=[], idx=-1, last='';
    box = document.createElement('div');
    Object.assign(box.style,{
      position:'absolute', zIndex:9999, background:'#fff',
      border:'1px solid #e5e7eb', borderRadius:'10px',
      boxShadow:'0 8px 24px rgba(15,23,42,.08)', padding:'6px',
      display:'none', maxHeight:'260px', overflow:'auto'
    });
    document.body.appendChild(box);

    function place(){
      const r = input.getBoundingClientRect();
      box.style.left = (window.scrollX + r.left)+'px';
      box.style.top  = (window.scrollY + r.bottom + 4)+'px';
      box.style.width= r.width+'px';
    }
    function hide(){ box.style.display='none'; idx=-1; }
    function render(){
      box.innerHTML='';
      list.forEach((it,i)=>{
        const row=document.createElement('div');
        Object.assign(row.style,{padding:'8px 10px',borderRadius:'8px',cursor:'pointer',display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center'});
        if(i===idx) row.style.background='#f3f4f6';
        const left=document.createElement('div');
        const tipoTxt = it.tipo==='repuesto'?'Repuesto':(it.tipo==='producto'?'Producto':'Servicio');
        const secArea = it.tipo==='servicio'?(it.seccion_nombre||'Servicio'):(it.tipo==='repuesto'?(it.area_nombre||'Repuesto'):'Producto');
        left.innerHTML=`<strong>${it.nombre}</strong><br><small>${secArea}${it.sku?' · '+it.sku:''}</small>`;
        const right=document.createElement('div');
        right.style.textAlign='right';
        const precioFinal = Number((it.precio_final!=null ? it.precio_final : ((it.precio_base||0)*(1+(it.impuesto_pct||0)/100)))).toFixed(2);
        right.innerHTML=`<strong>L. ${precioFinal}</strong><br><small>${it.unidad||'unidad'} · ${tipoTxt}</small>`;
        row.onmouseenter=()=>{ idx=i; render(); };
        row.onmousedown=(e)=>{ e.preventDefault(); select(i); };
        row.append(left,right); box.appendChild(row);
      });
      box.style.display = list.length?'block':'none';
      place();
    }
    function select(i){
      const it=list[i]; if(!it) return;
      hide(); if(typeof onPick==='function') onPick(it);
    }
    async function query(q){
      const qp = new URLSearchParams({ search:q, limit:'15' });
      const ctx = (typeof getCtx==='function'?getCtx():{})||{};
      if (ctx.tipo) qp.set('tipo', ctx.tipo);
      if (ctx.seccion_id) qp.set('seccion_id', String(ctx.seccion_id));
      if (ctx.area_id) qp.set('area_id', String(ctx.area_id));
      const url = `${API}/catalogo?${qp}`;
      const res = await fetch(url,{headers:{'Content-Type':'application/json'}});
      if(!res.ok) return [];
      try { return await res.json(); } catch { return []; }
    }

    input.addEventListener('input', ()=>{
      clearTimeout(t);
      const q = input.value.trim();
      if(q.length<1){ hide(); return; }
      t = setTimeout(async ()=>{
        if(q===last) return;
        last=q; list = await query(q);
        idx = list.length?0:-1; render();
      },160);
    });
    input.addEventListener('keydown',(e)=>{
      if(box.style.display!=='block') return;
      if(e.key==='ArrowDown'){ e.preventDefault(); idx=Math.min(idx+1,list.length-1); render(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); idx=Math.max(idx-1,0); render(); }
      else if(e.key==='Enter'){ if(idx>=0){ e.preventDefault(); select(idx); } }
      else if(e.key==='Escape'){ hide(); }
    });
    input.addEventListener('blur', ()=> setTimeout(hide,120));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  // ---------- Detección de tabla y recálculo ----------
  const TABLES = ['#tabItems','#tablaCotizacion','#tablaFactura','.items-table']; // ajusta si hace falta
  function findTable(){ for(const s of TABLES){ const el=$(s); if(el) return el; } return null; }

  function recalcTotals(){
    const table = findTable(); if(!table) return;
    const rows = $$('tbody tr', table).filter(tr=>!tr.classList.contains('menu-row') && !tr.querySelector('.empty-row'));
    let sub=0, imp=0;
    rows.forEach(tr=>{
      const cantEl   = tr.querySelector('[data-k="cant"], .item-cant, input[name="cant[]"]');
      const precioEl = tr.querySelector('[data-k="precio"], .item-precio, input[name="precio[]"]');
      const impEl    = tr.querySelector('[data-k="impuesto"], .item-impuesto, input[name="impuesto[]"]');
      const impPct   = Number(tr.dataset.impuestoPct || impEl?.value || 0) || 0;

      const cant   = Number(cantEl?.value||1);
      const precio = Number(precioEl?.value||0);
      const line   = cant*precio;

      sub += line;
      if (impPct > 0) imp += line*(impPct/100);

      const subCell = tr.querySelector('.sub, .item-subtotal');
      if (subCell) subCell.textContent = line.toFixed(2);
    });

    const subtotalEl = $('#subtotal') || $('#cot_subtotal') || $('#fact_subtotal');
    const impEl      = $('#impuestos') || $('#cot_impuesto') || $('#fact_impuesto');
    const totalEl    = $('#total') || $('#cot_total') || $('#fact_total') || $('#c_total');

    if (subtotalEl) subtotalEl.value = sub.toFixed(2);
    if (impEl)      impEl.value      = imp.toFixed(2);
    if (totalEl)    totalEl.value    = (sub+imp).toFixed(2);
  }

  function bindRows(){
    const table = findTable(); if(!table) return;
    $$('tbody tr', table).forEach((tr)=>{
      const descEl   = tr.querySelector('[data-k="desc"], .item-desc, input[name="desc[]"]');
      const precioEl = tr.querySelector('[data-k="precio"], .item-precio, input[name="precio[]"]');
      const cantEl   = tr.querySelector('[data-k="cant"], .item-cant, input[name="cant[]"]');
      const impEl    = tr.querySelector('[data-k="impuesto"], .item-impuesto, input[name="impuesto[]"]');

      if (descEl && !descEl.dataset.catBound){
        descEl.dataset.catBound='1';
        attachAutocompleteCatalogo(
          descEl,
          ()=>({}), // puedes filtrar aquí si lo necesitas
          (pick)=>{
            // Completar desde catálogo (usando precio_final)
            const precioFinal = Number((pick.precio_final!=null ? pick.precio_final : ((pick.precio_base||0)*(1+(pick.impuesto_pct||0)/100))));
            descEl.value = pick.nombre || '';
            if (precioEl) precioEl.value = precioFinal.toFixed(2);

            tr.dataset.catalogoId = pick.id;
            tr.dataset.tipo       = pick.tipo;
            tr.dataset.impuestoPct= Number(pick.impuesto_pct||0) || 0;

            if (impEl) impEl.value = String(Number(pick.impuesto_pct||0) || 0);
            if (cantEl && !cantEl.value) cantEl.value = '1';

            recalcTotals();
          }
        );
      }

      [precioEl,cantEl,impEl].forEach(el=>{
        if (el && !el.dataset.calcBound){
          el.dataset.calcBound='1';
          el.addEventListener('input', recalcTotals);
          el.addEventListener('change', recalcTotals);
        }
      });
    });
  }

  const table = findTable();
  if (table) {
    const target = table.tBodies[0] || table;
    const obs = new MutationObserver(()=>bindRows());
    obs.observe(target, { childList:true, subtree:true });
  }

  document.addEventListener('DOMContentLoaded', ()=>{ bindRows(); recalcTotals(); });

  window.CatalogoHelper = { bindRows, recalcTotals };
})();

