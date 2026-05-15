// src/modules/clientes/clientes.controller.js
// Orquesta los requests HTTP del módulo de clientes
// Principio S (SOLID): solo recibe, valida y responde

const service = require('./clientes.service');
const {
  crearClienteSchema,
  actualizarClienteSchema,
  buscarClientesSchema,
} = require('./clientes.schema');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
const { exito, creado, error, errorServidor } = require('../../utils/response');
const logger = require('../../utils/logger');

const manejarError = (res, err) => {
  if (err.status && err.mensaje) return error(res, err.mensaje, err.status);
  logger.error('Error no controlado en clientes', { error: err.message });
  return errorServidor(res);
};

// GET /api/clientes?q=...&tipo_cliente=...&pagina=1&limite=10
const listar = async (req, res) => {
  const { error: ve, value } = buscarClientesSchema.validate(req.query);
  if (ve) return error(res, ve.details[0].message, 400);
  try {
    const resultado = await service.buscarClientes(value);
    return exito(res, resultado);
  } catch (err) { return manejarError(res, err); }
};

// GET /api/clientes/:id
const obtener = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del cliente no es un UUID válido.', 400);
  try {
    const cliente = await service.obtenerClientePorId(req.params.id);
    return exito(res, cliente);
  } catch (err) { return manejarError(res, err); }
};

// POST /api/clientes
const crear = async (req, res) => {
  const { error: ve, value } = crearClienteSchema.validate(req.body);
  if (ve) return error(res, ve.details[0].message, 400);
  try {
    const cliente = await service.crearCliente(value);
    return creado(res, cliente, 'Cliente creado correctamente.');
  } catch (err) { return manejarError(res, err); }
};

// PUT /api/clientes/:id
const actualizar = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del cliente no es un UUID válido.', 400);
  const { error: ve, value } = actualizarClienteSchema.validate(req.body);
  if (ve) return error(res, ve.details[0].message, 400);
  try {
    const cliente = await service.actualizarCliente(req.params.id, value);
    return exito(res, cliente, 'Cliente actualizado correctamente.');
  } catch (err) { return manejarError(res, err); }
};

// DELETE /api/clientes/:id
const eliminar = async (req, res) => {
  if (!esUuidValido(req.params.id))
    return error(res, 'El ID del cliente no es un UUID válido.', 400);
  try {
    const resultado = await service.eliminarCliente(req.params.id);
    return exito(res, resultado);
  } catch (err) { return manejarError(res, err); }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
