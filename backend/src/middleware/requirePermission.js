"use strict";

const { authenticate } = require("./requireAuth");
const { getEffectivePermissions, normalizePerm } = require("../auth/permissions");

/**
 * Verifica que el usuario autenticado tenga el permiso solicitado.
 * Se encadena normalmente después de requireAuth, pero es tolerante si no se llamó antes.
 */
function requirePermission(slug) {
  const needed = normalizePerm(slug);

  return async (req, res, next) => {
    // Asegura usuario en req.user (si no pasó por requireAuth antes)
    if (!req.user) {
      const r = await authenticate(req);
      if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error });
    }

    try {
      const effective = getEffectivePermissions(req.user);
      if (effective.has(needed)) return next();
      return res.status(403).json({ ok: false, error: "Sin permiso", required: needed });
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = { requirePermission };
