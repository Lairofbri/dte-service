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
const {
  generarIdEnvio,
  esErrorTransitorio,
  respuestaHaciendaAuditable,
  esJwt,
} = require('../integracion/integracion.utils');

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

const obtenerAmbienteTenant = async (tenant_id) => {
  const configuracion = await configuracionService.obtenerConfiguracion({ tenant_id });
  return configuracion.ambiente || AMBIENTE_HACIENDA;
};

// Hosts oficiales del MH por ambiente. Las envs de URL pueden venir con
// cualquiera de los dos; en cada llamada se normalizan al ambiente ACTUAL
// del tenant para que cambiar 00 ↔ 01 desde Configuración funcione sin
// tocar el despliegue: el host y el campo "ambiente" deben coincidir.
const HOST_HACIENDA_PRUEBAS = 'apitest.dtes.mh.gob.sv';
const HOST_HACIENDA_PROD     = 'api.dtes.mh.gob.sv';

const urlParaAmbiente = (url, ambiente) => {
  if (!url) return url;
  if (ambiente === '01') return url.split(HOST_HACIENDA_PRUEBAS).join(HOST_HACIENDA_PROD);
  return url.split(HOST_HACIENDA_PROD).join(HOST_HACIENDA_PRUEBAS);
};

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

// ─────────────────────────────────────────────
// RECHAZOS DE TRANSMISIÓN DEL MH
// ─────────────────────────────────────────────

// El MH responde 401/403 cuando el token fue revocado o regenerado en el
// portal, aunque localmente siga "vigente". Amerita renovar y reintentar UNA vez.
const ESTADOS_AUTH_MH = [401, 403];

/**
 * Mensaje accionable para un rechazo NO recuperable del MH.
 * Conserva el status HTTP, el código y la descripción reales del MH — sin
 * secretos. Nunca devuelve un genérico vacío: si el MH no informó motivo,
 * lo dice explícitamente.
 */
const mensajeRechazoMH = (info = {}, accion = 'la transmisión') => {
  const refHttp   = info.status_http ? `HTTP ${info.status_http}` : 'sin respuesta HTTP';
  const refCodigo = info.codigo ? `, código ${info.codigo}` : '';
  // Normaliza el punto final: la descripción del MH puede ya incluir "…."
  const descripcion = (info.descripcion || 'motivo no informado por el MH').replace(/\.+\s*$/, '');
  return `Hacienda rechazó ${accion} (${refHttp}${refCodigo}): ${descripcion}.`;
};

// ─────────────────────────────────────────────
// MENSAJES DE RECHAZO DEL MH (POST /seguridad/auth)
// Códigos observados en vivo contra apitest/api:
//   101 → el usuario no existe / no está habilitado como usuario de aplicación
//   106 → credenciales inválidas (contraseña incorrecta)
// El resto proviene del manual técnico del MH. Se traducen a mensajes
// accionables — el detalle crudo se loguea, nunca se expone sin traducir.
// ─────────────────────────────────────────────
const MENSAJES_AUTENTICACION = {
  '100': 'Usuario de Hacienda incorrecto.',
  '101': 'Hacienda no reconoce el usuario de la aplicación (código 101). Verifica que el NIT del emisor esté habilitado como usuario de aplicación en el MH.',
  '102': 'No se pudo autenticar el usuario en Hacienda (código 102). Verifica las credenciales.',
  '103': 'La contraseña de Hacienda expiró (código 103). Genera una nueva en el portal del MH.',
  '106': 'Contraseña de Hacienda incorrecta (código 106). Verifícala e intenta de nuevo.',
};

/**
 * Compone el mensaje accionable para un rechazo de autenticación del MH.
 * Si el código es desconocido, usa la descripción cruda del MH como respaldo.
 * NUNCA incluye credenciales — solo el motivo que devolvió el MH.
 */
