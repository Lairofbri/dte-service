// src/modules/establecimientos/establecimientos.service.js
// Lógica de negocio del módulo de establecimientos
// Principio S (SOLID): solo opera datos, no valida ni responde HTTP
//
// REGLAS CRÍTICAS:
// → cod_estable_mh NO se puede modificar si tiene DTEs emitidos
// → Soft delete — nunca eliminar establecimientos
// → Al crear: inicializar correlativos para todos los tipos de DTE
// → Alias de tabla e. en todos los JOINs

const { query, getClient } = require('../../config/database');
const logger               = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPER: formatear establecimiento para respuesta
// ─────────────────────────────────────────────
const formatearEstablecimiento = (row) => ({
  id:                 row.id,
  cod_estable_mh:     row.cod_estable_mh,
  cod_punto_venta_mh: row.cod_punto_venta_mh,
  cod_estable:        row.cod_estable,
  cod_punto_venta:    row.cod_punto_venta,
  nombre:             row.nombre,
  direccion:          row.direccion,
  departamento_cod:   row.departamento_cod,
  municipio_cod:      row.municipio_cod,
  telefono:           row.telefono    || null,
  email:              row.email       || null,
  activo:             row.activo,
  total_dtes:         parseInt(row.total_dtes || 0, 10),
  creado_en:          row.creado_en,
  actualizado_en:     row.actualizado_en,
});

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Listar todos los establecimientos
 * Incluye conteo de DTEs por establecimiento para información
 */
const listarEstablecimientos = async ({ soloActivos = false } = {}) => {
  const condicion = soloActivos ? 'WHERE e.activo = TRUE' : '';

  const { rows } = await query(
    `SELECT
       e.id,
       e.cod_estable_mh,
       e.cod_punto_venta_mh,
       e.cod_estable,
       e.cod_punto_venta,
       e.nombre,
       e.direccion,
       e.departamento_cod,
       e.municipio_cod,
       e.telefono,
       e.email,
       e.activo,
       e.creado_en,
       e.actualizado_en,
       COUNT(d.id) AS total_dtes
     FROM establecimientos e
     LEFT JOIN dtes d ON d.establecimiento_id = e.id
     ${condicion}
     GROUP BY e.id
     ORDER BY e.activo DESC, e.nombre ASC`
  );

  return rows.map(formatearEstablecimiento);
};

/**
 * Obtener un establecimiento por ID
 * Valida que existe antes de retornar
 */
const obtenerEstablecimiento = async ({ id }) => {
  const { rows } = await query(
    `SELECT
       e.id,
       e.cod_estable_mh,
       e.cod_punto_venta_mh,
       e.cod_estable,
       e.cod_punto_venta,
       e.nombre,
       e.direccion,
       e.departamento_cod,
       e.municipio_cod,
       e.telefono,
       e.email,
       e.activo,
       e.creado_en,
       e.actualizado_en,
       COUNT(d.id) AS total_dtes
     FROM establecimientos e
     LEFT JOIN dtes d ON d.establecimiento_id = e.id
     WHERE e.id = $1
     GROUP BY e.id`,
    [id]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Establecimiento no encontrado.' };
  }

  return formatearEstablecimiento(rows[0]);
};

/**
 * Crear un nuevo establecimiento
 * Al crear se inicializan automáticamente los correlativos
 * para todos los tipos de DTE en ambos ambientes
 */
