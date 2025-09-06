"use strict";

const express = require('express');
const router = express.Router();
const dbMod = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'productos' }));

function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { if (e) rej(e); else res(this); }));
  return { getAsync, allAsync, runAsync };
}
function getSafeDB() { try { return dbMod.getDB(); } catch (e) { if (typeof dbMod.initDB === 'function') return dbMod.initDB(); throw e; } }

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
function priceFields(precioFinal, tarifa) {
  const pf = round2(precioFinal);
  let t  = Number(tarifa);
  if (!Number.isFinite(t)) t = 15;
  if (t <= 0) return { precio_final: pf, base_imponible: pf, impuesto_monto: 0 };
  const base = round2(pf / (1 + t / 100));
  const isv  = round2(pf - base);
  return { precio_final: pf, base_imponible: base, impuesto_monto: isv };
}

let _booted = false;
async function ensureTablesOnce() {
  if (_booted) return;
  const db = getSafeDB();
  const { runAsync } = promisify(db);

  if (IS_PG) {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS productos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        sku TEXT,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'producto',
        precio NUMERIC NOT NULL DEFAULT 0,
        tarifa_isv NUMERIC NOT NULL DEFAULT 15,
        stock NUMERIC NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1,
        precio_final NUMERIC NOT NULL DEFAULT 0,
        base_imponible NUMERIC NOT NULL DEFAULT 0,
        impuesto_monto NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Asegura columnas por si existía una versión previa
    await runAsync(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_final NUMERIC NOT NULL DEFAULT 0;`);
    await runAsync(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS base_imponible NUMERIC NOT NULL DEFAULT 0;`);
    await runAsync(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS impuesto_monto NUMERIC NOT NULL DEFAULT 0;`);
    await runAsync(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await runAsync(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
  } else {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS productos (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sku            TEXT,
        nombre         TEXT NOT NULL,
        tipo           TEXT NOT NULL DEFAULT 'producto' CHECK (tipo IN ('producto','repuesto','servicio')),
        precio         REAL NOT NULL DEFAULT 0,
        tarifa_isv     REAL NOT NULL DEFAULT 15,
        stock          REAL NOT NULL DEFAULT 0,
        activo         INTEGER NOT NULL DEFAULT 1,
        precio_final   REAL NOT NULL DEFAULT 0,
        base_imponible REAL NOT NULL DEFAULT 0,
        impuesto_monto REAL NOT NULL DEFAULT 0,
        created_at     TEXT DEFAULT (CURRENT_TIMESTAMP),
        updated_at     TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
  }

  _booted = true;
}
router.use(async (_req, _res, next) => { try { await ensureTablesOnce(); next(); } catch (e) { next(e); } });

async function listProductos(req, res) {
  try {
    const db = getSafeDB();
    const { allAsync } = promisify(db);
    const { limit = 50, offset = 0, q = '', solo_activos = '' } = req.query;

    let where = '1=1';
    const params = [];
    if (q && String(q).trim() !== '') {
      where += ` AND (nombre LIKE '%' || ? || '%' OR sku LIKE '%' || ? || '%')`;
      params.push(q, q);
    }
    if (String(solo_activos) === '1') where += ` AND activo = 1`;

    const rows = await allAsync(
      `SELECT id, sku, nombre, tipo, precio, tarifa_isv, stock, activo,
              precio_final, base_imponible, impuesto_monto
         FROM productos
        WHERE ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
      [...params, Number(limit) || 50, Number(offset) || 0]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
}

async function getProducto(req, res) {
  try {
    const db = getSafeDB();
    const { getAsync } = promisify(db);
    const row = await getAsync(
      `SELECT id, sku, nombre, tipo, precio, tarifa_isv, stock, activo,
              precio_final, base_imponible, impuesto_monto
         FROM productos WHERE id=?`, [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'NO_ENCONTRADO' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
}

async function createProducto(req, res) {
  const db = getSafeDB();
  const { getAsync, runAsync } = promisify(db);
  try {
    const {
      sku = null, nombre, tipo = 'producto',
      precio = 0, tarifa_isv = 15, stock = 0, activo = 1
    } = req.body || {};

    if (!nombre || String(nombre).trim() === '') return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });

    let tipoNorm = String(tipo).toLowerCase();
    if (!['producto','repuesto','servicio'].includes(tipoNorm)) return res.status(400).json({ error: 'TIPO_INVALIDO' });

    let t = Number(tarifa_isv); if (!Number.isFinite(t)) t = 15;
    const pf = Number(precio) || 0;
    const fields = priceFields(pf, t);

    const ins = await runAsync(
      `INSERT INTO productos
        (sku, nombre, tipo, precio, tarifa_isv, stock, activo,
         precio_final, base_imponible, impuesto_monto, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,${IS_PG?'CURRENT_TIMESTAMP':'CURRENT_TIMESTAMP'},${IS_PG?'CURRENT_TIMESTAMP':'CURRENT_TIMESTAMP'})`,
      [sku, nombre, tipoNorm, pf, t, Number(stock)||0, Number(activo)?1:0,
       fields.precio_final, fields.base_imponible, fields.impuesto_monto]
    );

    const id = ins.lastID ?? (await getAsync(`SELECT MAX(id) AS id FROM productos`)).id;
    const row = await getAsync(
      `SELECT id, sku, nombre, tipo, precio, tarifa_isv, stock, activo,
              precio_final, base_imponible, impuesto_monto
         FROM productos WHERE id=?`, [id]
    );
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
}

async function updateProducto(req, res) {
  const db = getSafeDB();
  const { getAsync, runAsync } = promisify(db);
  try {
    const id = req.params.id;
    const current = await getAsync(`SELECT * FROM productos WHERE id=?`, [id]);
    if (!current) return res.status(404).json({ error: 'NO_ENCONTRADO' });

    const payload = {
      sku:        req.body?.sku ?? current.sku,
      nombre:     req.body?.nombre ?? current.nombre,
      tipo:       (req.body?.tipo ?? current.tipo),
      precio:     Number(req.body?.precio ?? current.precio),
      tarifa_isv: req.body?.tarifa_isv ?? current.tarifa_isv,
      stock:      Number(req.body?.stock ?? current.stock),
      activo:     (req.body?.activo ?? current.activo)
    };

    payload.tipo = String(payload.tipo || 'producto').toLowerCase();
    if (!['producto','repuesto','servicio'].includes(payload.tipo)) payload.tipo = 'producto';

    let t = Number(payload.tarifa_isv); if (!Number.isFinite(t)) t = 15;
    const fields = priceFields(payload.precio, t);

    await runAsync(
      `UPDATE productos
          SET sku=?,
              nombre=?,
              tipo=?,
              precio=?,
              tarifa_isv=?,
              stock=?,
              activo=?,
              precio_final=?,
              base_imponible=?,
              impuesto_monto=?,
              updated_at=${IS_PG?'CURRENT_TIMESTAMP':'CURRENT_TIMESTAMP'}
        WHERE id=?`,
      [
        payload.sku, payload.nombre, payload.tipo, Number(payload.precio)||0, t,
        Number(payload.stock)||0, (Number(payload.activo)?1:0),
        fields.precio_final, fields.base_imponible, fields.impuesto_monto, id
      ]
    );

    const row = await getAsync(
      `SELECT id, sku, nombre, tipo, precio, tarifa_isv, stock, activo,
              precio_final, base_imponible, impuesto_monto
         FROM productos WHERE id=?`, [id]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
}

// Compat doble
router.get('/productos',     requirePermission('inventario.view'), listProductos);
router.get('/productos/:id(\\d+)', requirePermission('inventario.view'), getProducto);
router.post('/productos',    requirePermission('inventario.edit'), createProducto);
router.put('/productos/:id(\\d+)',  requirePermission('inventario.edit'), updateProducto);

router.get('/',     requirePermission('inventario.view'), listProductos);
router.get('/:id(\\d+)',  requirePermission('inventario.view'), getProducto);
router.post('/',    requirePermission('inventario.edit'), createProducto);
router.put('/:id(\\d+)',  requirePermission('inventario.edit'), updateProducto);

module.exports = router;
