// src/modules/auth/auth.routes.js
// Define las rutas del módulo de autenticación
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD:
// → Rate limiting estricto en /login — máximo 10 intentos por minuto por IP
// → /login, /refresh, /logout — públicos (sin auth)
// → /me — requiere JWT válido

const { Router }        = require('express');
const rateLimit         = require('express-rate-limit');
const controller        = require('./auth.controller');
const { autenticarJWT } = require('../../middlewares/jwt.middleware');

const router = Router();

// ─────────────────────────────────────────────
// RATE LIMITING ESTRICTO PARA LOGIN
// Máximo 10 intentos por minuto por IP
// Más estricto que el rate limiting general
// ─────────────────────────────────────────────
const limiteLogin = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max:      10,
  message:  {
    ok:      false,
    mensaje: 'Demasiados intentos de login. Espera 1 minuto antes de intentar de nuevo.',
  },
  keyGenerator:    (req) => req.ip,
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─────────────────────────────────────────────
// RUTAS PÚBLICAS — sin autenticación
// ─────────────────────────────────────────────

// POST /api/auth/login — con rate limiting estricto
router.post('/login',   limiteLogin, controller.login);

// POST /api/auth/refresh — renovar access token
router.post('/refresh', controller.refresh);

// POST /api/auth/logout — revocar refresh token
router.post('/logout',  controller.logout);

// ─────────────────────────────────────────────
// RUTAS PROTEGIDAS — requieren JWT válido
// ─────────────────────────────────────────────

// GET /api/auth/me — datos del usuario actual
router.get('/me', autenticarJWT, controller.me);

module.exports = router;
