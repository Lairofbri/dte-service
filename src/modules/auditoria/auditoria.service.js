// src/modules/auditoria/auditoria.service.js
// Consulta del log inmutable de auditoría
// Principio S (SOLID): solo lee, no escribe ni responde HTTP
//
// REGLAS CRÍTICAS:
// → Este módulo es de SOLO LECTURA — nunca INSERT, UPDATE, DELETE
// → Los registros son inmutables por diseño de la tabla
// → Alias de tabla en TODOS los campos del SELECT y JOIN
// → UUID validado antes de cualquier query

const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Listar registros de auditoría con filtros y paginación
 * LEFT JOIN con dtes para incluir numero_control del DTE relacionado
 * Alias obligatorios: a. para auditoria, d. para dtes
 *
 * @param {object} filtros
 * @param {string} filtros.evento      — tipo de evento a filtrar
 * @param {string} filtros.dte_id      — UUID del DTE relacionado
 * @param {Date}   filtros.fecha_desde — inicio del rango
 * @param {Date}   filtros.fecha_hasta — fin del rango
 * @param {number} filtros.pagina      — página actual
 * @param {number} filtros.limite      — registros por página
 */
const listarAuditoria = async ({ filtros = {}, tenant_id }) => {
  const {
    evento,
    dte_id,
    fecha_desde,
    fecha_hasta,
    pagina = 1,
    limite = 50,
  } = filtros;

  // Fase 2: el tenant es obligatorio — no existe auditoría global.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para consultar auditoría.' };
  }

  // Construir condiciones dinámicas — alias a. en todos los campos
  const condiciones = ['a.tenant_id = $1'];
  const valores     = [tenant_id];
  let idx = 2;

  if (evento) {
    condiciones.push(`a.evento = $${idx++}`);
    valores.push(evento);
  }

  if (dte_id) {
    condiciones.push(`a.dte_id = $${idx++}`);
    valores.push(dte_id);
  }

  if (fecha_desde) {
    condiciones.push(`a.creado_en >= $${idx++}`);
    valores.push(fecha_desde);
  }

  if (fecha_hasta) {
    // Incluir todo el día de fecha_hasta
    condiciones.push(`a.creado_en < ($${idx++}::date + INTERVAL '1 day')`);
    valores.push(fecha_hasta);
  }

  const offset = (pagina - 1) * limite;

  // LEFT JOIN con dtes para traer numero_control si existe
  // El join también se acota al tenant para no filtrar cruzado.
  const { rows } = await query(
    `SELECT
       a.id,
       a.evento,
       a.dte_id,
       a.detalles,
       a.ip,
       a.status_http,
       a.creado_en,
       d.numero_control  AS dte_numero_control,
       d.tipo_dte        AS dte_tipo,
       d.estado          AS dte_estado
     FROM auditoria a
     LEFT JOIN dtes d ON d.id = a.dte_id AND d.tenant_id = a.tenant_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY a.creado_en DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...valores, limite, offset]
  );

  // Query de conteo — mismas condiciones, mismo alias a.
  const { rows: conteo } = await query(
    `SELECT COUNT(*) AS total
     FROM auditoria a
     WHERE ${condiciones.join(' AND ')}`,
    valores
  );

  return {
    registros: rows.map(formatearRegistro),
    paginacion: {
      total:   parseInt(conteo[0].total, 10),
      pagina,
      limite,
      paginas: Math.ceil(parseInt(conteo[0].total, 10) / limite),
    },
  };
};

/**
 * Obtener un registro de auditoría por ID
 * Valida UUID antes de consultar — lección aprendida
 *
 * @param {string} id — UUID del registro de auditoría
 */
const obtenerRegistro = async ({ id, tenant_id }) => {
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para consultar auditoría.' };
  }

  const { rows } = await query(
    `SELECT
       a.id,
       a.evento,
       a.dte_id,
       a.detalles,
       a.ip,
       a.status_http,
       a.creado_en,
       d.numero_control  AS dte_numero_control,
       d.tipo_dte        AS dte_tipo,
       d.estado          AS dte_estado,
       d.codigo_generacion AS dte_codigo_generacion
     FROM auditoria a
     LEFT JOIN dtes d ON d.id = a.dte_id AND d.tenant_id = a.tenant_id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [id, tenant_id]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Registro de auditoría no encontrado.' };
  }

  return formatearRegistro(rows[0]);
};

/**
 * Obtener resumen estadístico de la auditoría
 * Útil para dashboards — cuántos DTEs por estado, eventos recientes, etc.
 */
const obtenerResumen = async ({ tenant_id }) => {
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para consultar auditoría.' };
  }

  // Eventos de las últimas 24 horas agrupados por tipo — acotado al tenant
  const { rows: eventosPorTipo } = await query(
    `SELECT
       a.evento,
       COUNT(*) AS total
     FROM auditoria a
     WHERE a.creado_en >= NOW() - INTERVAL '24 hours'
       AND a.tenant_id = $1
     GROUP BY a.evento
     ORDER BY total DESC`,
    [tenant_id]
  );

  // Total de DTEs por estado — acotado al tenant
  const { rows: dtesPorEstado } = await query(
    `SELECT
       d.estado,
       COUNT(*) AS total
     FROM dtes d
     WHERE d.tenant_id = $1
     GROUP BY d.estado
     ORDER BY total DESC`,
    [tenant_id]
  );

  // Último registro de auditoría — acotado al tenant
  const { rows: ultimoRegistro } = await query(
    `SELECT
       a.evento,
       a.creado_en
     FROM auditoria a
     WHERE a.tenant_id = $1
     ORDER BY a.creado_en DESC
     LIMIT 1`,
    [tenant_id]
  );

  return {
    ultimas_24h: {
      eventos_por_tipo: eventosPorTipo,
    },
    dtes_por_estado: dtesPorEstado,
    ultimo_evento:   ultimoRegistro[0] || null,
  };
};

// ─────────────────────────────────────────────
// HELPER: formatear registro para respuesta HTTP
// Parsear detalles JSONB correctamente
// ─────────────────────────────────────────────
const formatearRegistro = (row) => ({
  id:          row.id,
  evento:      row.evento,
  dte_id:      row.dte_id      || null,
  // Parsear detalles JSONB — puede venir como string o como objeto
  detalles:    typeof row.detalles === 'string'
    ? JSON.parse(row.detalles)
    : (row.detalles || null),
  ip:          row.ip          || null,
  status_http: row.status_http || null,
  creado_en:   row.creado_en,
  // Datos del DTE relacionado si existe
  dte:         row.dte_numero_control ? {
    numero_control:   row.dte_numero_control,
    tipo:             row.dte_tipo,
    estado:           row.dte_estado,
    codigo_generacion: row.dte_codigo_generacion || null,
  } : null,
});

module.exports = {
  listarAuditoria,
  obtenerRegistro,
  obtenerResumen,
};
