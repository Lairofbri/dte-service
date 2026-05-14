// src/modules/dtes/dtes.schema.js
// Validación Joi — basado en JSONs reales aceptados por Hacienda
// Soporta tanto el POS (API Key) como el frontend (JWT)

const Joi = require('joi');

// ─────────────────────────────────────────────
// VALIDADORES REUTILIZABLES
// ─────────────────────────────────────────────
const nitRegex = /^\d{4}-\d{6}-\d{3}-\d{1}$/;
const nrcRegex = /^\d{1,7}(-\d)?$/;

// Ítem con campos completos según Hacienda
const itemSchema = Joi.object({
  // Descripción — campo principal
  descripcion:     Joi.string().min(1).max(1000).optional(),
  nombre_producto: Joi.string().min(1).max(1000).optional(), // alias POS
  // Al menos uno de los dos debe estar presente
  precio_unitario: Joi.number().positive().required().messages({
    'any.required': 'El precio unitario es requerido.',
    'number.positive': 'El precio debe ser mayor a cero.',
  }),
  cantidad: Joi.number().positive().required().messages({
    'any.required': 'La cantidad es requerida.',
    'number.positive': 'La cantidad debe ser mayor a cero.',
  }),
  descuento:  Joi.number().min(0).optional().default(0),
  codigo:     Joi.string().max(25).optional().allow('', null),
  // CAT-011: 1=Bienes, 2=Servicios, 3=Ambos, 4=Otros
  tipo_item:  Joi.number().integer().valid(1, 2, 3, 4).optional().default(2),
  // CAT-014: 59=Unidad, 99=Otro, etc.
  uni_medida: Joi.number().integer().min(1).max(99).optional().default(59),
}).or('descripcion', 'nombre_producto');

// Pago individual
const pagoSchema = Joi.object({
  codigo:     Joi.string().valid('01','02','03','04','05','08','09','11','12','99').required(),
  montoPago:  Joi.number().positive().required(),
  referencia: Joi.string().max(50).optional().allow('', null),
  plazo:      Joi.string().valid('01','02','03').optional().allow(null),
  periodo:    Joi.number().integer().min(1).optional().allow(null),
});

// Receptor FCF — tipoDocumento + numDocumento
const receptorFCFSchema = Joi.object({
  nombre:          Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre del receptor es requerido.',
  }),
  tipo_documento:  Joi.string().valid('36', '13', '02', '03', '37').optional().allow(null),
  num_documento:   Joi.string().min(3).max(20).optional().allow('', null),
  // aliases frontend
  numero_documento: Joi.string().min(3).max(20).optional().allow('', null),
  correo:          Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  email:           Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  telefono:        Joi.string().min(8).max(20).optional().allow('', null),
  direccion:       Joi.string().max(200).optional().allow('', null),
  departamento_cod: Joi.string().length(2).optional().allow(null),
  municipio_cod:   Joi.string().length(2).optional().allow(null),
});

// Receptor CCF — nit/nrc con datos completos
const receptorCCFSchema = Joi.object({
  nit: Joi.string().pattern(nitRegex).required().messages({
    'string.pattern.base': 'El NIT debe tener formato 0000-000000-000-0.',
    'any.required':        'El NIT del receptor es requerido para CCF.',
  }),
  nrc: Joi.string().pattern(nrcRegex).optional().allow('', null),
  nombre: Joi.string().min(1).max(250).required().messages({
    'any.required': 'El nombre del receptor es requerido para CCF.',
  }),
  nombre_comercial:  Joi.string().max(150).optional().allow('', null),
  cod_actividad:     Joi.string().min(5).max(6).optional().allow('', null),
  // alias
  codigo_actividad:  Joi.string().min(5).max(6).optional().allow('', null),
  desc_actividad:    Joi.string().min(5).max(150).optional().allow('', null),
  correo:            Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  email:             Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
  telefono:          Joi.string().min(8).max(20).optional().allow('', null),
  direccion:         Joi.string().max(200).optional().allow('', null),
  departamento_cod:  Joi.string().length(2).optional().allow(null),
  municipio_cod:     Joi.string().length(2).optional().allow(null),
});

// Documento relacionado para NC/ND
const documentoRelacionadoSchema = Joi.object({
  codigo_generacion: Joi.string().uuid().required(),
  tipo_dte:          Joi.string().valid('01', '03', '04', '05', '06').required(),
  fecha_emision:     Joi.string().isoDate().required(),
});

// ─────────────────────────────────────────────
// CAMPOS COMUNES DE PAGO Y OPERACIÓN
// Acepta tanto formato POS (metodo_pago) como formato frontend (condicion_operacion + pagos)
// ─────────────────────────────────────────────
const camposPagoComunes = {
  // Formato POS
  metodo_pago:          Joi.string().valid('efectivo', 'tarjeta', 'mixto').optional(),
  monto_efectivo:       Joi.number().min(0).optional().default(0),
  monto_tarjeta:        Joi.number().min(0).optional().default(0),
  // Formato frontend
  condicion_operacion:  Joi.number().integer().valid(1, 2, 3).optional().default(1),
  pagos:                Joi.array().items(pagoSchema).min(1).max(10).optional().allow(null),
  // Varios
  orden_referencia:     Joi.string().max(100).optional().allow('', null),
  password_pri:         Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
  es_contingencia:      Joi.boolean().optional().default(false),
  tipo_contingencia:    Joi.number().integer().valid(1, 2, 3, 4, 5).optional().allow(null),
  motivo_contingencia:  Joi.string().max(150).optional().allow('', null),
};

