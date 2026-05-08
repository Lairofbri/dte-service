// src/modules/configuracion/configuracion.service.js
// Lógica de negocio del módulo de configuración
// Principio S (SOLID): solo opera datos, no valida ni responde HTTP
//
// SEGURIDAD CRÍTICA:
// → Las credenciales de Hacienda se encriptan ANTES de guardar en BD
// → Al leer, se desencriptan solo internamente para uso del servicio
// → NUNCA se devuelven credenciales desencriptadas al cliente HTTP
// → El token de Hacienda tampoco se devuelve al cliente

const { query, getClient } = require('../../config/database');
const { encriptar, desencriptar } = require('../../config/crypto');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/**
 * Formatea la configuración para respuesta HTTP segura
 * NUNCA incluye credenciales de Hacienda ni el token
 * El cliente solo ve los datos del emisor y el estado de la conexión
 */
const formatearParaRespuesta = (row) => ({
  id:                     row.id,
  nit:                    row.nit,
  nrc:                    row.nrc,
  nombre:                 row.nombre,
  nombre_comercial:       row.nombre_comercial,
  direccion:              row.direccion,
  telefono:               row.telefono,
  email:                  row.email,
  codigo_actividad:       row.codigo_actividad,
  codigo_establecimiento: row.codigo_establecimiento,
  codigo_punto_venta:     row.codigo_punto_venta,
  tipo_establecimiento:   row.tipo_establecimiento,
  departamento_cod:       row.departamento_cod,
  municipio_cod:          row.municipio_cod,
  desc_actividad:         row.desc_actividad,
  ambiente:               row.ambiente,
  ambiente_descripcion:   row.ambiente === '00' ? 'Pruebas' : 'Producción',
  // Mostrar si tiene credenciales configuradas pero NO las credenciales
  tiene_credenciales_hacienda: !!(row.usuario_hacienda && row.password_hacienda),
  // Mostrar si el token está vigente pero NO el token
  token_vigente: !!(row.token_hacienda && row.token_expira_en &&
                    new Date(row.token_expira_en) > new Date()),
  token_expira_en: row.token_expira_en || null,
  activo:          row.activo,
  creado_en:       row.creado_en,
  actualizado_en:  row.actualizado_en,
});

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Obtener la configuración actual
 * Retorna datos del emisor SIN credenciales
 */
const obtenerConfiguracion = async () => {
  const { rows } = await query(
    `SELECT
       id, nit, nrc, nombre, nombre_comercial,
       direccion, telefono, email,
       codigo_actividad, codigo_establecimiento,
       codigo_punto_venta, tipo_establecimiento,
       ambiente,
       departamento_cod, municipio_cod, desc_actividad,
       usuario_hacienda, password_hacienda,
       token_hacienda, token_expira_en,
       activo, creado_en, actualizado_en
     FROM configuracion
     LIMIT 1`
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'No hay configuración registrada. Crea una primero.' };
  }

  return rows[0];
};

/**
 * Obtener configuración formateada para respuesta HTTP (sin datos sensibles)
 */
const obtenerConfiguracionPublica = async () => {
  const config = await obtenerConfiguracion();
  return formatearParaRespuesta(config);
};

/**
 * Obtener credenciales desencriptadas para uso interno
 * SOLO para uso de otros módulos (hacienda, firmador)
 * NUNCA devolver al cliente HTTP
 */
const obtenerCredencialesHacienda = async () => {
  const config = await obtenerConfiguracion();

  if (!config.usuario_hacienda || !config.password_hacienda) {
    throw { status: 400, mensaje: 'No hay credenciales de Hacienda configuradas.' };
  }

  return {
    usuario:  desencriptar(config.usuario_hacienda),
    password: desencriptar(config.password_hacienda),
    ambiente: config.ambiente,
    nit:      config.nit,
  };
};

/**
 * Crear la configuración inicial
 * Solo puede existir UNA configuración por instancia
 * Las credenciales se encriptan antes de guardar
 */
