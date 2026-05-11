// src/modules/auth/auth.controller.js
// Orquesta los requests HTTP del módulo de autenticación
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → Password NUNCA en logs ni respuestas
// → JWT NUNCA en logs
// → Refresh token en httpOnly cookie — JavaScript no puede leerlo
//   → inmune a XSS — el navegador lo envía automáticamente
// → Errores genéricos en login para no revelar info

const service = require('./auth.service');
const { loginSchema } = require('./auth.schema');
const {
  exito,
  error,
  errorServidor,
} = require('../../utils/response');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// CONSTANTES DE LA COOKIE
// ─────────────────────────────────────────────
const COOKIE_NOMBRE  = 'dte_refresh_token';
const COOKIE_OPCIONES = {
  httpOnly: true,    // JavaScript no puede leerla — inmune a XSS
  secure:   process.env.NODE_ENV === 'production', // HTTPS solo en producción
  sameSite: 'strict', // Solo se envía en requests del mismo origen
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 días en milisegundos
  path:     '/api/auth', // Solo se envía a rutas de auth
};

// ─────────────────────────────────────────────
// Helper: manejo de errores
// ─────────────────────────────────────────────
const manejarError = (res, err) => {
  if (err.status && err.mensaje) {
    return error(res, err.mensaje, err.status);
  }
  logger.error('Error no controlado en auth', {
    error: err.message,
  });
  return errorServidor(res);
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Login con email + password
 * → access_token en el body (memoria del frontend)
 * → refresh_token en httpOnly cookie (invisible para JavaScript)
 */
const login = async (req, res) => {
  const { error: validacionError, value } = loginSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.login({
      email:    value.email,
      password: value.password,
    });

    // Guardar refresh token en httpOnly cookie
    // JavaScript del frontend NO puede leerla — inmune a XSS
    res.cookie(COOKIE_NOMBRE, resultado.refresh_token, COOKIE_OPCIONES);

    // Devolver access token en body — el frontend lo guarda en memoria (Zustand)
    // NUNCA devolver el refresh_token en el body
    return exito(res, {
      access_token: resultado.access_token,
      token_type:   resultado.token_type,
      expira_en:    resultado.expira_en,
      usuario:      resultado.usuario,
    }, 'Login exitoso.');

  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token de la cookie httpOnly
 * El navegador envía la cookie automáticamente — no necesita body
 */
const refresh = async (req, res) => {
  // Leer refresh token de la cookie httpOnly — no del body
  const refreshToken = req.cookies?.[COOKIE_NOMBRE];

  if (!refreshToken) {
    return error(res, 'Sesión expirada. Inicia sesión nuevamente.', 401);
  }

  try {
    const resultado = await service.refresh({ refreshToken });

    // Renovar la cookie también
    res.cookie(COOKIE_NOMBRE, refreshToken, COOKIE_OPCIONES);

    return exito(res, resultado, 'Token renovado exitosamente.');
  } catch (err) {
    // Si el refresh falla limpiar la cookie
    res.clearCookie(COOKIE_NOMBRE, { path: '/api/auth' });
    return manejarError(res, err);
  }
};

/**
 * POST /api/auth/logout
 * Revocar refresh token de la cookie httpOnly
 * Limpiar la cookie del navegador
 */
const logout = async (req, res) => {
  const refreshToken = req.cookies?.[COOKIE_NOMBRE];

  try {
    // Si hay cookie — revocarla en BD
    if (refreshToken) {
      await service.logout({ refreshToken });
    }

    // Limpiar la cookie del navegador siempre — operación idempotente
    res.clearCookie(COOKIE_NOMBRE, { path: '/api/auth' });

    return exito(res, null, 'Sesión cerrada exitosamente.');
  } catch (err) {
    // Limpiar cookie aunque falle el servicio
    res.clearCookie(COOKIE_NOMBRE, { path: '/api/auth' });
    return manejarError(res, err);
  }
};

/**
 * GET /api/auth/me
 * Obtener datos del usuario actual
 * Requiere JWT válido — verificado por middleware autenticarJWT
 */
const me = async (req, res) => {
  try {
    const usuario = await service.me({ usuarioId: req.usuario.id });
    return exito(res, usuario);
  } catch (err) {
    return manejarError(res, err);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  me,
};
