// src/modules/usuarios/usuarios.schema.js
// Validación Joi para el módulo de usuarios
// Principio S (SOLID): solo valida, no opera ni responde
//
// SEGURIDAD:
// → Password validado con complejidad estricta
// → Password NUNCA en logs ni respuestas
// → Email único verificado en service (no solo en BD)

const Joi = require('joi');

// ─────────────────────────────────────────────
// VALIDADORES REUTILIZABLES
// ─────────────────────────────────────────────

// Password con complejidad mínima
// Al menos: 1 mayúscula, 1 minúscula, 1 número, 1 especial
// Entre 8 y 50 caracteres
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,50}$/;

/**
 * Schema para crear un usuario
 */
const crearUsuarioSchema = Joi.object({
  nombre: Joi.string().min(3).max(100).required().messages({
    'string.min':   'El nombre debe tener al menos 3 caracteres.',
    'any.required': 'El nombre es requerido.',
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .required()
    .messages({
      'string.email': 'El email no tiene un formato válido.',
      'any.required': 'El email es requerido.',
    }),
  // Password con complejidad estricta
  // NUNCA se almacena — se hashea con bcrypt antes de guardar
  password: Joi.string()
    .pattern(passwordRegex)
    .required()
    .messages({
      'string.pattern.base': 'El password debe tener entre 8 y 50 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial.',
      'any.required':        'El password es requerido.',
    }),
  rol: Joi.string()
    .valid('administrador', 'operador')
    .required()
    .messages({
      'any.only':     'El rol debe ser administrador u operador.',
      'any.required': 'El rol es requerido.',
    }),
  establecimiento_id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.uuid':  'El establecimiento_id debe ser un UUID válido.',
      'any.required': 'El establecimiento es requerido.',
    }),
});

/**
 * Schema para actualizar un usuario
 * Password opcional — solo si se quiere cambiar
 * Todos los campos opcionales — mínimo uno
 * Sin .default() — nunca sobrescribir datos existentes
 */
const actualizarUsuarioSchema = Joi.object({
  nombre: Joi.string().min(3).max(100).optional().messages({
    'string.min': 'El nombre debe tener al menos 3 caracteres.',
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .optional()
    .messages({
      'string.email': 'El email no tiene un formato válido.',
    }),
  // Password opcional en actualización
  // Si se envía debe cumplir la misma complejidad
  password: Joi.string()
    .pattern(passwordRegex)
    .optional()
    .messages({
      'string.pattern.base': 'El password debe tener entre 8 y 50 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial.',
    }),
  rol: Joi.string()
    .valid('administrador', 'operador')
    .optional()
    .messages({
      'any.only': 'El rol debe ser administrador u operador.',
    }),
  establecimiento_id: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.uuid': 'El establecimiento_id debe ser un UUID válido.',
    }),
  activo: Joi.boolean().optional().messages({
    'boolean.base': 'El campo activo debe ser verdadero o falso.',
  }),
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar.',
});

module.exports = {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
};
