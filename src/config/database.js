// src/config/database.js
// Pool de conexiones PostgreSQL para el dte-service
// Una instancia = un cliente = una BD propia

const { Pool } = require('pg');
const { DATABASE_URL, ES_PRODUCCION } = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: ES_PRODUCCION ? { rejectUnauthorized: false } : false,
  max:              10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Error inesperado en el pool de PostgreSQL', {
    error: err.message,
  });
});

/**
 * Ejecutar una query con parámetros
 * Nunca concatenar strings — siempre parametrizado
 */
const query = async (text, params = []) => {
  const inicio = Date.now();
  try {
    const resultado = await pool.query(text, params);
    const duracion = Date.now() - inicio;

    // Log de queries lentas (más de 1 segundo)
    if (duracion > 1000) {
      logger.warn('Query lenta detectada', {
        duracion_ms: duracion,
        query: text.substring(0, 100),
      });
    }

    return resultado;
  } catch (err) {
    logger.error('Error en query PostgreSQL', {
      error:  err.message,
      codigo: err.code,
      query:  text.substring(0, 100),
    });
    throw err;
  }
};

/**
 * Obtener un cliente del pool para transacciones
 * SIEMPRE usar try/catch/finally con client.release()
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Verificar conexión al arrancar
 */
const verificarConexion = async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT NOW() AS servidor');
    logger.info('Conexión a PostgreSQL exitosa', {
      servidor: rows[0].servidor,
    });
  } finally {
    client.release();
  }
};

module.exports = { query, getClient, verificarConexion };
