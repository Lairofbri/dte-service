// src/modules/hacienda/hacienda.service.js
// Comunicación con la API del Ministerio de Hacienda El Salvador
// Principio S (SOLID): solo transmite y consulta — no genera ni firma DTEs
//
// SEGURIDAD CRÍTICA:
// → Credenciales se desencriptan solo internamente, nunca se exponen
// → Token de Hacienda nunca se devuelve al cliente HTTP
// → Timeout estricto en todas las llamadas externas (8s Hacienda, 10s firmador)
// → Máximo 2 reintentos antes de contingencia (según manual Hacienda)
// → Nunca loguear credenciales, tokens ni datos sensibles

const axios  = require('axios');
const { v4: uuidv4 } = require('uuid');
const {
  URL_AUTH_HACIENDA,
  URL_RECEPCION_HACIENDA,
  URL_CONSULTA_HACIENDA,
  URL_CONTINGENCIA_HACIENDA,
  URL_ANULACION_HACIENDA,
  TIMEOUT_HACIENDA,
  MAX_REINTENTOS_HACIENDA,
  AMBIENTE_HACIENDA,
} = require('../../config/env');
const configuracionService = require('../configuracion/configuracion.service');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// CLIENTE HTTP con timeout estricto
// Según el manual de Hacienda: 8 segundos máximo
// ─────────────────────────────────────────────
const clienteHacienda = axios.create({
  timeout: parseInt(TIMEOUT_HACIENDA, 10),
  headers: {
    'Content-Type': 'application/json',
    'User-Agent':   'DTE-Service/1.0',
  },
});

// ─────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────

/**
 * Determina si un error es de timeout o de red
 */
const esErrorConexion = (err) =>
  err.code === 'ECONNABORTED' ||
  err.code === 'ECONNREFUSED' ||
  err.code === 'ENOTFOUND'   ||
  err.code === 'ETIMEDOUT'   ||
  err.message?.includes('timeout');

/**
 * Parsea los errores de Hacienda para logging y respuesta
 * NUNCA incluir información sensible en el resultado
 */
const parsearErrorHacienda = (err) => {
  if (err.response) {
    return {
      tipo:        'respuesta_hacienda',
      status_http: err.response.status,
      estado:      err.response.data?.estado,
      codigo:      err.response.data?.codigoMsg,
      descripcion: err.response.data?.descripcionMsg,
      observaciones: err.response.data?.observaciones || [],
    };
  }
  if (esErrorConexion(err)) {
    return {
      tipo:        'conexion',
      codigo:      err.code,
      descripcion: 'Hacienda no respondió en el tiempo esperado.',
    };
  }
  return {
    tipo:        'desconocido',
    descripcion: 'Error inesperado al comunicarse con Hacienda.',
  };
};

// ═════════════════════════════════════════════
// AUTENTICACIÓN
// ═════════════════════════════════════════════

/**
 * Autenticar con Hacienda y cachear el token
 * El token es válido 24h en producción, 48h en pruebas
 *
 * @param {boolean} forzarRenovacion — si true, renueva aunque el token esté vigente
 * @returns {{ token: string, ambiente: string }}
 */
