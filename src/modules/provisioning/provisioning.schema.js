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

// Password con complejidad mínima (misma política que usuarios.schema.js).
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,50}$/;

// Tipos de evento del outbox (Fase 2: empresas; Fase 3: sucursales;
// 2026-10-07: USUARIO_INICIAL — usuario administrador inicial del tenant).
const TIPOS_EVENTO_VALIDOS = ['TENANT_CREADO', 'BRANCH_VINCULADO', 'USUARIO_INICIAL'];

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
  email: Joi.string().email({ tlds: { allow: false } }).max(150).allow('', null).optional().messages({
    'string.email': 'El email debe tener un formato válido.',
    'string.max': 'El email no puede exceder los 150 caracteres.',
  }),
  // Nombre comercial (login/display). Sin él se usa `nombre` (razón social).
  nombre_comercial: Joi.string().trim().max(150).allow('', null).optional().messages({
    'string.max': 'El nombre comercial no puede exceder los 150 caracteres.',
  }),
});

/**
 * Establecimiento fiscal inicial que se crea junto con la empresa (bootstrap).
 * Sin él, el tenant nuevo queda sin sucursales y el admin sin establecimiento
 * asignado → los mantenimientos administrativos no podrían operar.
 */
const establecimientoInicialSchema = Joi.object({
  nombre: Joi.string().trim().min(3).max(150).required().messages({
    'string.min':   'El nombre del establecimiento debe tener al menos 3 caracteres.',
    'any.required': 'El nombre del establecimiento fiscal es requerido.',
  }),
  direccion: Joi.string().trim().min(5).max(255).required().messages({
    'string.min':   'La dirección debe tener al menos 5 caracteres.',
    'any.required': 'La dirección del establecimiento es requerida.',
  }),
  departamento_cod: Joi.string()
    .length(2)
    .pattern(/^(0[1-9]|1[0-4])$/)
    .required()
    .messages({
      'string.pattern.base': 'El código de departamento debe ser del 01 al 14.',
      'any.required':        'El departamento es requerido.',
    }),
  municipio_cod: Joi.string()
    .length(2)
    .pattern(/^[0-9]{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'El código de municipio debe ser numérico (00-99).',
      'any.required':        'El municipio es requerido.',
    }),
  // Códigos del documento de acreditamiento de Hacienda.
  cod_estable_mh: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9]{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'cod_estable_mh debe tener 4 caracteres alfanuméricos (del documento de Hacienda).',
      'any.required':        'El código de establecimiento de Hacienda es requerido.',
    }),
  cod_punto_venta_mh: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9]{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'cod_punto_venta_mh debe tener 4 caracteres alfanuméricos (del documento de Hacienda).',
      'any.required':        'El código de punto de venta de Hacienda es requerido.',
    }),
  tipo_establecimiento: Joi.string().valid('01', '02', '04', '07').default('02').messages({
    'any.only': 'El tipo de establecimiento no es válido según CAT-009.',
  }),
  telefono: Joi.string().trim().max(20).allow('', null).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).max(150).allow('', null).optional().messages({
    'string.email': 'El email del establecimiento debe tener un formato válido.',
  }),
});

/**
 * Alta de empresa desde la plataforma DTE (spec §6.2).
 * Extiende crearTenantSchema con las credenciales del usuario administrador
 * INICIAL del tenant nuevo: (email_admin, password) rigen en DTE y POS.
 *
 * 2026-10-07: la creación del usuario POS es OPCIONAL (toggle en la UI):
 * no todas las empresas necesitan POS pero todas necesitan DTE. Con
 * crear_usuario_pos=true el PIN pasa a ser obligatorio y al POS viajan los
 * hashes bcrypt (evento USUARIO_INICIAL); en false NO se crea usuario en POS.
 *
 * 2026-10-10: el alta también crea el establecimiento fiscal inicial
 * (bootstrap transaccional): configuración, establecimiento, correlativos y
 * el admin asignado a ese establecimiento — la empresa nace operativa.
 */
const crearTenantPlataformaSchema = crearTenantSchema.keys({
  establecimiento: establecimientoInicialSchema.required().messages({
    'any.required': 'El establecimiento fiscal inicial es requerido.',
  }),
  email_admin: Joi.string().email({ tlds: { allow: false } }).max(150).required().messages({
    'string.email': 'El email del administrador debe tener un formato válido.',
    'string.max': 'El email del administrador no puede exceder los 150 caracteres.',
    'any.required': 'El email del administrador es requerido.',
  }),
  password: Joi.string().pattern(passwordRegex).required().messages({
    'string.pattern.base': 'El password debe tener entre 8 y 50 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial.',
    'any.required': 'El password del administrador es requerido.',
  }),
  nombre_usuario: Joi.string().trim().min(2).max(100).required().messages({
    'string.min': 'El nombre del administrador debe tener al menos 2 caracteres.',
    'string.max': 'El nombre del administrador no puede exceder los 100 caracteres.',
    'any.required': 'El nombre del administrador es requerido.',
  }),
  apellido: Joi.string().trim().max(100).allow('', null).optional().messages({
    'string.max': 'El apellido del administrador no puede exceder los 100 caracteres.',
  }),
  // Sección POS (toggle "esta empresa usará POS"). El mismo administrador se
  // crea en POS (rol administrador = matriz completa) con su PIN de 6 dígitos.
  crear_usuario_pos: Joi.boolean().default(false).messages({
    'boolean.base': 'crear_usuario_pos debe ser un booleano.',
  }),
  pin: Joi.string()
    .pattern(/^\d{6}$/)
    .when('crear_usuario_pos', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.allow('', null).optional(),
    })
    .messages({
      'string.pattern.base': 'El PIN (usuario POS) debe tener exactamente 6 dígitos.',
      'any.required': 'El PIN del usuario POS es requerido cuando se habilita POS.',
    }),
});

