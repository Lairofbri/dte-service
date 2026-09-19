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
const { validarDte } = require('../validacion-dte/dte-schema-validator');
const { respuestaHaciendaAuditable } = require('../integracion/integracion.utils');

// ─────────────────────────────────────────────
// HELPER: registrar en auditoría
// ─────────────────────────────────────────────
const registrarAuditoria = async (evento, dteId, detalles, ip, statusHttp, tenant_id) => {
  try {
    await query(
      `INSERT INTO auditoria (evento, dte_id, detalles, ip, status_http, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [evento, dteId || null, JSON.stringify(detalles), ip || null, statusHttp || null, tenant_id || null]
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
  establecimientoId, condicionOperacion, clienteId,
  tenant_id, idempotencyKey,
}) => {
  const camposDte = [
    'tipo_dte', 'codigo_generacion', 'numero_control', 'ambiente',
    'estado', 'sello_recepcion', 'json_dte', 'json_firmado',
    'errores_hacienda', 'observaciones', 'orden_referencia',
    'receptor_nombre', 'receptor_nit', 'receptor_nrc',
    'total_gravado', 'total_iva', 'total',
    'fecha_emision', 'hora_emision',
    'establecimiento_id', 'condicion_operacion', 'cliente_id',
  ];
  const valoresDte = [
    tipoDte, codigoGeneracion, numeroControl, ambiente,
    estado, selloRecepcion || null, JSON.stringify(jsonDte),
    jsonFirmado || null,
    erroresHacienda ? JSON.stringify(erroresHacienda) : null,
    observaciones ? JSON.stringify(observaciones) : null,
    ordenReferencia || null,
    receptorNombre || null, receptorNit || null, receptorNrc || null,
    totalGravado || 0, totalIva || 0, total || 0,
    jsonDte.identificacion.fecEmi, jsonDte.identificacion.horEmi,
    establecimientoId || null, condicionOperacion || 1, clienteId || null,
  ];

  // Obtener tenant_id del establecimiento — solo como fallback defensivo.
  // Fase 2: el tenant debe venir SIEMPRE del contexto autenticado.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para guardar el DTE.' };
  }

  camposDte.push('tenant_id');
  valoresDte.push(tenant_id);

  // Fase 3: clave idempotente por tenant — permite reutilizar el mismo DTE.
  if (idempotencyKey) {
    camposDte.push('idempotency_key');
    valoresDte.push(idempotencyKey);
  }

  const phDte = valoresDte.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO dtes (${camposDte.join(', ')})
     VALUES (${phDte})
     RETURNING id, tipo_dte, codigo_generacion, numero_control,
               estado, sello_recepcion, fecha_emision, hora_emision,
               receptor_nombre, receptor_nit, receptor_nrc,
               total_gravado, total_iva, total`,
    valoresDte
  );
  return rows[0];
};

const guardarItemsDTE = async ({ dteId, tenant_id, jsonDte }) => {
  const items = jsonDte.cuerpoDocumento || jsonDte.cuerpo_documento || [];
  if (!Array.isArray(items) || items.length === 0) return;

  for (const [indice, item] of items.entries()) {
    await query(
      `INSERT INTO dtes_items (
         dte_id, tenant_id, num_item, tipo_item, codigo, descripcion,
         cantidad, uni_medida, precio_uni, monto_descu,
         venta_no_suj, venta_exenta, venta_gravada, tributos,
         psv, no_gravado, iva_item
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (dte_id, num_item) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         tipo_item = EXCLUDED.tipo_item,
         codigo = EXCLUDED.codigo,
         descripcion = EXCLUDED.descripcion,
         cantidad = EXCLUDED.cantidad,
         uni_medida = EXCLUDED.uni_medida,
         precio_uni = EXCLUDED.precio_uni,
         monto_descu = EXCLUDED.monto_descu,
         venta_no_suj = EXCLUDED.venta_no_suj,
         venta_exenta = EXCLUDED.venta_exenta,
         venta_gravada = EXCLUDED.venta_gravada,
         tributos = EXCLUDED.tributos,
         psv = EXCLUDED.psv,
         no_gravado = EXCLUDED.no_gravado,
         iva_item = EXCLUDED.iva_item`,
      [
        dteId,
        tenant_id,
        item.numItem || indice + 1,
        item.tipoItem || 2,
        item.codigo || null,
        item.descripcion || item.nombre_producto || 'Item fiscal',
        item.cantidad || 1,
        item.uniMedida || 59,
        item.precioUni || item.precio_unitario || 0,
        item.montoDescu || item.descuento || 0,
        item.ventaNoSuj || 0,
        item.ventaExenta || 0,
        item.ventaGravada || item.compra || 0,
        item.tributos ? JSON.stringify(item.tributos) : null,
        item.psv || 0,
        item.noGravado || 0,
        item.ivaItem || null,
      ],
    );
  }
};

// ─────────────────────────────────────────────
// HELPER: actualizar estado del DTE
// ─────────────────────────────────────────────
const actualizarEstadoDTE = async (codigoGeneracion, estado, datos = {}, tenant_id) => {
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para actualizar el DTE.' };
  }
  await query(
    `UPDATE dtes SET
       estado          = $1,
       sello_recepcion = COALESCE($2, sello_recepcion),
       errores_hacienda = COALESCE($3, errores_hacienda),
       observaciones   = COALESCE($4, observaciones),
       json_firmado    = COALESCE($5, json_firmado)
     WHERE codigo_generacion = $6 AND tenant_id = $7`,
    [
      estado,
      datos.selloRecepcion  || null,
      datos.errores         ? JSON.stringify(datos.errores)        : null,
      datos.observaciones   ? JSON.stringify(datos.observaciones)  : null,
      datos.jsonFirmado     || null,
      codigoGeneracion,
      tenant_id,
    ]
  );
};

