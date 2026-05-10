// src/modules/auth/auth.controller.js
// Orquesta los requests HTTP del módulo de autenticación
// Principio S (SOLID): solo recibe, valida y responde
//
// SEGURIDAD:
// → Password NUNCA en logs ni respuestas
// → JWT NUNCA en logs
// → Refresh token NUNCA en logs
// → Errores genéricos en login para no revelar info

const service = require('./auth.service');
const {
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('./auth.schema');
const {
  exito,
  error,
  errorServidor,
} = require('../../utils/response');
const logger = require('../../utils/logger');

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
 * Devuelve access token + refresh token
 * Rate limiting aplicado en el router — máximo 10 intentos/minuto por IP
 */
const login = async (req, res) => {
  const { error: validacionError, value } = loginSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.login({
      email:    value.email,
      password: value.password,
    });
    return exito(res, resultado, 'Login exitoso.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token
 */
const refresh = async (req, res) => {
  const { error: validacionError, value } = refreshSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    const resultado = await service.refresh({
      refreshToken: value.refresh_token,
    });
    return exito(res, resultado, 'Token renovado exitosamente.');
  } catch (err) {
    return manejarError(res, err);
  }
};

/**
 * POST /api/auth/logout
 * Revocar refresh token — operación idempotente
 */
const logout = async (req, res) => {
  const { error: validacionError, value } = logoutSchema.validate(req.body);
  if (validacionError) return error(res, validacionError.details[0].message, 400);

  try {
    await service.logout({ refreshToken: value.refresh_token });
    return exito(res, null, 'Sesión cerrada exitosamente.');
  } catch (err) {
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
    // req.usuario fue agregado por el middleware autenticarJWT
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
