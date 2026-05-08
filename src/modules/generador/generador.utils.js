// src/modules/generador/generador.utils.js
// Utilidades compartidas para todos los generadores de DTE
// Basado en los esquemas JSON oficiales del Ministerio de Hacienda

const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('../../config/database');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────
// CATÁLOGOS — Basados en los esquemas oficiales
// ─────────────────────────────────────────────

// Tipos de DTE y sus versiones según los esquemas oficiales
const TIPOS_DTE = {
  '01': { nombre: 'Factura',                              version: 1, schema: 'fe-fc-v1'  },
  '03': { nombre: 'Comprobante de Crédito Fiscal',        version: 3, schema: 'fe-ccf-v3' },
  '04': { nombre: 'Nota de Remisión',                     version: 3, schema: 'fe-nr-v3'  },
  '05': { nombre: 'Nota de Crédito',                      version: 3, schema: 'fe-nc-v3'  },
  '06': { nombre: 'Nota de Débito',                       version: 3, schema: 'fe-nd-v3'  },
  '07': { nombre: 'Comprobante de Retención',             version: 1, schema: 'fe-cr-v1'  },
  '08': { nombre: 'Comprobante de Liquidación',           version: 1, schema: 'fe-cl-v1'  },
  '09': { nombre: 'Documento Contable de Liquidación',    version: 1, schema: 'fe-dcl-v1' },
  '11': { nombre: 'Factura de Exportación',               version: 1, schema: 'fe-fex-v1' },
  '14': { nombre: 'Factura de Sujeto Excluido',           version: 1, schema: 'fe-fse-v1' },
  '15': { nombre: 'Comprobante de Donación',              version: 1, schema: 'fe-cd-v1'  },
};

// Códigos de forma de pago según catálogo Hacienda
const FORMAS_PAGO = {
  '01': 'Billetes y monedas',
  '02': 'Tarjeta Débito',
  '03': 'Tarjeta Crédito',
  '04': 'Cheque',
  '05': 'Transferencia- Depósito Bancario',
  '06': 'Vales de Tarjeta de Combustible',
  '07': 'Dinero electrónico',
  '08': 'Tarjeta de Prepago',
  '09': 'Pago por aplicación',
  '10': 'Bitcoin',
  '11': 'Monedero electrónico',
  '12': 'Otros',
  '13': 'Plataforma de pago digital',
  '14': 'Criptomonedas',
  '99': 'Otros',
};

// Unidades de medida más comunes en restaurantes
// Catálogo completo disponible en Hacienda
const UNIDADES_MEDIDA = {
  59:  'Unidad',
  70:  'Actividad',
  99:  'Otro',
};

// ─────────────────────────────────────────────
// FUNCIONES DE FORMATO
// ─────────────────────────────────────────────

/**
 * Genera un UUID v4 en MAYÚSCULAS
 * Los esquemas exigen: ^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$
 */
const generarCodigoGeneracion = () => uuidv4().toUpperCase();

/**
 * Formatea NIT eliminando guiones para el JSON DTE
 * El esquema exige: ^([0-9]{14}|[0-9]{9})$
 * Ej: "0614-010190-101-2" → "06140101901012"
 */
const formatearNIT = (nit) => {
  if (!nit) return null;
  return nit.replace(/-/g, '');
};

/**
 * Formatea NRC eliminando guiones para el JSON DTE
 * El esquema exige: ^[0-9]{1,8}$
 * Ej: "123456-7" → "1234567"
 */
const formatearNRC = (nrc) => {
  if (!nrc) return null;
  return nrc.replace(/-/g, '');
};

/**
 * Obtiene la fecha y hora actual en zona horaria de El Salvador (UTC-6)
 * Usa UNA SOLA instancia de Date para garantizar consistencia
 * entre fecEmi y horEmi — evita inconsistencias en cambios de día
 */
const getFechaHoraEmision = () => {
  const ahora    = new Date();
  const offsetMs = -6 * 60 * 60 * 1000; // UTC-6 El Salvador (sin horario de verano)
  const sv       = new Date(ahora.getTime() + offsetMs).toISOString();
  return {
    fecEmi: sv.split('T')[0],
    horEmi: sv.split('T')[1].split('.')[0],
  };
};

/**
 * Obtiene solo la fecha en formato YYYY-MM-DD (zona horaria El Salvador)
 * Mantenido por compatibilidad — preferir getFechaHoraEmision()
 */
const getFechaEmision = () => getFechaHoraEmision().fecEmi;

