// =====================================================
// global.js — utilidades comunes para la app RCV PWA
// =====================================================
(() => {
  // Namespace público
  const App = (window.App = window.App || {});

  // -------------------------------
  // Storage / Sesión de usuario
  // -------------------------------
  const LS_USUARIO = "usuarioActual";
  const LS_PAGINA_DESTINO = "paginaDestino";
  const LS_THEME = "theme"; // 'light' | 'dark' | 'auto'

  function getUsuarioActual() {
    try { return JSON.parse(localStorage.getItem(LS_USUARIO)) || null; }
    catch { return null; }
  }
  function setUsuarioActual(usuario) {
    if (usuario && typeof usuario === "object") {
      localStorage.setItem(LS_USUARIO, JSON.stringify(usuario));
    }
  }
  function clearUsuarioActual() { localStorage.removeItem(LS_USUARIO); }
  function getRolUsuarioActual() { return getUsuarioActual()?.rol || null; }
  function getNombreUsuarioActual() {
    const u = getUsuarioActual();
    return u?.nombre || u?.usuario || null;
  }

  // Proteger página privada: usa <body data-private="true">
  function protegerPagina() {
    const isPrivate = document.body?.dataset?.private === "true";
    if (!isPrivate) return;
    const usuario = getUsuarioActual();
    if (!usuario) {
      localStorage.setItem(LS_PAGINA_DESTINO, location.pathname.split("/").pop() || "index.html");
      location.href = "login.html";
    }
  }

  function redirigirAPaginaDestino() {
    const destino = localStorage.getItem(LS_PAGINA_DESTINO);
    if (destino) {
      localStorage.removeItem(LS_PAGINA_DESTINO);
      location.href = destino;
    }
  }

  // Permisos: page:xxx
  function hasPerm(key) {
    const u = getUsuarioActual();
    if (!u) return false;
    const rol = String(u.rol || "").toLowerCase();
    if (rol === "administrador") return true;
    const perms = Array.isArray(u.permisos) ? u.permisos.map(String) : [];
    return perms.includes(key) || perms.includes(`page:${key}`);
  }

  // -------------------------------
  // Event Bus simple
  // -------------------------------
  const bus = (() => {
    const map = new Map();
    return {
      on(evt, cb) {
        if (!map.has(evt)) map.set(evt, new Set());
        map.get(evt).add(cb);
        return () => map.get(evt)?.delete(cb);
      },
      off(evt, cb) { map.get(evt)?.delete(cb); },
      emit(evt, payload) {
        map.get(evt)?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error("[bus]", e); }
        });
      }
    };
  })();

  // -------------------------------
  // DOM helpers
  // -------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function on(el, evt, cb, opts) { el.addEventListener(evt, cb, opts); return () => el.removeEventListener(evt, cb, opts); }
  function delegate(root, evt, selector, handler) {
    return on(root, evt, (e) => {
      const t = e.target.closest(selector);
      if (t && root.contains(t)) handler(e, t);
    });
  }

  // -------------------------------
  // Utils
  // -------------------------------
  const wait = (ms) => new Promise(res => setTimeout(res, ms));
  function debounce(fn, ms = 300) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function throttle(fn, ms = 200) {
    let last = 0, timer = null, lastArgs;
    return function (...args) {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, args); }
      else {
        lastArgs = args;
        if (!timer) timer = setTimeout(() => { last = Date.now(); timer = null; fn.apply(this, lastArgs); }, ms - (now - last));
      }
    };
  }
  const uuid = () => crypto?.randomUUID?.() || ("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8); return v.toString(16);
  }));
  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  function formatCurrency(n, { currency = "MXN", locale = "es-MX" } = {}) {
    const val = typeof n === "number" ? n : (parseFloat(String(n).replace(/,/g, ".")) || 0);
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(val);
  }
  function formatDate(date, { locale = "es-MX", withTime = false } = {}) {
    const d = (date instanceof Date) ? date : new Date(date);
    const opts = withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { year: "numeric", month: "2-digit", day: "2-digit" };
    return new Intl.DateTimeFormat(locale, opts).format(d);
  }

  // -------------------------------
  // Fetch API con token (JSON)
  // -------------------------------

  // Cambios mínimos: base de API dinámica y sincronizada
  function __getAPIBase() {
    const lc = localStorage.getItem('API_BASE') || '';
    const w  = window.API_BASE || '';
    const base = lc || w || '';
    if (!w && lc) window.API_BASE = lc; // sincroniza si window no tenía valor
    return base;
  }

  async function apiFetch(path, { method = "GET", headers = {}, body, json = true, auth = true, cache = "no-store" } = {}) {
    const base = __getAPIBase();
    const url = path.startsWith("http") ? path : (base + path);
    const token = auth ? (getUsuarioActual()?.token || null) : null;
    const hdrs = new Headers(headers);
    if (json) hdrs.set("Content-Type", "application/json");
    if (token) hdrs.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, {
      method,
      headers: hdrs,
      body: json && body && typeof body !== "string" ? JSON.stringify(body) : body,
      cache,
    });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error((data && data.message) || `HTTP ${res.status}`);
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  }
  const api = {
    get: (p, o) => apiFetch(p, { ...(o || {}), method: "GET" }),
    post: (p, b, o) => apiFetch(p, { ...(o || {}), method: "POST", body: b }),
    put: (p, b, o) => apiFetch(p, { ...(o || {}), method: "PUT", body: b }),
    del: (p, o) => apiFetch(p, { ...(o || {}), method: "DELETE" }),
  };

  // -------------------------------
  // Toasts y modales (fallback)
  // -------------------------------
  function mostrarToast(msg, tipo = "info", title = "") {
    // Si existe la implementación global, úsala
    if (typeof window.mostrarToast === "function" && window.mostrarToast !== mostrarToast) {
      return window.mostrarToast(msg, tipo, title);
    }
    // Fallback mínimo
    console[tipo === "error" ? "error" : "log"](`[${tipo.toUpperCase()}] ${title ? title + ": " : ""}${msg}`);
  }

  function infoModal(titulo, html) {
    if (typeof window.infoModal === "function" && window.infoModal !== infoModal) {
      return window.infoModal(titulo, html);
    }
    alert(`${titulo}\n\n${html?.replace?.(/<[^>]*>/g, '') || ""}`);
    return Promise.resolve();
  }

  function confirmModal(pregunta = "¿Confirmas?") {
    if (typeof window.confirmModal === "function" && window.confirmModal !== confirmModal) {
      return window.confirmModal(pregunta);
    }
    return Promise.resolve(confirm(pregunta));
  }

  // -------------------------------
  // Tema (light / dark / auto)
  // -------------------------------
  const mqlDark = window.matchMedia?.("(prefers-color-scheme: dark)");
  function applyTheme(theme) {
    const html = document.documentElement;
    let effective = theme;
    if (theme === "auto") effective = mqlDark?.matches ? "dark" : "light";
    html.setAttribute("data-theme", effective === "dark" ? "" : "light"); // tu CSS usa :root para dark y html[data-theme="light"] para claro

    // Actualiza meta theme-color con el color de fondo real
    try {
      const style = getComputedStyle(html);
      const bg = style.getPropertyValue("--bg")?.trim() || "#ffffff";
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", bg);
    } catch {}
  }
  function setTheme(theme = "auto") {
    localStorage.setItem(LS_THEME, theme);
    applyTheme(theme);
    bus.emit("theme:change", theme);
  }
  function getTheme() { return localStorage.getItem(LS_THEME) || "auto"; }

  // Reaccionar a cambios del SO si está en auto
  mqlDark?.addEventListener?.("change", () => {
    if (getTheme() === "auto") applyTheme("auto");
  });

  // -------------------------------
  // PWA: Service Worker
  // -------------------------------
  // global.js — reemplaza tu registerSW por esta
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      // ajusta la ruta si tu sw.js vive en otra carpeta
      const reg = await navigator.serviceWorker.register('/frontend/sw.js', { scope: '/frontend/' });
      console.log('[PWA] SW registrado:', reg.scope);
      return reg;
    } catch (e) {
      console.error('❌ Error registrando SW:', e);
      if (typeof mostrarToast === 'function') {
        mostrarToast('No se pudo registrar el Service Worker', 'error');
      }
    }
  }


  // -------------------------------
  // Scroll to top en cada carga
  // -------------------------------
  (function enforceTopScroll() {
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      const goTop = () => setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }), 0);
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", goTop, { once: true });
      } else {
        goTop();
      }
      window.addEventListener("pageshow", (e) => { if (e.persisted) goTop(); });
    } catch {}
  })();

  // -------------------------------
  // Auto-init
  // -------------------------------
  (function init() {
    // Tema
    applyTheme(getTheme());

    // Proteger página si es privada
    protegerPagina();

    // SW (opcional): comenta si lo registras inline en cada HTML
    registerSW("sw.js");
  })();

  // -------------------------------
  // API pública
  // -------------------------------
  Object.assign(App, {
    // sesión
    getUsuarioActual, setUsuarioActual, clearUsuarioActual,
    getRolUsuarioActual, getNombreUsuarioActual,
    protegerPagina, redirigirAPaginaDestino, hasPerm,
    // bus / dom
    bus, $, $$, on, delegate,
    // utils
    wait, debounce, throttle, uuid, clamp, formatCurrency, formatDate,
    // api
    api, apiFetch,
    // tema
    setTheme, getTheme, applyTheme,
    // pwa
    registerSW,
    // ui helpers
    mostrarToast, infoModal, confirmModal,
  });

  // Señal de listo
  document.dispatchEvent(new CustomEvent("global:ready"));
})();

