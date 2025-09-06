// Backend/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  const bearer = req.headers['authorization'];
  const xActor = req.headers['x-actor'];

  // Si hay JWT
  if (bearer && bearer.startsWith('Bearer ')) {
    const token = bearer.slice(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
      req.user = decoded; // { id, usuario, rol }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
  }

  // Compatibilidad temporal con X-Actor (mientras migras login)
  if (xActor) {
    req.user = { usuario: xActor, rol: 'compat' };
    return next();
  }

  return res.status(401).json({ error: 'No autorizado' });
};
