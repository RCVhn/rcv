const { getDB } = require('../db/database');

const ROLE_GRANTS = {
  administrador: ['*', 'usuarios:admin', 'bitacora:leer'],
  mecanico:      ['bitacora:leer'],           // ejemplo mínimo
  calidad:       ['bitacora:leer'],
  usuario:       ['bitacora:leer'],
};

async function getActorUser(req) {
  return new Promise((resolve) => {
    const db = getDB();
    const actor = String(req.headers['x-actor'] || '').trim();
    if (!actor) return resolve(null);
    db.get(
      `SELECT id, usuario, nombre, rol, estado, permisos FROM usuarios WHERE lower(usuario)=lower(?)`,
      [actor],
      (err, row) => {
        if (err || !row) return resolve(null);
        try { row.permisos = row.permisos ? JSON.parse(row.permisos) : []; } catch { row.permisos = []; }
        resolve(row);
      }
    );
  });
}

function hasPerm(user, perm) {
  if (!user) return false;
  if (user.estado === 0) return false;
  const rolePerms = ROLE_GRANTS[String(user.rol || '').toLowerCase()] || [];
  if (rolePerms.includes('*')) return true;
  if (rolePerms.includes(perm)) return true;
  if (Array.isArray(user.permisos) && user.permisos.includes(perm)) return true;
  return false;
}

function requirePerm(perm) {
  return async (req, res, next) => {
    const u = await getActorUser(req);
    if (!u) return res.status(401).json({ error: 'No autenticado (X-Actor)' });
    req.actorUser = u; // por si lo necesita el controlador
    if (!hasPerm(u, perm)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

module.exports = { requirePerm, hasPerm };
