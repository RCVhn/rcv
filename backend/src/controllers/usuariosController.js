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
function parsePerms(row) {
  if (!row) return row;
  try {
    row.permisos = row.permisos ? JSON.parse(row.permisos) : [];
  } catch {
    row.permisos = [];
  }
  return row;
}
function actorFrom(req) {
  const h = (req && req.headers) || {};
  const pick = (v) => (Array.isArray(v) ? v[0] : v);
  const toStr = (v) => (v == null ? null : String(v).trim());

  const actorUsuario =
    toStr(pick(h["x-actor"])) ||
    toStr(pick(h["x-actor-usuario"])) ||
    toStr(pick(h["x-user"])) ||
    toStr(pick(h["x-usuario"])) ||
    toStr(pick(h["x-username"])) ||
    null;

  const actorIdRaw = toStr(pick(h["x-actor-id"]));
  const actorId = actorIdRaw && /^\d+$/.test(actorIdRaw) ? Number(actorIdRaw) : null;

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

// ===== Usuarios =====

// GET /api/usuarios?q=&limit=&offset=
function getUsuarios(req, res) {
  const db = getDB();
  const q = (req.query.q || "").trim().toLowerCase();
  const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

  const base = `
    SELECT id, usuario, nombre, rol, estado, ultimoAcceso, forzarCambio
    FROM usuarios
  `;
  const where = q
    ? ` WHERE lower(usuario) LIKE ? OR lower(nombre) LIKE ? OR lower(rol) LIKE ?`
    : "";
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

  const sql = `${base}${where} ORDER BY id ASC LIMIT ? OFFSET ?`;
  db.all(sql, [...params, limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
}

// GET /api/usuarios/:id
function getUsuario(req, res) {
  const db = getDB();
  db.get(
    `
    SELECT id, usuario, nombre, rol, estado, ultimoAcceso, forzarCambio, permisos
    FROM usuarios
    WHERE id = ?
    `,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
      res.json(parsePerms(row));
    }
  );
}

// Alias
function getUsuarioPorId(req, res) {
  return getUsuario(req, res);
}

// POST /api/usuarios
function crearUsuario(req, res) {
  const { usuario, nombre, rol, password, forzarCambio, permisos } = req.body || {};
  if (!usuario || !nombre || !rol || !password) {
    return res
      .status(400)
      .json({ error: "usuario, nombre, rol y password son requeridos" });
  }
  if (!strongPassword(password)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula, número y símbolo",
    });
  }

  const db = getDB();
  const hashed = bcrypt.hashSync(password, 10);
  const perms = Array.isArray(permisos) ? JSON.stringify(permisos) : null;

  db.run(
    `
    INSERT INTO usuarios (usuario, nombre, rol, password, forzarCambio, estado, permisos)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    `,
    [String(usuario).trim(), String(nombre).trim(), String(rol).trim(), hashed, toBool(forzarCambio) ? 1 : 0, perms],
    function (err) {
      if (err) {
        if (String(err.message).includes("UNIQUE")) {
          return res.status(409).json({ error: "El usuario ya existe" });
        }
        return res.status(500).json({ error: err.message });
      }
      const { actor } = actorFrom(req);
      logBitacora({
        accion: "CREAR_USUARIO",
        usuarioAfectado: usuario,
        hechoPor: actor,
        detalles: `Rol: ${rol}`,
      });
      res.status(201).json({
        id: this.lastID,
        usuario,
        nombre,
        rol,
        estado: 1,
        forzarCambio: toBool(forzarCambio) ? 1 : 0,
      });
    }
  );
}

// PUT /api/usuarios/:id
function actualizarUsuario(req, res) {
  const id = req.params.id;
  const { nombre, rol, password, forzarCambio } = req.body || {};
  const db = getDB();

  db.get(`SELECT usuario FROM usuarios WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

    const updates = [];
    const params = [];

    if (nombre != null) {
      updates.push("nombre = ?");
      params.push(String(nombre).trim());
    }
    if (rol != null) {
      updates.push("rol = ?");
      params.push(String(rol).trim());
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

    params.push(id);
    db.run(
      `UPDATE usuarios SET ${updates.join(", ")} WHERE id = ?`,
      params,
      function (uErr) {
        if (uErr) return res.status(500).json({ error: uErr.message });
        const { actor } = actorFrom(req);
        logBitacora({
          accion: "ACTUALIZAR_USUARIO",
          usuarioAfectado: row.usuario,
          hechoPor: actor,
          detalles: `Cambios: ${updates.join(", ")}`,
        });
        res.json({ ok: true, updated: this.changes });
      }
    );
  });
}

// PATCH /api/usuarios/:id/estado
function actualizarEstado(req, res) {
  const id = req.params.id;
  const { estado } = req.body || {};
  if (estado === undefined || estado === null) {
    return res.status(400).json({ error: "estado requerido (0 o 1)" });
  }
  const db = getDB();
  const { actorUsuario, actor } = actorFrom(req);

  db.get(`SELECT usuario FROM usuarios WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

    const nuevoEstado = Number(estado) ? 1 : 0;
    if (row.usuario === "admin" && nuevoEstado === 0) {
      return res.status(400).json({ error: "No se puede desactivar al usuario admin" });
    }
    if (actorUsuario && row.usuario === actorUsuario && nuevoEstado === 0) {
      return res.status(400).json({ error: "No puedes desactivar tu propio usuario" });
    }

    db.run(
      `UPDATE usuarios SET estado = ? WHERE id = ?`,
      [nuevoEstado, id],
      function (uErr) {
        if (uErr) return res.status(500).json({ error: uErr.message });
        logBitacora({
          accion: "ACTUALIZAR_ESTADO",
          usuarioAfectado: row.usuario,
          hechoPor: actor,
          detalles: `estado=${nuevoEstado ? "Activo" : "Inactivo"}`,
        });
        res.json({ ok: true, updated: this.changes });
      }
    );
  });
}

