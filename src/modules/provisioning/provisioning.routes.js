// src/modules/provisioning/provisioning.routes.js
// Rutas de provisión (Fase 2) — spec §8.
//
// Rutas internas (servidor-a-servidor, NUNCA públicas para usuarios finales):
//   POST  /internal/provisioning/tenants
//   PATCH /internal/provisioning/tenants/:tenantId/status
//   POST  /internal/provisioning/tenants/:tenantId/branches   (Fase 3)
//   POST  /internal/provisioning/events/:operationId/ack
//
// Rutas de plataforma (JWT, rol plataforma):
//   POST  /api/provisioning/tenants          — alta desde DTE
//   PATCH /api/provisioning/tenants/:tenantId      — editar datos de la empresa
//   PATCH /api/provisioning/tenants/:tenantId/admin — editar administrador inicial
//
// Ruta de estado (JWT, admin o plataforma):
//   GET   /api/provisioning/status           — estado visible al admin DTE
//
// Requisitos spec §8: clave interna distinta de la API Key del POS,
// idempotencia obligatoria, validación de tenant y branch, auditoría y
// rate limit específico de provisión.

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./provisioning.controller');
const { autenticarApiKeyInterna } = require('../../middlewares/internal.middleware');
const { idempotenciaObligatoria } = require('../../middlewares/idempotencia.middleware');
const { autenticarJWT } = require('../../middlewares/jwt.middleware');

// Rate limit específico de provisión (spec §8).
const limiteProvision = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { ok: false, mensaje: 'Límite de operaciones de provisión alcanzado.' },
  keyGenerator: (req) => req.ip,
});

// ─────────────────────────────────────────────
// RUTAS INTERNAS — servidor-a-servidor (POS → DTE)
// ─────────────────────────────────────────────
const routerInterno = Router();
routerInterno.use(limiteProvision);
routerInterno.use(autenticarApiKeyInterna);

routerInterno.post('/tenants', idempotenciaObligatoria, controller.crearTenant);
routerInterno.patch('/tenants/:tenantId/status', idempotenciaObligatoria, controller.actualizarEstado);
routerInterno.post('/tenants/:tenantId/branches', idempotenciaObligatoria, controller.vincularSucursal);
routerInterno.get('/tenants/:tenantId/estado-fiscal', controller.obtenerEstadoFiscal);
routerInterno.post('/events/:operationId/ack', controller.confirmarEvento);

// ─────────────────────────────────────────────
// RUTAS API — JWT de usuario
// ─────────────────────────────────────────────
const routerApi = Router();
routerApi.use(autenticarJWT);

routerApi.post('/tenants', idempotenciaObligatoria, controller.crearTenantDesdePlataforma);
routerApi.patch('/tenants/:tenantId', controller.actualizarTenantDesdePlataforma);
routerApi.patch('/tenants/:tenantId/admin', controller.actualizarAdminDesdePlataforma);
routerApi.get('/status', controller.listarEstadoProvision);

module.exports = { routerInterno, routerApi };