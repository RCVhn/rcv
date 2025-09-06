"use strict";

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bitacoraController');
const { requirePermission } = require('../middleware/requirePermission');

// Health sin permisos
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'bitacora' }));

// Permiso mínimo para ver
router.use(requirePermission('bitacora.view'));

// GET / (ver)
router.get('/', ctrl.getBitacora);

// POST / (crear) — requiere editar
router.post('/', requirePermission('bitacora.edit'), ctrl.crearBitacora);

module.exports = router;
