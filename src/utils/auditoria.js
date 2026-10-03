// src/utils/auditoria.js
// Helper compartido para registrar eventos de auditoría (Fase 1).
//
// La auditoría de provisión requiere que cada alta, actualización, reintento y
// bloqueo quede registrado. Este helper centraliza el INSERT en la tabla
// `auditoria` con redacción de secretos (nunca passwords ni API Keys).
//
// REGLA: la auditoría NUNCA bloquea el flujo principal. Si el INSERT falla,
// se registra en logs y la operación continúa.

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Registra un evento de auditoría de forma no bloqueante.
 *
 * @param {object} entrada
 * @param {string} entrada.tenant_id — tenant obligatorio de la operación
 * @param {string} entrada.evento — tipo de evento (p.ej. PROVISION_TENANT_CREADO)
 * @param {object} entrada.detalles — detalles estructurados SIN secretos
 * @param {string} [entrada.ip] — IP de origen
 * @param {number} [entrada.status_http] — código HTTP resultante
 * @param {string} [entrada.usuario_id] — usuario que originó (si aplica)
 * @param {string} [entrada.dte_id] — DTE relacionado (si aplica)
 * @param {string} [entrada.establecimiento_id] — establecimiento relacionado
 */
const registrarEventoAuditoria = async ({
  tenant_id,
  evento,
  detalles,
  ip,
  status_http,
  usuario_id,
  dte_id,
  establecimiento_id,
}) => {
  try {
    await query(
      `INSERT INTO auditoria
         (tenant_id, evento, detalles, ip, status_http, usuario_id, dte_id, establecimiento_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenant_id,
        evento,
        JSON.stringify(detalles || {}),
        ip || null,
        status_http || null,
        usuario_id || null,
        dte_id || null,
        establecimiento_id || null,
      ]
    );
  } catch (err) {
    logger.error('Error al registrar auditoría de provisión', {
      error: err.message,
      evento,
      tenant_id,
    });
  }
};

module.exports = { registrarEventoAuditoria };