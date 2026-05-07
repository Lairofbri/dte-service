// src/modules/hacienda/hacienda.routes.js
// Define las rutas del módulo de Hacienda
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }           = require('express');
const controller           = require('./hacienda.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');

const router = Router();

// Todas las rutas requieren API Key
router.use(autenticarApiKey);

// POST /api/hacienda/autenticar — forzar renovación del token
router.post('/autenticar', controller.autenticar);

// GET /api/hacienda/estado/:codigoGeneracion?tipo_dte=01
// Consultar estado de un DTE en Hacienda
router.get('/estado/:codigoGeneracion', controller.consultarEstado);

module.exports = router;
