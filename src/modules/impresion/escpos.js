// src/modules/impresion/escpos.js
// Codificador ESC/POS (familia Epson) sin dependencias.
//
// El backend es la fuente de verdad del ticket: este módulo devuelve los bytes
// que el agente local (AmberPrint) escribe **tal cual** a la impresora.
// Mismo criterio y mismos comandos que `pos-backend/imprimir/escpos.ts`:
//
//   ESC @        inicializar impresora
//   ESC t n      seleccionar página de códigos (PC850)
//   ESC a n      alineación (0 izquierda, 1 centro, 2 derecha)
//   ESC E n      negrita
//   ESC d n      avanzar n líneas
//   GS  V 0      corte total de papel
//   GS ( k ...   QR nativo (modelo 2, corrección M, tamaño de módulo)
//
// El QR lo genera el firmware a partir de la URL auténtica de consulta de
// Hacienda (`qr_url`, que este servicio arma solo si el DTE está `aceptado`).

const ESC = 0x1b;
const GS = 0x1d;

/** Página de códigos por defecto: PC850 (cubre acentos, ñ/Ñ, ¿¡ y dibujo de caja). */
const PAGINA_CODIGOS_PC850 = 0x02;

/** Transliteración Unicode -> byte de PC850. Lo que no está cae en `?`. */
const MAPA_PC850 = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87,
  'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f,
  'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
  'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b, '£': 0x9c, 'Ø': 0x9d, '×': 0x9e, 'ƒ': 0x9f,
  'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
  '¿': 0xa8, '®': 0xa9, '¬': 0xaa, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
  '░': 0xb0, '▒': 0xb1, '▓': 0xb2, '│': 0xb3, '┤': 0xb4, 'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7,
  '©': 0xb8, '╣': 0xb9, '║': 0xba, '╗': 0xbb, '╝': 0xbc, '¢': 0xbd, '¥': 0xbe, '┐': 0xbf,
  '└': 0xc0, '┴': 0xc1, '┬': 0xc2, '├': 0xc3, '─': 0xc4, '┼': 0xc5, 'ã': 0xc6, 'Ã': 0xc7,
  '╚': 0xc8, '╔': 0xc9, '╩': 0xca, '╦': 0xcb, '╠': 0xcc, '═': 0xcd, '╬': 0xce, '¤': 0xcf,
  'ð': 0xd0, 'Ð': 0xd1, 'Ê': 0xd2, 'Ë': 0xd3, 'È': 0xd4, 'ı': 0xd5, 'Í': 0xd6, 'Î': 0xd7,
  'Ï': 0xd8, '┘': 0xd9, '┌': 0xda, '█': 0xdb, '▄': 0xdc, '¦': 0xdd, 'Ì': 0xde, '▀': 0xdf,
  'Ó': 0xe0, 'ß': 0xe1, 'Ô': 0xe2, 'Ò': 0xe3, 'õ': 0xe4, 'Õ': 0xe5, 'µ': 0xe6, 'þ': 0xe7,
  'Þ': 0xe8, 'Ú': 0xe9, 'Û': 0xea, 'Ù': 0xeb, 'ý': 0xec, 'Ý': 0xed, '¯': 0xee, '´': 0xef,
  '\u00ad': 0xf0, '±': 0xf1, '‗': 0xf2, '¾': 0xf3, '¶': 0xf4, '§': 0xf5, '÷': 0xf6, '¸': 0xf7,
  '°': 0xf8, '¨': 0xf9, '·': 0xfa, '¹': 0xfb, '³': 0xfc, '²': 0xfd, '■': 0xfe,
};

/** Tipográficos sin equivalente en la página de códigos. */
const TRANSLITERAR = {
  '\u2014': '-', '\u2013': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
  '\u2026': '...', '\u2022': '*', '\u00a0': ' ',
};

const REEMPLAZO = 0x3f; // '?'

/** Convierte texto a bytes de la página de códigos (nunca emite bytes inválidos). */
const codificarTexto = (texto) => {
  const bytes = [];
  for (const caracter of String(texto ?? '')) {
    if (caracter === '\n') {
      bytes.push(0x0a);
      continue;
    }
    const codigo = caracter.codePointAt(0);
    if (codigo < 0x80) {
      bytes.push(codigo);
      continue;
    }
    if (MAPA_PC850[caracter] !== undefined) {
      bytes.push(MAPA_PC850[caracter]);
      continue;
    }
    if (TRANSLITERAR[caracter] !== undefined) {
      for (const reemplazo of TRANSLITERAR[caracter]) bytes.push(reemplazo.codePointAt(0));
      continue;
    }
    bytes.push(REEMPLAZO);
  }
  return Buffer.from(bytes);
};

// ── Comandos ────────────────────────────────────────────────────────────────

const iniciar = () => Buffer.from([ESC, 0x40]);

const seleccionarPaginaCodigos = (pagina = PAGINA_CODIGOS_PC850) => Buffer.from([ESC, 0x74, pagina & 0xff]);

const alinear = (alineacion = 'centro') => {
  const n = alineacion === 'izquierda' ? 0x00 : alineacion === 'derecha' ? 0x02 : 0x01;
  return Buffer.from([ESC, 0x61, n]);
};

const avanzar = (lineas = 1) => Buffer.from([ESC, 0x64, Math.max(0, lineas) & 0xff]);

const cortar = () => Buffer.from([GS, 0x56, 0x00]);

/**
 * GS ( k — QR nativo, modelo 2.
 * `celda` (1..16) define el módulo; 5 da un QR cómodo de escanear.
 */
const comandoQR = (url, { celda = 5, correccion = 'M' } = {}) => {
  const modelo2 = Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
  const tamano = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, celda))]);
  const niveles = { L: 0x30, M: 0x31, Q: 0x32, H: 0x33 };
  const error = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, niveles[correccion] ?? 0x31]);

  const datos = codificarTexto(url);
  const largoDatos = datos.length + 3; // + "1P0"
  const almacenar = Buffer.from([
    GS, 0x28, 0x6b,
    largoDatos & 0xff, (largoDatos >> 8) & 0xff,
    0x31, 0x50, 0x30,
  ]);
  const imprimir = Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);

  return Buffer.concat([modelo2, tamano, error, almacenar, datos, imprimir]);
};

/**
 * Flujo ESC/POS completo: init, página de códigos, cuerpo, QR (si hay) y corte
 * con avance suficiente. No envía nada: devuelve los bytes.
 */
const renderEscpos = ({
  texto,
  qrUrl,
  celdaQr = 5,
  correccionQr = 'M',
  lineasAntesDeCorte = 4,
  paginaCodigos = PAGINA_CODIGOS_PC850,
} = {}) => {
  const cuerpo = String(texto ?? '');
  const cuerpoConSalto = cuerpo.endsWith('\n') ? cuerpo : `${cuerpo}\n`;

  const partes = [
    iniciar(),
    seleccionarPaginaCodigos(paginaCodigos),
    alinear('centro'),
    avanzar(1),
    codificarTexto(cuerpoConSalto),
  ];

  if (qrUrl) {
    partes.push(avanzar(1), comandoQR(qrUrl, { celda: celdaQr, correccion: correccionQr }), avanzar(1));
  }

  partes.push(avanzar(lineasAntesDeCorte), cortar());

  return Buffer.concat(partes);
};

module.exports = {
  PAGINA_CODIGOS_PC850,
  codificarTexto,
  iniciar,
  seleccionarPaginaCodigos,
  alinear,
  avanzar,
  cortar,
  comandoQR,
  renderEscpos,
};
