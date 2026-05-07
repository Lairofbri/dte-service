// src/modules/configuracion/configuracion.schema.js
// Validación Joi para el módulo de configuración
// Principio S (SOLID): solo valida, no opera ni responde

const Joi = require('joi');

// ─────────────────────────────────────────────
// Validadores reutilizables El Salvador
// ─────────────────────────────────────────────

// NIT El Salvador: 0000-000000-000-0
const nitRegex = /^\d{4}-\d{6}-\d{3}-\d{1}$/;

// NRC El Salvador: 1 a 7 dígitos con guión opcional
const nrcRegex = /^\d{1,7}(-\d)?$/;

// Teléfono El Salvador: 8 dígitos
const telefonoRegex = /^(\+503\s?)?[267]\d{3}-?\d{4}$/;

// Password de Hacienda: entre 13 y 25 caracteres
// con letras, números y al menos un carácter especial
// según el manual de acreditamiento de Hacienda
const passwordHaciendaRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{13,25}$/;

// ─────────────────────────────────────────────
// Schema para crear la configuración inicial
// Solo se puede crear UNA vez por instancia
// ─────────────────────────────────────────────
const crearConfiguracionSchema = Joi.object({
  // Datos del emisor
  nit: Joi.string().pattern(nitRegex).required().messages({
    'string.pattern.base': 'El NIT debe tener el formato 0000-000000-000-0.',
    'any.required':        'El NIT del emisor es requerido.',
  }),
  nrc: Joi.string().pattern(nrcRegex).optional().allow('', null).messages({
    'string.pattern.base': 'El NRC no tiene un formato válido.',
  }),
  nombre: Joi.string().min(3).max(200).required().messages({
    'any.required': 'El nombre del emisor es requerido.',
    'string.min':   'El nombre debe tener al menos 3 caracteres.',
  }),
  nombre_comercial:       Joi.string().max(200).optional().allow('', null),
  direccion:              Joi.string().min(5).max(255).required().messages({
    'any.required': 'La dirección es requerida.',
  }),
  telefono: Joi.string().pattern(telefonoRegex).optional().allow('', null).messages({
    'string.pattern.base': 'El teléfono no tiene un formato válido.',
  }),
  email: Joi.string().email({ tlds: { allow: false } }).optional().allow('', null).messages({
    'string.email': 'El email no tiene un formato válido.',
  }),
  codigo_actividad: Joi.string().min(4).max(10).required().messages({
    'any.required': 'El código de actividad económica es requerido.',
  }),
  codigo_establecimiento: Joi.string().length(4).optional().default('0001').messages({
    'string.length': 'El código de establecimiento debe tener 4 dígitos.',
  }),
  codigo_punto_venta: Joi.string().length(4).optional().default('0001').messages({
    'string.length': 'El código de punto de venta debe tener 4 dígitos.',
  }),
  tipo_establecimiento: Joi.string().max(2).optional().default('02'),

  // Credenciales de Hacienda
  // Se validan aquí pero se encriptan en el service antes de guardar
  usuario_hacienda: Joi.string().min(5).max(20).required().messages({
    'any.required': 'El usuario de Hacienda es requerido.',
    'string.min':   'El usuario debe tener al menos 5 caracteres.',
  }),
  password_hacienda: Joi.string().min(13).max(25).required().messages({
    'any.required': 'La contraseña de Hacienda es requerida.',
    'string.min':   'La contraseña de Hacienda debe tener entre 13 y 25 caracteres.',
    'string.max':   'La contraseña de Hacienda debe tener entre 13 y 25 caracteres.',
  }),

  // Ambiente: 00 = pruebas, 01 = producción
  ambiente: Joi.string().valid('00', '01').optional().default('00').messages({
    'any.only': 'El ambiente debe ser 00 (pruebas) o 01 (producción).',
  }),
});

// ─────────────────────────────────────────────
// Schema para actualizar la configuración
// Todos los campos opcionales, mínimo uno
// Las credenciales de Hacienda se re-encriptan si se actualizan
// ─────────────────────────────────────────────
const actualizarConfiguracionSchema = Joi.object({
  nit:                    Joi.string().pattern(nitRegex).optional(),
  nrc:                    Joi.string().pattern(nrcRegex).optional().allow('', null),
  nombre:                 Joi.string().min(3).max(200).optional(),
  nombre_comercial:       Joi.string().max(200).optional().allow('', null),
  direccion:              Joi.string().min(5).max(255).optional(),
  telefono:               Joi.string().pattern(telefonoRegex).optional().allow('', null),
  email:                  Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  codigo_actividad:       Joi.string().min(4).max(10).optional(),
  codigo_establecimiento: Joi.string().length(4).optional(),
  codigo_punto_venta:     Joi.string().length(4).optional(),
  tipo_establecimiento:   Joi.string().max(2).optional(),
  usuario_hacienda:       Joi.string().min(5).max(20).optional(),
  password_hacienda:      Joi.string().min(13).max(25).optional(),
  ambiente:               Joi.string().valid('00', '01').optional(),
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar.',
});

module.exports = {
  crearConfiguracionSchema,
  actualizarConfiguracionSchema,
};
