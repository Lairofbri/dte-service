// src/modules/provisioning/provisioning.controller.js
// Controlador HTTP del módulo de provisión (Fase 2).
// Principio S (SOLID): solo orquesta request → service → response.

const service = require('./provisioning.service');
const { exito, creado, error, errorServidor, noAutenticado, sinPermiso } = require('../../utils/response');
const logger = require('../../utils/logger');

const manejarError = (res, err) => {
  const e = err && typeof err === 'object' ? err : {};
  if (e.status && e.mensaje) return error(res, e.mensaje, e.status);
  logger.error('Error no controlado en provisión', { error: e.message || String(err) });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// RUTAS INTERNAS (servidor-a-servidor desde POS)
// ─────────────────────────────────────────────

/** POST /internal/provisioning/tenants — crear o reconciliar tenant. */
const crearTenant = async (req, res) => {
  try {
    const resultado = await service.crearTenant({
      datos: req.body,
      operationId: req.operationId,
      ip: req.ip,
      origen: 'pos',
    });
    const payload = {
      tenant_id: resultado.tenant.id,
      nombre: resultado.tenant.nombre,
      provisioning_status: resultado.tenant.provisioning_status,
      api_key: resultado.api_key,
    };
    if (resultado.api_key) {
      return creado(res, payload, 'Tenant creado. API Key generada (se devuelve una sola vez).');
    }
    return exito(res, payload, 'Operación de provisión ya registrada.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** PATCH /internal/provisioning/tenants/:tenantId/status — confirmar estado. */
const actualizarEstado = async (req, res) => {
  try {
    const resultado = await service.actualizarEstado({
      tenantId: req.params.tenantId,
      datos: req.body,
      operationId: req.operationId,
      ip: req.ip,
    });
    return exito(res, resultado, resultado.duplicado ? 'Estado ya registrado.' : 'Estado de provisión actualizado.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** POST /internal/provisioning/tenants/:tenantId/branches — vínculo de sucursal (Fase 3). */
const vincularSucursal = async (req, res) => {
  try {
    const resultado = await service.vincularSucursal({
      tenantId: req.params.tenantId,
      datos: req.body,
      operationId: req.operationId,
      ip: req.ip,
    });
    if (resultado.duplicado) {
      return exito(res, resultado.establecimiento, 'Vínculo de sucursal ya registrado.');
    }
    return creado(res, resultado.establecimiento, 'Sucursal vinculada. Pendiente de datos MH.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** POST /internal/provisioning/events/:operationId/ack — confirmar evento. */
const confirmarEvento = async (req, res) => {
  try {
    const { confirmarEventoSchema } = require('./provisioning.schema');
    const { error: validacionError } = confirmarEventoSchema.validate({ operation_id: req.params.operationId });
    if (validacionError) {
      return error(res, validacionError.details[0].message, 400);
    }
    const { confirmarEvento: confirmar } = require('./outbox.service');
    const resultado = await confirmar({ operation_id: req.params.operationId });
    return exito(res, resultado, 'Evento confirmado.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** GET /internal/provisioning/tenants/:tenantId/estado-fiscal — consulta de estado fiscal (Fase 4). */
const obtenerEstadoFiscal = async (req, res) => {
  try {
    const estado = await service.obtenerEstadoFiscalTenant({ tenantId: req.params.tenantId });
    return exito(res, estado);
  } catch (err) {
    return manejarError(res, err);
  }
};

// ─────────────────────────────────────────────
// RUTAS DE PLATAFORMA (JWT, rol plataforma)
// ─────────────────────────────────────────────

/** POST /api/provisioning/tenants — alta de empresa desde DTE (rol plataforma). */
const crearTenantDesdePlataforma = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  if (req.usuario.rol !== 'plataforma') {
    return sinPermiso(res, 'Solo usuarios de plataforma pueden iniciar el alta de empresas.');
  }
  try {
    const resultado = await service.crearTenantDesdePlataforma({
      datos: req.body,
      operationId: req.operationId,
      usuario: req.usuario,
      ip: req.ip,
    });
    return creado(
      res,
      {
        tenant_id: resultado.tenant.id,
        nombre: resultado.tenant.nombre,
        provisioning_status: resultado.tenant.provisioning_status,
      },
      'Empresa creada. El POS la recibirá por evento de provisión.'
    );
  } catch (err) {
    return manejarError(res, err);
  }
};

// ─────────────────────────────────────────────
// ESTADO VISIBLE AL ADMINISTRADOR DTE
// ─────────────────────────────────────────────

/** GET /api/provisioning/status — estado de onboarding. */
const listarEstadoProvision = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  const esPlataforma = req.usuario.rol === 'plataforma';
  const esAdministrador = req.usuario.rol === 'administrador';
  if (!esPlataforma && !esAdministrador) {
    return sinPermiso(res, 'Solo administradores o usuarios de plataforma pueden ver el estado de provisión.');
  }
  try {
    const tenants = await service.listarEstadoProvision({
      tenant_id: req.usuario.tenant_id,
      esPlataforma,
    });
    return exito(res, tenants);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  crearTenant,
  actualizarEstado,
  vincularSucursal,
  confirmarEvento,
  obtenerEstadoFiscal,
  crearTenantDesdePlataforma,
  listarEstadoProvision,
};