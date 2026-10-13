// src/modules/productos/productos.controller.js
// Orquesta los requests HTTP del módulo de productos
// Principio S (SOLID): solo recibe, valida y responde

const service = require('./productos.service');
const {
  crearProductoSchema,
  actualizarProductoSchema,
  buscarProductosSchema,
} = require('./productos.schema');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
const { exito, creado, error, errorServidor } = require('../../utils/response');
const logger = require('../../utils/logger');

const manejarError = (res, err) => {
  if (err.status && err.mensaje) return error(res, err.mensaje, err.status);
  logger.error('Error no controlado en productos', { error: err.message });
  return errorServidor(res);
};

// GET /api/productos?q=...&tipo_item=...&tipo_venta=...&pagina=1&limite=10
const listar = async (req, res) => {
  const { error: ve, value } = buscarProductosSchema.validate(req.query);
  if (ve) return error(res, ve.details[0].message, 400);
  const tenant_id = req.usuario?.tenant_id || req.tenantId;
  try {
    const resultado = await service.buscarProductos({ ...value, tenant_id });
    return exito(res, resultado);
  } catch (err) { return manejarError(res, err); }
};

// GET /api/productos/:id
const obtener = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del producto no es un UUID válido.', 400);
  const tenant_id = req.usuario?.tenant_id || req.tenantId;
  try {
    const producto = await service.obtenerProductoPorId(req.params.id, tenant_id);
    return exito(res, producto);
  } catch (err) { return manejarError(res, err); }
};

// POST /api/productos
const crear = async (req, res) => {
  const { error: ve, value } = crearProductoSchema.validate(req.body);
  if (ve) return error(res, ve.details[0].message, 400);
  const tenant_id = req.usuario?.tenant_id || req.tenantId;
  try {
    const producto = await service.crearProducto(value, tenant_id);
    return creado(res, producto, 'Producto creado correctamente.');
  } catch (err) { return manejarError(res, err); }
};

// PUT /api/productos/:id
const actualizar = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del producto no es un UUID válido.', 400);
  const { error: ve, value } = actualizarProductoSchema.validate(req.body);
  if (ve) return error(res, ve.details[0].message, 400);
  const tenant_id = req.usuario?.tenant_id || req.tenantId;
  try {
    const producto = await service.actualizarProducto(req.params.id, value, tenant_id);
    return exito(res, producto, 'Producto actualizado correctamente.');
  } catch (err) { return manejarError(res, err); }
};

// DELETE /api/productos/:id
const eliminar = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del producto no es un UUID válido.', 400);
  const tenant_id = req.usuario?.tenant_id || req.tenantId;
  try {
    const resultado = await service.eliminarProducto(req.params.id, tenant_id);
    return exito(res, resultado);
  } catch (err) { return manejarError(res, err); }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };