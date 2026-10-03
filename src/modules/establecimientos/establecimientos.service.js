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
const { v5: uuidv5, v4: uuidv4 } = require('uuid');
const { registrarEventoAuditoria } = require('../../utils/auditoria');
const { publicarEvento }   = require('../provisioning/outbox.service');

// Namespace fijo para eventos deterministas de vínculo de sucursal (Fase 3).
// El mismo (branch_id, estado) siempre produce el mismo operation_id, de modo
// que el UNIQUE(operation_id, tipo_evento) del outbox deduplica eventos.
const NAMESPACE_VINCULO = 'd73a1e62-9d3c-4f6a-9b1e-8c1f2a3b4c5d';

const TIPOS_DTE = ['01', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15'];
const AMBIENTES = ['00', '01'];

// ─────────────────────────────────────────────
// HELPER: formatear establecimiento para respuesta
// ─────────────────────────────────────────────
const formatearEstablecimiento = (row) => ({
  id:                 row.id,
  branch_id:          row.branch_id || null,
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
  correo:             row.correo      || null,
  tipo_establecimiento: row.tipo_establecimiento || '02',
  fiscal_status:      row.fiscal_status || 'pending_link',
  provisioning_status: row.provisioning_status || 'confirmed',
  sync_error:         row.sync_error  || null,
  activo:             row.activo,
  total_dtes:         parseInt(row.total_dtes || 0, 10),
  tiene_dtes:         parseInt(row.total_dtes || 0, 10) > 0,
  creado_en:          row.creado_en,
  actualizado_en:     row.actualizado_en,
});

// ═════════════════════════════════════════════
// FASE 3 — ESTADO FISCAL DEL ESTABLECIMIENTO
// ═════════════════════════════════════════════

/**
 * Determina el estado fiscal esperado de un establecimiento (spec §5).
 * - inactive: desactivado operativamente.
 * - ready: códigos MH + tipo CAT-009 + dirección + depto/muni completos
 *   (vinculado o no a una sucursal POS, el establecimiento fiscal opera).
 * - pending_mh_data: vinculado a POS pero sin datos fiscales completos.
 * - pending_link: sin vínculo POS y sin datos fiscales.
 */
const determinarEstadoFiscal = (row) => {
  if (!row.activo) return 'inactive';
  const datosCompletos = row.cod_estable_mh
    && row.cod_punto_venta_mh
    && row.tipo_establecimiento
    && row.direccion
    && row.departamento_cod
    && row.municipio_cod;
  if (!datosCompletos) {
    return row.branch_id ? 'pending_mh_data' : 'pending_link';
  }
  return 'ready';
};

/**
 * Crea los correlativos de todos los tipos de DTE y ambientes para un
 * establecimiento, solo cuando es fiscalmente válido (spec §10 Fase 3:
 * "Correlativos creados solo para establecimientos fiscales válidos").
 * Idempotente (ON CONFLICT DO NOTHING).
 */
const crearCorrelativosSiFaltan = async (tenant_id, establecimientoId, cliente = null) => {
  const ejecutar = cliente ? cliente.query.bind(cliente) : query;
  for (const tipoDte of TIPOS_DTE) {
    for (const ambiente of AMBIENTES) {
      await ejecutar(
        `INSERT INTO correlativos (tenant_id, tipo_dte, ambiente, establecimiento_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [tenant_id, tipoDte, ambiente, establecimientoId]
      );
    }
  }
};

/**
 * Publica el evento de vínculo hacia el POS (solo si hay branch_id).
 * operation_id determinista por (branch_id, estado): el UNIQUE del outbox
 * deduplica eventos repetidos del mismo estado. Payload sin secretos.
 */
const publicarEventoVinculo = async ({ establecimiento, estadoAnterior }) => {
  if (!establecimiento.branch_id) return;
  const operationId = uuidv5(`${establecimiento.branch_id}:${establecimiento.fiscal_status}`, NAMESPACE_VINCULO);
  await publicarEvento({
    operation_id: operationId,
    tenant_id: establecimiento.tenant_id,
    branch_id: establecimiento.branch_id,
    tipo_evento: 'BRANCH_VINCULADO',
    payload: {
      branch_id: establecimiento.branch_id,
      establecimiento_id: establecimiento.id,
      fiscal_status: establecimiento.fiscal_status,
      nombre: establecimiento.nombre,
      direccion: establecimiento.direccion || null,
      telefono: establecimiento.telefono || null,
      cod_estable_mh: establecimiento.cod_estable_mh || null,
      cod_punto_venta_mh: establecimiento.cod_punto_venta_mh || null,
      tipo_establecimiento: establecimiento.tipo_establecimiento || '02',
      departamento_cod: establecimiento.departamento_cod || null,
      municipio_cod: establecimiento.municipio_cod || null,
    },
  });
  await registrarEventoAuditoria({
    tenant_id: establecimiento.tenant_id,
    evento: estadoAnterior === 'ready' ? 'PROVISION_BRANCH_ESTADO' : 'PROVISION_BRANCH_VINCULADO',
    detalles: {
      branch_id: establecimiento.branch_id,
      establecimiento_id: establecimiento.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: establecimiento.fiscal_status,
    },
    status_http: 200,
  });
  logger.info('Evento de vínculo de sucursal publicado', {
    tenant_id: establecimiento.tenant_id,
    branch_id: establecimiento.branch_id,
    establecimiento_id: establecimiento.id,
    fiscal_status: establecimiento.fiscal_status,
  });
};

/**
 * Recalcula y persiste el estado fiscal de un establecimiento después de
 * cualquier cambio (crear/actualizar/desactivar). Efectos:
 * - Actualiza fiscal_status, provisioning_status y sync_error.
 * - Crea correlativos solo cuando pasa a ready.
 * - Publica BRANCH_VINCULADO al POS si hay branch_id y el estado cambió
 *   (o el envío previo quedó fallido).
 * Idempotente: repetir el mismo estado es un no-op.
 */
const recalcularEstadoFiscal = async ({ id, tenant_id, estadoAnterior }) => {
  const { rows } = await query(
    `SELECT id, tenant_id, branch_id, nombre, direccion, telefono,
            cod_estable_mh, cod_punto_venta_mh, tipo_establecimiento,
            departamento_cod, municipio_cod, activo, fiscal_status,
            provisioning_status,
            (SELECT COUNT(*) FROM dtes d
             WHERE d.establecimiento_id = establecimientos.id
               AND d.tenant_id = establecimientos.tenant_id) AS total_dtes
     FROM establecimientos
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenant_id]
  );
  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Establecimiento no encontrado.' };
  }

  const establecimiento = rows[0];
  const nuevoEstado = determinarEstadoFiscal(establecimiento);
  const estadoPrevio = estadoAnterior || establecimiento.fiscal_status;

  if (nuevoEstado === establecimiento.fiscal_status && establecimiento.provisioning_status !== 'failed') {
    return formatearEstablecimiento(establecimiento);
  }

  await query(
    `UPDATE establecimientos
     SET fiscal_status = $1, provisioning_status = 'confirmed',
         sync_error = NULL, actualizado_en = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [nuevoEstado, id, tenant_id]
  );

  const actualizado = { ...establecimiento, fiscal_status: nuevoEstado, provisioning_status: 'confirmed', sync_error: null };

  if (nuevoEstado === 'ready') {
    await crearCorrelativosSiFaltan(tenant_id, id);
  }

  if (estadoPrevio !== nuevoEstado || establecimiento.provisioning_status === 'failed') {
    await publicarEventoVinculo({ establecimiento: actualizado, estadoAnterior: estadoPrevio });
  }

  return formatearEstablecimiento(actualizado);
};

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Listar todos los establecimientos
 * Incluye conteo de DTEs por establecimiento para información
 */
const listarEstablecimientos = async ({ soloActivos = false, tenant_id } = {}) => {
  // Fase 2: el tenant es obligatorio — no existe listado global.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para listar establecimientos.' };
  }

  const condiciones = [`e.tenant_id = $1`];
  const valores = [tenant_id];
  let idx = 2;

  if (soloActivos) {
    condiciones.push(`e.activo = TRUE`);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

const { rows } = await query(
    `SELECT
       e.id,
       e.branch_id,
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
       e.correo,
       e.tipo_establecimiento,
       e.fiscal_status,
       e.provisioning_status,
       e.sync_error,
       e.activo,
       e.creado_en,
       e.actualizado_en,
       COUNT(d.id) AS total_dtes
     FROM establecimientos e
     LEFT JOIN dtes d ON d.establecimiento_id = e.id AND d.tenant_id = e.tenant_id
     ${where}
     GROUP BY e.id
     ORDER BY e.activo DESC, e.nombre ASC`,
    valores
  );

  return rows.map(formatearEstablecimiento);
};

/**
 * Obtener un establecimiento por ID
 * Valida que existe antes de retornar
 */
const obtenerEstablecimiento = async ({ id, tenant_id }) => {
  // Fase 2: el tenant es obligatorio — sin consultas globales.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para obtener un establecimiento.' };
  }

const queryText = `SELECT
       e.id,
       e.branch_id,
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
       e.correo,
       e.tipo_establecimiento,
       e.fiscal_status,
       e.provisioning_status,
       e.sync_error,
       e.activo,
       e.creado_en,
       e.actualizado_en,
       COUNT(d.id) AS total_dtes
     FROM establecimientos e
     LEFT JOIN dtes d ON d.establecimiento_id = e.id AND d.tenant_id = e.tenant_id
     WHERE e.id = $1 AND e.tenant_id = $2
     GROUP BY e.id`;
  const params = [id, tenant_id];

  const { rows } = await query(queryText, params);

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
const crearEstablecimiento = async ({ datos, tenant_id }) => {
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para crear un establecimiento.' };
  }

const {
    cod_estable_mh, cod_punto_venta_mh,
    cod_estable, cod_punto_venta,
    nombre, direccion,
    departamento_cod, municipio_cod,
    telefono, email, correo, tipo_establecimiento,
  } = datos;

  // Verificar que la combinación cod_estable_mh + cod_punto_venta_mh
  // no existe YA dentro del mismo tenant. Fase 2: duplicidad tenant-scoped.
  const { rows: existe } = await query(
    'SELECT id FROM establecimientos WHERE cod_estable_mh = $1 AND cod_punto_venta_mh = $2 AND tenant_id = $3',
    [cod_estable_mh, cod_punto_venta_mh, tenant_id]
  );
  if (existe.length > 0) {
    throw {
      status:  409,
      mensaje: `Ya existe una caja con código ${cod_punto_venta_mh} en la sucursal ${cod_estable_mh}.`,
    };
  }

  // Fase 3 (spec §6.4): si el alta viene desde DTE, se asigna un branch_id
  // compartido para que el evento de sincronización cree la sucursal en POS.
  const branchId = datos.branch_id || uuidv4();

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const camposEst = [
      'cod_estable_mh', 'cod_punto_venta_mh',
      'cod_estable', 'cod_punto_venta',
      'nombre', 'direccion',
      'departamento_cod', 'municipio_cod',
      'telefono', 'email', 'correo', 'tipo_establecimiento',
      'tenant_id', 'branch_id',
    ];
    const valoresEst = [
      cod_estable_mh, cod_punto_venta_mh,
      cod_estable || cod_estable_mh, cod_punto_venta || cod_punto_venta_mh,
      nombre, direccion, departamento_cod, municipio_cod,
      telefono || null, email || null, correo || email || null,
      tipo_establecimiento || '02',
      tenant_id, branchId,
    ];

    const phEst = valoresEst.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await client.query(
`INSERT INTO establecimientos (${camposEst.join(', ')})
       VALUES (${phEst})
       RETURNING
         id, branch_id, cod_estable_mh, cod_punto_venta_mh,
         cod_estable, cod_punto_venta,
         nombre, direccion,
         departamento_cod, municipio_cod,
         telefono, email, correo, tipo_establecimiento,
         activo, creado_en, actualizado_en`,
      valoresEst
    );

    const establecimientoId = rows[0].id;

    await client.query('COMMIT');

    // Fase 3: recálculo del estado fiscal — correlativos solo si el
    // establecimiento es fiscalmente válido, evento BRANCH al POS.
    const resultado = await recalcularEstadoFiscal({ id: establecimientoId, tenant_id });

    logger.info('Establecimiento creado', {
      id:             establecimientoId,
      branch_id:      resultado.branch_id,
      cod_estable_mh,
      nombre,
      fiscal_status:  resultado.fiscal_status,
    });

    return resultado;

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'uq_establecimientos_tenant_branch_id') {
      throw {
        status: 409,
        mensaje: 'El branch_id ya está vinculado a otro establecimiento de este tenant.',
      };
    }
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
const actualizarEstablecimiento = async ({ id, datos, tenant_id }) => {
  const establecimientoPrevio = await obtenerEstablecimiento({ id, tenant_id });

  // Los códigos MH forman parte del número de control y no pueden cambiar
  // después de emitir el primer DTE del establecimiento.
  if (datos.cod_estable_mh || datos.cod_punto_venta_mh) {
    const { rows: dtesExistentes } = await query(
      'SELECT COUNT(*) AS total FROM dtes WHERE establecimiento_id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (parseInt(dtesExistentes[0].total, 10) > 0) {
      throw {
        status:  409,
        mensaje: 'No se puede modificar el código de Hacienda (cod_estable_mh) porque este establecimiento ya tiene DTEs emitidos. El número de control de esos DTEs quedaría inválido.',
      };
    }

    // Verificar que la nueva combinación fiscal no existe en otro registro.
    const { rows: existeOtro } = await query(
      `SELECT id FROM establecimientos
       WHERE cod_estable_mh = COALESCE($1, cod_estable_mh)
         AND cod_punto_venta_mh = COALESCE($2, cod_punto_venta_mh)
         AND id != $3 AND tenant_id = $4`,
      [datos.cod_estable_mh || null, datos.cod_punto_venta_mh || null, id, tenant_id]
    );
    if (existeOtro.length > 0) {
      throw {
        status:  409,
          mensaje: 'Ya existe otro establecimiento con esa combinación de códigos de Hacienda.',
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
    'telefono', 'email', 'correo', 'tipo_establecimiento',
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
  valores.push(tenant_id);

  const whereEst = `WHERE id = $${idx} AND tenant_id = $${idx + 1}`;

await query(
`UPDATE establecimientos
     SET ${campos.join(', ')}
     ${whereEst}
     RETURNING
       id, branch_id, cod_estable_mh, cod_punto_venta_mh,
       cod_estable, cod_punto_venta,
       nombre, direccion,
       departamento_cod, municipio_cod,
       telefono, email, correo, tipo_establecimiento,
       activo, creado_en, actualizado_en`,
    valores
  );

  // Fase 3: recálculo del estado fiscal — al completar los códigos MH y los
  // datos fiscales el establecimiento pasa a ready, recibe correlativos y
  // publica el evento BRANCH_VINCULADO hacia el POS.
  const resultado = await recalcularEstadoFiscal({
    id,
    tenant_id,
    estadoAnterior: establecimientoPrevio.fiscal_status,
  });

  logger.info('Establecimiento actualizado', { id, campos_actualizados: Object.keys(datos) });

  return resultado;
};

/**
 * Desactivar un establecimiento (soft delete)
 * NUNCA eliminar — los DTEs históricos lo referencian
 * El endpoint DELETE hace un UPDATE activo = FALSE, no un DELETE real
 * Verificar que no tiene DTEs pendientes antes de desactivar
 */
const desactivarEstablecimiento = async ({ id, tenant_id }) => {
  const establecimiento = await obtenerEstablecimiento({ id, tenant_id });

  // Verificar que no está ya inactivo
  if (!establecimiento.activo) {
    throw {
      status:  409,
      mensaje: 'El establecimiento ya está inactivo.',
    };
  }

  // Verificar que no tiene DTEs pendientes (en proceso) — acotado al tenant
  const { rows: dtesPendientes } = await query(
    `SELECT COUNT(*) AS total
     FROM dtes
     WHERE establecimiento_id = $1
       AND tenant_id = $2
       AND estado IN ('generado', 'firmado', 'transmitido', 'contingencia')`,
    [id, tenant_id]
  );

  if (parseInt(dtesPendientes[0].total, 10) > 0) {
    throw {
      status:  409,
      mensaje: `No se puede desactivar el establecimiento porque tiene ${dtesPendientes[0].total} DTE(s) pendientes de procesar.`,
    };
  }

  // Soft delete — UPDATE activo = FALSE, nunca DELETE real
  await query(
    'UPDATE establecimientos SET activo = FALSE WHERE id = $1 AND tenant_id = $2',
    [id, tenant_id]
  );

  // Fase 3: el estado fiscal pasa a inactive y se notifica al POS.
  await recalcularEstadoFiscal({
    id,
    tenant_id,
    estadoAnterior: establecimiento.fiscal_status,
  });

  logger.info('Establecimiento desactivado', { id });
};

module.exports = {
  listarEstablecimientos,
  obtenerEstablecimiento,
  crearEstablecimiento,
  actualizarEstablecimiento,
  desactivarEstablecimiento,
  // Exports de prueba (Fase 3): lógica pura de estados fiscales.
  determinarEstadoFiscal,
};
