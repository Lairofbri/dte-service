// src/modules/generador/generador.utils.js
// Utilidades para construcción del JSON DTE
// Basado en documentación oficial MH, JSONs reales aceptados y catálogos v1.2

const { v4: uuidv4 } = require('uuid');
const { query }      = require('../../config/database');

// ─────────────────────────────────────────────
// CATÁLOGOS OFICIALES
// ─────────────────────────────────────────────
const TIPOS_DTE = {
  '01': { nombre: 'Factura',                       version: 1 },
  '03': { nombre: 'Comprobante de Crédito Fiscal', version: 3 },
  '05': { nombre: 'Nota de Crédito',               version: 3 },
  '06': { nombre: 'Nota de Débito',                version: 3 },
  '11': { nombre: 'Factura de Exportación',        version: 1 },
  '14': { nombre: 'Factura de Sujeto Excluido',    version: 1 },
};

const FORMAS_PAGO = {
  '01': 'Billetes y monedas',
  '02': 'Tarjeta Débito',
  '03': 'Tarjeta Crédito',
  '04': 'Cheque',
  '05': 'Transferencia-Depósito Bancario',
  '08': 'Dinero electrónico',
  '09': 'Monedero electrónico',
  '11': 'Bitcoin',
  '12': 'Otras Criptomonedas',
  '99': 'Otros',
};

const TIPO_DOC_RECEPTOR = {
  '36': 'NIT',
  '13': 'DUI',
  '37': 'Otro',
  '03': 'Pasaporte',
  '02': 'Carnet de Residente',
};

const CAMPOS_RAIZ_NULL = {
  documentoRelacionado: null,
  ventaTercero:         null,
  otrosDocumentos:      null,
  apendice:             null,
};

// ─────────────────────────────────────────────
// FUNCIONES DE FORMATO
// ─────────────────────────────────────────────

const generarCodigoGeneracion = () => uuidv4().toUpperCase();

const formatearNIT = (nit) => {
  if (!nit) return null;
  return nit.replace(/-/g, '');
};

const formatearNRC = (nrc) => {
  if (!nrc) return null;
  return nrc.replace(/-/g, '');
};

const formatearTelefono = (tel) => {
  if (!tel) return null;
  return tel.replace(/-/g, '').replace(/\s/g, '');
};

const getFechaHoraEmision = () => {
  const ahora    = new Date();
  const offsetMs = -6 * 60 * 60 * 1000;
  const sv       = new Date(ahora.getTime() + offsetMs).toISOString();
  return {
    fecEmi: sv.split('T')[0],
    horEmi: sv.split('T')[1].split('.')[0],
  };
};

const redondear2 = (num) => Math.round(num * 100) / 100;

