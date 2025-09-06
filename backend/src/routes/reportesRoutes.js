"use strict";

const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'reportes' }));

function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  return { getAsync, allAsync };
}
async function tableExists(db, name) {
  const { getAsync } = promisify(db);
  if (IS_PG) {
    const r = await getAsync(`SELECT to_regclass($1) AS t`, [name]).catch(()=>null);
    return !!(r && r.t);
  }
  const r = await getAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]).catch(()=>null);
  return !!r;
}
function dateRange(req) {
  const from = (req.query.from || req.query.desde || '').slice(0, 10);
  const to   = (req.query.to   || req.query.hasta || '').slice(0, 10);
  return { from, to };
}

// Permiso lectura de reportes
router.use(requirePermission('reportes.view'));

/* ====== Resumen mensual ====== */
// GET /?mes=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const db = getDB(); const { getAsync } = promisify(db);
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: 'MES_REQUERIDO' });

    const desde = `${mes}-01`;
    const hasta = `${mes}-31`;

    const hasDoc = await tableExists(db, 'documentos');
    const hasGas = await tableExists(db, 'gastos');

    const ventas = hasDoc
      ? await getAsync(
          `
          SELECT
            COALESCE(SUM(subtotal_gravado),0) AS gravado,
            COALESCE(SUM(subtotal_exento),0)  AS exento,
            COALESCE(SUM(isv_15),0)           AS isv_15,
            COALESCE(SUM(isv_18),0)           AS isv_18,
            COALESCE(SUM(total),0)            AS total,
            COUNT(*)                          AS cantidad
          FROM documentos
          WHERE estado='emitido' AND CAST(fecha_emision AS DATE) BETWEEN ? AND ?
        `,
          [desde, hasta]
        )
      : { gravado: 0, exento: 0, isv_15: 0, isv_18: 0, total: 0, cantidad: 0 };

    const gastos = hasGas
      ? await getAsync(
          `
          SELECT
            COALESCE(SUM(monto_gravado),0) AS gravado,
            COALESCE(SUM(monto_exento),0)  AS exento,
            COALESCE(SUM(isv_15),0)        AS isv_15,
            COALESCE(SUM(isv_18),0)        AS isv_18,
            COALESCE(SUM(total),0)         AS total,
            COUNT(*)                       AS cantidad
          FROM gastos
          WHERE CAST(fecha AS DATE) BETWEEN ? AND ?
        `,
          [desde, hasta]
        )
      : { gravado: 0, exento: 0, isv_15: 0, isv_18: 0, total: 0, cantidad: 0 };

    const neto = (Number(ventas.total) || 0) - (Number(gastos.total) || 0);
    res.json({ mes, ventas, gastos, neto });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ====== Ventas por día ====== */
// GET /ventas?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/ventas', async (req, res) => {
  try {
    const db = getDB(); const { allAsync } = promisify(db);
    const { from, to } = dateRange(req);

    const hasDoc = await tableExists(db, 'documentos');
    if (!hasDoc) return res.json({ ventas_total: 0, ventas_por_dia: [] });

    const where = from && to ? `WHERE CAST(fecha_emision AS DATE) BETWEEN ? AND ?` : ``;
    const params = from && to ? [from, to] : [];
    const rows = await allAsync(
      `
      SELECT CAST(fecha_emision AS DATE) AS fecha, SUM(total) AS total
      FROM documentos
      ${where}
      GROUP BY CAST(fecha_emision AS DATE)
      ORDER BY fecha
    `,
      params
    );
    const ventas_total = (rows || []).reduce((a, r) => a + Number(r.total || 0), 0);
    res.json({ ventas_total, ventas_por_dia: rows || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ====== Gastos por categoría ====== */
// GET /gastos?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/gastos', async (req, res) => {
  try {
    const db = getDB(); const { allAsync } = promisify(db);
    const { from, to } = dateRange(req);

    const hasGas = await tableExists(db, 'gastos');
    if (!hasGas) return res.json({ gastos_total: 0, gastos_por_categoria: [] });

    const where = from && to ? `WHERE CAST(fecha AS DATE) BETWEEN ? AND ?` : ``;
    const params = from && to ? [from, to] : [];
    const rows = await allAsync(
      `
      SELECT COALESCE(categoria,'Sin categoría') AS categoria, SUM(total) AS total
      FROM gastos
      ${where}
      GROUP BY COALESCE(categoria,'Sin categoría')
    `,
      params
    );
    const gastos_total = (rows || []).reduce((a, r) => a + Number(r.total || 0), 0);
    res.json({ gastos_total, gastos_por_categoria: rows || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
