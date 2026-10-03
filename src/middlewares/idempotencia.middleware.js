// src/middlewares/idempotencia.middleware.js
// Contrato de idempotencia para operaciones de provisión (Fase 1).
//
// Las operaciones de provisión POS ↔ DTE deben ser idempotentes. Este
// middleware normaliza la clave de idempotencia de una operación:
//
//   - Header "Idempotency-Key" (preferido) o campo "operation_id" del body.
//   - Valida formato UUID v4 (mismo estándar que tenant_id / branch_id).
//   - Adjunta la clave normalizada en req.operationId.
//
// Los endpoints de provisión de Fase 2 lo reutilizarán para garantizar que
// reintentar la misma operación no duplica tenants ni sucursales.

const { error } = require('../utils/response');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const esUuidV4 = (valor) => typeof valor === 'string' && UUID_V4.test(valor);

/**
 * Extrae la clave de idempotencia de la request.
 * Prioridad: header Idempotency-Key > body.operation_id.
 */
const extraerOperationId = (req) => {
  const header = req.headers['idempotency-key'];
  if (header) return header;
  if (req.body && typeof req.body.operation_id === 'string') {
    return req.body.operation_id;
  }
  return null;
};

/**
 * Middleware de idempotencia obligatoria.
 * Rechaza con 400 si falta la clave o no es un UUID v4 válido.
 */
const idempotenciaObligatoria = (req, res, next) => {
  const operationId = extraerOperationId(req);
  if (!operationId) {
    return error(
      res,
      'Clave de idempotencia requerida. Usa el header Idempotency-Key o el campo operation_id.',
      400
    );
  }
  if (!esUuidV4(operationId)) {
    return error(
      res,
      'La clave de idempotencia (operation_id) debe ser un UUID v4 válido.',
      400
    );
  }

  req.operationId = operationId.toLowerCase();
  return next();
};

module.exports = {
  idempotenciaObligatoria,
  esUuidV4,
  extraerOperationId,
};