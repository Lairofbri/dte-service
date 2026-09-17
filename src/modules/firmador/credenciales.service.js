// src/modules/firmador/credenciales.service.js
// Proveedor de la contraseña de la llave privada del certificado de firma.
//
// SEGURIDAD CRÍTICA:
// → La contraseña NUNCA se almacena en base de datos.
// → La contraseña NUNCA se persiste, registra ni devuelve al cliente.
// → La contraseña se obtiene únicamente durante la operación de firma.
// → El valor se lee de un secreto inyectado en runtime (env / secret manager).
//
// Mecanismo actual: variable de entorno FIRMADOR_PASSWORD_PRI.
// Futuro: integración con Secret Manager o HSM (no modificar esta interfaz).

const { FIRMADOR_PASSWORD_PRI } = require('../../config/env');

/**
 * Obtiene la contraseña de la llave privada para firmar.
 *
 * @param {object} params
 * @param {string} [params.tenant_id] — tenant para el que se firma (uso futuro con
 *                                      secretos por tenant). Si no se provee, se
 *                                      usa el secreto global del entorno.
 * @returns {string} contraseña de la llave privada
 * @throws {object} error controlado si no hay credencial disponible
 */
const obtenerPasswordFirma = ({ tenant_id } = {}) => {
  if (tenant_id && process.env[`FIRMADOR_PASSWORD_PRI_${tenant_id}`]) {
    return process.env[`FIRMADOR_PASSWORD_PRI_${tenant_id}`];
  }

  if (FIRMADOR_PASSWORD_PRI) {
    return FIRMADOR_PASSWORD_PRI;
  }

  throw {
    status: 503,
    mensaje: 'No hay credencial de firma configurada. Verifica la infraestructura de firma.',
  };
};

/**
 * Indica si hay una credencial de firma disponible.
 */
const hayCredencialFirma = ({ tenant_id } = {}) => {
  try {
    obtenerPasswordFirma({ tenant_id });
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = { obtenerPasswordFirma, hayCredencialFirma };