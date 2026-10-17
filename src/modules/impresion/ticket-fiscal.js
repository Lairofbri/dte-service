// src/modules/impresion/ticket-fiscal.js
// Plantilla térmica del comprobante fiscal a partir del DTE ya emitido.
//
// Reglas (verificar.txt §6 y §8):
//   · Los datos fiscales salen **exclusivamente** del DTE (`json_dte`) y de los
//     campos de la fila (`numero_control`, `sello_recepcion`, `qr_url`, `ambiente`).
//   · **No se recalculan** impuestos ni totales: se imprimen los del `resumen`.
//   · **No se imprimen campos vacíos** ni marcadores de ejemplo: lo que falta, se omite.
//   · El QR y el sello solo aparecen cuando el DTE los aporta (aceptado).
//   · Nunca se presenta el documento como aceptado sin que el estado lo confirme
//     (de eso se encarga el controlador con 409).

const TITULOS = {
  '01': 'FACTURA CONSUMIDOR FINAL',
  '03': 'COMPROBANTE DE CREDITO FISCAL',
  '04': 'NOTA DE REMISION',
  '05': 'NOTA DE CREDITO',
  '06': 'NOTA DE DEBITO',
  '07': 'COMPROBANTE DE RETENCION',
  '11': 'FACTURA DE EXPORTACION',
  '14': 'FACTURA DE SUJETO EXCLUIDO',
};

const CONDICIONES = { 1: 'Contado', 2: 'Credito', 3: 'Otro' };

const PAGOS = {
  '01': 'Efectivo', '02': 'Tarjeta debito', '03': 'Tarjeta credito',
  '04': 'Cheque', '05': 'Transferencia', '08': 'Dinero electronico',
  '09': 'Monedero electronico', '11': 'Bitcoin', '12': 'Otras criptomonedas',
  '13': 'Cuentas por pagar', '14': 'Giro bancario', '99': 'Otro',
};

/** Ancho por defecto (papel de 80 mm). */
const ANCHO_POR_DEFECTO = 42;

/** 58 mm -> 32 caracteres; si el agente informa los caracteres, esos mandan. */
const resolverAncho = (papelMm, caracteresXLinea) => {
  const caracteres = Number(caracteresXLinea);
  if (Number.isFinite(caracteres) && caracteres > 0) return Math.trunc(caracteres);
  return Number(papelMm) === 58 ? 32 : ANCHO_POR_DEFECTO;
};

const CENTRO = (texto, ancho) => {
  const valor = String(texto);
  if (valor.length >= ancho) return valor.slice(0, ancho);
  return ' '.repeat(Math.floor((ancho - valor.length) / 2)) + valor;
};

const DERECHA = (texto, ancho) => {
  const valor = String(texto);
  if (valor.length >= ancho) return valor.slice(0, ancho);
  return ' '.repeat(ancho - valor.length) + valor;
};

const LINEA = (ancho) => '─'.repeat(ancho);

const moneda = (n) => `$${Number(n || 0).toFixed(2)}`;

/** Corta por ancho exacto (para códigos y URLs). */
const envolver = (texto, ancho) => {
  const valor = String(texto ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!valor) return [];
  const lineas = [];
  for (let inicio = 0; inicio < valor.length; inicio += ancho) {
    lineas.push(valor.slice(inicio, inicio + ancho));
  }
  return lineas;
};

/** Envuelve respetando palabras (y parte las que no entran). */
const envolverPalabras = (texto, ancho) => {
  const valor = String(texto ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!valor) return [];
  const lineas = [];
  let actual = '';
  for (const palabra of valor.split(/\s+/)) {
    let resto = palabra;
    while (resto.length > ancho) {
      if (actual) { lineas.push(actual); actual = ''; }
      lineas.push(resto.slice(0, ancho));
      resto = resto.slice(ancho);
    }
    const candidato = actual ? `${actual} ${resto}` : resto;
    if (candidato.length <= ancho) actual = candidato;
    else { lineas.push(actual); actual = resto; }
  }
  if (actual) lineas.push(actual);
  return lineas;
};

