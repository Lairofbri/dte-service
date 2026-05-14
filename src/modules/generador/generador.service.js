// src/modules/generador/generador.service.js
// Construye el JSON de cada tipo de DTE según esquemas oficiales Hacienda
// Actualizado para cumplir con JSONs reales aceptados y catálogos v1.2

const { getClient }         = require('../../config/database');
const configuracionService  = require('../configuracion/configuracion.service');
const logger                = require('../../utils/logger');
const {
  TIPOS_DTE,
  CAMPOS_RAIZ_NULL,
  generarCodigoGeneracion,
  formatearNIT,
  redondear2,
  numeroALetras,
  obtenerSiguienteCorrelativo,
  construirIdentificacion,
  construirEmisor,
  construirReceptorFCF,
  construirReceptorCCF,
  construirReceptorFSE,
  construirItem,
  construirResumen,
  construirExtension,
} = require('./generador.utils');

// ─────────────────────────────────────────────
// HELPER: obtener config + establecimiento del usuario
// El establecimiento del usuario determina los códigos MH del emisor
// ─────────────────────────────────────────────
const obtenerConfigYEstablecimiento = async (establecimientoId) => {
  const config = await configuracionService.obtenerConfiguracion();
  if (!establecimientoId) {
    throw { status: 400, mensaje: 'Se requiere el establecimiento del usuario para emitir DTEs.' };
  }

  const { query } = require('../../config/database');
  const { rows } = await query(
    `SELECT id, nombre, cod_estable_mh, cod_estable, cod_punto_venta_mh, cod_punto_venta,
            tipo_establecimiento, departamento_cod, municipio_cod, direccion, telefono, correo
     FROM establecimientos
     WHERE id = $1 AND activo = true`,
    [establecimientoId]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Establecimiento no encontrado o inactivo.' };
  }

  return { config, establecimiento: rows[0] };
};

