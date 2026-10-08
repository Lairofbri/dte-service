// tests/unit/firmador-auth.test.js
// Pruebas del cliente HTTP del firmador remoto.
//
// Entregable verificado (2026-10-07):
// - El firmador svfe-api-firmador (Bluehost) NO tiene autenticación propia:
//   el cliente NO envía headers de Authorization ni X-Firmador-Key.
//   La seguridad se delega a HTTPS + IP allowlist en el hosting.
// - Se eliminaron FIRMADOR_TOKEN (Bearer) y FIRMADOR_API_KEY (X-Firmador-Key).

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_AUTH_HACIENDA = process.env.URL_AUTH_HACIENDA || 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
process.env.URL_RECEPCION_HACIENDA = process.env.URL_RECEPCION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte';
process.env.URL_CONSULTA_HACIENDA = process.env.URL_CONSULTA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';
process.env.URL_CONTINGENCIA_HACIENDA = process.env.URL_CONTINGENCIA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/contingencia';
process.env.URL_ANULACION_HACIENDA = process.env.URL_ANULACION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/anulardte';
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'https://firmador.cuscatec.com/firmardocumento/';

const test = require('node:test');
const assert = require('node:assert/strict');

const servicePath = require.resolve('../../src/modules/firmador/firmador.service');
const envPath = require.resolve('../../src/config/env');

// Simular "variables obsoletas en el entorno" y verificar que se IGNORAN.
const VARS_OBSOLETAS = {
  FIRMADOR_TOKEN: 'token-que-ya-no-se-usa',
  FIRMADOR_API_KEY: 'api-key-que-ya-no-se-usa',
};

const cargarServicio = () => {
  delete require.cache[envPath];
  delete require.cache[servicePath];
  return require(servicePath);
};

test('el cliente del firmador NUNCA envía headers de autenticación (ni Bearer ni X-Firmador-Key)', () => {
  const originales = {};
  for (const [nombre, valor] of Object.entries(VARS_OBSOLETAS)) {
    originales[nombre] = process.env[nombre];
    process.env[nombre] = valor;
  }

  try {
    const { clienteFirmador } = cargarServicio();

    assert.equal(
      clienteFirmador.defaults.headers['Authorization'],
      undefined,
      'ya no se envía Authorization: Bearer'
    );
    assert.equal(
      clienteFirmador.defaults.headers['X-Firmador-Key'],
      undefined,
      'ya no se envía X-Firmador-Key'
    );
    assert.equal(
      JSON.stringify(clienteFirmador.defaults.headers).includes('token-que-ya-no-se-usa'),
      false,
      'los tokens obsoletos del entorno se ignoran'
    );
  } finally {
    for (const [nombre, valor] of Object.entries(originales)) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  }
});

test('el cliente envía solo Content-Type application/json', () => {
  const { clienteFirmador } = cargarServicio();
  const headers = Object.keys(clienteFirmador.defaults.headers);
  assert.ok(headers.includes('Content-Type'), 'Content-Type presente');
  assert.equal(clienteFirmador.defaults.headers['Content-Type'], 'application/json');
});