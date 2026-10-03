// src/modules/provisioning/outbox.service.js
// Outbox de provisión (Fase 2): eventos hacia el POS.
//
// El DTE Service es la fuente de verdad fiscal; cuando el alta se inicia
// desde DTE, se publica un evento que el POS consume para crear su
// proyección operativa. El worker reintenta con backoff exponencial hasta
// MAX_INTENTOS; los eventos son idempotentes por (operation_id, tipo_evento).
//
// REGLA: el payload NUNCA incluye passwords de Hacienda ni secretos de firma.

const axios = require('axios');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { registrarEventoAuditoria } = require('../../utils/auditoria');

const MAX_INTENTOS = 5;
const INTERVALO_MS = 30 * 1000;

// Se lee de process.env (ver nota en internal.middleware.js).
const POS_PROVISIONING_URL = process.env.POS_PROVISIONING_URL;
const POS_PROVISIONING_API_KEY = process.env.POS_PROVISIONING_API_KEY;

/**
 * Publica (o reutiliza) un evento de provisión hacia el POS.
 * Idempotente: la misma (operation_id, tipo_evento) nunca se duplica.
 */
const publicarEvento = async ({ operation_id, tenant_id, branch_id = null, tipo_evento, payload = {} }) => {
  await query(
    `INSERT INTO eventos_provision
       (operation_id, tenant_id, branch_id, tipo_evento, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (operation_id, tipo_evento) DO NOTHING`,
    [operation_id, tenant_id, branch_id, tipo_evento, JSON.stringify(payload)]
  );
  logger.info('Evento de provisión publicado', { operation_id, tenant_id, tipo_evento });
};

/**
 * Entrega un evento individual al POS. Devuelve true si fue confirmado.
 */
const entregarEvento = async (evento) => {
  if (!POS_PROVISIONING_URL || !POS_PROVISIONING_API_KEY) {
    throw new Error('POS_PROVISIONING_URL o POS_PROVISIONING_API_KEY no configuradas.');
  }

  const url = `${POS_PROVISIONING_URL.replace(/\/$/, '')}/internal/provisioning/events`;
  const respuesta = await axios.post(
    url,
    {
      operation_id: evento.operation_id,
      tenant_id: evento.tenant_id,
      branch_id: evento.branch_id || null,
      tipo_evento: evento.tipo_evento,
      payload: evento.payload || {},
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': POS_PROVISIONING_API_KEY,
      },
      timeout: 10000,
    }
  );
  return respuesta.status >= 200 && respuesta.status < 300;
};

/**
 * Procesa el outbox: marca eventos pendientes, entrega, confirma o reintenta.
 * Atómico por fila (FOR UPDATE SKIP LOCKED) para no duplicar entregas.
 */
