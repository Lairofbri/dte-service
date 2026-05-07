// src/modules/configuracion/configuracion.controller.js
// Orquesta los requests HTTP del módulo de configuración
// Principio S (SOLID): solo recibe, valida y responde — no opera datos
//
// SEGURIDAD: este controller NUNCA devuelve credenciales de Hacienda
// ni tokens en las respuestas HTTP

const service = require('./configuracion.service');
const {
  crearConfiguracionSchema,
  actualizarConfiguracionSchema,
} = require('./configuracion.schema');
const {
  exito,
  creado,
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
  // SEGURIDAD: nunca exponer detalles del error en producción
  logger.error('Error no controlado en configuracion', {
    error: err.message,
    stack: err.stack,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/configuracion
 * Devuelve la configuración del emisor SIN credenciales sensibles
 */
const obtenerConfiguracion = async (req, res) => {
  try {
    const config = await service.obtenerConfiguracionPublica();
    return exito(res, config);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/configuracion
 * Crea la configuración inicial del emisor
 * Solo se puede crear UNA vez
 */
const crearConfiguracion = async (req, res) => {
  const { error: validacionError, value } = crearConfiguracionSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const config = await service.crearConfiguracion({ datos: value });
    return creado(res, config, 'Configuración creada exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * PATCH /api/configuracion
 * Actualiza campos específicos de la configuración
 */
const actualizarConfiguracion = async (req, res) => {
  const { error: validacionError, value } = actualizarConfiguracionSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const config = await service.actualizarConfiguracion({ datos: value });
    return exito(res, config, 'Configuración actualizada exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/configuracion/test-hacienda
 * Prueba la conexión con Hacienda usando las credenciales guardadas
 * Útil para verificar que las credenciales son correctas
 * NO devuelve el token — solo confirma si la conexión funciona
 */
const testHacienda = async (req, res) => {
  try {
    // Importar el servicio de Hacienda dinámicamente
    // para evitar dependencia circular
    const haciendaService = require('../hacienda/hacienda.service');
    const resultado = await haciendaService.autenticar({ forzarRenovacion: true });

    return exito(res, {
      conexion: 'exitosa',
      ambiente: resultado.ambiente,
      mensaje:  'Las credenciales de Hacienda son válidas.',
      // NO incluir el token en la respuesta
    });
  } catch (err) {
    if (err.status && err.mensaje) {
      return error(res, err.mensaje, err.status);
    }
    logger.error('Error al probar conexión con Hacienda', { error: err.message });
    return error(res, 'No se pudo conectar con Hacienda. Verifica las credenciales.', 400);
  }
};

module.exports = {
  obtenerConfiguracion,
  crearConfiguracion,
  actualizarConfiguracion,
  testHacienda,
};
