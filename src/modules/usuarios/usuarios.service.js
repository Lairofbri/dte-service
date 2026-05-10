// src/modules/usuarios/usuarios.service.js
// Lógica de negocio del módulo de usuarios
// Principio S (SOLID): solo opera datos, no valida ni responde HTTP
//
// SEGURIDAD CRÍTICA:
// → Password hasheado con bcrypt 12 rondas ANTES de guardar
// → Password NUNCA en respuestas HTTP — ni hasheado
// → Password NUNCA en logs
// → Al desactivar verificar que no es el único administrador
// → Email único verificado en código Y en BD
// → Soft delete — nunca eliminar usuarios

const bcrypt           = require('bcryptjs');
const { query, getClient } = require('../../config/database');
const logger           = require('../../utils/logger');

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────
// HELPER: formatear usuario para respuesta HTTP
// NUNCA incluir password_hash
// ─────────────────────────────────────────────
const formatearUsuario = (row) => ({
  id:                 row.id,
  nombre:             row.nombre,
  email:              row.email,
  rol:                row.rol,
  establecimiento_id: row.establecimiento_id,
  establecimiento:    row.establecimiento_nombre ? {
    id:     row.establecimiento_id,
    nombre: row.establecimiento_nombre,
    cod_estable_mh: row.establecimiento_cod,
  } : null,
  activo:             row.activo,
  intentos_fallidos:  row.intentos_fallidos,
  bloqueado_hasta:    row.bloqueado_hasta || null,
  ultimo_login:       row.ultimo_login    || null,
  creado_en:          row.creado_en,
  actualizado_en:     row.actualizado_en,
  // NUNCA incluir password_hash
});

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Listar usuarios con datos de su establecimiento
 * Alias u. para usuarios, e. para establecimientos
 */
const listarUsuarios = async ({ soloActivos = false } = {}) => {
  const condicion = soloActivos ? 'WHERE u.activo = TRUE' : '';

  const { rows } = await query(
    `SELECT
       u.id,
       u.nombre,
       u.email,
       u.rol,
       u.establecimiento_id,
       u.activo,
       u.intentos_fallidos,
       u.bloqueado_hasta,
       u.ultimo_login,
       u.creado_en,
       u.actualizado_en,
       e.nombre        AS establecimiento_nombre,
       e.cod_estable_mh AS establecimiento_cod
     FROM usuarios u
     INNER JOIN establecimientos e ON e.id = u.establecimiento_id
     ${condicion}
     ORDER BY u.activo DESC, u.nombre ASC`
  );

  return rows.map(formatearUsuario);
};

/**
 * Obtener un usuario por ID
 * Alias u. para usuarios, e. para establecimientos
 */
