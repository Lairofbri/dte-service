// src/utils/logger.js
// Logger Winston configurado para el dte-service
// REGLA CRÍTICA: nunca loguear contraseñas, API Keys,
// credenciales de Hacienda ni contraseñas de certificados

const winston = require('winston');
const { LOG_LEVEL, ES_PRODUCCION, NODE_ENV } = require('../config/env');

// Campos que NUNCA deben aparecer en los logs
const CAMPOS_SENSIBLES = [
  'password',
  'passwordPri',
  'password_hacienda',
  'usuario_hacienda',
  'api_key',
  'encryption_key',
  'token',
  'pwd',
];

/**
 * Filtro que elimina campos sensibles de los logs
 */
const filtrarSensibles = winston.format((info) => {
  const sanitizado = { ...info };

  const limpiar = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const limpio = { ...obj };
    for (const campo of CAMPOS_SENSIBLES) {
      if (campo in limpio) {
        limpio[campo] = '[REDACTADO]';
      }
    }
    return limpio;
  };

  // Limpiar el objeto de metadata
  Object.keys(sanitizado).forEach((key) => {
    if (typeof sanitizado[key] === 'object') {
      sanitizado[key] = limpiar(sanitizado[key]);
    }
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
