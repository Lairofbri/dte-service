// src/middlewares/internal.middleware.js
// Autenticación servidor-a-servidor para rutas internas de provisión (Fase 2).
//
// Las rutas /internal/provisioning/* NO son públicas ni usan la API Key
// técnica del POS: usan una clave interna distinta (env INTERNAL_API_KEY),
// comparada en tiempo constante. Si la clave no está configurada, el
// servicio falla cerrado (503) — nunca se habilitan rutas internas sin
// credencial.
//
// Se lee de process.env directamente (no de config/env.js) para que el
// módulo sea unit-testable sin variable DATABASE_URL en el entorno.

const crypto = require('crypto');
const { noAutenticado, errorServidor } = require('../utils/response');
const logger = require('../utils/logger');

const autenticarApiKeyInterna = (req, res, next) => {
  const claveConfigurada = process.env.INTERNAL_API_KEY;

  if (!claveConfigurada) {
    logger.error('INTERNAL_API_KEY no configurada — rutas internas deshabilitadas');
    return errorServidor(res, 'Configuración interna incompleta. Contacta al administrador.');
  }

  const recibida = req.headers['x-internal-api-key'];
  if (!recibida) {
    return noAutenticado(res, 'Clave interna requerida.');
  }

  const a = Buffer.from(String(recibida));
  const b = Buffer.from(claveConfigurada);
  const coinciden = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!coinciden) {
    logger.warn('Clave interna inválida', { ip: req.ip, ruta: req.path });
    return noAutenticado(res, 'Clave interna inválida.');
  }

  req.origenInterno = 'pos';
  return next();
};

module.exports = { autenticarApiKeyInterna };