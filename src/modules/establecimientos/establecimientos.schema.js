// src/modules/establecimientos/establecimientos.schema.js
// Validación Joi para el módulo de establecimientos
// Principio S (SOLID): solo valida, no opera ni responde
//
// IMPORTANTE: Los códigos cod_estable_mh y cod_punto_venta_mh
// los asigna Hacienda durante el acreditamiento — no son libres
// El cliente debe copiarlos exactamente del documento de Hacienda

const Joi = require('joi');

// Código de establecimiento: 4 caracteres alfanuméricos
// Según formato del número de control: DTE-01-{XXXXXXXX}-...
// Hacienda usa 4 dígitos numéricos típicamente
const codEstableRegex = /^[A-Z0-9]{1,4}$/;

/**
 * Schema para crear un establecimiento
 * cod_estable_mh y cod_punto_venta_mh vienen del documento de Hacienda
 */
const crearEstablecimientoSchema = Joi.object({
  // ── Códigos de Hacienda — vienen del documento de acreditamiento ──
  cod_estable_mh: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .required()
    .messages({
      'string.pattern.base': 'cod_estable_mh debe tener 1-4 caracteres alfanuméricos (del documento de Hacienda).',
      'any.required':        'El código de establecimiento de Hacienda es requerido.',
    }),
  cod_punto_venta_mh: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .required()
    .messages({
      'string.pattern.base': 'cod_punto_venta_mh debe tener 1-4 caracteres alfanuméricos (del documento de Hacienda).',
      'any.required':        'El código de punto de venta de Hacienda es requerido.',
    }),

  // ── Códigos internos — opcionales, por defecto iguales a los de Hacienda ──
  cod_estable: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional()
    .messages({
      'string.pattern.base': 'cod_estable debe tener 1-4 caracteres alfanuméricos.',
    }),
  cod_punto_venta: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional()
    .messages({
      'string.pattern.base': 'cod_punto_venta debe tener 1-4 caracteres alfanuméricos.',
    }),

  // ── Datos descriptivos de la sucursal ──
  nombre: Joi.string().min(3).max(150).required().messages({
    'string.min':   'El nombre debe tener al menos 3 caracteres.',
    'any.required': 'El nombre de la sucursal es requerido.',
  }),
  direccion: Joi.string().min(5).max(255).required().messages({
    'string.min':   'La dirección debe tener al menos 5 caracteres.',
    'any.required': 'La dirección de la sucursal es requerida.',
  }),
  departamento_cod: Joi.string()
    .length(2)
    .pattern(/^(0[1-9]|1[0-4])$/)
    .required()
    .messages({
      'string.pattern.base': 'El código de departamento debe ser del 01 al 14.',
      'string.length':       'El código de departamento debe tener 2 dígitos.',
      'any.required':        'El código de departamento es requerido.',
    }),
  municipio_cod: Joi.string()
    .length(2)
    .pattern(/^(0[1-9]|[1-9][0-9])$/)
    .required()
    .messages({
      'string.pattern.base': 'El código de municipio debe ser numérico del 01 al 99.',
      'string.length':       'El código de municipio debe tener 2 dígitos.',
      'any.required':        'El código de municipio es requerido.',
    }),
  telefono: Joi.string().max(20).optional().allow('', null),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .optional()
    .allow('', null)
    .messages({
      'string.email': 'El email no tiene un formato válido.',
    }),
});

/**
 * Schema para actualizar un establecimiento
 * IMPORTANTE: cod_estable_mh NO se puede actualizar si tiene DTEs emitidos
 * Esa validación se hace en el service — no en el schema
 * Todos los campos opcionales — mínimo uno
 */
const actualizarEstablecimientoSchema = Joi.object({
  // cod_estable_mh se puede intentar actualizar
  // pero el service lo rechazará si tiene DTEs emitidos
  cod_estable_mh: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional()
    .messages({
      'string.pattern.base': 'cod_estable_mh debe tener 1-4 caracteres alfanuméricos.',
    }),
  cod_punto_venta_mh: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional()
    .messages({
      'string.pattern.base': 'cod_punto_venta_mh debe tener 1-4 caracteres alfanuméricos.',
    }),
  cod_estable: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional(),
  cod_punto_venta: Joi.string()
    .uppercase()
    .pattern(codEstableRegex)
    .optional(),
  nombre:          Joi.string().min(3).max(150).optional(),
  direccion:       Joi.string().min(5).max(255).optional(),
  departamento_cod: Joi.string()
    .length(2)
    .pattern(/^(0[1-9]|1[0-4])$/)
    .optional()
    .messages({
      'string.pattern.base': 'El código de departamento debe ser del 01 al 14.',
    }),
  municipio_cod: Joi.string()
    .length(2)
    .pattern(/^(0[1-9]|[1-9][0-9])$/)
    .optional()
    .messages({
      'string.pattern.base': 'El código de municipio debe ser numérico del 01 al 99.',
    }),
  telefono: Joi.string().max(20).optional().allow('', null),
  email:    Joi.string()
    .email({ tlds: { allow: false } })
    .optional()
    .allow('', null),
  // activo: permite activar y desactivar el establecimiento
  activo: Joi.boolean().optional().messages({
    'boolean.base': 'El campo activo debe ser verdadero o falso.',
  }),
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar.',
});

module.exports = {
  crearEstablecimientoSchema,
  actualizarEstablecimientoSchema,
};
