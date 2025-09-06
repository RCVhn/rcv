// js/common-toast.js
(function () {
  'use strict';

  const ensureContainer = () => {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  };

  function createToast({ title = '', message = '', type = 'info', duration = 3000, dismissible = true } = {}) {
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const closeBtn = dismissible ? `<button class="toast-close" aria-label="Cerrar">×</button>` : '';
    const ttl = title ? `<div class="toast-title">${title}</div>` : '';
    const msg = message ? `<div class="toast-msg">${message}</div>` : '';

    el.innerHTML = `
      <div class="toast-content">
        ${ttl}${msg}
      </div>
      ${closeBtn}
    `;

    container.appendChild(el);

    const remove = () => {
      el.style.animation = 'toast-out .18s ease-in forwards';
      setTimeout(() => el.remove(), 180);
    };

    if (dismissible) {
      el.querySelector('.toast-close').addEventListener('click', remove);
    }

    if (duration > 0) {
      setTimeout(remove, duration);
    }
  }

  const Toast = {
    show(message, type = 'info', opts = {}) {
      createToast({ message, type, ...opts });
    },
    info(message, opts = {}) { createToast({ message, type: 'info', ...opts }); },
    success(message, opts = {}) { createToast({ message, type: 'success', ...opts }); },
    warning(message, opts = {}) { createToast({ message, type: 'warning', ...opts }); },
    error(message, opts = {}) { createToast({ message, type: 'error', ...opts }); },
    // con título
    withTitle(title, message, type = 'info', opts = {}) { createToast({ title, message, type, ...opts }); }
  };

  window.Toast = Toast;
})();

