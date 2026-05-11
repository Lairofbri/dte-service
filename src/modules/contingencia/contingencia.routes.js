// src/modules/contingencia/contingencia.routes.js
// Define las rutas del módulo de contingencia
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }           = require('express');
const controller           = require('./contingencia.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual }   = require('../../middlewares/jwt.middleware');

const router = Router();

// Todas las rutas aceptan API Key (POS) o JWT (frontend)
router.use(autenticarDual);

// ─────────────────────────────────────────────
// IMPORTANTE: rutas específicas ANTES de /:codigoLote
// para que Express no confunda 'pendientes' o 'notificar' con un UUID
// ─────────────────────────────────────────────

// GET /api/contingencia/pendientes — listar DTEs en contingencia
router.get('/pendientes', controller.obtenerPendientes);

// POST /api/contingencia/notificar — notificar evento y enviar lotes
router.post('/notificar', controller.notificarContingencia);

// GET /api/contingencia/lote/:codigoLote — consultar estado de un lote
router.get('/lote/:codigoLote', controller.consultarLote);

module.exports = router;