/**
 * Obtiene solo la hora en formato HH:mm:ss (zona horaria El Salvador)
 * Mantenido por compatibilidad — preferir getFechaHoraEmision()
 */
const getHoraEmision = () => getFechaHoraEmision().horEmi;

/**
 * Redondea un número a 8 decimales (precisión de los esquemas)
 */
const redondear8 = (num) => Math.round(num * 100000000) / 100000000;

/**
 * Redondea un número a 2 decimales (para totales del resumen)
 */
const redondear2 = (num) => Math.round(num * 100) / 100;

/**
 * Convierte un monto numérico a letras en español
 * Requerido por el campo totalLetras en el resumen
 */
const numeroALetras = (monto) => {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);

  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  // Números 21-29 en español son palabras compuestas — requerido para documentos fiscales
  const veintiunos = [
    '', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO',
    'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
  ];

  const convertirMenorMil = (n) => {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    if (n < 20) return unidades[n];
    // Caso especial: 21-29 son palabras compuestas en español
    if (n >= 21 && n <= 29) return veintiunos[n - 20];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const centena = c === 1 && resto > 0 ? 'CIENTO' : centenas[c];
    return resto === 0 ? centena : `${centena} ${convertirMenorMil(resto)}`;
  };

  const convertir = (n) => {
    if (n === 0) return 'CERO';
    if (n < 1000) return convertirMenorMil(n);
    if (n < 1000000) {
      const miles = Math.floor(n / 1000);
      const resto = n % 1000;
      const prefijo = miles === 1 ? 'MIL' : `${convertirMenorMil(miles)} MIL`;
      return resto === 0 ? prefijo : `${prefijo} ${convertirMenorMil(resto)}`;
    }
    const millones = Math.floor(n / 1000000);
    const resto = n % 1000000;
    const prefijo = millones === 1 ? 'UN MILLÓN' : `${convertirMenorMil(millones)} MILLONES`;
    return resto === 0 ? prefijo : `${prefijo} ${convertir(resto)}`;
  };

  const letrasEntero = convertir(entero);
  const letrasCentavos = centavos > 0
    ? ` CON ${centavos.toString().padStart(2, '0')}/100`
    : ' 00/100';

  return `${letrasEntero}${letrasCentavos} DÓLARES`;
};

// ─────────────────────────────────────────────
// CORRELATIVOS — Con LOCK para evitar duplicados
// ─────────────────────────────────────────────

/**
 * Obtener y actualizar el siguiente correlativo para un tipo de DTE
 * Usa LOCK exclusivo para evitar duplicados en concurrencia
 * El número de control tiene formato: DTE-{tipoDte}-{establecimiento}-{correlativo15digitos}
 *
 * @param {object} client — cliente de BD en transacción activa
 * @param {string} tipoDte — tipo de DTE (01, 03, etc.)
 * @param {string} ambiente — ambiente (00 o 01)
 * @param {string} codigoEstablecimiento — 4 dígitos del establecimiento
 * @returns {{ numeroControl: string, correlativo: number }}
 */
const obtenerSiguienteCorrelativo = async (client, tipoDte, ambiente, codigoEstablecimiento) => {
  // SELECT FOR UPDATE — bloquea solo la fila del tipo de DTE específico
  // Permite que otros tipos de DTE se generen en paralelo sin bloquearse
  const { rows: lockRows } = await client.query(
    `SELECT id FROM correlativos
     WHERE tipo_dte = $1 AND ambiente = $2
     FOR UPDATE`,
    [tipoDte, ambiente]
  );

  if (lockRows.length === 0) {
    throw {
      status: 500,
      mensaje: `No hay correlativo configurado para tipo DTE ${tipoDte} en ambiente ${ambiente}.`,
    };
  }

  const { rows } = await client.query(
    `UPDATE correlativos
     SET ultimo_numero  = ultimo_numero + 1,
         actualizado_en = NOW()
     WHERE tipo_dte = $1 AND ambiente = $2
     RETURNING ultimo_numero`,
    [tipoDte, ambiente]
  );

  const correlativo = rows[0].ultimo_numero;

  // Formato: DTE-01-00000001-000000000000001
  // establ: 8 dígitos, correlativo: 15 dígitos
  const establ        = codigoEstablecimiento.padStart(8, '0');
  const correlatStr   = correlativo.toString().padStart(15, '0');
  const numeroControl = `DTE-${tipoDte}-${establ}-${correlatStr}`;

  return { numeroControl, correlativo };
};

