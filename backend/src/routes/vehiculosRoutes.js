"use strict";

const express = require("express");
const router = express.Router();

const vehiculosCtrl = require("../controllers/vehiculosController");
const { getDB } = require("../db/database");
const { requirePermission } = require("../middleware/requirePermission");

/* ===================== Schema bootstrap ===================== */
function dbConn(req) {
  return (req.app && req.app.get("db")) || getDB();
}

/** Agrega columnas si faltan (SQLite) */
function ensureColumns(db, table, columns) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, [], (err, rows) => {
      if (err) return reject(err);
      const have = new Set((rows || []).map((r) => r.name));
      const toAdd = columns.filter(([name]) => !have.has(name));
      if (!toAdd.length) return resolve();

      const runNext = () => {
        const col = toAdd.shift();
        if (!col) return resolve();
        const [name, type] = col;
        db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`, [], (e) => {
          // si otra instancia la agregó antes, ignora el error
          if (e && !/duplicate column name/i.test(e.message)) return reject(e);
          runNext();
        });
      };
      runNext();
    });
  });
}

function ensureIndex(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, [], (e) => (e ? reject(e) : resolve()));
  });
}

/**
 * Asegura tablas y columnas requeridas para vehículos:
 * - vehiculos: cliente_id, placa, marca, modelo, anio, vin, color, notas, fechaRegistro, actualizado
 * - clientes / ordenes mínimas (compat)
 */
function ensureSchema(req, res, next) {
  const db = dbConn(req);

  const createVehiculos = `
    CREATE TABLE IF NOT EXISTS vehiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      placa TEXT NOT NULL,
      marca TEXT,
      modelo TEXT,
      anio INTEGER,
      vin TEXT,
      color TEXT,
      notas TEXT,
      fechaRegistro TEXT,
      actualizado TEXT
    );`;

  const createClientesMin = `
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      identificacion TEXT,
      telefono TEXT,
      email TEXT
    );`;

  const createOrdenesMin = `
    CREATE TABLE IF NOT EXISTS ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT,
      estado TEXT,
      vehiculo_id INTEGER
    );`;

  db.exec(createVehiculos + createClientesMin + createOrdenesMin, async (err) => {
    if (err) return res.status(500).json({ error: err.message });

    try {
      // añade columnas faltantes de forma idempotente
      await ensureColumns(db, "vehiculos", [
        ["cliente_id", "INTEGER"],
        ["placa", "TEXT"],
        ["marca", "TEXT"],
        ["modelo", "TEXT"],
        ["anio", "INTEGER"],
        ["vin", "TEXT"],
        ["color", "TEXT"],
        ["notas", "TEXT"],
        ["fechaRegistro", "TEXT"],
        ["actualizado", "TEXT"],
      ]);

      // índices útiles para búsquedas
      await ensureIndex(
        db,
        `CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON vehiculos(placa)`
      );
      await ensureIndex(
        db,
        `CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON vehiculos(cliente_id)`
      );

      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

/* ===================== Rutas (con permisos) ===================== */
router.use(ensureSchema);

// Lectura
router.get("/", requirePermission("vehiculos.view"), vehiculosCtrl.getVehiculos);
router.get("/:id", requirePermission("vehiculos.view"), vehiculosCtrl.getVehiculo);

// Escritura
router.post("/", requirePermission("vehiculos.edit"), vehiculosCtrl.crearVehiculo);
router.put("/:id", requirePermission("vehiculos.edit"), vehiculosCtrl.actualizarVehiculo);
router.delete("/:id", requirePermission("vehiculos.edit"), vehiculosCtrl.eliminarVehiculo);

module.exports = router;
