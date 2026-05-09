// src/modules/contingencia/contingencia.schema.js
// Validación Joi para el módulo de contingencia
// Basado en el esquema contingencia-schema-v3.json oficial de Hacienda
// Principio S (SOLID): solo valida, no opera ni responde

const Joi = require('joi');

// ─────────────────────────────────────────────
// CATÁLOGO DE TIPOS DE CONTINGENCIA
// Según esquema oficial — enum [1, 2, 3, 4, 5]
// ─────────────────────────────────────────────
// 1 → No disponibilidad del sistema del MH
// 2 → No disponibilidad de internet del emisor
// 3 → Falla en el equipo del emisor
// 4 → Desastre natural
// 5 → Otro (especificar en motivo_contingencia)

/**
 * Schema para notificar un evento de contingencia a Hacienda
 * Todos los campos del motivo son requeridos según el esquema v3
 *
 * Campos del emisor en el JSON de contingencia:
 * nombreResponsable, tipoDocResponsable, numeroDocResponsable
 * → Requeridos según esquema pero los tomamos de configuracion
 * → El cliente solo envía los del responsable específico si difiere
 */
const notificarContingenciaSchema = Joi.object({
  // ── Período de contingencia ──
  // Todos requeridos según esquema — ninguno puede ser null
  fecha_inicio: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'fecha_inicio debe tener formato YYYY-MM-DD.',
      'any.required':        'La fecha de inicio de la contingencia es requerida.',
    }),
  hora_inicio: Joi.string()
    .pattern(/^\d{2}:\d{2}:\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'hora_inicio debe tener formato HH:mm:ss.',
      'any.required':        'La hora de inicio de la contingencia es requerida.',
    }),
  fecha_fin: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'fecha_fin debe tener formato YYYY-MM-DD.',
      'any.required':        'La fecha de fin de la contingencia es requerida.',
    }),
  hora_fin: Joi.string()
    .pattern(/^\d{2}:\d{2}:\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'hora_fin debe tener formato HH:mm:ss.',
      'any.required':        'La hora de fin de la contingencia es requerida.',
    }),

  // ── Tipo y motivo — requeridos según esquema ──
  tipo_contingencia: Joi.number()
    .integer()
    .valid(1, 2, 3, 4, 5)
    .required()
    .messages({
      'any.only':     'tipo_contingencia debe ser 1=MH, 2=Internet, 3=Equipo, 4=Desastre, 5=Otro.',
      'any.required': 'El tipo de contingencia es requerido.',
    }),
  motivo_contingencia: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min':   'El motivo de contingencia debe tener al menos 5 caracteres.',
      'any.required': 'El motivo de contingencia es requerido.',
    }),

  // ── Responsable ──
  // Requerido en el JSON del emisor según esquema v3
  nombre_responsable:   Joi.string().min(1).max(100).required().messages({
    'any.required': 'El nombre del responsable es requerido.',
  }),
  tipo_doc_responsable: Joi.string()
    .valid('13', '02', '03', '36', '37')
    .required()
    .messages({
      'any.required': 'El tipo de documento del responsable es requerido.',
      'any.only':     'tipo_doc_responsable debe ser 13=DUI, 02=NIT, 03=Pasaporte, 36=Carné, 37=Otro.',
    }),
  num_doc_responsable: Joi.string().min(3).max(25).required().messages({
    'any.required': 'El número de documento del responsable es requerido.',
  }),

  // ── passwordPri — contraseña del certificado para firmar el evento ──
  // NUNCA se almacena — viene en el request y se descarta
  password_pri: Joi.string().min(1).required().messages({
    'any.required': 'La contraseña del certificado (password_pri) es requerida para firmar el evento.',
  }),
});

module.exports = { notificarContingenciaSchema };