/** Fila « Etiqueta ....... $monto » que nunca excede el ancho. */
const filaMonto = (etiqueta, monto, ancho, anchoMonto = 16) => {
  const anchoValor = Math.min(anchoMonto, Math.max(8, ancho - etiqueta.length - 1));
  const relleno = ' '.repeat(Math.max(1, ancho - etiqueta.length - anchoValor));
  return `${etiqueta}${relleno}${DERECHA(moneda(monto), anchoValor)}`;
};

/** Dirección fiscal del DTE (complemento + municipio + departamento). */
const direccionDte = (direccion, ancho) => {
  if (!direccion) return [];
  return envolver([
    direccion.complemento,
    direccion.municipio && `Municipio: ${direccion.municipio}`,
    direccion.departamento && `Depto: ${direccion.departamento}`,
  ].filter(Boolean).join(' | '), ancho);
};

const columnasItems = (ancho) => {
  const anchoDesc = Math.max(8, ancho - 24);
  return {
    anchoDesc,
    encabezado: ` Cant ${'Descripcion'.slice(0, anchoDesc).padEnd(anchoDesc)} ${'P.Unit'.padStart(8)} ${'Total'.padStart(8)}`,
    fila: (cantidad, descripcion, precio, total) =>
      ` ${String(cantidad).padStart(4)} ${String(descripcion).slice(0, anchoDesc).padEnd(anchoDesc)} ${DERECHA(precio, 8)} ${DERECHA(total, 8)}`,
    detalle: (texto) => `       ${String(texto).slice(0, Math.max(4, ancho - 7))}`,
  };
};

/** Ítem con su importe: fiscal (gravada/exenta/no sujeta) o FSE (`compra`). */
const importeItem = (item) => {
  const descuento = Number(item.montoDescu ?? item.descuento ?? 0);
  const base = Number(item.ventaNoSuj || 0) + Number(item.ventaExenta || 0)
    + Number(item.ventaGravada || 0) + Number(item.compra || 0) + Number(item.psv || 0);
  if (base > 0) return base - descuento;
  const cantidad = Number(item.cantidad || 0);
  const precio = Number(item.precioUni ?? item.precio_unitario ?? 0);
  return cantidad * precio - descuento;
};

/**
 * Texto completo del comprobante fiscal (el QR va aparte, como comando nativo).
 * @param {{ dte: object, ancho?: number, papelMm?: number, caracteresXLinea?: number }} opciones
 * @returns {string}
 */
