// tests/unit/ticket-escpos.test.js
// Fase E — comprobante fiscal térmico del DTE Frontend.
//
// Verifica que el ticket se arme **solo con los datos del DTE** (json_dte +
// sello + QR + número de control), que **no recalcule** totales, que no invente
// campos y que el flujo ESC/POS tenga init, QR nativo (`GS ( k`) y corte (`GS V`).

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolverAncho, formatoTicketFiscal } = require('../../src/modules/impresion/ticket-fiscal');
const { renderEscpos, codificarTexto } = require('../../src/modules/impresion/escpos');

const QR_FISCAL = 'https://admin.factura.gob.sv/consultaPublica?ambiente=01&codGen=849F888E-0929-4947-89C3-BB61FDF55BCB&fechaEmi=2026-10-17';

/** DTE de prueba con la forma real de `json_dte` (payload de Hacienda). */
const dteDemo = ({
  tipoDte = '01',
  estado = 'aceptado',
  sello = '2026ABCDEF0123456789',
  qrUrl = QR_FISCAL,
  resumenExtra = {},
  items,
  receptor = { nombre: 'Consumidor Final', tipoDocumento: '36', numDocumento: null },
} = {}) => ({
  tipo_dte: tipoDte,
  estado,
  numero_control: `DTE-01-M001P001-000000000000${tipoDte === '03' ? '2' : '1'}`,
  codigo_generacion: '849F888E-0929-4947-89C3-BB61FDF55BCB',
  sello_recepcion: sello,
  ambiente: '01',
  fecha_emision: '2026-10-17',
  hora_emision: '10:35:00',
  qr_url: qrUrl,
  json_dte: {
    identificacion: {
      version: tipoDte === '03' ? 4 : 2,
      ambiente: '01',
      tipoDte,
      numeroControl: `DTE-01-M001P001-000000000000${tipoDte === '03' ? '2' : '1'}`,
      codigoGeneracion: '849F888E-0929-4947-89C3-BB61FDF55BCB',
      fecEmi: '2026-10-17',
      horEmi: '10:35:00',
    },
    emisor: {
      nombre: 'SERVITEC S.A. DE C.V.',
      nombreComercial: 'Amber Resto',
      nit: '0614-010101-001-5',
      nrc: '123456-7',
      telefono: '2222-3333',
      correo: 'facturacion@servitec.com',
      direccion: { complemento: 'Calle Principal #123', municipio: 'San Salvador', departamento: 'San Salvador' },
    },
    receptor,
    cuerpoDocumento: items || [
      {
        numItem: 1,
        cantidad: 2,
        descripcion: 'Pizza familiar de pepperoni con borde de queso extra y orilla rellena',
        precioUni: 12.5,
        montoDescu: 1.5,
        ventaGravada: 23.5,
      },
      { numItem: 2, cantidad: 1, descripcion: 'Refresco', precioUni: 1.75, montoDescu: 0, ventaGravada: 1.75 },
    ],
    resumen: {
      totalNoSuj: 0,
      totalExenta: 0,
      totalGravada: 25.25,
      totalDescu: 1.5,
      subTotal: 25.25,
      montoTotalOperacion: 28.53,
      totalPagar: 28.53,
      totalLetras: 'VEINTIOCHO 53/100 DOLARES',
      condicionOperacion: 1,
      tributos: [{ codigo: '20', descripcion: 'IVA 13%', valor: 3.28 }],
      pagos: [{ codigo: '01', montoPago: 30, referencia: null }],
      ...resumenExtra,
    },
  },
});

const lineas = (texto) => texto.split('\n');

test('resolverAncho: 80 mm -> 42, 58 mm -> 32 y el agente puede forzar los caracteres', () => {
  assert.equal(resolverAncho(80), 42);
  assert.equal(resolverAncho(58), 32);
  assert.equal(resolverAncho(undefined), 42);
  assert.equal(resolverAncho(58, 40), 40);
});

