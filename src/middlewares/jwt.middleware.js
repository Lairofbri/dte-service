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

    // Fase 2 — Aislamiento multi-tenant:
    // El tenant se deriva EXCLUSIVAMENTE del JWT. Un token sin tenant se rechaza.
    if (!payload.tenant_id) {
      logger.warn('Token sin tenant_id — conexión rechazada', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'Token sin tenant. Inicia sesión nuevamente.');
    }

    req.usuario = {
      id:                 payload.sub,
      email:              payload.email,
      rol:                payload.rol,
      sucursal_id:        payload.sucursal_id || null,
      establecimiento_id: payload.establecimiento_id || null,
      tenant_id:          payload.tenant_id,
    };

    req.tenantId = payload.tenant_id;

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

/**
 * Requiere un JWT válido de rol administrador.
 * A diferencia de soloAdministrador, también exige tenant autenticado,
 * de modo que las API Keys de integración (POS) NUNCA puedan operar
 * rutas administrativas.
 */
const requiereAdministrador = (req, res, next) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de administrador requerida.');
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

/**
 * Guard de aislamiento: exige un tenant autenticado (JWT o API Key).
 * Toda consulta fiscal debe pasar por aquí para no operar en global.
 */
const requiereTenant = (req, res, next) => {
  if (!req.tenantId) {
    return noAutenticado(res, 'Tenant autenticado requerido.');
  }
  next();
};

module.exports = {
  autenticarJWT,
  soloAdministrador,
  requiereAdministrador,
  autenticarDual,
  requiereTenant,
};
