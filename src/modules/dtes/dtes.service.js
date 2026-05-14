// src/modules/dtes/dtes.service.js
// Orquesta el flujo completo de emisión de DTEs:
// Generación → Firma → Transmisión → Almacenamiento
//
// SEGURIDAD CRÍTICA:
// → passwordPri NUNCA se almacena — se usa y se descarta
// → passwordPri NUNCA aparece en logs
// → El JSON firmado se guarda en BD para reimpresión
// → La auditoría registra cada operación

const { query, getClient } = require('../../config/database');
const generadorService = require('../generador/generador.service');
const firmadorService  = require('../firmador/firmador.service');
const haciendaService  = require('../hacienda/hacienda.service');
const { getFechaHoraEmision } = require('../generador/generador.utils');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPER: registrar en auditoría
// ─────────────────────────────────────────────
const registrarAuditoria = async (evento, dteId, detalles, ip, statusHttp) => {
  try {
    await query(
      `INSERT INTO auditoria (evento, dte_id, detalles, ip, status_http)
       VALUES ($1, $2, $3, $4, $5)`,
      [evento, dteId || null, JSON.stringify(detalles), ip || null, statusHttp || null]
    );
  } catch (err) {
    // La auditoría nunca debe bloquear el flujo principal
    logger.error('Error al registrar auditoría', { error: err.message, evento });
  }
};

// ─────────────────────────────────────────────
// HELPER: guardar DTE en BD
// ─────────────────────────────────────────────
const guardarDTE = async ({
  tipoDte, codigoGeneracion, numeroControl, ambiente,
  estado, selloRecepcion, jsonDte, jsonFirmado,
  erroresHacienda, observaciones, ordenReferencia,
  totalGravado, totalIva, total,
  receptorNombre, receptorNit, receptorNrc,
  establecimientoId, condicionOperacion,
}) => {
  const { rows } = await query(
    `INSERT INTO dtes (
       tipo_dte, codigo_generacion, numero_control, ambiente,
       estado, sello_recepcion, json_dte, json_firmado,
       errores_hacienda, observaciones, orden_referencia,
       receptor_nombre, receptor_nit, receptor_nrc,
       total_gravado, total_iva, total,
       fecha_emision, hora_emision,
       establecimiento_id, condicion_operacion
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id, tipo_dte, codigo_generacion, numero_control,
               estado, sello_recepcion, fecha_emision, hora_emision,
               receptor_nombre, receptor_nit, receptor_nrc,
               total_gravado, total_iva, total`,
    [
      tipoDte,
      codigoGeneracion,
      numeroControl,
      ambiente,
      estado,
      selloRecepcion     || null,
      JSON.stringify(jsonDte),
      jsonFirmado        || null,
      erroresHacienda    ? JSON.stringify(erroresHacienda)  : null,
      observaciones      ? JSON.stringify(observaciones)    : null,
      ordenReferencia    || null,
      receptorNombre     || null,
      receptorNit        || null,
      receptorNrc        || null,
      totalGravado       || 0,
      totalIva           || 0,
      total              || 0,
      jsonDte.identificacion.fecEmi,
      jsonDte.identificacion.horEmi,
      establecimientoId  || null,
      condicionOperacion || 1,
    ]
  );
  return rows[0];
};

// ─────────────────────────────────────────────
// HELPER: actualizar estado del DTE
// ─────────────────────────────────────────────
const actualizarEstadoDTE = async (codigoGeneracion, estado, datos = {}) => {
  await query(
    `UPDATE dtes SET
       estado          = $1,
       sello_recepcion = COALESCE($2, sello_recepcion),
       errores_hacienda = COALESCE($3, errores_hacienda),
       observaciones   = COALESCE($4, observaciones),
       json_firmado    = COALESCE($5, json_firmado)
     WHERE codigo_generacion = $6`,
    [
      estado,
      datos.selloRecepcion  || null,
      datos.errores         ? JSON.stringify(datos.errores)        : null,
      datos.observaciones   ? JSON.stringify(datos.observaciones)  : null,
      datos.jsonFirmado     || null,
      codigoGeneracion,
    ]
  );
};

