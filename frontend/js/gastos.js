(function () {
  'use strict';
  const API = (window.API_BASE) || localStorage.getItem('API_BASE') || `http://${location.hostname}:3001/api`;
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

  // ------ filtros ------
  function setDefaultMonth(){
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth()+1).padStart(2,'0');
    const first = `${yyyy}-${mm}-01`;
    const last  = new Date(yyyy, today.getMonth()+1, 0).toISOString().slice(0,10);
    $('#f_desde').value = first;
    $('#f_hasta').value = last;
  }

  function buildQuery(){
    const p = new URLSearchParams();
    const d = $('#f_desde').value;
    const h = $('#f_hasta').value;
    const c = $('#f_categoria').value.trim();
    const pr= $('#f_proveedor').value.trim();
    if (d) p.set('from', d);
    if (h) p.set('to',   h);
    if (c) p.set('categoria', c);
    if (pr)p.set('proveedor', pr);
    return p.toString();
  }

  // ------ cargar lista ------
  async function loadGastos(){
    const tb = $('#tabGastos tbody');
    tb.innerHTML = `<tr><td colspan="7">Cargando…</td></tr>`;
    try{
      const rows = await fetchJSON(`${API}/gastos?`+buildQuery());
      let total = 0;
      if (!Array.isArray(rows) || !rows.length){
        tb.innerHTML = `<tr><td colspan="7">Sin resultados.</td></tr>`;
        $('#ft_total').textContent = 'L 0.00';
        return;
      }
      tb.innerHTML = '';
      rows.forEach(g=>{
        total += Number(g.monto||0);
        const tr = document.createElement('tr');
        const link = g.adjunto_url ? `<a href="${g.adjunto_url}" target="_blank" rel="noopener">Ver</a>` : '—';
        tr.innerHTML = `
          <td>${g.fecha||''}</td>
          <td>${g.categoria||''}</td>
          <td>${g.proveedor||''}</td>
          <td>${g.descripcion||''}</td>
          <td class="ta-r">L ${Number(g.monto||0).toFixed(2)}</td>
          <td>${link}</td>
          <td class="ta-r">
            <button class="btn-ghost" data-edit="${g.id}">✏️</button>
            <button class="btn-ghost danger" data-del="${g.id}">🗑️</button>
          </td>
        `;
        tb.appendChild(tr);
      });
      $('#ft_total').textContent = `L ${total.toFixed(2)}`;

      // acciones
      tb.addEventListener('click', async (e)=>{
        const b = e.target.closest('button[data-edit],button[data-del]');
        if(!b) return;
        const id = b.dataset.edit || b.dataset.del;
        if(b.dataset.edit){
          openDlg('Editar gasto');
          try{
            const g = await fetchJSON(`${API}/gastos/${encodeURIComponent(id)}`);
            $('#g_id').value = g.id;
            $('#g_fecha').value = g.fecha || '';
            $('#g_categoria').value = g.categoria || '';
            $('#g_descripcion').value = g.descripcion || '';
            $('#g_proveedor').value = g.proveedor || '';
            $('#g_monto').value = Number(g.monto||0);
            $('#g_adjunto').value = '';
            $('#g_adjunto_url').value = g.adjunto_url || '';
          }catch(err){ toast(err.message,'error'); }
        } else if (b.dataset.del){
          if(!confirm('¿Eliminar gasto?')) return;
          try{
            await fetchJSON(`${API}/gastos/${encodeURIComponent(id)}`, { method:'DELETE' });
            toast('Gasto eliminado','success');
            loadGastos();
          }catch(err){ toast(err.message,'error'); }
        }
      }, { once:true });

    }catch(err){
      tb.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`;
    }
  }

  // ------ modal ------
  const dlg = document.getElementById('dlgGasto');
  function openDlg(title){
    $('#dlgTitle').textContent = title || 'Nuevo gasto';
    $('#formGasto').reset();
    $('#g_id').value='';
    if(!dlg.open) dlg.showModal();
  }
  function closeDlg(){ if(dlg.open) dlg.close(); }

  $('#btnNuevo').addEventListener('click', ()=>openDlg('Nuevo gasto'));
  $('#btnCerrarDlg').addEventListener('click', closeDlg);
  $('#btnCancelarGasto').addEventListener('click', closeDlg);

  // ------ guardar (con soporte multipart opcional) ------
  async function saveGasto(e){
    e.preventDefault();
    const id = $('#g_id').value.trim();
    const data = {
      fecha: $('#g_fecha').value,
      categoria: $('#g_categoria').value.trim(),
      descripcion: $('#g_descripcion').value.trim(),
      proveedor: $('#g_proveedor').value.trim() || null,
      monto: Number($('#g_monto').value||0),
      adjunto_url: $('#g_adjunto_url').value.trim() || null
    };

    const file = $('#g_adjunto').files[0];
    if (file) {
      const fd = new FormData();
      Object.entries(data).forEach(([k,v])=>{ if(v!=null) fd.append(k, v); });
      fd.append('foto', file);
      try{
        const url = id ? `${API}/gastos/${encodeURIComponent(id)}` : `${API}/gastos`;
        const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: fd });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json().catch(()=>{});
        toast('Gasto guardado','success');
        closeDlg();
        loadGastos();
        return;
      }catch(_err){
        // fallback JSON
      }
    }

    try{
      const url = id ? `${API}/gastos/${encodeURIComponent(id)}` : `${API}/gastos`;
      await fetchJSON(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
      toast('Gasto guardado','success');
      closeDlg();
      loadGastos();
    }catch(err){ toast(err.message,'error'); }
  }

  $('#formGasto').addEventListener('submit', saveGasto);

  // ------ inicio ------
  setDefaultMonth();
  $('#btnBuscar').addEventListener('click', loadGastos);
  ['f_desde','f_hasta','f_categoria','f_proveedor'].forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener('change', loadGastos);
    el?.addEventListener('input', ()=>{ clearTimeout(el._t); el._t = setTimeout(loadGastos, 250); });
  });

  loadGastos();
})();
