// src/modules/dtes/dtes.schema.js
// Validación Joi para el módulo de DTEs
// Basado en los esquemas JSON oficiales del Ministerio de Hacienda
// Principio S (SOLID): solo valida, no opera ni responde

const Joi = require('joi');

// ─────────────────────────────────────────────
// VALIDADORES REUTILIZABLES
// ─────────────────────────────────────────────

// NIT El Salvador: 0000-000000-000-0
const nitRegex = /^\d{4}-\d{6}-\d{3}-\d{1}$/;

// NRC El Salvador: 1 a 7 dígitos con guión opcional
const nrcRegex = /^\d{1,7}(-\d)?$/;

// Schema de un item de la orden
const itemSchema = Joi.object({
  nombre_producto: Joi.string().min(1).max(1000).required().messages({
    'any.required': 'El nombre del producto es requerido.',
  }),
  precio_unitario: Joi.number().min(0).required().messages({
    'number.min':   'El precio unitario no puede ser negativo.',
    'any.required': 'El precio unitario es requerido.',
  }),
  cantidad: Joi.number().min(0.00000001).required().messages({
    'number.min':   'La cantidad debe ser mayor a cero.',
    'any.required': 'La cantidad es requerida.',
  }),
  descuento:  Joi.number().min(0).optional().default(0),
  codigo:     Joi.string().max(25).optional().allow('', null),
});

// Schema del receptor para FCF (opcional salvo monto >= $1,095)
const receptorFCFSchema = Joi.object({
  nombre:           Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre del receptor es requerido.',
  }),
  tipo_documento:   Joi.string().valid('36', '13', '02', '03', '37').optional().allow(null),
  numero_documento: Joi.string().min(3).max(20).optional().allow('', null),
  email:            Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  telefono:         Joi.string().min(8).max(30).optional().allow('', null),
  direccion:        Joi.string().max(200).optional().allow('', null),
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:    Joi.string().length(2).optional().allow(null),
});

// Schema del receptor para CCF (todos los campos requeridos según esquema)
const receptorCCFSchema = Joi.object({
  nit: Joi.string().pattern(nitRegex).required().messages({
    'string.pattern.base': 'El NIT del receptor debe tener formato 0000-000000-000-0.',
    'any.required':        'El NIT del receptor es requerido para CCF.',
  }),
  nrc: Joi.string().pattern(nrcRegex).required().messages({
    'string.pattern.base': 'El NRC del receptor no tiene formato válido.',
    'any.required':        'El NRC del receptor es requerido para CCF.',
  }),
  nombre:          Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre del receptor es requerido para CCF.',
  }),
  nombre_comercial: Joi.string().max(150).optional().allow('', null),
  codigo_actividad: Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad:   Joi.string().min(5).max(150).optional().allow('', null),
  email:            Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  telefono:         Joi.string().min(8).max(30).optional().allow('', null),
  direccion:        Joi.string().max(200).optional().allow('', null),
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:    Joi.string().length(2).optional().allow(null),
});

// Schema del documento relacionado (para NC, ND)
const documentoRelacionadoSchema = Joi.object({
  codigo_generacion: Joi.string().uuid().required().messages({
    'any.required': 'El código de generación del documento relacionado es requerido.',
    'string.uuid':  'El código de generación debe ser un UUID válido.',
  }),
  tipo_dte: Joi.string().valid('01', '03', '04', '05', '06').required().messages({
    'any.required': 'El tipo de DTE relacionado es requerido.',
  }),
  fecha_emision: Joi.string().isoDate().required().messages({
    'any.required': 'La fecha de emisión del documento relacionado es requerida.',
  }),
});

// ─────────────────────────────────────────────
// SCHEMAS DE EMISIÓN
// ─────────────────────────────────────────────

/**
 * Schema para emitir FCF (Factura Consumidor Final - 01)
 * Receptor opcional salvo montoTotalOperacion >= $1,095
 * — la validación del monto se hace en el service
 */
const emitirFCFSchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).max(2000).required().messages({
    'array.min':    'Debe haber al menos un item en la factura.',
    'any.required': 'Los items son requeridos.',
  }),
  receptor:             receptorFCFSchema.optional().allow(null),
  metodo_pago:          Joi.string().valid('efectivo', 'tarjeta', 'mixto').required().messages({
    'any.required': 'El método de pago es requerido.',
    'any.only':     'El método de pago debe ser efectivo, tarjeta o mixto.',
  }),
  monto_efectivo:       Joi.number().min(0).optional().default(0),
  monto_tarjeta:        Joi.number().min(0).optional().default(0),
  porcentaje_descuento: Joi.number().min(0).max(100).optional().default(0),
  orden_referencia:     Joi.string().max(100).optional().allow('', null),
  // passwordPri — contraseña del certificado, NUNCA se almacena
  password_pri: Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
  es_contingencia:      Joi.boolean().optional().default(false),
  tipo_contingencia:    Joi.number().integer().valid(1, 2, 3, 4, 5).optional().allow(null),
  motivo_contingencia:  Joi.string().max(150).optional().allow('', null),
});

/**
 * Schema para emitir CCF (Comprobante Crédito Fiscal - 03)
 * Receptor con datos completos — todos requeridos según esquema CCF
 */
const emitirCCFSchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).max(2000).required().messages({
    'array.min':    'Debe haber al menos un item.',
    'any.required': 'Los items son requeridos.',
  }),
  receptor:             receptorCCFSchema.required().messages({
    'any.required': 'Los datos del receptor son requeridos para CCF.',
  }),
  metodo_pago:          Joi.string().valid('efectivo', 'tarjeta', 'mixto').required(),
  monto_efectivo:       Joi.number().min(0).optional().default(0),
  monto_tarjeta:        Joi.number().min(0).optional().default(0),
  porcentaje_descuento: Joi.number().min(0).max(100).optional().default(0),
  orden_referencia:     Joi.string().max(100).optional().allow('', null),
  password_pri:         Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
  es_contingencia:      Joi.boolean().optional().default(false),
  tipo_contingencia:    Joi.number().integer().valid(1, 2, 3, 4, 5).optional().allow(null),
  motivo_contingencia:  Joi.string().max(150).optional().allow('', null),
});

/**
 * Schema para emitir Nota de Crédito (05) o Nota de Débito (06)
 * Requiere documento relacionado obligatorio
 */
const emitirNotaSchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).max(2000).required(),
  receptor:              receptorCCFSchema.required().messages({
    'any.required': 'Los datos del receptor son requeridos.',
  }),
  documento_relacionado: documentoRelacionadoSchema.required().messages({
    'any.required': 'El documento relacionado es requerido para Notas de Crédito/Débito.',
  }),
  password_pri:          Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
  orden_referencia:      Joi.string().max(100).optional().allow('', null),
});

/**
 * Schema para emitir Factura Sujeto Excluido (14)
 */
const emitirFSESchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).max(2000).required(),
  sujeto_excluido: Joi.object({
    nombre:           Joi.string().min(1).max(250).required(),
    tipo_documento:   Joi.string().valid('13', '02', '03', '37').optional().default('13'),
    numero_documento: Joi.string().min(3).max(20).required().messages({
      'any.required': 'El número de documento del sujeto excluido es requerido.',
    }),
    codigo_actividad: Joi.string().min(5).max(6).optional().allow('', null),
    desc_actividad:   Joi.string().min(5).max(150).optional().allow('', null),
    email:            Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
    telefono:         Joi.string().min(8).max(30).optional().allow('', null),
    direccion:        Joi.string().max(200).optional().allow('', null),
    departamento_cod: Joi.string().length(2).optional().allow(null),
    municipio_cod:    Joi.string().length(2).optional().allow(null),
  }).required().messages({
    'any.required': 'Los datos del sujeto excluido son requeridos.',
  }),
  metodo_pago:      Joi.string().valid('efectivo', 'tarjeta', 'mixto').required(),
  monto_efectivo:   Joi.number().min(0).optional().default(0),
  monto_tarjeta:    Joi.number().min(0).optional().default(0),
  observaciones:    Joi.string().max(3000).optional().allow('', null),
  orden_referencia: Joi.string().max(100).optional().allow('', null),
  password_pri:     Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
});

/**
 * Schema para anular un DTE existente
 * Basado en el esquema anulacion-schema-v2.json
 * Todos los campos del documento son requeridos según el esquema oficial
 */
const anularDTESchema = Joi.object({
  // Datos del DTE a anular — todos requeridos según esquema oficial
  codigo_generacion: Joi.string().uuid().required().messages({
    'any.required': 'El código de generación del DTE a anular es requerido.',
    'string.uuid':  'El código de generación debe ser un UUID válido.',
  }),
  // Motivo — tipoAnulacion: 1=Error en datos, 2=Error en monto, 3=Otro
  motivo_tipo: Joi.number().integer().valid(1, 2, 3).required().messages({
    'any.required': 'El tipo de anulación es requerido (1=Error datos, 2=Error monto, 3=Otro).',
    'any.only':     'El tipo de anulación debe ser 1, 2 o 3.',
  }),
  motivo_descripcion: Joi.string().min(5).max(250).required().messages({
    'any.required': 'La descripción del motivo de anulación es requerida.',
    'string.min':   'El motivo debe tener al menos 5 caracteres.',
  }),
  // Responsable de la anulación
  nombre_responsable:  Joi.string().min(1).max(100).required(),
  tipo_doc_responsable: Joi.string().valid('13', '02', '03', '36', '37').required(),
  num_doc_responsable:  Joi.string().min(3).max(25).required(),
  // Quien solicita la anulación
  nombre_solicita:     Joi.string().min(1).max(100).optional().allow('', null),
  tipo_doc_solicita:   Joi.string().valid('13', '02', '03', '36', '37').optional().allow(null),
  num_doc_solicita:    Joi.string().min(3).max(25).optional().allow('', null),
  // passwordPri para firmar el evento de anulación
  password_pri: Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
});

/**
 * Schema para filtros de listado de DTEs
 */
const filtrosDTESchema = Joi.object({
  tipo_dte:    Joi.string().valid('01', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15').optional(),
  estado:      Joi.string().valid('generado', 'firmado', 'transmitido', 'aceptado', 'rechazado', 'contingencia', 'anulado').optional(),
  fecha_desde: Joi.date().iso().optional(),
  fecha_hasta: Joi.date().iso().optional(),
  pagina:      Joi.number().integer().min(1).optional().default(1),
  limite:      Joi.number().integer().min(1).max(100).optional().default(20),
});

module.exports = {
  emitirFCFSchema,
  emitirCCFSchema,
  emitirNotaSchema,
  emitirFSESchema,
  anularDTESchema,
  filtrosDTESchema,
};
