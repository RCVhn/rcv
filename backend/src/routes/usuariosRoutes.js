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

// Helper
const mustBeAdmin = [requireAuth, requirePermissionFactory("usuarios.admin")];
const wrap = (fn) => (req, res, next) => {
  try { const p = fn(req, res, next); if (p && typeof p.then === "function") p.catch(next); }
  catch (err) { next(err); }
};

// Listado / creación
router.get("/",                mustBeAdmin, wrap(ctrl.getUsuarios));
router.post("/",               mustBeAdmin, wrap(ctrl.crearUsuario));

// Permisos / estado / pass / último acceso
router.put("/:id(\\d+)/permisos",        mustBeAdmin, wrap(ctrl.actualizarPermisos));
router.patch("/:id(\\d+)/estado",        mustBeAdmin, wrap(ctrl.actualizarEstado));
router.post("/:id(\\d+)/reset-password", mustBeAdmin, wrap(ctrl.resetPassword));
router.post("/:id(\\d+)/ultimo-acceso",  mustBeAdmin, wrap(ctrl.marcarUltimoAcceso));

// CRUD by id
router.get("/:id(\\d+)",      mustBeAdmin, wrap(ctrl.getUsuarioPorId));
router.put("/:id(\\d+)",      mustBeAdmin, wrap(ctrl.actualizarUsuario));
router.delete("/:id(\\d+)",   mustBeAdmin, wrap(ctrl.eliminarUsuario));

module.exports = router;
