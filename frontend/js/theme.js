// js/theme.js
(function () {
  // Evita doble init
  if (window.__themeInit) return;
  window.__themeInit = true;

  const KEY = 'THEME_PREF';
  const root = document.documentElement;

  function systemPrefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch { return false; }
  }
  function getSavedTheme() {
    const t = localStorage.getItem(KEY);
    return (t === 'light' || t === 'dark') ? t : null;
  }
  function getCurrentTheme() {
    return getSavedTheme() || (systemPrefersDark() ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', t);
    updateToggleUI(t);
  }

  function updateToggleUI(theme) {
    const iconTop = document.getElementById('themeIcon');
    if (iconTop) iconTop.textContent = (theme === 'dark') ? '☀️' : '🌙';

    const fabIcon = document.getElementById('themeFabIcon');
    if (fabIcon) fabIcon.textContent = (theme === 'dark') ? '☀️' : '🌙';

    const legacy = document.getElementById('themeToggle');
    if (legacy) legacy.title = 'Cambiar a modo ' + (theme === 'dark' ? 'Claro' : 'Oscuro');
  }

  function toggleTheme() {
    const next = (getCurrentTheme() === 'dark') ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  function wire(el) {
    if (el && !el.dataset.wired) {
      el.addEventListener('click', toggleTheme);
      el.dataset.wired = '1';
    }
  }

  function wireButtons() {
    wire(document.getElementById('btnThemeToggle')); // topbar
    wire(document.getElementById('themeToggle'));    // legacy (si existiera)
    const fab = document.getElementById('themeFab'); // público
    if (fab) wire(fab);
    document.querySelectorAll('[data-action="theme-toggle"]').forEach(wire);
  }

  function createFabIfNeeded() {
    // Solo crea FAB si NO hay topbar ni legacy
    if (document.getElementById('btnThemeToggle')) return;
    if (document.getElementById('themeToggle')) return;
    if (document.getElementById('themeFab')) return;

    const btn = document.createElement('button');
    btn.id = 'themeFab';
    btn.className = 'theme-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Cambiar tema');
    btn.innerHTML = `<span id="themeFabIcon" aria-hidden="true">🌙</span><span class="sr-only">Cambiar tema</span>`;
    document.body.appendChild(btn);
    wire(btn);
  }

  function reconcileButtons() {
    const hasTopbar = !!document.getElementById('btnThemeToggle');
    const fab = document.getElementById('themeFab');
    const legacy = document.getElementById('themeToggle');

    // Si hay topbar y también FAB, quita FAB
    if (hasTopbar && fab) fab.remove();

    // Si hay topbar y también legacy (botón suelto en la página), ocultar legacy
    if (hasTopbar && legacy) legacy.style.display = 'none';
  }

  function init() {
    if (!root.hasAttribute('data-theme')) root.setAttribute('data-theme', 'light');
    applyTheme(getCurrentTheme());

    wireButtons();
    createFabIfNeeded();
    reconcileButtons();
  }

  // Init normal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Reintentos tardíos
  window.addEventListener('load', () => {
    wireButtons();
    reconcileButtons();
    updateToggleUI(getCurrentTheme());
  });

  // Cuando topbar.js termine de inyectar el topbar
  document.addEventListener('topbar:loaded', () => {
    wireButtons();
    reconcileButtons();
    updateToggleUI(getCurrentTheme());
  });

  // Helpers de consola
  window.getTheme = () => getCurrentTheme();
  window.setTheme = (t) => { localStorage.setItem(KEY, (t === 'dark' ? 'dark' : 'light')); applyTheme(getCurrentTheme()); };
})();