const mensajeRechazo = ({ codigo, descripcion } = {}) => {
  const clave = codigo !== undefined && codigo !== null ? String(codigo) : '';
  if (MENSAJES_AUTENTICACION[clave]) return MENSAJES_AUTENTICACION[clave];

  if (descripcion) {
    return `Hacienda rechazó las credenciales${clave ? ` (código ${clave})` : ''}: ${descripcion}.`;
  }

  return 'Hacienda rechazó las credenciales. Verifica usuario y contraseña.';
};

// ═════════════════════════════════════════════
// AUTENTICACIÓN
// ═════════════════════════════════════════════

/**
 * Autenticar con Hacienda y cachear el token
 * El token es válido 24h en producción, 48h en pruebas
 *
 * @param {boolean} forzarRenovacion — si true, renueva aunque el token esté vigente
 * @param {string} [tenant_id]       — tenant autenticado (evita consultas globales)
 * @returns {{ token: string, ambiente: string }}
 */
const autenticar = async ({ forzarRenovacion = false, tenant_id } = {}) => {
  const ambiente = await obtenerAmbienteTenant(tenant_id);

  // Verificar si el token cacheado sigue vigente
  if (!forzarRenovacion) {
    const tokenVigente = await configuracionService.obtenerTokenHacienda({ tenant_id });
    if (tokenVigente) {
      logger.info('Token de Hacienda vigente — reutilizando');
      return { token: tokenVigente, ambiente };
    }
  }

  logger.info('Autenticando con Hacienda...', { ambiente });

  // Obtener credenciales desencriptadas — solo para uso interno
  const credenciales = await configuracionService.obtenerCredencialesHacienda({ tenant_id });

  try {
    // Hacienda usa application/x-www-form-urlencoded para autenticación
    // según el manual técnico de integración
    const params = new URLSearchParams();
    params.append('user', credenciales.usuario);
    params.append('pwd',  credenciales.password);

    const respuesta = await axios.post(urlParaAmbiente(URL_AUTH_HACIENDA, ambiente), params, {
      timeout: parseInt(TIMEOUT_HACIENDA, 10),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'DTE-Service/1.0',
      },
    });

    // Verificar respuesta exitosa de Hacienda
    if (respuesta.data?.status !== 'OK' || !respuesta.data?.body?.token) {
      // El MH responde 200 con el rechazo en el body: {"status":"ERROR",
      // "body":{"codigoMsg":"101","descripcionMsg":"..."}}. Se conserva el
      // motivo para diagnóstico (antes se descartaba y todo error lucía igual).
      const codigo      = respuesta.data?.body?.codigoMsg || respuesta.data?.codigoMsg || null;
      const descripcion = respuesta.data?.body?.descripcionMsg || respuesta.data?.descripcionMsg || null;

      logger.warn('Hacienda rechazó las credenciales', {
        status: respuesta.data?.status,
        codigo,
        descripcion,
        // NUNCA loguear las credenciales
      });

      throw {
        status:  401,
        mensaje: mensajeRechazo({ codigo, descripcion }),
        codigo,
      };
    }

    // Extraer token — Hacienda lo devuelve como "Bearer eyJ..."
    const tokenCompleto = respuesta.data.body.token;
    const token = tokenCompleto.startsWith('Bearer ')
      ? tokenCompleto.substring(7)
      : tokenCompleto;

    // Calcular expiración según ambiente
    // Producción: 24 horas, Pruebas: 48 horas
    const horasExpiracion = ambiente === '01' ? 24 : 48;
    const expiraEn = new Date();
    expiraEn.setHours(expiraEn.getHours() + horasExpiracion);

    // Guardar token encriptado en BD — nunca en texto plano
    await configuracionService.guardarTokenHacienda({
      token,
      expiraEn: expiraEn.toISOString(),
      tenant_id,
    });

    logger.info('Autenticación con Hacienda exitosa', {
      ambiente,
      expira_en:    expiraEn.toISOString(),
      // NUNCA loguear el token
    });

    return { token, ambiente };

  } catch (err) {
    // Re-lanzar errores controlados
    if (err.status && err.mensaje) throw err;

    const errorInfo = parsearErrorHacienda(err);
    logger.error('Error al autenticar con Hacienda', errorInfo);

    if (errorInfo.status_http === 401 || errorInfo.status_http === 403) {
      throw {
        status:  401,
        mensaje: mensajeRechazo({ codigo: errorInfo.codigo, descripcion: errorInfo.descripcion }),
        codigo:  errorInfo.codigo || null,
      };
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
  tenant_id,
}) => {
  // Obtener token vigente (renueva automáticamente si expiró)
  const { token } = await autenticar({ tenant_id });
  const ambiente = await obtenerAmbienteTenant(tenant_id);

  // URL resuelta al ambiente ACTUAL del tenant (00 ↔ 01)
  const urlRecepcion = urlParaAmbiente(URL_RECEPCION_HACIENDA, ambiente);

  // idEnvio: correlativo a discreción del emisor
  // Usamos timestamp para garantizar unicidad por sesión
  const idEnvio = generarIdEnvio();

  const body = {
    ambiente,
    idEnvio,
    version,
    tipoDte,
    documento:         jsonFirmado,
    codigoGeneracion,
  };

  let intentos = 0;
  let reauthRealizado = false;
  const maxIntentos = parseInt(MAX_REINTENTOS_HACIENDA, 10);

  while (intentos <= maxIntentos) {
    try {
      logger.info('Transmitiendo DTE a Hacienda', {
        tipo_dte:          tipoDte,
        codigo_generacion: codigoGeneracion,
        intento:           intentos + 1,
        ambiente,
        url:               urlRecepcion,
      });

      const respuesta = await clienteHacienda.post(urlRecepcion, body, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

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

      const statusHttp = err?.response?.status ?? null;

      // El MH rechazó el token aunque localmente estuviera "vigente" (fue
      // revocado o regenerado en el portal). Renovar UNA vez y reintentar sin
      // consumir la política de reintentos.
      if (ESTADOS_AUTH_MH.includes(statusHttp) && !reauthRealizado) {
        reauthRealizado = true;
        logger.warn('Hacienda rechazó el token de transmisión — renovando credenciales', {
          codigo_generacion: codigoGeneracion,
          status_http:       statusHttp,
        });

        try {
          await autenticar({ forzarRenovacion: true, tenant_id });
        } catch (errAuth) {
          if (errAuth.status && errAuth.mensaje) {
            throw {
              status:  422,
              mensaje: `No se pudo re-autenticar con Hacienda: ${errAuth.mensaje}`,
              detalles: { proveedor: 'hacienda', fase: 'autenticacion' },
            };
          }
          throw errAuth;
        }

        continue;
      }

      intentos++;

      if (intentos > maxIntentos) break;

      // Solo se reintentan fallos transitorios. Antes de reenviar se consulta
      // siempre el estado para evitar duplicar un DTE aceptado por Hacienda.
      if (esErrorTransitorio(err)) {
        logger.warn('Hacienda no respondió, consultando estado antes de reintentar', {
          codigo_generacion: codigoGeneracion,
          intento:           intentos,
        });

        try {
          const estadoActual = await consultarDTE({ codigoGeneracion, tipoDte, tenant_id });
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

      // Rechazo NO recuperable del MH: registrar el motivo REAL y devolverlo
      // accionable. Nunca 502 aquí: un rechazo del MH es un 4xx de negocio y
      // los 5xx pueden ser reemplazados por el proxy perdiendo los headers
      // CORS (incidente 2026-10-13: la emisión devolvía 502 genérico sin log).
      const info = parsearErrorHacienda(err);
      logger.error('Hacienda rechazó la transmisión de forma no recuperable', {
        codigo_generacion: codigoGeneracion,
        tipo_dte:          tipoDte,
        intento:           intentos,
        status_http:       info.status_http,
        codigo:            info.codigo,
        descripcion:       info.descripcion,
        observaciones:     info.observaciones,
      });

      throw {
        status:  422,
        mensaje: mensajeRechazoMH(info),
        detalles: {
          proveedor:     'hacienda',
          fase:          'transmision',
          status_http:   info.status_http,
          codigo:        info.codigo,
          descripcion:   info.descripcion,
          observaciones: info.observaciones,
        },
      };
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
const consultarDTE = async ({ codigoGeneracion, tipoDte, tenant_id }) => {
  const { token, ambiente } = await autenticar({ tenant_id });

  try {
    const respuesta = await clienteHacienda.post(
      urlParaAmbiente(URL_CONSULTA_HACIENDA, ambiente),
      {
        nitEmisor:        (await configuracionService.obtenerConfiguracion({ tenant_id })).nit.replace(/-/g, ''),
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
const notificarContingencia = async ({ documentoFirmado, tenant_id }) => {
  const { token, ambiente } = await autenticar({ tenant_id });

  try {
    const respuesta = await clienteHacienda.post(
      urlParaAmbiente(URL_CONTINGENCIA_HACIENDA, ambiente),
      {
        nit:      (await configuracionService.obtenerConfiguracion({ tenant_id })).nit.replace(/-/g, ''),
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
const anularDTE = async ({ documentoFirmado, version = 1, tenant_id }) => {
  const { token } = await autenticar({ tenant_id });
  const ambiente = await obtenerAmbienteTenant(tenant_id);

  const idEnvio = generarIdEnvio();

  try {
    const respuesta = await clienteHacienda.post(
      urlParaAmbiente(URL_ANULACION_HACIENDA, ambiente),
      {
        ambiente,
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

    // Un rechazo del MH es un 4xx de negocio: conserva status/código/descripción
    // reales en lugar de un 502 genérico que el proxy puede deformar (CORS).
    throw {
      status:  422,
      mensaje: mensajeRechazoMH(errorInfo, 'la anulación'),
      detalles: {
        proveedor:     'hacienda',
        fase:          'anulacion',
        status_http:   errorInfo.status_http,
        codigo:        errorInfo.codigo,
        descripcion:   errorInfo.descripcion,
        observaciones: errorInfo.observaciones,
      },
    };
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
const transmitirLote = async ({ documentos, nitEmisor, ambiente, tenant_id }) => {
  if (!tenant_id) throw { status: 400, mensaje: 'Tenant autenticado requerido para transmitir un lote.' };
  if (!Array.isArray(documentos) || documentos.length === 0 || documentos.length > 100) {
    throw { status: 400, mensaje: 'Un lote debe contener entre 1 y 100 documentos.' };
  }
  if (documentos.some((documento) => !esJwt(documento))) {
    throw { status: 400, mensaje: 'El lote contiene un documento firmado inválido.' };
  }

  const { token } = await autenticar({ tenant_id });

  // idEnvio debe ser UUID v4 en MAYÚSCULAS según el manual de lotes
  const { v4: uuidv4 } = require('uuid');
  const idEnvio = uuidv4().toUpperCase();

  try {
    logger.info('Transmitiendo lote a Hacienda', {
      total_documentos: documentos.length,
      ambiente,
    });

    const respuesta = await clienteHacienda.post(
      urlParaAmbiente(URL_RECEPCION_HACIENDA, ambiente).replace('recepciondte', 'recepcionlote/'),
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
const consultarLote = async ({ codigoLote, tenant_id }) => {
  if (!tenant_id) throw { status: 400, mensaje: 'Tenant autenticado requerido para consultar un lote.' };
  if (!codigoLote) throw { status: 400, mensaje: 'El código de lote es requerido.' };

  const { token, ambiente } = await autenticar({ tenant_id });

  // URL: /fesv/recepcion/consultadtelote/{codigoLote}
  const url = `${urlParaAmbiente(URL_CONSULTA_HACIENDA, ambiente).replace('consultadte/', '')}consultadtelote/${codigoLote}`;

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
  urlParaAmbiente,
  // Exportados para tests unitarios.
  mensajeRechazo,
  parsearErrorHacienda,
  mensajeRechazoMH,
  ESTADOS_AUTH_MH,
};
