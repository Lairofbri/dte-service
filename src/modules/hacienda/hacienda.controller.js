// src/modules/hacienda/hacienda.controller.js
// Expone endpoints HTTP del módulo de Hacienda
// La mayoría de métodos son internos — solo se exponen los necesarios
//
// SEGURIDAD:
// → Nunca devolver el token de Hacienda en respuestas HTTP
// → Clasificar errores correctamente: 400 cliente, 502 Hacienda, 503 conexión, 500 servidor

const service = require('./hacienda.service');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
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
  logger.error('Error no controlado en hacienda', {
    error: err.message,
    stack: err.stack,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * POST /api/hacienda/autenticar
 * Fuerza la renovación del token de Hacienda
 * Útil para verificar que las credenciales funcionan
 * NO devuelve el token — solo confirma si la autenticación fue exitosa
 */
const autenticar = async (req, res) => {
  try {
    const resultado = await service.autenticar({ forzarRenovacion: true });
    return exito(res, {
      autenticado: true,
      ambiente:    resultado.ambiente,
      ambiente_descripcion: resultado.ambiente === '00' ? 'Pruebas' : 'Producción',
      // NUNCA incluir el token en la respuesta
    }, 'Autenticación con Hacienda exitosa.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/hacienda/estado/:codigoGeneracion
 * Consulta el estado de un DTE en Hacienda
 * El codigoGeneracion es el UUID del DTE
 */
const consultarEstado = async (req, res) => {
  const { codigoGeneracion } = req.params;
  const { tipo_dte } = req.query;

  // Validar UUID del codigoGeneracion
  if (!esUuidValido(codigoGeneracion)) {
    return error(res, 'El código de generación no tiene un formato UUID válido.', 400);
  }

  // Validar tipo_dte
  if (!tipo_dte || !['01', '03', '06', '07'].includes(tipo_dte)) {
    return error(res, 'El parámetro tipo_dte es requerido y debe ser 01, 03, 06 o 07.', 400);
  }

  try {
    const estado = await service.consultarDTE({
      codigoGeneracion,
      tipoDte: tipo_dte,
    });

    return exito(res, {
      estado:           estado.estado,
      codigo_generacion: codigoGeneracion,
      sello_recibido:   estado.selloRecibido || null,
      fh_procesamiento: estado.fhProcesamiento || null,
      codigo_msg:       estado.codigoMsg,
      descripcion:      estado.descripcionMsg,
      observaciones:    estado.observaciones || [],
    });
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  autenticar,
  consultarEstado,
};
