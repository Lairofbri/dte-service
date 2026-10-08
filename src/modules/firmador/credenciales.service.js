// src/modules/firmador/credenciales.service.js
// Proveedor de la contraseña de la llave privada del certificado de firma.
//
// MULTI-EMPRESA (Fase Firmador Bluehost):
// → La contraseña la carga el usuario de cada empresa en Configuración.
// → Se guarda CIFRADA (AES-256-GCM con ENCRYPTION_KEY) en la columna
//   password_firma de la tabla configuracion — patrón password_hacienda.
// → NUNCA se guarda en variables de entorno ni se devuelve al cliente.
//
// SEGURIDAD CRÍTICA:
// → La contraseña NUNCA se persiste en texto plano.
// → La contraseña NUNCA se registra en logs ni se devuelve al cliente.
// → La contraseña se desencripta únicamente durante la operación de firma.

const configuracionService = require('../configuracion/configuracion.service');

/**
 * Obtiene la contraseña de la llave privada para firmar.
 *
 * Lee la credencial CIFRADA de la BD del tenant y la desencripta en memoria
 * solo durante la operación de firma.
 *
 * @param {object} params
 * @param {string} [params.tenant_id] — tenant para el que se firma (obligatorio).
 * @returns {Promise<string>} contraseña de la llave privada
 * @throws {object} error controlado si no hay credencial disponible
 */
const obtenerPasswordFirma = async ({ tenant_id } = {}) => {
  const password = await configuracionService.obtenerPasswordFirma({ tenant_id });

  if (!password) {
    throw {
      status: 503,
      mensaje: 'No hay contraseña de firma configurada. Cárgala en Configuración (una vez por empresa).',
    };
  }

  return password;
};

/**
 * Indica si hay una credencial de firma disponible para el tenant.
 */
const hayCredencialFirma = async ({ tenant_id } = {}) => {
  try {
    const password = await configuracionService.obtenerPasswordFirma({ tenant_id });
    return !!password;
  } catch (_) {
    return false;
  }
};

module.exports = { obtenerPasswordFirma, hayCredencialFirma };