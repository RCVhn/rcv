/* eslint-env browser */
/* global showToast */

(function(){
  'use strict';

  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
  const API = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  const el = {
    lblCAI: $('#lblCAI'),
    selCAI: $('#selCAI'),
    est:    $('#cai_est'),
    pem:    $('#cai_pem'),
    tdoc:   $('#cai_tdoc'),
    lim:    $('#cai_lim'),
    ri:     $('#cai_ri'),
    rf:     $('#cai_rf'),

    em_rtn: $('#em_rtn'),
    em_nom: $('#em_nombre'),
    em_dom: $('#em_dom'),

    lugar:  $('#lugar'),
    moneda: $('#moneda'),

    cl_nom: $('#cl_nombre'),
    cl_rtn: $('#cl_rtn'),
    fecha:  $('#fecha'),

    tbl:    $('#tbl'),
    tbody:  $('#tbl tbody'),

    sum_grav:  $('#sum_grav'),
    sum_exen:  $('#sum_exen'),
    sum_15:    $('#sum_15'),
    sum_18:    $('#sum_18'),
    sum_desc:  $('#sum_desc'),
    sum_total: $('#sum_total'),

    resultado: $('#resultado'),

    btnAdd: $('#btnAdd'),
    btnClear: $('#btnClear'),
    btnEmitir: $('#btnEmitir'),
    btnGuardarEmisor: $('#btnGuardarEmisor'),
    btnNuevoCAI: $('#btnNuevoCAI')
  };

  function money(n){ return (Math.round((Number(n)||0)*100)/100).toFixed(2); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  // ===== Letras (HNL) =====
  function numeroALetras(n){
    const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
    const decenas = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
    const especiales = {11:'ONCE',12:'DOCE',13:'TRECE',14:'CATORCE',15:'QUINCE'};
    const centenas = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
    function tres(num){
      num = Number(num);
      if(num===0) return '';
      if(num===100) return 'CIEN';
      let c = Math.floor(num/100), d = Math.floor((num%100)/10), u = num%10, txt='';
      if(c) txt += centenas[c] + ' ';
      const dos = num%100;
      if(dos>=11 && dos<=15) return (txt + especiales[dos]).trim();
      if(d===1) txt += 'DIEZ';
      else if(d===2) txt += (u ? 'VEINTI' : 'VEINTE');
      else if(d>2){ txt += decenas[d]; if(u) txt += ' Y '; }
      if(d!==2 && u) txt += unidades[u];
      return txt.trim();
    }
    function secciones(num){
      let millones = Math.floor(num/1_000_000);
      let miles = Math.floor((num%1_000_000)/1000);
      let resto = num%1000;
      let t = '';
      if(millones){ t += (millones===1?'UN MILLÓN':`${tres(millones)} MILLONES`); }
      if(miles){ if(t) t+=' '; t += (miles===1?'MIL':`${tres(miles)} MIL`); }
      if(resto){ if(t) t+=' '; t += tres(resto); }
      return t || 'CERO';
    }
    const entero = Math.floor(n);
    const cent = Math.round((n - entero)*100);
    return `${secciones(entero)} LEMPIRAS CON ${cent.toString().padStart(2,'0')}/100`;
  }

  // ====== Emisor en localStorage ======
  function loadEmisor(){
    el.em_rtn.value = localStorage.getItem('EMISOR_RTN') || '';
    el.em_nom.value = localStorage.getItem('EMISOR_NOMBRE') || '';
    el.em_dom.value = localStorage.getItem('EMISOR_DOM') || '';
    el.lugar.value  = localStorage.getItem('EMISOR_LUGAR') || el.lugar.value;
    el.moneda.value = localStorage.getItem('EMISOR_MON') || 'HNL';
  }
  function saveEmisor(){
    localStorage.setItem('EMISOR_RTN', el.em_rtn.value.trim());
    localStorage.setItem('EMISOR_NOMBRE', el.em_nom.value.trim());
    localStorage.setItem('EMISOR_DOM', el.em_dom.value.trim());
    localStorage.setItem('EMISOR_LUGAR', el.lugar.value.trim());
    localStorage.setItem('EMISOR_MON', el.moneda.value.trim());
    showToast('Emisor guardado','success');
  }

  // ====== CAI ======
  async function fetchJSON(url, opts={}){
    const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
    let data = null;
    try{
      data = await res.json();
    }catch{
      const raw = await res.text();
      const err = new Error('Respuesta no-JSON del servidor');
      err.status = res.status;
      err.raw = raw;
      throw err;
    }
    if(!res.ok){
      const err = new Error(data?.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function cargarCAIs(){
    try{
      const list = await fetchJSON(`${API}/cai`);
      el.selCAI.innerHTML = '';

      // Placeholder visible
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— Seleccione CAI —';
      ph.disabled = true;
      ph.selected = true;
      el.selCAI.appendChild(ph);

      // Poblar
      list.forEach(c=>{
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = `${c.documento_tipo} | ${c.cai} | ${c.establecimiento}-${c.punto_emision}-${c.tipo_doc} | Límite ${c.fecha_limite} | ${c.rango_inicio}-${c.rango_fin} [${c.estado}]`;
        el.selCAI.appendChild(opt);
      });

      // Seleccionar vigente por defecto (o el primero)
      const vigente = list.find(x=>x.estado==='vigente') || list[0];
      if(vigente){
        el.selCAI.value = String(vigente.id);
        pintarCAI(vigente);
      }else{
        pintarCAI(null);
        showToast('No hay CAIs registrados. Crea uno para emitir.', 'warning');
      }
    }catch(e){
      showToast(e?.data?.error || 'Error cargando CAI', 'error');
    }
  }

  function pintarCAI(c){
    el.lblCAI.textContent = c ? `CAI: ${c.cai}` : '';
    el.est.value = c?.establecimiento||'';
    el.pem.value = c?.punto_emision||'';
    el.tdoc.value = c?.tipo_doc||'';
    el.lim.value = c?.fecha_limite||'';
    el.ri.value = c?.rango_inicio||'';
    el.rf.value = c?.rango_fin||'';
  }

  el.selCAI?.addEventListener('change', async ()=>{
    const id = el.selCAI.value;
    if(!id) return;
    try{
      const list = await fetchJSON(`${API}/cai`);
      const sel = list.find(x=>String(x.id)===String(id));
      pintarCAI(sel||null);
    }catch{/* no-op */}
  });

  el.btnNuevoCAI?.addEventListener('click', async ()=>{
    const cai = prompt('CAI:'); if(!cai) return;
    const documento_tipo = prompt('Tipo documento (FACTURA/TICKET/NC/ND):','FACTURA') || 'FACTURA';
    const establecimiento = prompt('Establecimiento (3 dígitos):','001') || '001';
    const punto_emision   = prompt('Punto emisión (3 dígitos):','001') || '001';
    const tipo_doc        = prompt('Tipo Doc (2 dígitos, ej: 01 Factura, 04 NC, 05 ND):','01') || '01';
    const rango_inicio    = Number(prompt('Rango inicio (entero):','1')||'1');
    const rango_fin       = Number(prompt('Rango fin (entero):','99999999')||'99999999');
    const fecha_limite    = prompt('Fecha límite (YYYY-MM-DD):', todayISO()) || todayISO();
    try{
      await fetchJSON(`${API}/cai`, {
        method:'POST',
        body: JSON.stringify({cai,documento_tipo,establecimiento,punto_emision,tipo_doc,rango_inicio,rango_fin,fecha_limite})
      });
      showToast('CAI creado','success');
      await cargarCAIs(); // recargar y seleccionar vigente automáticamente
    }catch(e){ showToast(e.data?.error || 'Error creando CAI','error'); }
  });

  // ====== Ítems ======
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
    let grav=0, exen=0, i15=0, i18=0, descT=0, total=0;
    $$('#tbl tbody tr').forEach(tr=>{
      const qty = Number($('.qty',tr).value||0);
      const pu  = Number($('.pu',tr).value||0);
      const des = Number($('.des',tr).value||0);
      const isv = Number($('.isv',tr).value||0);

      const bruto = qty*pu;
      const base  = Math.max(bruto - des, 0);
      const imp   = isv===15 ? base*0.15 : isv===18 ? base*0.18 : 0;
      const tot   = base + imp;

      if(isv===0) exen += base; else grav += base;
      if(isv===15) i15 += imp;
      if(isv===18) i18 += imp;
      descT += des; total += tot;

      $('.base',tr).textContent = money(base);
      $('.imp',tr).textContent  = money(imp);
      $('.tot',tr).textContent  = money(tot);
    });

    el.sum_grav.textContent  = money(grav);
    el.sum_exen.textContent  = money(exen);
    el.sum_15.textContent    = money(i15);
    el.sum_18.textContent    = money(i18);
    el.sum_desc.textContent  = money(descT);
    el.sum_total.textContent = money(total);
  }

  // ====== Emitir ======
  async function emitir(){
    try{
      const cai_id = Number(el.selCAI.value||0);
      const fecha_emision = el.fecha.value || todayISO();

      const emisor = {
        rtn: el.em_rtn.value.trim(),
        nombre: el.em_nom.value.trim(),
        domicilio: el.em_dom.value.trim()
      };
      if(!emisor.rtn || !emisor.nombre){
        showToast('Completa RTN y Nombre del Emisor','warning'); return;
      }

      const cliente = {
        rtn: el.cl_rtn.value.trim() || null,
        nombre: el.cl_nom.value.trim() || null
      };

      const items = $$('#tbl tbody tr').map(tr=>({
        descripcion: $('.dsc',tr).value.trim(),
        cantidad: Number($('.qty',tr).value||0),
        precio_unitario: Number($('.pu',tr).value||0),
        descuento: Number($('.des',tr).value||0),
        tarifa_isv: Number($('.isv',tr).value||0)
      })).filter(x=>x.descripcion && x.cantidad>0);

      if(items.length===0){ showToast('Agrega al menos un ítem','warning'); return; }

      const totalNum = Number(el.sum_total.textContent||0);
      const payload = {
        tipo: 'FACTURA',
        cai_id,
        fecha_emision,
        lugar_emision: el.lugar.value.trim()||'San Pedro Sula',
        moneda: el.moneda.value.trim()||'HNL',
        emisor,
        cliente,
        items,
        total_letras: numeroALetras(totalNum)
      };

      const resp = await fetchJSON(`${API}/documentos`, {
        method:'POST',
        body: JSON.stringify(payload)
      });

      el.resultado.innerHTML = `
        <div class="card">
          <div><b>Documento emitido:</b> ${resp.header.tipo} — <b>${resp.header.correlativo}</b></div>
          <div>Fecha: ${resp.header.fecha_emision} | Total: L. ${money(resp.header.total)}</div>
          <div>CAI: ${resp.header.cai_id}</div>
        </div>
      `;
      showToast('Documento emitido','success');
      // limpiar items
      el.tbody.innerHTML = '';
      addRow();
      recalc();
    }catch(e){
      showToast(e?.data?.error || 'Error al emitir','error');
    }
  }

  // ====== Init ======
  function init(){
    loadEmisor();
    el.fecha.value = todayISO();
    addRow();

    cargarCAIs().catch(()=>{});

    el.btnAdd.addEventListener('click', ()=>addRow());
    el.btnClear.addEventListener('click', ()=>{ el.tbody.innerHTML=''; addRow(); recalc(); });
    el.btnEmitir.addEventListener('click', emitir);
    el.btnGuardarEmisor.addEventListener('click', saveEmisor);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

