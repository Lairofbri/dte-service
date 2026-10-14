// tests/unit/qr-consulta.test.js
// Regresión 2026-10-14: el DTE aceptado por Hacienda no se encontraba en la
// consulta pública porque `fechaEmi` viajaba como ISO datetime (frontend) o
// como Date.toString() (backend). El formato oficial del anexo MH es
// ?ambiente={00|01}&codGen={UUID}&fechaEmi={YYYY-MM-DD}.
//
// Además, `fecha_emision` (columna DATE) se serializaba como timestamp UTC y
// el navegador en UTC-6 mostraba el día anterior (emitido el 14/10 00:09 →
// visible 13/10).

const test = require('node:test');
const assert = require('node:assert/strict');

// Fallbacks de entorno: el módulo requerido carga config/env al importarse
// (no se conecta a BD; solo garantizan el require en CI sin .env).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_AUTH_HACIENDA = process.env.URL_AUTH_HACIENDA || 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
process.env.URL_RECEPCION_HACIENDA = process.env.URL_RECEPCION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte';
process.env.URL_CONSULTA_HACIENDA = process.env.URL_CONSULTA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';
process.env.URL_CONTINGENCIA_HACIENDA = process.env.URL_CONTINGENCIA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/contingencia';
process.env.URL_ANULACION_HACIENDA = process.env.URL_ANULACION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/anulardte';
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'http://localhost:8113/firmardocumento/';

const { construirQRUrl, formatearFechaEmi } = require('../../src/modules/dtes/dtes.service');

const UUID = '849F888E-0929-4947-89C3-BB61FDF55BCB';

test("formatearFechaEmi: Date local (medianoche) → YYYY-MM-DD sin corrimiento", () => {
  // El driver construye las columnas DATE como medianoche LOCAL del proceso.
  // Los getters locales deben devolver la fecha real de la columna.
  assert.equal(formatearFechaEmi(new Date(2026, 9, 14)), '2026-10-14');
  assert.equal(formatearFechaEmi(new Date(2026, 0, 1)), '2026-01-01');
});

test("formatearFechaEmi: string date-only → igual", () => {
  assert.equal(formatearFechaEmi('2026-10-14'), '2026-10-14');
});

test("formatearFechaEmi: ISO datetime → recorta a la fecha", () => {
  assert.equal(formatearFechaEmi('2026-10-14T00:00:00.000Z'), '2026-10-14');
});

test("construirQRUrl: formato oficial con fechaEmi YYYY-MM-DD", () => {
  const url = construirQRUrl('00', UUID, new Date(2026, 9, 14));
  assert.equal(
    url,
    `https://admin.factura.gob.sv/consultaPublica?ambiente=00&codGen=${UUID}&fechaEmi=2026-10-14`
  );
});

test("construirQRUrl: nunca incluye hora ni toString de Date", () => {
  const url = construirQRUrl('00', UUID, new Date(2026, 9, 14));
  assert.ok(!url.includes('T00:00'), 'no debe llevar ISO datetime');
  assert.ok(!url.includes('GMT'), 'no debe llevar Date.toString()');
  assert.match(url, /fechaEmi=\d{4}-\d{2}-\d{2}$/);
});
