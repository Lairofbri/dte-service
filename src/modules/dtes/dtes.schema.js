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
  nombre:           Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre es requerido.',
    'string.min':   'El nombre no puede estar vacío.',
  }),
  nombre_comercial: Joi.string().max(150).optional().allow('', null),
  telefono:         Joi.string().min(8).max(20).optional().allow('', null),
  correo:           Joi.string().pattern(correoRegex).max(150)
    .optional().allow('', null)
    .messages({ 'string.pattern.base': 'El correo no tiene un formato válido.' }),
  // H4 FIX: departamento y municipio se validan juntos en custom
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:    Joi.string().length(2).pattern(/^[0-9]{2}$/)
    .optional().allow(null)
    .messages({ 'string.pattern.base': 'El código de municipio debe ser numérico (00-99).' }),
  direccion:        Joi.string().max(250).optional().allow('', null),
};

// ─────────────────────────────────────────────
// HELPER: validación cruzada compartida
// Aplica tanto a crear como a actualizar (con contexto del registro existente)
// ─────────────────────────────────────────────
const validarIntegridadCliente = (value, helpers) => {
  const tipo = value.tipo_cliente;

  // H1 FIX: jurídico requiere NIT + NRC + actividad + dirección
  // Hacienda rechaza CCF sin estos campos del receptor
  if (tipo === 'juridico') {
    if (!value.nit) {
      return helpers.error('any.custom', {
        message: 'El NIT es obligatorio para clientes jurídicos (CCF/FSE).',
      });
    }
    if (!value.nrc) {
      return helpers.error('any.custom', {
        message: 'El NRC es obligatorio para clientes jurídicos. Hacienda lo exige en CCF.',
      });
    }
    if (!value.cod_actividad) {
      return helpers.error('any.custom', {
        message: 'El código de actividad económica es obligatorio para clientes jurídicos.',
      });
    }
    if (!value.desc_actividad) {
      return helpers.error('any.custom', {
        message: 'La descripción de actividad económica es obligatoria para clientes jurídicos.',
      });
    }
  }

  // H2 FIX: tipo_documento requerido cuando hay num_documento — sin defaults silenciosos
  if (value.tipo_cliente === 'natural' && value.num_documento && !value.tipo_documento) {
    return helpers.error('any.custom', {
      message: 'El tipo de documento es requerido cuando se proporciona un número de documento.',
    });
  }

  // H4 FIX: municipio requiere departamento — Hacienda los valida juntos en el JSON del receptor
  if (value.municipio_cod && !value.departamento_cod) {
    return helpers.error('any.custom', {
      message: 'Debe indicar el departamento cuando se especifica el municipio.',
    });
  }

  return value;
};

// ─────────────────────────────────────────────
// Schema crear cliente
// ─────────────────────────────────────────────
const crearClienteSchema = Joi.object({
  tipo_cliente: Joi.string().valid('natural', 'juridico').required().messages({
    'any.required': 'El tipo de cliente es requerido (natural o juridico).',
    'any.only':     'El tipo de cliente debe ser "natural" o "juridico".',
  }),
  ...camposComunes,

  // Persona natural (FCF) — tipo_documento requerido si hay num_documento (ver custom)
  tipo_documento: Joi.string().valid('36', '13', '02', '03', '37')
    .optional().allow(null),
  num_documento:  Joi.string().min(3).max(30).optional().allow('', null),

  // Jurídico (CCF / FSE) — NIT + NRC obligatorios para jurídico (ver custom)
  nit:            Joi.string().pattern(nitRegex).optional().allow('', null)
    .messages({ 'string.pattern.base': 'El NIT debe tener formato 0000-000000-000-0.' }),
  nrc:            Joi.string().pattern(nrcRegex).optional().allow('', null)
    .messages({ 'string.pattern.base': 'El NRC no tiene un formato válido.' }),
  cod_actividad:  Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad: Joi.string().min(3).max(500).optional().allow('', null),
}).custom(validarIntegridadCliente).messages({ 'any.custom': '{{#message}}' });

// ─────────────────────────────────────────────
// Schema actualizar
// H5 FIX: validación de integridad post-update según tipo_cliente
// El tipo_cliente no se puede cambiar — viene en el contexto del registro
// La validación cruzada se hace en el service con los datos combinados
// ─────────────────────────────────────────────
const actualizarClienteSchema = Joi.object({
  nombre:           Joi.string().min(1).max(250).optional(),
  nombre_comercial: Joi.string().max(150).optional().allow('', null),

  // Natural
  tipo_documento:   Joi.string().valid('36', '13', '02', '03', '37').optional().allow(null),
  num_documento:    Joi.string().min(3).max(30).optional().allow('', null),

  // Jurídico — NIT/NRC no pueden enviarse como null explícito (integridad en service)
  nit:              Joi.string().pattern(nitRegex).optional()
    .messages({ 'string.pattern.base': 'El NIT debe tener formato 0000-000000-000-0.' }),
  nrc:              Joi.string().pattern(nrcRegex).optional()
    .messages({ 'string.pattern.base': 'El NRC no tiene un formato válido.' }),
  cod_actividad:    Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad:   Joi.string().min(3).max(500).optional().allow('', null),

  // Contacto
  telefono:         Joi.string().min(8).max(20).optional().allow('', null),
  correo:           Joi.string().pattern(correoRegex).max(150).optional().allow('', null),

  // Dirección — H4: municipio requiere departamento (validado en service con datos combinados)
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:    Joi.string().length(2).pattern(/^[0-9]{2}$/).optional().allow(null),
  direccion:        Joi.string().max(250).optional().allow('', null),
}).custom((value, helpers) => {
  // H4 FIX en update: si se envía municipio sin departamento en el mismo payload
  if (value.municipio_cod && !value.departamento_cod) {
    return helpers.error('any.custom', {
      message: 'Debe indicar el departamento cuando se especifica el municipio.',
    });
  }
  return value;
}).messages({ 'any.custom': '{{#message}}' });

// ─────────────────────────────────────────────
// Schema búsqueda / filtros
// ─────────────────────────────────────────────
const buscarClientesSchema = Joi.object({
  q:            Joi.string().min(1).max(100).optional(),
  tipo_cliente: Joi.string().valid('natural', 'juridico').optional(),
  pagina:       Joi.number().integer().min(1).optional().default(1),
  limite:       Joi.number().integer().min(1).max(50).optional().default(10),
});

module.exports = {
  crearClienteSchema,
  actualizarClienteSchema,
  buscarClientesSchema,
};
