const jwt    = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { noAutenticado, sinPermiso } = require('../utils/response');
const logger = require('../utils/logger');

const autenticarJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return noAutenticado(res, 'Token de autenticación requerido.');
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    req.usuario = {
      id:                 payload.sub,
      email:              payload.email,
      rol:                payload.rol,
      establecimiento_id: payload.establecimiento_id,
      tenant_id:          payload.tenant_id,
    };

    if (payload.tenant_id) {
      req.tenantId = payload.tenant_id;
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return noAutenticado(res, 'El token ha expirado. Inicia sesión nuevamente.');
    }
    if (err.name === 'JsonWebTokenError') {
      return noAutenticado(res, 'Token inválido.');
    }
    logger.error('Error al verificar JWT', { error: err.message });
    return noAutenticado(res, 'Error al verificar el token.');
  }
};

const soloAdministrador = (req, res, next) => {
  if (!req.usuario) {
    return noAutenticado(res, 'Token de autenticación requerido.');
  }
  if (req.usuario.rol !== 'administrador') {
    return sinPermiso(res, 'Solo los administradores pueden realizar esta acción.');
  }
  next();
};

const autenticarDual = async (req, res, next) => {
  const apiKey    = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  if (apiKey) {
    const { autenticarApiKey } = require('./apikey.middleware');
    return autenticarApiKey(req, res, next);
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return autenticarJWT(req, res, next);
  }

  return noAutenticado(res, 'Autenticación requerida. Usa X-API-Key o Authorization: Bearer.');
};

module.exports = {
  autenticarJWT,
  soloAdministrador,
  autenticarDual,
};
