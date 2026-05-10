// src/modules/auth/auth.service.js
// Lógica de autenticación JWT para usuarios del frontend
// Principio S (SOLID): solo opera autenticación, no valida ni responde HTTP
//
// SEGURIDAD CRÍTICA:
// → Password NUNCA en logs
// → JWT NUNCA en logs
// → Refresh token NUNCA en logs — solo su hash en BD
// → Verificar activo Y no bloqueado ANTES de comparar password
// → establecimiento_id SIEMPRE del JWT — nunca del body
//
// Fix CUBIC: Refresh tokens con SHA-256 en vez de bcrypt
// → SHA-256 es determinístico → búsqueda directa O(1) en BD
// → El token tiene 64 bytes aleatorios — entropía suficiente sin bcrypt

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { query } = require('../../config/database');
const usuariosService = require('../usuarios/usuarios.service');
const {
  JWT_SECRET,
  JWT_EXPIRA_EN,
  JWT_REFRESH_EXPIRA_EN,
} = require('../../config/env');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/**
 * Hashear refresh token con SHA-256
 * Determinístico → permite búsqueda directa WHERE token_hash = $1
 * El token tiene 512 bits de entropía — no necesita bcrypt
 */
const hashearRefreshToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Generar access token JWT
 * establecimiento_id SIEMPRE del JWT — nunca del body
 */
const generarAccessToken = (usuario) => {
  return jwt.sign(
    {
      sub:                usuario.id,
      email:              usuario.email,
      rol:                usuario.rol,
      establecimiento_id: usuario.establecimiento_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRA_EN }
  );
};

/**
 * Generar refresh token y guardarlo hasheado con SHA-256 en BD
 * El token raw va al cliente — el hash SHA-256 va a la BD
 */
const generarRefreshToken = async (usuarioId) => {
  const tokenRaw  = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashearRefreshToken(tokenRaw);

  const diasExpiracion = parseInt(JWT_REFRESH_EXPIRA_EN, 10) || 7;
  const expiraEn = new Date();
  expiraEn.setDate(expiraEn.getDate() + diasExpiracion);

  await query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en)
     VALUES ($1, $2, $3)`,
    [usuarioId, tokenHash, expiraEn.toISOString()]
  );

  return { tokenRaw, expiraEn };
};

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Login con email + password
 */
const login = async ({ email, password }) => {
  const usuario = await usuariosService.obtenerUsuarioPorEmail({
    email: email.toLowerCase(),
  });

  if (!usuario) {
    logger.warn('Intento de login con email no registrado');
    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  if (!usuario.activo) {
    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    const minutosRestantes = Math.ceil(
      (new Date(usuario.bloqueado_hasta) - new Date()) / 60000
    );
    throw {
      status:  429,
      mensaje: `Cuenta bloqueada temporalmente. Intenta en ${minutosRestantes} minuto(s).`,
    };
  }

  const passwordValido = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordValido) {
    const resultado = await usuariosService.registrarIntentoFallido({ id: usuario.id });

    logger.warn('Intento de login fallido', {
      usuario_id:      usuario.id,
      intentos:        resultado.intentos_fallidos,
      bloqueado_hasta: resultado.bloqueado_hasta,
    });

    if (resultado.bloqueado_hasta) {
      throw {
        status:  429,
        mensaje: 'Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.',
      };
    }

    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  const accessToken            = generarAccessToken(usuario);
  const { tokenRaw, expiraEn } = await generarRefreshToken(usuario.id);

  await usuariosService.registrarLoginExitoso({ id: usuario.id });

  logger.info('Login exitoso', {
    usuario_id:         usuario.id,
    rol:                usuario.rol,
    establecimiento_id: usuario.establecimiento_id,
  });

  return {
    access_token:  accessToken,
    refresh_token: tokenRaw,
    token_type:    'Bearer',
    expira_en:     JWT_EXPIRA_EN,
    usuario: {
      id:                 usuario.id,
      nombre:             usuario.nombre,
      email:              usuario.email,
      rol:                usuario.rol,
      establecimiento_id: usuario.establecimiento_id,
      establecimiento:    usuario.establecimiento_nombre ? {
        nombre:         usuario.establecimiento_nombre,
        cod_estable_mh: usuario.establecimiento_cod,
      } : null,
    },
  };
};

/**
 * Renovar access token usando refresh token
 * Fix CUBIC: búsqueda O(1) por hash SHA-256
 */
const refresh = async ({ refreshToken }) => {
  const tokenHash = hashearRefreshToken(refreshToken);

  const { rows } = await query(
    `SELECT
       rt.id,
       rt.expira_en,
       u.id               AS u_id,
       u.nombre,
       u.email,
       u.rol,
       u.establecimiento_id,
       u.activo,
       u.bloqueado_hasta,
       e.nombre           AS establecimiento_nombre,
       e.cod_estable_mh   AS establecimiento_cod
     FROM refresh_tokens rt
     INNER JOIN usuarios        u ON u.id  = rt.usuario_id
     INNER JOIN establecimientos e ON e.id = u.establecimiento_id
     WHERE rt.token_hash = $1
       AND rt.expira_en  > NOW()
       AND u.activo      = TRUE`,
    [tokenHash]
  );

  if (rows.length === 0) {
    throw { status: 401, mensaje: 'Refresh token inválido o expirado.' };
  }

  const t = rows[0];

  if (t.bloqueado_hasta && new Date(t.bloqueado_hasta) > new Date()) {
    throw { status: 401, mensaje: 'Usuario bloqueado. Inicia sesión nuevamente.' };
  }

  const accessToken = generarAccessToken({
    id:                 t.u_id,
    email:              t.email,
    rol:                t.rol,
    establecimiento_id: t.establecimiento_id,
  });

  logger.info('Access token renovado', { usuario_id: t.u_id });

  return {
    access_token: accessToken,
    token_type:   'Bearer',
    expira_en:    JWT_EXPIRA_EN,
  };
};

/**
 * Logout — revocar refresh token
 * Fix CUBIC: DELETE directo por hash SHA-256 → O(1)
 * Idempotente — no falla si el token no existe
 */
const logout = async ({ refreshToken }) => {
  const tokenHash = hashearRefreshToken(refreshToken);

  await query(
    'DELETE FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );

  logger.info('Logout exitoso — refresh token revocado');
};

/**
 * Obtener datos del usuario actual
 * JWT ya verificado por middleware autenticarJWT
 */
const me = async ({ usuarioId }) => {
  return await usuariosService.obtenerUsuario({ id: usuarioId });
};

module.exports = {
  login,
  refresh,
  logout,
  me,
};
