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
const listarAuditoria = async ({ filtros = {} }) => {
  const {
    evento,
    dte_id,
    fecha_desde,
    fecha_hasta,
    pagina = 1,
    limite = 50,
  } = filtros;

  // Construir condiciones dinámicas — alias a. en todos los campos
  const condiciones = ['1=1'];
  const valores     = [];
  let idx = 1;

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
  // Alias a. para auditoria, d. para dtes — sin excepción
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
     LEFT JOIN dtes d ON d.id = a.dte_id
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
const obtenerRegistro = async ({ id }) => {
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
     LEFT JOIN dtes d ON d.id = a.dte_id
     WHERE a.id = $1`,
    [id]
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
const obtenerResumen = async () => {
  // Eventos de las últimas 24 horas agrupados por tipo
  const { rows: eventosPorTipo } = await query(
    `SELECT
       a.evento,
       COUNT(*) AS total
     FROM auditoria a
     WHERE a.creado_en >= NOW() - INTERVAL '24 hours'
     GROUP BY a.evento
     ORDER BY total DESC`
  );

  // Total de DTEs por estado
  const { rows: dtesPorEstado } = await query(
    `SELECT
       d.estado,
       COUNT(*) AS total
     FROM dtes d
     GROUP BY d.estado
     ORDER BY total DESC`
  );

  // Último registro de auditoría
  const { rows: ultimoRegistro } = await query(
    `SELECT
       a.evento,
       a.creado_en
     FROM auditoria a
     ORDER BY a.creado_en DESC
     LIMIT 1`
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
