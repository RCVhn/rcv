"use strict";

const express = require("express");
const router = express.Router();

// ==== Controllers ====
const ctrl = require("../controllers/usuariosController");

// ==== Middlewares de auth/permiso ====
let requireAuth;
let requirePermissionFactory;

try {
  ({ requireAuth } = require("../middleware/requireAuth"));
} catch (e) {
  console.error("⚠️  No se pudo cargar middleware/requireAuth:", e.message);
  requireAuth = (_req, res, _next) =>
    res.status(503).json({ ok: false, error: "Auth middleware no disponible" });
}

try {
  ({ requirePermission: requirePermissionFactory } = require("../middleware/requirePermission"));
} catch (e) {
  console.error("⚠️  No se pudo cargar middleware/requirePermission:", e.message);
  requirePermissionFactory = (_slug) => (_req, res, _next) =>
    res.status(503).json({ ok: false, error: "Permissions middleware no disponible" });
}

// Health (sin auth) — poner SIEMPRE antes de rutas con params
router.get("/_alive", (_req, res) => res.json({ ok: true, mod: "usuarios" }));

// HEAD para healthchecks ligeros (útil con ALB/Cloud Run)
router.head("/", (_req, res) => res.status(200).end());

// Preflight CORS básico en este subrouter (por si no lo manejas globalmente)
router.options("*", (_req, res) => {
  // Nota: idealmente manejar esto en app.js con cors(), aquí es safe fallback.
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Actor, X-Actor-Usuario, X-Actor-Id, X-Requested-With",
    "Access-Control-Max-Age": "86400"
  });
  res.status(204).end();
});

// Helper: normaliza slugs "usuarios.admin" ⇄ "usuarios:admin"
const normalizePerm = (s) => String(s || "").replace(/\./g, ":");

// Guard requiere admin del módulo
const mustBeAdmin = [
  requireAuth,
  (req, res, next) => {
    // Forzamos a que el middleware mire el slug con ':'
    const rp = requirePermissionFactory(normalizePerm("usuarios.admin"));
    return rp(req, res, next);
  }
];

// Wrapper async
const wrap = (fn) => (req, res, next) => {
  try {
    const p = fn(req, res, next);
    if (p && typeof p.then === "function") p.catch(next);
  } catch (err) {
    next(err);
  }
};

// ====================== RUTAS Usuarios ======================
// Listado / creación
router.get("/",                              mustBeAdmin, wrap(ctrl.getUsuarios));
router.post("/",                             mustBeAdmin, wrap(ctrl.crearUsuario));

// Permisos / estado / pass / último acceso
router.put("/:id(\\d+)/permisos",            mustBeAdmin, wrap(ctrl.actualizarPermisos));
router.patch("/:id(\\d+)/estado",            mustBeAdmin, wrap(ctrl.actualizarEstado));
router.post("/:id(\\d+)/reset-password",     mustBeAdmin, wrap(ctrl.resetPassword));
router.post("/:id(\\d+)/ultimo-acceso",      mustBeAdmin, wrap(ctrl.marcarUltimoAcceso));

// CRUD by id
router.get("/:id(\\d+)",                     mustBeAdmin, wrap(ctrl.getUsuarioPorId));
router.put("/:id(\\d+)",                     mustBeAdmin, wrap(ctrl.actualizarUsuario));
router.delete("/:id(\\d+)",                  mustBeAdmin, wrap(ctrl.eliminarUsuario));

// ====================== RUTA Bitácora (lectura) ======================
//
// ⚠️ IMPORTANTE:
// El frontend llama a `/api/bitacora`. Si este router está montado en `/api/usuarios`,
// la siguiente línea intenta exponer `/api/bitacora` usando un path "relativo".
// En Express, los segmentos `..` NO se resuelven de forma nativa, por eso
// se usa el truco de generar "/bitacora" (que quedaría como "/api/usuarios/bitacora").
// Si quieres que responda exactamente en "/api/bitacora", mueve esta ruta al router
// principal montado en "/api" (o añade allí `app.get('/bitacora', ...)`).
//
// Opción 1 (conservando tu truco original):
router.get("/../bitacora".replace("..",""),  mustBeAdmin, wrap(ctrl.listarBitacora));

// Opción 2 (recomendada, en el router principal):
//  app.use('/api', require('./usuariosRoutes')); // aquí NO declares la bitácora
//  app.get('/api/bitacora', mustBeAdmin, wrap(ctrl.listarBitacora));

module.exports = router;
