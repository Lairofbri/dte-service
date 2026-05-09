// src/modules/contingencia/contingencia.controller.js
// Orquesta los requests HTTP del módulo de contingencia
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → passwordPri se extrae del body y se pasa al service — nunca se loguea
// → Errores clasificados correctamente
// → UUID validado antes de consultar lote

const service = require('./contingencia.service');
const { notificarContingenciaSchema } = require('./contingencia.schema');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
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
  logger.error('Error no controlado en contingencia', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/contingencia/pendientes
 * Lista todos los DTEs en estado contingencia pendientes de procesar
 */
const obtenerPendientes = async (req, res) => {
  try {
    const resultado = await service.obtenerDTEsEnContingencia();
    return exito(res, resultado);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/contingencia/notificar
 * Notifica el evento de contingencia a Hacienda y envía los DTEs pendientes
 * Requiere passwordPri para firmar el evento
 */
const notificarContingencia = async (req, res) => {
  const { error: validacionError, value } = notificarContingenciaSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // Extraer passwordPri antes de pasarlo al service
  // para que quede claro que es un dato sensible que se maneja aparte
  const { password_pri, ...datos } = value;

  try {
    const resultado = await service.notificarContingencia({
      datos,
      passwordPri: password_pri,
      ip:          req.ip,
    });

    return exito(res, resultado, 'Contingencia notificada y DTEs enviados a Hacienda.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/contingencia/lote/:codigoLote
 * Consulta el estado de un lote enviado a Hacienda
 * Los lotes se procesan de forma asíncrona
 */
const consultarLote = async (req, res) => {
  const { codigoLote } = req.params;

  // Validar formato UUID del codigoLote
  if (!esUuidValido(codigoLote)) {
    return error(res, 'El código de lote no tiene un formato UUID válido.', 400);
  }

  try {
    const resultado = await service.consultarLote({ codigoLote });
    return exito(res, resultado);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  obtenerPendientes,
  notificarContingencia,
  consultarLote,
};