// POST /api/usuarios/:id/reset-password
function resetPassword(req, res) {
  const id = req.params.id;
  const nueva = req.body && req.body.nueva ? String(req.body.nueva) : null;

  const db = getDB();
  db.get(`SELECT usuario FROM usuarios WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });

    const gen = nueva || Math.random().toString(36).slice(-10);
    if (!strongPassword(gen)) {
      if (nueva) return res.status(400).json({ error: "La nueva contraseña no cumple requisitos" });
      const fallback = gen + "!";
      const hashedFb = bcrypt.hashSync(fallback, 10);
      const { actor } = actorFrom(req);
      return db.run(
        `UPDATE usuarios SET password = ?, forzarCambio = 1 WHERE id = ?`,
        [hashedFb, id],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: uErr.message });
          logBitacora({
            accion: "RESET_PASSWORD",
            usuarioAfectado: row.usuario,
            hechoPor: actor,
            detalles: "forzarCambio=1",
          });
          return res.json({ ok: true, nueva: fallback });
        }
      );
    }

    const hashed = bcrypt.hashSync(gen, 10);
    db.run(
      `UPDATE usuarios SET password = ?, forzarCambio = 1 WHERE id = ?`,
      [hashed, id],
      function (uErr) {
        if (uErr) return res.status(500).json({ error: uErr.message });
        const { actor } = actorFrom(req);
        logBitacora({
          accion: "RESET_PASSWORD",
          usuarioAfectado: row.usuario,
          hechoPor: actor,
          detalles: "forzarCambio=1",
        });
        res.json({ ok: true, nueva: gen });
      }
    );
  });
}

// DELETE /api/usuarios/:id
function eliminarUsuario(req, res) {
  const id = req.params.id;
  const db = getDB();
  const { actorUsuario, actor } = actorFrom(req);

  db.get(`SELECT usuario FROM usuarios WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
    if (row.usuario === "admin") {
      return res.status(400).json({ error: "No se puede eliminar el usuario admin" });
    }
    if (actorUsuario && row.usuario === actorUsuario) {
      return res.status(400).json({ error: "No puedes eliminar tu propio usuario" });
    }

    db.run(`DELETE FROM usuarios WHERE id = ?`, [id], function (dErr) {
      if (dErr) return res.status(500).json({ error: dErr.message });
      logBitacora({
        accion: "ELIMINAR_USUARIO",
        usuarioAfectado: row.usuario,
        hechoPor: actor,
        detalles: "",
      });
      res.json({ ok: true, deleted: this.changes });
    });
  });
}

// PUT /api/usuarios/:id/permisos
function actualizarPermisos(req, res) {
  const id = req.params.id;
  const { permisos } = req.body || {};
  if (!Array.isArray(permisos) || !permisos.every((p) => typeof p === "string")) {
    return res.status(400).json({ error: "permisos debe ser un arreglo de strings" });
  }
  const db = getDB();
  const { actor } = actorFrom(req);

  db.get(`SELECT usuario FROM usuarios WHERE id = ?`, [id], (gErr, row) => {
    if (gErr) return res.status(500).json({ error: gErr.message });
    if (!row) return res.status(404).json({ error: "Usuario no encontrado" });
    db.run(
      `UPDATE usuarios SET permisos = ? WHERE id = ?`,
      [JSON.stringify(permisos), id],
      function (uErr) {
        if (uErr) return res.status(500).json({ error: uErr.message });
        logBitacora({
          accion: "ACTUALIZAR_PERMISOS",
          usuarioAfectado: row.usuario,
          hechoPor: actor,
          detalles: permisos.join(", "),
        });
        res.json({ ok: true, updated: this.changes });
      }
    );
  });
}

// POST /api/usuarios/:id/ultimo-acceso
function marcarUltimoAcceso(req, res) {
  const id = req.params.id;
  const db = getDB();
  db.run(
    `UPDATE usuarios SET ultimoAcceso = ? WHERE id = ?`,
    [nowISO(), id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, updated: this.changes });
    }
  );
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
};
