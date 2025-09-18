"use strict";

const bcrypt = require("bcryptjs");
const { getDB } = require("../db/database");

// ===== Helpers =====
function nowISO() {
  return new Date().toISOString();
}
function toBool(v) {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true" || v === "TRUE") return true;
  return false;
}
function strongPassword(pw = "") {
  // Min 8, mayúscula, minúscula, número y símbolo
  return (
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw) &&
    pw.length >= 8
  );
}
function isEmail(s = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}
function parsePerms(row) {
  if (!row) return row;
  try {
    row.permisos = row.permisos ? JSON.parse(row.permisos) : [];
  } catch {
    row.permisos = [];
  }
  return row;
}
function normalizePermSlug(s) {
  return String(s || "").replace(/\./g, ":");
}
function permsNormalizeArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => normalizePermSlug(String(p || ""))).filter(Boolean);
}
function actorFrom(req) {
  // Preferir info del JWT si el middleware la dejó en req.user
  const u = req && (req.user || req.auth || req.currentUser);
  const jwtUser =
    (u && (u.usuario || u.username || u.name || u.email)) || null;
  const jwtId = u && (u.id || u.user_id || u.sub);

  const h = (req && req.headers) || {};
  const pick = (v) => (Array.isArray(v) ? v[0] : v);
  const toStr = (v) => (v == null ? null : String(v).trim());

  const actorUsuario =
    jwtUser ||
    toStr(pick(h["x-actor"])) ||
    toStr(pick(h["x-actor-usuario"])) ||
    toStr(pick(h["x-user"])) ||
    toStr(pick(h["x-usuario"])) ||
    toStr(pick(h["x-username"])) ||
    null;

  const actorIdRaw =
    (jwtId != null ? String(jwtId) : null) ||
    toStr(pick(h["x-actor-id"]));
  const actorId =
    actorIdRaw && /^\d+$/.test(actorIdRaw) ? Number(actorIdRaw) : actorIdRaw || null;

  const actor = actorUsuario || (actorId != null ? `id:${actorId}` : "sistema");

  return { actor, actorUsuario, actorId };
}

function logBitacora({ accion, usuarioAfectado, hechoPor, detalles }) {
  const db = getDB();
  db.run(
    `
    INSERT INTO bitacora (fecha, accion, usuarioAfectado, hechoPor, detalles)
    VALUES (?, ?, ?, ?, ?)
    `,
    [nowISO(), accion || "", usuarioAfectado || "", hechoPor || "", detalles || ""],
    (err) => {
      if (err) console.error("❌ Bitácora:", err.message);
    }
  );
}

// ===== Utilidades de consulta =====
function buildPaging(req) {
  // Compatibilidad: soporta page/pageSize y limit/offset
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || "0", 10) || 0, 1), 500);

  let limit, offset;
  if (pageSize) {
    limit = pageSize;
    offset = (page - 1) * pageSize;
  } else {
    limit = Math.min(parseInt(req.query.limit || "200", 10), 500);
    offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
  }
  return { page, pageSize: pageSize || limit, limit, offset };
}

function sendPaged(res, { items, total, page, pageSize }) {
  res.json({ items, total, page, pageSize });
}

async function getTotalAsync(db, baseCountSql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(baseCountSql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.total : 0);
    });
  });
}

async function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this); // this.changes / this.lastID
    });
  });
}

async function ensureAtLeastOneAdminActive(db, ignoreUsernames = []) {
  // Verifica que exista al menos un administrador en estado=1 excluyendo opcionalmente ciertos usuarios
  const placeholders = ignoreUsernames.map(() => "?").join(",");
  const whereNotIn = ignoreUsernames.length ? `AND usuario NOT IN (${placeholders})` : "";
  const row = await getAsync(
    db,
    `
    SELECT COUNT(*) AS total
    FROM usuarios
    WHERE lower(rol) = 'administrador' AND estado = 1
    ${whereNotIn}
    `,
    ignoreUsernames
  );
  return (row && row.total > 0) ? true : false;
}

// ===== Usuarios =====

