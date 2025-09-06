"use strict";

const { getDB } = require("../db/database");

function isPg() {
  return (process.env.DB_ENGINE || "").toLowerCase().includes("postg");
}

function normOrderFecha() {
  // Ordenar por fecha compatible con SQLite y Postgres
  // Asumimos fecha en ISO. En SQLite, datetime() sirve; en PG, CAST a timestamp
  return isPg() ? "CAST(fecha AS timestamp)" : "datetime(fecha)";
}

function getBitacora(req, res) {
  const db = getDB();
  const usuario = (req.query.usuario || "").trim().toLowerCase();

  let sql = `
    SELECT id, fecha, accion, usuarioAfectado, hechoPor, detalles
    FROM bitacora
  `;
  const params = [];
  if (usuario) {
    sql += ` WHERE lower(usuarioAfectado) = ? OR lower(hechoPor) = ?`;
    params.push(usuario, usuario);
  }
  sql += ` ORDER BY ${normOrderFecha()} DESC, id DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
}

function crearBitacora(req, res) {
  const { fecha, accion, usuarioAfectado, hechoPor, detalles } = req.body || {};
  if (!fecha || !accion) {
    return res.status(400).json({ error: "fecha y accion son requeridos" });
  }
  const db = getDB();
  db.run(
    `
    INSERT INTO bitacora (fecha, accion, usuarioAfectado, hechoPor, detalles)
    VALUES (?, ?, ?, ?, ?)
    `,
    [fecha, accion, usuarioAfectado || "", hechoPor || "", detalles || ""],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res
        .status(201)
        .json({ id: this.lastID, fecha, accion, usuarioAfectado, hechoPor, detalles });
    }
  );
}

module.exports = { getBitacora, crearBitacora };