test('título por tipo de DTE y marca de documento tributario electrónico', () => {
  const esperado = {
    '01': 'FACTURA CONSUMIDOR FINAL',
    '03': 'COMPROBANTE DE CREDITO FISCAL',
    '05': 'NOTA DE CREDITO',
    '06': 'NOTA DE DEBITO',
    '14': 'FACTURA DE SUJETO EXCLUIDO',
  };

  for (const [tipo, titulo] of Object.entries(esperado)) {
    const texto = formatoTicketFiscal({ dte: dteDemo({ tipoDte: tipo }), ancho: 42 });
    assert.ok(texto.includes('DOCUMENTO TRIBUTARIO ELECTRONICO'), `${tipo}: falta la marca de DTE`);
    assert.ok(texto.includes(titulo), `${tipo}: falta el título «${titulo}»`);
  }
});

test('encabezado con datos fiscales del emisor y del receptor, sin marcadores de ejemplo', () => {
  const texto = formatoTicketFiscal({ dte: dteDemo(), ancho: 42 });

  assert.ok(texto.includes('SERVITEC S.A. DE C.V.'));
  assert.ok(texto.includes('Amber Resto'));
  assert.ok(texto.includes('NIT: 0614-010101-001-5'));
  assert.ok(texto.includes('NRC: 123456-7'));
  assert.ok(texto.includes('Calle Principal #123'));
  assert.ok(texto.includes('No. Control:'));
  assert.ok(texto.includes('Codigo Generacion:'));
  assert.ok(texto.includes('849F888E-0929-4947-89C3-BB61FDF55BCB'));
  assert.ok(texto.includes('Fecha: 2026-10-17'));
  assert.ok(texto.includes('Hora: 10:35:00'));
  assert.ok(texto.includes('Nombre: Consumidor Final'));

  // Nada de datos inventados ni marcadores vacíos.
  assert.ok(!texto.includes('N/D'), 'no debe imprimirse N/D');
  assert.ok(!texto.includes('undefined'));
  assert.ok(!texto.includes('null'));
  assert.ok(!/NIT: \s*$/m.test(texto));
});

test('no recalcula: imprime los totales del resumen aunque no coincidan con las líneas', () => {
  const items = [{ cantidad: 1, descripcion: 'Servicio', precioUni: 100, montoDescu: 0, ventaGravada: 100 }];
  const texto = formatoTicketFiscal({
    dte: dteDemo({
      items,
      // El resumen manda: es el DTE firmado, no la aritmética local.
      resumenExtra: { totalGravada: 87, subTotal: 87, montoTotalOperacion: 98.31, totalPagar: 98.31, tributos: [] },
    }),
    ancho: 42,
  });

  const cuerpo = lineas(texto);
  const lineaGravada = cuerpo.find((l) => l.includes('Gravada:'));
  const lineaTotal = cuerpo.find((l) => l.includes('TOTAL OPERACION:'));

  assert.ok(lineaGravada, 'debe imprimir la gravada del resumen');
  assert.ok(lineaGravada.includes('87.00'), 'debe usar la gravada del resumen (87.00)');
  assert.ok(lineaTotal && lineaTotal.includes('98.31'), 'debe usar el total del resumen');

  // Desde los totales hacia abajo no puede aparecer el cálculo local (100.00).
  const totales = cuerpo.slice(cuerpo.indexOf(lineaGravada));
  assert.ok(!totales.some((l) => l.includes('100.00')), 'los totales no salen del cálculo local del ítem');
});

