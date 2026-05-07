// src/middlewares/apikey.middleware.js
// Autenticación por API Key para el dte-service
//
// FLUJO DE SEGURIDAD:
// 1. El POS envía la API Key en el header X-API-Key
// 2. Este middleware compara la API Key contra el hash bcrypt almacenado
// 3. Si coincide, continúa. Si no, rechaza con 401
//
// IMPORTANTE:
// - La API Key raw NUNCA se almacena — solo el hash bcrypt
// - El hash vive en la variable de entorno API_KEY_HASH
// - Timing-safe comparison con bcrypt.compare para evitar timing attacks

const bcrypt    = require('bcryptjs');
const { API_KEY_HASH } = require('../config/env');
const { noAutenticado } = require('../utils/response');
const logger    = require('../utils/logger');

/**
 * Middleware de autenticación por API Key
 * El cliente debe enviar: X-API-Key: <api_key_raw>
 */
const autenticarApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  // Verificar que la API Key fue enviada
  if (!apiKey) {
    logger.warn('Intento de acceso sin API Key', {
      ip:   req.ip,
      ruta: req.path,
    });
    return noAutenticado(res, 'Header X-API-Key requerido.');
  }

  try {
    // Comparación timing-safe con bcrypt
    // Esto evita ataques de timing que intentan adivinar la API Key
    const valida = await bcrypt.compare(apiKey, API_KEY_HASH);

    if (!valida) {
      logger.warn('API Key inválida', {
        ip:   req.ip,
        ruta: req.path,
      });
      return noAutenticado(res, 'API Key inválida.');
    }

    next();
  } catch (err) {
    logger.error('Error al verificar API Key', { error: err.message });
    return noAutenticado(res, 'Error al verificar credenciales.');
  }
};

module.exports = { autenticarApiKey };
