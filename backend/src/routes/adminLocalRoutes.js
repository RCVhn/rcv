"use strict";
// Módulo auxiliar “local”. Compatible con Postgres y SQLite.

const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health sin permisos
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'adminLocal' }));

// Todo este módulo requiere permisos de admin
router.use(requirePermission('usuarios.admin'));

// Helpers a promesas (API sqlite-like)
function promisify(db) {
  const getAsync = (sql, params=[]) => new Promise((res, rej)=>db.get(sql, params, (e,r)=>e?rej(e):res(r)));
  const allAsync = (sql, params=[]) => new Promise((res, rej)=>db.all(sql, params, (e,r)=>e?rej(e):res(r)));
  const runAsync = (sql, params=[]) => new Promise((res, rej)=>db.run(sql, params, function(e){e?rej(e):res(this)}));
  return { getAsync, allAsync, runAsync };
}

async function ensure(db) {
  const { runAsync } = promisify(db);

  if (IS_PG) {
    // Postgres
    await runAsync(`
      CREATE TABLE IF NOT EXISTS usuarios_admin (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario TEXT UNIQUE NOT NULL,
        contrasena TEXT NOT NULL,
        rol TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await runAsync(`
      CREATE TABLE IF NOT EXISTS bitacora_admin (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario TEXT,
        accion TEXT,
        ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    // SQLite
    await runAsync(`
      CREATE TABLE IF NOT EXISTS usuarios_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        contrasena TEXT NOT NULL,
        rol TEXT NOT NULL,
        creado_en TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
    await runAsync(`
      CREATE TABLE IF NOT EXISTS bitacora_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT,
        accion TEXT,
        ts TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
  }
}

// GET /api/admin/usuarios
router.get('/admin/usuarios', async (_req, res) => {
  try {
    const db = getDB(); await ensure(db);
    const { allAsync } = promisify(db);
    const rows = await allAsync(`SELECT id, usuario, rol, ${IS_PG?'to_char(creado_en, \'YYYY-MM-DD"T"HH24:MI:SSOF\') AS creado_en':'creado_en'} FROM usuarios_admin ORDER BY usuario`);
    res.json(rows||[]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/usuarios
router.post('/admin/usuarios', async (req, res) => {
  try {
    const { usuario, contrasena, rol } = req.body || {};
    if (!usuario || !contrasena || !rol) return res.status(400).json({ error: 'DATOS_REQUERIDOS' });
    const db = getDB(); await ensure(db);
    const { runAsync, getAsync } = promisify(db);
    const ins = await runAsync(`INSERT INTO usuarios_admin (usuario, contrasena, rol) VALUES (?,?,?)`,[usuario, contrasena, rol]);
    const id = IS_PG ? ins.lastID ?? (await getAsync(`SELECT MAX(id) AS id FROM usuarios_admin`)).id : ins.lastID;
    const row = await getAsync(`SELECT id, usuario, rol, ${IS_PG?'to_char(creado_en, \'YYYY-MM-DD"T"HH24:MI:SSOF\') AS creado_en':'creado_en'} FROM usuarios_admin WHERE id=?`,[id]);
    res.status(201).json(row);
  } catch (e) { 
    const msg = /unique/i.test(e.message) ? 'USUARIO_EXISTE' : e.message;
    res.status(500).json({ error: msg });
  }
});

// PUT /api/admin/usuarios/:id/password
router.put('/admin/usuarios/:id(\\d+)/password', async (req, res) => {
  try {
    const id = req.params.id; const { contrasena } = req.body || {};
    if (!contrasena) return res.status(400).json({ error: 'CONTRASENA_REQUERIDA' });
    const db = getDB(); await ensure(db);
    const { runAsync, getAsync } = promisify(db);
    await runAsync(`UPDATE usuarios_admin SET contrasena=? WHERE id=?`,[contrasena, id]);
    const row = await getAsync(`SELECT id, usuario, rol, ${IS_PG?'to_char(creado_en, \'YYYY-MM-DD"T"HH24:MI:SSOF\') AS creado_en':'creado_en'} FROM usuarios_admin WHERE id=?`,[id]);
    res.json(row||{ ok:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/bitacora
router.get('/admin/bitacora', async (_req, res) => {
  try {
    const db = getDB(); await ensure(db);
    const { allAsync } = promisify(db);
    const rows = await allAsync(`SELECT ${IS_PG?'to_char(ts, \'YYYY-MM-DD"T"HH24:MI:SSOF\') AS ts':'ts'}, usuario, accion FROM bitacora_admin ORDER BY ts DESC LIMIT 200`);
    res.json(rows||[]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/bitacora
router.post('/admin/bitacora', async (req, res) => {
  try {
    const db = getDB(); await ensure(db);
    const { usuario, accion } = req.body || {};
    if (!accion) return res.status(400).json({ error: 'ACCION_REQUERIDA' });
    const { runAsync } = promisify(db);
    await runAsync(`INSERT INTO bitacora_admin (usuario, accion) VALUES (?,?)`,[usuario||null, accion]);
    res.status(201).json({ ok:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
