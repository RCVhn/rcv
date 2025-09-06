// frontend/js/gestion-ordenes.js
(function(){
  'use strict';
  const API = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
  const $ = (s, r=document)=>r.querySelector(s);

  function toast(m,t='info'){ try{ if(window.showToast) return window.showToast(t,m);}catch{} console.log(`[${t}] ${m}`); }
  function hdr(){ let u={}; try{u=JSON.parse(localStorage.getItem('usuarioActual'))||{}}catch{}; const a=u?.usuario||u?.nombre||'sistema'; return {'Content-Type':'application/json','Accept':'application/json','X-Actor':a,'X-Actor-Usuario':a}; }
  async function api(path,opt={}){ const url=path.startsWith('http')?path:`${API}${path}`; const res=await fetch(url,{mode:'cors',credentials:'omit',headers:{...hdr(),...(opt.headers||{})},...opt}); let data=null; try{data=await res.json();}catch{} if(!res.ok) throw new Error((data&&(data.error||data.message))||`HTTP ${res.status}`); return data; }

  const code = (id)=> (Number(id)>0? String(Number(id)).padStart(4,'0'): '');

  const ESTADOS = ['abierta','en_proceso','esperando_piezas','finalizada','entregada'];

  async function loadUsuarios(){
    try{
      const arr = await api('/usuarios');
      const sel = $('#f_asignado'); sel.innerHTML = '<option value="">Todos los técnicos</option>';
      (Array.isArray(arr)?arr:[]).forEach(u=>{
        const op=document.createElement('option'); op.value=u.id; op.textContent=u.nombre||u.usuario||`U${u.id}`; sel.appendChild(op);
      });
    }catch{}
  }

  function columna(title, key){
    const col=document.createElement('div');
    col.className='kanban-col';
    col.dataset.key=key;
    col.innerHTML = `
      <div class="kanban-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <strong>${title}</strong>
        <span class="muted count">0</span>
      </div>
      <div class="kanban-list" style="display:flex;flex-direction:column;gap:8px;min-height:80px"></div>
    `;
    return col;
  }

  function card(o){
    const c=document.createElement('div');
    c.className='kanban-card card';
    c.style.padding='8px';
    const cli = o.cliente_id ? code(o.cliente_id) : '';
    c.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div><strong>${o.numero||('ID '+o.id)}</strong> · ${o.placa||'-'}</div>
        <button class="btn-ghost btn-sm" data-act="ver">Ver</button>
      </div>
      <div class="muted" style="font-size:.9em">${cli || '-'} · ${o.marca||''} ${o.modelo||''}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select data-estado>
          ${['abierta','en_proceso','esperando_piezas','finalizada','entregada','cancelada'].map(s=>`<option value="${s}" ${o.estado===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select data-asignado title="Asignar técnico"></select>
        <select data-prioridad title="Prioridad">
          ${['alta','media','baja'].map(p=>`<option value="${p}" ${o.prioridad===p?'selected':''}>${p}</option>`).join('')}
        </select>
        <button class="btn btn-sm" data-act="guardar">Guardar</button>
        <button class="btn btn-sm" data-act="del">Eliminar</button>
      </div>
    `;
    c.dataset.id = o.id;
    return c;
  }

  async function fillTecnicosInCards(){
    const arr = await api('/usuarios').catch(()=>[]);
    document.querySelectorAll('.kanban-card select[data-asignado]').forEach(sel=>{
      const idSel = sel.getAttribute('data-current');
      sel.innerHTML = '<option value="">Sin asignar</option>';
      (Array.isArray(arr)?arr:[]).forEach(u=>{
        const op=document.createElement('option'); op.value=u.id; op.textContent=u.nombre||u.usuario||`U${u.id}`; sel.appendChild(op);
      });
      if (idSel) sel.value = idSel;
    });
  }

  async function cargar(){
    const q = ($('#q')?.value||'').trim();
    const estado = $('#f_estado')?.value||'';
    const asign = $('#f_asignado')?.value||'';
    const list = await api(`/ordenes${q?`?q=${encodeURIComponent(q)}`:''}`);

    // base kanban
    const host = $('#kanban'); host.innerHTML='';
    const cols = {
      abierta: columna('Abierta','abierta'),
      en_proceso: columna('En proceso','en_proceso'),
      esperando_piezas: columna('Esperando piezas','esperando_piezas'),
      finalizada: columna('Finalizada','finalizada'),
      entregada: columna('Entregada','entregada')
    };
    Object.values(cols).forEach(c=>host.appendChild(c));

    // filtro simple en frontend
    const data = (Array.isArray(list)?list:[]).filter(o=>{
      if (estado && o.estado!==estado) return false;
      if (asign && String(o.asignado_a||'')!==String(asign)) return false;
      return true;
    });

    data.forEach(o=>{
      const col = cols[o.estado] || cols.abierta;
      const el = card(o);
      // set current asignado/prioridad
      el.querySelector('[data-asignado]')?.setAttribute('data-current', o.asignado_a||'');
      el.querySelector('[data-prioridad]').value = o.prioridad || 'media';
      col.querySelector('.kanban-list').appendChild(el);
    });
    // contadores
    Object.values(cols).forEach(c=>{
      c.querySelector('.count').textContent = c.querySelectorAll('.kanban-card').length;
    });
    // cargar técnicos en selects
    await fillTecnicosInCards();
  }

  async function guardarCard(root){
    const id = root?.dataset?.id; if(!id) return;
    const estado = root.querySelector('[data-estado]').value;
    const asignado_a = root.querySelector('[data-asignado]').value || null;
    const prioridad = root.querySelector('[data-prioridad]').value || null;
    try{
      await api(`/ordenes/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify({ estado, asignado_a, prioridad }) });
      toast('Actualizado','success');
      await cargar();
    }catch(e){ toast(e.message,'error'); }
  }
  async function eliminar(id){
    if(!confirm('¿Eliminar esta orden?')) return;
    try{ await api(`/ordenes/${encodeURIComponent(id)}`, { method:'DELETE' }); toast('Orden eliminada','success'); await cargar(); }catch(e){ toast(e.message,'error'); }
  }

  // dialog ver
  function printCurrentDialog(){
    const body = $('#dlgOrdenBody')?.innerHTML || '';
    const win = window.open('', '_blank');
    const styles = `body{font-family:Arial,sans-serif;padding:16px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px} thead th{background:#f8fafc}`;
    win.document.write(`<html><head><meta charset="utf-8"><title>Orden</title><style>${styles}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    win.document.close(); win.focus();
  }
  async function abrirDialog(id){
    try{
      const data = await api(`/ordenes/${encodeURIComponent(id)}`);
      const o = data?.orden || data || {};
      const v = data?.vehiculo || {};
      const c = data?.cliente || {};
      const cli = c?.id ? (String(c.id).padStart(4,'0') + ' — ' + (c.nombre||'')) : (o.cliente_id ? String(o.cliente_id).padStart(4,'0') : '-');
      $('#dlgOrdenTitulo').textContent = `Orden ${o.numero||('#'+o.id)}`;
      $('#dlgOrdenBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <div><strong>Número:</strong> ${o.numero||'-'}</div>
          <div><strong>Estado:</strong> ${o.estado||'-'}</div>
          <div><strong>Placa:</strong> ${v.placa||o.placa||'-'}</div>
          <div><strong>Vehículo:</strong> ${v.marca||o.marca||''} ${v.modelo||o.modelo||''}</div>
          <div class="full"><strong>Cliente:</strong> ${cli}</div>
          <div><strong>Asignado:</strong> ${o.asignado_nombre||'-'}</div>
          <div><strong>Prioridad:</strong> ${o.prioridad||'media'}</div>
          <div><strong>Total:</strong> ${o.total!=null?Number(o.total).toFixed(2):'-'}</div>
          <div><strong>Fecha:</strong> ${o.fechaRegistro||'-'}</div>
          <div class="full"><strong>Descripción:</strong> ${o.descripcion||'-'}</div>
        </div>
      `;
      const dlg=$('#dlgOrden'); if (typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','open');
    }catch(e){ toast(e.message,'error'); }
  }
  $('#btnDlgPrint')?.addEventListener('click', printCurrentDialog);
  $('#btnDlgPdf')?.addEventListener('click', printCurrentDialog);
  $('#btnCerrarDlgOrden')?.addEventListener('click', ()=>{ const d=$('#dlgOrden'); if(d?.close) d.close(); else d?.removeAttribute('open'); });

  function wire(){
    $('#btnBuscar')?.addEventListener('click', ()=>cargar().catch(e=>toast(e.message,'error')));
    $('#btnRefrescar')?.addEventListener('click', ()=>cargar().catch(e=>toast(e.message,'error')));
    $('#q')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); cargar(); } });

    $('#kanban')?.addEventListener('click', (e)=>{
      const root = e.target.closest('.kanban-card'); if(!root) return;
      if (e.target.matches('button[data-act="guardar"]')) return guardarCard(root);
      if (e.target.matches('button[data-act="del"]')) return eliminar(root.dataset.id);
      if (e.target.matches('button[data-act="ver"]')) return abrirDialog(root.dataset.id);
    });
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      wire();
      await loadUsuarios();
      await cargar();
    }catch(e){ toast('No se pudo cargar órdenes','error'); }
  });
})();

