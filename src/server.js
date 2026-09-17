// src/server.js
// Punto de entrada del dte-service
// Verifica configuración crítica antes de arrancar

const app    = require('./app');
const { PORT, AMBIENTE_HACIENDA } = require('./config/env');
const { verificarConexion } = require('./config/database');
const logger = require('./utils/logger');

const arrancar = async () => {
  try {
    // Verificar conexión a BD antes de arrancar
    await verificarConexion();

    // La configuración fiscal es por tenant (multi-tenant) — no se carga
    // configuración global al arrancar. Cada tenant resuelve la suya vía
    // el JWT o la API Key validada.
    const emisorInfo = { nombre: 'Por tenant', nit: 'Por tenant' };

    const servidor = app.listen(PORT, () => {
      logger.info('DTE Service arrancado', {
        puerto:   PORT,
        emisor:   emisorInfo.nombre,
        nit:      emisorInfo.nit,
        ambiente: AMBIENTE_HACIENDA === '00' ? 'PRUEBAS' : 'PRODUCCIÓN',
        entorno:  process.env.NODE_ENV,
      });

      if (AMBIENTE_HACIENDA === '01') {
        logger.warn('⚠️  AMBIENTE DE PRODUCCIÓN — Los DTEs emitidos son documentos legales');
      } else {
        logger.info('ℹ️  Ambiente de pruebas — Los DTEs NO tienen validez legal');
      }
    });

    // Graceful shutdown
    const cerrar = async (senal) => {
      logger.info(`Señal ${senal} recibida — cerrando servidor...`);
      servidor.close(() => {
        logger.info('Servidor cerrado correctamente.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => cerrar('SIGTERM'));
    process.on('SIGINT',  () => cerrar('SIGINT'));

  } catch (err) {
    logger.error('Error fatal al arrancar el servidor', { error: err.message });
    process.exit(1);
  }
};

arrancar();
