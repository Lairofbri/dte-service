// src/modules/firmador/firmador.routes.js
// Define las rutas del módulo firmador
// Solo expone el endpoint de verificación de estado
// La firma es interna — no está expuesta como endpoint HTTP

const { Router }           = require('express');
const controller           = require('./firmador.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual }   = require('../../middlewares/jwt.middleware');

const router = Router();

// Todas las rutas aceptan API Key (POS) o JWT (frontend)
router.use(autenticarDual);

// GET /api/firmador/estado — verificar que el firmador esté corriendo
router.get('/estado', controller.verificarEstado);

module.exports = router;
