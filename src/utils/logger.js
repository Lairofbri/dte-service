// src/utils/logger.js
// Logger Winston configurado para el dte-service
// REGLA CRÍTICA: nunca loguear contraseñas, API Keys,
// credenciales de Hacienda ni contraseñas de certificados

const winston = require('winston');
const { LOG_LEVEL, ES_PRODUCCION, NODE_ENV } = require('../config/env');

// Campos que NUNCA deben aparecer en los logs (redacción recursiva)
const CAMPOS_SENSIBLES = [
  'password',
  'passwordPri',
  'password_pri',
  'password_hacienda',
  'usuario_hacienda',
  'api_key',
  'apiKey',
  'x-api-key',
  'encryption_key',
  'token',
  'refresh_token',
  'authorization',
  'cookie',
  'json_firmado',
  'pwd',
];

// Detecta strings que parecen JWT (header.payload.signature)
const PARECE_JWT = /^eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/**
 * Redacta campos sensibles de forma recursiva (objetos y arrays).
 */
const redactar = (valor) => {
  if (valor === null || typeof valor !== 'object') {
    // Redactar strings que parecen JWT completos
    if (typeof valor === 'string' && PARECE_JWT.test(valor.trim())) {
      return '[REDACTADO-JWT]';
    }
    return valor;
  }

  if (Array.isArray(valor)) {
    return valor.map(redactar);
  }

  const limpio = {};
  for (const [clave, subValor] of Object.entries(valor)) {
    if (CAMPOS_SENSIBLES.includes(clave.toLowerCase())) {
      limpio[clave] = '[REDACTADO]';
    } else {
      limpio[clave] = redactar(subValor);
    }
  }
  return limpio;
};

/**
 * Filtro que elimina campos sensibles de los logs (recursivo)
 */
const filtrarSensibles = winston.format((info) => {
  const sanitizado = { ...info };

  Object.keys(sanitizado).forEach((key) => {
    if (key.toLowerCase() === 'message') return;
    sanitizado[key] = redactar(sanitizado[key]);
  });

  return sanitizado;
});

const logger = winston.createLogger({
  level: LOG_LEVEL || 'info',
  format: winston.format.combine(
    filtrarSensibles(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    ES_PRODUCCION
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? ' ' + JSON.stringify(meta)
            : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// En producción también se podría agregar un transporte a archivo
// o a un servicio externo como Logtail, Datadog, etc.

module.exports = logger;
