// js/toast.js
(function(){
  'use strict';

  if (window.showToast) return;

  function ensureContainer(){
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      document.body.appendChild(c);
    }
    return c;
  }

  function classByType(tipo){
    switch ((tipo||'').toLowerCase()) {
      case 'success': return 'toast toast--success';
      case 'warning': return 'toast toast--warning';
      case 'error':   return 'toast toast--error';
      default:        return 'toast';
    }
  }

  window.showToast = function(tipo, mensaje, ms){
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = classByType(tipo);
    el.innerHTML = `<strong class="toast__title">${tipo||'info'}</strong>${mensaje||''}`;
    container.appendChild(el);

    // animar entrada
    requestAnimationFrame(()=> el.classList.add('show'));

    const timeout = Number.isFinite(ms) ? ms : 3200;
    const timer = setTimeout(close, timeout);
    el.addEventListener('click', close);

    function close(){
      clearTimeout(timer);
      el.classList.remove('show');
      setTimeout(()=> el.remove(), 180);
    }
  };
})();

