// src/modules/dtes/dtes.controller.js
// Orquesta los requests HTTP del módulo de DTEs
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → passwordPri se extrae del body y se pasa al service — nunca se loguea
// → Los errores de Hacienda se devuelven al cliente de forma controlada
// → UUID validado en todos los params antes de llamar al service

const service = require('./dtes.service');
const {
  emitirFCFSchema,
  emitirCCFSchema,
  emitirNotaSchema,
  emitirFSESchema,
  anularDTESchema,
  filtrosDTESchema,
} = require('./dtes.schema');
const { esUuidValido } = require('../../middlewares/uuid.middleware');
const {
  exito,
  creado,
  error,
  errorServidor,
} = require('../../utils/response');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// Helper: manejo de errores
// ─────────────────────────────────────────────
const manejarError = (res, err) => {
  if (err.status && err.mensaje) {
    // Incluir detalles de Hacienda si existen (códigos de error, observaciones)
    return res.status(err.status).json({
      ok:       false,
      mensaje:  err.mensaje,
      detalles: err.detalles || undefined,
    });
  }
  logger.error('Error no controlado en dtes', {
    error: err.message,
    stack: err.stack,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * POST /api/dte/emitir/fcf
 * Emite una Factura Consumidor Final
 */
const emitirFCF = async (req, res) => {
  const { error: validacionError, value } = emitirFCFSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // establecimiento_id siempre del JWT — nunca del body
  const datos = {
    ...value,
    establecimiento_id: req.usuario?.establecimiento_id || null,
  };

  try {
    const resultado = await service.emitirFCF({ datos, ip: req.ip });
    const status    = resultado.estado === 'contingencia' ? 202 : 201;
    return res.status(status).json({ ok: true, data: resultado });
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/dte/emitir/ccf
 * Emite un Comprobante de Crédito Fiscal
 */
const emitirCCF = async (req, res) => {
  const { error: validacionError, value } = emitirCCFSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  const datos = {
    ...value,
    establecimiento_id: req.usuario?.establecimiento_id || null,
  };

  try {
    const resultado = await service.emitirCCF({ datos, ip: req.ip });
    const status    = resultado.estado === 'contingencia' ? 202 : 201;
    return res.status(status).json({ ok: true, data: resultado });
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/dte/emitir/nota-credito
 * Emite una Nota de Crédito
 */
const emitirNotaCredito = async (req, res) => {
  const { error: validacionError, value } = emitirNotaSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.emitirNotaCredito({ datos: value, ip: req.ip });
    return creado(res, resultado, 'Nota de Crédito emitida exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/dte/emitir/nota-debito
 * Emite una Nota de Débito
 */
const emitirNotaDebito = async (req, res) => {
  const { error: validacionError, value } = emitirNotaSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.emitirNotaDebito({ datos: value, ip: req.ip });
    return creado(res, resultado, 'Nota de Débito emitida exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/dte/emitir/fse
 * Emite una Factura de Sujeto Excluido
 */
const emitirFSE = async (req, res) => {
  const { error: validacionError, value } = emitirFSESchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // Normalizar sujeto_excluido → receptor para el service
  // El POS puede enviar sujeto_excluido, el frontend envía receptor
  const receptor = value.receptor || (value.sujeto_excluido ? {
    nit:            value.sujeto_excluido.nit,
    nombre:         value.sujeto_excluido.nombre,
    cod_actividad:  value.sujeto_excluido.cod_actividad || value.sujeto_excluido.codigo_actividad,
    desc_actividad: value.sujeto_excluido.desc_actividad,
    correo:         value.sujeto_excluido.correo || value.sujeto_excluido.email,
    telefono:       value.sujeto_excluido.telefono,
    direccion:      value.sujeto_excluido.direccion,
    departamento_cod: value.sujeto_excluido.departamento_cod,
    municipio_cod:  value.sujeto_excluido.municipio_cod,
  } : null);

  const datos = {
    ...value,
    receptor,
    establecimiento_id: req.usuario?.establecimiento_id || null,
  };

  try {
    const resultado = await service.emitirFSE({ datos, ip: req.ip });
    const status    = resultado.estado === 'contingencia' ? 202 : 201;
    return res.status(status).json({ ok: true, data: resultado });
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/dte/anular
 * Anula un DTE existente
 */
const anularDTE = async (req, res) => {
  const { error: validacionError, value } = anularDTESchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  // Validar UUID del codigo_generacion
  if (!esUuidValido(value.codigo_generacion)) {
    return error(res, 'El código de generación no tiene un formato UUID válido.', 400);
  }

  try {
    const resultado = await service.anularDTE({ datos: value, ip: req.ip });
    return exito(res, resultado, 'DTE anulado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/dte
 * Lista DTEs con filtros y paginación
 */
const listarDTEs = async (req, res) => {
  const paginaRaw = req.query.pagina ? Number(req.query.pagina) : 1;
  const limiteRaw = req.query.limite ? Number(req.query.limite) : 20;

  if (req.query.pagina && (!Number.isInteger(paginaRaw) || paginaRaw < 1)) {
    return error(res, 'El parámetro pagina debe ser un número entero positivo.', 400);
  }
  if (req.query.limite && (!Number.isInteger(limiteRaw) || limiteRaw < 1)) {
    return error(res, 'El parámetro limite debe ser un número entero positivo.', 400);
  }

  const { error: validacionError, value: filtros } = filtrosDTESchema.validate({
    ...req.query,
    pagina: paginaRaw,
    limite: limiteRaw,
  });

  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    // req.establecimientoId viene del middleware de scoping en dtes.routes.js
    // Si es JWT → filtra por establecimiento del usuario
    // Si es API Key → sin filtro (el POS es de confianza)
    const resultado = await service.listarDTEs({
      filtros,
      establecimientoId: req.establecimientoId,
    });
    return exito(res, resultado);
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * GET /api/dte/:codigoGeneracion
 * Detalle de un DTE por código de generación
 * Fix: validar UUID antes de llamar al service
 */
const obtenerDTE = async (req, res) => {
  const { codigoGeneracion } = req.params;

  if (!esUuidValido(codigoGeneracion)) {
    return error(res, 'El código de generación no tiene un formato UUID válido.', 400);
  }

  try {
    const dte = await service.obtenerDTE({
      codigoGeneracion,
      establecimientoId: req.establecimientoId,
    });
    return exito(res, dte);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  emitirFCF,
  emitirCCF,
  emitirNotaCredito,
  emitirNotaDebito,
  emitirFSE,
  anularDTE,
  listarDTEs,
  obtenerDTE,
};
