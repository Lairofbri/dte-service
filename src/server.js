// src/server.js
// Punto de entrada del dte-service
// Verifica configuración crítica antes de arrancar

const app    = require('./app');
const { PORT, AMBIENTE_HACIENDA } = require('./config/env');
const { verificarConexion } = require('./config/database');
// Leer datos del emisor de BD — única fuente de verdad
const configuracionService = require('./modules/configuracion/configuracion.service');
const logger = require('./utils/logger');

const arrancar = async () => {
  try {
    // Verificar conexión a BD antes de arrancar
    await verificarConexion();

    // Intentar leer configuración del emisor de BD para el log de arranque
    // Si no existe configuración aún — el servidor arranca igual
    let emisorInfo = { nombre: 'Sin configurar', nit: 'Sin configurar' };
    try {
      const config = await configuracionService.obtenerConfiguracion();
      emisorInfo = { nombre: config.nombre, nit: config.nit };
    } catch (_) {
      // Configuración no existe aún — el cliente debe crearla desde el frontend
    }

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
