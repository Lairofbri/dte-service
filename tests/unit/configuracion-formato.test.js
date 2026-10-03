// tests/unit/configuracion-formato.test.js
// Pruebas de normalización de formato visual (NIT/NRC/teléfono).
//
// Entregable verificado:
// - Los guiones de presentación se eliminan al guardar: la BD almacena
//   SOLO dígitos (Hacienda recibe el NIT sin guiones en el DTE).

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');

// Mocks: evitan BD en el require del service.
const databasePath = require.resolve('../../src/config/database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
};
const catalogosPath = require.resolve('../../src/modules/catalogos/catalogos.service');
require.cache[catalogosPath] = {
  id: catalogosPath,
  filename: catalogosPath,
  loaded: true,
  exports: { obtenerActividadEconomica: async () => null },
};

const { normalizarFormato } = require('../../src/modules/configuracion/configuracion.service');

test('NIT/NRC/teléfono con guiones se normalizan a solo dígitos', () => {
  const normalizado = normalizarFormato({
    nit:      '0614-260967-101-5',
    nrc:      '123456-0',
    telefono: '2200-5000',
    nombre:   'Empresa Demo',
  });

  assert.equal(normalizado.nit, '06142609671015');
  assert.equal(normalizado.nrc, '1234560');
  assert.equal(normalizado.telefono, '22005000');
  assert.equal(normalizado.nombre, 'Empresa Demo', 'el resto de campos no cambia');
});

test('valores ya normalizados se conservan intactos', () => {
  const normalizado = normalizarFormato({ nit: '06142609671015', nrc: null, telefono: undefined });
  assert.equal(normalizado.nit, '06142609671015');
  assert.equal(normalizado.nrc, null);
  assert.equal(normalizado.telefono, undefined);
});

test('no muta el objeto original', () => {
  const original = { nit: '0614-260967-101-5' };
  normalizarFormato(original);
  assert.equal(original.nit, '0614-260967-101-5', 'recibe una copia normalizada');
});