// GET /api/usuarios?q=&page=&pageSize=   (o limit=&offset=)
async function getUsuarios(req, res) {
  const db = getDB();
  const q = (req.query.q || "").trim().toLowerCase();
  const { page, pageSize, limit, offset } = buildPaging(req);

  const where = q
    ? ` WHERE lower(usuario) LIKE ? OR lower(nombre) LIKE ? OR lower(rol) LIKE ? OR lower(email) LIKE ?`
    : "";
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];

  const base = `
    SELECT id, usuario, nombre, email, rol, estado, ultimoAcceso, forzarCambio
    FROM usuarios
    ${where}
    ORDER BY id ASC
    LIMIT ? OFFSET ?
  `;

  const items = await allAsync(db, base, [...params, limit, offset]);

  // total real
  const totalRow = await getTotalAsync(
    db,
    `SELECT COUNT(*) AS total FROM usuarios ${where}`,
    params
  );

  return sendPaged(res, { items, total: totalRow, page, pageSize });
}

// GET /api/usuarios/:id
async function getUsuario(req, res) {
  const db = getDB();
  const row = await getAsync(
    db,
    `
    SELECT id, usuario, nombre, email, rol, estado, ultimoAcceso, forzarCambio, permisos
    FROM usuarios
    WHERE id = ?
    `,
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
  return res.json(parsePerms(row));
}

// Alias
function getUsuarioPorId(req, res) {
  return getUsuario(req, res);
}

// POST /api/usuarios
async function crearUsuario(req, res) {
  const { usuario, nombre, email, rol, password, forzarCambio, permisos } = req.body || {};
  if (!usuario || !nombre || !email || !rol || !password) {
    return res
      .status(400)
      .json({ error: "usuario, nombre, email, rol y password son requeridos" });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: "Email inválido" });
  }
  if (!strongPassword(password)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula, número y símbolo",
    });
  }

  const db = getDB();
  const hashed = bcrypt.hashSync(password, 10);
  const perms = Array.isArray(permisos) ? JSON.stringify(permsNormalizeArray(permisos)) : null;

  try {
    const info = await runAsync(
      db,
      `
      INSERT INTO usuarios (usuario, nombre, email, rol, password, forzarCambio, estado, permisos)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `,
      [
        String(usuario).trim(),
        String(nombre).trim(),
        String(email).trim().toLowerCase(),
        String(rol).trim(),
        hashed,
        toBool(forzarCambio) ? 1 : 0,
        perms
      ]
    );

    const { actor } = actorFrom(req);
    logBitacora({
      accion: "CREAR_USUARIO",
      usuarioAfectado: usuario,
      hechoPor: actor,
      detalles: `Rol: ${rol}, Email: ${String(email).trim().toLowerCase()}`,
    });

    return res.status(201).json({
      id: info.lastID,
      usuario,
      nombre,
      email: String(email).trim().toLowerCase(),
      rol,
      estado: 1,
      forzarCambio: toBool(forzarCambio) ? 1 : 0,
    });
  } catch (err) {
    const em = String(err.message || "");
    if (em.includes("UNIQUE") && em.toLowerCase().includes("email")) {
      return res.status(409).json({ error: "El email ya existe" });
    }
    if (em.includes("UNIQUE") && em.toLowerCase().includes("usuario")) {
      return res.status(409).json({ error: "El usuario ya existe" });
    }
    return res.status(500).json({ error: err.message });
  }
}

