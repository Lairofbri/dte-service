// src/migrations/run.js
// Runner de migraciones para el dte-service
// Ejecuta los archivos SQL en orden alfabético
// Solo ejecuta migraciones nuevas (no ejecutadas anteriormente)

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const logger = require('../utils/logger');

const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: sslRejectUnauthorized }
    : false,
});

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

const run = async () => {
  const client = await pool.connect();
  try {
    logger.info('Iniciando proceso de migraciones DTE...');

    // Verificar conexión
    const { rows: ping } = await client.query('SELECT NOW() AS servidor');
    logger.info('Conexión a PostgreSQL exitosa', { servidor: ping[0].servidor });

    // Crear tabla de control de migraciones si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migraciones (
        id         SERIAL PRIMARY KEY,
        archivo    VARCHAR(255) NOT NULL UNIQUE,
        hash       VARCHAR(64),
        ejecutado_en TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('ALTER TABLE _migraciones ADD COLUMN IF NOT EXISTS hash VARCHAR(64)');

    // Obtener migraciones ya ejecutadas
    const { rows: ejecutadas } = await client.query(
      'SELECT archivo, hash FROM _migraciones ORDER BY id'
    );
    const ejecutadasMap = new Map(ejecutadas.map((r) => [r.archivo, r.hash]));

    // Leer archivos SQL ordenados alfabéticamente
    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let nuevas = 0;
    for (const archivo of archivos) {
      const rutaArchivo = path.join(MIGRATIONS_DIR, archivo);
      const sql         = fs.readFileSync(rutaArchivo, 'utf8');
      const hashActual  = crypto.createHash('sha256').update(sql).digest('hex');

      if (ejecutadasMap.has(archivo)) {
        const hashPrevio = ejecutadasMap.get(archivo);
        if (!hashPrevio || hashPrevio === hashActual) continue;
        logger.warn(`La migración ${archivo} fue modificada después de ejecutarse; no se reejecutará.`);
        await client.query('UPDATE _migraciones SET hash = $1 WHERE archivo = $2', [hashActual, archivo]);
        continue;
      }

      logger.info(`Ejecutando migración: ${archivo}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migraciones (archivo, hash) VALUES ($1, $2)',
          [archivo, hashActual]
        );
        await client.query('COMMIT');
        logger.info(`Migración completada: ${archivo}`);
        nuevas++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Error en migración ${archivo}`, { error: err.message });
        process.exit(1);
      }
    }

    if (nuevas === 0) {
      logger.info('No hay migraciones nuevas pendientes.');
    } else {
      logger.info(`${nuevas} migración(es) ejecutada(s) exitosamente.`);
    }

    process.exit(0);
  } catch (err) {
    logger.error('Error en el proceso de migraciones', { error: err.message });
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
