// src/modules/firmador/firmador.service.js
// Comunicación con el firmador de documentos del Ministerio de Hacienda
// El firmador es un servicio Java que corre localmente (Docker o Windows Service)
//
// SEGURIDAD CRÍTICA:
// → passwordPri NUNCA se almacena — viene en cada request y se descarta
// → passwordPri NUNCA aparece en logs
// → Timeout estricto de 10 segundos
// → Si el firmador no responde → error controlado, no contingencia
//   (la contingencia es solo cuando Hacienda no responde)

const axios  = require('axios');
const {
  URL_FIRMADOR,
  TIMEOUT_FIRMADOR,
} = require('../../config/env');
// NIT se lee de la BD — la única fuente de verdad del emisor
// No del env — permite vender a múltiples clientes sin cambiar variables
const configuracionService = require('../configuracion/configuracion.service');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// CLIENTE HTTP con timeout estricto
// El firmador corre localmente — si no responde en 10s hay un problema
// ─────────────────────────────────────────────
const clienteFirmador = axios.create({
  timeout: parseInt(TIMEOUT_FIRMADOR, 10),
  headers: {
    'Content-Type': 'application/json',
  },
});

// ═════════════════════════════════════════════
// MÉTODOS DEL SERVICE
// ═════════════════════════════════════════════

/**
 * Firma un JSON DTE usando el firmador de Hacienda
 *
 * @param {object} jsonDte     — JSON del DTE construido por el generador
 * @param {string} passwordPri — contraseña de la llave privada del certificado
 *                               NUNCA se almacena — viene en cada request
 * @returns {string}           — JWT firmado listo para transmitir a Hacienda
 */
const firmarDTE = async ({ jsonDte, passwordPri }) => {
  // Validar que el passwordPri fue provisto
  if (!passwordPri) {
    throw {
      status:  400,
      mensaje: 'La contraseña de la llave privada (passwordPri) es requerida para firmar.',
    };
  }

  // Obtener NIT de la BD — única fuente de verdad del emisor
  const config = await configuracionService.obtenerConfiguracion();
  const nitSinGuiones = config.nit.replace(/-/g, '');

  logger.info('Enviando DTE al firmador', {
    nit:    nitSinGuiones,
    tipo:   jsonDte?.identificacion?.tipoDte,
    control: jsonDte?.identificacion?.numeroControl,
    // NUNCA loguear passwordPri
  });

  try {
    const respuesta = await clienteFirmador.post(URL_FIRMADOR, {
      nit:        nitSinGuiones,
      activo:     true,
      passwordPri, // Se envía al firmador y se descarta — nunca se guarda
      dteJson:    JSON.stringify(jsonDte),
    });

    const data = respuesta.data;

    // Verificar respuesta exitosa del firmador
    if (data?.status !== 'OK' || !data?.body) {
      logger.warn('El firmador devolvió un error', {
        status:  data?.status,
        codigo:  data?.body?.codigo,
        mensaje: data?.body?.mensaje,
        // NUNCA loguear el body completo — puede contener datos sensibles
      });

      throw {
        status:  422,
        mensaje: parsearErrorFirmador(data),
      };
    }

    // El firmador devuelve el JWT firmado en data.body
    const jwtFirmado = data.body;

    logger.info('DTE firmado exitosamente', {
      tipo:    jsonDte?.identificacion?.tipoDte,
      control: jsonDte?.identificacion?.numeroControl,
      // NUNCA loguear el JWT — contiene la firma del contribuyente
    });

    return jwtFirmado;

  } catch (err) {
    // Re-lanzar errores controlados
    if (err.status && err.mensaje) throw err;

    // Error de conexión con el firmador
    if (
      err.code === 'ECONNABORTED' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND'   ||
      err.code === 'ETIMEDOUT'   ||
      err.message?.includes('timeout')
    ) {
      logger.error('El firmador no responde', {
        url:    URL_FIRMADOR,
        codigo: err.code,
        // NUNCA loguear el error completo — puede contener datos sensibles
      });

      throw {
        status:  503,
        mensaje: 'El servicio de firma no responde. Verifica que el firmador esté corriendo.',
      };
    }

    // Error HTTP del firmador
    if (err.response) {
      logger.error('El firmador devolvió un error HTTP', {
        status_http: err.response.status,
      });

      throw {
        status:  502,
        mensaje: 'El servicio de firma devolvió un error inesperado.',
      };
    }

    logger.error('Error inesperado al firmar DTE', {
      error: err.message,
    });

    throw {
      status:  500,
      mensaje: 'Error inesperado al procesar la firma del DTE.',
    };
  } finally {
    // SEGURIDAD: limpiar referencia al passwordPri
    // aunque JavaScript no garantiza limpieza inmediata de memoria,
    // eliminar la referencia ayuda al garbage collector
    passwordPri = null;
  }
};

/**
 * Verifica que el firmador esté corriendo y disponible
 * Útil para health checks y diagnóstico
 * NO envía credenciales — solo verifica conectividad
 */
const verificarFirmador = async () => {
  try {
    // El firmador expone un endpoint de status según el manual
    const urlStatus = URL_FIRMADOR.replace('firmardocumento/', 'firmardocumento/status');

    const respuesta = await clienteFirmador.get(urlStatus);

    return {
      disponible: true,
      mensaje:    respuesta.data || 'Application is running..!!',
    };

  } catch (err) {
    if (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND'
    ) {
      return {
        disponible: false,
        mensaje:    'El firmador no está corriendo. Inicia el servicio Docker o Windows.',
      };
    }

    return {
      disponible: false,
      mensaje:    `Error al verificar el firmador: ${err.message}`,
    };
  }
};

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/**
 * Parsea los errores del firmador para dar mensajes útiles
 * Basado en los códigos de error del manual
 */
const parsearErrorFirmador = (data) => {
  if (!data?.body) return 'Error desconocido del firmador.';

  const mensajes = Array.isArray(data.body.mensaje)
    ? data.body.mensaje
    : [data.body.mensaje || 'Error del firmador.'];

  // Códigos de error comunes del firmador
  const codigo = data.body.codigo;
  if (codigo === '809') return `Formato de NIT no válido: ${mensajes.join(', ')}`;
  if (codigo === '810') return 'Certificado no encontrado. Verifica que el certificado esté instalado.';
  if (codigo === '811') return 'Contraseña de certificado incorrecta.';

  return mensajes.join(', ');
};

module.exports = {
  firmarDTE,
  verificarFirmador,
};
