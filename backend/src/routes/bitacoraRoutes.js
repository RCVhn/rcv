// backend/src/routes/bitacoraRoutes.js
"use strict";

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/bitacoraController");
const { requireAuth } = require("../middleware/requireAuth");
const { requirePermission } = require("../middleware/requirePermission");

// Health sin permisos
router.get("/_alive", (_req, res) => res.json({ ok: true, mod: "bitacora" }));

router.use(requireAuth);

// GET /api/bitacora  -> requiere permiso de lectura
router.get("/", requirePermission("bitacora:leer"), ctrl.getBitacora);

// POST /api/bitacora -> requiere permiso de edición
router.post("/", requirePermission("bitacora:editar"), ctrl.crearBitacora);

module.exports = router;
