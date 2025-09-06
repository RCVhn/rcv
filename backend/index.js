"use strict";

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

try { require("dotenv").config(); } catch {}

const { initDB, getDB } = require("./src/db/database");

const app = express();
const PORT = process.env.PORT || 3001;

// Cloud Run / proxies
app.set("trust proxy", true);

// CORS (incluye headers que usa tu front)
const corsOpts = {
  origin: true,
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization", "X-Actor", "X-Actor-Usuario"],
};
app.use(cors(corsOpts));
app.options("*", cors(corsOpts));

// Middlewares base
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("tiny"));

// ---- util para montar rutas sin romper si falta el archivo
function mount(path, modulePath) {
  try {
    const router = require(modulePath);
    app.use(path, router);
    console.log(`✓ Ruta montada: ${path}  (${modulePath})`);
  } catch (e) {
    console.warn(`↷ Ruta NO montada: ${path}  (${modulePath}) -> ${e.message}`);
  }
}

// ---- health / alive
app.get("/api/health", async (_req, res) => {
  try {
    const db = getDB();
    if (db?.get) {
      db.get("SELECT 1 AS ok", [], (err, row) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        res.json({ ok: true, db: !!row, ts: new Date().toISOString() });
      });
    } else {
      res.json({ ok: true, db: "unknown", ts: new Date().toISOString() });
    }
  } catch {
    res.status(200).json({ ok: true, db: false, ts: new Date().toISOString() });
  }
});

app.get("/api/auth/_alive", (_req, res) => res.json({ ok: true, mod: "auth" }));

// ---- monta TODAS tus rutas
mount("/api/auth",        "./src/routes/authRoutes");
mount("/api/usuarios",    "./src/routes/usuariosRoutes");
mount("/api/clientes",    "./src/routes/clientesRoutes");
mount("/api/vehiculos",   "./src/routes/vehiculosRoutes");
mount("/api/ordenes",     "./src/routes/ordenesRoutes");
mount("/api/cotizaciones","./src/routes/cotizacionesRoutes");
mount("/api/productos",   "./src/routes/productosRoutes");
mount("/api/items",       "./src/routes/itemsRoutes");
mount("/api/kardex",      "./src/routes/kardexRoutes");
mount("/api/facturacion", "./src/routes/facturacionRoutes");
mount("/api/gastos",      "./src/routes/gastosRoutes");
mount("/api/tiempos",     "./src/routes/tiemposRoutes");
mount("/api/reportes",    "./src/routes/reportesRoutes");
mount("/api/dashboard",   "./src/routes/dashboardRoutes");
mount("/api/bitacora",    "./src/routes/bitacoraRoutes");

// 404
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// manejador de errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Error interno" });
});

// ---- levantar servidor tras inicializar DB
(async () => {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`🚀 API escuchando en :${PORT}`));
  } catch (e) {
    console.error("No se pudo inicializar DB:", e);
    process.exit(1);
  }
})();
