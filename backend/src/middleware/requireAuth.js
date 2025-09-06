"use strict";

const jwt = require("jsonwebtoken");
const { getDB } = require("../db/database");
const { parseExtras } = require("../auth/permissions");

const JWT_SECRET = process.env.JWT_SECRET || "rcv_dev_secret";

/** Lee usuario desde la BD por ID (compat. SQLite / Postgres) */
function fetchUserById(uid) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get(
      // columnas reales en PG: id, usuario, email, rol, permisos (jsonb), estado, forzarCambio, ...
      "SELECT id, usuario, email, rol, permisos, estado, forzarCambio FROM usuarios WHERE id = ?",
      [uid],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

/** Valida token, trae usuario real y lo adjunta a req.user */
async function authenticate(req) {
  const auth = req.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { ok: false, code: 401, error: "No token" };

  try {
    const payload = jwt.verify(token, JWT_SECRET); // { uid, usuario, rol?, ... }
    const userRow = await fetchUserById(payload.uid);
    if (!userRow) return { ok: false, code: 401, error: "Usuario no existe" };

    // permisos puede venir como JSONB (obj/array) o texto → normalizamos a array
    const extras = parseExtras(userRow.permisos);

    req.user = {
      id: userRow.id,
      usuario: userRow.usuario,
      email: userRow.email,
      rol: userRow.rol || payload.rol || "usuario",
      estado: userRow.estado,
      permisos_extras: extras, // lo usa getEffectivePermissions
    };

    return { ok: true };
  } catch (_e) {
    return { ok: false, code: 401, error: "Token inválido o expirado" };
  }
}

async function requireAuth(req, res, next) {
  const r = await authenticate(req);
  if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error });
  return next();
}

module.exports = { requireAuth, authenticate };
