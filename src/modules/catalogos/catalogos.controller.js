// src/modules/catalogos/catalogos.controller.js
// Orquesta los requests HTTP del módulo de catálogos de Hacienda
// Principio S (SOLID): solo recibe, valida y responde — no opera datos

const service = require('./catalogos.service');
const {
  exito,
  error,
  errorServidor,
} = require('../../utils/response');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// Helper: manejo de errores del service
// ─────────────────────────────────────────────
const manejarError = (res, err) => {
  if (err.status && err.mensaje) {
    return error(res, err.mensaje, err.status);
  }
  logger.error('Error no controlado en catalogos', {
    error: err.message,
    stack: err.stack,
  });
  return errorServidor(res);
};

/**
 * GET /api/catalogos/:catalogo
 * Devuelve el listado código/descripción de un catálogo oficial de Hacienda.
 */
const listarCatalogo = async (req, res) => {
  try {
    const filas = await service.listarCatalogo({
      catalogo: req.params.catalogo,
    });
    return exito(res, filas);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  listarCatalogo,
};