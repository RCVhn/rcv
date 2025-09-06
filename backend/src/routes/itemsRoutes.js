"use strict";

const express = require('express');
const router = express.Router();
const dbMod = require('../db/database');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'items' }));

function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { if (e) rej(e); else res(this); }));
  return { getAsync, allAsync, runAsync };
}
function getSafeDB() { try { return dbMod.getDB(); } catch (e) { if (typeof dbMod.initDB === 'function') return dbMod.initDB(); throw e; } }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function priceFields(precioFinal, tarifa) {
  const pf = round2(precioFinal);
  const t = Number(tarifa);
  const pct = Number.isFinite(t) ? t : 15;
  const base = pct > 0 ? round2(pf / (1 + pct / 100)) : pf;
  const isv  = round2(pf - base);
  return { precio_final: pf, base_imponible: base, impuesto_monto: isv };
}

async function safeAllProductos(db, whereSql, params, limit, offset) {
  const { allAsync } = promisify(db);
  try {
    return await allAsync(
      `SELECT id AS item_id, sku, nombre, tipo, precio, tarifa_isv, stock, activo
       FROM productos
       WHERE ${whereSql}
       ORDER BY nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit)||20, Number(offset)||0]
    );
  } catch (e) { if (/no such table/i.test(e.message||'')) return []; throw e; }
}

async function safeAllCatalogo(db, whereSql, params, limit, offset) {
  const { allAsync } = promisify(db);
  try {
    return await allAsync(
      `SELECT id AS item_id, NULL AS sku, nombre, LOWER(COALESCE(tipo,'servicio')) AS tipo,
              COALESCE(precio, precio_base, 0) AS precio,
              COALESCE(impuesto_pct, tarifa_isv, 15) AS tarifa_isv,
              COALESCE(activo, 1) AS activo
       FROM catalogo
       WHERE ${whereSql}
       ORDER BY nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit)||20, Number(offset)||0]
    );
  } catch (e) { if (/no such table/i.test(e.message||'')) return []; throw e; }
}

function normalizeProd(row) {
  const tarifa = Number.isFinite(Number(row.tarifa_isv)) ? Number(row.tarifa_isv) : 15;
  const fields = priceFields(Number(row.precio||0), tarifa);
  return {
    ref: `prod:${row.item_id}`, source: 'prod', item_id: row.item_id,
    sku: row.sku || null, nombre: row.nombre,
    tipo: String(row.tipo || 'producto').toLowerCase(),
    precio: Number(row.precio || 0), tarifa_isv: tarifa,
    precio_final: fields.precio_final, base_imponible: fields.base_imponible, impuesto_monto: fields.impuesto_monto,
    stock: Number(row.stock ?? 0), activo: Number(row.activo ?? 1),
  };
}
function normalizeCat(row) {
  const tarifa = Number.isFinite(Number(row.tarifa_isv)) ? Number(row.tarifa_isv) : 15;
  const fields = priceFields(Number(row.precio||0), tarifa);
  return {
    ref: `cat:${row.item_id}`, source: 'cat', item_id: row.item_id,
    sku: null, nombre: row.nombre, tipo: String(row.tipo || 'servicio').toLowerCase(),
    precio: Number(row.precio || 0), tarifa_isv: tarifa,
    precio_final: fields.precio_final, base_imponible: fields.base_imponible, impuesto_monto: fields.impuesto_monto,
    stock: 0, activo: Number(row.activo ?? 1),
  };
}

// GET /
router.get('/', async (req, res) => {
  try {
    const db = getSafeDB();
    const { q = '', tipo = '', source = '', limit = 20, offset = 0, solo_activos = '' } = req.query;

    const hasQ = q && String(q).trim() !== '';
    const likeNombre = hasQ ? `%${q}%` : '';
    const likeNombreSku = hasQ ? [`%${q}%`, `%${q}%`] : [];

    const tipoNorm = String(tipo || '').toLowerCase();
    const tipoFilter = ['producto','repuesto','servicio'].includes(tipoNorm) ? tipoNorm : '';

    let whereProd = '1=1'; const paramsProd = [];
    if (hasQ) { whereProd += ' AND (nombre LIKE ? OR sku LIKE ?)'; paramsProd.push(...likeNombreSku); }
    if (tipoFilter) { whereProd += ' AND LOWER(tipo) = ?'; paramsProd.push(tipoFilter); }
    if (String(solo_activos) === '1') { whereProd += ' AND COALESCE(activo,1) = 1'; }

    let whereCat = '1=1'; const paramsCat = [];
    if (hasQ) { whereCat += ' AND (nombre LIKE ?)'; paramsCat.push(likeNombre); }
    if (tipoFilter) { whereCat += ' AND LOWER(COALESCE(tipo, "servicio")) = ?'; paramsCat.push(tipoFilter); }
    if (String(solo_activos) === '1') { whereCat += ' AND COALESCE(activo,1) = 1'; }

    const s = String(source || '').toLowerCase();
    const wantProd = !s || s === 'prod';
    const wantCat  = !s || s === 'cat';

    let rowsProd = []; let rowsCat = [];
    if (wantProd) rowsProd = await safeAllProductos(db, whereProd, paramsProd, limit, offset);
    if (wantCat)  rowsCat  = await safeAllCatalogo(db, whereCat, paramsCat, limit, offset);

    const list = [];
    if (wantProd) list.push(...rowsProd.map(normalizeProd));
    if (wantCat)  list.push(...rowsCat.map(normalizeCat));

    list.sort((a, b) => a.nombre.localeCompare(b.nombre));

    const off = Number(offset) || 0;
    const lim = Number(limit) || 20;
    const slice = (!s ? list.slice(off, off + lim) : list);

    res.json(slice);
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});

// GET /:ref
router.get('/:ref', async (req, res) => {
  try {
    const db = getSafeDB();
    const { getAsync } = promisify(db);
    const ref = String(req.params.ref || '');
    let src = null, id = null;

    if (ref.includes(':')) {
      const [pfx, num] = ref.split(':'); src = pfx.toLowerCase(); id = Number(num);
    } else { id = Number(ref); }
    if (!id) return res.status(400).json({ error: 'ID_INVALIDO' });

    let row = null;

    if (!src || src === 'prod') {
      try {
        row = await getAsync(
          `SELECT id AS item_id, sku, nombre, tipo, precio, tarifa_isv, stock, activo FROM productos WHERE id=?`, [id]
        );
        if (row) return res.json(normalizeProd(row));
      } catch (e) { if (!/no such table/i.test(e.message||'')) throw e; }
    }

    if (!src || src === 'cat') {
      try {
        row = await getAsync(
          `SELECT id AS item_id, NULL AS sku, nombre, LOWER(COALESCE(tipo,'servicio')) AS tipo,
                  COALESCE(precio, precio_base, 0) AS precio, COALESCE(impuesto_pct, tarifa_isv, 15) AS tarifa_isv,
                  COALESCE(activo,1) AS activo
           FROM catalogo WHERE id=?`, [id]
        );
        if (row) return res.json(normalizeCat(row));
      } catch (e) { if (!/no such table/i.test(e.message||'')) throw e; }
    }

    return res.status(404).json({ error: 'NO_ENCONTRADO' });
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});

module.exports = router;
