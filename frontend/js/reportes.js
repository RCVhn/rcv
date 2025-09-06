// frontend/js/reportes.js
(function(){
  'use strict';
  const API = (window.API_BASE) || localStorage.getItem('API_BASE') || `http://${location.hostname}:3001/api`;
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  function toast(m,t='info'){ try{ if(window.showToast) return window.showToast(t,m);}catch{} console.log(`[${t}] ${m}`); }

  function defaultMonth(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    $('#f_mes').value = `${yyyy}-${mm}`;
  }

  function rangeFromMonth(monthStr){
    const [y,m] = monthStr.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDate = new Date(y, m, 0).toISOString().slice(0,10);
    return { from, to:lastDate };
  }

  async function fetchJSON(url, opt={}) {
    const headers = {'Content-Type':'application/json', ...(opt.headers||{})};
    const res = await fetch(url, { cache:'no-store', ...opt, headers });
    let data=null; try{ data = await res.json(); }catch{}
    if (!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data;
  }

  async function cargarReportes(){
    const mes = $('#f_mes').value;
    if(!mes){ toast('Selecciona un mes','warning'); return; }
    const {from,to} = rangeFromMonth(mes);
    $('#hintMes').textContent = `Rango: ${from} a ${to}`;

    // 1) Intento centralizado: /reportes/finanzas
    try{
      const rep = await fetchJSON(`${API}/reportes/finanzas?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

      // KPIs
      const ventas  = Number(rep?.ventas_total || 0);
      const gastos  = Number(rep?.gastos_total || 0);
      const utilidad= ventas - gastos;
      $('#kpiVentas').textContent   = ventas.toFixed(2);
      $('#kpiGastos').textContent   = gastos.toFixed(2);
      $('#kpiUtilidad').textContent = utilidad.toFixed(2);

      // Ventas por día
      const vtbody = $('#tblVentas tbody');
      const ventasPorDia = Array.isArray(rep?.ventas_por_dia) ? rep.ventas_por_dia : [];
      if (!ventasPorDia.length){
        vtbody.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`;
      } else {
        vtbody.innerHTML = '';
        ventasPorDia.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.fecha}</td>
            <td class="ta-r">L ${Number(r.total||0).toFixed(2)}</td>
            <td class="ta-r">L ${Number(r.isv15||0).toFixed(2)}</td>
            <td class="ta-r">L ${Number(r.isv18||0).toFixed(2)}</td>
          `;
          vtbody.appendChild(tr);
        });
      }

      // Gastos por categoría
      const gtbody = $('#tblGastos tbody');
      const gastosPorCat = Array.isArray(rep?.gastos_por_categoria) ? rep.gastos_por_categoria : [];
      if (!gastosPorCat.length){
        gtbody.innerHTML = `<tr><td colspan="2">Sin datos</td></tr>`;
      } else {
        gtbody.innerHTML = '';
        gastosPorCat.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.categoria}</td>
            <td class="ta-r">L ${Number(r.total||0).toFixed(2)}</td>
          `;
          gtbody.appendChild(tr);
        });
      }

      return;
    }catch(err){
      // 2) Fallback simple
      try{
        const gastosRows = await fetchJSON(`${API}/gastos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        const totalG = (Array.isArray(gastosRows)?gastosRows:[]).reduce((a,g)=>a+Number(g.monto||0),0);
        $('#kpiVentas').textContent   = (0).toFixed(2);
        $('#kpiGastos').textContent   = totalG.toFixed(2);
        $('#kpiUtilidad').textContent = (-totalG).toFixed(2);

        const byCat = new Map();
        (gastosRows||[]).forEach(g=>{
          const k = g.categoria || 'Sin categoría';
          byCat.set(k, (byCat.get(k)||0) + Number(g.monto||0));
        });
        const gtbody = $('#tblGastos tbody');
        if (!byCat.size){
          gtbody.innerHTML = `<tr><td colspan="2">Sin datos</td></tr>`;
        } else {
          gtbody.innerHTML = '';
          for(const [cat,tot] of byCat.entries()){
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${cat}</td><td class="ta-r">L ${tot.toFixed(2)}</td>`;
            gtbody.appendChild(tr);
          }
        }

        $('#tblVentas tbody').innerHTML = `<tr><td colspan="4">Agrega el endpoint <code>/reportes/finanzas</code> para ver ventas.</td></tr>`;
        toast('Usando modo básico de reportes (no encontré /reportes/finanzas)','info');
      }catch(err2){
        toast(err2.message,'error');
      }
    }
  }

  $('#btnGenerar').addEventListener('click', cargarReportes);

  defaultMonth();
  cargarReportes();
})();
