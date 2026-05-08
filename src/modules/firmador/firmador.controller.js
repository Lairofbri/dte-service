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

    if (!resultado.disponible) {
      return error(res, resultado.mensaje, 503);
    }

    return exito(res, {
      disponible: true,
      url:        process.env.URL_FIRMADOR,
      mensaje:    resultado.mensaje,
    });
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = { verificarEstado };