const autenticar = async ({ forzarRenovacion = false } = {}) => {
  // Verificar si el token cacheado sigue vigente
  if (!forzarRenovacion) {
    const tokenVigente = await configuracionService.obtenerTokenHacienda();
    if (tokenVigente) {
      logger.info('Token de Hacienda vigente — reutilizando');
      return { token: tokenVigente, ambiente: AMBIENTE_HACIENDA };
    }
  }

  logger.info('Autenticando con Hacienda...', { ambiente: AMBIENTE_HACIENDA });

  // Obtener credenciales desencriptadas — solo para uso interno
  const credenciales = await configuracionService.obtenerCredencialesHacienda();

  try {
    // Hacienda usa application/x-www-form-urlencoded para autenticación
    // según el manual técnico de integración
    const params = new URLSearchParams();
    params.append('user', credenciales.usuario);
    params.append('pwd',  credenciales.password);

    const respuesta = await axios.post(URL_AUTH_HACIENDA, params, {
      timeout: parseInt(TIMEOUT_HACIENDA, 10),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'DTE-Service/1.0',
      },
    });

    // Verificar respuesta exitosa de Hacienda
    if (respuesta.data?.status !== 'OK' || !respuesta.data?.body?.token) {
      logger.warn('Hacienda rechazó las credenciales', {
        status: respuesta.data?.status,
        // NUNCA loguear las credenciales
      });
      throw {
        status:  401,
        mensaje: 'Hacienda rechazó las credenciales. Verifica usuario y contraseña.',
      };
    }

    // Extraer token — Hacienda lo devuelve como "Bearer eyJ..."
    const tokenCompleto = respuesta.data.body.token;
    const token = tokenCompleto.startsWith('Bearer ')
      ? tokenCompleto.substring(7)
      : tokenCompleto;

    // Calcular expiración según ambiente
    // Producción: 24 horas, Pruebas: 48 horas
    const horasExpiracion = AMBIENTE_HACIENDA === '01' ? 24 : 48;
    const expiraEn = new Date();
    expiraEn.setHours(expiraEn.getHours() + horasExpiracion);

    // Guardar token encriptado en BD — nunca en texto plano
    await configuracionService.guardarTokenHacienda({
      token,
      expiraEn: expiraEn.toISOString(),
    });

    logger.info('Autenticación con Hacienda exitosa', {
      ambiente:     AMBIENTE_HACIENDA,
      expira_en:    expiraEn.toISOString(),
      // NUNCA loguear el token
    });

    return { token, ambiente: AMBIENTE_HACIENDA };

  } catch (err) {
    // Re-lanzar errores controlados
    if (err.status && err.mensaje) throw err;

    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al autenticar con Hacienda', errorInfo);

    if (errorInfo.status_http === 401 || errorInfo.status_http === 403) {
      throw { status: 401, mensaje: 'Credenciales de Hacienda inválidas.' };
    }

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda. Intenta más tarde.' };
    }

    throw { status: 502, mensaje: 'Hacienda devolvió una respuesta inesperada.' };
  }
};

// ═════════════════════════════════════════════
// TRANSMISIÓN
// ═════════════════════════════════════════════

/**
 * Transmitir un DTE firmado a Hacienda (modelo uno a uno)
 * Implementa la política de reintentos del manual de Hacienda:
 * → Timeout 8 segundos
 * → Máximo 2 reintentos
 * → Si falla → contingencia automática
 *
 * @param {object} params
 * @param {string} params.dteJson       — JSON del DTE sin firmar (para idEnvio)
 * @param {string} params.jsonFirmado   — JWT firmado por el firmador
 * @param {string} params.tipoDte       — tipo de DTE (01, 03, 06, 07)
 * @param {string} params.codigoGeneracion — UUID del DTE
 * @param {number} params.version       — versión del JSON del DTE
 * @returns {{ sello: string, estado: string, observaciones: string[] }}
 */