const obtenerUsuario = async ({ id }) => {
  const { rows } = await query(
    `SELECT
       u.id,
       u.nombre,
       u.email,
       u.rol,
       u.establecimiento_id,
       u.activo,
       u.intentos_fallidos,
       u.bloqueado_hasta,
       u.ultimo_login,
       u.creado_en,
       u.actualizado_en,
       e.nombre         AS establecimiento_nombre,
       e.cod_estable_mh AS establecimiento_cod
     FROM usuarios u
     INNER JOIN establecimientos e ON e.id = u.establecimiento_id
     WHERE u.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Usuario no encontrado.' };
  }

  return formatearUsuario(rows[0]);
};

/**
 * Obtener usuario por email con password_hash
 * Solo para uso interno del módulo de auth
 * NUNCA devolver al cliente HTTP
 */
const obtenerUsuarioPorEmail = async ({ email }) => {
  const { rows } = await query(
    `SELECT
       u.id,
       u.nombre,
       u.email,
       u.password_hash,
       u.rol,
       u.establecimiento_id,
       u.activo,
       u.intentos_fallidos,
       u.bloqueado_hasta,
       u.ultimo_login,
       e.nombre         AS establecimiento_nombre,
       e.cod_estable_mh AS establecimiento_cod
     FROM usuarios u
     INNER JOIN establecimientos e ON e.id = u.establecimiento_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (rows.length === 0) return null;
  return rows[0];
};

/**
 * Crear un nuevo usuario
 * Password hasheado con bcrypt antes de guardar
 * Verificar email único y establecimiento activo
 */
const crearUsuario = async ({ datos }) => {
  const {
    nombre, email, password,
    rol, establecimiento_id,
  } = datos;

  // Verificar que el email no existe ya
  const { rows: emailExiste } = await query(
    'SELECT id FROM usuarios WHERE email = $1',
    [email.toLowerCase()]
  );
  if (emailExiste.length > 0) {
    throw { status: 409, mensaje: 'Ya existe un usuario con ese email.' };
  }

  // Verificar que el establecimiento existe y está activo
  const { rows: estable } = await query(
    'SELECT id FROM establecimientos WHERE id = $1 AND activo = TRUE',
    [establecimiento_id]
  );
  if (estable.length === 0) {
    throw {
      status:  400,
      mensaje: 'El establecimiento no existe o está inactivo.',
    };
  }

  // Hashear password con bcrypt 12 rondas ANTES de guardar
  // El password raw NUNCA toca la BD
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows } = await query(
    `INSERT INTO usuarios (
       nombre, email, password_hash,
       rol, establecimiento_id
     ) VALUES ($1,$2,$3,$4,$5)
     RETURNING
       id, nombre, email, rol,
       establecimiento_id, activo,
       intentos_fallidos, bloqueado_hasta,
       ultimo_login, creado_en, actualizado_en`,
    [
      nombre,
      email.toLowerCase(),
      password_hash,
      rol,
      establecimiento_id,
    ]
  );

  logger.info('Usuario creado', {
    id:     rows[0].id,
    email:  rows[0].email,
    rol,
    establecimiento_id,
    // NUNCA loguear el password
  });

  return formatearUsuario({ ...rows[0], establecimiento_nombre: null, establecimiento_cod: null });
};

/**
 * Actualizar un usuario
 * Si se actualiza el password se hashea con bcrypt
 * Si se cambia el rol verificar que no queda sin administradores
 * Email único verificado antes de actualizar
 */
const actualizarUsuario = async ({ id, datos }) => {
  // Verificar que el usuario existe
  const usuarioActual = await obtenerUsuario({ id });

  // Si intenta desactivar al último administrador — rechazar
  if (datos.activo === false && usuarioActual.rol === 'administrador') {
    await verificarUltimoAdmin(id);
  }

  // Si intenta cambiar rol de administrador a operador — verificar
  if (datos.rol === 'operador' && usuarioActual.rol === 'administrador') {
    await verificarUltimoAdmin(id);
  }

  // Si se actualiza el email verificar que no existe en otro usuario
  if (datos.email) {
    const { rows: emailExiste } = await query(
      'SELECT id FROM usuarios WHERE email = $1 AND id != $2',
      [datos.email.toLowerCase(), id]
    );
    if (emailExiste.length > 0) {
      throw { status: 409, mensaje: 'Ya existe otro usuario con ese email.' };
    }
  }

  // Si se actualiza el establecimiento verificar que existe y está activo
  if (datos.establecimiento_id) {
    const { rows: estable } = await query(
      'SELECT id FROM establecimientos WHERE id = $1 AND activo = TRUE',
      [datos.establecimiento_id]
    );
    if (estable.length === 0) {
      throw { status: 400, mensaje: 'El establecimiento no existe o está inactivo.' };
    }
  }

  // Construir SET dinámico
  const camposPermitidos = [
    'nombre', 'email', 'rol',
    'establecimiento_id', 'activo',
  ];

  const campos  = [];
  const valores = [];
  let idx = 1;

  for (const campo of camposPermitidos) {
    if (datos[campo] !== undefined) {
      campos.push(`${campo} = $${idx++}`);
      // Email siempre en minúsculas
      valores.push(campo === 'email' ? datos[campo].toLowerCase() : datos[campo]);
    }
  }

  // Si se actualiza el password — hashear con bcrypt
  if (datos.password) {
    const password_hash = await bcrypt.hash(datos.password, BCRYPT_ROUNDS);
    campos.push(`password_hash = $${idx++}`);
    valores.push(password_hash);
    // Resetear intentos fallidos al cambiar password
    campos.push(`intentos_fallidos = $${idx++}`);
    valores.push(0);
    campos.push(`bloqueado_hasta = $${idx++}`);
    valores.push(null);
  }

  if (campos.length === 0) {
    throw { status: 400, mensaje: 'No hay campos válidos para actualizar.' };
  }

  valores.push(id);

  const { rows } = await query(
    `UPDATE usuarios
     SET ${campos.join(', ')}
     WHERE id = $${idx}
     RETURNING
       id, nombre, email, rol,
       establecimiento_id, activo,
       intentos_fallidos, bloqueado_hasta,
       ultimo_login, creado_en, actualizado_en`,
    valores
  );

  logger.info('Usuario actualizado', {
    id,
    campos_actualizados: Object.keys(datos).filter((k) => k !== 'password'),
    password_cambiado:   !!datos.password,
    // NUNCA loguear el password
  });

  return formatearUsuario({ ...rows[0], establecimiento_nombre: null, establecimiento_cod: null });
};

