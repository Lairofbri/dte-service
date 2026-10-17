// src/modules/provisioning/provisioning.controller.js
// Controlador HTTP del módulo de provisión (Fase 2).
// Principio S (SOLID): solo orquesta request → service → response.

const service = require('./provisioning.service');
const { tieneRol, puedeAdministrarTenant } = require('../../utils/roles');
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

/** GET /internal/provisioning/tenants/:tenantId/empresa — ficha de empresa + sucursales (F1, sin secretos). */
const obtenerEmpresa = async (req, res) => {
  try {
    const empresa = await service.obtenerEmpresaTenant({ tenantId: req.params.tenantId });
    return exito(res, empresa);
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
  if (!tieneRol(req.usuario, 'plataforma')) {
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
      'Empresa creada. Usuario administrador inicial creado en DTE; POS lo recibirá por evento de provisión.'
    );
  } catch (err) {
    return manejarError(res, err);
  }
};

/** PATCH /api/provisioning/tenants/:tenantId — editar datos de la empresa. */
const actualizarTenantDesdePlataforma = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  if (!tieneRol(req.usuario, 'plataforma')) {
    return sinPermiso(res, 'Solo usuarios de plataforma pueden editar empresas.');
  }
  try {
    const tenant = await service.actualizarTenantDesdePlataforma({
      tenantId: req.params.tenantId,
      datos: req.body,
      usuario: req.usuario,
      ip: req.ip,
    });
    return exito(res, tenant, 'Datos de la empresa actualizados.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** PATCH /api/provisioning/tenants/:tenantId/admin — editar admin inicial. */
const actualizarAdminDesdePlataforma = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  if (!tieneRol(req.usuario, 'plataforma')) {
    return sinPermiso(res, 'Solo usuarios de plataforma pueden editar el administrador de una empresa.');
  }
  try {
    const admin = await service.actualizarAdminDesdePlataforma({
      tenantId: req.params.tenantId,
      datos: req.body,
      usuario: req.usuario,
      ip: req.ip,
    });
    return exito(res, admin, 'Administrador actualizado.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** POST /api/provisioning/tenants/:tenantId/habilitar-pos — habilitar POS en una empresa "solo DTE". */
const habilitarPosTenant = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  if (!tieneRol(req.usuario, 'plataforma')) {
    return sinPermiso(res, 'Solo usuarios de plataforma pueden habilitar POS en una empresa.');
  }
  try {
    const resultado = await service.habilitarPosTenant({
      tenantId: req.params.tenantId,
      datos: req.body,
      usuario: req.usuario,
      ip: req.ip,
    });
    if (resultado.ya_habilitado) {
      return exito(res, resultado, 'La empresa ya tenía POS habilitado.');
    }
    return creado(res, resultado, 'POS habilitado. La API Key se devuelve UNA sola vez.');
  } catch (err) {
    return manejarError(res, err);
  }
};

// ─────────────────────────────────────────────
// ESTADO VISIBLE AL ADMINISTRADOR DTE
// ─────────────────────────────────────────────

/** POST /api/provisioning/tenants/:tenantId/reintentar-sync — destrabar la entrega al POS. */
const reintentarSincronizacionPos = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  if (!puedeAdministrarTenant(req.usuario)) {
    return sinPermiso(res, 'Solo administradores o usuarios de plataforma pueden reintentar la sincronización.');
  }
  // Un administrador solo puede reintentar SU tenant; plataforma, cualquiera.
  if (!tieneRol(req.usuario, 'plataforma') && req.params.tenantId !== req.usuario.tenant_id) {
    return sinPermiso(res, 'Solo podés reintentar la sincronización de tu propia empresa.');
  }
  try {
    const resultado = await service.reintentarSincronizacionPos({
      tenantId: req.params.tenantId,
      usuario: req.usuario,
      ip: req.ip,
    });
    return exito(res, resultado, 'Sincronización con el POS reintentada.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/** GET /api/provisioning/status — estado de onboarding. */
const listarEstadoProvision = async (req, res) => {
  if (!req.usuario || !req.usuario.tenant_id) {
    return noAutenticado(res, 'Autenticación de usuario requerida.');
  }
  const esPlataforma = tieneRol(req.usuario, 'plataforma');
  if (!puedeAdministrarTenant(req.usuario)) {
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
  obtenerEmpresa,
  crearTenantDesdePlataforma,
  actualizarTenantDesdePlataforma,
  actualizarAdminDesdePlataforma,
  habilitarPosTenant,
  reintentarSincronizacionPos,
  listarEstadoProvision,
};