// ═════════════════════════════════════════════
// FLUJO PRINCIPAL DE EMISIÓN
// ═════════════════════════════════════════════

/**
 * Flujo completo de emisión de un DTE
 * Genera → Firma → Transmite → Guarda → Audita
 *
 * @param {object} params
 * @param {Function} params.generarFn  — función del generador a usar
 * @param {object}   params.datos      — datos del DTE
 * @param {string}   params.passwordPri — contraseña del certificado (NO se almacena)
 * @param {string}   params.ip         — IP del cliente para auditoría
 */
const emitirDTE = async ({ generarFn, datos, passwordPri, ip }) => {
  let jsonDte        = null;
  let codigoGeneracion = null;
  let numeroControl  = null;
  let tipoDte        = null;
  let version        = null;
  let dteGuardado    = null;

  try {
    // ── PASO 1: Generar el JSON del DTE ──
    logger.info('Iniciando emisión de DTE', { tipo: datos.tipo_dte || 'FCF', ip });

    const generado = await generarFn(datos);
    jsonDte          = generado.json;
    codigoGeneracion = generado.codigoGeneracion;
    numeroControl    = generado.numeroControl;
    tipoDte          = generado.tipoDte;
    version          = generado.version;

    // Verificar idempotencia — no transmitir si ya existe
    const { rows: existe } = await query(
      'SELECT id, estado FROM dtes WHERE codigo_generacion = $1',
      [codigoGeneracion]
    );
    if (existe.length > 0 && existe[0].estado === 'aceptado') {
      logger.warn('DTE ya fue transmitido y aceptado', { codigoGeneracion });
      throw {
        status:  409,
        mensaje: `El DTE con código ${codigoGeneracion} ya fue aceptado por Hacienda.`,
      };
    }

    // ── PASO 2: Guardar en BD con estado 'generado' ──
    const resumen = jsonDte.resumen;
    dteGuardado = await guardarDTE({
      tipoDte,
      codigoGeneracion,
      numeroControl,
      ambiente:          jsonDte.identificacion.ambiente,
      estado:            'generado',
      jsonDte,
      ordenReferencia:   datos.orden_referencia  || null,
      totalGravado:      resumen.totalGravada     || 0,
      totalIva:          resumen.totalIva         || resumen.totalIva || 0,
      total:             resumen.totalPagar       || resumen.totalCompra || 0,
      receptorNombre:    jsonDte.receptor?.nombre || jsonDte.sujetoExcluido?.nombre || null,
      receptorNit:       jsonDte.receptor?.nit    || jsonDte.receptor?.numDocumento || null,
      receptorNrc:       jsonDte.receptor?.nrc    || null,
      establecimientoId: datos.establecimiento_id || null,
      condicionOperacion: resumen.condicionOperacion || 1,
    });

    await registrarAuditoria('DTE_GENERADO', dteGuardado.id, {
      tipo_dte:         tipoDte,
      numero_control:   numeroControl,
      codigo_generacion: codigoGeneracion,
    }, ip, 200);

    // ── PASO 3: Firmar el DTE ──
    // passwordPri se usa aquí y se descarta — NUNCA se almacena
    const jsonFirmado = await firmadorService.firmarDTE({
      jsonDte,
      passwordPri,
    });

    // Actualizar estado a 'firmado'
    await actualizarEstadoDTE(codigoGeneracion, 'firmado', { jsonFirmado });
    await registrarAuditoria('DTE_FIRMADO', dteGuardado.id, {
      codigo_generacion: codigoGeneracion,
    }, ip, 200);

    // ── PASO 4: Transmitir a Hacienda ──
    const resultado = await haciendaService.transmitirDTE({
      jsonFirmado,
      tipoDte,
      codigoGeneracion,
      version,
    });

    // ── PASO 5: Procesar respuesta de Hacienda ──
    if (resultado.estado === 'aceptado') {
      await actualizarEstadoDTE(codigoGeneracion, 'aceptado', {
        selloRecepcion: resultado.sello,
        observaciones:  resultado.observaciones,
      });

      await registrarAuditoria('DTE_ACEPTADO', dteGuardado.id, {
        sello:         resultado.sello?.substring(0, 10) + '...',
        observaciones: resultado.observaciones?.length || 0,
      }, ip, 200);

      logger.info('DTE emitido y aceptado por Hacienda', {
        tipo_dte:         tipoDte,
        codigo_generacion: codigoGeneracion,
        numero_control:   numeroControl,
      });

      return {
        estado:            'aceptado',
        codigo_generacion: codigoGeneracion,
        numero_control:    numeroControl,
        sello_recepcion:   resultado.sello,
        observaciones:     resultado.observaciones || [],
        qr_url:            construirQRUrl(
          jsonDte.identificacion.ambiente,
          codigoGeneracion,
          jsonDte.identificacion.fecEmi
        ),
      };
    }

    if (resultado.estado === 'rechazado') {
      await actualizarEstadoDTE(codigoGeneracion, 'rechazado', {
        errores: {
          codigo:       resultado.codigo_error,
          descripcion:  resultado.descripcion,
          observaciones: resultado.observaciones,
        },
      });

      await registrarAuditoria('DTE_RECHAZADO', dteGuardado.id, {
        codigo_error: resultado.codigo_error,
        descripcion:  resultado.descripcion,
      }, ip, 422);

      throw {
        status:  422,
        mensaje: `Hacienda rechazó el DTE: ${resultado.descripcion}`,
        detalles: {
          codigo_error:  resultado.codigo_error,
          observaciones: resultado.observaciones,
        },
      };
    }

    // Estado contingencia — Hacienda no respondió
    if (resultado.estado === 'contingencia') {
      await actualizarEstadoDTE(codigoGeneracion, 'contingencia');

      await registrarAuditoria('DTE_CONTINGENCIA', dteGuardado.id, {
        codigo_generacion: codigoGeneracion,
        razon:             resultado.descripcion,
      }, ip, 202);

      logger.warn('DTE en contingencia — Hacienda no respondió', {
        codigo_generacion: codigoGeneracion,
      });

      return {
        estado:            'contingencia',
        codigo_generacion: codigoGeneracion,
        numero_control:    numeroControl,
        sello_recepcion:   null,
        mensaje:           'El DTE fue generado y firmado pero Hacienda no respondió. Se enviará cuando se restablezca la conexión.',
      };
    }

  } catch (err) {
    // Error controlado — re-lanzar
    if (err.status && err.mensaje) throw err;

    // Error no controlado — registrar y lanzar genérico
    logger.error('Error no controlado en emisión de DTE', {
      error:             err.message,
      codigo_generacion: codigoGeneracion,
    });

    if (dteGuardado) {
      await registrarAuditoria('DTE_ERROR', dteGuardado.id, {
        error: err.message,
      }, ip, 500);
    }

    throw { status: 500, mensaje: 'Error interno al emitir el DTE.' };
  } finally {
    // SEGURIDAD: limpiar referencia al passwordPri
    passwordPri = null;
  }
};