// ─────────────────────────────────────────────
// SECCIONES COMUNES DEL DTE
// ─────────────────────────────────────────────

/**
 * Construye la sección identificacion del DTE
 * Común para todos los tipos de DTE
 */
const construirIdentificacion = ({
  tipoDte,
  numeroControl,
  codigoGeneracion,
  ambiente,
  esContingencia = false,
  tipoContingencia = null,
  motivoContingencia = null,
}) => ({
  version:          TIPOS_DTE[tipoDte].version,
  ambiente,
  tipoDte,
  numeroControl,
  codigoGeneracion,
  tipoModelo:       esContingencia ? 2 : 1,
  tipoOperacion:    esContingencia ? 2 : 1,
  tipoContingencia: esContingencia ? tipoContingencia : null,
  motivoContin:     esContingencia ? motivoContingencia : null,
  ...(() => { const { fecEmi, horEmi } = getFechaHoraEmision(); return { fecEmi, horEmi }; })(),
  tipoMoneda:       'USD',
});

/**
 * Construye la sección emisor del DTE
 * Basada en la configuración del cliente
 */
const construirEmisor = (config) => ({
  nit:                  formatearNIT(config.nit),
  nrc:                  formatearNRC(config.nrc),
  nombre:               config.nombre,
  codActividad:         config.codigo_actividad,
  descActividad:        config.desc_actividad || 'Restaurantes y otros establecimientos de comida',
  nombreComercial:      config.nombre_comercial || null,
  tipoEstablecimiento:  config.tipo_establecimiento || '02',
  direccion: {
    departamento: config.departamento_cod || '06',
    municipio:    config.municipio_cod    || '14',
    complemento:  config.direccion,
  },
  telefono:       config.telefono || '00000000',
  correo:         config.email    || 'sin@correo.com',
  codEstableMH:   config.codigo_establecimiento || '0001',
  codEstable:     config.codigo_establecimiento || '0001',
  codPuntoVentaMH: config.codigo_punto_venta   || '0001',
  codPuntoVenta:   config.codigo_punto_venta   || '0001',
});

/**
 * Calcula los totales del resumen a partir del cuerpo del documento
 * Lógica de IVA El Salvador: precios incluyen IVA 13%
 * gravado = total / 1.13, iva = total - gravado
 *
 * @param {Array} items — array de items del cuerpoDocumento
 * @param {number} porcentajeDescuento — descuento global en porcentaje
 */
const calcularResumen = (items, porcentajeDescuento = 0) => {
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

  const subTotalVentas = redondear2(totalNoSuj + totalExenta + totalGravada);
  const descuGravada   = redondear2(totalGravada * (porcentajeDescuento / 100));
  const descuExenta    = redondear2(totalExenta  * (porcentajeDescuento / 100));
  const descuNoSuj     = redondear2(totalNoSuj   * (porcentajeDescuento / 100));
  const totalDescuReal = redondear2(descuGravada + descuExenta + descuNoSuj + totalDescu);

  const subTotal       = redondear2(subTotalVentas - totalDescuReal);
  const totalGravadaNet = redondear2(totalGravada - descuGravada);

  // IVA 13% — precios incluyen IVA en El Salvador
  const totalIva = redondear2(totalGravadaNet - (totalGravadaNet / 1.13));
  const montoTotalOperacion = redondear2(subTotal);
  const totalPagar          = redondear2(montoTotalOperacion);

  return {
    totalNoSuj:           redondear2(totalNoSuj),
    totalExenta:          redondear2(totalExenta),
    totalGravada:         redondear2(totalGravada),
    subTotalVentas,
    descuNoSuj,
    descuExenta,
    descuGravada,
    porcentajeDescuento:  redondear2(porcentajeDescuento),
    totalDescu:           totalDescuReal,
    subTotal,
    ivaRete1:             0,
    reteRenta:            0,
    montoTotalOperacion,
    totalNoGravado:       0,
    totalPagar,
    totalIva,
    saldoFavor:           0,
  };
};

module.exports = {
  TIPOS_DTE,
  FORMAS_PAGO,
  UNIDADES_MEDIDA,
  generarCodigoGeneracion,
  formatearNIT,
  formatearNRC,
  getFechaHoraEmision,
  getFechaEmision,
  getHoraEmision,
  redondear8,
  redondear2,
  numeroALetras,
  obtenerSiguienteCorrelativo,
  construirIdentificacion,
  construirEmisor,
  calcularResumen,
};
