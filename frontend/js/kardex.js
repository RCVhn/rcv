// frontend/js/kardex.js
(function(){
  'use strict';

  const $ = (s, r=document) => r.querySelector(s);
  const API = (window.API_BASE) || localStorage.getItem('API_BASE') || `http://${location.hostname}:3001/api`;

  function toast(msg, type='info', title=''){
    try{ window.showToast ? window.showToast(msg, type, title) : console.log(`[${type}] ${title} ${msg}`); }catch(e){ console.log(msg); }
  }

  const selProducto = $('#selProducto');
  const selTipo     = $('#selTipo');
  const inpCantidad = $('#inpCantidad');
  const inpRef      = $('#inpRef');
  const btnAgregar  = $('#btnAgregar');
  const stockInfo   = $('#stockInfo');

  const selLimit    = $('#selLimit');
  const btnRefrescar= $('#btnRefrescar');
  const tbody       = $('#tblKardex tbody');

  let productos = [];

  async function fetchJSON(url, opts){
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type':'application/json' }}, opts||{}));
    if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  function optLabel(p){
    const sku = (p.sku||'').toString().trim();
    const name = (p.nombre||p.name||'').toString().trim();
    const stock = (p.stock ?? p.existencias ?? 0);
    return `${sku ? sku+' - ' : ''}${name} (stock ${stock})`;
  }

  function fillProductos(){
    selProducto.innerHTML = '';
    if (!Array.isArray(productos) || productos.length === 0) {
      const op = document.createElement('option');
      op.value = '';
      op.textContent = '— Sin productos —';
      selProducto.appendChild(op);
      selProducto.disabled = true;
      return;
    }
    selProducto.disabled = false;
    for(const p of productos){
      const op = document.createElement('option');
      op.value = p.id;
      op.textContent = optLabel(p);
      selProducto.appendChild(op);
    }
    selProducto.dispatchEvent(new Event('change'));
  }

  async function cargarProductos(){
    try{
      const data = await fetchJSON(`${API}/productos?limit=500`);
      productos = Array.isArray(data) ? data : [];
      fillProductos();
    }catch(e){
      productos = [];
      fillProductos();
      toast('No se pudo cargar la lista de productos.', 'warning', 'Kardex');
    }
  }

  function productoSeleccionado(){
    const id = Number(selProducto.value||0);
    return productos.find(p => Number(p.id) === id) || null;
  }

  selProducto?.addEventListener('change', ()=>{
    const p = productoSeleccionado();
    if (p) {
      stockInfo.textContent = `Stock actual: ${p.stock ?? 0}`;
    } else {
      stockInfo.textContent = '';
    }
  });

  async function cargarKardex(){
    try{
      const limit = Number(selLimit.value||25);
      const rows = await fetchJSON(`${API}/kardex?limit=${encodeURIComponent(limit)}`);
      tbody.innerHTML = '';
      for(const k of rows){
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${k.id}</td>
          <td>${(k.fecha||'').replace('T',' ').replace('Z','')}</td>
          <td>${k.producto_nombre ?? k.producto_id}</td>
          <td>${k.tipo}</td>
          <td class="right">${Number(k.cantidad||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
          <td>${k.referencia||''}</td>
        `;
        tbody.appendChild(tr);
      }
    }catch(e){
      toast('No se pudo cargar el kardex.', 'error', 'Kardex');
    }
  }

  btnRefrescar?.addEventListener('click', cargarKardex);
  selLimit?.addEventListener('change', cargarKardex);

  btnAgregar?.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    try{
      const prod = productoSeleccionado();
      const producto_id = prod?.id || Number(selProducto.value||0);
      const tipo = (selTipo.value||'').toLowerCase();
      const cantidad = Number(inpCantidad.value||0);
      const referencia = inpRef.value||null;

      if(!producto_id){ toast('Selecciona un producto.', 'warning'); return; }
      if(!['entrada','salida','ajuste'].includes(tipo)){ toast('Tipo inválido.', 'warning'); return; }
      if(!(cantidad>0)){ toast('Cantidad debe ser mayor a 0.', 'warning'); return; }

      const payload = { producto_id, tipo, cantidad, referencia };
      const res = await fetchJSON(`${API}/kardex`, {
        method:'POST',
        body: JSON.stringify(payload)
      });

      toast('Movimiento registrado.', 'success', 'Kardex');

      if (prod && res?.producto?.stock != null) {
        prod.stock = res.producto.stock;
        selProducto.dispatchEvent(new Event('change'));
      }

      inpCantidad.value = '';
      inpRef.value = '';

      await cargarKardex();
    }catch(e){
      toast(`Error al registrar: ${e.message||e}`, 'error');
    }
  });

  (async function init(){
    try{
      await cargarProductos();
      await cargarKardex();
    }catch(e){}
  })();

})();
