// src/modules/auth/auth.service.js
// Lógica de autenticación JWT para usuarios del frontend
// Principio S (SOLID): solo opera autenticación, no valida ni responde HTTP
//
// SEGURIDAD CRÍTICA:
// → Password NUNCA en logs
// → JWT NUNCA en logs
// → Refresh token NUNCA en logs — solo su hash en BD
// → Verificar activo Y no bloqueado ANTES de comparar password
//   → evita timing attacks que revelan si el usuario existe
// → establecimiento_id SIEMPRE del JWT — nunca del body
// → Rate limiting en login aplicado en el router

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { query } = require('../../config/database');
const usuariosService = require('../usuarios/usuarios.service');
const {
  JWT_SECRET,
  JWT_EXPIRA_EN,
  JWT_REFRESH_EXPIRA_EN,
} = require('../../config/env');
const logger = require('../../utils/logger');

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/**
 * Generar access token JWT
 * Incluye: sub, email, rol, establecimiento_id
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
 * Generar refresh token aleatorio y guardarlo hasheado en BD
 * El token raw se devuelve al cliente — el hash se guarda en BD
 * NUNCA guardar el token raw
 */
const generarRefreshToken = async (usuarioId) => {
  // Token aleatorio de 64 bytes en hex — suficientemente único
  const tokenRaw = crypto.randomBytes(64).toString('hex');

  // Hashear con bcrypt antes de guardar en BD
  const tokenHash = await bcrypt.hash(tokenRaw, BCRYPT_ROUNDS);

  // Calcular fecha de expiración según JWT_REFRESH_EXPIRA_EN
  // Parsear '7d' → 7 días en ms
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
 * Flujo de seguridad:
 * 1. Buscar usuario por email
 * 2. Verificar activo Y no bloqueado ANTES de comparar password
 * 3. Comparar password con bcrypt (timing-safe)
 * 4. Si falla → incrementar intentos, posible bloqueo
 * 5. Si éxito → generar tokens, resetear intentos
 */
const login = async ({ email, password }) => {
  // Buscar usuario por email — incluye password_hash
  const usuario = await usuariosService.obtenerUsuarioPorEmail({
    email: email.toLowerCase(),
  });

  // Respuesta genérica si no existe — no revelar si el email existe
  if (!usuario) {
    logger.warn('Intento de login con email no registrado', {
      // NUNCA loguear el email completo en producción
      // solo los primeros caracteres para debugging
    });
    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  // Verificar que el usuario está activo
  if (!usuario.activo) {
    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  // Verificar que no está bloqueado por intentos fallidos
  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    const minutosRestantes = Math.ceil(
      (new Date(usuario.bloqueado_hasta) - new Date()) / 60000
    );
    throw {
      status:  429,
      mensaje: `Cuenta bloqueada temporalmente. Intenta en ${minutosRestantes} minuto(s).`,
    };
  }

  // Comparar password con bcrypt — timing-safe
  // NUNCA loguear el password
  const passwordValido = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordValido) {
    // Incrementar intentos fallidos — puede bloquear la cuenta
    const resultado = await usuariosService.registrarIntentoFallido({ id: usuario.id });

    logger.warn('Intento de login fallido', {
      usuario_id:       usuario.id,
      intentos:         resultado.intentos_fallidos,
      bloqueado_hasta:  resultado.bloqueado_hasta,
      // NUNCA loguear el password
    });

    if (resultado.bloqueado_hasta) {
      throw {
        status:  429,
        mensaje: 'Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.',
      };
    }

    throw { status: 401, mensaje: 'Credenciales inválidas.' };
  }

  // Login exitoso — generar tokens
  const accessToken              = generarAccessToken(usuario);
  const { tokenRaw, expiraEn }   = await generarRefreshToken(usuario.id);

  // Resetear intentos fallidos y registrar último login
  await usuariosService.registrarLoginExitoso({ id: usuario.id });

  logger.info('Login exitoso', {
    usuario_id:        usuario.id,
    rol:               usuario.rol,
    establecimiento_id: usuario.establecimiento_id,
    // NUNCA loguear tokens ni passwords
  });

  return {
    access_token:  accessToken,
    refresh_token: tokenRaw,       // raw al cliente — hash en BD
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
 * Busca el refresh token en BD comparando con bcrypt
 * Genera nuevo access token si el refresh es válido
 */
const refresh = async ({ refreshToken }) => {
  // Obtener todos los refresh tokens no expirados
  // Necesitamos comparar con bcrypt — no podemos buscar por hash directo
  // porque bcrypt usa salt aleatorio
  const { rows: tokens } = await query(
    `SELECT rt.id, rt.usuario_id, rt.token_hash, rt.expira_en,
            u.id AS u_id, u.nombre, u.email, u.rol,
            u.establecimiento_id, u.activo,
            e.nombre AS establecimiento_nombre,
            e.cod_estable_mh AS establecimiento_cod
     FROM refresh_tokens rt
     INNER JOIN usuarios u ON u.id = rt.usuario_id
     INNER JOIN establecimientos e ON e.id = u.establecimiento_id
     WHERE rt.expira_en > NOW()
       AND u.activo = TRUE
     ORDER BY rt.creado_en DESC`
  );

  // Buscar el token que coincida con bcrypt
  let tokenEncontrado = null;
  for (const token of tokens) {
    const coincide = await bcrypt.compare(refreshToken, token.token_hash);
    if (coincide) {
      tokenEncontrado = token;
      break;
    }
  }

  if (!tokenEncontrado) {
    throw { status: 401, mensaje: 'Refresh token inválido o expirado.' };
  }

  // Verificar que el usuario sigue activo y no bloqueado
  if (tokenEncontrado.bloqueado_hasta &&
      new Date(tokenEncontrado.bloqueado_hasta) > new Date()) {
    throw { status: 401, mensaje: 'Usuario bloqueado. Inicia sesión nuevamente.' };
  }

  // Generar nuevo access token
  const accessToken = generarAccessToken({
    id:                 tokenEncontrado.u_id,
    email:              tokenEncontrado.email,
    rol:                tokenEncontrado.rol,
    establecimiento_id: tokenEncontrado.establecimiento_id,
  });

  logger.info('Access token renovado', {
    usuario_id: tokenEncontrado.usuario_id,
    // NUNCA loguear tokens
  });

  return {
    access_token: accessToken,
    token_type:   'Bearer',
    expira_en:    JWT_EXPIRA_EN,
  };
};

/**
 * Logout — revocar refresh token
 * Operación idempotente — no falla si el token no existe
 * DELETE real está bien aquí — no son datos históricos
 */
const logout = async ({ refreshToken }) => {
  // Obtener tokens del usuario para comparar con bcrypt
  const { rows: tokens } = await query(
    `SELECT rt.id, rt.token_hash
     FROM refresh_tokens rt
     WHERE rt.expira_en > NOW()`
  );

  // Buscar y eliminar el token que coincida
  for (const token of tokens) {
    const coincide = await bcrypt.compare(refreshToken, token.token_hash);
    if (coincide) {
      await query(
        'DELETE FROM refresh_tokens WHERE id = $1',
        [token.id]
      );
      logger.info('Logout exitoso — refresh token revocado');
      return;
    }
  }

  // Si no se encontró el token — operación idempotente, no fallar
  logger.info('Logout — refresh token no encontrado o ya expirado');
};

/**
 * Obtener datos del usuario actual desde el JWT
 * El JWT ya fue verificado por el middleware
 * Solo necesitamos buscar datos actualizados en BD
 */
const me = async ({ usuarioId }) => {
  const usuario = await usuariosService.obtenerUsuario({ id: usuarioId });
  return usuario;
};

module.exports = {
  login,
  refresh,
  logout,
  me,
};
