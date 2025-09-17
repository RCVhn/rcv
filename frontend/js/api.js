"use strict";

/* ========= Descubrimiento de API_BASE =========
   Orden de prioridad:
   1) localStorage.API_BASE
   2) <meta name="rcv-api" content="...">
   3) fallback de Cloud Run
*/
const META_API = (document.querySelector('meta[name="rcv-api"]')?.content || "").trim();
const LS_API   = (localStorage.getItem("API_BASE") || "").trim();

const API_BASE = (LS_API || META_API || "https://rcv-api-nulp72qabq-uc.a.run.app/api")
  .replace(/\/+$/, ""); // sin slash final

// === Auth token (JWT) ===
let authToken =
  localStorage.getItem("authToken") || localStorage.getItem("token") || null;

function setAuthToken(token) {
  authToken = token || null;
  if (authToken) {
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("token", authToken); // compat
  } else {
    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
  }
}

function getActor() {
  try {
    const u = JSON.parse(localStorage.getItem("usuarioActual"));
    return (u && (u.usuario || u.nombre)) || "sistema";
  } catch {
    return "sistema";
  }
}

/* ========= Core fetch (timeout, JSON, token refresh, headers X-Actor) ========= */
async function apiFetch(
  path,
  { method = "GET", body, headers = {}, timeoutMs = 12000 } = {}
) {
  const isAbsolute = /^https?:\/\//i.test(path);
  const normPath = isAbsolute ? path : API_BASE + (String(path).startsWith("/") ? path : "/" + path);

  const h = {
    Accept: "application/json",
    ...headers,
  };

  // Token (si existe)
  const token =
    authToken ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("token");
  if (token) h["Authorization"] = `Bearer ${token}`;

  // Actores
  let actorNombre = "sistema";
  let actorRol = "usuario";
  try {
    const ua = JSON.parse(localStorage.getItem("usuarioActual") || "{}");
    actorNombre = ua.usuario || ua.nombre || actorNombre;
    actorRol = ua.rol || actorRol;
  } catch {}
  h["X-Actor"] = actorNombre;
  h["X-Actor-Usuario"] = actorNombre;
  h["X-Actor-Rol"] = actorRol;
  h["X-Requested-With"] = h["X-Requested-With"] || "fetch";

  // Tipado de body (JSON por defecto salvo FormData/Blob/ArrayBuffer)
  const isFormLike =
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer);

  if (body != null && !h["Content-Type"] && !isFormLike) {
    h["Content-Type"] = "application/json";
  }
  const payload =
    body == null
      ? undefined
      : isFormLike
      ? body
      : typeof body === "string"
      ? body
      : JSON.stringify(body);

  // Timeout
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(normPath, {
      method,
      headers: h,
      mode: "cors",
      credentials: "omit", // usamos JWT, no cookies
      body: payload,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (netErr) {
    clearTimeout(timer);
    if (netErr && netErr.name === "AbortError") {
      throw new Error("La solicitud tardó demasiado (timeout).");
    }
    throw new Error("No se pudo conectar con el servidor");
  } finally {
    clearTimeout(timer);
  }

  // Token refresh por header (servidor expone x-token-refresh)
  const refresh = res.headers.get("x-token-refresh") || res.headers.get("X-Token-Refresh");
  if (refresh) setAuthToken(refresh);

  // Parse de respuesta
  const text = await res.text();
  const contentType = (res.headers.get("Content-Type") || "").toLowerCase();
  let data;
  if (!text) {
    data = {};
  } else if (contentType.includes("application/json")) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  } else {
    data = text;
  }

  if (!res.ok) {
    const msgFromBody =
      (data && (data.error || data.message || data.msg)) || null;
    const msg = msgFromBody || `Error ${res.status} ${res.statusText || ""}`.trim();
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return typeof data === "string" && !contentType.includes("application/json")
    ? { raw: data }
    : data;
}

/* ========= API: Auth ========= */
const AuthAPI = {
  async login(usuario, password) {
    const out = await apiFetch("/auth/login", {
      method: "POST",
      body: { usuario, password },
    });
    if (out?.token) setAuthToken(out.token);
    if (out?.user) {
      localStorage.setItem("usuarioActual", JSON.stringify(out.user));
    }
    return out;
  },
  async verify() {
    try {
      return await apiFetch("/auth/verify", { method: "GET" });
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("Error 404") || msg.toLowerCase().includes("not found"))
        return null;
      throw e;
    }
  },
  logout() {
    setAuthToken(null);
    localStorage.removeItem("usuarioActual");
  },
};

/* ========= API: Usuarios ========= */
const UsuariosAPI = {
  listar(q = "") {
    return apiFetch(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  },
  obtener(id) {
    return apiFetch(`/usuarios/${id}`);
  },
  crear(data) {
    return apiFetch(`/usuarios`, { method: "POST", body: data });
  },
  actualizar(id, data) {
    return apiFetch(`/usuarios/${id}`, { method: "PUT", body: data });
  },
  estado(id, estado) {
    return apiFetch(`/usuarios/${id}/estado`, { method: "PATCH", body: { estado } });
  },
  resetPass(id, nueva) {
    const body = nueva === undefined || nueva === null ? {} : { nueva };
    return apiFetch(`/usuarios/${id}/reset-password`, { method: "POST", body });
  },
  eliminar(id) {
    return apiFetch(`/usuarios/${id}`, { method: "DELETE" });
  },
  actualizarPermisos(id, permisos) {
    return apiFetch(`/usuarios/${id}/permisos`, { method: "PUT", body: { permisos } });
  },
};

/* ========= API: Bitácora ========= */
const BitacoraAPI = {
  listar(usuario = "") {
    const qs = usuario ? `?usuario=${encodeURIComponent(usuario)}` : "";
    return apiFetch(`/bitacora${qs}`);
  },
};

/* ========= Exponer ========= */
window.API_BASE = API_BASE;
window.API = { AuthAPI, UsuariosAPI, BitacoraAPI, setAuthToken, apiFetch };
