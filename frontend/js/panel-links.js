// frontend/js/panel-links.js
// Añade enlaces y tarjetas con íconos SVG (sin librerías externas)
(function(){
  const ICONS = {
    clientes: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    cotizaciones: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2h8a2 2 0 0 1 2 2v14l-4-2-4 2V4a2 2 0 0 1 2-2z"/><path d="M9 7h6"/><path d="M9 11h6"/></svg>',
    facturacion: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h6"/></svg>',
    inventario: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="6" rx="1"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>'
  };

  function addNavLinks(){
    const nav = document.querySelector('.topnav') || document.querySelector('nav');
    if(!nav) return;
    const links = [
      { href:'clientes.html', text:'Clientes' },
      { href:'cotizaciones.html', text:'Cotizaciones' },
      { href:'facturacion.html', text:'Facturación' },
      { href:'inventario.html', text:'Inventario' },
    ];
    links.forEach(w => {
      if(!nav.querySelector(`a[href="${w.href}"]`)){
        const a = document.createElement('a'); a.href = w.href; a.textContent = w.text; nav.appendChild(a);
      }
    });
  }

  function addTiles(){
    let container = document.querySelector('#panel-atajos');
    if(!container){
      const main = document.querySelector('main') || document.body;
      container = document.createElement('section');
      container.id = 'panel-atajos';
      container.className = 'layout';
      container.style.marginTop = '16px';
      main.appendChild(container);
    }
    const tiles = [
      { href:'clientes.html', icon:ICONS.clientes, title:'Clientes', desc:'Crear, editar y buscar clientes.' },
      { href:'cotizaciones.html', icon:ICONS.cotizaciones, title:'Cotizaciones', desc:'Generar cotizaciones y exportar PDF/Word.' },
      { href:'facturacion.html', icon:ICONS.facturacion, title:'Facturación', desc:'Emitir facturas (CAI/RTN) y exportar PDF.' },
      { href:'inventario.html', icon:ICONS.inventario, title:'Inventario', desc:'Control de repuestos y productos.' },
    ];
    tiles.forEach(t => {
      if(container.querySelector(`a[href="${t.href}"]`)) return;
      const card = document.createElement('article');
      card.className = 'card';
      card.style.width = 'min(100%, 340px)';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <div class="logo-card" style="display:grid;place-items:center;width:42px;height:42px;border-radius:10px;border:1px solid var(--border)">${t.icon}</div>
          <h3 style="margin:6px 0">${t.title}</h3>
        </div>
        <p class="muted" style="margin-top:6px">${t.desc}</p>
        <div class="actions"><a class="btn-primary" href="${t.href}">Abrir</a></div>
      `;
      container.appendChild(card);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    try { addNavLinks(); addTiles(); } catch(e){ console.error('panel-links:', e); }
  });
})();
