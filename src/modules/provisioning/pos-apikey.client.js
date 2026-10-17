// src/modules/provisioning/pos-apikey.client.js
// Entrega automática de la API Key de integración POS → DTE (2026-10-17).
//
// El DTE es el único que puede generarla (guarda su hash), así que la empuja al
// POS por el canal interno ya autenticado (`X-Internal-Api-Key`, red privada).
// El POS la cifra (AES-256-GCM) y la guarda en su `tenants.dte_api_key_enc`.
//
// La clave NUNCA se loguea. Devuelve `true` solo si el POS confirmó.

const axios = require('axios');
const logger = require('../../utils/logger');

const POS_PROVISIONING_URL = process.env.POS_PROVISIONING_URL;
const POS_PROVISIONING_API_KEY = process.env.POS_PROVISIONING_API_KEY;

const entregarApiKeyAlPos = async ({ tenantId, apiKey }) => {
  if (!POS_PROVISIONING_URL || !POS_PROVISIONING_API_KEY) {
    logger.warn('POS_PROVISIONING_URL/API_KEY no configuradas — la API Key no se entregó al POS');
    return false;
  }

  const url = `${POS_PROVISIONING_URL.replace(/\/$/, '')}/internal/provisioning/tenants/${tenantId}/api-key`;
  const respuesta = await axios.post(
    url,
    { api_key: apiKey },
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

module.exports = { entregarApiKeyAlPos };