const transmitirDTE = async ({
  jsonFirmado,
  tipoDte,
  codigoGeneracion,
  version = 1,
}) => {
  // Obtener token vigente (renueva automáticamente si expiró)
  const { token } = await autenticar();

  // idEnvio: correlativo a discreción del emisor
  // Usamos timestamp para garantizar unicidad por sesión
  const idEnvio = Date.now();

  const body = {
    ambiente:          AMBIENTE_HACIENDA,
    idEnvio,
    version,
    tipoDte,
    documento:         jsonFirmado,
    codigoGeneracion,
  };

  let intentos = 0;
  const maxIntentos = parseInt(MAX_REINTENTOS_HACIENDA, 10);

  while (intentos <= maxIntentos) {
    try {
      logger.info('Transmitiendo DTE a Hacienda', {
        tipo_dte:          tipoDte,
        codigo_generacion: codigoGeneracion,
        intento:           intentos + 1,
        ambiente:          AMBIENTE_HACIENDA,
      });

      const respuesta = await clienteHacienda.post(
        URL_RECEPCION_HACIENDA,
        body,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = respuesta.data;

      // DTE procesado exitosamente por Hacienda
      if (data.estado === 'PROCESADO') {
        logger.info('DTE transmitido y aceptado por Hacienda', {
          codigo_generacion: codigoGeneracion,
          sello:             data.selloRecibido?.substring(0, 10) + '...',
          observaciones:     data.observaciones?.filter(Boolean).length || 0,
        });

        return {
          estado:        'aceptado',
          sello:         data.selloRecibido,
          observaciones: data.observaciones?.filter(Boolean) || [],
          fh_procesamiento: data.fhProcesamiento,
        };
      }

      // DTE rechazado por Hacienda — no reintentamos, es un error del DTE
      if (data.estado === 'RECHAZADO') {
        logger.warn('DTE rechazado por Hacienda', {
          codigo_generacion: codigoGeneracion,
          codigo_msg:        data.codigoMsg,
          descripcion:       data.descripcionMsg,
          observaciones:     data.observaciones,
        });

        return {
          estado:        'rechazado',
          sello:         null,
          codigo_error:  data.codigoMsg,
          descripcion:   data.descripcionMsg,
          observaciones: data.observaciones || [],
        };
      }

      // Respuesta inesperada de Hacienda
      throw new Error(`Estado inesperado de Hacienda: ${data.estado}`);

    } catch (err) {
      // Error controlado (rechazado) — no reintentamos
      if (err.estado === 'rechazado') throw err;

      intentos++;

      if (intentos > maxIntentos) break;

      // Política de reintentos según manual Hacienda:
      // Antes de reenviar, consultar si el DTE ya fue recibido
      // para evitar duplicados
      if (esErrorConexion(err) || err.code === 'ECONNABORTED') {
        logger.warn('Hacienda no respondió, consultando estado antes de reintentar', {
          codigo_generacion: codigoGeneracion,
          intento:           intentos,
        });

        try {
          const estadoActual = await consultarDTE({ codigoGeneracion, tipoDte });
          if (estadoActual.estado === 'PROCESADO') {
            // El DTE llegó aunque no recibimos la respuesta
            return {
              estado:        'aceptado',
              sello:         estadoActual.selloRecibido,
              observaciones: estadoActual.observaciones || [],
            };
          }
        } catch (errConsulta) {
          logger.warn('No se pudo consultar estado del DTE, reintentando envío', {
            error: errConsulta.mensaje || errConsulta.message,
          });
        }

        // Esperar 1 segundo antes de reintentar
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Error no recuperable
      break;
    }
  }

  // Agotamos los reintentos — activar contingencia
  logger.error('Agotados los reintentos de transmisión a Hacienda', {
    codigo_generacion: codigoGeneracion,
    intentos_realizados: intentos,
  });

  return {
    estado:      'contingencia',
    sello:       null,
    descripcion: 'Hacienda no respondió después de los reintentos. DTE en contingencia.',
  };
};

// ═════════════════════════════════════════════
// CONSULTA
// ═════════════════════════════════════════════

/**
 * Consultar el estado de un DTE en Hacienda
 * Usado en la política de reintentos y por el cliente para verificar estado
 *
 * @param {string} codigoGeneracion — UUID del DTE
 * @param {string} tipoDte          — tipo de DTE
 */
const consultarDTE = async ({ codigoGeneracion, tipoDte }) => {
  const { token } = await autenticar();

  try {
    const respuesta = await clienteHacienda.post(
      URL_CONSULTA_HACIENDA,
      {
        nitEmisor:        (await configuracionService.obtenerConfiguracion()).nit.replace(/-/g, ''),
        tdte:             tipoDte,
        codigoGeneracion: codigoGeneracion.toUpperCase(),
      },
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    return respuesta.data;

  } catch (err) {
    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al consultar DTE en Hacienda', {
      codigo_generacion: codigoGeneracion,
      ...errorInfo,
    });

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda para consultar.' };
    }

    throw { status: 502, mensaje: 'Error al consultar estado del DTE en Hacienda.' };
  }
};

// ═════════════════════════════════════════════
// CONTINGENCIA
// ═════════════════════════════════════════════

/**
 * Notificar evento de contingencia a Hacienda
 * Se llama cuando se han emitido DTEs sin poder transmitirlos
 *
 * @param {string} documentoFirmado — JSON del evento de contingencia firmado
 */
const notificarContingencia = async ({ documentoFirmado }) => {
  const { token } = await autenticar();

  try {
    const respuesta = await clienteHacienda.post(
      URL_CONTINGENCIA_HACIENDA,
      {
        nit:      (await configuracionService.obtenerConfiguracion()).nit.replace(/-/g, ''),
        documento: documentoFirmado,
      },
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    const data = respuesta.data;

    logger.info('Evento de contingencia notificado a Hacienda', {
      estado:          data.estado,
      sello:           data.selloRecibido?.substring(0, 10) + '...',
      observaciones:   data.observaciones?.length || 0,
    });

    return {
      estado:          data.estado,
      sello:           data.selloRecibido,
      fecha_hora:      data.fechaHora,
      observaciones:   data.observaciones || [],
    };

  } catch (err) {
    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al notificar contingencia a Hacienda', errorInfo);

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda para notificar contingencia.' };
    }

    throw { status: 502, mensaje: 'Error al notificar evento de contingencia a Hacienda.' };
  }
};

