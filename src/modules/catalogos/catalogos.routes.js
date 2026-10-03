// src/modules/catalogos/catalogos.routes.js
// Define las rutas del módulo de catálogos de Hacienda
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: catálogos de referencia global — lectura para cualquier
// consumidor autenticado (JWT del frontend o API Key del POS).

const { Router } = require('express');
const controller = require('./catalogos.controller');
const { autenticarDual } = require('../../middlewares/jwt.middleware');

const router = Router();

router.use(autenticarDual);

// GET /api/catalogos/:catalogo — listado de un catálogo (slug de whitelist)
router.get('/:catalogo', controller.listarCatalogo);

module.exports = router;