const crearEstablecimiento = async ({ datos }) => {
  const {
    cod_estable_mh, cod_punto_venta_mh,
    cod_estable, cod_punto_venta,
    nombre, direccion,
    departamento_cod, municipio_cod,
    telefono, email,
  } = datos;

  // Verificar que la combinación cod_estable_mh + cod_punto_venta_mh no existe ya
  // Una sucursal puede tener varias cajas — la combinación debe ser única
  const { rows: existe } = await query(
    'SELECT id FROM establecimientos WHERE cod_estable_mh = $1 AND cod_punto_venta_mh = $2',
    [cod_estable_mh, cod_punto_venta_mh]
  );
  if (existe.length > 0) {
    throw {
      status:  409,
      mensaje: `Ya existe una caja con código ${cod_punto_venta_mh} en la sucursal ${cod_estable_mh}.`,
    };
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Crear el establecimiento
    const { rows } = await client.query(
      `INSERT INTO establecimientos (
         cod_estable_mh, cod_punto_venta_mh,
         cod_estable, cod_punto_venta,
         nombre, direccion,
         departamento_cod, municipio_cod,
         telefono, email
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING
         id, cod_estable_mh, cod_punto_venta_mh,
         cod_estable, cod_punto_venta,
         nombre, direccion,
         departamento_cod, municipio_cod,
         telefono, email,
         activo, creado_en, actualizado_en`,
      [
        cod_estable_mh,
        cod_punto_venta_mh,
        cod_estable    || cod_estable_mh,    // por defecto igual al de Hacienda
        cod_punto_venta || cod_punto_venta_mh, // por defecto igual al de Hacienda
        nombre,
        direccion,
        departamento_cod,
        municipio_cod,
        telefono || null,
        email    || null,
      ]
    );

    const establecimientoId = rows[0].id;

    // Inicializar correlativos para todos los tipos de DTE
    // en ambos ambientes — cada sucursal tiene su propio correlativo
    const tiposDTE  = ['01', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15'];
    const ambientes = ['00', '01'];

    for (const tipoDte of tiposDTE) {
      for (const ambiente of ambientes) {
        await client.query(
          `INSERT INTO correlativos (tipo_dte, ambiente, establecimiento_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [tipoDte, ambiente, establecimientoId]
        );
      }
    }

    await client.query('COMMIT');

    logger.info('Establecimiento creado', {
      id:             establecimientoId,
      cod_estable_mh,
      nombre,
    });

    return { ...formatearEstablecimiento({ ...rows[0], total_dtes: 0 }) };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Actualizar un establecimiento
 * REGLA CRÍTICA: cod_estable_mh NO se puede cambiar si tiene DTEs emitidos
 * porque cambiaría el número de control histórico de esos DTEs
 */
const actualizarEstablecimiento = async ({ id, datos }) => {
  // Verificar que existe
  await obtenerEstablecimiento({ id });

  // Si intenta cambiar cod_estable_mh — verificar que no tiene DTEs
  if (datos.cod_estable_mh) {
    const { rows: dtesExistentes } = await query(
      'SELECT COUNT(*) AS total FROM dtes WHERE establecimiento_id = $1',
      [id]
    );

    if (parseInt(dtesExistentes[0].total, 10) > 0) {
      throw {
        status:  409,
        mensaje: 'No se puede modificar el código de Hacienda (cod_estable_mh) porque este establecimiento ya tiene DTEs emitidos. El número de control de esos DTEs quedaría inválido.',
      };
    }

    // Verificar que el nuevo cod_estable_mh no existe en otro establecimiento
    const { rows: existeOtro } = await query(
      'SELECT id FROM establecimientos WHERE cod_estable_mh = $1 AND id != $2',
      [datos.cod_estable_mh, id]
    );
    if (existeOtro.length > 0) {
      throw {
        status:  409,
        mensaje: `Ya existe otro establecimiento con el código ${datos.cod_estable_mh} de Hacienda.`,
      };
    }
  }

  // Construir SET dinámico — solo campos enviados
  // Sin .default() — nunca sobrescribir datos existentes con defaults
  const camposPermitidos = [
    'cod_estable_mh', 'cod_punto_venta_mh',
    'cod_estable', 'cod_punto_venta',
    'nombre', 'direccion',
    'departamento_cod', 'municipio_cod',
    'telefono', 'email',
    'activo', // permite activar y desactivar desde PATCH
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

  if (campos.length === 0) {
    throw { status: 400, mensaje: 'No hay campos válidos para actualizar.' };
  }

  valores.push(id);

  const { rows } = await query(
    `UPDATE establecimientos
     SET ${campos.join(', ')}
     WHERE id = $${idx}
     RETURNING
       id, cod_estable_mh, cod_punto_venta_mh,
       cod_estable, cod_punto_venta,
       nombre, direccion,
       departamento_cod, municipio_cod,
       telefono, email,
       activo, creado_en, actualizado_en`,
    valores
  );

  logger.info('Establecimiento actualizado', { id, campos_actualizados: Object.keys(datos) });

  return formatearEstablecimiento({ ...rows[0], total_dtes: 0 });
};

/**
 * Desactivar un establecimiento (soft delete)
 * NUNCA eliminar — los DTEs históricos lo referencian
 * El endpoint DELETE hace un UPDATE activo = FALSE, no un DELETE real
 * Verificar que no tiene DTEs pendientes antes de desactivar
 */
const desactivarEstablecimiento = async ({ id }) => {
  const establecimiento = await obtenerEstablecimiento({ id });

  // Verificar que no está ya inactivo
  if (!establecimiento.activo) {
    throw {
      status:  409,
      mensaje: 'El establecimiento ya está inactivo.',
    };
  }

  // Verificar que no tiene DTEs pendientes (en proceso)
  const { rows: dtesPendientes } = await query(
    `SELECT COUNT(*) AS total
     FROM dtes
     WHERE establecimiento_id = $1
       AND estado IN ('generado', 'firmado', 'transmitido', 'contingencia')`,
    [id]
  );

  if (parseInt(dtesPendientes[0].total, 10) > 0) {
    throw {
      status:  409,
      mensaje: `No se puede desactivar el establecimiento porque tiene ${dtesPendientes[0].total} DTE(s) pendientes de procesar.`,
    };
  }

  // Soft delete — UPDATE activo = FALSE, nunca DELETE real
  await query(
    'UPDATE establecimientos SET activo = FALSE WHERE id = $1',
    [id]
  );

  logger.info('Establecimiento desactivado', { id });
};

module.exports = {
  listarEstablecimientos,
  obtenerEstablecimiento,
  crearEstablecimiento,
  actualizarEstablecimiento,
  desactivarEstablecimiento,
};
