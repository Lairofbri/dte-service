// src/modules/auditoria/auditoria.routes.js
// Define las rutas del módulo de auditoría
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD:
// → Solo GET — auditoría es de solo lectura
// → Todas las rutas requieren API Key válida
// → Rutas específicas ANTES de /:id para evitar conflicto con Express

const { Router }           = require('express');
const controller           = require('./auditoria.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual, soloAdministrador } = require('../../middlewares/jwt.middleware');

const router = Router();

// Auditoría: autenticación dual + solo administrador
// Un operador no puede ver logs de toda la empresa
router.use(autenticarDual);
router.use(soloAdministrador);

// ─────────────────────────────────────────────
// IMPORTANTE: rutas específicas ANTES de /:id
// 'resumen' debe estar antes de /:id
// para que Express no lo confunda con un UUID
// ─────────────────────────────────────────────

// GET /api/auditoria/resumen — resumen estadístico
router.get('/resumen', controller.obtenerResumen);

// GET /api/auditoria — listar con filtros y paginación
router.get('/', controller.listarAuditoria);

// GET /api/auditoria/:id — detalle de un registro
router.get('/:id', controller.obtenerRegistro);

module.exports = router;