test('descripciones largas se reparten en varias líneas sin perder el importe', () => {
  const texto = formatoTicketFiscal({ dte: dteDemo(), ancho: 42 });
  const cuerpo = lineas(texto);

  const index = cuerpo.findIndex((l) => l.includes('Pizza familiar'));
  assert.ok(index >= 0, 'debe aparecer la descripción');
  assert.ok(cuerpo[index + 1].includes('pepperoni'), 'la descripción debe continuar en la línea siguiente');
  assert.ok(cuerpo[index].includes('$'), 'la primera línea mantiene precio y total');

  for (const linea of cuerpo) {
    assert.ok(linea.length <= 42, `línea demasiado larga (${linea.length}): ${linea}`);
  }

  const enPapelChico = lineas(formatoTicketFiscal({ dte: dteDemo(), ancho: 32 }));
  for (const linea of enPapelChico) {
    assert.ok(linea.length <= 32, `58 mm: línea demasiado larga (${linea.length}): ${linea}`);
  }
});

test('FSE usa su propio resumen (compra/retención) y no inventa IVA', () => {
  const dte = dteDemo({
    tipoDte: '14',
    items: [{ cantidad: 1, descripcion: 'Servicio profesional', compra: 500, montoDescu: 0 }],
    resumenExtra: {
      totalCompra: 500,
      descu: 0,
      totalDescu: 0,
      subTotal: 500,
      reteRenta: 50,
      totalPagar: 450,
      tributos: undefined,
      condicionOperacion: 1,
    },
  });

  const texto = formatoTicketFiscal({ dte, ancho: 42 });

  assert.ok(texto.includes('FACTURA DE SUJETO EXCLUIDO'));
  assert.ok(texto.includes('Total compra:'));
  assert.ok(/\$\s?500\.00/.test(texto));
  assert.ok(texto.includes('Retencion renta:'));
  assert.ok(texto.includes('TOTAL A PAGAR:'));
  assert.ok(/\$\s?450\.00/.test(texto));
  assert.ok(!texto.includes('Gravada:'), 'FSE no imprime gravada/IVA');
});

test('sello y QR solo aparecen cuando el DTE los aporta', () => {
  const conSello = formatoTicketFiscal({ dte: dteDemo(), ancho: 42 });
  assert.ok(conSello.includes('SELLO DE RECEPCION HACIENDA'));
  assert.ok(conSello.includes('2026ABCDEF0123456789'));
  assert.ok(conSello.includes('QR DE CONSULTA HACIENDA'));

  const sinSello = formatoTicketFiscal({ dte: dteDemo({ sello: null, qrUrl: null, estado: 'transmitido' }), ancho: 42 });
  assert.ok(!sinSello.includes('SELLO DE RECEPCION HACIENDA'));
  assert.ok(!sinSello.includes('QR DE CONSULTA HACIENDA'));
});

test('el flujo ESC/POS arranca con ESC @, lleva el QR nativo con la URL fiscal y corta al final', () => {
  const dte = dteDemo();
  const texto = formatoTicketFiscal({ dte, ancho: 42 });
  const bytes = renderEscpos({ texto, qrUrl: dte.qr_url });

  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40], 'debe inicializar con ESC @');

  const qrComando = Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
  assert.ok(bytes.includes(qrComando), 'debe imprimir el QR (GS ( k ... 0x51 0x30)');
  assert.ok(bytes.includes(Buffer.from(QR_FISCAL, 'latin1')), 'la URL del QR debe ser la fiscal auténtica');

  // Modelo 2 + corrección M
  assert.ok(bytes.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00])));
  assert.ok(bytes.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31])));

  assert.deepEqual([...bytes.subarray(-3)], [0x1d, 0x56, 0x00], 'debe cortar el papel al final');
});

test('acentos y símbolos se codifican en PC850 (nunca como bytes inválidos)', () => {
  const bytes = codificarTexto('á é í ó ú ñ Ñ ¿ ¡ —');
  assert.deepEqual([...bytes], [
    0xa0, 0x20, 0x82, 0x20, 0xa1, 0x20, 0xa2, 0x20, 0xa3, 0x20,
    0xa4, 0x20, 0xa5, 0x20, 0xa8, 0x20, 0xad, 0x20, 0x2d,
  ]);
});
