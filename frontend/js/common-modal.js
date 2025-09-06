// js/common-modal.js
(function () {
  'use strict';

  // Inserta el HTML del modal una sola vez
  function injectModal() {
    if (document.getElementById('appModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'appModal';
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal__backdrop" data-close="1"></div>
      <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
        <div class="modal__header">
          <h3 class="modal__title" id="appModalTitle">Título</h3>
          <button class="modal__close" id="appModalClose" title="Cerrar">✕</button>
        </div>
        <div class="modal__sub" id="appModalSubtitle" style="display:none"></div>
        <div class="modal__body" id="appModalBody"></div>
        <div class="modal__footer" id="appModalFooter" style="display:none"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    // Cerrar por backdrop o botón
    wrap.addEventListener('click', (e) => {
      if (e.target.dataset.close === '1') Modal.close();
    });
    document.getElementById('appModalClose').onclick = Modal.close;
  }

  // API pública
  const Modal = {
    open({ title = '', html = '', sub = '', footer = '' } = {}) {
      injectModal();
      const root = document.getElementById('appModal');
      document.getElementById('appModalTitle').textContent = title || '';
      const subEl = document.getElementById('appModalSubtitle');
      if (sub) { subEl.textContent = sub; subEl.style.display = ''; }
      else { subEl.textContent = ''; subEl.style.display = 'none'; }
      document.getElementById('appModalBody').innerHTML = html || '';
      const footEl = document.getElementById('appModalFooter');
      if (footer) { footEl.innerHTML = footer; footEl.style.display = ''; }
      else { footEl.innerHTML = ''; footEl.style.display = 'none'; }
      root.classList.add('open');
      root.setAttribute('aria-hidden', 'false');
    },
    close() {
      const root = document.getElementById('appModal');
      if (!root) return;
      root.classList.remove('open');
      root.setAttribute('aria-hidden', 'true');
    },
    // Modal de confirmación rápido (opcional)
    confirm({ title = 'Confirmar', message = '¿Continuar?', okText = 'Aceptar', cancelText = 'Cancelar' } = {}) {
      return new Promise((resolve) => {
        const footer = `
          <button class="btn btn-primary" id="appModalOk">${okText}</button>
          <button class="btn" id="appModalCancel">${cancelText}</button>
        `;
        Modal.open({ title, html: `<p>${message}</p>`, footer });
        const ok = document.getElementById('appModalOk');
        const cancel = document.getElementById('appModalCancel');
        ok.onclick = () => { Modal.close(); resolve(true); };
        cancel.onclick = () => { Modal.close(); resolve(false); };
      });
    }
  };

  // expone global
  window.Modal = Modal;
})();

