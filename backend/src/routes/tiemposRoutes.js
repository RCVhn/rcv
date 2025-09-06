"use strict";

const express = require("express");
const router = express.Router();
const { getDB } = require("../db/database");
const { requirePermission } = require("../middleware/requirePermission");

/* ===================== Helpers ===================== */
function dbConn(req) {
  return (req.app && req.app.get("db")) || getDB();
}

function promisify(db) {
  const getAsync = (sql, params = []) =>
    new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const allAsync = (sql, params = []) =>
    new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
  const runAsync = (sql, params = []) =>
    new Promise((res, rej) =>
      db.run(sql, params, function (e) {
        if (e) rej(e);
        else res(this);
      })
    );
  return { getAsync, allAsync, runAsync };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ===================== Bootstrap (una vez) ===================== */
let _boot = false;
async function ensureTableOnce(req) {
  if (_boot) return;
  const db = dbConn(req);
  await new Promise((ok, ko) =>
    db.exec(
      `
      CREATE TABLE IF NOT EXISTS tiempos_orden (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id TEXT NOT NULL,
        user_id TEXT,
        start_ts INTEGER NOT NULL,  -- epoch ms
        end_ts   INTEGER,           -- epoch ms (NULL si sigue corriendo)
        duration_ms INTEGER         -- end_ts - start_ts (cuando se cierra)
      );

      CREATE INDEX IF NOT EXISTS idx_tiempos_orden_open    ON tiempos_orden(orden_id, user_id, end_ts);
      CREATE INDEX IF NOT EXISTS idx_tiempos_orden_start   ON tiempos_orden(start_ts);
      CREATE INDEX IF NOT EXISTS idx_tiempos_orden_usuario ON tiempos_orden(user_id);
      `,
      (e) => (e ? ko(e) : ok())
    )
  );
  _boot = true;
}

// bootstrap antes de operar
router.use(
  wrap(async (req, _res, next) => {
    await ensureTableOnce(req);
    next();
  })
);

/* ===================== Logic ===================== */
function getUserId(req) {
  // Toma userId del JWT (si tu middleware lo añade a req.user) o del body/query
  return (
    (req.user && (req.user.id || req.user.uid || req.user.userId)) ||
    req.body?.user_id ||
    req.query?.user_id ||
    ""
  ).toString();
}

// POST start
async function startTimer(req, res) {
  const db = dbConn(req);
  const { runAsync, getAsync } = promisify(db);

  const ordenId = String(req.params.id || "").trim();
  const userId = getUserId(req);
  const now = Date.now();

  if (!ordenId) return res.status(400).json({ error: "ORDEN_ID_REQUERIDO" });

  // Evita duplicados corriendo para misma orden/usuario
  const running = await getAsync(
    `
    SELECT * FROM tiempos_orden
     WHERE orden_id=? AND (user_id=? OR ?='') AND end_ts IS NULL
     ORDER BY id DESC LIMIT 1
    `,
    [ordenId, userId, userId]
  );
  if (running) return res.json(running);

  const ins = await runAsync(
    `INSERT INTO tiempos_orden (orden_id, user_id, start_ts) VALUES (?,?,?)`,
    [ordenId, userId || null, now]
  );
  const row = await getAsync(`SELECT * FROM tiempos_orden WHERE id=?`, [ins.lastID]);
  res.status(201).json(row);
}

// POST stop
async function stopTimer(req, res) {
  const db = dbConn(req);
  const { runAsync, getAsync } = promisify(db);

  const ordenId = String(req.params.id || "").trim();
  const userId = getUserId(req);
  const now = Date.now();

  if (!ordenId) return res.status(400).json({ error: "ORDEN_ID_REQUERIDO" });

  const running = await getAsync(
    `
    SELECT * FROM tiempos_orden
     WHERE orden_id=? AND (user_id=? OR ?='') AND end_ts IS NULL
     ORDER BY id DESC LIMIT 1
    `,
    [ordenId, userId, userId]
  );
  if (!running) return res.status(404).json({ error: "NO_RUNNING_TIMER" });

  const start = Number(running.start_ts || now);
  const duration = Math.max(now - start, 0);

  await runAsync(`UPDATE tiempos_orden SET end_ts=?, duration_ms=? WHERE id=?`, [
    now,
    duration,
    running.id,
  ]);
  const row = await getAsync(`SELECT * FROM tiempos_orden WHERE id=?`, [running.id]);
  res.json(row);
}

// GET resumen
async function resumenTimer(req, res) {
  const db = dbConn(req);
  const { getAsync } = promisify(db);

  const ordenId = String(req.params.id || "").trim();
  const userId = getUserId(req);
  if (!ordenId) return res.status(400).json({ error: "ORDEN_ID_REQUERIDO" });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = todayStart.getTime();

  const running = await getAsync(
    `
    SELECT id, start_ts FROM tiempos_orden
     WHERE orden_id=? AND (user_id=? OR ?='') AND end_ts IS NULL
     ORDER BY id DESC LIMIT 1
    `,
    [ordenId, userId, userId]
  );

  const sumToday = await getAsync(
    `
    SELECT IFNULL(SUM(duration_ms),0) AS total
      FROM tiempos_orden
     WHERE orden_id=? AND (user_id=? OR ?='') AND end_ts IS NOT NULL AND start_ts >= ?
    `,
    [ordenId, userId, userId, today]
  );

  const sumAll = await getAsync(
    `
    SELECT IFNULL(SUM(duration_ms),0) AS total
      FROM tiempos_orden
     WHERE orden_id=? AND (user_id=? OR ?='') AND end_ts IS NOT NULL
    `,
    [ordenId, userId, userId]
  );

  res.json({
    running: !!running,
    running_since: running?.start_ts || null,
    total_today_ms: Number(sumToday?.total || 0),
    total_all_ms: Number(sumAll?.total || 0),
  });
}

/* ===================== Rutas ===================== */
/* Protegidas:
   - start/stop ⇒ requieren permiso de edición de órdenes
   - resumen ⇒ permiso de lectura de órdenes
*/

// Si montas con app.use('/api', tiemposRoutes)
router.post(
  "/ordenes/:id/timer/start",
  requirePermission("ordenes.edit"),
  wrap(startTimer)
);
router.post(
  "/ordenes/:id/timer/stop",
  requirePermission("ordenes.edit"),
  wrap(stopTimer)
);
router.get(
  "/ordenes/:id/timer/resumen",
  requirePermission("ordenes.view"),
  wrap(resumenTimer)
);

// Si montas con app.use('/api/ordenes', tiemposRoutes) o app.use('/api/tiempos', tiemposRoutes)
router.post("/:id/timer/start", requirePermission("ordenes.edit"), wrap(startTimer));
router.post("/:id/timer/stop", requirePermission("ordenes.edit"), wrap(stopTimer));
router.get("/:id/timer/resumen", requirePermission("ordenes.view"), wrap(resumenTimer));

module.exports = router;