// ═════════════════════════════════════════════
// MÉTODOS PÚBLICOS DEL SERVICE
// ═════════════════════════════════════════════

const emitirFCF = async ({ datos, ip }) => {
  const { password_pri, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarFCF,
    datos:       datosDTE,
    passwordPri: password_pri,
    ip,
  });
};

const emitirCCF = async ({ datos, ip }) => {
  const { password_pri, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarCCF,
    datos:       datosDTE,
    passwordPri: password_pri,
    ip,
  });
};

const emitirNotaCredito = async ({ datos, ip }) => {
  const { password_pri, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarNotaCredito,
    datos:       datosDTE,
    passwordPri: password_pri,
    ip,
  });
};

const emitirNotaDebito = async ({ datos, ip }) => {
  const { password_pri, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarNotaDebito,
    datos:       datosDTE,
    passwordPri: password_pri,
    ip,
  });
};

const emitirFSE = async ({ datos, ip }) => {
  const { password_pri, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarFSE,
    datos:       datosDTE,
    passwordPri: password_pri,
    ip,
  });
};

/**
 * Anular un DTE existente
 * Requiere que el DTE esté en estado 'aceptado'
 * El evento de invalidación también se firma y transmite a Hacienda
 */
const anularDTE = async ({ datos, ip }) => {
  const { password_pri, codigo_generacion, ...datosAnulacion } = datos;

  // Obtener el DTE a anular de la BD
  const { rows } = await query(
    `SELECT d.id, d.tipo_dte, d.codigo_generacion, d.numero_control,
            d.sello_recepcion, d.fecha_emision, d.total_iva,
            d.total, d.estado,
            d.json_dte->>'receptor' as receptor_json
     FROM dtes d
     WHERE d.codigo_generacion = $1`,
    [codigo_generacion.toUpperCase()]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'DTE no encontrado.' };
  }

  const dte = rows[0];

  if (dte.estado !== 'aceptado') {
    throw {
      status:  409,
      mensaje: `Solo se pueden anular DTEs aceptados. Estado actual: ${dte.estado}`,
    };
  }

  // Obtener nombre del receptor del JSON
  let receptorNombre = null;
  try {
    const receptorJson = dte.receptor_json ? JSON.parse(dte.receptor_json) : null;
    receptorNombre = receptorJson?.nombre || null;
  } catch (_) {}

  // Generar JSON de invalidación
  const { json: jsonInvalidacion, codigoGeneracion: codGenAnulacion } =
    await generadorService.generarInvalidacion({
      codigo_generacion_a_anular: codigo_generacion,
      tipo_dte:                   dte.tipo_dte,
      sello_recepcion:            dte.sello_recepcion,
      numero_control:             dte.numero_control,
      fecha_emision:              dte.fecha_emision,
      monto_iva:                  dte.total_iva,
      receptor_nombre:            receptorNombre,
      ...datosAnulacion,
    });

  // Firmar el evento de invalidación
  const jsonFirmado = await firmadorService.firmarDTE({
    jsonDte:    jsonInvalidacion,
    passwordPri: password_pri,
  });

  // Transmitir a Hacienda
  const resultado = await haciendaService.anularDTE({
    documentoFirmado: jsonFirmado,
    version:          2,
  });

  if (resultado.estado === 'PROCESADO') {
    // Actualizar estado del DTE original a anulado
    await query(
      `UPDATE dtes SET estado = 'anulado' WHERE codigo_generacion = $1`,
      [codigo_generacion.toUpperCase()]
    );

    await registrarAuditoria('DTE_ANULADO', dte.id, {
      codigo_generacion_anulacion: codGenAnulacion,
      motivo_tipo:                 datosAnulacion.motivo_tipo,
      motivo:                      datosAnulacion.motivo_descripcion,
    }, ip, 200);

    logger.info('DTE anulado exitosamente', {
      codigo_generacion_original: codigo_generacion,
      codigo_generacion_anulacion: codGenAnulacion,
    });

    return {
      estado:                      'anulado',
      codigo_generacion_original:  codigo_generacion,
      codigo_generacion_anulacion: codGenAnulacion,
      sello_recepcion:             resultado.sello,
    };
  }

  throw {
    status:  422,
    mensaje: `Hacienda rechazó la anulación: ${resultado.descripcion}`,
  };
};

