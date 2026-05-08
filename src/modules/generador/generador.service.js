// src/modules/generador/generador.service.js
// Construye el JSON de cada tipo de DTE según los esquemas oficiales
// de Hacienda El Salvador
//
// IMPORTANTE: Este módulo NO firma ni transmite — solo construye el JSON
// El JSON generado debe pasar por el firmador antes de ir a Hacienda

const { getClient } = require('../../config/database');
const configuracionService = require('../configuracion/configuracion.service');
const logger = require('../../utils/logger');
const {
  TIPOS_DTE,
  FORMAS_PAGO,
  generarCodigoGeneracion,
  formatearNIT,
  formatearNRC,
  redondear8,
  redondear2,
  numeroALetras,
  obtenerSiguienteCorrelativo,
  construirIdentificacion,
  construirEmisor,
  calcularResumen,
} = require('./generador.utils');

// ─────────────────────────────────────────────
// HELPER: construir pagos desde método de pago del POS
// ─────────────────────────────────────────────

/**
 * Convierte el método de pago del POS al formato de pagos del DTE
 * @param {string} metodoPago — efectivo | tarjeta | mixto
 * @param {number} montoEfectivo
 * @param {number} montoTarjeta
 * @param {number} totalPagar
 */
const construirPagos = (metodoPago, montoEfectivo, montoTarjeta, totalPagar) => {
  if (metodoPago === 'efectivo') {
    return [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
  }
  if (metodoPago === 'tarjeta') {
    return [{ codigo: '03', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
  }
  if (metodoPago === 'mixto') {
    const pagos = [];
    if (montoEfectivo > 0) {
      pagos.push({ codigo: '01', montoPago: redondear2(montoEfectivo), referencia: null, plazo: null, periodo: null });
    }
    if (montoTarjeta > 0) {
      pagos.push({ codigo: '03', montoPago: redondear2(montoTarjeta), referencia: null, plazo: null, periodo: null });
    }
    return pagos;
  }
  return [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }];
};

/**
 * Construye los items del cuerpoDocumento para FCF y CCF
 * Los precios del POS incluyen IVA — hay que desglosarlo para el DTE
 */
const construirCuerpoDocumento = (items, tipoDte) => {
  return items.map((item, idx) => {
    const precioConIva  = redondear8(item.precio_unitario);
    const descuentoItem = redondear8(item.descuento || 0);

    // Para FCF (01): precio incluye IVA, ventaGravada = precio - descuento
    // Para CCF (03): precio sin IVA, IVA se calcula en resumen
    // DESPUÉS — FCF con IVA incluido, CCF sin IVA
    const montoBase    = redondear8(precioConIva * item.cantidad);
    const montoConDesc = redondear8(montoBase - descuentoItem);

// FCF (01): precio incluye IVA — ventaGravada con IVA
// CCF (03), NC (05), ND (06): precio sin IVA — Hacienda calcula el IVA en el resumen
    const ventaGravada = tipoDte === '01'
    ? montoConDesc
    : redondear8(montoConDesc / 1.13);

    return {
      numItem:         idx + 1,
      tipoItem:        2, // 2 = Servicio (restaurantes)
      numeroDocumento: null,
      codigo:          item.codigo || null,
      codTributo:      null,
      descripcion:     item.nombre_producto || item.descripcion,
      cantidad:        redondear8(item.cantidad),
      uniMedida:       59, // 59 = Unidad
      precioUni:       precioConIva,
      montoDescu:      descuentoItem,
      ventaNoSuj:      0,
      ventaExenta:     0,
      ventaGravada,
      tributos:        ventaGravada > 0 ? ['20'] : null, // 20 = IVA
      psv:             0,
      noGravado:       0,
      ivaItem: tipoDte === '01'
                ? redondear8(montoConDesc - (montoConDesc / 1.13))
                : 0,
    };
  });
};

// ═════════════════════════════════════════════
// GENERADORES POR TIPO DE DTE
// ═════════════════════════════════════════════

/**
 * Genera el JSON de una Factura Consumidor Final (FCF - 01)
 * Basado en el esquema fe-fc-v1.json
 *
 * @param {object} datos
 * @param {Array}  datos.items        — items de la orden
 * @param {object} datos.receptor     — datos del receptor (opcional para montos < $1,095)
 * @param {string} datos.metodoPago   — efectivo | tarjeta | mixto
 * @param {number} datos.montoEfectivo
 * @param {number} datos.montoTarjeta
 * @param {number} datos.porcentajeDescuento
 * @param {string} datos.ordenReferencia — ID de la orden en el POS
 * @param {boolean} datos.esContingencia
 */
const generarFCF = async (datos) => {
  const config = await configuracionService.obtenerConfiguracion();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client,
      '01',
      config.ambiente,
      config.codigo_establecimiento || '0001'
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const cuerpoDocumento  = construirCuerpoDocumento(datos.items, '01');
    const resumenCalc      = calcularResumen(cuerpoDocumento, datos.porcentajeDescuento || 0);
    const pagos            = construirPagos(
      datos.metodoPago,
      datos.montoEfectivo || 0,
      datos.montoTarjeta  || 0,
      resumenCalc.totalPagar
    );

    // Receptor — requerido si monto >= $1,095 según esquema
    let receptor = null;
    if (datos.receptor || resumenCalc.montoTotalOperacion >= 1095) {
      receptor = {
        tipoDocumento:  datos.receptor?.tipo_documento || null,
        numDocumento:   datos.receptor?.numero_documento || null,
        nrc:            null,
        nombre:         datos.receptor?.nombre || datos.receptor?.razon_social || null,
        codActividad:   null,
        descActividad:  null,
        direccion:      datos.receptor?.departamento_cod ? {
          departamento: datos.receptor.departamento_cod,
          municipio:    datos.receptor.municipio_cod,
          complemento:  datos.receptor.direccion,
        } : null,
        telefono:       datos.receptor?.telefono || null,
        correo:         datos.receptor?.email    || null,
      };
    }

    const json = {
      identificacion:    construirIdentificacion({
        tipoDte:           '01',
        numeroControl,
        codigoGeneracion,
        ambiente:          config.ambiente,
        esContingencia:    datos.esContingencia || false,
        tipoContingencia:  datos.tipoContingencia || null,
        motivoContingencia: datos.motivoContingencia || null,
      }),
      documentoRelacionado: null,
      emisor:            construirEmisor(config),
      receptor,
      otrosDocumentos:   null,
      ventaTercero:      null,
      cuerpoDocumento,
      resumen: {
        ...resumenCalc,
        tributos:       resumenCalc.totalGravada > 0
          ? [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: resumenCalc.totalIva }]
          : null,
        totalLetras:    numeroALetras(resumenCalc.totalPagar),
        condicionOperacion: 1, // 1 = Contado
        pagos,
        numPagoElectronico: null,
      },
      extension:  null,
      apendice:   null,
    };

    await client.query('COMMIT');

    logger.info('JSON FCF generado', {
      numero_control:    numeroControl,
      codigo_generacion: codigoGeneracion,
      total:             resumenCalc.totalPagar,
      correlativo,
    });

    return { json, codigoGeneracion, numeroControl, tipoDte: '01', version: 1 };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de un Comprobante de Crédito Fiscal (CCF - 03)
 * Basado en el esquema fe-ccf-v3.json
 * Requiere datos completos del receptor (NIT, NRC, razón social, etc.)
 */
const generarCCF = async (datos) => {
  if (!datos.receptor?.nit) {
    throw { status: 400, mensaje: 'El CCF requiere el NIT del receptor.' };
  }
  if (!datos.receptor?.nrc) {
    throw { status: 400, mensaje: 'El CCF requiere el NRC del receptor.' };
  }

  const config = await configuracionService.obtenerConfiguracion();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client,
      '03',
      config.ambiente,
      config.codigo_establecimiento || '0001'
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const cuerpoDocumento  = construirCuerpoDocumento(datos.items, '03');
    const resumenCalc      = calcularResumen(cuerpoDocumento, datos.porcentajeDescuento || 0);
    const pagos            = construirPagos(
      datos.metodoPago,
      datos.montoEfectivo || 0,
      datos.montoTarjeta  || 0,
      resumenCalc.totalPagar
    );

    // Receptor CCF — todos los campos son requeridos
    const receptor = {
      nit:            formatearNIT(datos.receptor.nit),
      nrc:            formatearNRC(datos.receptor.nrc),
      nombre:         datos.receptor.nombre || datos.receptor.razon_social,
      codActividad:   datos.receptor.codigo_actividad || null,
      descActividad:  datos.receptor.desc_actividad   || null,
      nombreComercial: datos.receptor.nombre_comercial || null,
      direccion:      datos.receptor.departamento_cod ? {
        departamento: datos.receptor.departamento_cod,
        municipio:    datos.receptor.municipio_cod,
        complemento:  datos.receptor.direccion,
      } : null,
      telefono:       datos.receptor.telefono || null,
      correo:         datos.receptor.email    || null,
    };

    const json = {
      identificacion:    construirIdentificacion({
        tipoDte:           '03',
        numeroControl,
        codigoGeneracion,
        ambiente:          config.ambiente,
        esContingencia:    datos.esContingencia || false,
        tipoContingencia:  datos.tipoContingencia || null,
        motivoContingencia: datos.motivoContingencia || null,
      }),
      documentoRelacionado: null,
      emisor:            construirEmisor(config),
      receptor,
      ventaTercero:      null,
      cuerpoDocumento,
      resumen: {
        ...resumenCalc,
        ivaPerci1:      0, // IVA percibido — 0 para restaurantes normales
        tributos:       resumenCalc.totalGravada > 0
          ? [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: resumenCalc.totalIva }]
          : null,
        totalLetras:    numeroALetras(resumenCalc.totalPagar),
        condicionOperacion: 1,
        pagos,
        numPagoElectronico: null,
      },
      extension:  null,
      apendice:   null,
    };

    await client.query('COMMIT');

    logger.info('JSON CCF generado', {
      numero_control:    numeroControl,
      codigo_generacion: codigoGeneracion,
      receptor_nit:      receptor.nit,
      total:             resumenCalc.totalPagar,
    });

    return { json, codigoGeneracion, numeroControl, tipoDte: '03', version: 3 };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de una Nota de Crédito (NC - 05)
 * Basado en el esquema fe-nc-v3.json
 * Requiere documentoRelacionado — el DTE original que se está corrigiendo
 */
const generarNotaCredito = async (datos) => {
  if (!datos.documento_relacionado?.codigo_generacion) {
    throw { status: 400, mensaje: 'La Nota de Crédito requiere el documento relacionado.' };
  }

  const config = await configuracionService.obtenerConfiguracion();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl, correlativo } = await obtenerSiguienteCorrelativo(
      client, '05', config.ambiente, config.codigo_establecimiento || '0001'
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const cuerpoDocumento  = construirCuerpoDocumento(datos.items, '05');
    const resumenCalc      = calcularResumen(cuerpoDocumento, 0);

    const receptor = {
      nit:            formatearNIT(datos.receptor?.nit),
      nrc:            formatearNRC(datos.receptor?.nrc),
      nombre:         datos.receptor?.nombre || datos.receptor?.razon_social,
      codActividad:   datos.receptor?.codigo_actividad || null,
      descActividad:  datos.receptor?.desc_actividad   || null,
      nombreComercial: datos.receptor?.nombre_comercial || null,
      direccion:      datos.receptor?.departamento_cod ? {
        departamento: datos.receptor.departamento_cod,
        municipio:    datos.receptor.municipio_cod,
        complemento:  datos.receptor.direccion,
      } : null,
      telefono:       datos.receptor?.telefono || null,
      correo:         datos.receptor?.email    || null,
    };

    const json = {
      identificacion: construirIdentificacion({
        tipoDte: '05', numeroControl, codigoGeneracion, ambiente: config.ambiente,
      }),
      documentoRelacionado: [{
        tipoDocumento:   datos.documento_relacionado.tipo_dte || '01',
        tipoGeneracion:  2, // 2 = electrónico
        numeroDocumento: datos.documento_relacionado.codigo_generacion.toUpperCase(),
        fechaEmision:    datos.documento_relacionado.fecha_emision,
      }],
      emisor:   construirEmisor(config),
      receptor,
      ventaTercero: null,
      cuerpoDocumento,
      resumen: {
        ...resumenCalc,
        ivaPerci1:  0,
        ivaRete1:   0,
        reteRenta:  0,
        tributos:   resumenCalc.totalGravada > 0
          ? [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: resumenCalc.totalIva }]
          : null,
        totalLetras: numeroALetras(resumenCalc.totalPagar),
        condicionOperacion: 1,
      },
      extension: null,
      apendice:  null,
    };

    await client.query('COMMIT');

    logger.info('JSON Nota de Crédito generado', {
      numero_control: numeroControl,
      codigo_generacion: codigoGeneracion,
      doc_relacionado: datos.documento_relacionado.codigo_generacion,
    });

    return { json, codigoGeneracion, numeroControl, tipoDte: '05', version: 3 };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de una Nota de Débito (ND - 06)
 * Basado en el esquema fe-nd-v3.json
 * Similar a la Nota de Crédito pero aumenta el monto
 */
const generarNotaDebito = async (datos) => {
  if (!datos.documento_relacionado?.codigo_generacion) {
    throw { status: 400, mensaje: 'La Nota de Débito requiere el documento relacionado.' };
  }

  const config = await configuracionService.obtenerConfiguracion();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl } = await obtenerSiguienteCorrelativo(
      client, '06', config.ambiente, config.codigo_establecimiento || '0001'
    );

    const codigoGeneracion = generarCodigoGeneracion();
    const cuerpoDocumento  = construirCuerpoDocumento(datos.items, '06');
    const resumenCalc      = calcularResumen(cuerpoDocumento, 0);

    const receptor = {
      nit:            formatearNIT(datos.receptor?.nit),
      nrc:            formatearNRC(datos.receptor?.nrc),
      nombre:         datos.receptor?.nombre || datos.receptor?.razon_social,
      codActividad:   datos.receptor?.codigo_actividad || null,
      descActividad:  datos.receptor?.desc_actividad   || null,
      nombreComercial: datos.receptor?.nombre_comercial || null,
      direccion:      datos.receptor?.departamento_cod ? {
        departamento: datos.receptor.departamento_cod,
        municipio:    datos.receptor.municipio_cod,
        complemento:  datos.receptor.direccion,
      } : null,
      telefono:       datos.receptor?.telefono || null,
      correo:         datos.receptor?.email    || null,
    };

    const json = {
      identificacion: construirIdentificacion({
        tipoDte: '06', numeroControl, codigoGeneracion, ambiente: config.ambiente,
      }),
      documentoRelacionado: [{
        tipoDocumento:   datos.documento_relacionado.tipo_dte || '01',
        tipoGeneracion:  2,
        numeroDocumento: datos.documento_relacionado.codigo_generacion.toUpperCase(),
        fechaEmision:    datos.documento_relacionado.fecha_emision,
      }],
      emisor:   construirEmisor(config),
      receptor,
      ventaTercero: null,
      cuerpoDocumento,
      resumen: {
        ...resumenCalc,
        ivaPerci1:  0,
        ivaRete1:   0,
        reteRenta:  0,
        tributos:   resumenCalc.totalGravada > 0
          ? [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: resumenCalc.totalIva }]
          : null,
        totalLetras: numeroALetras(resumenCalc.totalPagar),
        condicionOperacion: 1,
      },
      extension: null,
      apendice:  null,
    };

    await client.query('COMMIT');

    logger.info('JSON Nota de Débito generado', {
      numero_control: numeroControl,
      codigo_generacion: codigoGeneracion,
    });

    return { json, codigoGeneracion, numeroControl, tipoDte: '06', version: 3 };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de una Factura de Sujeto Excluido (FSE - 14)
 * Basado en el esquema fe-fse-v1.json
 * Para compras a personas naturales no inscritas en el IVA
 */
const generarFSE = async (datos) => {
  if (!datos.sujeto_excluido?.nombre) {
    throw { status: 400, mensaje: 'La FSE requiere los datos del sujeto excluido.' };
  }

  const config = await configuracionService.obtenerConfiguracion();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { numeroControl } = await obtenerSiguienteCorrelativo(
      client, '14', config.ambiente, config.codigo_establecimiento || '0001'
    );

    const codigoGeneracion = generarCodigoGeneracion();

    // FSE tiene su propio formato de cuerpoDocumento
    const cuerpoDocumento = datos.items.map((item, idx) => ({
      numItem:     idx + 1,
      tipoItem:    2,
      cantidad:    redondear8(item.cantidad),
      codigo:      item.codigo || null,
      uniMedida:   59,
      descripcion: item.nombre_producto || item.descripcion,
      precioUni:   redondear8(item.precio_unitario),
      montoDescu:  redondear8(item.descuento || 0),
      compra:      redondear8((item.precio_unitario * item.cantidad) - (item.descuento || 0)),
    }));

    // totalCompra = suma de compra (ya tiene descuentos aplicados por item)
    // subTotal    = totalCompra (no descontar de nuevo)
    // totalDescu  = suma de descuentos (solo para reportarlo en el resumen)
    const totalDescu  = redondear2(cuerpoDocumento.reduce((s, i) => s + i.montoDescu, 0));
    const totalCompra = redondear2(cuerpoDocumento.reduce((s, i) => s + i.compra, 0));
    const totalPagar  = subTotal;
    const subTotal    = totalCompra; // ya tiene los descuentos aplicados

    const pagos = construirPagos(
      datos.metodoPago, datos.montoEfectivo || 0, datos.montoTarjeta || 0, totalPagar
    );

    const json = {
      identificacion: construirIdentificacion({
        tipoDte: '14', numeroControl, codigoGeneracion, ambiente: config.ambiente,
      }),
      emisor: construirEmisor(config),
      sujetoExcluido: {
        tipoDocumento:  datos.sujeto_excluido.tipo_documento || '13',
        numDocumento:   datos.sujeto_excluido.numero_documento,
        nombre:         datos.sujeto_excluido.nombre,
        codActividad:   datos.sujeto_excluido.codigo_actividad || null,
        descActividad:  datos.sujeto_excluido.desc_actividad   || null,
        direccion:      datos.sujeto_excluido.departamento_cod ? {
          departamento: datos.sujeto_excluido.departamento_cod,
          municipio:    datos.sujeto_excluido.municipio_cod,
          complemento:  datos.sujeto_excluido.direccion,
        } : null,
        telefono:       datos.sujeto_excluido.telefono || null,
        correo:         datos.sujeto_excluido.email    || null,
      },
      cuerpoDocumento,
      resumen: {
        totalCompra,
        descu:        totalDescu,
        totalDescu,
        subTotal,
        ivaRete1:     0,
        reteRenta:    0,
        totalPagar,
        totalLetras:  numeroALetras(totalPagar),
        condicionOperacion: 1,
        pagos,
        observaciones: datos.observaciones || null,
      },
      apendice: null,
    };

    await client.query('COMMIT');

    logger.info('JSON FSE generado', {
      numero_control: numeroControl,
      codigo_generacion: codigoGeneracion,
      sujeto: datos.sujeto_excluido.nombre,
    });

    return { json, codigoGeneracion, numeroControl, tipoDte: '14', version: 1 };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Genera el JSON de Invalidación/Anulación de un DTE
 * Basado en el esquema anulacion-schema-v2.json
 */
const generarInvalidacion = async (datos) => {
  if (!datos.codigo_generacion_a_anular) {
    throw { status: 400, mensaje: 'Se requiere el código de generación del DTE a anular.' };
  }
  if (!datos.motivo_tipo || !datos.motivo_descripcion) {
    throw { status: 400, mensaje: 'Se requiere el motivo de invalidación.' };
  }

  const config = await configuracionService.obtenerConfiguracion();
  const codigoGeneracion = generarCodigoGeneracion();

  const json = {
    identificacion: {
      version:          2,
      ambiente:         config.ambiente,
      codigoGeneracion: codigoGeneracion,
      fecAnula:         new Date().toISOString().split('T')[0],
      horAnula:         new Date().toTimeString().split(' ')[0],
    },
    emisor: {
      nit:    formatearNIT(config.nit),
      nombre: config.nombre,
      tipoEstablecimiento: config.tipo_establecimiento || '02',
      telefono: config.telefono || '00000000',
      correo:   config.email    || 'sin@correo.com',
      codEstableMH:    config.codigo_establecimiento || '0001',
      codEstable:      config.codigo_establecimiento || '0001',
      codPuntoVentaMH: config.codigo_punto_venta    || '0001',
      codPuntoVenta:   config.codigo_punto_venta    || '0001',
      nomEstablecimiento: config.nombre_comercial || config.nombre,
    },
    documento: {
      tipoDte:          datos.tipo_dte,
      codigoGeneracion: datos.codigo_generacion_a_anular.toUpperCase(),
      selloRecibido:    datos.sello_recepcion,
      numeroControl:    datos.numero_control,
      fecEmi:           datos.fecha_emision,
      montoIva:         redondear2(datos.monto_iva || 0),
      codigoGeneracionR: null,
      tipoDocumento:    null,
      numDocumento:     null,
      nombre:           datos.receptor_nombre || null,
    },
    motivo: {
      tipoAnulacion:   datos.motivo_tipo,
      motivoAnulacion: datos.motivo_descripcion,
      nombreResponsable: datos.nombre_responsable || config.nombre,
      tipDocResponsable: datos.tipo_doc_responsable || '13',
      numDocResponsable: datos.num_doc_responsable  || '',
      nombreSolicita:    datos.nombre_solicita      || null,
      tipDocSolicita:    datos.tipo_doc_solicita    || null,
      numDocSolicita:    datos.num_doc_solicita     || null,
    },
  };

  logger.info('JSON de Invalidación generado', {
    codigo_generacion: codigoGeneracion,
    dte_a_anular:      datos.codigo_generacion_a_anular,
    motivo:            datos.motivo_tipo,
  });

  return { json, codigoGeneracion, tipoDte: 'anulacion', version: 2 };
};

module.exports = {
  generarFCF,
  generarCCF,
  generarNotaCredito,
  generarNotaDebito,
  generarFSE,
  generarInvalidacion,
  TIPOS_DTE,
};
