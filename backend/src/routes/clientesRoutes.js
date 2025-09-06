"use strict";

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientesController');
const { requirePermission } = require('../middleware/requirePermission');

// Health — antes de params
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'clientes' }));

// Lecturas
router.use(requirePermission('clientes.view'));
router.get('/', ctrl.getClientes);
router.get('/:id(\\d+)', ctrl.getCliente);

// Escrituras
router.post('/', requirePermission('clientes.edit'), ctrl.crearCliente);
router.put('/:id(\\d+)', requirePermission('clientes.edit'), ctrl.actualizarCliente);
router.delete('/:id(\\d+)', requirePermission('clientes.edit'), ctrl.eliminarCliente);

module.exports = router;