/**
 * Listar DTEs con filtros y paginación
 * establecimientoId: si viene del JWT filtra por establecimiento del usuario
 *                   si viene de API Key (undefined) no filtra — ve todos
 */
const listarDTEs = async ({ filtros = {}, establecimientoId }) => {
  const { tipo_dte, estado, fecha_desde, fecha_hasta, pagina = 1, limite = 20 } = filtros;

  const condiciones = ['1=1'];
  const valores     = [];
  let idx = 1;

  // Scoping por establecimiento — JWT solo ve su establecimiento
  if (establecimientoId) {
    condiciones.push(`d.establecimiento_id = $${idx++}`);
    valores.push(establecimientoId);
  }

  if (tipo_dte)    { condiciones.push(`d.tipo_dte = $${idx++}`);         valores.push(tipo_dte); }
  if (estado)      { condiciones.push(`d.estado = $${idx++}`);           valores.push(estado); }
  if (fecha_desde) { condiciones.push(`d.fecha_emision >= $${idx++}`);   valores.push(fecha_desde); }
  if (fecha_hasta) { condiciones.push(`d.fecha_emision <= $${idx++}`);   valores.push(fecha_hasta); }

  const offset = (pagina - 1) * limite;

  const { rows } = await query(
    `SELECT
       d.id, d.tipo_dte, d.codigo_generacion, d.numero_control,
       d.estado, d.sello_recepcion,
       d.receptor_nombre, d.receptor_nit,
       d.total_gravado, d.total_iva, d.total,
       d.fecha_emision, d.hora_emision,
       d.creado_en
     FROM dtes d
     WHERE ${condiciones.join(' AND ')}
     ORDER BY d.fecha_emision DESC, d.hora_emision DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...valores, limite, offset]
  );

  const { rows: conteo } = await query(
    `SELECT COUNT(*) as total FROM dtes d WHERE ${condiciones.join(' AND ')}`,
    valores
  );

  return {
    dtes: rows,
    paginacion: {
      total:   parseInt(conteo[0].total),
      pagina,
      limite,
      paginas: Math.ceil(parseInt(conteo[0].total) / limite),
    },
  };
};

/**
 * Obtener detalle de un DTE por código de generación
 * Incluye el JSON completo para reimpresión
 * establecimientoId: si viene del JWT verifica que el DTE pertenece
 *                   al establecimiento del usuario (evita cross-tenant)
 */
const obtenerDTE = async ({ codigoGeneracion, establecimientoId }) => {
  // Construir filtro de establecimiento si viene del JWT
  const filtroEstablecimiento = establecimientoId
    ? 'AND d.establecimiento_id = $2'
    : '';

  const params = establecimientoId
    ? [codigoGeneracion.toUpperCase(), establecimientoId]
    : [codigoGeneracion.toUpperCase()];

  const { rows } = await query(
    `SELECT
       d.id, d.tipo_dte, d.codigo_generacion, d.numero_control,
       d.ambiente, d.estado, d.sello_recepcion,
       d.receptor_nombre, d.receptor_nit, d.receptor_nrc,
       d.total_gravado, d.total_iva, d.total,
       d.json_dte, d.errores_hacienda, d.observaciones,
       d.orden_referencia, d.fecha_emision, d.hora_emision,
       d.creado_en, d.actualizado_en
     FROM dtes d
     WHERE d.codigo_generacion = $1
     ${filtroEstablecimiento}`,
    params
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'DTE no encontrado.' };
  }

  const dte = rows[0];

  return {
    ...dte,
    qr_url: dte.estado === 'aceptado'
      ? construirQRUrl(dte.ambiente, dte.codigo_generacion, dte.fecha_emision)
      : null,
  };
};

// ─────────────────────────────────────────────
// HELPER: construir URL del QR de Hacienda
// ─────────────────────────────────────────────
const construirQRUrl = (ambiente, codigoGeneracion, fechaEmision) =>
  `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${codigoGeneracion}&fechaEmi=${fechaEmision}`;

module.exports = {
  emitirFCF,
  emitirCCF,
  emitirNotaCredito,
  emitirNotaDebito,
  emitirFSE,
  anularDTE,
  listarDTEs,
  obtenerDTE,
};