/**
 * Desactivar un usuario (soft delete)
 * Endpoint DELETE hace UPDATE activo = FALSE
 * Verificar que no es el último administrador
 */
const desactivarUsuario = async ({ id }) => {
  const usuario = await obtenerUsuario({ id });

  if (!usuario.activo) {
    throw { status: 409, mensaje: 'El usuario ya está inactivo.' };
  }

  // No se puede desactivar al último administrador
  if (usuario.rol === 'administrador') {
    await verificarUltimoAdmin(id);
  }

  await query(
    'UPDATE usuarios SET activo = FALSE WHERE id = $1',
    [id]
  );

  logger.info('Usuario desactivado', { id, email: usuario.email });
};

/**
 * Incrementar intentos fallidos de login
 * Bloquear temporalmente si llega a 5 intentos
 * Solo para uso interno del módulo de auth
 */
const registrarIntentoFallido = async ({ id }) => {
  const { rows } = await query(
    `UPDATE usuarios
     SET intentos_fallidos = intentos_fallidos + 1,
         bloqueado_hasta   = CASE
           WHEN intentos_fallidos + 1 >= 5
           THEN NOW() + INTERVAL '15 minutes'
           ELSE bloqueado_hasta
         END
     WHERE id = $1
     RETURNING intentos_fallidos, bloqueado_hasta`,
    [id]
  );

  return rows[0];
};

/**
 * Resetear intentos fallidos después de login exitoso
 * Registrar timestamp de último login
 * Solo para uso interno del módulo de auth
 */
const registrarLoginExitoso = async ({ id }) => {
  await query(
    `UPDATE usuarios
     SET intentos_fallidos = 0,
         bloqueado_hasta   = NULL,
         ultimo_login      = NOW()
     WHERE id = $1`,
    [id]
  );
};

// ─────────────────────────────────────────────
// HELPER INTERNO: verificar que no es el último admin
// ─────────────────────────────────────────────
const verificarUltimoAdmin = async (idExcluir) => {
  const { rows } = await query(
    `SELECT COUNT(*) AS total
     FROM usuarios
     WHERE rol = 'administrador'
       AND activo = TRUE
       AND id != $1`,
    [idExcluir]
  );

  if (parseInt(rows[0].total, 10) === 0) {
    throw {
      status:  409,
      mensaje: 'No se puede realizar esta operación porque quedaría el sistema sin administradores activos.',
    };
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  obtenerUsuarioPorEmail,
  crearUsuario,
  actualizarUsuario,
  desactivarUsuario,
  registrarIntentoFallido,
  registrarLoginExitoso,
};