/**
 * Edición de datos de la empresa desde la plataforma DTE.
 * SOLO nombre, nombre_comercial y nrc son editables. El NIT es INMUTABLE:
 * los DTEs emitidos lo referencian como identidad del emisor — si llega en
 * el payload se rechaza explícitamente con 400 (no silenciosamente).
 */
const actualizarTenantPlataformaSchema = Joi.object({
  nombre: Joi.string().trim().min(2).max(150).optional().messages({
    'string.min': 'El nombre debe tener al menos 2 caracteres.',
    'string.max': 'El nombre no puede exceder los 150 caracteres.',
  }),
  nombre_comercial: Joi.string().trim().max(150).allow('', null).optional().messages({
    'string.max': 'El nombre comercial no puede exceder los 150 caracteres.',
  }),
  nrc: Joi.string().trim().min(4).max(20).allow('', null).optional().messages({
    'string.max': 'El NRC no puede exceder los 20 caracteres.',
  }),
  nit: Joi.any().forbidden().messages({
    'any.unknown': 'El NIT no se puede modificar: es la identidad fiscal del emisor.',
  }),
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar.',
});

/**
 * Edición del usuario administrador INICIAL del tenant desde la plataforma.
 * Email único en el tenant, password opcional (ausente = no cambia, mismo
 * patrón que password_hacienda en configuracion.schema).
 * NOTA: la tabla usuarios NO tiene apellido (el form de alta ya lo descarta).
 */
const actualizarAdminTenantSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(150).optional().messages({
    'string.email': 'El email del administrador debe tener un formato válido.',
    'string.max': 'El email del administrador no puede exceder los 150 caracteres.',
  }),
  nombre: Joi.string().trim().min(2).max(100).optional().messages({
    'string.min': 'El nombre del administrador debe tener al menos 2 caracteres.',
    'string.max': 'El nombre del administrador no puede exceder los 100 caracteres.',
  }),
  password: Joi.string().pattern(passwordRegex).optional().messages({
    'string.pattern.base': 'El password debe tener entre 8 y 50 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial.',
  }),
}).min(1).messages({
  'object.min': 'Debe enviar al menos un campo para actualizar.',
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
  nombre_comercial: Joi.string().trim().max(150).allow('', null).optional(),
  nit: Joi.string().trim().min(5).max(20).required(),
  nrc: Joi.string().trim().max(20).allow('', null).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).max(150).allow('', null).optional(),
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

// Payload del evento USUARIO_INICIAL (2026-10-07): usuario administrador
// inicial del tenant para la proyección POS. SOLO hashes bcrypt — la
// contraseña y el PIN en claro NUNCA salen del DTE Service (spec §3.3).
const payloadUsuarioInicialEvento = Joi.object({
  nombre: Joi.string().trim().min(2).max(100).required(),
  apellido: Joi.string().trim().max(100).allow('', null).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).lowercase().max(150).required(),
  rol: Joi.string().valid('administrador').required(),
  password_hash: Joi.string()
    .pattern(/^\$2[aby]\$\d{2}\$/)
    .required()
    .messages({
      'string.pattern.base': 'password_hash debe ser un hash bcrypt.',
    }),
  pin_hash: Joi.string()
    .pattern(/^\$2[aby]\$\d{2}\$/)
    .required()
    .messages({
      'string.pattern.base': 'pin_hash debe ser un hash bcrypt.',
    }),
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
    switch: [
      { is: 'TENANT_CREADO', then: payloadTenantEvento.required() },
      { is: 'BRANCH_VINCULADO', then: payloadBranchEvento.required() },
      { is: 'USUARIO_INICIAL', then: payloadUsuarioInicialEvento.required() },
    ],
  }),
});

module.exports = {
  crearTenantSchema,
  crearTenantPlataformaSchema,
  actualizarTenantPlataformaSchema,
  actualizarAdminTenantSchema,
  actualizarEstadoSchema,
  confirmarEventoSchema,
  vincularSucursalSchema,
  recibirEventoSchema,
  ESTADOS_PROVISION_TENANT,
  ESTADOS_FISCAL_ESTABLECIMIENTO,
  TIPOS_EVENTO_VALIDOS,
};