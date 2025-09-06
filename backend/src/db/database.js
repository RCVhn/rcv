// backend/src/db/database.js
"use strict";

const path = require("path");
const bcrypt = require("bcryptjs");

const DB_ENGINE = (process.env.DB_ENGINE || "sqlite").toLowerCase(); // 'sqlite' | 'pg'

let db;           // sqlite db o wrapper pg
let isPg = ["pg", "postgres", "postgresql"].includes(DB_ENGINE);

/* -------------------- Util: formateo ? -> $1,$2 (para pg) -------------------- */
function toPg(sql = "", params = []) {
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: params };
}

/* -------------------- Wrapper estilo sqlite para pg.Pool -------------------- */
function wrapPgPool(pool) {
  return {
    run(sql, params = [], cb) {
      const { text, values } = toPg(sql, params);
      pool.query(text, values, (err, res) => {
        // emula this.changes / this.lastID
        const ctx = { changes: res?.rowCount || 0, lastID: res?.rows?.[0]?.id ?? null };
        if (typeof cb === "function") cb.call(ctx, err);
      });
    },
    get(sql, params = [], cb) {
      const { text, values } = toPg(sql, params);
      pool.query(text, values, (err, res) => {
        if (typeof cb === "function") cb(err, res?.rows?.[0] || null);
      });
    },
    all(sql, params = [], cb) {
      const { text, values } = toPg(sql, params);
      pool.query(text, values, (err, res) => {
        if (typeof cb === "function") cb(err, res?.rows || []);
      });
    },
    _pool: pool,
  };
}

/* -------------------- Promesas helpers sobre db.run/get/all -------------------- */
function runP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this); // {changes,lastID}
    });
  });
}
function getP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}
function allP(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

/* -------------------- Migraciones mínimas necesarias -------------------- */
// SQLite: agrega columna si falta
async function hasColumnSqlite(table, column) {
  const rows = await allP(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

// Crea solo lo mínimo para autenticación (tabla usuarios). Puedes ampliar luego.
async function createTablesSqlite() {
  await runP(
    `CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario       TEXT UNIQUE,
      nombre        TEXT,
      email         TEXT,
      rol           TEXT,
      estado        TEXT DEFAULT 'activo',
      forzarCambio  INTEGER DEFAULT 0,
      permisos      TEXT DEFAULT '[]',
      password      TEXT,
      ultimoAcceso  TEXT
    )`
  );

  // si tu DB antigua no tenía email, lo agregamos
  const hasEmail = await hasColumnSqlite("usuarios", "email");
  if (!hasEmail) {
    await runP(`ALTER TABLE usuarios ADD COLUMN email TEXT`);
  }
}

async function createTablesPg() {
  // JSONB para permisos; boolean para forzarCambio; timestamptz para ultimoAcceso
  await runP(
    `CREATE TABLE IF NOT EXISTS usuarios (
      id            SERIAL PRIMARY KEY,
      usuario       TEXT UNIQUE,
      nombre        TEXT,
      email         TEXT,
      rol           TEXT,
      estado        TEXT DEFAULT 'activo',
      forzarCambio  BOOLEAN DEFAULT FALSE,
      permisos      JSONB   DEFAULT '[]'::jsonb,
      password      TEXT,
      ultimoAcceso  TIMESTAMPTZ
    )`
  );
}

/* -------------------- Seeding / reset de admin -------------------- */
async function ensureAdmin() {
  const ADMIN_USER  = process.env.ADMIN_USER  || "admin";
  const ADMIN_NAME  = process.env.ADMIN_NAME  || "Administrador";
  const ADMIN_PASS  = process.env.ADMIN_PASS  || "admin123";
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
  const FORCE = String(process.env.FORCE_ADMIN_RESET || "0") === "1";

  // ¿Hay usuarios?
  const row = await getP(`SELECT COUNT(*) AS c FROM usuarios`);
  const count = Number(row?.c ?? row?.count ?? 0);

  if (count === 0) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 10);
    await runP(
      `INSERT INTO usuarios (usuario, nombre, email, rol, estado, forzarCambio, password)
       VALUES (?, ?, ?, ?, 'activo', ?, ?)`,
      [ADMIN_USER, ADMIN_NAME, ADMIN_EMAIL, "administrador", false, hash]
    );
    console.log(`✅ Usuario admin creado (${ADMIN_USER}/${ADMIN_PASS})`);
    return;
  }

  if (FORCE) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 10);
    if (isPg) {
      await runP(
        `UPDATE usuarios
           SET password = ?, email = ?, rol = 'administrador', estado = 'activo'
         WHERE lower(usuario) = lower(?)`,
        [hash, ADMIN_EMAIL, ADMIN_USER]
      );
    } else {
      await runP(
        `UPDATE usuarios
           SET password = ?, email = ?, rol = 'administrador', estado = 'activo'
         WHERE lower(usuario) = lower(?)`,
        [hash, ADMIN_EMAIL, ADMIN_USER]
      );
    }
    console.log(`🔐 Admin (${ADMIN_USER}) reseteado (FORCE_ADMIN_RESET=1)`);
  }
}

/* -------------------- initDB / getDB -------------------- */
async function initDB() {
  if (isPg) {
    const { Pool } = require("pg");

    // Cloud Run con socket de Cloud SQL (recomendado):
    // PGHOST = /cloudsql/PROJECT:REGION:INSTANCE
    const pool = new Pool({
      host: process.env.PGHOST,         // '/cloudsql/…'
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: Number(process.env.PGPORT || 5432),
      // Si usas hostname público en lugar de socket, habilita SSL:
      ssl: process.env.PGHOST && process.env.PGHOST.startsWith("/")
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    db = wrapPgPool(pool);
    await createTablesPg();
    await ensureAdmin();
    console.log("✅ Conectado a Postgres");
    return;
  }

  // SQLite (local / fallback)
  const sqlite3 = require("sqlite3").verbose();
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, "taller_rcv.db");

  await new Promise((resolve, reject) => {
    const sdb = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db = sdb;
      db.serialize(async () => {
        db.run("PRAGMA foreign_keys = ON;");
        try {
          await createTablesSqlite();
          await ensureAdmin();
          console.log("✅ Conectado a SQLite:", dbPath);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

function getDB() {
  if (!db) throw new Error("DB no inicializada. Llama initDB() primero.");
  return db;
}

module.exports = { initDB, getDB };