// ─────────────────────────────────────────────
// HELPER: buscar DTE por clave idempotente
// Fase 3 — los reintentos reutilizan el mismo DTE.
// ─────────────────────────────────────────────
const buscarPorIdempotencia = async (tenant_id, idempotencyKey) => {
  if (!tenant_id || !idempotencyKey) return null;
  const { rows } = await query(
    `SELECT id, tipo_dte, codigo_generacion, numero_control, estado,
            sello_recepcion, errores_hacienda, observaciones
     FROM dtes
     WHERE tenant_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [tenant_id, idempotencyKey]
  );
  return rows[0] || null;
};

// ─────────────────────────────────────────────
// HELPER: construir respuesta desde un DTE existente
// Repetir la misma petición produce la misma respuesta fiscal.
// ─────────────────────────────────────────────
const construirRespuestaDesdeDte = (dte) => {
  const base = {
    codigo_generacion: dte.codigo_generacion,
    numero_control:    dte.numero_control,
    sello_recepcion:   dte.sello_recepcion || null,
    reutilizado:       true,
  };

  if (dte.estado === 'aceptado') {
    return {
      ...base,
      estado:        'aceptado',
      observaciones: dte.observaciones || [],
    };
  }

  if (dte.estado === 'rechazado') {
    const errores = dte.errores_hacienda || {};
    throw {
      status:  422,
      mensaje: `Hacienda rechazó el DTE: ${errores.descripcion || 'rechazo previo del documento.'}`,
      detalles: errores,
    };
  }

  if (dte.estado === 'anulado') {
    return { ...base, estado: 'anulado' };
  }

  return {
    ...base,
    estado: dte.estado,
    mensaje: dte.estado === 'contingencia'
      ? 'El DTE quedó en contingencia porque Hacienda no respondió.'
      : `El DTE ya fue registrado previamente (estado: ${dte.estado}).`,
  };
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
const emitirDTE = async ({ generarFn, datos, passwordPri, tenant_id, ip, idempotencyKey }) => {
  let jsonDte        = null;
  let codigoGeneracion = null;
  let numeroControl  = null;
  let tipoDte        = null;
  let version        = null;
  let dteGuardado    = null;

  try {
    // ── PASO 0: Idempotencia (Fase 3) ──
    // Si ya existe un DTE para esta clave (tenant + orden + tipo),
    // reutilizarlo: NO se genera un nuevo UUID ni se consume correlativo.
    if (idempotencyKey) {
      const existente = await buscarPorIdempotencia(tenant_id, idempotencyKey);
      if (existente) {
        logger.info('DTE reutilizado por clave idempotente', {
          idempotencyKey,
          estado: existente.estado,
        });
        return construirRespuestaDesdeDte(existente);
      }
    }

    // ── PASO 1: Generar el JSON del DTE ──
    logger.info('Iniciando emisión de DTE', { tipo: datos.tipo_dte || 'FCF', ip });

    const generado = await generarFn(datos);
    jsonDte          = generado.json;
    codigoGeneracion = generado.codigoGeneracion;
    numeroControl    = generado.numeroControl;
    tipoDte          = generado.tipoDte;
    version          = generado.version;

    // Validar antes de cualquier persistencia o firma. El mismo objeto validado
    // se entrega después al firmador para evitar divergencias fiscales.
    validarDte(jsonDte);

    // Verificar idempotencia — no transmitir si ya existe (dentro del tenant)
    const { rows: existe } = await query(
      'SELECT id, estado FROM dtes WHERE codigo_generacion = $1 AND tenant_id = $2',
      [codigoGeneracion, tenant_id]
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
    try {
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
        clienteId:         datos.cliente_id         || null,
        idempotencyKey:    idempotencyKey           || null,
      });
    } catch (err) {
      // Dos peticiones concurrentes con la misma clave: la restricción única
      // impide el duplicado. Reutilizar el DTE ganador en lugar de fallar.
      if (err.code === '23505' && idempotencyKey) {
        const existente = await buscarPorIdempotencia(tenant_id, idempotencyKey);
        if (existente) {
          logger.warn('DTE duplicado detectado por clave idempotente — reutilizando registro existente', {
            idempotencyKey,
            estado: existente.estado,
          });
          return construirRespuestaDesdeDte(existente);
        }
      }
      throw err;
    }

    await guardarItemsDTE({ dteId: dteGuardado.id, tenant_id, jsonDte });

    await registrarAuditoria('DTE_GENERADO', dteGuardado.id, {
      tipo_dte:         tipoDte,
      numero_control:   numeroControl,
      codigo_generacion: codigoGeneracion,
    }, ip, 200, tenant_id);

    // ── PASO 3: Firmar el DTE ──
    // La credencial se resuelve en el proveedor de firma (nunca en BD).
    const jsonFirmado = await firmadorService.firmarDTE({
      jsonDte,
      passwordPri,
      tenant_id,
    });

    // Actualizar estado a 'firmado'
    await actualizarEstadoDTE(codigoGeneracion, 'firmado', { jsonFirmado }, tenant_id);
    await registrarAuditoria('DTE_FIRMADO', dteGuardado.id, {
      codigo_generacion: codigoGeneracion,
    }, ip, 200, tenant_id);

    // ── PASO 4: Transmitir a Hacienda ──
    const resultado = await haciendaService.transmitirDTE({
      jsonFirmado,
      tipoDte,
      codigoGeneracion,
      version,
      tenant_id,
    });

    // ── PASO 5: Procesar respuesta de Hacienda ──
    if (resultado.estado === 'aceptado') {
      await actualizarEstadoDTE(codigoGeneracion, 'aceptado', {
        selloRecepcion: resultado.sello,
        observaciones:  resultado.observaciones,
      }, tenant_id);

      await registrarAuditoria('DTE_ACEPTADO', dteGuardado.id, {
        sello:         resultado.sello?.substring(0, 10) + '...',
        observaciones: resultado.observaciones?.length || 0,
        respuesta_hacienda: respuestaHaciendaAuditable(resultado),
      }, ip, 200, tenant_id);

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
      }, tenant_id);

      await registrarAuditoria('DTE_RECHAZADO', dteGuardado.id, {
        codigo_error: resultado.codigo_error,
        descripcion:  resultado.descripcion,
        respuesta_hacienda: respuestaHaciendaAuditable(resultado),
      }, ip, 422, tenant_id);

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
      await actualizarEstadoDTE(codigoGeneracion, 'contingencia', {}, tenant_id);

      await registrarAuditoria('DTE_CONTINGENCIA', dteGuardado.id, {
        codigo_generacion: codigoGeneracion,
        razon:             resultado.descripcion,
      }, ip, 202, tenant_id);

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
      }, ip, 500, tenant_id);
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
  const { password_pri, idempotency_key, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarFCF,
    datos:       datosDTE,
    passwordPri: password_pri,
    idempotencyKey: idempotency_key || null,
    tenant_id:   datosDTE.tenant_id,
    ip,
  });
};

const emitirCCF = async ({ datos, ip }) => {
  const { password_pri, idempotency_key, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarCCF,
    datos:       datosDTE,
    passwordPri: password_pri,
    idempotencyKey: idempotency_key || null,
    tenant_id:   datosDTE.tenant_id,
    ip,
  });
};

const emitirNotaCredito = async ({ datos, ip }) => {
  const { password_pri, idempotency_key, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarNotaCredito,
    datos:       datosDTE,
    passwordPri: password_pri,
    idempotencyKey: idempotency_key || null,
    tenant_id:   datosDTE.tenant_id,
    ip,
  });
};

const emitirNotaDebito = async ({ datos, ip }) => {
  const { password_pri, idempotency_key, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarNotaDebito,
    datos:       datosDTE,
    passwordPri: password_pri,
    idempotencyKey: idempotency_key || null,
    tenant_id:   datosDTE.tenant_id,
    ip,
  });
};

const emitirFSE = async ({ datos, ip }) => {
  const { password_pri, idempotency_key, ...datosDTE } = datos;
  return emitirDTE({
    generarFn:   generadorService.generarFSE,
    datos:       datosDTE,
    passwordPri: password_pri,
    idempotencyKey: idempotency_key || null,
    tenant_id:   datosDTE.tenant_id,
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

  // Fase 2: la anulación SIEMPRE acotada al tenant autenticado.
  if (!datos.tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para anular un DTE.' };
  }

  const anularParams = [codigo_generacion.toUpperCase(), datos.tenant_id];
  const anularFiltro = ' AND d.tenant_id = $2';

  const { rows } = await query(
    `SELECT d.id, d.tipo_dte, d.codigo_generacion, d.numero_control,
            d.sello_recepcion, d.fecha_emision, d.total_iva,
            d.total, d.estado,
            d.json_dte->>'receptor' as receptor_json
     FROM dtes d
     WHERE d.codigo_generacion = $1${anularFiltro}`,
    anularParams
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
  const { json: jsonInvalidacion, codigoGeneracion: codGenAnulacion, version } =
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

  // Firmar el evento de invalidación — credencial desde proveedor seguro
  const jsonFirmado = await firmadorService.firmarDTE({
    jsonDte:    jsonInvalidacion,
    passwordPri: password_pri,
    tenant_id:   datos.tenant_id,
  });

  // Transmitir a Hacienda
  const resultado = await haciendaService.anularDTE({
    documentoFirmado: jsonFirmado,
     version,
    tenant_id:        datos.tenant_id,
  });

  if (resultado.estado === 'PROCESADO') {
    // Actualizar estado del DTE original a anulado — acotado al tenant
    await query(
      `UPDATE dtes SET estado = 'anulado'
       WHERE codigo_generacion = $1 AND tenant_id = $2`,
      [codigo_generacion.toUpperCase(), datos.tenant_id]
    );

    await registrarAuditoria('DTE_ANULADO', dte.id, {
      codigo_generacion_anulacion: codGenAnulacion,
      motivo_tipo:                 datosAnulacion.motivo_tipo,
      motivo:                      datosAnulacion.motivo_descripcion,
    }, ip, 200, datos.tenant_id);

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
const listarDTEs = async ({ filtros = {}, establecimientoId, tenant_id }) => {
  const { tipo_dte, estado, fecha_desde, fecha_hasta, pagina = 1, limite = 20 } = filtros;

  // Fase 2: el tenant es obligatorio — las consultas sin tenant fallan.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para listar DTEs.' };
  }

  const condiciones = ['d.tenant_id = $1'];
  const valores     = [tenant_id];
  let idx = 2;

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
const obtenerDTE = async ({ codigoGeneracion, establecimientoId, tenant_id }) => {
  // Fase 2: el tenant es obligatorio — no existe consulta global.
  if (!tenant_id) {
    throw { status: 400, mensaje: 'Tenant autenticado requerido para consultar un DTE.' };
  }

  let filtrosAdicionales = ' AND d.tenant_id = $2';
  const params = [codigoGeneracion.toUpperCase(), tenant_id];

  if (establecimientoId) {
    filtrosAdicionales += ` AND d.establecimiento_id = $${params.length + 1}`;
    params.push(establecimientoId);
  }

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
     ${filtrosAdicionales}`,
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
