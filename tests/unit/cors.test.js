// tests/unit/cors.test.js
// Regresión: los requests servidor-a-servidor (sin header `Origin`, p. ej.
// pos-backend → `GET /api/tenants` o `/internal/provisioning/*`) deben
// permitirse. Antes se rechazaban en producción (500) y rompían el login del
// POS y el cron de alertas.

const test = require('node:test');
const assert = require('node:assert/strict');

const { esOrigenPermitido } = require('../../src/config/cors');

const ORIGENES = ['https://pos.sandalfol.com', 'https://dte.sandalfol.com'];

test('permite requests sin Origin (servidor-a-servidor)', () => {
  assert.equal(esOrigenPermitido(undefined, ORIGENES), true);
  assert.equal(esOrigenPermitido(null, ORIGENES), true);
  assert.equal(esOrigenPermitido('', ORIGENES), true);
});

test('permite los orígenes listados en CORS_ORIGINS', () => {
  assert.equal(esOrigenPermitido('https://pos.sandalfol.com', ORIGENES), true);
  assert.equal(esOrigenPermitido('https://dte.sandalfol.com', ORIGENES), true);
});

test('rechaza orígenes no listados', () => {
  assert.equal(esOrigenPermitido('https://evil.example.com', ORIGENES), false);
  assert.equal(esOrigenPermitido('http://pos.sandalfol.com', ORIGENES), false);
});

test('el match es exacto: una entrada con barra final nunca coincide', () => {
  assert.equal(esOrigenPermitido('https://pos.sandalfol.com', ['https://pos.sandalfol.com/']), false);
  assert.equal(esOrigenPermitido('https://pos.sandalfol.com/', ORIGENES), false);
});

test('sin CORS_ORIGINS configurados solo pasan los requests sin Origin', () => {
  assert.equal(esOrigenPermitido(undefined, []), true);
  assert.equal(esOrigenPermitido('https://pos.sandalfol.com', []), false);
  assert.equal(esOrigenPermitido('https://pos.sandalfol.com'), false);
});
