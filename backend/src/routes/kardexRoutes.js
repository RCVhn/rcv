"use strict";

const express = require('express');
const router = express.Router();
const dbMod = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'kardex' }));

function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { if (e) rej(e); else res(this); }));
  return { getAsync, allAsync, runAsync };
}
function getSafeDB() {
  try { return dbMod.getDB(); }
  catch (e) { if (typeof dbMod.initDB === 'function') return dbMod.initDB(); throw e; }
}

async function ensureTableOnce() {
  const db = getSafeDB(); const { runAsync } = promisify(db);
  if (IS_PG) {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS kardex (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        producto_id BIGINT NOT NULL,
        tipo TEXT NOT NULL,
        cantidad NUMERIC NOT NULL,
        referencia TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS kardex (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
        cantidad REAL NOT NULL,
        referencia TEXT,
        fecha TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
  }
}
router.use(async (_req, _res, next) => { try { await ensureTableOnce(); next(); } catch (e) { next(e); } });

async function createMovimiento(req, res) {
  const db = getSafeDB();
  const { getAsync, runAsync } = promisify(db);
  try {
    const { producto_id, tipo, cantidad, referencia = null } = req.body || {};
    const pid = Number(producto_id) || 0;
    const qty = Number(cantidad) || 0;
    const tipoNorm = String(tipo || '').toLowerCase();

    if (!pid || !tipoNorm || !(qty > 0)) return res.status(400).json({ error: 'DATOS_REQUERIDOS' });
    if (!['entrada', 'salida', 'ajuste'].includes(tipoNorm)) return res.status(400).json({ error: 'TIPO_INVALIDO' });

    await runAsync('BEGIN');
    try {
      await runAsync(`INSERT INTO kardex (producto_id, tipo, cantidad, referencia) VALUES (?,?,?,?)`, [pid, tipoNorm, qty, referencia]);

      let delta = qty;
      if (tipoNorm === 'salida') delta = -delta; // 'ajuste' aplica delta positivo directo
      await runAsync(`UPDATE productos SET stock = stock + ? WHERE id=?`, [delta, pid]);

      await runAsync('COMMIT');
    } catch (txErr) { try { await runAsync('ROLLBACK'); } catch {} throw txErr; }

    const updated = await getAsync(`SELECT id, sku, nombre, stock FROM productos WHERE id=?`, [pid]);
    res.status(201).json({ ok: true, producto: updated });
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
}

async function listMovimientos(req, res) {
  try {
    const db = getSafeDB();
    const { allAsync } = promisify(db);
    const { limit = 10 } = req.query;
    const rows = await allAsync(
      `SELECT k.*, p.nombre AS producto_nombre
         FROM kardex k
         LEFT JOIN productos p ON p.id = k.producto_id
        ORDER BY k.id DESC
        LIMIT ?`,
      [Number(limit) || 10]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function listPorProducto(req, res) {
  try {
    const db = getSafeDB();
    const { allAsync } = promisify(db);
    const { producto_id } = req.params;
    const rows = await allAsync(
      `SELECT k.id, k.producto_id, p.nombre AS producto_nombre, k.tipo, k.cantidad, k.referencia, k.fecha
         FROM kardex k
         LEFT JOIN productos p ON p.id = k.producto_id
        WHERE k.producto_id=?
        ORDER BY k.id DESC`,
      [Number(producto_id) || 0]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Prefijo explícito (si montas en /api)
router.post('/kardex', requirePermission('inventario.edit'), createMovimiento);
router.get('/kardex', requirePermission('kardex.view'), listMovimientos);
router.get('/kardex/:producto_id(\\d+)', requirePermission('kardex.view'), listPorProducto);

// Base (si montas directamente en /api/kardex)
router.post('/', requirePermission('inventario.edit'), createMovimiento);
router.get('/', requirePermission('kardex.view'), listMovimientos);
router.get('/:producto_id(\\d+)', requirePermission('kardex.view'), listPorProducto);

module.exports = router;
