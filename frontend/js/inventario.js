// frontend/js/inventario.js
// Versión mínima: usa localStorage para CRUD. Luego podemos conectarlo al backend si lo deseas.
(function(){
  const KEY='INV_DATA';
  const $ = s=>document.querySelector(s);
  const tbody = $('#tbl tbody');
  let editIdx = null;

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||[] }catch{ return [] } }
  function save(arr){ localStorage.setItem(KEY, JSON.stringify(arr||[])); }

  function listar(){
    const data = load();
    const q = ($('#buscar').value||'').toLowerCase();
    const filtered = data.filter(x => !q || (x.codigo||'').toLowerCase().includes(q) || (x.nombre||'').toLowerCase().includes(q));
    tbody.innerHTML = filtered.map((x,i)=>`
      <tr>
        <td>${esc(x.codigo)}</td>
        <td>${esc(x.nombre)}</td>
        <td>${esc(x.marca||'')}</td>
        <td>${esc(x.ubicacion||'')}</td>
        <td style="text-align:right">${Number(x.stock||0)}</td>
        <td style="text-align:right">${Number(x.precio||0).toFixed(2)}</td>
        <td><span class="${x.estado==='activo'?'status-on':'status-off'}">${esc(x.estado||'')}</span></td>
        <td>
          <button class="btn-ghost" data-editar="${i}">Editar</button>
          <button class="btn-ghost" data-eliminar="${i}">Eliminar</button>
        </td>
      </tr>
    `).join('');
  }

  function tomarForm(){
    return {
      codigo: $('#codigo').value.trim(),
      nombre: $('#nombre').value.trim(),
      marca: $('#marca').value.trim(),
      ubicacion: $('#ubicacion').value.trim(),
      stock: parseInt($('#stock').value||'0',10)||0,
      precio: parseFloat($('#precio').value||'0')||0,
      estado: $('#estado').value,
      notas: $('#notas').value.trim()
    };
  }

  function llenarForm(x){
    $('#codigo').value = x?.codigo || '';
    $('#nombre').value = x?.nombre || '';
    $('#marca').value = x?.marca || '';
    $('#ubicacion').value = x?.ubicacion || '';
    $('#stock').value = x?.stock ?? 0;
    $('#precio').value = x?.precio ?? 0;
    $('#estado').value = x?.estado || 'activo';
    $('#notas').value = x?.notas || '';
    $('#formTitulo').textContent = x ? ('Editar ítem: '+x.codigo) : 'Nuevo ítem';
  }

  function csvExport(){
    const rows = [['Código','Nombre','Marca','Ubicación','Stock','Precio','Estado','Notas']];
    load().forEach(x => rows.push([x.codigo,x.nombre,x.marca||'',x.ubicacion||'',x.stock||0,x.precio||0,x.estado||'',x.notas||'']));
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'inventario.csv'; a.click();
  }

  function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  // eventos
  $('#btnNuevo').addEventListener('click', ()=>{ editIdx=null; llenarForm(null); });
  $('#btnRefrescar').addEventListener('click', listar);
  $('#btnExport').addEventListener('click', csvExport);
  $('#buscar').addEventListener('input', ()=>{ clearTimeout(window._t); window._t=setTimeout(listar, 300); });

  tbody.addEventListener('click', (e)=>{
    const i = e.target.getAttribute('data-editar') || e.target.getAttribute('data-eliminar');
    if(i===null) return;
    const arr = load();
    const idx = parseInt(i,10);
    if(e.target.hasAttribute('data-editar')){
      editIdx = idx;
      llenarForm(arr[idx]);
    }else{
      if(!confirm('¿Eliminar ítem: '+(arr[idx]?.codigo||idx)+'?')) return;
      arr.splice(idx,1); save(arr); listar();
    }
  });

  $('#guardar').addEventListener('click', ()=>{
    const arr = load();
    const obj = tomarForm();
    if(!obj.codigo || !obj.nombre){ alert('Código y Nombre son obligatorios'); return; }
    if(editIdx===null){
      // evitar duplicados de código
      if(arr.some(x=> (x.codigo||'').toLowerCase() === obj.codigo.toLowerCase())){
        alert('Ya existe un ítem con ese código'); return;
      }
      arr.push(obj);
    }else{
      arr[editIdx] = obj;
    }
    save(arr); alert('Guardado'); listar();
  });

  // init
  listar();
})();