// ═════════════════════════════════════════════
// ANULACIÓN / INVALIDACIÓN
// ═════════════════════════════════════════════

/**
 * Enviar evento de invalidación (anulación) de un DTE a Hacienda
 *
 * @param {string} documentoFirmado — JSON del evento de invalidación firmado
 * @param {number} version          — versión del JSON
 * @param {number} idEnvio          — correlativo del envío
 */
const anularDTE = async ({ documentoFirmado, version = 1 }) => {
  const { token } = await autenticar();

  const idEnvio = Date.now();

  try {
    const respuesta = await clienteHacienda.post(
      URL_ANULACION_HACIENDA,
      {
        ambiente:  AMBIENTE_HACIENDA,
        idEnvio,
        version,
        documento: documentoFirmado,
      },
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    const data = respuesta.data;

    logger.info('DTE anulado en Hacienda', {
      estado:      data.estado,
      codigo_msg:  data.codigoMsg,
    });

    return {
      estado:      data.estado,
      sello:       data.selloRecibido,
      codigo_msg:  data.codigoMsg,
      descripcion: data.descripcionMsg,
    };

  } catch (err) {
    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al anular DTE en Hacienda', errorInfo);

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda para anular el DTE.' };
    }

    throw { status: 502, mensaje: 'Error al anular el DTE en Hacienda.' };
  }
};


/**
 * Transmitir un lote de DTEs a Hacienda
 * Usado para enviar DTEs en contingencia
 * Máximo 100 documentos por lote según el manual
 *
 * @param {string[]} documentos — array de JWTs firmados
 * @param {string}   nitEmisor  — NIT sin guiones
 * @param {string}   ambiente   — 00|01
 */
const transmitirLote = async ({ documentos, nitEmisor, ambiente }) => {
  const { token } = await autenticar();

  // idEnvio debe ser UUID v4 en MAYÚSCULAS según el manual de lotes
  const { v4: uuidv4 } = require('uuid');
  const idEnvio = uuidv4().toUpperCase();

  try {
    logger.info('Transmitiendo lote a Hacienda', {
      total_documentos: documentos.length,
      ambiente,
    });

    const respuesta = await clienteHacienda.post(
      URL_RECEPCION_HACIENDA.replace('recepciondte', 'recepcionlote/'),
      {
        ambiente,
        idEnvio,
        version:    1,
        nitEmisor,
        documentos,
      },
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    const data = respuesta.data;

    logger.info('Lote recibido por Hacienda', {
      codigo_lote: data.codigoLote,
      estado:      data.estado,
      descripcion: data.descripcionMsg,
    });

    return {
      codigoLote:  data.codigoLote,
      idEnvio:     data.idEnvio,
      estado:      data.estado,
      descripcion: data.descripcionMsg,
    };

  } catch (err) {
    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al transmitir lote a Hacienda', errorInfo);

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda para enviar el lote.' };
    }

    throw { status: 502, mensaje: 'Error al enviar el lote a Hacienda.' };
  }
};

/**
 * Consultar el estado de un lote enviado a Hacienda
 * Los lotes se procesan de forma asíncrona — consultar periódicamente
 *
 * @param {string} codigoLote — código devuelto por Hacienda al enviar el lote
 */
const consultarLote = async ({ codigoLote }) => {
  const { token } = await autenticar();

  // URL: /fesv/recepcion/consultadtelote/{codigoLote}
  const url = `${URL_CONSULTA_HACIENDA.replace('consultadte/', '')}consultadtelote/${codigoLote}`;

  try {
    const respuesta = await clienteHacienda.get(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    return respuesta.data;

  } catch (err) {
    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al consultar lote en Hacienda', {
      codigo_lote: codigoLote,
      ...errorInfo,
    });

    if (esErrorConexion(err)) {
      throw { status: 503, mensaje: 'No se pudo conectar con Hacienda para consultar el lote.' };
    }

    throw { status: 502, mensaje: 'Error al consultar el estado del lote en Hacienda.' };
  }
};

module.exports = {
  autenticar,
  transmitirDTE,
  consultarDTE,
  notificarContingencia,
  anularDTE,
  transmitirLote,
  consultarLote,
};
