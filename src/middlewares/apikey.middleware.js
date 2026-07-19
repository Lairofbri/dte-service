const bcrypt    = require('bcryptjs');
const { API_KEY_HASH } = require('../config/env');
const { query }  = require('../config/database');
const { noAutenticado } = require('../utils/response');
const logger    = require('../utils/logger');

const autenticarApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const tenantId = req.headers['x-tenant-id'];

  if (!apiKey) {
    logger.warn('Intento de acceso sin API Key', { ip: req.ip, ruta: req.path });
    return noAutenticado(res, 'Header X-API-Key requerido.');
  }

  try {
    let hashValido = null;
    let tenantEncontrado = null;

    // Si hay X-Tenant-Id, buscar hash en DB
    if (tenantId) {
      const { rows } = await query(
        'SELECT id, api_key_hash FROM tenants WHERE id = $1 AND activo = TRUE',
        [tenantId]
      );
      if (rows.length > 0 && rows[0].api_key_hash) {
        hashValido = rows[0].api_key_hash;
        tenantEncontrado = rows[0].id;
      }
    }

    // Fallback: hash del env para backward compat
    if (!hashValido && API_KEY_HASH) {
      hashValido = API_KEY_HASH;
      // Sin tenant definido en este caso — el servicio opera sin scope
    }

    if (!hashValido) {
      logger.warn('API Key sin hash válido', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'API Key inválida.');
    }

    const valida = await bcrypt.compare(apiKey, hashValido);
    if (!valida) {
      logger.warn('API Key inválida', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'API Key inválida.');
    }

    if (tenantEncontrado) {
      req.tenantId = tenantEncontrado;
    }

    next();
  } catch (err) {
    logger.error('Error al verificar API Key', { error: err.message });
    return noAutenticado(res, 'Error al verificar credenciales.');
  }
};

module.exports = { autenticarApiKey };
