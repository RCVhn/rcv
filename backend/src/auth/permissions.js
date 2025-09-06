// backend/src/auth/permissions.js
"use strict";

/**
 * === Lista de permisos (slugs canónicos con ".") ===
 * Mantén esta lista como "fuente de verdad".
 */
const PERMISSIONS = [
  // Base / navegación
  "dashboard.view",

  // Clientes / Vehículos / Órdenes / Cotizaciones
  "clientes.view", "clientes.edit",
  "vehiculos.view", "vehiculos.edit",
  "ordenes.view",  "ordenes.edit",
  "cotizaciones.view", "cotizaciones.edit",

  // Facturación
  "facturacion.view", "facturacion.emitir",

  // Inventario (productos, items, catálogo)
  "inventario.view", "inventario.edit",

  // Reportes
  "reportes.view",

  // Kardex
  "kardex.view",

  // Control de calidad
  "calidad.view", "calidad.edit",

  // Administración de usuarios / Ajustes
  "usuarios.admin",
  "ajustes.view",

  // Gastos y Bitácora
  "gastos.view", "gastos.edit",
  "bitacora.view", "bitacora.edit",
];

/**
 * === Permisos por rol (usa slugs canónicos) ===
 * Claves válidas tras normalización: administrador, recepcion, mecanico, gerencia,
 * control_calidad, bodega
 */
const ROLE_PERMISSIONS = {
  administrador: [...PERMISSIONS], // todo

  recepcion: [
    "dashboard.view",
    "clientes.view", "clientes.edit",
    "vehiculos.view", "vehiculos.edit",
    "ordenes.view", "ordenes.edit",
    "cotizaciones.view", "cotizaciones.edit",
    "facturacion.view", "facturacion.emitir",
    "kardex.view",
    "bitacora.view",
  ],

  mecanico: [
    "dashboard.view",
    "ordenes.view", "ordenes.edit",
    "kardex.view",
    "bitacora.view", "bitacora.edit",
  ],

  gerencia: [
    "dashboard.view",
    "reportes.view",
    "inventario.view",
    "cotizaciones.view",
    "facturacion.view",
    "clientes.view",
    "vehiculos.view",
    "gastos.view", "gastos.edit",
    "bitacora.view", "bitacora.edit",
  ],

  control_calidad: [
    "dashboard.view",
    "calidad.view", "calidad.edit",
    "ordenes.view",
    "kardex.view",
    "bitacora.view", "bitacora.edit",
  ],

  bodega: [
    "dashboard.view",
    "inventario.view", "inventario.edit",
    "kardex.view",
  ],
};

/** Aliases de rol comunes → clave canónica del objeto ROLE_PERMISSIONS */
const ROLE_ALIASES = {
  admin: "administrador",
  administrador: "administrador",
  "super admin": "administrador",
  recepcion: "recepcion",
  recepcionista: "recepcion",
  mecanico: "mecanico",
  mecánico: "mecanico",
  gerente: "gerencia",
  gerencia: "gerencia",
  "control de calidad": "control_calidad",
  control_calidad: "control_calidad",
  bodega: "bodega",
};

function normalizeRole(rol) {
  const key = String(rol || "").trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
}

/** Aliases de permisos (soporta formato viejo con ":" y verbos en español) */
const VERB_MAP = { ver: "view", leer: "view", editar: "edit", crear: "edit" };
const PERM_ALIASES = new Map([
  ["usuarios:admin", "usuarios.admin"],
  ["bitacora:leer", "bitacora.view"],
  ["bitacora:editar", "bitacora.edit"],
  ["clientes:ver", "clientes.view"],
  ["clientes:editar", "clientes.edit"],
  ["vehiculos:ver", "vehiculos.view"],
  ["vehiculos:editar", "vehiculos.edit"],
  ["ordenes:ver", "ordenes.view"],
  ["ordenes:editar", "ordenes.edit"],
  ["cotizaciones:ver", "cotizaciones.view"],
  ["cotizaciones:editar", "cotizaciones.edit"],
  ["inventario:ver", "inventario.view"],
  ["inventario:editar", "inventario.edit"],
  ["reportes:ver", "reportes.view"],
  ["kardex:ver", "kardex.view"],
  ["calidad:ver", "calidad.view"],
  ["calidad:editar", "calidad.edit"],
  ["gastos:ver", "gastos.view"],
  ["gastos:editar", "gastos.edit"],
  ["facturacion:emitir", "facturacion.emitir"],
  ["dashboard:view", "dashboard.view"],
]);

function normalizePerm(p) {
  const raw = String(p || "").trim();
  if (!raw) return "";
  if (raw === "*" || raw.toLowerCase() === "all") return "*";
  if (PERM_ALIASES.has(raw)) return PERM_ALIASES.get(raw);
  if (raw.includes(":")) {
    const [m, v] = raw.split(":");
    const verb = VERB_MAP[(v || "").toLowerCase()] || (v || "").toLowerCase();
    return `${m}.${verb}`;
  }
  return raw;
}

/** Convierte string/JSON/array en array seguro */
function parseExtras(extras) {
  if (Array.isArray(extras)) return extras;
  if (!extras) return [];
  try {
    return JSON.parse(extras);
  } catch {
    return String(extras)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }
}

/**
 * Calcula permisos efectivos a partir de rol + extras.
 * Devuelve un Set (sin duplicados).
 * - Rol "administrador" o extra "*" / "all" → todos los PERMISSIONS.
 */
function getEffectivePermissions(user = {}) {
  const roleKey = normalizeRole(user.rol);
  const base = new Set(ROLE_PERMISSIONS[roleKey] || []);

  const extras = parseExtras(user.permisos_extras);
  if (extras.some(e => String(e).trim() === "*" || String(e).toLowerCase().trim() === "all")) {
    PERMISSIONS.forEach(p => base.add(p));
    return base;
  }
  for (const raw of extras) {
    const p = normalizePerm(raw);
    if (!p) continue;
    if (p === "*") {
      PERMISSIONS.forEach(x => base.add(x));
    } else {
      base.add(p);
    }
  }
  return base;
}

/** Helper opcional: verificar permiso contra un Set o array */
function hasPermission(effective, perm) {
  const p = normalizePerm(perm);
  if (!p) return false;
  const set = effective instanceof Set ? effective : new Set(effective || []);
  return set.has(p) || set.has("*");
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  getEffectivePermissions,
  parseExtras,
  normalizePerm,
  normalizeRole,
  hasPermission,
};