// ===== Auto-config de API_BASE al cambiar de red (no toca producción) =====
(() => {
  try {
    const guardada = (localStorage.getItem('API_BASE') || '').trim();
    const host = location.hostname; // ej: 127.0.0.1 o 192.168.x.x
    const esPrivada = /^localhost$|^127\.0\.0\.1$|^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1]))\./.test(host);
    const sugerida = esPrivada ? `http://${host}:3001/api` : guardada;

    const hostDe = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
    const distintaPrivada = esPrivada && guardada && hostDe(guardada) !== host && /^http:/.test(guardada);

    if (!guardada || distintaPrivada) {
      localStorage.setItem('API_BASE', sugerida);
      window.API_BASE = sugerida;            // <-- sincroniza con window
      console.log('[API_BASE] ->', sugerida);
      if (!sessionStorage.getItem('api_reload_done')) {
        sessionStorage.setItem('api_reload_done', '1');
        window.__requestAppReload?.(150) || location.reload();
      }
    }
  } catch (e) {
    console.warn('[API_BASE auto]', e);
  }
})();

// ===== Banner de diagnóstico (API_BASE / usuario / token) =====
(() => {
  try {
    const h = location.hostname;
    const esPriv = /^localhost$|^127\.0\.0\.1$|^(192\.168|10\.|172\.(1[6-9]|2\d|3[0-1]))\./.test(h);
    if (!esPriv) return; // solo en entornos locales

    const base = `http://${h}:3001/api`;
    const guardada = localStorage.getItem('API_BASE');
    if (guardada !== base) {
      localStorage.setItem('API_BASE', base);
      window.API_BASE = base;                // <-- sincroniza con window
      sessionStorage.removeItem('api_reload_done');
      (window.__requestAppReload?.(150) || location.reload());
    }
  } catch (e) {
    console.warn('[AutoSync API_BASE]', e);
  }
})();
