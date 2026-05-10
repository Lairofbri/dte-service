// src/modules/usuarios/usuarios.controller.js
// Orquesta los requests HTTP del módulo de usuarios
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → UUID validado en req.params.id antes de llamar al service
// → Password NUNCA en logs ni respuestas
// → Errores clasificados correctamente

const service = require('./usuarios.service');
const {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
} = require('./usuarios.schema');
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
  logger.error('Error no controlado en usuarios', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /api/usuarios
 * Lista todos los usuarios con datos de su establecimiento
 * Query param: solo_activos=true
 */
const listarUsuarios = async (req, res) => {
  const soloActivos = req.query.solo_activos === 'true';
  try {
    const usuarios = await service.listarUsuarios({ soloActivos });
    return exito(res, usuarios);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/usuarios/:id
 * Detalle de un usuario — sin password_hash
 */
const obtenerUsuario = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del usuario no tiene un formato UUID válido.', 400);
  }
  try {
    const usuario = await service.obtenerUsuario({ id: req.params.id });
    return exito(res, usuario);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/usuarios
 * Crea un nuevo usuario con password hasheado
 */
const crearUsuario = async (req, res) => {
  const { error: validacionError, value } = crearUsuarioSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // Validar UUID del establecimiento_id
  if (!esUuidValido(value.establecimiento_id)) {
    return error(res, 'El establecimiento_id no tiene un formato UUID válido.', 400);
  }

  try {
    const usuario = await service.crearUsuario({ datos: value });
    return creado(res, usuario, 'Usuario creado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * PATCH /api/usuarios/:id
 * Actualiza campos específicos de un usuario
 * Si se envía password se hashea con bcrypt
 */
const actualizarUsuario = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del usuario no tiene un formato UUID válido.', 400);
  }

  const { error: validacionError, value } = actualizarUsuarioSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // Validar UUID del establecimiento_id si se envía
  if (value.establecimiento_id && !esUuidValido(value.establecimiento_id)) {
    return error(res, 'El establecimiento_id no tiene un formato UUID válido.', 400);
  }

  try {
    const usuario = await service.actualizarUsuario({
      id:    req.params.id,
      datos: value,
    });
    return exito(res, usuario, 'Usuario actualizado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * DELETE /api/usuarios/:id
 * Desactiva un usuario (soft delete)
 * Nunca elimina — historial de auditoría lo referencia
 */
const desactivarUsuario = async (req, res) => {
  if (!esUuidValido(req.params.id)) {
    return error(res, 'El ID del usuario no tiene un formato UUID válido.', 400);
  }
  try {
    await service.desactivarUsuario({ id: req.params.id });
    return exito(res, null, 'Usuario desactivado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  desactivarUsuario,
};
