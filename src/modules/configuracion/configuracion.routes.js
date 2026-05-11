// src/modules/configuracion/configuracion.routes.js
// Define las rutas del módulo de configuración
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }        = require('express');
const controller        = require('./configuracion.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual }   = require('../../middlewares/jwt.middleware');

const router = Router();

// Todas las rutas aceptan API Key (POS) o JWT (frontend)
router.use(autenticarDual);

// GET /api/configuracion — ver configuración actual (sin credenciales)
router.get('/', controller.obtenerConfiguracion);

// POST /api/configuracion — crear configuración inicial
router.post('/', controller.crearConfiguracion);

// PATCH /api/configuracion — actualizar configuración
router.patch('/', controller.actualizarConfiguracion);

// POST /api/configuracion/test-hacienda — probar conexión con Hacienda
router.post('/test-hacienda', controller.testHacienda);

module.exports = router;
