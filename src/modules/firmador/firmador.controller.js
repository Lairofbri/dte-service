// src/modules/firmador/firmador.controller.js
// Expone endpoints HTTP del módulo firmador
// Solo expone el endpoint de verificación de estado
// La firma en sí es interna — la llama el módulo de DTEs
//
// SEGURIDAD:
// → El endpoint de firma NO está expuesto directamente
// → passwordPri NUNCA aparece en logs ni respuestas
// → Solo se expone el health check del firmador

const service = require('./firmador.service');
const {
  exito,
  error,
  errorServidor,
} = require('../../utils/response');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// Helper: manejo de errores
// ─────────────────────────────────────────────
const manejarError = (res, err) => {
  if (err.status && err.mensaje) {
    return error(res, err.mensaje, err.status);
  }
  logger.error('Error no controlado en firmador', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/firmador/estado
 * Verifica que el firmador esté corriendo y disponible
 * No envía credenciales — solo verifica conectividad
 */
const verificarEstado = async (req, res) => {
  try {
    const resultado = await service.verificarFirmador();

    // DESPUÉS
    if (!resultado.disponible) {
    // Loguear el mensaje técnico internamente
      logger.warn('Firmador no disponible', { mensaje: resultado.mensaje });
      // Devolver mensaje genérico al cliente
      return error(res, 'El servicio de firma no está disponible en este momento.', 503);
    }

return exito(res, {
  disponible: true,
  // No exponer la URL interna del firmador al cliente
  mensaje: 'El servicio de firma está disponible.',
});
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = { verificarEstado };