const procesarOutbox = async ({ limite = 10 } = {}) => {
  const { rows } = await query(
    `SELECT id, operation_id, tenant_id, branch_id, tipo_evento, payload, intentos
     FROM eventos_provision
     WHERE estado IN ('pendiente', 'enviado')
       AND proximo_reintento_en <= NOW()
       AND intentos < $2
     ORDER BY creado_en ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limite, MAX_INTENTOS]
  );

  const resultados = [];
  for (const evento of rows) {
    try {
      const confirmado = await entregarEvento(evento);
      await query(
        `UPDATE eventos_provision
         SET estado = 'confirmado', confirmado_en = NOW(), ultimo_error = NULL, actualizado_en = NOW()
         WHERE id = $1`,
        [evento.id]
      );
      await query(
        'UPDATE tenants SET last_pos_sync_at = NOW(), actualizado_en = NOW() WHERE id = $1',
        [evento.tenant_id]
      );
      await registrarEventoAuditoria({
        tenant_id: evento.tenant_id,
        evento: 'PROVISION_EVENTO_CONFIRMADO',
        detalles: { operation_id: evento.operation_id, tipo_evento: evento.tipo_evento },
        status_http: 200,
      });
      resultados.push({ id: evento.id, estado: 'confirmado' });
    } catch (err) {
      const intentos = evento.intentos + 1;
      const fallido = intentos >= MAX_INTENTOS;
      const backoffMin = Math.min(Math.pow(2, intentos), 60);
      await query(
        `UPDATE eventos_provision
         SET intentos = $2, estado = $3, ultimo_error = $4,
             proximo_reintento_en = NOW() + ($5 || ' minutes')::interval,
             actualizado_en = NOW()
         WHERE id = $1`,
        [
          evento.id,
          intentos,
          fallido ? 'fallido' : 'enviado',
          (err.message || 'Error desconocido').slice(0, 500),
          backoffMin,
        ]
      );
      if (fallido) {
        await registrarEventoAuditoria({
          tenant_id: evento.tenant_id,
          evento: 'PROVISION_EVENTO_FALLIDO',
          detalles: {
            operation_id: evento.operation_id,
            tipo_evento: evento.tipo_evento,
            intentos,
            error: (err.message || '').slice(0, 300),
          },
          status_http: 502,
        });
        logger.error('Evento de provisión fallido', {
          operation_id: evento.operation_id,
          tipo_evento: evento.tipo_evento,
          intentos,
        });
      } else {
        logger.warn('Reintento de evento de provisión', {
          operation_id: evento.operation_id,
          tipo_evento: evento.tipo_evento,
          intentos,
          error: err.message,
        });
      }
      resultados.push({ id: evento.id, estado: fallido ? 'fallido' : 'enviado' });
    }
  }
  return resultados;
};

/**
 * Confirma un evento desde el endpoint de ack del POS.
 * Idempotente: re-confirmar un evento ya confirmado es un no-op.
 */
const confirmarEvento = async ({ operation_id }) => {
  const { rows } = await query(
    `UPDATE eventos_provision
     SET estado = 'confirmado', confirmado_en = NOW(),
         ultimo_error = NULL, actualizado_en = NOW()
     WHERE operation_id = $1 AND estado IN ('pendiente', 'enviado')
     RETURNING id, tenant_id, tipo_evento`,
    [operation_id]
  );

  for (const row of rows) {
    await registrarEventoAuditoria({
      tenant_id: row.tenant_id,
      evento: 'PROVISION_EVENTO_CONFIRMADO',
      detalles: { operation_id, tipo_evento: row.tipo_evento, via: 'ack' },
      status_http: 200,
    });
  }

  if (rows.length === 0) {
    const { rows: existentes } = await query(
      'SELECT id FROM eventos_provision WHERE operation_id = $1',
      [operation_id]
    );
    if (existentes.length === 0) {
      throw { status: 404, mensaje: 'Evento de provisión no encontrado.' };
    }
    // Ya estaba confirmado — ack idempotente.
    return { operation_id, confirmados: 0 };
  }

  return { operation_id, confirmados: rows.length };
};

let workerTimer = null;
let procesando = false;

/**
 * Inicia el worker del outbox. Solo corre si el POS está configurado.
 * Se llama desde server.js al arrancar.
 */
const iniciarWorker = () => {
  if (!POS_PROVISIONING_URL) {
    logger.warn('POS_PROVISIONING_URL no configurada — worker de outbox deshabilitado');
    return;
  }
  if (workerTimer) return;
  workerTimer = setInterval(async () => {
    if (procesando) return;
    procesando = true;
    try {
      await procesarOutbox();
    } catch (err) {
      logger.error('Error al procesar outbox', { error: err.message });
    } finally {
      procesando = false;
    }
  }, INTERVALO_MS);
  workerTimer.unref();
  logger.info('Worker de outbox de provisión iniciado', { intervalo_ms: INTERVALO_MS });
};

const detenerWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
};

module.exports = {
  publicarEvento,
  procesarOutbox,
  confirmarEvento,
  iniciarWorker,
  detenerWorker,
};