// src/modules/productos/productos.schema.js
// Validación Joi para el módulo de productos
// Catálogos Hacienda: tipo_item → CAT-011, uni_medida → CAT-014

const Joi = require('joi');

// ─────────────────────────────────────────────
// Campos comunes a crear y actualizar
// ─────────────────────────────────────────────
const camposProducto = {
  // Descripción fiscal del ítem (obligatoria)
  nombre: Joi.string().min(1).max(1000).required().messages({
    'any.required': 'El nombre del producto es requerido.',
    'string.min':   'El nombre del producto no puede estar vacío.',
    'string.max':   'El nombre del producto no puede superar 1000 caracteres.',
  }),
  // Código interno/SKU opcional — máximo 25 caracteres
  codigo: Joi.string().trim().max(25).optional().allow('', null).messages({
    'string.max': 'El código no puede superar 25 caracteres.',
  }),
  // CAT-011: 1=Producto, 2=Servicio, 3=Bien, 4=Otro
  tipo_item: Joi.number().integer().min(1).max(4).optional().default(2).messages({
    'number.min':  'El tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.max':  'El tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.base': 'El tipo de ítem debe ser un número (CAT-011).',
  }),
  // CAT-014: unidad de medida
  uni_medida: Joi.number().integer().min(1).max(99).optional().default(59).messages({
    'number.min':  'La unidad de medida debe ser un valor entre 1 y 99 (CAT-014).',
    'number.max':  'La unidad de medida debe ser un valor entre 1 y 99 (CAT-014).',
    'number.base': 'La unidad de medida debe ser un número (CAT-014).',
  }),
  // Precio unitario sin IVA — no negativo
  precio_unitario: Joi.number().min(0).required().messages({
    'any.required': 'El precio unitario es requerido.',
    'number.min':   'El precio unitario no puede ser negativo.',
    'number.base':  'El precio unitario debe ser un número.',
  }),
  // Tratamiento fiscal al precargar el ítem
  tipo_venta: Joi.string().valid('gravada', 'no_sujeta', 'exenta')
    .optional().default('gravada')
    .messages({
      'any.only': 'El tipo de venta debe ser "gravada", "no_sujeta" o "exenta".',
    }),
};

// ─────────────────────────────────────────────
// Schema crear producto
// ─────────────────────────────────────────────
const crearProductoSchema = Joi.object({
  ...camposProducto,
});

// ─────────────────────────────────────────────
// Schema actualizar producto (todos opcionales, mismo nombre)
// ─────────────────────────────────────────────
const actualizarProductoSchema = Joi.object({
  nombre:          Joi.string().min(1).max(1000).optional().messages({
    'string.min': 'El nombre del producto no puede estar vacío.',
    'string.max': 'El nombre del producto no puede superar 1000 caracteres.',
  }),
  codigo:          Joi.string().trim().max(25).optional().allow('', null).messages({
    'string.max': 'El código no puede superar 25 caracteres.',
  }),
  tipo_item:       Joi.number().integer().min(1).max(4).optional().messages({
    'number.min':  'El tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.max':  'El tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.base': 'El tipo de ítem debe ser un número (CAT-011).',
  }),
  uni_medida:      Joi.number().integer().min(1).max(99).optional().messages({
    'number.min':  'La unidad de medida debe ser un valor entre 1 y 99 (CAT-014).',
    'number.max':  'La unidad de medida debe ser un valor entre 1 y 99 (CAT-014).',
    'number.base': 'La unidad de medida debe ser un número (CAT-014).',
  }),
  precio_unitario: Joi.number().min(0).optional().messages({
    'number.min':  'El precio unitario no puede ser negativo.',
    'number.base': 'El precio unitario debe ser un número.',
  }),
  tipo_venta:      Joi.string().valid('gravada', 'no_sujeta', 'exenta').optional().messages({
    'any.only': 'El tipo de venta debe ser "gravada", "no_sujeta" o "exenta".',
  }),
});

// ─────────────────────────────────────────────
// Schema búsqueda / filtros
// ─────────────────────────────────────────────
const buscarProductosSchema = Joi.object({
  q:          Joi.string().min(1).max(100).optional(), // búsqueda general por nombre/código
  tipo_item:  Joi.number().integer().min(1).max(4).optional().messages({
    'number.min':  'El filtro tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.max':  'El filtro tipo de ítem debe ser un valor entre 1 y 4 (CAT-011).',
    'number.base': 'El filtro tipo de ítem debe ser un número.',
  }),
  tipo_venta: Joi.string().valid('gravada', 'no_sujeta', 'exenta').optional(),
  pagina:     Joi.number().integer().min(1).optional().default(1),
  limite:     Joi.number().integer().min(1).max(100).optional().default(10),
});

module.exports = {
  crearProductoSchema,
  actualizarProductoSchema,
  buscarProductosSchema,
};