// src/modules/productos/productos.routes.js
// Rutas del módulo de productos
// Autenticación dual: API Key (POS) o JWT (frontend)
// Rutas específicas ANTES de rutas con parámetros (:id)

const express    = require('express');
const router     = express.Router();
const controller = require('./productos.controller');
const { autenticarDual } = require('../../middlewares/jwt.middleware');

// Todas las rutas requieren autenticación
router.use(autenticarDual);

// GET  /api/productos          → listar con búsqueda y paginación
router.get('/',    controller.listar);

// POST /api/productos          → crear producto
router.post('/',   controller.crear);

// GET  /api/productos/:id      → obtener por ID
router.get('/:id', controller.obtener);

// PUT  /api/productos/:id      → actualizar producto
router.put('/:id', controller.actualizar);

// DELETE /api/productos/:id    → soft delete
router.delete('/:id', controller.eliminar);

module.exports = router;