"use strict";

const express = require("express");
const router = express.Router();
const { getDB } = require("../db/database");
const { requirePermission } = require("../middleware/requirePermission");

const IS_PG = (process.env.DB_ENGINE || "").toLowerCase().includes("postg");

// Health
router.get("/_alive", (_req, res) => res.json({ ok: true, mod: "dashboard" }));

/* ================= Helpers comunes ================= */
function promisify(db) {
  const getAsync = (sql, params = []) =>
    new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) =>
    new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  return { getAsync, allAsync };
}

async function tableExists(db, name) {
  const { getAsync } = promisify(db);
  if (IS_PG) {
    // to_regclass() devuelve null si no existe
    const r = await getAsync(`SELECT to_regclass($1) AS t`, [name]).catch(() => null);
    return !!(r && r.t);
  }
  const r = await getAsync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [name]
  ).catch(() => null);
  return !!r;
}

function monthRange(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
function prevMonthRange() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return monthRange(d);
}

/* ===== Descubrir columnas disponibles en una tabla ===== */
async function getTableColumns(db, table) {
  const { allAsync } = promisify(db);
  if (IS_PG) {
    const rows = await allAsync(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_name = $1
          AND table_schema = ANY(current_schemas(true))`,
      [table]
    ).catch(() => []);
    return new Set(rows.map((r) => r.name));
  } else {
    const rows = await allAsync(`PRAGMA table_info(${table})`).catch(() => []);
    return new Set(rows.map((r) => r.name));
  }
}

/* ======================================================
   KPIs
   ====================================================== */
router.get("/kpis", requirePermission("dashboard.view"), async (_req, res) => {
  try {
    const db = getDB();
    const { getAsync } = promisify(db);
    const { from, to } = monthRange();
    const { from: fromPrev, to: toPrev } = prevMonthRange();

    // ---- Órdenes activas ----
    let activas = 0;
    if (await tableExists(db, "ordenes")) {
      const cols = await getTableColumns(db, "ordenes");
      const estadoCol = cols.has("estado") ? "estado" : (cols.has("estatus") ? "estatus" : null);
      if (estadoCol) {
        // Evita ILIKE en SQLite: comparamos en minúsculas
        const cond =
          `LOWER(${estadoCol}) NOT LIKE '%entreg%'` +
          ` AND LOWER(${estadoCol}) NOT LIKE '%cerrad%'` +
          ` AND LOWER(${estadoCol}) NOT LIKE '%anul%'`;
        const rA = await getAsync(
          `SELECT COALESCE(COUNT(*),0) AS c FROM ordenes WHERE ${cond}`
        ).catch(() => ({ c: 0 }));
        activas = Number(rA?.c || 0);
      }
    }

    // ---- Entregas de hoy ----
    let paraHoy = 0;
    if (await tableExists(db, "ordenes")) {
      const cols = await getTableColumns(db, "ordenes");
      const estadoCol = cols.has("estado") ? "estado" : (cols.has("estatus") ? "estatus" : null);
      const fechaEntCol = cols.has("fecha_entrega")
        ? "fecha_entrega"
        : (cols.has("entrega") ? "entrega" : null);

      if (estadoCol && fechaEntCol) {
        const hoy = new Date().toISOString().slice(0, 10);
        const fechaEq =
          IS_PG
            ? `CAST(${fechaEntCol} AS DATE) = $1`
            : `substr(${fechaEntCol},1,10) = ?`; // ISO yyyy-mm-dd

        const rH = await getAsync(
          `
          SELECT COALESCE(COUNT(*),0) AS c
            FROM ordenes
           WHERE ${fechaEq}
             AND LOWER(${estadoCol}) NOT LIKE '%entreg%'
        `,
          [hoy]
        ).catch(() => ({ c: 0 }));
        paraHoy = Number(rH?.c || 0);
      }
    }

    // ---- Ingresos del mes (documentos emitidos) ----
    let ingresosMes = 0,
      ingresosMesPrev = 0;
    if (await tableExists(db, "documentos")) {
      const between =
        IS_PG
          ? `CAST(fecha_emision AS DATE) BETWEEN $1 AND $2`
          : `substr(fecha_emision,1,10) BETWEEN ? AND ?`;
      const rV = await getAsync(
        `SELECT COALESCE(SUM(total),0) AS total FROM documentos WHERE estado='emitido' AND ${between}`,
        [from, to]
      ).catch(() => ({ total: 0 }));
      const rV2 = await getAsync(
        `SELECT COALESCE(SUM(total),0) AS total FROM documentos WHERE estado='emitido' AND ${between}`,
        [fromPrev, toPrev]
      ).catch(() => ({ total: 0 }));
      ingresosMes = Number(rV?.total || 0);
      ingresosMesPrev = Number(rV2?.total || 0);
    }

    // ---- Clientes nuevos del mes ----
    let clientesNuevos = 0,
      clientesNuevosPrev = 0;
    if (await tableExists(db, "clientes")) {
      const cols = await getTableColumns(db, "clientes");
      const fechaCliCol = cols.has("fecha_creacion")
        ? "fecha_creacion"
        : (cols.has("created_at") ? "created_at" : (cols.has("fecha") ? "fecha" : null));

      if (fechaCliCol) {
        const between =
          IS_PG
            ? `CAST(${fechaCliCol} AS DATE) BETWEEN $1 AND $2`
            : `substr(${fechaCliCol},1,10) BETWEEN ? AND ?`;
        const rC = await getAsync(
          `SELECT COALESCE(COUNT(*),0) AS c FROM clientes WHERE ${between}`,
          [from, to]
        ).catch(() => ({ c: 0 }));
        const rC2 = await getAsync(
          `SELECT COALESCE(COUNT(*),0) AS c FROM clientes WHERE ${between}`,
          [fromPrev, toPrev]
        ).catch(() => ({ c: 0 }));
        clientesNuevos = Number(rC?.c || 0);
        clientesNuevosPrev = Number(rC2?.c || 0);
      }
    }

    const tendencia = (curr, prev) => {
      if (!prev) return curr ? "+∞" : "0";
      const delta = curr - prev;
      const pct = (delta / (prev || 1)) * 100;
      const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
      return `${sign}${pct.toFixed(0)}%`;
    };

    res.json({
      activas,
      paraHoy,
      ingresosMes,
      clientesNuevos,
      tendencias: {
        activas: "—",
        paraHoy: "—",
        ingresosMes: tendencia(ingresosMes, ingresosMesPrev),
        clientesNuevos: tendencia(clientesNuevos, clientesNuevosPrev),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ======================================================
   Panel
   ====================================================== */
router.get("/panel", requirePermission("dashboard.view"), async (req, res) => {
  try {
    const db = getDB();
    const { allAsync } = promisify(db);
    const user = String(req.query.user || "").toLowerCase();
    const hoy = new Date().toISOString().slice(0, 10);

    if (!(await tableExists(db, "ordenes"))) {
      return res.json({ en_proceso: [], vencidas: [], asignadas: [] });
    }

    const cols = await getTableColumns(db, "ordenes");

    const placaExpr = cols.has("placa")
      ? "placa"
      : cols.has("vehiPlaca")
      ? "vehiPlaca"
      : cols.has("patente")
      ? "patente"
      : "''";

    const estadoExpr = cols.has("estado")
      ? "estado"
      : cols.has("estatus")
      ? "estatus"
      : "''";

    const fCreExpr = cols.has("fecha")
      ? "fecha"
      : cols.has("fecha_creacion")
      ? "fecha_creacion"
      : cols.has("createdAt")
      ? "createdAt"
      : cols.has("creadoEn")
      ? "creadoEn"
      : null;

    const fEntExpr = cols.has("fecha_entrega")
      ? "fecha_entrega"
      : cols.has("entrega")
      ? "entrega"
      : null;

    const asignadoExpr = cols.has("tecnico")
      ? "tecnico"
      : cols.has("asignadoA")
      ? "asignadoA"
      : cols.has("asignado_a")
      ? "asignado_a"
      : cols.has("asignado")
      ? "asignado"
      : "''";

    // SELECT base (como subconsulta para poder usar alias en WHERE)
    const selectFechaCre = fCreExpr
      ? IS_PG
        ? `CAST(${fCreExpr} AS DATE) AS fecha_creacion`
        : `substr(${fCreExpr},1,10) AS fecha_creacion`
      : (IS_PG ? `NULL::DATE AS fecha_creacion` : `NULL AS fecha_creacion`);

    const selectFechaEnt = fEntExpr
      ? IS_PG
        ? `CAST(${fEntExpr} AS DATE) AS fecha_entrega`
        : `substr(${fEntExpr},1,10) AS fecha_entrega`
      : (IS_PG ? `NULL::DATE AS fecha_entrega` : `NULL AS fecha_entrega`);

    const qBase = `
      SELECT
        id,
        ${placaExpr} AS placa,
        LOWER(${estadoExpr}) AS estado,
        ${selectFechaCre},
        ${selectFechaEnt},
        ${asignadoExpr} AS asignado
      FROM ordenes
    `;

    // en_proceso: estado contiene alguna de estas palabras
    const en_proceso = await allAsync(
      `
      SELECT * FROM (
        ${qBase}
      ) t
      WHERE t.estado LIKE '%proceso%'
         OR t.estado LIKE '%diagn%'
         OR t.estado LIKE '%pend%'
         OR t.estado LIKE '%repar%'
         OR t.estado LIKE '%espera%'
      ORDER BY t.fecha_creacion DESC
      LIMIT 50
    `
    );

    // vencidas: fecha_entrega < hoy y no entregadas/cerradas
    const fechaComp = IS_PG ? `$1` : `?`;
    const vencidas = await allAsync(
      `
      SELECT * FROM (
        ${qBase}
      ) t
      WHERE t.fecha_entrega IS NOT NULL
        AND t.fecha_entrega < ${fechaComp}
        AND t.estado NOT LIKE '%entreg%'
        AND t.estado NOT LIKE '%cerrad%'
      ORDER BY t.fecha_entrega ASC
      LIMIT 50
    `,
      [hoy]
    );

    // asignadas a “user” (opcional)
    let asignadas = [];
    if (user) {
      const likeParam = `%${user}%`;
      const ph = IS_PG ? `$1` : `?`;
      asignadas = await allAsync(
        `
        SELECT * FROM (
          ${qBase}
        ) t
        WHERE LOWER(t.asignado) LIKE ${ph}
        ORDER BY t.fecha_creacion DESC
        LIMIT 50
      `,
        [likeParam]
      );
    }

    res.json({ en_proceso, vencidas, asignadas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
