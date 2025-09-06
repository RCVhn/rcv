"use strict";

const express = require('express');
const router = express.Router();
const dbMod = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'cotizaciones' }));

// Promesas sqlite-like
function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
  return { getAsync, allAsync, runAsync };
}
function getSafeDB() {
  try { return dbMod.getDB(); }
  catch (e) { if (typeof dbMod.initDB === 'function') return dbMod.initDB(); throw e; }
}

// Bootstrap tablas (idempotente, sin db.exec)
let _bootstrapped = false;
async function ensureTablesOnce() {
  if (_bootstrapped) return;
  const db = getSafeDB();
  const { runAsync } = promisify(db);

  if (IS_PG) {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS cotizaciones (
        id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        fecha         DATE DEFAULT CURRENT_DATE,
        cliente_id    BIGINT,
        subtotal      NUMERIC DEFAULT 0,
        isv_total     NUMERIC DEFAULT 0,
        total         NUMERIC DEFAULT 0,
        estado        TEXT DEFAULT 'borrador',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await runAsync(`
      CREATE TABLE IF NOT EXISTS cotizacion_items (
        id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        cotizacion_id    BIGINT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
        item_id          BIGINT,
        tipo             TEXT NOT NULL,
        descripcion      TEXT,
        cantidad         NUMERIC NOT NULL,
        precio_unitario  NUMERIC NOT NULL,
        descuento_pct    NUMERIC DEFAULT 0,
        impuesto_pct     NUMERIC DEFAULT 0,
        base_linea       NUMERIC DEFAULT 0,
        impuesto_monto   NUMERIC DEFAULT 0,
        total_linea      NUMERIC DEFAULT 0
      );
    `);
  } else {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS cotizaciones (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha         TEXT DEFAULT (DATE('now')),
        cliente_id    INTEGER,
        subtotal      REAL DEFAULT 0,
        isv_total     REAL DEFAULT 0,
        total         REAL DEFAULT 0,
        estado        TEXT DEFAULT 'borrador',
        created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
    await runAsync(`
      CREATE TABLE IF NOT EXISTS cotizacion_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        cotizacion_id    INTEGER NOT NULL,
        item_id          INTEGER,
        tipo             TEXT NOT NULL,
        descripcion      TEXT,
        cantidad         REAL NOT NULL,
        precio_unitario  REAL NOT NULL,
        descuento_pct    REAL DEFAULT 0,
        impuesto_pct     REAL DEFAULT 0,
        base_linea       REAL DEFAULT 0,
        impuesto_monto   REAL DEFAULT 0,
        total_linea      REAL DEFAULT 0
      );
    `);
  }

  _bootstrapped = true;
}

// Helpers numéricos
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);

// Lookups seguros
async function safeGetProducto(db, id) {
  const { getAsync } = promisify(db);
  try { return await getAsync(`SELECT id, nombre, tipo, tarifa_isv, precio FROM productos WHERE id=?`, [id]); }
  catch (e) { if (/no such table/i.test(e.message||'')) return null; throw e; }
}
async function safeGetCatalogo(db, id) {
  const { getAsync } = promisify(db);
  try {
    return await getAsync(
      `SELECT id, nombre, tipo, COALESCE(impuesto_pct,0) AS tarifa_isv,
              (COALESCE(precio_base,0) * (1 + COALESCE(impuesto_pct,0)/100.0)) AS precio
         FROM catalogo WHERE id=?`,
      [id]
    );
  } catch (e) { if (/no such table/i.test(e.message||'')) return null; throw e; }
}

// Cálculo de línea
function computeLineFromRaw(raw) {
  const tipo = String(raw.tipo || '').toLowerCase();
  const cantidad = Number(raw.cantidad || 0);
  const precio = Number(raw.precio_unitario || 0);
  if (!['servicio', 'repuesto', 'producto'].includes(tipo)) throw new Error('TIPO_INVALIDO');
  if (cantidad <= 0 || precio < 0) throw new Error('CANTIDAD_O_PRECIO_INVALIDO');

  const descripcion = raw.descripcion || null;

  let descuento_pct = 0;
  if (raw.descuento_pct !== undefined && raw.descuento_pct !== null && raw.descuento_pct !== '') {
    descuento_pct = clamp(raw.descuento_pct, 0, 100);
  } else if (raw.descuento !== undefined && raw.descuento !== null && raw.descuento !== '') {
    const d = Number(raw.descuento);
    const bruto = cantidad * precio;
    if (d > 1) descuento_pct = bruto > 0 ? clamp((d / bruto) * 100, 0, 100) : 0;
    else if (d >= 0 && d <= 1) descuento_pct = clamp(d * 100, 0, 100);
  }

  let impuesto_pct = null;
  if (raw.impuesto_pct !== undefined && raw.impuesto_pct !== null && raw.impuesto_pct !== '') {
    impuesto_pct = Number(raw.impuesto_pct);
  } else if (raw.tarifa_isv !== undefined && raw.tarifa_isv !== null && raw.tarifa_isv !== '') {
    impuesto_pct = Number(raw.tarifa_isv);
  }
  if (impuesto_pct === null || Number.isNaN(impuesto_pct)) impuesto_pct = 15;
  if (![0, 15, 18].includes(Number(impuesto_pct))) impuesto_pct = clamp(impuesto_pct, 0, 100);

  const base_bruta = cantidad * precio;
  const base_linea = round2(base_bruta * (1 - (descuento_pct / 100)));
  const impuesto_monto = round2(base_linea * (Number(impuesto_pct) / 100));
  const total_linea = round2(base_linea + impuesto_monto);

  return {
    tipo, descripcion, cantidad, precio,
    descuento_pct: round2(descuento_pct),
    impuesto_pct: round2(impuesto_pct),
    base_linea, impuesto_monto, total_linea,
  };
}

// Origen item
function parseItemSource(raw) {
  let prefer = null; let id = raw.item_id;
  if (typeof raw.item_ref === 'string') {
    const s = raw.item_ref.toLowerCase();
    if (s.startsWith('prod:')) { prefer = 'prod'; id = Number(s.split(':')[1]); }
    if (s.startsWith('cat:'))  { prefer = 'cat';  id = Number(s.split(':')[1]); }
  }
  const src = (raw.source || raw.origen || '').toString().toLowerCase();
  if (['prod','producto','productos'].includes(src)) prefer = 'prod';
  if (['cat','catalogo'].includes(src)) prefer = 'cat';
  return { prefer, id: Number(id || 0) || null };
}

// ====== Permisos ======
router.use(requirePermission('cotizaciones.view'));

/* ==== BÚSQUEDA (para autocompletar) ==== */
// GET /items/buscar
router.get('/items/buscar', async (req, res) => {
  try {
    await ensureTablesOnce();
    const db = getSafeDB();
    const { allAsync } = promisify(db);
    const { q = '', tipo, limit = 20 } = req.query;

    const raw = String(q || '').trim().replace(/[%_]/g, '');
    const tokens = raw ? raw.split(/\s+/).filter(Boolean) : [];
    const L = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const whereTokens = (alias) => tokens.map(() => `(${alias}.nombre LIKE ? OR ${alias}.sku LIKE ?)`).join(' AND ');
    const paramsFromTokens = () => tokens.flatMap(tok => [`%${tok}%`, `%${tok}%`]);

    let productos = [];
    try {
      const conds = []; const params = [];
      if (tipo && ['servicio','repuesto','producto'].includes(tipo)) { conds.push('p.tipo = ?'); params.push(tipo); }
      if (tokens.length) { conds.push(whereTokens('p')); params.push(...paramsFromTokens()); }
      const sqlProd = `
        SELECT 'prod' AS source, p.id AS item_id, p.nombre, p.sku, p.tipo,
               p.precio AS precio_sugerido, p.tarifa_isv AS tarifa_isv,
               COALESCE(p.activo,1) AS activo, p.stock
        FROM productos p
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY p.nombre
        LIMIT ?
      `;
      productos = await allAsync(sqlProd, [...params, L]);
    } catch (e) { if (!/no such table/i.test(e.message||'')) throw e; }

    let catalogo = [];
    try {
      const conds = []; const params = [];
      if (tipo && ['servicio','repuesto','producto'].includes(tipo)) { conds.push('c.tipo = ?'); params.push(tipo); }
      if (tokens.length) { conds.push(whereTokens('c')); params.push(...paramsFromTokens()); }
      const sqlCat = `
        SELECT 'cat' AS source, c.id AS item_id, c.nombre, c.sku, c.tipo,
               (COALESCE(c.precio_base,0) * (1 + COALESCE(c.impuesto_pct,0)/100.0)) AS precio_sugerido,
               COALESCE(c.impuesto_pct,0) AS tarifa_isv,
               COALESCE(c.activo,1) AS activo,
               NULL AS stock
        FROM catalogo c
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY c.nombre
        LIMIT ?
      `;
      catalogo = await allAsync(sqlCat, [...params, L]);
    } catch (e) { if (!/no such table/i.test(e.message||'')) throw e; }

    const merged = [...productos, ...catalogo]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, L)
      .map(r => ({
        item_ref: `${r.source}:${r.item_id}`,
        source: r.source,
        item_id: r.item_id,
        tipo: r.tipo,
        nombre: r.nombre,
        sku: r.sku || null,
        tarifa_isv: Number(r.tarifa_isv || 0),
        precio_sugerido: Number(r.precio_sugerido || 0),
        stock: r.stock ?? null,
        activo: Number(r.activo || 0)
      }));

    res.json(merged);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==== Crear cotización ==== */
// POST /
router.post('/', requirePermission('cotizaciones.edit'), async (req, res) => {
  let db;
  try {
    await ensureTablesOnce();
    db = getSafeDB();
    const { getAsync, runAsync } = promisify(db);

    const { cliente_id = null, fecha = null, items = [] } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'ITEMS_REQUERIDOS' });

    await runAsync('BEGIN');
    const insCab = await runAsync(
      `INSERT INTO cotizaciones (fecha, cliente_id, subtotal, isv_total, total, estado) VALUES (?, ?, 0, 0, 0, 'borrador')`,
      [fecha || null, cliente_id || null]
    );
    const cotId = insCab.lastID ?? (await getAsync(`SELECT MAX(id) AS id FROM cotizaciones`)).id;

    let subtotal = 0, isv_total = 0;

    for (const raw0 of items) {
      const raw = { ...raw0 };
      const { prefer, id } = parseItemSource(raw);
      let prod = null, cat = null;

      if (id) {
        if (prefer === 'prod') { prod = await safeGetProducto(db, id); if (!prod) cat = await safeGetCatalogo(db, id); }
        else if (prefer === 'cat') { cat = await safeGetCatalogo(db, id); if (!cat) prod = await safeGetProducto(db, id); }
        else {
          if (String(raw.tipo || '').toLowerCase() === 'servicio') { cat = await safeGetCatalogo(db, id); if (!cat) prod = await safeGetProducto(db, id); }
          else { prod = await safeGetProducto(db, id); if (!prod) cat = await safeGetCatalogo(db, id); }
        }
      }

      if (prod) {
        if (!raw.tipo) raw.tipo = prod.tipo || 'producto';
        if (!raw.descripcion) raw.descripcion = prod.nombre;
        if (raw.impuesto_pct == null && raw.tarifa_isv == null && prod.tarifa_isv != null) raw.impuesto_pct = prod.tarifa_isv;
        if (raw.precio_unitario == null && prod.precio != null) raw.precio_unitario = prod.precio;
      } else if (cat) {
        if (!raw.tipo) raw.tipo = (cat.tipo || 'servicio');
        if (!raw.descripcion) raw.descripcion = cat.nombre;
        if (raw.impuesto_pct == null && raw.tarifa_isv == null && cat.tarifa_isv != null) raw.impuesto_pct = cat.tarifa_isv;
        if (raw.precio_unitario == null && cat.precio != null) raw.precio_unitario = cat.precio;
      }

      const line = computeLineFromRaw(raw);
      subtotal = round2(subtotal + line.base_linea);
      isv_total = round2(isv_total + line.impuesto_monto);

      await runAsync(
        `INSERT INTO cotizacion_items
          (cotizacion_id, item_id, tipo, descripcion, cantidad, precio_unitario, descuento_pct, impuesto_pct, base_linea, impuesto_monto, total_linea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          cotId,
          raw.item_id ?? null,
          line.tipo, line.descripcion, line.cantidad, line.precio,
          line.descuento_pct, line.impuesto_pct, line.base_linea, line.impuesto_monto, line.total_linea
        ]
      );
    }

    const total = round2(subtotal + isv_total);
    await runAsync(`UPDATE cotizaciones SET subtotal=?, isv_total=?, total=? WHERE id=?`, [subtotal, isv_total, total, cotId]);
    await runAsync('COMMIT');

    const created = await getAsync(`SELECT * FROM cotizaciones WHERE id=?`, [cotId]);
    res.status(201).json(created);
  } catch (e) {
    try { if (db) await promisify(db).runAsync('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message || String(e) });
  }
});

/* ==== Listado ==== */
// GET /?from&to&limit&offset&q
router.get('/', async (req, res) => {
  try {
    await ensureTablesOnce();
    const db = getSafeDB();
    const { allAsync } = promisify(db);
    const { from, to, limit = 20, offset = 0, q = '' } = req.query;

    let where = '1=1'; const params = [];
    if (from) { where += ' AND fecha >= ?'; params.push(from); }
    if (to)   { where += ' AND fecha <= ?'; params.push(to); }
    if (q && String(q).trim() !== '') {
      where += ` AND (
        CAST(id AS TEXT) LIKE '%' || ? || '%' OR
        id IN (SELECT cotizacion_id FROM cotizacion_items WHERE descripcion LIKE '%' || ? || '%')
      )`;
      params.push(q, q);
    }

    const rows = await allAsync(
      `SELECT id, fecha, cliente_id, subtotal, isv_total, total, estado, created_at
         FROM cotizaciones
        WHERE ${where}
        ORDER BY ${IS_PG ? 'fecha::date' : 'date(fecha)'} DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, Number(limit) || 20, Number(offset) || 0]
    );

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==== Detalle ==== */
// GET /:id
router.get('/:id(\\d+)', async (req, res) => {
  try {
    await ensureTablesOnce();
    const db = getSafeDB();
    const { getAsync, allAsync } = promisify(db);
    const { id } = req.params;

    const cab = await getAsync(
      `SELECT id, fecha, cliente_id, subtotal, isv_total, total, estado, created_at
         FROM cotizaciones WHERE id=?`,
      [id]
    );
    if (!cab) return res.status(404).json({ error: 'NO_ENCONTRADA' });

    const items = await allAsync(
      `SELECT id, item_id, tipo, descripcion, cantidad, precio_unitario, descuento_pct, impuesto_pct, base_linea, impuesto_monto, total_linea
         FROM cotizacion_items
        WHERE cotizacion_id=?
        ORDER BY id ASC`,
      [id]
    );

    const itemsConAlias = items.map((r) => ({ ...r, tarifa_isv: r.impuesto_pct, descuento: r.descuento_pct }));
    res.json({ ...cab, items: itemsConAlias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
