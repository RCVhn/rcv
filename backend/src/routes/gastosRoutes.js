"use strict";

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { getDB } = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'gastos' }));

function promisify(db) {
  const getAsync = (sql, params=[]) => new Promise((res, rej)=>db.get(sql, params, (e,r)=>e?rej(e):res(r)));
  const allAsync = (sql, params=[]) => new Promise((res, rej)=>db.all(sql, params, (e,r)=>e?rej(e):res(r)));
  const runAsync = (sql, params=[]) => new Promise((res, rej)=>db.run(sql, params, function(e){e?rej(e):res(this)}));
  return { getAsync, allAsync, runAsync };
}

const num = (v, d=0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const money = v => Math.round(num(v)*100)/100;

/* ========= uploads ========= */
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'gastos');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g,'_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage });

/* ========= ensure table (lazy) ========= */
let _boot = false;
async function ensureTablesOnce(db){
  if (_boot) return;
  const { runAsync } = promisify(db);
  if (IS_PG) {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS gastos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        fecha DATE NOT NULL,
        proveedor TEXT,
        descripcion TEXT,
        categoria TEXT,
        monto_gravado NUMERIC DEFAULT 0,
        isv_15 NUMERIC DEFAULT 0,
        isv_18 NUMERIC DEFAULT 0,
        monto_exento NUMERIC DEFAULT 0,
        total NUMERIC DEFAULT 0,
        numero_doc TEXT,
        adjunto_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        proveedor TEXT,
        descripcion TEXT,
        categoria TEXT,
        monto_gravado REAL DEFAULT 0,
        isv_15 REAL DEFAULT 0,
        isv_18 REAL DEFAULT 0,
        monto_exento REAL DEFAULT 0,
        total REAL DEFAULT 0,
        numero_doc TEXT,
        adjunto_path TEXT,
        created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
  }
  _boot = true;
}

/* ================== CREATE ================== */
router.post('/', requirePermission('gastos.edit'), upload.single('adjunto'), async (req, res) => {
  try {
    const db = getDB(); 
    await ensureTablesOnce(db);
    const { runAsync, getAsync } = promisify(db);

    const {
      fecha, proveedor, descripcion, categoria,
      monto_gravado=0, isv_15=undefined, isv_18=undefined, monto_exento=0, total=undefined, numero_doc
    } = req.body || {};
    if (!fecha) return res.status(400).json({ error: 'FECHA_REQUERIDA' });

    const grav = money(monto_gravado);
    let i15 = (isv_15 === undefined || isNaN(Number(isv_15))) ? undefined : money(isv_15);
    let i18 = (isv_18 === undefined || isNaN(Number(isv_18))) ? undefined : money(isv_18);
    const exen = money(monto_exento);

    if (i15 === undefined && i18 === undefined && grav > 0) { i15 = money(grav * 0.15); i18 = 0; }
    if (i15 === undefined) i15 = 0;
    if (i18 === undefined) i18 = 0;

    let tot = total;
    if (tot === undefined || isNaN(Number(tot))) { tot = money(grav + exen + i15 + i18); } else { tot = money(tot); }
    if (tot <= 0) return res.status(400).json({ error: 'TOTAL_INVALIDO' });

    const adjPath = req.file ? req.file.filename : null;

    const ins = await runAsync(`
      INSERT INTO gastos
        (fecha, proveedor, descripcion, categoria, monto_gravado, isv_15, isv_18, monto_exento, total, numero_doc, adjunto_path)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `,[fecha, proveedor||null, descripcion||null, categoria||null, grav, i15, i18, exen, tot, numero_doc||null, adjPath]);

    const id = ins.lastID ?? (await getAsync(`SELECT MAX(id) AS id FROM gastos`)).id;
    const row = await getAsync(`SELECT * FROM gastos WHERE id=?`, [id]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ================== LIST ================== */
router.get('/', requirePermission('gastos.view'), async (req, res) => {
  try {
    const db = getDB(); 
    await ensureTablesOnce(db);
    const { allAsync } = promisify(db);
    const { mes } = req.query;

    let where = ''; let params = [];
    if (mes) { where = `WHERE CAST(fecha AS DATE) >= ? AND CAST(fecha AS DATE) <= ?`; params = [`${mes}-01`, `${mes}-31`]; }
    else {
      const from = (req.query.from || req.query.desde || '').slice(0,10);
      const to   = (req.query.to   || req.query.hasta || '').slice(0,10);
      if (from && to) { where = `WHERE CAST(fecha AS DATE) BETWEEN ? AND ?`; params = [from, to]; }
    }

    const rows = await allAsync(
      `SELECT * FROM gastos ${where} ORDER BY CAST(fecha AS DATE) DESC, id DESC`,
      params
    );
    res.json(rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ================== FILE ================== */
router.get('/:id(\\d+)/adjunto', requirePermission('gastos.view'), async (req, res) => {
  try {
    const db = getDB(); 
    await ensureTablesOnce(db);
    const { getAsync } = promisify(db);
    const { id } = req.params;
    const g = await getAsync(`SELECT adjunto_path FROM gastos WHERE id=?`, [id]);
    if (!g || !g.adjunto_path) return res.status(404).send('Sin adjunto');
    const full = path.join(UPLOAD_DIR, g.adjunto_path);
    if (!fs.existsSync(full)) return res.status(404).send('Archivo no encontrado');
    res.sendFile(full);
  } catch (e) { res.status(500).send('Error: '+e.message); }
});

module.exports = router;