// PUT /api/usuarios/:id
async function actualizarUsuario(req, res) {
  const id = req.params.id;
  const { nombre, email, rol, password, forzarCambio } = req.body || {};
  const db = getDB();

  const row = await getAsync(db, `SELECT usuario, rol, estado FROM usuarios WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const updates = [];
  const params = [];

  if (nombre != null) {
    updates.push("nombre = ?");
    params.push(String(nombre).trim());
  }
  if (email != null) {
    if (!isEmail(email)) return res.status(400).json({ error: "Email inválido" });
    updates.push("email = ?");
    params.push(String(email).trim().toLowerCase());
  }
  // Si cambia el rol, validar que no deje al sistema sin administradores activos
  if (rol != null) {
    const newRol = String(rol).trim();
    updates.push("rol = ?");
    params.push(newRol);

    const isDroppingAdmin = String(row.rol || "").toLowerCase() === "administrador" &&
                            String(newRol || "").toLowerCase() !== "administrador" &&
                            Number(row.estado) === 1;

    if (isDroppingAdmin) {
      const ok = await ensureAtLeastOneAdminActive(db, [row.usuario]);
      if (!ok) {
        return res.status(400).json({ error: "Debe existir al menos un administrador activo en el sistema" });
      }
    }
  }
  if (typeof forzarCambio !== "undefined") {
    updates.push("forzarCambio = ?");
    params.push(toBool(forzarCambio) ? 1 : 0);
  }
  if (password) {
    if (!strongPassword(password)) {
      return res.status(400).json({
        error:
          "La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula, número y símbolo",
      });
    }
    const hashed = bcrypt.hashSync(password, 10);
    updates.push("password = ?");
    params.push(hashed);
  }
  if (updates.length === 0) return res.json({ ok: true, updated: 0 });

  try {
    params.push(id);
    const info = await runAsync(db, `UPDATE usuarios SET ${updates.join(", ")} WHERE id = ?`, params);

    const { actor } = actorFrom(req);
    logBitacora({
      accion: "ACTUALIZAR_USUARIO",
      usuarioAfectado: row.usuario,
      hechoPor: actor,
      detalles: `Cambios: ${updates.join(", ")}`,
    });
    return res.json({ ok: true, updated: info.changes });
  } catch (err) {
    const em = String(err.message || "");
    if (em.includes("UNIQUE") && em.toLowerCase().includes("email")) {
      return res.status(409).json({ error: "El email ya existe" });
    }
    return res.status(500).json({ error: err.message });
  }
}

// PATCH /api/usuarios/:id/estado
async function actualizarEstado(req, res) {
  const id = req.params.id;
  const { estado } = req.body || {};
  if (estado === undefined || estado === null) {
    return res.status(400).json({ error: "estado requerido (0 o 1)" });
  }
  const db = getDB();
  const { actorUsuario, actor } = actorFrom(req);

  const row = await getAsync(db, `SELECT usuario, rol FROM usuarios WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const nuevoEstado = Number(estado) ? 1 : 0;
  if (row.usuario === "admin" && nuevoEstado === 0) {
    return res.status(400).json({ error: "No se puede desactivar al usuario admin" });
  }
  if (actorUsuario && row.usuario === actorUsuario && nuevoEstado === 0) {
    return res.status(400).json({ error: "No puedes desactivar tu propio usuario" });
  }
  // No dejar sin administradores activos
  if (String(row.rol || "").toLowerCase() === "administrador" && nuevoEstado === 0) {
    const ok = await ensureAtLeastOneAdminActive(db, [row.usuario]);
    if (!ok) {
      return res.status(400).json({ error: "Debe existir al menos un administrador activo en el sistema" });
    }
  }

  const info = await runAsync(db, `UPDATE usuarios SET estado = ? WHERE id = ?`, [nuevoEstado, id]);

  logBitacora({
    accion: "ACTUALIZAR_ESTADO",
    usuarioAfectado: row.usuario,
    hechoPor: actor,
    detalles: `estado=${nuevoEstado ? "Activo" : "Inactivo"}`,
  });
  return res.json({ ok: true, updated: info.changes });
}

// POST /api/usuarios/:id/reset-password
async function resetPassword(req, res) {
  const id = req.params.id;
  const nueva = req.body && req.body.nueva ? String(req.body.nueva) : null;

  const db = getDB();
  const row = await getAsync(db, `SELECT usuario FROM usuarios WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const genRaw = nueva || Math.random().toString(36).slice(-10);
  const gen = strongPassword(genRaw) ? genRaw : (genRaw + "!");

  if (!strongPassword(gen)) {
    return res.status(400).json({ error: "La nueva contraseña no cumple requisitos" });
  }

  const hashed = bcrypt.hashSync(gen, 10);
  const info = await runAsync(
    db,
    `UPDATE usuarios SET password = ?, forzarCambio = 1 WHERE id = ?`,
    [hashed, id]
  );

  const { actor } = actorFrom(req);
  logBitacora({
    accion: "RESET_PASSWORD",
    usuarioAfectado: row.usuario,
    hechoPor: actor,
    detalles: "forzarCambio=1",
  });
  return res.json({ ok: true, nueva: gen, updated: info.changes });
}

// DELETE /api/usuarios/:id
async function eliminarUsuario(req, res) {
  const id = req.params.id;
  const db = getDB();
  const { actorUsuario, actor } = actorFrom(req);

  const row = await getAsync(db, `SELECT usuario, rol, estado FROM usuarios WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
  if (row.usuario === "admin") {
    return res.status(400).json({ error: "No se puede eliminar el usuario admin" });
  }
  if (actorUsuario && row.usuario === actorUsuario) {
    return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
  }
  // No dejar sin administradores activos
  if (String(row.rol || "").toLowerCase() === "administrador" && Number(row.estado) === 1) {
    const ok = await ensureAtLeastOneAdminActive(db, [row.usuario]);
    if (!ok) {
      return res.status(400).json({ error: "Debe existir al menos un administrador activo en el sistema" });
    }
  }

  const info = await runAsync(db, `DELETE FROM usuarios WHERE id = ?`, [id]);

  logBitacora({
    accion: "ELIMINAR_USUARIO",
    usuarioAfectado: row.usuario,
    hechoPor: actor,
    detalles: "",
  });
  return res.json({ ok: true, deleted: info.changes });
}

// PUT /api/usuarios/:id/permisos
async function actualizarPermisos(req, res) {
  const id = req.params.id;
  const { permisos } = req.body || {};
  if (!Array.isArray(permisos) || !permisos.every((p) => typeof p === "string")) {
    return res.status(400).json({ error: "permisos debe ser un arreglo de strings" });
  }
  const db = getDB();
  const { actor } = actorFrom(req);

  const row = await getAsync(db, `SELECT usuario FROM usuarios WHERE id = ?`, [id]);
  if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

  const perms = permsNormalizeArray(permisos);
  const info = await runAsync(db, `UPDATE usuarios SET permisos = ? WHERE id = ?`, [JSON.stringify(perms), id]);

  logBitacora({
    accion: "ACTUALIZAR_PERMISOS",
    usuarioAfectado: row.usuario,
    hechoPor: actor,
    detalles: perms.join(", "),
  });
  return res.json({ ok: true, updated: info.changes });
}

// POST /api/usuarios/:id/ultimo-acceso
async function marcarUltimoAcceso(req, res) {
  const id = req.params.id;
  const db = getDB();
  const info = await runAsync(
    db,
    `UPDATE usuarios SET ultimoAcceso = ? WHERE id = ?`,
    [nowISO(), id]
  );
  return res.json({ ok: true, updated: info.changes });
}

// GET /api/bitacora?page=&pageSize=&q=
async function listarBitacora(req, res) {
  const db = getDB();
  const q = (req.query.q || "").trim().toLowerCase();
  const { page, pageSize, limit, offset } = buildPaging(req);

  const where = q
    ? ` WHERE lower(accion) LIKE ? OR lower(usuarioAfectado) LIKE ? OR lower(hechoPor) LIKE ? OR lower(detalles) LIKE ?`
    : "";
  const params = q ? Array(4).fill(`%${q}%`) : [];

  const items = await allAsync(
    db,
    `
    SELECT fecha, accion, usuarioAfectado, hechoPor, detalles
    FROM bitacora
    ${where}
    ORDER BY datetime(fecha) DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  const total = await getTotalAsync(
    db,
    `SELECT COUNT(*) AS total FROM bitacora ${where}`,
    params
  );

  return sendPaged(res, { items, total, page, pageSize });
}

module.exports = {
  getUsuarios,
  getUsuario,
  getUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  actualizarEstado,
  resetPassword,
  eliminarUsuario,
  actualizarPermisos,
  marcarUltimoAcceso,
  listarBitacora,
};
