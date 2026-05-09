// src/modules/establecimientos/establecimientos.controller.js
// Orquesta los requests HTTP del módulo de establecimientos
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → UUID validado en req.params.id antes de llamar al service
// → Errores clasificados correctamente
// → Nunca exponer err.message al cliente

const service = require('./establecimientos.service');
const {
  crearEstablecimientoSchema,
  actualizarEstablecimientoSchema,
} = require('./establecimientos.schema');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
const {
  exito,
  creado,
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
  logger.error('Error no controlado en establecimientos', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/establecimientos
 * Lista todos los establecimientos con conteo de DTEs
 * Query param: solo_activos=true para filtrar inactivos
 */
const listarEstablecimientos = async (req, res) => {
  const soloActivos = req.query.solo_activos === 'true';

  try {
    const establecimientos = await service.listarEstablecimientos({ soloActivos });
    return exito(res, establecimientos);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/establecimientos/:id
 * Detalle de un establecimiento
 * UUID validado antes de llamar al service
 */
const obtenerEstablecimiento = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del establecimiento no tiene un formato UUID válido.', 400);
  }

  try {
    const establecimiento = await service.obtenerEstablecimiento({ id: req.params.id });
    return exito(res, establecimiento);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/establecimientos
 * Crea un nuevo establecimiento con sus correlativos inicializados
 */
const crearEstablecimiento = async (req, res) => {
  const { error: validacionError, value } = crearEstablecimientoSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const establecimiento = await service.crearEstablecimiento({ datos: value });
    return creado(res, establecimiento, 'Establecimiento creado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * PATCH /api/establecimientos/:id
 * Actualiza campos específicos de un establecimiento
 * cod_estable_mh no se puede cambiar si tiene DTEs emitidos
 */
const actualizarEstablecimiento = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del establecimiento no tiene un formato UUID válido.', 400);
  }

  const { error: validacionError, value } = actualizarEstablecimientoSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const establecimiento = await service.actualizarEstablecimiento({
      id:    req.params.id,
      datos: value,
    });
    return exito(res, establecimiento, 'Establecimiento actualizado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * DELETE /api/establecimientos/:id
 * Desactiva un establecimiento (soft delete)
 * Nunca elimina — los DTEs históricos lo referencian
 */
const desactivarEstablecimiento = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del establecimiento no tiene un formato UUID válido.', 400);
  }

  try {
    await service.desactivarEstablecimiento({ id: req.params.id });
    return exito(res, null, 'Establecimiento desactivado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  listarEstablecimientos,
  obtenerEstablecimiento,
  crearEstablecimiento,
  actualizarEstablecimiento,
  desactivarEstablecimiento,
};
