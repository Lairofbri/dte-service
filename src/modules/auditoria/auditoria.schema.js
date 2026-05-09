// src/modules/auditoria/auditoria.schema.js
// Validación Joi para el módulo de auditoría
// Principio S (SOLID): solo valida, no opera ni responde
//
// IMPORTANTE: La auditoría es de SOLO LECTURA desde la API
// Solo se exponen filtros para consulta — nunca escritura

const Joi = require('joi');

// Eventos válidos registrados en el sistema
// Mantener sincronizado con los eventos que insertan otros módulos
const EVENTOS_VALIDOS = [
  'DTE_GENERADO',
  'DTE_FIRMADO',
  'DTE_ACEPTADO',
  'DTE_RECHAZADO',
  'DTE_CONTINGENCIA',
  'DTE_ERROR',
  'DTE_ANULADO',
  'CONTINGENCIA_NOTIFICADA',
  'CONTINGENCIA_LOTE_ENVIADO',
];

/**
 * Schema para filtros de listado de auditoría
 * Todos los campos son opcionales — sin filtros devuelve todo paginado
 */
const filtrosAuditoriaSchema = Joi.object({
  // Filtrar por tipo de evento
  evento: Joi.string()
    .valid(...EVENTOS_VALIDOS)
    .optional()
    .messages({
      'any.only': `El evento debe ser uno de: ${EVENTOS_VALIDOS.join(', ')}.`,
    }),

  // Filtrar por DTE relacionado
  dte_id: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.uuid': 'El dte_id debe ser un UUID válido.',
    }),

  // Filtrar por rango de fechas
  fecha_desde: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'fecha_desde debe tener formato ISO (YYYY-MM-DD).',
    }),
  fecha_hasta: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'fecha_hasta debe tener formato ISO (YYYY-MM-DD).',
    }),

  // Paginación
  pagina: Joi.number().integer().min(1).optional().default(1).messages({
    'number.min': 'La página debe ser mayor a 0.',
  }),
  limite: Joi.number().integer().min(1).max(100).optional().default(50).messages({
    'number.min': 'El límite debe ser mayor a 0.',
    'number.max': 'El límite máximo es 100.',
  }),
}).custom((value, helpers) => {
  // Validación cruzada: fecha_hasta no puede ser anterior a fecha_desde
  if (value.fecha_desde && value.fecha_hasta) {
    if (new Date(value.fecha_hasta) < new Date(value.fecha_desde)) {
      return helpers.error('any.invalid', {
        message: 'fecha_hasta no puede ser anterior a fecha_desde.',
      });
    }
  }
  return value;
}).messages({
  'any.invalid': '{{#message}}',
});

module.exports = {
  filtrosAuditoriaSchema,
  EVENTOS_VALIDOS,
};
