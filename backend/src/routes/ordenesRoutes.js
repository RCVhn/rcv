"use strict";

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();
const { getDB } = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');
const ctrl = require('../controllers/ordenesController');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'ordenes' }));

// Ensure schema (solo para SQLite dev)
function ensureSchemaSQLite(_req, res, next){
  if (IS_PG) return next();
  const db = getDB();

  const createOrdenes = `CREATE TABLE IF NOT EXISTS ordenes ( id INTEGER PRIMARY KEY AUTOINCREMENT );`;
  const createVehiculos = `
    CREATE TABLE IF NOT EXISTS vehiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      placa TEXT NOT NULL,
      marca TEXT, modelo TEXT, anio INTEGER, vin TEXT, color TEXT
    );`;
  const createClientes = `
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT, identificacion TEXT, telefono TEXT, email TEXT
    );`;
  const createUsuarios = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT, nombre TEXT, rol TEXT
    );`;

  function addColumnIfMissing(table, column, type, cb){
    db.all(`PRAGMA table_info(${table})`, (e, rows)=>{
      if (e) return cb && cb(e);
      const exists = (rows || []).some(r => r && r.name === column);
      if (exists) return cb && cb(null);
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, cb);
    });
  }

  db.exec(createOrdenes + createVehiculos + createClientes + createUsuarios, (err)=>{
    if (err) return res.status(500).json({ error: err.message });

    const cols = [
      ['ordenes','numero','TEXT'],
      ['ordenes','vehiculo_id','INTEGER'],
      ['ordenes','estado','TEXT'],
      ['ordenes','descripcion','TEXT'],
      ['ordenes','mano_obra','REAL'],
      ['ordenes','total','REAL'],
      ['ordenes','prioridad','TEXT'],
      ['ordenes','asignado_a','INTEGER'],
      ['ordenes','cita','TEXT'],
      ['ordenes','recepcion_json','TEXT'],
      ['ordenes','fotos_json','TEXT'],
      ['ordenes','fechaRegistro','TEXT'],
      ['ordenes','actualizado','TEXT'],
    ];
    (function run(i){
      if (i >= cols.length) return next();
      const [t, c, ty] = cols[i];
      addColumnIfMissing(t, c, ty, () => run(i+1));
    })(0);
  });
}

router.use(ensureSchemaSQLite);

// Upload fotos de recepción (antes de /:id)
const uploadRoot = path.join(__dirname, '..', '..', 'public', 'uploads', 'ordenes');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(uploadRoot, String(req.params.id));
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    const ts = Date.now();
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${ts}-${Math.random().toString(36).slice(2,8)}${ext || '.jpg'}`);
  }
});
const upload = multer({ storage });

router.post('/:id(\\d+)/recepcion-fotos', requirePermission('ordenes.edit'), upload.array('fotos', 20), ctrl.guardarFotosOrden);

// CRUD
router.get('/',                 requirePermission('ordenes.view'), ctrl.getOrdenes);
router.post('/',                requirePermission('ordenes.edit'), ctrl.crearOrden);
router.get('/:id(\\d+)',        requirePermission('ordenes.view'), ctrl.getOrden);
router.put('/:id(\\d+)',        requirePermission('ordenes.edit'), ctrl.actualizarOrden);
router.delete('/:id(\\d+)',     requirePermission('ordenes.edit'), ctrl.eliminarOrden);

module.exports = router;
