// frontend/js/ui/topbar.js
(function () {
  'use strict';

  const MENU = [
    { text: 'Panel',        href: 'admin.html',       perm: 'dashboard.view' },
    { text: 'Clientes',     href: 'clientes.html',    perm: 'clientes.view' },
    { text: 'Vehículos',    href: 'vehiculos.html',   perm: 'vehiculos.view' },
    { text: 'Órdenes',      href: 'ordenes.html',     perm: 'ordenes.view' },
    { text: 'Cotizaciones', href: 'cotizaciones.html',perm: 'cotizaciones.view' },
    { text: 'Facturación',  href: 'facturacion.html', perm: 'facturacion.view' },
    { text: 'Inventario',   href: 'inventario.html',  perm: 'inventario.view' },
    { text: 'Kardex',       href: 'kardex.html',      perm: 'kardex.view' },
    { text: 'Calidad',      href: 'calidad.html',     perm: 'calidad.view' },
    { text: 'Reportes',     href: 'reportes.html',    perm: 'reportes.view' },
    { text: 'Usuarios',     href: 'usuarios.html',    perm: 'usuarios.admin' },
    { text: 'Ajustes',      href: 'ajustes.html',     perm: 'ajustes.view' },
  ];

  function activeClass(href) {
    const here = location.pathname.split('/').pop() || 'admin.html';
    return here === href ? 'class="active"' : '';
  }

  function buildTopbar(perms) {
    const cont = document.getElementById('topbar');
    if (!cont) return;

    const items = MENU
      .filter(i => perms.has(i.perm))
      .map(i => `<a ${activeClass(i.href)} href="${i.href}">${i.text}</a>`)
      .join('');

    cont.innerHTML = `
      <header class="topbar">
        <div class="brand">Servicios Mecánicos RCV</div>
        <nav class="topnav">${items}</nav>
        <div class="topbar-actions">
          <button id="btnLogout" class="btn-ghost">Cerrar sesión</button>
          <button id="themeToggle" class="btn-ghost">Modo</button>
        </div>
      </header>
    `;

    // Wire básico (si ya lo tienes en otro lado, omite)
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', () => {
      localStorage.removeItem('AUTH_USER_JSON');
      location.href = 'login.html';
    });
  }

  window.Topbar = { build: buildTopbar };
})();
