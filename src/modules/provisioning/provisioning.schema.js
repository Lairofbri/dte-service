// src/modules/provisioning/provisioning.schema.js
// Validación Joi del módulo de provisión (Fase 2).
// Principio S (SOLID): solo valida, no opera ni responde.
//
// Contratos de idempotencia: operation_id es UUID v4 (mismo estándar que
// tenant_id / branch_id). El middleware idempotenciaObligatoria extrae la
// clave del header Idempotency-Key o del body.operation_id.

const Joi = require('joi');

// Estados de provisión de empresa (spec §5).
const ESTADOS_PROVISION_TENANT = [
  'provisioning',
  'pending_fiscal_setup',
  'active',
  'blocked',
  'failed',
];

// Estados fiscales de un establecimiento (spec §5 — Sucursal).
const ESTADOS_FISCAL_ESTABLECIMIENTO = [
  'pending_link',
  'pending_mh_data',
  'ready',
  'inactive',
  'blocked',
];

// Tipos de evento del outbox (Fase 2: empresas; Fase 3: sucursales).
const TIPOS_EVENTO_VALIDOS = ['TENANT_CREADO', 'BRANCH_VINCULADO'];

const crearTenantSchema = Joi.object({
  tenant_id: Joi.string().uuid().required().messages({
    'any.required': 'tenant_id es requerido.',
    'string.guid': 'tenant_id debe ser un UUID válido.',
  }),
  // Si viene en el body debe ser UUID v4; el middleware ya lo normaliza
  // (header Idempotency-Key tiene prioridad).
  operation_id: Joi.string().uuid().optional().messages({
    'string.guid': 'operation_id debe ser un UUID v4 válido.',
  }),
  nombre: Joi.string().trim().min(2).max(150).required().messages({
    'any.required': 'El nombre de la empresa es requerido.',
    'string.min': 'El nombre debe tener al menos 2 caracteres.',
    'string.max': 'El nombre no puede exceder los 150 caracteres.',
  }),
  nit: Joi.string().trim().min(5).max(20).required().messages({
    'any.required': 'El NIT es requerido.',
    'string.min': 'El NIT debe tener al menos 5 caracteres.',
    'string.max': 'El NIT no puede exceder los 20 caracteres.',
  }),
  nrc: Joi.string().trim().min(4).max(20).allow('', null).optional().messages({
    'string.max': 'El NRC no puede exceder los 20 caracteres.',
  }),
  email: Joi.string().email().max(150).allow('', null).optional().messages({
    'string.email': 'El email debe tener un formato válido.',
    'string.max': 'El email no puede exceder los 150 caracteres.',
  }),
});

const actualizarEstadoSchema = Joi.object({
  operation_id: Joi.string().uuid().optional().messages({
    'string.guid': 'operation_id debe ser un UUID v4 válido.',
  }),
  status: Joi.string()
    .valid(...ESTADOS_PROVISION_TENANT)
    .required()
    .messages({
      'any.required': 'El estado de provisión es requerido.',
      'any.only': `El estado debe ser uno de: ${ESTADOS_PROVISION_TENANT.join(', ')}.`,
    }),
  error: Joi.string().trim().max(500).allow('', null).optional().messages({
    'string.max': 'El error no puede exceder los 500 caracteres.',
  }),
});

const confirmarEventoSchema = Joi.object({
  operation_id: Joi.string().uuid().required().messages({
    'any.required': 'operation_id es requerido.',
    'string.guid': 'operation_id debe ser un UUID v4 válido.',
  }),
});

/**
 * Solicitud de vínculo de sucursal desde POS (spec §6.3).
 * El POS crea la sucursal operativa con branch_id compartido y solicita la
 * vinculación fiscal. DTE registra la solicitud pendiente SIN inventar
 * códigos MH; el administrador los completa después (pending_mh_data).
 */
