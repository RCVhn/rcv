(function(){
  'use strict';
  const API = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';
  const $ = (s, r=document)=>r.querySelector(s);
  const fmtCode = (id)=> (Number(id)>0? String(Number(id)).padStart(4,'0'): '');

  function toast(msg,type='info'){ try{ if(window.showToast) return window.showToast(type,msg);}catch{} console.log(`[${type}] ${msg}`); }
  function hdr(){ let u={}; try{u=JSON.parse(localStorage.getItem('usuarioActual'))||{}}catch{}; const a=u?.usuario||u?.nombre||'sistema'; return {'Content-Type':'application/json','Accept':'application/json','X-Actor':a,'X-Actor-Usuario':a}; }
  async function api(path,opt={}){ const url=path.startsWith('http')?path:`${API}${path}`; const res=await fetch(url,{mode:'cors',credentials:'omit',headers:{...hdr(),...(opt.headers||{})},...opt}); let data=null; try{data=await res.json();}catch{} if(!res.ok) throw new Error((data&&(data.error||data.message))||`HTTP ${res.status}`); return data; }
  const escapeHtml = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

  const pag = { page:1, pageSize:10, total:0, q:'' };
  let LIST = [];
  let ALL = [];

  function renderSkeletonRows(tbody, cols, rows=6){
    tbody.innerHTML=''; for(let i=0;i<rows;i++){ const tr=document.createElement('tr'); tr.className='skel-row skel'; for(let c=0;c<cols;c++) tr.appendChild(document.createElement('td')); tbody.appendChild(tr); }
  }
  function renderEmptyRow(tbody, cols, msg){ tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">${escapeHtml(msg)}</td></tr>`; }
  function buildPaginador(container, state, onChange){
    const maxPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    container.innerHTML='';
    const mk=(t)=>{const b=document.createElement('button'); b.className='btn'; b.textContent=t; return b;};
    const prev=mk('« Anterior'), next=mk('Siguiente »');
    prev.disabled = state.page<=1; next.disabled = state.page>=maxPage;
    const meta=document.createElement('span'); meta.className='meta'; meta.textContent=`Página ${state.page} de ${maxPage} · ${state.total} registros`;
    const sel=document.createElement('select'); [5,10,20,50,100].forEach(n=>{const o=document.createElement('option'); o.value=n; o.textContent=n; if(n===state.pageSize) o.selected=true; sel.appendChild(o);});
    const selLabel=document.createElement('span'); selLabel.className='meta'; selLabel.textContent='Por página:';
    prev.onclick=()=>{ if(state.page>1){ state.page--; onChange(); } };
    next.onclick=()=>{ if(state.page<maxPage){ state.page++; onChange(); } };
    sel.onchange=()=>{ state.pageSize=parseInt(sel.value,10)||10; state.page=1; onChange(); };
    container.append(prev,next,meta,selLabel,sel);
  }

  function renderTabla(items){
    const tbody = $('#tablaOrdenes tbody');
    tbody.innerHTML='';
    if (!items.length) return renderEmptyRow(tbody, 8, pag.q ? 'Sin resultados' : 'Aún no hay órdenes');

    const base = (pag.page-1)*pag.pageSize;
    items.forEach((o,i)=>{
      const tr = document.createElement('tr'); tr.dataset.id = String(o.id);
      tr.innerHTML = `
        <td>${base+i+1}</td>
        <td>${escapeHtml(o.numero||('#'+o.id))}</td>
        <td>${escapeHtml(o.fecha||o.creado||'')}</td>
        <td>${escapeHtml(o.estado||'-')}</td>
        <td>${escapeHtml(o.placa||'-')}</td>
        <td>${o.cliente_id? fmtCode(o.cliente_id):'-'} ${o.cliente_nombre? '— '+escapeHtml(o.cliente_nombre):''}</td>
        <td>${escapeHtml(o.asignado_nombre||o.asignado_a||'-')}</td>
        <td class="td-acciones">
          <button class="btn btn-sm" data-act="ver">Ver</button>
          <button class="btn btn-sm" data-act="del">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function cargar(qStr){
    const tbody = $('#tablaOrdenes tbody');
    renderSkeletonRows(tbody, 8, 6);

    if (typeof qStr==='string'){ const nq=qStr.trim(); if(nq!==pag.q) pag.page=1; pag.q=nq; }

    const resp = await api(`/ordenes${pag.q ? `?q=${encodeURIComponent(pag.q)}`:''}`);
    const rows = Array.isArray(resp) ? resp : (resp.items||[]);
    ALL = rows;
    pag.total = rows.length;
    const start=(pag.page-1)*pag.pageSize;
    LIST = rows.slice(start, start+pag.pageSize);

    renderTabla(LIST);
    const cont = document.getElementById('paginador-ordenes');
    cont && buildPaginador(cont, pag, ()=>cargar(pag.q));
    const count = document.getElementById('countOrdenes');
    if (count) count.textContent = `Órdenes (${rows.length})`;
  }

  // ver / eliminar
  async function verOrden(id){
    try{
      const data = await api(`/ordenes/${encodeURIComponent(id)}`);
      const o = data?.orden || data || {};
      const c = data?.cliente || {};
      const v = data?.vehiculo || {};

      $('#dlgOrdenTitulo').textContent = `Orden ${o.numero || ('#'+o.id)} — ${v.placa || ''}`;

      const html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <div><strong>Fecha:</strong> ${escapeHtml(o.fecha||o.creado||'-')}</div>
          <div><strong>Estado:</strong> ${escapeHtml(o.estado||'-')}</div>
          <div><strong>Placa:</strong> ${escapeHtml(v.placa||'-')}</div>
          <div><strong>Cliente:</strong> ${c.id? fmtCode(c.id):'-'} ${c.nombre? '— '+escapeHtml(c.nombre):''}</div>
          <div><strong>Asignado a:</strong> ${escapeHtml(o.asignado_nombre||o.asignado_a||'-')}</div>
          <div><strong>Prioridad:</strong> ${escapeHtml(o.prioridad||'-')}</div>
          <div class="full"><strong>Descripción:</strong> ${escapeHtml(o.descripcion||'-')}</div>
          <div class="full"><strong>Diagnóstico:</strong> ${escapeHtml(o.tecnico_diagnostico||'-')}</div>
          <div class="full"><strong>Trabajos:</strong> ${escapeHtml(o.tecnico_trabajos||'-')}</div>
          <div><strong>Mano de obra:</strong> ${escapeHtml(o.mano_obra!=null? String(o.mano_obra):'-')}</div>
          <div><strong>Total:</strong> ${escapeHtml(o.total!=null? String(o.total):'-')}</div>
        </div>
      `;
      $('#dlgOrdenBody').innerHTML = html;

      const dlg = $('#dlgOrden'); if (typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','open');
    }catch(e){ toast(e.message,'error'); }
  }
  async function eliminarOrden(id){
    if (!confirm('¿Eliminar esta orden?')) return;
    try{
      await api(`/ordenes/${encodeURIComponent(id)}`, { method:'DELETE' });
      toast('Orden eliminada','success');
      await cargar($('#q').value||'');
    }catch(e){ toast(e.message,'error'); }
  }

  function exportCSV(){
    const headers = ['ID','Número','Fecha','Estado','Placa','ClienteID','Cliente','Asignado','Total'];
    const rows = ALL.map(o=>[
      o.id, (o.numero||'#'+o.id), (o.fecha||o.creado||''), (o.estado||''), (o.placa||''),
      (o.cliente_id||''), (o.cliente_nombre||''), (o.asignado_nombre||o.asignado_a||''), (o.total||'')
    ]);
    const csv = [headers, ...rows].map(r=>r.map(v=>{ v=v==null?'':String(v); v=v.replace(/"/g,'""'); return /[",\n;]/.test(v)?`"${v}"`:v; }).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`ordenes-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // imprimir/PDF del dialog (simple)
  function printCurrentDialog(){
    const body = $('#dlgOrdenBody')?.innerHTML || '';
    const win = window.open('', '_blank');
    const styles = `body{font-family:Arial,sans-serif;padding:16px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px} thead th{background:#f8fafc}`;
    win.document.write(`<html><head><meta charset="utf-8"><title>Orden</title><style>${styles}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    win.document.close(); win.focus();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // buscar
    $('#btnBuscar')?.addEventListener('click', ()=>{ pag.page=1; cargar($('#q').value||''); });
    $('#q')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); pag.page=1; cargar($('#q').value||''); }});
    $('#btnRefrescar')?.addEventListener('click', ()=>cargar($('#q').value||''));
    $('#btnExportCsv')?.addEventListener('click', exportCSV);

    // acciones tabla
    $('#tablaOrdenes tbody')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-act]'); if(!btn) return;
      const id = btn.closest('tr')?.dataset?.id; if(!id) return;
      const act = btn.dataset.act;
      if (act==='ver') verOrden(id);
      else if (act==='del') eliminarOrden(id);
    });

    // dialog
    $('#btnCerrarDlgOrden')?.addEventListener('click', ()=>{ const d=$('#dlgOrden'); if(d?.close) d.close(); else d?.removeAttribute('open'); });
    $('#btnDlgPrint')?.addEventListener('click', printCurrentDialog);
    $('#btnDlgPdf')?.addEventListener('click', printCurrentDialog);

    // init
    cargar('');
  });
})();