// ─────────────────────────────────────────────
// HELPER: construir pagos
// ─────────────────────────────────────────────
const construirPagos = (metodoPago, montoEfectivo, montoTarjeta, totalPagar) => {
  if (metodoPago === 'tarjeta') {
    return [{ codigo: '03', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
  }
  if (metodoPago === 'mixto') {
    const pagos = [];
    if (Number(montoEfectivo) > 0) pagos.push({ codigo: '01', montoPago: redondear2(montoEfectivo), referencia: null, plazo: null, periodo: null });
    if (Number(montoTarjeta) > 0)  pagos.push({ codigo: '03', montoPago: redondear2(montoTarjeta),  referencia: null, plazo: null, periodo: null });
    return pagos.length > 0 ? pagos : [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
  }
  // default: efectivo
  return [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
};

// ═════════════════════════════════════════════
// GENERADORES
// ═════════════════════════════════════════════

/**
 * Factura Consumidor Final (FCF - DTE-01)
 * Receptor: tipoDocumento + numDocumento (NO nit separado)
 * Items: precio con IVA incluido, ivaItem desglosado
 * Resumen: totalIva incluido
 */
const generarFCF = async (datos) => {
  const { config, establecimiento } = await obtenerConfigYEstablecimiento(datos.establecimiento_id);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client, '01', config.ambiente,
      establecimiento.id,
      establecimiento.cod_estable_mh,
      establecimiento.cod_punto_venta_mh
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const tipoDte          = '01';

    // Construir ítems
    const cuerpoDocumento = (datos.items || []).map((item, idx) =>
      construirItem(item, idx + 1, tipoDte)
    );

    // Condición de operación y pagos
    const condicion = datos.condicion_operacion || 1;
    const pagos     = datos.pagos || construirPagos(
      datos.metodo_pago, datos.monto_efectivo || 0, datos.monto_tarjeta || 0, 0
    );

    // Resumen
    const resumen = construirResumen(cuerpoDocumento, tipoDte, condicion, null);

    // Actualizar montoPago con el total real
    if (pagos.length > 0 && !datos.pagos) {
      pagos[0].montoPago = resumen.totalPagar;
    }
    resumen.pagos = pagos;

    // Validación: monto >= $1,095 requiere datos del receptor
    if (resumen.montoTotalOperacion >= 1095 && !datos.receptor?.nombre) {
      throw {
        status:  400,
        mensaje: `Para ventas >= $1,095.00 se requiere el nombre del receptor. Total: $${resumen.montoTotalOperacion}`,
      };
    }

    // Receptor — puede ser null para montos menores
    const receptor = datos.receptor ? construirReceptorFCF(datos.receptor) : null;

    const json = {
      identificacion: construirIdentificacion({
        tipoDte, numeroControl, codigoGeneracion, ambiente: config.ambiente,
        esContingencia:    datos.es_contingencia    || false,
        tipoContingencia:  datos.tipo_contingencia  || null,
        motivoContingencia: datos.motivo_contingencia || null,
      }),
      ...CAMPOS_RAIZ_NULL,
      emisor:   construirEmisor(config, establecimiento),
      receptor,
      cuerpoDocumento,
      resumen,
      extension: construirExtension(datos.extension || null),
    };

    await client.query('COMMIT');

    logger.info('JSON FCF generado', { numeroControl, codigoGeneracion, total: resumen.totalPagar, correlativo });

    return { json, codigoGeneracion, numeroControl, tipoDte, version: TIPOS_DTE[tipoDte].version };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Comprobante de Crédito Fiscal (CCF - DTE-03)
 * Receptor: nit/nrc con datos completos
 * Items: precio sin IVA, IVA calculado en resumen
 */
const generarCCF = async (datos) => {
  if (!datos.receptor?.nit) {
    throw { status: 400, mensaje: 'El CCF requiere el NIT del receptor.' };
  }

  const { config, establecimiento } = await obtenerConfigYEstablecimiento(datos.establecimiento_id);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client, '03', config.ambiente,
      establecimiento.id,
      establecimiento.cod_estable_mh,
      establecimiento.cod_punto_venta_mh
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const tipoDte          = '03';

    const cuerpoDocumento = (datos.items || []).map((item, idx) =>
      construirItem(item, idx + 1, tipoDte)
    );

    const condicion = datos.condicion_operacion || 1;
    const resumen   = construirResumen(cuerpoDocumento, tipoDte, condicion, datos.pagos || null);

    // Pagos default para CCF
    if (!datos.pagos) {
      resumen.pagos = construirPagos(
        datos.metodo_pago, datos.monto_efectivo || 0, datos.monto_tarjeta || 0, resumen.totalPagar
      );
    }

    const json = {
      identificacion: construirIdentificacion({
        tipoDte, numeroControl, codigoGeneracion, ambiente: config.ambiente,
        esContingencia:    datos.es_contingencia    || false,
        tipoContingencia:  datos.tipo_contingencia  || null,
        motivoContingencia: datos.motivo_contingencia || null,
      }),
      ...CAMPOS_RAIZ_NULL,
      emisor:          construirEmisor(config, establecimiento),
      receptor:        construirReceptorCCF(datos.receptor),
      cuerpoDocumento,
      resumen,
      extension: construirExtension(datos.extension || null),
    };

    await client.query('COMMIT');

    logger.info('JSON CCF generado', { numeroControl, codigoGeneracion, total: resumen.totalPagar, correlativo });

    return { json, codigoGeneracion, numeroControl, tipoDte, version: TIPOS_DTE[tipoDte].version };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Factura Sujeto Excluido (FSE - DTE-14)
 * Sin IVA — para compras a personas naturales no inscritas
 */
const generarFSE = async (datos) => {
  if (!datos.receptor?.nit) {
    throw { status: 400, mensaje: 'La FSE requiere el NIT del receptor.' };
  }

  const { config, establecimiento } = await obtenerConfigYEstablecimiento(datos.establecimiento_id);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client, '14', config.ambiente,
      establecimiento.id,
      establecimiento.cod_estable_mh,
      establecimiento.cod_punto_venta_mh
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const tipoDte          = '14';

    const cuerpoDocumento = (datos.items || []).map((item, idx) =>
      construirItem(item, idx + 1, tipoDte)
    );

    const condicion = datos.condicion_operacion || 1;
    const resumen   = construirResumen(cuerpoDocumento, tipoDte, condicion, datos.pagos || null);

    if (!datos.pagos) {
      resumen.pagos = construirPagos(
        datos.metodo_pago, datos.monto_efectivo || 0, datos.monto_tarjeta || 0, resumen.totalPagar
      );
    }

    const json = {
      identificacion: construirIdentificacion({
        tipoDte, numeroControl, codigoGeneracion, ambiente: config.ambiente,
      }),
      ...CAMPOS_RAIZ_NULL,
      emisor:          construirEmisor(config, establecimiento),
      receptor:        construirReceptorFSE(datos.receptor),
      cuerpoDocumento,
      resumen,
      extension: construirExtension(datos.extension || null),
    };

    await client.query('COMMIT');

    logger.info('JSON FSE generado', { numeroControl, codigoGeneracion, total: resumen.totalPagar, correlativo });

    return { json, codigoGeneracion, numeroControl, tipoDte, version: TIPOS_DTE[tipoDte].version };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de Invalidación/Anulación
 * El establecimiento viene del DTE a anular
 */
const generarInvalidacion = async (datos) => {
  if (!datos.codigo_generacion_a_anular) {
    throw { status: 400, mensaje: 'Se requiere el código de generación del DTE a anular.' };
  }
  if (!datos.motivo_tipo || !datos.motivo_descripcion) {
    throw { status: 400, mensaje: 'Se requiere el motivo de invalidación.' };
  }

  const config           = await configuracionService.obtenerConfiguracion();
  const codigoGeneracion = generarCodigoGeneracion();
  const { getFechaHoraEmision } = require('./generador.utils');
  const { fecEmi: fecAnula, horEmi: horAnula } = getFechaHoraEmision();

  // Obtener el establecimiento del DTE a anular
  const { query } = require('../../config/database');
  let establecimiento = null;
  try {
    const { rows } = await query(
      `SELECT e.cod_estable_mh, e.cod_estable, e.cod_punto_venta_mh, e.cod_punto_venta,
              e.tipo_establecimiento, e.telefono, e.correo
       FROM dtes d
       JOIN establecimientos e ON e.id = d.establecimiento_id
       WHERE d.codigo_generacion = $1`,
      [datos.codigo_generacion_a_anular.toUpperCase()]
    );
    if (rows.length > 0) establecimiento = rows[0];
  } catch (_) {}

  const json = {
    identificacion: {
      version:          2,
      ambiente:         config.ambiente,
      codigoGeneracion: codigoGeneracion,
      fecAnula,
      horAnula,
    },
    emisor: {
      nit:                 formatearNIT(config.nit),
      nombre:              config.nombre,
      tipoEstablecimiento: establecimiento?.tipo_establecimiento || config.tipo_establecimiento || '02',
      telefono:            establecimiento?.telefono || config.telefono || '00000000',
      correo:              establecimiento?.correo   || config.correo || config.email || '',
      codEstableMH:        establecimiento?.cod_estable_mh      || config.codigo_establecimiento || '0001',
      codEstable:          establecimiento?.cod_estable          || null,
      codPuntoVentaMH:     establecimiento?.cod_punto_venta_mh   || config.codigo_punto_venta    || '0001',
      codPuntoVenta:       establecimiento?.cod_punto_venta       || null,
      nomEstablecimiento:  config.nombre_comercial || config.nombre,
    },
    documento: {
      tipoDte:           datos.tipo_dte,
      codigoGeneracion:  datos.codigo_generacion_a_anular.toUpperCase(),
      selloRecibido:     datos.sello_recepcion,
      numeroControl:     datos.numero_control,
      fecEmi:            typeof datos.fecha_emision === 'object'
        ? datos.fecha_emision.toISOString().split('T')[0]
        : datos.fecha_emision,
      montoIva:          redondear2(datos.monto_iva || 0),
      codigoGeneracionR: null,
      tipoDocumento:     null,
      numDocumento:      null,
      nombre:            datos.receptor_nombre || null,
    },
    motivo: {
      tipoAnulacion:     datos.motivo_tipo,
      motivoAnulacion:   datos.motivo_descripcion,
      nombreResponsable: datos.nombre_responsable   || config.nombre,
      tipDocResponsable: datos.tipo_doc_responsable || '13',
      numDocResponsable: datos.num_doc_responsable  || '',
      nombreSolicita:    datos.nombre_solicita      || null,
      tipDocSolicita:    datos.tipo_doc_solicita    || null,
      numDocSolicita:    datos.num_doc_solicita     || null,
    },
  };

  logger.info('JSON Invalidación generado', {
    codigoGeneracion,
    dte_a_anular: datos.codigo_generacion_a_anular,
    motivo:       datos.motivo_tipo,
  });

  return { json, codigoGeneracion, tipoDte: 'anulacion', version: 2 };
};

module.exports = {
  generarFCF,
  generarCCF,
  generarFSE,
  generarInvalidacion,
  TIPOS_DTE,
};
