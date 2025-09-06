// frontend/js/crear-orden.js
(function(){
  'use strict';
  const API = (localStorage.getItem('API_BASE') || 'http://localhost:3001/api').replace(/\/+$/,'');
  const $ = (s, r=document)=>r.querySelector(s);

  function toast(m,t='info'){ try{ if(window.showToast) return window.showToast(t,m);}catch{} console.log(`[${t}] ${m}`); }
  function hdr(){ let u={}; try{u=JSON.parse(localStorage.getItem('usuarioActual'))||{}}catch{}; const a=u?.usuario||u?.nombre||'sistema'; return {'Content-Type':'application/json','Accept':'application/json','X-Actor':a,'X-Actor-Usuario':a}; }
  async function api(path,opt={}){ const url=path.startsWith('http')?path:`${API}${path}`; const res=await fetch(url,{mode:'cors',credentials:'omit',headers:{...hdr(),...(opt.headers||{})},...opt}); let data=null; try{data=await res.json();}catch{} if(!res.ok) throw new Error((data&&(data.error||data.message))||`HTTP ${res.status}`); return data; }
  const escape = (s)=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const fmtCode = (id)=> (Number(id)>0? String(Number(id)).padStart(4,'0'): '');
  const parseCode = (code)=>{ const m=String(code||'').trim().match(/(\d{1,6})$/); return m? Number(m[1]): null; };

  // ===== wizard =====
  function goStep(n){
    document.querySelectorAll('.step-pane').forEach(p=>p.hidden = p.dataset.step !== String(n));
    document.querySelectorAll('.step').forEach(b=>b.classList.toggle('current', b.dataset.step===String(n)));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  // ===== usuarios (asignar) =====
  async function loadUsuarios(){
    try{
      const arr = await api('/usuarios');
      const sel = $('#g_asignado_a'); sel.innerHTML = '<option value="">Sin asignar</option>';
      (Array.isArray(arr)?arr:[]).forEach(u=>{
        const op = document.createElement('option');
        op.value = u.id; op.textContent = u.nombre || u.usuario || `U${u.id}`;
        sel.appendChild(op);
      });
    }catch(e){}
  }

  // ===== autocomplete vehículos =====
  function showSuggest(list){
    const ul = $('#suggestList');
    if (!list.length){ ul.hidden = true; ul.innerHTML=''; return; }
    ul.innerHTML = list.map(v=>{
      const cliente = v.cliente_id ? fmtCode(v.cliente_id) : '-';
      const veh = `${escape(v.placa||'')}${v.marca||v.modelo? ' — '+escape((v.marca||'')+' '+(v.modelo||'')) : ''}`;
      return `<li data-id="${v.id}" data-placa="${escape(v.placa||'')}" data-cliente="${v.cliente_id||''}" class="menu-item">${veh} <span class="muted">(${cliente})</span></li>`;
    }).join('');
    ul.hidden = false;
  }
  function hideSuggest(){ const ul=$('#suggestList'); ul.hidden=true; ul.innerHTML=''; }

  let suggestTimer=null;
  async function queryVehiculos(q){
    const res = await api(`/vehiculos?q=${encodeURIComponent(q)}`);
    return Array.isArray(res) ? res.slice(0,10) : [];
  }
  function wireAutocompleteVehiculo(){
    const inp = $('#g_placa');
    inp.addEventListener('input', ()=>{
      clearTimeout(suggestTimer);
      const q = inp.value.trim();
      if (!q){ hideSuggest(); $('#g_vehiculo_id').value=''; return; }
      suggestTimer = setTimeout(async ()=>{
        try{ const list = await queryVehiculos(q); showSuggest(list); }catch{ hideSuggest(); }
      }, 200);
    });
    document.addEventListener('click', (e)=>{
      const li = e.target.closest('#suggestList li.menu-item');
      if (li){
        $('#g_vehiculo_id').value = li.dataset.id || '';
        $('#g_placa').value = li.dataset.placa || '';
        if (li.dataset.cliente){
          $('#g_cli_id').value = li.dataset.cliente;
          $('#g_cli_code').value = fmtCode(li.dataset.cliente);
        }
        hideSuggest();
      } else if (!e.target.closest('#suggestVehiculos') && e.target!==inp){
        hideSuggest();
      }
    });
  }

  // ===== cliente manual =====
  async function validarClienteCode(){
    const id = parseCode($('#g_cli_code').value);
    if (!id) return;
    try{
      const c = await api(`/clientes/${id}`);
      if (!c?.id) throw new Error('Cliente no existe');
      $('#g_cli_id').value = c.id;
      $('#g_cli_code').value = fmtCode(c.id);
    }catch(e){ toast('Cliente inválido','warning'); }
  }

  // ======== CATÁLOGO: filtros + autocomplete para ítems ========
  const items = []; // { tipo, desc, cant, precio, catalogo_id?, impuesto_pct? }

  const selTipo = document.createElement('select');
  const selSeccion = document.createElement('select');
  const selArea = document.createElement('select');
  let boxSeccion, boxArea;

  async function cargarVocab(){
    try{
      const [rS, rA] = await Promise.all([
        fetch(`${API}/catalogo/secciones`),
        fetch(`${API}/catalogo/areas`)
      ]);
      const secciones = rS.ok ? await rS.json() : [];
      const areas = rA.ok ? await rA.json() : [];
      selSeccion.innerHTML = secciones.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
      selArea.innerHTML = areas.map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
    }catch(e){}
  }

  // Autocomplete catálogo (embebido)
  function attachAutocompleteCatalogo(inputEl, getContext, onPick){
    let list = [], idx = -1, lastQuery = '', t;
    const box = document.createElement('div');
    Object.assign(box.style, {
      position:'absolute', zIndex:9999, background:'#fff', border:'1px solid #e5e7eb',
      borderRadius:'10px', boxShadow:'0 8px 24px rgba(15,23,42,.08)', padding:'6px', display:'none'
    });
    document.body.appendChild(box);

    function placeBox(){
      const r = inputEl.getBoundingClientRect();
      box.style.left = (window.scrollX + r.left) + 'px';
      box.style.top  = (window.scrollY + r.bottom + 4) + 'px';
      box.style.width = r.width + 'px';
    }
    function hide(){ box.style.display='none'; idx = -1; }
    function render(){
      box.innerHTML = '';
      list.forEach((it,i)=>{
        const row = document.createElement('div');
        Object.assign(row.style,{padding:'8px 10px', borderRadius:'8px', cursor:'pointer', display:'flex', justifyContent:'space-between', gap:'8px'});
        if(i===idx) row.style.background = '#f3f4f6';

        const left = document.createElement('div');
        const chip = it.tipo === 'servicio' ? (it.seccion_nombre || 'Servicio') : (it.area_nombre || 'Repuesto');
        left.innerHTML = `<strong>${it.nombre}</strong><br><small>${chip}${it.sku ? ' · '+it.sku : ''}</small>`;

        const right = document.createElement('div');
        right.style.textAlign = 'right';
        right.innerHTML = `<strong>L. ${Number(it.precio_base).toFixed(2)}</strong><br><small>${it.unidad || 'unidad'}</small>`;

        row.addEventListener('mouseenter', ()=>{ idx = i; render(); });
        row.addEventListener('mousedown', (e)=>{ e.preventDefault(); select(i); });

        row.appendChild(left); row.appendChild(right);
        box.appendChild(row);
      });
      box.style.display = list.length ? 'block' : 'none';
      placeBox();
    }
    function select(i){
      const it = list[i]; if(!it) return;
      hide();
      if(typeof onPick === 'function') onPick(it);
    }
    function buildQuery(q){
      const qp = new URLSearchParams();
      qp.set('search', q);
      qp.set('limit', '15');
      const ctx = (typeof getContext === 'function') ? getContext() : {};
      if (ctx.tipo) qp.set('tipo', ctx.tipo);
      if (ctx.seccion_id) qp.set('seccion_id', String(ctx.seccion_id));
      if (ctx.area_id) qp.set('area_id', String(ctx.area_id));
      return qp.toString();
    }
    async function query(q){
      const url = `${API}/catalogo?${buildQuery(q)}`;
      const r = await fetch(url, { headers: { 'Content-Type':'application/json' } });
      if(!r.ok) return [];
      return r.json();
    }
    inputEl.addEventListener('input', ()=>{
      clearTimeout(t);
      const q = inputEl.value.trim();
      if(q.length < 1){ hide(); return; }
      t = setTimeout(async ()=>{
        if(q === lastQuery) return;
        lastQuery = q;
        list = await query(q);
        idx = list.length ? 0 : -1;
        render();
      }, 160);
    });
    inputEl.addEventListener('keydown', (e)=>{
      if(box.style.display !== 'block') return;
      if(e.key === 'ArrowDown'){ e.preventDefault(); idx = Math.min(idx+1, list.length-1); render(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); idx = Math.max(idx-1, 0); render(); }
      else if(e.key === 'Enter'){ if(idx>=0){ e.preventDefault(); select(idx); } }
      else if(e.key === 'Escape'){ hide(); }
    });
    window.addEventListener('resize', placeBox);
    window.addEventListener('scroll', placeBox, true);
    inputEl.addEventListener('blur', ()=> setTimeout(hide, 120));
  }

  // ===== ítems costos (editables) =====
  function renderItems(){
    const tb = $('#tabItems tbody');
    if (!items.length){ tb.innerHTML = `<tr class="empty-row"><td colspan="6">Sin ítems</td></tr>`; calcTotal(); return; }
    tb.innerHTML = '';
    items.forEach((it,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="chip">${escape(it.tipo||'servicio')}</span></td>
        <td>
          <input data-k="desc" data-i="${idx}" value="${escape(it.desc||'')}" placeholder="Descripción (catálogo)" />
          ${it.catalogo_id ? `<small class="muted">#${it.catalogo_id}</small>` : ''}
        </td>
        <td><input data-k="cant" data-i="${idx}" type="number" min="0" step="0.01" value="${Number(it.cant||1)}" style="width:90px" /></td>
        <td><input data-k="precio" data-i="${idx}" type="number" step="0.01" value="${Number(it.precio||0).toFixed(2)}" style="width:120px" /></td>
        <td class="sub">${(Number(it.cant||0)*Number(it.precio||0)).toFixed(2)}</td>
        <td><button class="btn btn-sm" data-del="${idx}" type="button">Eliminar</button></td>
      `;
      tb.appendChild(tr);

      // Autocomplete en descripción
      const inp = tr.querySelector('input[data-k="desc"]');
      attachAutocompleteCatalogo(
        inp,
        () => {
          const tipo = selTipo.value;
          return {
            tipo,
            seccion_id: (tipo==='servicio') ? selSeccion.value : undefined,
            area_id:    (tipo==='repuesto') ? selArea.value    : undefined
          };
        },
        (pick)=>{
          items[idx].catalogo_id = pick.id;
          items[idx].tipo = pick.tipo;                   // forzar coherente
          items[idx].desc = pick.nombre;
          items[idx].precio = Number(pick.precio_base||0);
          items[idx].impuesto_pct = Number(pick.impuesto_pct||0);
          // Actualizar fila
          inp.value = pick.nombre;
          tr.querySelector('input[data-k="precio"]').value = Number(pick.precio_base||0).toFixed(2);
          tr.querySelector('.chip').textContent = pick.tipo || 'servicio';
          calcTotal();
          // hint de sección/área
          if (pick.seccion_nombre || pick.area_nombre) {
            const hint = document.createElement('div');
            hint.className = 'muted';
            hint.style.fontSize = '12px';
            hint.textContent = pick.seccion_nombre || pick.area_nombre || '';
            inp.closest('td').appendChild(hint);
          }
        }
      );
    });

    // Ediciones / eliminar
    tb.addEventListener('input', onEdit, { once:true });
    tb.addEventListener('click', onDelete, { once:true });
    calcTotal();
  }
  function onEdit(e){
    const input = e.target.closest('input[data-k]');
    if(!input) return;
    const i = +input.dataset.i, k = input.dataset.k;
    if (Number.isNaN(i) || !items[i]) return;
    if (k === 'cant' || k === 'precio') {
      items[i][k] = Number(input.value||0);
    } else if (k === 'desc') {
      items[i].desc = input.value||'';
      items[i].catalogo_id = items[i].catalogo_id || null; // se queda si ya se seleccionó
    }
    // reatach listeners para siguientes cambios
    const tb = $('#tabItems tbody');
    tb.addEventListener('input', onEdit, { once:true });
    calcTotal();
  }
  function onDelete(e){
    const b=e.target.closest('button[data-del]'); if(!b) return;
    const i=+b.dataset.del; items.splice(i,1); renderItems();
  }

  function calcTotal(){
    const sum = items.reduce((a,b)=> a + (Number(b.cant)||0)*(Number(b.precio)||0), 0);
    const mo  = Number($('#c_mo').value||0);
    $('#c_total').value = (sum + mo).toFixed(2);
    // Recalcular subtotales visibles
    $('#tabItems tbody').querySelectorAll('tr').forEach((tr,idx)=>{
      if (!items[idx]) return;
      tr.querySelector('.sub').textContent = (Number(items[idx].cant||0)*Number(items[idx].precio||0)).toFixed(2);
    });
  }

  // ===== preview fotos =====
  function wireFotos(){
    const input = $('#r_fotos');
    const gal = $('#galeriaPreview');
    input.addEventListener('change', ()=>{
      gal.innerHTML='';
      const files = Array.from(input.files||[]);
      files.forEach(f=>{
        const url = URL.createObjectURL(f);
        const img = document.createElement('img');
        img.src = url; img.alt = f.name; img.style.maxWidth='160px'; img.style.borderRadius='8px';
        gal.appendChild(img);
      });
    });
  }

  // ===== resumen =====
  function buildResumen(){
    const cliCode = $('#g_cli_code').value || '';
    const asignTxt = $('#g_asignado_a').selectedOptions[0]?.textContent || 'Sin asignar';
    const html = `
      <h3>Datos</h3>
      <ul>
        <li><strong>Placa:</strong> ${escape($('#g_placa').value||'-')}</li>
        <li><strong>Cliente:</strong> ${escape(cliCode||'-')}</li>
        <li><strong>Estado inicial:</strong> ${escape($('#g_estado').value||'-')}</li>
        <li><strong>Asignado a:</strong> ${escape(asignTxt)}</li>
        <li><strong>Prioridad:</strong> ${escape($('#g_prioridad').value||'-')}</li>
        <li><strong>Cita:</strong> ${escape($('#g_cita').value||'-')}</li>
      </ul>
      <h3>Recepción</h3>
      <ul>
        <li><strong>KM:</strong> ${escape($('#r_km').value||'-')}</li>
        <li><strong>Combustible:</strong> ${escape($('#r_comb').value||'-')}</li>
        <li><strong>Observaciones:</strong> ${escape($('#r_obs').value||'-')}</li>
      </ul>
      <h3>Diagnóstico / Trabajos</h3>
      <p><strong>Diagnóstico:</strong> ${escape($('#d_diag').value||'-')}</p>
      <p><strong>Trabajos:</strong> ${escape($('#d_trab').value||'-')}</p>
      <p><strong>Aprobación:</strong> ${escape($('#d_aprob').value||'-')}</p>
      <h3>Costos</h3>
      <p><strong>Mano de obra:</strong> ${escape($('#c_mo').value||'0')}</p>
      <p><strong>Total:</strong> ${escape($('#c_total').value||'0.00')}</p>
    `;
    $('#resumenHtml').innerHTML = html;
  }

  // ===== crear orden + subida de fotos =====
  async function crearOrden(){
    // necesita vehículo
    const vehiculo_id = $('#g_vehiculo_id').value ? Number($('#g_vehiculo_id').value) : null;
    const placaInput = ($('#g_placa').value||'').trim();
    if (!vehiculo_id && !placaInput){ toast('Selecciona un vehículo','error'); return; }

    let vehId = vehiculo_id;
    if (!vehId) {
      const list = await api(`/vehiculos?q=${encodeURIComponent(placaInput)}`);
      const hit = (Array.isArray(list)?list:[]).find(v => String(v.placa||'').toUpperCase()===placaInput.toUpperCase());
      if (!hit) { toast('No existe el vehículo con esa placa','error'); return; }
      vehId = hit.id;
    }

    const payload = {
      vehiculo_id: vehId,
      estado: $('#g_estado').value || 'abierta',
      descripcion: ($('#g_desc').value||'').trim(),
      mano_obra: $('#c_mo').value ? parseFloat($('#c_mo').value) : null,
      total: $('#c_total').value ? parseFloat($('#c_total').value) : null,
      asignado_a: $('#g_asignado_a').value || null,
      prioridad: $('#g_prioridad').value || null,
      cita: $('#g_cita').value || null,
      recepcion: {
        km: $('#r_km').value || null,
        combustible: $('#r_comb').value || null,
        checklist: {
          llaves: $('#r_chk_llave').checked,
          objetos: $('#r_chk_herr').checked,
          gato: $('#r_chk_gato').checked,
          llanta: $('#r_chk_llanta').checked
        },
        obs: $('#r_obs').value || ''
      },
      tecnico: {
        diagnostico: $('#d_diag').value || '',
        trabajos: $('#d_trab').value || '',
        aprobacion: $('#d_aprob').value || 'pendiente'
      },
      items // ahora con catalogo_id / tipo / precio / cant
    };

    // 1) Crear orden
    const r = await api('/ordenes', { method:'POST', body: JSON.stringify(payload) });
    toast(`Orden creada: ${r.numero||('#'+r.id)}`,'success');

    // 2) Subir fotos (si hay)
    const files = Array.from($('#r_fotos').files||[]);
    if (files.length){
      const fd = new FormData();
      files.forEach(f=>fd.append('fotos', f));
      await fetch(`${API}/ordenes/${encodeURIComponent(r.id)}/recepcion-fotos`, { method:'POST', body: fd });
    }

    location.href = 'gestion-ordenes.html';
  }

  // ===== wire =====
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Helper para evitar submit accidental
    const bind = (sel, ev, fn) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.addEventListener(ev, (e)=>{ e.preventDefault(); fn(e); });
    };

    // stepper (barra superior)
    document.querySelectorAll('.step').forEach(b=>{
      b.addEventListener('click', (e)=>{ e.preventDefault(); goStep(b.dataset.step); });
    });

    // navegación del wizard
    bind('#next1','click', ()=> goStep(2));
    bind('#next2','click', ()=> goStep(3));
    bind('#next3','click', ()=> goStep(4));
    bind('#next4','click', ()=> { buildResumen(); goStep(5); });

    bind('#back2','click', ()=> goStep(1));
    bind('#back3','click', ()=> goStep(2));
    bind('#back4','click', ()=> goStep(3));
    bind('#back5','click', ()=> goStep(4));

    // crear
    bind('#btnCrearOrden','click', ()=> { crearOrden().catch(e=>toast(e.message,'error')); });

    // autocomplete & cliente
    wireAutocompleteVehiculo();
    const cli = document.querySelector('#g_cli_code');
    cli && cli.addEventListener('blur', ()=> { validarClienteCode().catch(()=>{}); });

    // costos
    const mo = document.querySelector('#c_mo');
    mo && mo.addEventListener('input', ()=> { try { calcTotal(); } catch{} });

    // ====== Filtros de catálogo (inyectados en STEP 4) ======
    // Construir UI filtros dentro de Step 4
    const filtrosHost = document.getElementById('costFiltersHost');
    if (filtrosHost) {
      // Tipo
      selTipo.innerHTML = `<option value="servicio">Servicio</option><option value="repuesto">Repuesto</option>`;
      selTipo.id = 'f_tipo';
      // Sección / Área
      selSeccion.id='f_seccion';
      selArea.id='f_area';

      // Layout simple
      const boxTipo = document.createElement('div');
      boxTipo.innerHTML = `<label style="display:block;font-size:12px" for="f_tipo">Tipo</label>`;
      boxTipo.appendChild(selTipo);

      boxSeccion = document.createElement('div');
      boxSeccion.innerHTML = `<label style="display:block;font-size:12px" for="f_seccion">Sección</label>`;
      boxSeccion.appendChild(selSeccion);

      boxArea = document.createElement('div');
      boxArea.style.display = 'none';
      boxArea.innerHTML = `<label style="display:block;font-size:12px" for="f_area">Área del vehículo</label>`;
      boxArea.appendChild(selArea);

      filtrosHost.appendChild(boxTipo);
      filtrosHost.appendChild(boxSeccion);
      filtrosHost.appendChild(boxArea);

      await cargarVocab();

      selTipo.addEventListener('change', ()=>{
        if(selTipo.value === 'servicio'){ boxSeccion.style.display='block'; boxArea.style.display='none'; }
        else { boxArea.style.display='block'; boxSeccion.style.display='none'; }
      });
    }

    // ====== SOLO ESTE BLOQUE FUE CAMBIADO (addItem) ======
    const add = document.querySelector('#addItem');
    add && add.addEventListener('click', async (e)=>{
      e.preventDefault();

      const tipoIn = prompt('Tipo (servicio/repuesto)','servicio');
      if (!tipoIn) return;
      const tipo = String(tipoIn).toLowerCase()==='repuesto' ? 'repuesto' : 'servicio';

      let desc = prompt('Descripción','') || '';
      const cant = Number(prompt('Cantidad','1')||'1')||1;

      // intentar precio desde catálogo (primera coincidencia)
      let precio = 0;
      let catalogo_id = null;
      let impuesto_pct = 0;

      try{
        const url = `${API}/catalogo?search=${encodeURIComponent(desc)}&tipo=${encodeURIComponent(tipo)}&limit=1`;
        const res = await fetch(url, { headers:{'Content-Type':'application/json'}, cache:'no-store' });
        if (res.ok) {
          const arr = await res.json();
          if (Array.isArray(arr) && arr.length) {
            const it = arr[0];
            const okUse = confirm(`¿Usar precio de catálogo para "${it.nombre}"?\nL ${Number(it.precio_base||0).toFixed(2)}`);
            if (okUse) {
              precio = Number(it.precio_base||0) || 0;
              catalogo_id = it.id || null;
              impuesto_pct = Number(it.impuesto_pct||0) || 0;
              desc = it.nombre || desc; // usar nombre exacto
            }
          }
        }
      }catch{}

      if (!precio) {
        precio = Number(prompt('Precio','0')||'0')||0;
      }

      items.push({ tipo, desc, cant, precio, catalogo_id, impuesto_pct });
      renderItems();
    });

    // fotos
    wireFotos();

    // usuarios
    loadUsuarios();

    // primer paso
    goStep(1);
  });
})();

