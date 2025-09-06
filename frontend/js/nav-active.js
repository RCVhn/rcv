// js/nav-active.js
(function(){
  'use strict';

  function basename(path){
    if (!path) return '';
    return path.split('/').filter(Boolean).pop() || 'index.html';
  }

  // quita hash/query, normaliza, y admite href absolutos o relativos
  function normalizarHref(href){
    try {
      // Si es URL absoluta, tomar solo el pathname
      if (/^https?:\/\//i.test(href)) {
        href = new URL(href).pathname;
      }
      href = href.split('#')[0].split('?')[0].trim();

      // quitar './' inicial
      href = href.replace(/^\.\//, '');

      // si termina en '/', asumir index.html
      if (href.endsWith('/')) href += 'index.html';

      // comparar por nombre de archivo
      return basename(href).toLowerCase();
    } catch {
      return (href || '').toLowerCase();
    }
  }

  function normalizarActual(){
    try {
      const file = basename(window.location.pathname);
      return (file || 'index.html').toLowerCase();
    } catch {
      return 'index.html';
    }
  }

  function marcarActivo(){
    const actual = normalizarActual();
    const actualSinExt = actual.replace(/\.[a-z0-9]+$/i, '');

    document.querySelectorAll('.topnav a[href]').forEach(a=>{
      const hrefNorm = normalizarHref(a.getAttribute('href') || '');
      const hrefSinExt = hrefNorm.replace(/\.[a-z0-9]+$/i, '');
      const esActivo = (hrefNorm === actual) || (hrefSinExt === actualSinExt);
      a.classList.toggle('active', esActivo);
    });
  }

  document.addEventListener('DOMContentLoaded', marcarActivo);
  window.addEventListener('popstate', marcarActivo);
})();

