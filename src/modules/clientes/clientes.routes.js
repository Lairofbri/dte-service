// src/modules/clientes/clientes.routes.js
// Rutas del módulo de clientes
// Autenticación dual: API Key (POS) o JWT (frontend)
// Rutas específicas ANTES de rutas con parámetros (:id)

const express    = require('express');
const router     = express.Router();
const controller = require('./clientes.controller');
const { autenticarDual } = require('../../middlewares/auth.middleware');

// Todas las rutas requieren autenticación
router.use(autenticarDual);

// GET  /api/clientes          → listar con búsqueda y paginación
router.get('/',    controller.listar);

// POST /api/clientes          → crear cliente
router.post('/',   controller.crear);

// GET  /api/clientes/:id      → obtener por ID
router.get('/:id', controller.obtener);

// PUT  /api/clientes/:id      → actualizar cliente
router.put('/:id', controller.actualizar);

// DELETE /api/clientes/:id    → soft delete
router.delete('/:id', controller.eliminar);

module.exports = router;