// ─────────────────────────────────────────────
// SCHEMAS DE EMISIÓN
// ─────────────────────────────────────────────

const emitirFCFSchema = Joi.object({
  items:    Joi.array().items(itemSchema).min(1).max(2000).required().messages({
    'array.min':    'Debe haber al menos un ítem.',
    'any.required': 'Los ítems son requeridos.',
  }),
  receptor: receptorFCFSchema.optional().allow(null),
  ...camposPagoComunes,
});

const emitirCCFSchema = Joi.object({
  items:    Joi.array().items(itemSchema).min(1).max(2000).required().messages({
    'array.min':    'Debe haber al menos un ítem.',
    'any.required': 'Los ítems son requeridos.',
  }),
  receptor: receptorCCFSchema.required().messages({
    'any.required': 'Los datos del receptor son requeridos para CCF.',
  }),
  ...camposPagoComunes,
});

const emitirFSESchema = Joi.object({
  items: Joi.array().items(itemSchema).min(1).max(2000).required(),
  // Acepta tanto receptor como sujeto_excluido (alias POS)
  receptor: Joi.object({
    nit:             Joi.string().pattern(nitRegex).required().messages({
      'any.required': 'El NIT del sujeto excluido es requerido.',
    }),
    nombre:          Joi.string().min(1).max(250).required(),
    cod_actividad:   Joi.string().min(5).max(6).optional().allow('', null),
    desc_actividad:  Joi.string().min(5).max(150).optional().allow('', null),
    correo:          Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
    email:           Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
    telefono:        Joi.string().min(8).max(20).optional().allow('', null),
    direccion:       Joi.string().max(200).optional().allow('', null),
    departamento_cod: Joi.string().length(2).optional().allow(null),
    municipio_cod:   Joi.string().length(2).optional().allow(null),
  }).optional(),
  sujeto_excluido: Joi.object({
    nit:              Joi.string().pattern(nitRegex).required(),
    nombre:           Joi.string().min(1).max(250).required(),
    tipo_documento:   Joi.string().valid('13', '02', '03', '36', '37').optional().default('36'),
    numero_documento: Joi.string().min(3).max(20).optional(),
    cod_actividad:    Joi.string().min(5).max(6).optional().allow('', null),
    codigo_actividad: Joi.string().min(5).max(6).optional().allow('', null),
    desc_actividad:   Joi.string().min(5).max(150).optional().allow('', null),
    email:            Joi.string().email({ tlds: { allow: false } }).optional().allow('', null),
    telefono:         Joi.string().min(8).max(20).optional().allow('', null),
    direccion:        Joi.string().max(200).optional().allow('', null),
    departamento_cod: Joi.string().length(2).optional().allow(null),
    municipio_cod:    Joi.string().length(2).optional().allow(null),
  }).optional(),
  observaciones: Joi.string().max(3000).optional().allow('', null),
  ...camposPagoComunes,
});

const emitirNotaSchema = Joi.object({
  items:                 Joi.array().items(itemSchema).min(1).max(2000).required(),
  receptor:              receptorCCFSchema.required(),
  documento_relacionado: documentoRelacionadoSchema.required().messages({
    'any.required': 'El documento relacionado es requerido para Notas.',
  }),
  ...camposPagoComunes,
});

const anularDTESchema = Joi.object({
  codigo_generacion:    Joi.string().uuid().required().messages({
    'any.required': 'El código de generación del DTE a anular es requerido.',
    'string.uuid':  'El código de generación debe ser un UUID válido.',
  }),
  motivo_tipo: Joi.number().integer().valid(1, 2, 3).required().messages({
    'any.required': 'El tipo de anulación es requerido (1=Error datos, 2=Rescindir, 3=Otro).',
    'any.only':     'El tipo de anulación debe ser 1, 2 o 3.',
  }),
  motivo_descripcion: Joi.string().min(5).max(250).required().messages({
    'any.required': 'La descripción del motivo de anulación es requerida.',
  }),
  nombre_responsable:   Joi.string().min(1).max(100).required(),
  tipo_doc_responsable: Joi.string().valid('13', '02', '03', '36', '37').required(),
  num_doc_responsable:  Joi.string().min(3).max(25).required(),
  nombre_solicita:      Joi.string().min(1).max(100).optional().allow('', null),
  tipo_doc_solicita:    Joi.string().valid('13', '02', '03', '36', '37').optional().allow(null),
  num_doc_solicita:     Joi.string().min(3).max(25).optional().allow('', null),
  password_pri:         Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida.',
  }),
});

const filtrosDTESchema = Joi.object({
  tipo_dte:    Joi.string().valid('01','03','04','05','06','07','08','09','11','14','15').optional(),
  estado:      Joi.string().valid('generado','firmado','transmitido','aceptado','rechazado','contingencia','anulado').optional(),
  fecha_desde: Joi.date().iso().optional(),
  fecha_hasta: Joi.date().iso().optional(),
  pagina:      Joi.number().integer().min(1).optional().default(1),
  limite:      Joi.number().integer().min(1).max(100).optional().default(20),
});

module.exports = {
  emitirFCFSchema,
  emitirCCFSchema,
  emitirFSESchema,
  emitirNotaSchema,
  anularDTESchema,
  filtrosDTESchema,
};
