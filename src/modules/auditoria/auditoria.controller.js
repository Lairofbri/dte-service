// src/modules/auditoria/auditoria.controller.js
// Orquesta los requests HTTP del módulo de auditoría
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → Solo GET — nunca POST, PUT, DELETE
// → UUID validado en req.params.id antes de llamar al service
// → Number() + isInteger() en paginación — nunca parseInt
// → Filtro de dte_id validado como UUID antes de usar

const service = require('./auditoria.service');
const { filtrosAuditoriaSchema } = require('./auditoria.schema');
const { esUuidValido }           = require('../../middlewares/uuid.middleware');
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
  logger.error('Error no controlado en auditoria', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/auditoria
 * Lista registros de auditoría con filtros y paginación
 */
const listarAuditoria = async (req, res) => {
  // Paginación con Number() + isInteger() — nunca parseInt
  const paginaRaw = req.query.pagina ? Number(req.query.pagina) : 1;
  const limiteRaw = req.query.limite ? Number(req.query.limite) : 50;

  if (req.query.pagina && (!Number.isInteger(paginaRaw) || paginaRaw < 1)) {
    return error(res, 'El parámetro pagina debe ser un número entero positivo.', 400);
  }
  if (req.query.limite && (!Number.isInteger(limiteRaw) || limiteRaw < 1)) {
    return error(res, 'El parámetro limite debe ser un número entero positivo.', 400);
  }

  // Validar dte_id si se provee — antes de pasar al schema
  if (req.query.dte_id && !esUuidValido(req.query.dte_id)) {
    return error(res, 'El parámetro dte_id no tiene un formato UUID válido.', 400);
  }

  const { error: validacionError, value: filtros } = filtrosAuditoriaSchema.validate({
    ...req.query,
    pagina: paginaRaw,
    limite: limiteRaw,
  });

  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.listarAuditoria({ filtros });
    return exito(res, resultado);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/auditoria/resumen
 * Resumen estadístico de eventos y DTEs
 * Ruta específica ANTES de /:id para evitar conflicto con Express
 */
const obtenerResumen = async (req, res) => {
  try {
    const resumen = await service.obtenerResumen();
    return exito(res, resumen);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/auditoria/:id
 * Detalle de un registro de auditoría
 * UUID validado antes de llamar al service
 */
const obtenerRegistro = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del registro no tiene un formato UUID válido.', 400);
  }

  try {
    const registro = await service.obtenerRegistro({ id: req.params.id });
    return exito(res, registro);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  listarAuditoria,
  obtenerResumen,
  obtenerRegistro,
};
