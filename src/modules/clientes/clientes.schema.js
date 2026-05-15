// src/modules/clientes/clientes.schema.js
// Validación Joi para clientes
// Campos basados en requerimientos Hacienda por tipo de DTE

const Joi = require('joi');

const nitRegex    = /^\d{4}-\d{6}-\d{3}-\d{1}$/;
const nrcRegex    = /^\d{1,7}(-\d)?$/;
const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────
// Campos comunes a natural y jurídico
// ─────────────────────────────────────────────
const camposComunes = {
  nombre:          Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre es requerido.',
    'string.min':   'El nombre no puede estar vacío.',
  }),
  nombre_comercial: Joi.string().max(150).optional().allow('', null),
  telefono:         Joi.string().min(8).max(20).optional().allow('', null),
  correo:           Joi.string().pattern(correoRegex).max(150)
    .optional().allow('', null)
    .messages({ 'string.pattern.base': 'El correo no tiene un formato válido.' }),
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:    Joi.string().length(2).pattern(/^[0-9]{2}$/)
    .optional().allow(null)
    .messages({ 'string.pattern.base': 'El código de municipio debe ser numérico (00-99).' }),
  direccion:        Joi.string().max(250).optional().allow('', null),
};

// ─────────────────────────────────────────────
// Schema crear cliente
// Usa superRefine para validar según tipo_cliente
// ─────────────────────────────────────────────
const crearClienteSchema = Joi.object({
  tipo_cliente:  Joi.string().valid('natural', 'juridico').required().messages({
    'any.required': 'El tipo de cliente es requerido (natural o juridico).',
    'any.only':     'El tipo de cliente debe ser "natural" o "juridico".',
  }),
  ...camposComunes,

  // Persona natural (FCF)
  tipo_documento: Joi.string().valid('36', '13', '02', '03', '37')
    .optional().allow(null),
  num_documento:  Joi.string().min(3).max(30).optional().allow('', null),

  // Jurídico (CCF / FSE)
  nit:            Joi.string().pattern(nitRegex).optional().allow('', null)
    .messages({ 'string.pattern.base': 'El NIT debe tener formato 0000-000000-000-0.' }),
  nrc:            Joi.string().pattern(nrcRegex).optional().allow('', null)
    .messages({ 'string.pattern.base': 'El NRC no tiene un formato válido.' }),
  cod_actividad:  Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad: Joi.string().min(3).max(500).optional().allow('', null),
}).custom((value, helpers) => {
  // Jurídico: NIT obligatorio
  if (value.tipo_cliente === 'juridico' && !value.nit) {
    return helpers.error('any.custom', {
      message: 'El NIT es obligatorio para clientes jurídicos (CCF/FSE).',
    });
  }
  // Natural: al menos tipo o num de documento si se provee
  if (value.tipo_cliente === 'natural' && value.num_documento && !value.tipo_documento) {
    return helpers.error('any.custom', {
      message: 'Si se provee el número de documento, debe indicar el tipo.',
    });
  }
  return value;
}).messages({ 'any.custom': '{{#message}}' });

// ─────────────────────────────────────────────
// Schema actualizar (todos opcionales excepto nombre)
// ─────────────────────────────────────────────
const actualizarClienteSchema = Joi.object({
  nombre:          Joi.string().min(1).max(250).optional(),
  nombre_comercial: Joi.string().max(150).optional().allow('', null),
  tipo_documento:  Joi.string().valid('36', '13', '02', '03', '37').optional().allow(null),
  num_documento:   Joi.string().min(3).max(30).optional().allow('', null),
  nit:             Joi.string().pattern(nitRegex).optional().allow('', null)
    .messages({ 'string.pattern.base': 'El NIT debe tener formato 0000-000000-000-0.' }),
  nrc:             Joi.string().pattern(nrcRegex).optional().allow('', null),
  cod_actividad:   Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad:  Joi.string().min(3).max(500).optional().allow('', null),
  telefono:        Joi.string().min(8).max(20).optional().allow('', null),
  correo:          Joi.string().pattern(correoRegex).max(150).optional().allow('', null),
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:   Joi.string().length(2).pattern(/^[0-9]{2}$/).optional().allow(null),
  direccion:       Joi.string().max(250).optional().allow('', null),
});

// ─────────────────────────────────────────────
// Schema búsqueda / filtros
// ─────────────────────────────────────────────
const buscarClientesSchema = Joi.object({
  q:            Joi.string().min(1).max(100).optional(), // búsqueda general
  tipo_cliente: Joi.string().valid('natural', 'juridico').optional(),
  pagina:       Joi.number().integer().min(1).optional().default(1),
  limite:       Joi.number().integer().min(1).max(50).optional().default(10),
});

module.exports = {
  crearClienteSchema,
  actualizarClienteSchema,
  buscarClientesSchema,
};
