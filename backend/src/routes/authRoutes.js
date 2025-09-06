"use strict";

const express = require('express');
const jwt = require('jsonwebtoken');
const { login } = require('../controllers/authController');
const { getEffectivePermissions, parseExtras } = require('../auth/permissions');
const { getDB } = require('../db/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'rcv_dev_secret';

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true }));

// Login
router.post('/login', login);

// Verify
router.get('/verify', (req, res) => {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({
      ok: true,
      user: {
        id: payload.uid,
        usuario: payload.usuario,
        rol: payload.rol || 'usuario',
        permisos_extras: parseExtras(payload.permisos_extras),
      },
      iat: payload.iat,
      exp: payload.exp,
    });
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
});

// Helper BD
function getUserById(db, uid) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, usuario, nombre, email, rol, permisos_extras FROM usuarios WHERE id = ?`,
      [uid],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

// Perfil real + permisos efectivos
router.get('/me', async (req, res) => {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = req.app.get('db') || getDB();
    if (!db) return res.status(500).json({ ok: false, error: 'DB no inicializada' });

    const userRow = await getUserById(db, payload.uid);
    if (!userRow) return res.status(401).json({ ok: false, error: 'Usuario no existe' });

    const extras = parseExtras(userRow.permisos_extras);
    const permisos_efectivos = Array.from(
      getEffectivePermissions({ rol: userRow.rol, permisos_extras: extras })
    );

    return res.json({
      ok: true,
      user: {
        id: userRow.id,
        usuario: userRow.usuario,
        nombre: userRow.nombre || null,
        email: userRow.email || null,
        rol: userRow.rol || 'usuario',
      },
      permisos_extras: extras,
      permisos_efectivos,
    });
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
});

module.exports = router;
