// src/modules/establecimientos/establecimientos.routes.js
// Define las rutas del módulo de establecimientos
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }           = require('express');
const controller           = require('./establecimientos.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');

const router = Router();

// Todas las rutas requieren API Key
router.use(autenticarApiKey);

// ─────────────────────────────────────────────
// RUTAS
// Rutas específicas ANTES de /:id — lección aprendida
// ─────────────────────────────────────────────

// GET  /api/establecimientos         → listar todos
router.get('/', controller.listarEstablecimientos);

// POST /api/establecimientos         → crear nuevo
router.post('/', controller.crearEstablecimiento);

// GET  /api/establecimientos/:id     → detalle
router.get('/:id', controller.obtenerEstablecimiento);

// PATCH /api/establecimientos/:id    → actualizar
router.patch('/:id', controller.actualizarEstablecimiento);

// DELETE /api/establecimientos/:id   → desactivar (soft delete)
router.delete('/:id', controller.desactivarEstablecimiento);

module.exports = router;
