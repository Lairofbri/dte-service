// src/middlewares/jwt.middleware.js
// Middleware de autenticación JWT para rutas del frontend
// Diferente a la API Key que usa el POS (máquina a máquina)
// Este middleware es para usuarios humanos desde el frontend
//
// SEGURIDAD:
// → JWT NUNCA en logs
// → Verificar firma + expiración en cada request
// → establecimiento_id SIEMPRE del JWT — nunca del body
// → Si el token está expirado → 401, no 403

const jwt    = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { noAutenticado, sinPermiso } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware que verifica el JWT en el header Authorization
 * Header esperado: Authorization: Bearer {token}
 * Agrega req.usuario con los datos del token
 */
const autenticarJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return noAutenticado(res, 'Token de autenticación requerido.');
  }

  const token = authHeader.substring(7); // Remover "Bearer "

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Agregar datos del usuario al request para uso en controllers
    // establecimiento_id SIEMPRE viene del token — nunca del body
    req.usuario = {
      id:                 payload.sub,
      email:              payload.email,
      rol:                payload.rol,
      establecimiento_id: payload.establecimiento_id,
    };

    next();
  } catch (err) {
    // NUNCA loguear el token
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

/**
 * Middleware que verifica que el usuario tiene rol administrador
 * Usar DESPUÉS de autenticarJWT
 */
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
 * Middleware dual: acepta API Key O JWT
 * Para endpoints que pueden ser consumidos tanto por el POS como por el frontend
 * Si viene X-API-Key → autenticar como API Key (POS)
 * Si viene Authorization: Bearer → autenticar como JWT (frontend)
 */
const autenticarDual = async (req, res, next) => {
  const apiKey    = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  if (apiKey) {
    // Autenticación por API Key — delegamos al middleware existente
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
