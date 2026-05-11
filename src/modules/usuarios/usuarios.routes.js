// src/modules/usuarios/usuarios.routes.js
// Define las rutas del módulo de usuarios
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }           = require('express');
const controller           = require('./usuarios.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual }   = require('../../middlewares/jwt.middleware');

const router = Router();

// Todas las rutas aceptan API Key (POS) o JWT (frontend)
router.use(autenticarDual);

// ─────────────────────────────────────────────
// RUTAS — específicas ANTES de /:id
// ─────────────────────────────────────────────

// GET  /api/usuarios     → listar todos
router.get('/',    controller.listarUsuarios);

// POST /api/usuarios     → crear usuario
router.post('/',   controller.crearUsuario);

// GET  /api/usuarios/:id → detalle
router.get('/:id', controller.obtenerUsuario);

// PATCH /api/usuarios/:id → actualizar
router.patch('/:id', controller.actualizarUsuario);

// DELETE /api/usuarios/:id → desactivar (soft delete)
router.delete('/:id', controller.desactivarUsuario);

module.exports = router;
