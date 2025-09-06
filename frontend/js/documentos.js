/* eslint-env browser */
/* global showToast, renderTopbar */

(function () {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const API = localStorage.getItem('API_BASE') || 'http://localhost:3001/api';

  const el = {
    buscar: $('#txtBuscar'),
    btnBuscar: $('#btnBuscar'),
    tbody: $('#tblDocs tbody'),
  };

  function money(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  }

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });

    // Intenta parsear como JSON; si viene HTML (404/500), lanza error legible
    let data = null;
    try {
      data = await res.json();
    } catch {
      const raw = await res.text();
      const err = new Error('Respuesta no-JSON del servidor');
      err.status = res.status;
      err.raw = raw;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data?.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function cargar(q = '') {
    try {
      const url = `${API}/documentos${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const list = await fetchJSON(url);
      el.tbody.innerHTML = '';

      list.forEach((d) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${d.fecha_emision || ''}</td>
          <td>${d.tipo || ''}</td>
          <td>${d.correlativo || ''}</td>
          <td class="right">L. ${money(d.total)}</td>
          <td><span class="pill">${d.estado || ''}</span></td>
          <td>
            <div class="actions">
              <button class="ver">Imprimir</button>
              <button class="nc">Nota Crédito</button>
              <button class="nd">Nota Débito</button>
              <button class="anular">Anular</button>
            </div>
          </td>
        `;
        tr.dataset.id = String(d.id);
        el.tbody.appendChild(tr);
        bindRow(tr);
      });

      if (list.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" class="muted">Sin resultados</td>`;
        el.tbody.appendChild(tr);
      }
    } catch (e) {
      const msg =
        e?.data?.error ||
        (e?.status ? `HTTP ${e.status}` : e?.message) ||
        'Error cargando documentos';
      showToast(msg, 'error');
    }
  }

  function bindRow(tr) {
    $('.ver', tr)?.addEventListener('click', () => verImprimir(tr.dataset.id));
    $('.nc', tr)?.addEventListener('click', () => crearNota('NC', tr.dataset.id));
    $('.nd', tr)?.addEventListener('click', () => crearNota('ND', tr.dataset.id));
    $('.anular', tr)?.addEventListener('click', () => anular(tr.dataset.id));
  }

  async function anular(id) {
    if (!id) return;
    if (!confirm('¿Anular este documento?')) return;
    try {
      await fetchJSON(`${API}/documentos/${encodeURIComponent(id)}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: 'Anulación desde UI' }),
      });
      showToast('Documento anulado', 'success');
      await cargar(el.buscar.value.trim());
    } catch (e) {
      showToast(e?.data?.error || 'No se pudo anular', 'error');
    }
  }

  // ✅ Abre el HTML imprimible del backend
  async function verImprimir(id) {
  if (!id) return;
  const logo = encodeURIComponent(localStorage.getItem('LOGO_URL') || '');
  const url  = `${API}/documentos/${encodeURIComponent(id)}/print${logo ? `?logo=${logo}` : ''}`;
  const w = window.open(url, '_blank');
  if (!w) showToast('Habilita las ventanas emergentes para imprimir', 'warning');
}


  function crearNota(tipo, id) {
    if (!id) return;
    location.href = `notas.html?tipo=${encodeURIComponent(tipo)}&ref=${encodeURIComponent(id)}`;
  }

  function init() {
    try {
      if (typeof renderTopbar === 'function') renderTopbar();
    } catch { /* no-op */ }

    el.btnBuscar?.addEventListener('click', () => cargar(el.buscar.value.trim()));
    el.buscar?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cargar(el.buscar.value.trim());
    });

    cargar('');
  }

  document.addEventListener('DOMContentLoaded', init);
})();