const vincularSucursalSchema = Joi.object({
  branch_id: Joi.string().uuid().required().messages({
    'any.required': 'branch_id es requerido.',
    'string.guid': 'branch_id debe ser un UUID v4 válido.',
  }),
  operation_id: Joi.string().uuid().optional().messages({
    'string.guid': 'operation_id debe ser un UUID v4 válido.',
  }),
  nombre: Joi.string().trim().min(2).max(150).required().messages({
    'any.required': 'El nombre de la sucursal es requerido.',
    'string.min': 'El nombre debe tener al menos 2 caracteres.',
    'string.max': 'El nombre no puede exceder los 150 caracteres.',
  }),
  direccion: Joi.string().trim().max(255).allow('', null).optional().messages({
    'string.max': 'La dirección no puede exceder los 255 caracteres.',
  }),
  telefono: Joi.string().trim().max(20).allow('', null).optional().messages({
    'string.max': 'El teléfono no puede exceder los 20 caracteres.',
  }),
});

// Payload del evento TENANT_CREADO (Fase 2) — sin secretos.
const payloadTenantEvento = Joi.object({
  nombre: Joi.string().trim().min(2).max(150).required(),
  nit: Joi.string().trim().min(5).max(20).required(),
  nrc: Joi.string().trim().max(20).allow('', null).optional(),
  email: Joi.string().email().max(150).allow('', null).optional(),
});

// Payload del evento BRANCH_VINCULADO (Fase 3) — datos fiscales de LECTURA
// para la proyección POS. NUNCA credenciales Hacienda ni secretos de firma.
const payloadBranchEvento = Joi.object({
  branch_id: Joi.string().uuid().required().messages({
    'any.required': 'branch_id es requerido en el payload.',
    'string.guid': 'branch_id debe ser un UUID válido.',
  }),
  establecimiento_id: Joi.string().uuid().required().messages({
    'any.required': 'establecimiento_id es requerido en el payload.',
    'string.guid': 'establecimiento_id debe ser un UUID válido.',
  }),
  fiscal_status: Joi.string()
    .valid(...ESTADOS_FISCAL_ESTABLECIMIENTO)
    .required()
    .messages({
      'any.required': 'fiscal_status es requerido en el payload.',
      'any.only': `fiscal_status debe ser uno de: ${ESTADOS_FISCAL_ESTABLECIMIENTO.join(', ')}.`,
    }),
  nombre: Joi.string().trim().min(2).max(150).required(),
  direccion: Joi.string().trim().max(255).allow('', null).optional(),
  telefono: Joi.string().trim().max(20).allow('', null).optional(),
  cod_estable_mh: Joi.string().uppercase().allow('', null).optional(),
  cod_punto_venta_mh: Joi.string().uppercase().allow('', null).optional(),
  tipo_establecimiento: Joi.string().valid('01', '02', '04', '07').allow(null).optional(),
  departamento_cod: Joi.string().length(2).allow('', null).optional(),
  municipio_cod: Joi.string().length(2).allow('', null).optional(),
  sync_error: Joi.string().trim().max(500).allow('', null).optional(),
});

const recibirEventoSchema = Joi.object({
  operation_id: Joi.string().uuid().required().messages({
    'any.required': 'operation_id es requerido.',
    'string.guid': 'operation_id debe ser un UUID v4 válido.',
  }),
  tenant_id: Joi.string().uuid().required().messages({
    'any.required': 'tenant_id es requerido.',
    'string.guid': 'tenant_id debe ser un UUID válido.',
  }),
  branch_id: Joi.string().uuid().allow(null).optional().messages({
    'string.guid': 'branch_id debe ser un UUID válido.',
  }),
  tipo_evento: Joi.string()
    .valid(...TIPOS_EVENTO_VALIDOS)
    .required()
    .messages({
      'any.required': 'tipo_evento es requerido.',
      'any.only': `tipo_evento debe ser uno de: ${TIPOS_EVENTO_VALIDOS.join(', ')}.`,
    }),
  payload: Joi.alternatives().conditional('tipo_evento', {
    is: 'TENANT_CREADO',
    then: payloadTenantEvento.required(),
    otherwise: payloadBranchEvento.required(),
  }),
});

module.exports = {
  crearTenantSchema,
  actualizarEstadoSchema,
  confirmarEventoSchema,
  vincularSucursalSchema,
  recibirEventoSchema,
  ESTADOS_PROVISION_TENANT,
  ESTADOS_FISCAL_ESTABLECIMIENTO,
  TIPOS_EVENTO_VALIDOS,
};