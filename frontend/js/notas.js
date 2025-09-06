// frontend/js/notas.js
(function(){
  'use strict';

  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
  const API = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  const el = {
    title: $('#title'),
    ref_tipo: $('#ref_tipo'),
    ref_corr: $('#ref_corr'),
    ref_fecha: $('#ref_fecha'),
    ref_cai: $('#ref_cai'),
    ref_motivo: $('#ref_motivo'),
    selCAI: $('#selCAI'),

    tbl: $('#tbl'),
    tbody: $('#tbl tbody'),
    sum_total: $('#sum_total'),

    btnAdd: $('#btnAdd'),
    btnClear: $('#btnClear'),
    btnEmitir: $('#btnEmitir'),
    resultado: $('#resultado')
  };

  function qparam(k){
    const u = new URL(location.href);
    return u.searchParams.get(k);
  }
  function money(n){ return (Math.round((Number(n)||0)*100)/100).toFixed(2); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  async function fetchJSON(url, opts={}){
    const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
    const data = await res.json().catch(()=>null);
    if(!res.ok) throw Object.assign(new Error(data?.error||res.statusText), {status: res.status, data});
    return data;
  }

  async function cargarCAIs(tipoNota){
    const list = await fetchJSON(`${API}/cai`);
    // filtrar por tipo_doc: 04 (NC) / 05 (ND) si los manejas así
    const filtro = tipoNota==='NC' ? '04' : '05';
    const arr = list.filter(c => c.tipo_doc === filtro && c.estado === 'vigente');
    el.selCAI.innerHTML = '';
    for(const c of arr.length?arr:list){
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.documento_tipo} | ${c.cai} | ${c.establecimiento}-${c.punto_emision}-${c.tipo_doc} | Límite ${c.fecha_limite} | ${c.rango_inicio}-${c.rango_fin} [${c.estado}]`;
      el.selCAI.appendChild(opt);
    }
  }

  async function cargarReferencia(id){
    const doc = await fetchJSON(`${API}/documentos/${id}`);
    const caiList = await fetchJSON(`${API}/cai`);
    const caiRow = caiList.find(x=>x.id === doc.header.cai_id);

    el.ref_tipo.value = doc.header.tipo;
    el.ref_corr.value = doc.header.correlativo;
    el.ref_fecha.value = doc.header.fecha_emision;
    el.ref_cai.value = caiRow?.cai || doc.header.cai_id;

    return {doc, caiRow};
  }

  function addRow(data={}){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="dsc" type="text" placeholder="Descripción" value="${data.descripcion||''}"></td>
      <td><input class="qty" type="number" step="0.01" value="${data.cantidad||1}"></td>
      <td><input class="pu"  type="number" step="0.01" value="${data.precio_unitario||0}"></td>
      <td><input class="des" type="number" step="0.01" value="${data.descuento||0}"></td>
      <td>
        <select class="isv">
          <option value="0"  ${data.tarifa_isv==0?'selected':''}>0</option>
          <option value="15" ${data.tarifa_isv==15?'selected':''}>15</option>
          <option value="18" ${data.tarifa_isv==18?'selected':''}>18</option>
        </select>
      </td>
      <td class="right base">0.00</td>
      <td class="right imp">0.00</td>
      <td class="right tot">0.00</td>
      <td><button class="del">✕</button></td>
    `;
    el.tbody.appendChild(tr);
    bindRow(tr);
    recalc();
  }

  function bindRow(tr){
    $$('.dsc,.qty,.pu,.des,.isv', tr).forEach(inp => inp.addEventListener('input', recalc));
    $('.del', tr).addEventListener('click', ()=>{ tr.remove(); recalc(); });
  }

  function recalc(){
    let total = 0;
    $$('#tbl tbody tr').forEach(tr=>{
      const qty = Number($('.qty',tr).value||0);
      const pu  = Number($('.pu',tr).value||0);
      const des = Number($('.des',tr).value||0);
      const isv = Number($('.isv',tr).value||0);

      const bruto = qty*pu;
      const base  = Math.max(bruto - des, 0);
      const imp   = isv===15 ? base*0.15 : isv===18 ? base*0.18 : 0;
      const tot   = base + imp;

      $('.base',tr).textContent = money(base);
      $('.imp',tr).textContent  = money(imp);
      $('.tot',tr).textContent  = money(tot);
      total += tot;
    });
    el.sum_total.textContent = money(total);
  }

  async function emitir(tipo, ref){
    try{
      const cai_id = Number(el.selCAI.value||0);
      if(!cai_id){ showToast('Selecciona un CAI para la nota','warning'); return; }

      // Para la nota usamos los datos del emisor/cliente del documento original
      const { header: H } = ref.doc;

      const items = $$('#tbl tbody tr').map(tr=>({
        descripcion: $('.dsc',tr).value.trim(),
        cantidad: Number($('.qty',tr).value||0),
        precio_unitario: Number($('.pu',tr).value||0),
        descuento: Number($('.des',tr).value||0),
        tarifa_isv: Number($('.isv',tr).value||0)
      })).filter(x=>x.descripcion && x.cantidad>0);

      if(items.length===0){ showToast('Agrega al menos un ítem','warning'); return; }

      const payload = {
        tipo, // 'NC' o 'ND'
        cai_id,
        fecha_emision: todayISO(),
        lugar_emision: H.lugar_emision || 'San Pedro Sula',
        moneda: H.moneda || 'HNL',
        emisor: { rtn: H.emisor_rtn, nombre: H.emisor_nombre, domicilio: H.emisor_domicilio },
        cliente: { rtn: H.cliente_rtn, nombre: H.cliente_nombre },
        items,
        referencia: {
          ref_tipo: H.tipo,
          ref_cai: $('#ref_cai').value,
          ref_correlativo: H.correlativo,
          ref_fecha: H.fecha_emision,
          motivo: $('#ref_motivo').value.trim() || null
        }
      };

      const resp = await fetchJSON(`${API}/documentos`, { method:'POST', body: JSON.stringify(payload) });
      showToast('Nota emitida','success');
      el.resultado.innerHTML = `
        <div class="card">
          <div><b>Nota emitida:</b> ${resp.header.tipo} — <b>${resp.header.correlativo}</b></div>
          <div>Fecha: ${resp.header.fecha_emision} | Total: L. ${money(resp.header.total)}</div>
        </div>
      `;
      el.tbody.innerHTML = ''; addRow();
    }catch(e){
      showToast(e.data?.error || 'Error al emitir la nota','error');
    }
  }

  async function init(){
    const tipo = (qparam('tipo')||'NC').toUpperCase(); // NC / ND
    const refId = qparam('ref');
    el.title.textContent = `Emitir ${tipo}`;
    await cargarCAIs(tipo);

    if(refId){
      try{
        const ref = await cargarReferencia(refId);
        // guardar ref para emitir
        el.btnEmitir.addEventListener('click', ()=>emitir(tipo, ref));
      }catch(e){
        showToast('No se pudo cargar la referencia','error');
      }
    }else{
      showToast('Falta documento de referencia','warning');
    }

    el.btnAdd.addEventListener('click', ()=>addRow());
    el.btnClear.addEventListener('click', ()=>{ el.tbody.innerHTML=''; addRow(); recalc(); });

    addRow();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