const numeroALetras = (monto) => {
  if (isNaN(monto) || monto < 0) return 'CERO 00/100 DÓLARES';

  const entero   = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);

  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas  = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const veintis  = ['', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO',
    'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];

  const menorMil = (n) => {
    if (n === 0)   return '';
    if (n === 100) return 'CIEN';
    if (n < 20)    return unidades[n];
    if (n >= 21 && n <= 29) return veintis[n - 20];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c    = Math.floor(n / 100);
    const rest = n % 100;
    const cent = (c === 1 && rest > 0) ? 'CIENTO' : centenas[c];
    return rest === 0 ? cent : `${cent} ${menorMil(rest)}`;
  };

  const convertir = (n) => {
    if (n === 0) return 'CERO';
    if (n < 1000) return menorMil(n);
    if (n < 1000000) {
      const miles = Math.floor(n / 1000);
      const rest  = n % 1000;
      const pref  = miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`;
      return rest === 0 ? pref : `${pref} ${menorMil(rest)}`;
    }
    const mill = Math.floor(n / 1000000);
    const rest = n % 1000000;
    const pref = mill === 1 ? 'UN MILLÓN' : `${menorMil(mill)} MILLONES`;
    return rest === 0 ? pref : `${pref} ${convertir(rest)}`;
  };

  const letras = convertir(entero);
  const cents  = `${centavos.toString().padStart(2, '0')}/100`;
  return `${letras} ${cents} DÓLARES`;
};

// ─────────────────────────────────────────────
// CORRELATIVO CON LOCK
// ─────────────────────────────────────────────

const obtenerSiguienteCorrelativo = async (
  client, tipoDte, ambiente, establecimientoId, codEstableMH, codPuntoVentaMH
) => {
  // Intentar obtener o crear el correlativo para este establecimiento
  const { rows: lockRows } = await client.query(
    `SELECT id FROM correlativos
     WHERE tipo_dte = $1 AND ambiente = $2 AND establecimiento_id = $3
     FOR UPDATE`,
    [tipoDte, ambiente, establecimientoId]
  );

  if (lockRows.length === 0) {
    await client.query(
      `INSERT INTO correlativos (tipo_dte, ambiente, establecimiento_id, ultimo_numero)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT DO NOTHING`,
      [tipoDte, ambiente, establecimientoId]
    );
  }

  const { rows } = await client.query(
    `UPDATE correlativos
     SET ultimo_numero  = ultimo_numero + 1,
         actualizado_en = NOW()
     WHERE tipo_dte = $1 AND ambiente = $2 AND establecimiento_id = $3
     RETURNING ultimo_numero`,
    [tipoDte, ambiente, establecimientoId]
  );

  const correlativo   = rows[0].ultimo_numero;
  const correlatStr   = correlativo.toString().padStart(15, '0');
  const numeroControl = `DTE-${tipoDte}-${codEstableMH}${codPuntoVentaMH}-${correlatStr}`;

  return { numeroControl, correlativo };
};

// ─────────────────────────────────────────────
// SECCIÓN: IDENTIFICACIÓN
// ─────────────────────────────────────────────
const construirIdentificacion = ({
  tipoDte, numeroControl, codigoGeneracion, ambiente,
  esContingencia = false, tipoContingencia = null, motivoContingencia = null,
}) => {
  const { fecEmi, horEmi } = getFechaHoraEmision();
  return {
    version:          TIPOS_DTE[tipoDte].version,
    ambiente,
    tipoDte,
    numeroControl,
    codigoGeneracion,
    tipoModelo:       esContingencia ? 2 : 1,
    tipoOperacion:    esContingencia ? 2 : 1,
    tipoContingencia: esContingencia ? (tipoContingencia || 5) : null,
    motivoContin:     esContingencia ? (motivoContingencia || null) : null,
    fecEmi,
    horEmi,
    tipoMoneda:       'USD',
  };
};

// ─────────────────────────────────────────────
// SECCIÓN: EMISOR
// Códigos MH vienen del establecimiento del usuario
// ─────────────────────────────────────────────
const construirEmisor = (config, establecimiento) => ({
  nit:                 formatearNIT(config.nit),
  nrc:                 formatearNRC(config.nrc),
  nombre:              config.nombre,
  codActividad:        config.codigo_actividad,
  descActividad:       config.desc_actividad   || '',
  nombreComercial:     config.nombre_comercial  || null,
  tipoEstablecimiento: establecimiento.tipo_establecimiento || '02',
  direccion: {
    departamento: establecimiento.departamento_cod || '06',
    municipio:    establecimiento.municipio_cod    || '20',
    complemento:  establecimiento.direccion        || config.direccion,
  },
  telefono:        formatearTelefono(establecimiento.telefono || config.telefono) || '00000000',
  correo:          establecimiento.correo || config.correo || config.email || '',
  codEstableMH:    establecimiento.cod_estable_mh,
  codEstable:      establecimiento.cod_estable      || null,
  codPuntoVentaMH: establecimiento.cod_punto_venta_mh,
  codPuntoVenta:   establecimiento.cod_punto_venta   || null,
});

// ─────────────────────────────────────────────
// SECCIÓN: RECEPTOR
// ─────────────────────────────────────────────

// FCF: tipoDocumento + numDocumento (estructura diferente)
const construirReceptorFCF = (receptor) => ({
  tipoDocumento: receptor.tipo_documento || '13',
  numDocumento:  receptor.num_documento  || null,
  nrc:           null,
  nombre:        receptor.nombre         || null,
  codActividad:  null,
  descActividad: null,
  direccion:     null,
  telefono:      null,
  correo:        null,
});

// CCF: nit/nrc con datos completos del receptor empresa
const construirReceptorCCF = (receptor) => ({
  nit:            formatearNIT(receptor.nit),
  nrc:            formatearNRC(receptor.nrc) || null,
  nombre:         receptor.nombre,
  codActividad:   receptor.cod_actividad    || null,
  descActividad:  receptor.desc_actividad   || null,
  nombreComercial: receptor.nombre_comercial || null,
  direccion:      receptor.departamento_cod ? {
    departamento: receptor.departamento_cod,
    municipio:    receptor.municipio_cod || '20',
    complemento:  receptor.direccion    || '',
  } : null,
  telefono: formatearTelefono(receptor.telefono) || null,
  correo:   receptor.correo || null,
});

// FSE: NIT obligatorio, estructura similar a FCF con tipoDocumento
const construirReceptorFSE = (receptor) => ({
  tipoDocumento: '36',
  numDocumento:  formatearNIT(receptor.nit),
  nombre:        receptor.nombre,
  codActividad:  receptor.cod_actividad  || null,
  descActividad: receptor.desc_actividad || null,
  direccion:     receptor.departamento_cod ? {
    departamento: receptor.departamento_cod,
    municipio:    receptor.municipio_cod || '20',
    complemento:  receptor.direccion    || '',
  } : null,
  telefono: formatearTelefono(receptor.telefono) || null,
  correo:   receptor.correo || null,
});

// ─────────────────────────────────────────────
// SECCIÓN: CUERPO DOCUMENTO
// ─────────────────────────────────────────────
const construirItem = (item, numItem, tipoDte) => {
  const cantidad  = Number(item.cantidad)        || 0;
  const precioUni = Number(item.precio_unitario) || 0;
  const descuento = Number(item.descuento)       || 0;

  const subtotalBruto = (cantidad * precioUni) - descuento;
  let   ventaGravada  = 0;
  let   ivaItem       = null;

  if (tipoDte === '14') {
    ventaGravada = redondear2(subtotalBruto);
  } else if (tipoDte === '03') {
    ventaGravada = redondear2(subtotalBruto);
  } else {
    // FCF: precio incluye IVA
    ventaGravada = redondear2(subtotalBruto / 1.13);
    ivaItem      = redondear2(subtotalBruto - ventaGravada);
  }

  const base = {
    numItem:         numItem,
    tipoItem:        item.tipo_item  || 2,
    numeroDocumento: null,
    codigo:          item.codigo     || null,
    codTributo:      null,
    descripcion:     item.descripcion,
    cantidad:        cantidad,
    uniMedida:       item.uni_medida || 59,
    precioUni:       precioUni,
    montoDescu:      descuento,
    ventaNoSuj:      0.0,
    ventaExenta:     0.0,
    ventaGravada:    ventaGravada,
    // tributos: null en FCF y FSE, ['20'] solo en CCF
    tributos:        tipoDte === '03' ? ['20'] : null,
    psv:             0.0,
    noGravado:       0.0,
  };

  if (tipoDte === '01' && ivaItem !== null) {
    base.ivaItem = ivaItem;
  }

  return base;
};

// ─────────────────────────────────────────────
// SECCIÓN: RESUMEN
// ─────────────────────────────────────────────
const construirResumen = (items, tipoDte, condicionOperacion = 1, pagos = null) => {
  let totalNoSuj   = 0;
  let totalExenta  = 0;
  let totalGravada = 0;
  let totalDescu   = 0;

  for (const item of items) {
    totalNoSuj   += item.ventaNoSuj   || 0;
    totalExenta  += item.ventaExenta  || 0;
    totalGravada += item.ventaGravada || 0;
    totalDescu   += item.montoDescu   || 0;
  }

  totalGravada         = redondear2(totalGravada);
  totalDescu           = redondear2(totalDescu);
  const subTotalVentas = redondear2(totalNoSuj + totalExenta + totalGravada);
  const subTotal       = redondear2(subTotalVentas - totalDescu);

  let ivaValor = 0;
  if (tipoDte === '03') {
    ivaValor = redondear2(totalGravada * 0.13);
  } else if (tipoDte === '01') {
    ivaValor = redondear2(totalGravada - (totalGravada / 1.13));
  }

  // CCF: precio sin IVA → montoTotal = subTotal + IVA
  // FCF: precio con IVA → montoTotal = subTotal (IVA ya incluido)
  // FSE: sin IVA → montoTotal = subTotal
  const montoTotalOperacion = tipoDte === '03'
    ? redondear2(subTotal + ivaValor)
    : redondear2(subTotal);
  const totalPagar = montoTotalOperacion;

  const tributos = (tipoDte !== '14' && ivaValor > 0) ? [
    { codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: ivaValor },
  ] : null;

  const pagosFinales = pagos || [
    { codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null },
  ];

  const resumen = {
    totalNoSuj:         redondear2(totalNoSuj),
    totalExenta:        redondear2(totalExenta),
    totalGravada,
    subTotalVentas,
    descuNoSuj:         0.0,
    descuExenta:        0.0,
    descuGravada:       totalDescu,
    porcentajeDescuento: 0.0,
    totalDescu,
    tributos,
    subTotal,
    ivaPerci1:          0.0,
    ivaRete1:           0.0,
    reteRenta:          0.0,
    montoTotalOperacion,
    totalNoGravado:     0.0,
    totalPagar,
    totalLetras:        numeroALetras(totalPagar),
    saldoFavor:         0.0,
    condicionOperacion,
    pagos:              pagosFinales,
    numPagoElectronico: null,
  };

  if (tipoDte === '01') {
    resumen.totalIva = ivaValor;
  }

  return resumen;
};

const construirExtension = (datos = null) => {
  if (!datos) return null;
  return {
    nombEntrega:   datos.nomb_entrega   || null,
    docuEntrega:   datos.docu_entrega   || null,
    nombRecibe:    datos.nomb_recibe    || null,
    docuRecibe:    datos.docu_recibe    || null,
    observaciones: datos.observaciones  || null,
    placaVehiculo: datos.placa_vehiculo || null,
  };
};

module.exports = {
  TIPOS_DTE,
  FORMAS_PAGO,
  TIPO_DOC_RECEPTOR,
  CAMPOS_RAIZ_NULL,
  generarCodigoGeneracion,
  formatearNIT,
  formatearNRC,
  formatearTelefono,
  getFechaHoraEmision,
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
};