const formatoTicketFiscal = ({ dte, ancho, papelMm, caracteresXLinea } = {}) => {
  const ANCHO = ancho ?? resolverAncho(papelMm, caracteresXLinea);
  const l = [];
  if (!dte) return '';

  const json = dte.json_dte || dte.jsonDte || {};
  const identificacion = json.identificacion || {};
  const emisor = json.emisor || {};
  const receptor = json.receptor || {};
  const resumen = json.resumen || {};
  const esFse = (identificacion.tipoDte || dte.tipo_dte) === '14';
  const tipoDte = identificacion.tipoDte || dte.tipo_dte || '01';
  const items = Array.isArray(json.cuerpoDocumento) ? json.cuerpoDocumento : [];
  const columnas = columnasItems(ANCHO);

  // ── Encabezado del emisor (nombre legal y comercial por separado) ──────────
  l.push('');
  if (emisor.nombre) l.push(CENTRO(emisor.nombre, ANCHO));
  if (emisor.nombreComercial && emisor.nombreComercial !== emisor.nombre) {
    l.push(CENTRO(emisor.nombreComercial, ANCHO));
  }
  for (const linea of direccionDte(emisor.direccion, ANCHO)) l.push(CENTRO(linea, ANCHO));
  if (emisor.telefono) l.push(CENTRO(`Tel: ${emisor.telefono}`, ANCHO));
  if (emisor.correo) l.push(CENTRO(emisor.correo, ANCHO));
  if (emisor.nit) l.push(CENTRO(`NIT: ${emisor.nit}`, ANCHO));
  if (emisor.nrc) l.push(CENTRO(`NRC: ${emisor.nrc}`, ANCHO));

  // ── Identificación del documento ───────────────────────────────────────────
  l.push('');
  l.push(CENTRO('DOCUMENTO TRIBUTARIO ELECTRONICO', ANCHO));
  l.push(CENTRO(TITULOS[tipoDte] || 'COMPROBANTE TRIBUTARIO', ANCHO));
  l.push('');
  if (identificacion.version) l.push(`Version: ${identificacion.version}`);
  const ambiente = identificacion.ambiente || dte.ambiente;
  if (ambiente) l.push(`Ambiente: ${ambiente === '01' ? 'Produccion' : 'Pruebas'}`);

  const numeroControl = identificacion.numeroControl || dte.numero_control;
  if (numeroControl) {
    l.push('No. Control:');
    l.push(...envolver(numeroControl, ANCHO));
  }
  const codigoGeneracion = identificacion.codigoGeneracion || dte.codigo_generacion;
  if (codigoGeneracion) {
    l.push('Codigo Generacion:');
    l.push(...envolver(codigoGeneracion, ANCHO));
  }
  const fecha = identificacion.fecEmi || dte.fecha_emision;
  const hora = identificacion.horEmi || dte.hora_emision;
  if (fecha) l.push(`Fecha: ${fecha}`);
  if (hora) l.push(`Hora: ${hora}`);

  // ── Receptor ───────────────────────────────────────────────────────────────
  l.push('');
  l.push('RECEPTOR');
  if (receptor.nombre) l.push(...envolverPalabras(`Nombre: ${receptor.nombre}`, ANCHO));
  const docReceptor = receptor.nit || receptor.numDocumento;
  const tipoDoc = receptor.tipoDocumento;
  if (docReceptor || tipoDoc) {
    l.push(...envolver(`Documento: ${tipoDoc || ''} ${docReceptor || ''}`.trim(), ANCHO));
  }
  if (receptor.nrc) l.push(...envolver(`NRC: ${receptor.nrc}`, ANCHO));
  for (const linea of direccionDte(receptor.direccion, ANCHO)) l.push(linea);
  if (receptor.telefono) l.push(...envolver(`Tel: ${receptor.telefono}`, ANCHO));
  if (receptor.correo) l.push(...envolver(`Correo: ${receptor.correo}`, ANCHO));

  // ── Detalle ────────────────────────────────────────────────────────────────
  l.push('');
  l.push(LINEA(ANCHO));
  l.push(columnas.encabezado);
  l.push(LINEA(ANCHO));

  const totalItems = items.reduce((suma, item) => suma + importeItem(item), 0);

  for (const item of items) {
    const nombre = item.descripcion || item.nombre_producto || '';
    const precio = Number(item.precioUni ?? item.precio_unitario ?? 0);
    const descripcion = envolverPalabras(nombre, columnas.anchoDesc);
    l.push(columnas.fila(
      Number(item.cantidad || 0),
      descripcion.shift() ?? '',
      moneda(precio),
      moneda(importeItem(item)),
    ));
    for (const linea of descripcion) l.push(columnas.detalle(linea));
    const descuento = Number(item.montoDescu ?? item.descuento ?? 0);
    if (descuento > 0) l.push(columnas.detalle(`Descuento: ${moneda(descuento)}`));
    if (item.ivaItem) l.push(columnas.detalle(`IVA: ${moneda(item.ivaItem)}`));
  }

  l.push(LINEA(ANCHO));

  // ── Totales: se imprimen los del DTE, nunca recalculados ───────────────────
  if (esFse) {
    l.push(filaMonto(' Total compra:', Number(resumen.totalCompra ?? totalItems), ANCHO));
    if (Number(resumen.totalDescu || 0) > 0) l.push(filaMonto(' Descuento:', Number(resumen.totalDescu), ANCHO));
    if (Number(resumen.subTotal || 0) > 0) l.push(filaMonto(' Subtotal:', Number(resumen.subTotal), ANCHO));
    if (Number(resumen.reteRenta || 0) > 0) l.push(filaMonto(' Retencion renta:', Number(resumen.reteRenta), ANCHO));
    l.push(filaMonto(' TOTAL A PAGAR:', Number(resumen.totalPagar ?? totalItems), ANCHO));
  } else {
    if (Number(resumen.totalNoSuj || 0) > 0) l.push(filaMonto(' No sujeto:', Number(resumen.totalNoSuj), ANCHO));
    if (Number(resumen.totalExenta || 0) > 0) l.push(filaMonto(' Exenta:', Number(resumen.totalExenta), ANCHO));
    if (Number(resumen.totalGravada || 0) > 0) l.push(filaMonto(' Gravada:', Number(resumen.totalGravada), ANCHO));
    if (Number(resumen.totalDescu || 0) > 0) l.push(filaMonto(' Descuento:', Number(resumen.totalDescu), ANCHO));
    if (Number(resumen.subTotal || 0) > 0) l.push(filaMonto(' Subtotal:', Number(resumen.subTotal), ANCHO));
    for (const tributo of Array.isArray(resumen.tributos) ? resumen.tributos : []) {
      l.push(...envolver(`${tributo.descripcion || 'Tributo'}: ${moneda(tributo.valor)}`, ANCHO));
    }
    if (Number(resumen.ivaRete || 0) > 0) l.push(filaMonto(' Retencion IVA:', Number(resumen.ivaRete), ANCHO));
    if (Number(resumen.ivaPerci || 0) > 0) l.push(filaMonto(' Percepcion IVA:', Number(resumen.ivaPerci), ANCHO));
    const totalOperacion = Number(resumen.montoTotalOperacion ?? resumen.totalPagar ?? 0);
    l.push(filaMonto(' TOTAL OPERACION:', totalOperacion, ANCHO));
    if (Number(resumen.totalPagar ?? totalOperacion) !== totalOperacion) {
      l.push(filaMonto(' TOTAL A PAGAR:', Number(resumen.totalPagar), ANCHO));
    }
  }

  if (resumen.totalLetras) l.push(...envolverPalabras(`Son: ${resumen.totalLetras}`, ANCHO));

  // ── Condición y pagos (información comercial del DTE) ──────────────────────
  if (resumen.condicionOperacion) {
    l.push('');
    l.push(`Condicion: ${CONDICIONES[Number(resumen.condicionOperacion)] || 'Contado'}`);
  }
  for (const pago of Array.isArray(resumen.pagos) ? resumen.pagos : []) {
    const etiqueta = PAGOS[String(pago.codigo)] || 'Pago';
    l.push(filaMonto(` ${etiqueta}:`, Number(pago.montoPago || 0), ANCHO));
  }
  if (resumen.observaciones) {
    l.push(...envolverPalabras(`Obs: ${resumen.observaciones}`, ANCHO));
  }

  // ── Sello y QR (solo si el DTE los aporta) ─────────────────────────────────
  const sello = dte.sello_recepcion || dte.selloRecepcion;
  const qrUrl = dte.qr_url || dte.qrUrl;

  l.push('');
  if (sello) {
    l.push(CENTRO('SELLO DE RECEPCION HACIENDA', ANCHO));
    l.push(...envolver(sello, ANCHO));
    l.push('');
  }
  if (qrUrl) {
    l.push(CENTRO('QR DE CONSULTA HACIENDA', ANCHO));
    l.push(CENTRO('Escanee el codigo QR', ANCHO));
    l.push('');
  }
  l.push(CENTRO('¡Gracias por su visita!', ANCHO));
  l.push('');
  l.push(LINEA(ANCHO));
  l.push('');

  return l.join('\n');
};

module.exports = {
  ANCHO_POR_DEFECTO,
  TITULOS,
  resolverAncho,
  formatoTicketFiscal,
};