const crearConfiguracion = async ({ datos }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Fix CUBIC: bloquear la tabla ANTES de verificar existencia
    // Evita race condition TOCTOU — ningún otro proceso puede insertar
    // mientras este tiene el lock exclusivo
    await client.query('LOCK TABLE configuracion IN EXCLUSIVE MODE');

    // Verificar existencia DENTRO de la transacción con el lock activo
    const { rows: existe } = await client.query(
      'SELECT id FROM configuracion LIMIT 1'
    );
    if (existe.length > 0) {
      await client.query('ROLLBACK');
      throw {
        status: 409,
        mensaje: 'Ya existe una configuración. Usa PATCH para actualizar.',
      };
    }

    const {
      nit, nrc, nombre, nombre_comercial,
      direccion, telefono, email,
      codigo_actividad, codigo_establecimiento,
      codigo_punto_venta, tipo_establecimiento,
      usuario_hacienda, password_hacienda,
      ambiente,departamento_cod, municipio_cod, desc_actividad,
    } = datos;

    // SEGURIDAD: encriptar credenciales ANTES de guardar en BD
    const usuarioEncriptado  = encriptar(usuario_hacienda);
    const passwordEncriptado = encriptar(password_hacienda);

    const { rows } = await client.query(
      `INSERT INTO configuracion (
         nit, nrc, nombre, nombre_comercial,
         direccion, telefono, email,
         codigo_actividad, codigo_establecimiento,
         codigo_punto_venta, tipo_establecimiento,
         usuario_hacienda, password_hacienda,
         ambiente, departamento_cod, municipio_cod, desc_actividad
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING
         id, nit, nrc, nombre, nombre_comercial,
         direccion, telefono, email,
         codigo_actividad, codigo_establecimiento,
         codigo_punto_venta, tipo_establecimiento,
         ambiente, departamento_cod, municipio_cod, desc_actividad,
         usuario_hacienda, password_hacienda,
         token_hacienda, token_expira_en,
         activo, creado_en, actualizado_en`,
      [
        nit,
        nrc                    || null,
        nombre,
        nombre_comercial       || null,
        direccion,
        telefono               || null,
        email                  || null,
        codigo_actividad,
        codigo_establecimiento || '0001',
        codigo_punto_venta     || '0001',
        tipo_establecimiento   || '02',
        usuarioEncriptado,
        passwordEncriptado,
        ambiente               || '00',
        departamento_cod       || '06',
        municipio_cod          || '14',
        desc_actividad         || null,
      ]
    );

    await client.query('COMMIT');

    logger.info('Configuración creada exitosamente', {
      nit,
      nombre,
      ambiente: ambiente || '00',
      // NUNCA loguear credenciales
    });

    return formatearParaRespuesta(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Actualizar la configuración existente
 * Solo actualiza los campos enviados (PATCH semántico)
 * Re-encripta las credenciales si se actualizan
 */
const actualizarConfiguracion = async ({ datos }) => {
  // Verificar que existe configuración
  await obtenerConfiguracion();

  const camposPermitidos = [
    'nit', 'nrc', 'nombre', 'nombre_comercial',
    'direccion', 'telefono', 'email',
    'codigo_actividad', 'codigo_establecimiento',
    'codigo_punto_venta', 'tipo_establecimiento',
    'ambiente', 'departamento_cod', 'municipio_cod', 'desc_actividad',
  ];

  const campos  = [];
  const valores = [];
  let idx = 1;

  for (const campo of camposPermitidos) {
    if (datos[campo] !== undefined) {
      campos.push(`${campo} = $${idx++}`);
      valores.push(datos[campo]);
    }
  }

  // SEGURIDAD: re-encriptar credenciales si se actualizan
  if (datos.usuario_hacienda) {
    campos.push(`usuario_hacienda = $${idx++}`);
    valores.push(encriptar(datos.usuario_hacienda));
    // Si cambian las credenciales, invalidar el token cacheado
    campos.push(`token_hacienda = $${idx++}`);
    valores.push(null);
    campos.push(`token_expira_en = $${idx++}`);
    valores.push(null);
  }

  if (datos.password_hacienda) {
    campos.push(`password_hacienda = $${idx++}`);
    valores.push(encriptar(datos.password_hacienda));
    // Si cambian las credenciales, invalidar el token cacheado
    if (!datos.usuario_hacienda) {
      campos.push(`token_hacienda = $${idx++}`);
      valores.push(null);
      campos.push(`token_expira_en = $${idx++}`);
      valores.push(null);
    }
  }

  if (campos.length === 0) {
    throw { status: 400, mensaje: 'No hay campos válidos para actualizar.' };
  }

  const { rows } = await query(
    `UPDATE configuracion SET ${campos.join(', ')}
     WHERE id = (SELECT id FROM configuracion LIMIT 1)
     RETURNING
       id, nit, nrc, nombre, nombre_comercial,
       direccion, telefono, email,
       codigo_actividad, codigo_establecimiento,
       codigo_punto_venta, tipo_establecimiento,
       ambiente, departamento_cod, municipio_cod, desc_actividad,
       usuario_hacienda, password_hacienda,
       token_hacienda, token_expira_en,
       activo, creado_en, actualizado_en`,
    valores
  );

  logger.info('Configuración actualizada', {
    campos_actualizados: camposPermitidos.filter((c) => datos[c] !== undefined),
    credenciales_actualizadas: !!(datos.usuario_hacienda || datos.password_hacienda),
  });

  return formatearParaRespuesta(rows[0]);
};

/**
 * Guardar el token de Hacienda en BD (encriptado)
 * Solo para uso interno del módulo de Hacienda
 * El cliente NUNCA ve este token
 */
const guardarTokenHacienda = async ({ token, expiraEn }) => {
  await query(
    `UPDATE configuracion
     SET token_hacienda  = $1,
         token_expira_en = $2
     WHERE id = (SELECT id FROM configuracion LIMIT 1)`,
    [encriptar(token), expiraEn]
  );

  logger.info('Token de Hacienda renovado', {
    expira_en: expiraEn,
  });
};

/**
 * Obtener el token de Hacienda desencriptado
 * Solo para uso interno del módulo de Hacienda
 * NUNCA devolver al cliente HTTP
 */
const obtenerTokenHacienda = async () => {
  const { rows } = await query(
    `SELECT token_hacienda, token_expira_en
     FROM configuracion
     LIMIT 1`
  );

  if (rows.length === 0 || !rows[0].token_hacienda) {
    return null;
  }

  const { token_hacienda, token_expira_en } = rows[0];

  // Verificar si el token sigue vigente
  if (new Date(token_expira_en) <= new Date()) {
    return null;
  }

  return desencriptar(token_hacienda);
};

module.exports = {
  obtenerConfiguracionPublica,
  obtenerCredencialesHacienda,
  obtenerTokenHacienda,
  guardarTokenHacienda,
  crearConfiguracion,
  actualizarConfiguracion,
};
