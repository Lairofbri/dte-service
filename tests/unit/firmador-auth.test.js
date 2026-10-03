// tests/unit/firmador-auth.test.js
// Pruebas de autenticación del cliente del firmador remoto.
//
// Entregable verificado:
// - Con FIRMADOR_TOKEN definido, el cliente envía `Authorization: Bearer <token>`.
// - Sin token, no se envía el header de Authorization (compatibilidad local).

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'https://firmador.cuscatec.com/firmardocumento/';

const test = require('node:test');
const assert = require('node:assert/strict');

const servicePath = require.resolve('../../src/modules/firmador/firmador.service');
const envPath = require.resolve('../../src/config/env');

const cargarServicio = () => {
  delete require.cache[envPath];
  delete require.cache[servicePath];
  return require(servicePath);
};

test('con FIRMADOR_TOKEN definido el cliente envía Authorization: Bearer', () => {
  process.env.FIRMADOR_TOKEN = 'token-de-prueba-abc';
  const { clienteFirmador } = cargarServicio();
  assert.equal(
    clienteFirmador.defaults.headers['Authorization'],
    'Bearer token-de-prueba-abc'
  );
});

test('sin FIRMADOR_TOKEN no se envía header de Authorization', () => {
  delete process.env.FIRMADOR_TOKEN;
  const { clienteFirmador } = cargarServicio();
  assert.equal(clienteFirmador.defaults.headers['Authorization'], undefined);
});

test('FIRMADOR_API_KEY sigue soportada como X-Firmador-Key', () => {
  process.env.FIRMADOR_API_KEY = 'api-key-legacy';
  const { clienteFirmador } = cargarServicio();
  assert.equal(clienteFirmador.defaults.headers['X-Firmador-Key'], 'api-key-legacy');
});