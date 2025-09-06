"use strict";

const { getDB } = require("../db/database");

function nowISO() {
  return new Date().toISOString();
}

function sanitizeInt(x) {
  const n = parseInt(x, 10);
  return Number.isFinite(n) ? n : null;
}

function mapVehiculoRow(row) {
  if (!row) return row;
  return {
    ...row,
    clienteId: row.cliente_id ?? null,
  };
}

// GET /api/vehiculos?q=
function getVehiculos(req, res) {
  const db = getDB();
  const q = String((req.query.q || "").trim().toLowerCase());

  const base = `
    SELECT
      v.id, v.placa, v.marca, v.modelo, v.anio, v.color, v.vin, v.notas,
      v.cliente_id,
      c.nombre AS clienteNombre,
      c.identificacion AS clienteDocumento
    FROM vehiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
  `;

  const sql = q
    ? `${base}
       WHERE lower(v.placa) LIKE ?
          OR lower(v.marca) LIKE ?
          OR lower(v.modelo) LIKE ?
          OR lower(c.nombre) LIKE ?
          OR lower(c.identificacion) LIKE ?
       ORDER BY v.id DESC`
    : `${base} ORDER BY v.id DESC`;

  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(mapVehiculoRow));
  });
}

// GET /api/vehiculos/:id
function getVehiculo(req, res) {
  const db = getDB();
  const sql = `
    SELECT
      v.id, v.placa, v.marca, v.modelo, v.anio, v.color, v.vin, v.notas,
      v.cliente_id,
      c.nombre AS clienteNombre,
      c.identificacion AS clienteDocumento
    FROM vehiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Vehículo no encontrado" });
    res.json(mapVehiculoRow(row));
  });
}

// POST /api/vehiculos
function crearVehiculo(req, res) {
  const body = req.body || {};
  const cliente_id = sanitizeInt(body.cliente_id ?? body.clienteId);

  const placa = (body.placa || "").trim();
  const marca = (body.marca || "").trim();
  const modelo = (body.modelo || "").trim();
  const anio = sanitizeInt(body.anio);
  const color = (body.color || "").trim();
  const vin = (body.vin || "").trim();
  const notas = (body.notas || "").trim();

  if (!placa) return res.status(400).json({ error: "Placa requerida" });
  if (!cliente_id) return res.status(400).json({ error: "cliente_id requerido" });

  const db = getDB();
  const ahora = nowISO();

  db.run(
    `
    INSERT INTO vehiculos
      (placa, marca, modelo, anio, color, vin, notas, cliente_id, fechaRegistro, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [placa, marca, modelo, anio, color, vin, notas, cliente_id, ahora, ahora],
    function (err) {
      if (err) {
        if (String(err.message).includes("UNIQUE")) {
          return res.status(409).json({ error: "La placa ya existe" });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID });
    }
  );
}

// PUT /api/vehiculos/:id
function actualizarVehiculo(req, res) {
  const body = req.body || {};
  const cliente_id = body.cliente_id ?? body.clienteId;

  const db = getDB();
  const ahora = nowISO();

  db.run(
    `
    UPDATE vehiculos
       SET placa      = COALESCE(?, placa),
           marca      = COALESCE(?, marca),
           modelo     = COALESCE(?, modelo),
           anio       = COALESCE(?, anio),
           color      = COALESCE(?, color),
           vin        = COALESCE(?, vin),
           notas      = COALESCE(?, notas),
           cliente_id = COALESCE(?, cliente_id),
           actualizado= ?
     WHERE id = ?
    `,
    [
      body.placa ?? null,
      body.marca ?? null,
      body.modelo ?? null,
      sanitizeInt(body.anio),
      body.color ?? null,
      body.vin ?? null,
      body.notas ?? null,
      cliente_id != null ? sanitizeInt(cliente_id) : null,
      ahora,
      req.params.id,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: "Vehículo no encontrado" });
      res.json({ ok: true });
    }
  );
}

// DELETE /api/vehiculos/:id
function eliminarVehiculo(req, res) {
  const db = getDB();
  db.run(`DELETE FROM vehiculos WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: "Vehículo no encontrado" });
    res.json({ ok: true });
  });
}

module.exports = {
  getVehiculos,
  getVehiculo,
  crearVehiculo,
  actualizarVehiculo,
  eliminarVehiculo,
};
