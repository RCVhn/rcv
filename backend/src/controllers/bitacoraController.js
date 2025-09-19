"use strict";

const { getDB } = require("../db/database");

function isPg() {
  return (process.env.DB_ENGINE || "").toLowerCase().includes("postg");
}
function normOrderFecha() {
  return isPg() ? "CAST(fecha AS timestamp)" : "datetime(fecha)";
}

function getBitacora(req, res) {
  const db = getDB();
  const usuarioQ = (req.query.usuario || "").trim().toLowerCase();

  const sql = `SELECT * FROM bitacora ORDER BY ${normOrderFecha()} DESC, id DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const normUA = (r) =>
      String(r.usuarioAfectado ?? r.usuario_afectado ?? r.usuario ?? r.user ?? "").trim();
    const normHP = (r) =>
      String(r.hechoPor ?? r.hecho_por ?? r.actor ?? r.hecho ?? "").trim();

    let out = Array.isArray(rows) ? rows : [];

    // Si viene ?usuario=... filtramos ya normalizado
    if (usuarioQ) {
      out = out.filter(
        (r) => normUA(r).toLowerCase() === usuarioQ || normHP(r).toLowerCase() === usuarioQ
      );
    }

    // Devolvemos SIEMPRE las claves normalizadas
    out = out.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      accion: r.accion,
      usuarioAfectado: normUA(r),
      hechoPor: normHP(r),
      detalles: r.detalles,
    }));

    res.json(out);
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
      res.status(201).json({
        id: this.lastID,
        fecha,
        accion,
        usuarioAfectado: usuarioAfectado || "",
        hechoPor: hechoPor || "",
        detalles: detalles || "",
      });
    }
  );
}

module.exports = { getBitacora, crearBitacora };
