const bcrypt    = require('bcryptjs');
const { query }  = require('../config/database');
const { noAutenticado } = require('../utils/response');
const logger    = require('../utils/logger');

// Fase 2 — Aislamiento multi-tenant:
// Una API Key SOLO opera dentro del tenant al que pertenece.
// No existe fallback global: el tenant es obligatorio en todos los ambientes.
const autenticarApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const tenantId = req.headers['x-tenant-id'];

  if (!apiKey) {
    logger.warn('Intento de acceso sin API Key', { ip: req.ip, ruta: req.path });
    return noAutenticado(res, 'Header X-API-Key requerido.');
  }

  // El tenant es obligatorio SIEMPRE — nunca se acepta del body ni query.
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    logger.warn('API Key sin X-Tenant-Id', { ip: req.ip, ruta: req.path });
    return noAutenticado(res, 'Header X-Tenant-Id requerido.');
  }

  try {
    // Buscar el hash de la API Key EXCLUSIVAMENTE dentro del tenant indicado.
    const { rows } = await query(
      'SELECT id, api_key_hash FROM tenants WHERE id = $1 AND activo = TRUE',
      [tenantId]
    );
    if (rows.length === 0) {
      logger.warn('Tenant no encontrado o inactivo', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'Tenant inválido.');
    }

    const hashValido = rows[0].api_key_hash;
    if (!hashValido) {
      logger.warn('API Key sin hash configurado', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'API Key inválida.');
    }

    const valida = await bcrypt.compare(apiKey, hashValido);
    if (!valida) {
      logger.warn('API Key inválida para el tenant', { ip: req.ip, ruta: req.path });
      return noAutenticado(res, 'API Key inválida.');
    }

    // El tenant queda ligado a la credencial validada. Nunca del body.
    req.tenantId = rows[0].id;

    next();
  } catch (err) {
    logger.error('Error al verificar API Key', { error: err.message });
    return noAutenticado(res, 'Error al verificar credenciales.');
  }
};

module.exports = { autenticarApiKey };
