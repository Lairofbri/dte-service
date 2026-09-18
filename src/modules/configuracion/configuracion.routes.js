// src/modules/configuracion/configuracion.routes.js
// Define las rutas del módulo de configuración
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }        = require('express');
const controller        = require('./configuracion.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual, requiereAdministrador } = require('../../middlewares/jwt.middleware');

const router = Router();

// GET: lectura — acepta API Key (POS) o JWT (frontend)
// POST/PATCH/test-hacienda: SOLO administrador con JWT autenticado.
// Las API Keys de integración (POS) NO pueden modificar configuración fiscal.
router.use(autenticarDual);

// GET /api/configuracion — ver configuración actual (sin credenciales)
router.get('/', controller.obtenerConfiguracion);

// POST /api/configuracion — crear configuración inicial (solo administrador)
router.post('/', requiereAdministrador, controller.crearConfiguracion);

// PATCH /api/configuracion — actualizar configuración (solo administrador)
router.patch('/', requiereAdministrador, controller.actualizarConfiguracion);

// POST /api/configuracion/test-hacienda — probar conexión con Hacienda (solo administrador)
router.post('/test-hacienda', requiereAdministrador, controller.testHacienda);

module.exports = router;
