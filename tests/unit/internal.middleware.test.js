// tests/unit/internal.middleware.test.js
// Pruebas del middleware de autenticación interna servidor-a-servidor (Fase 2).
// Verifica: fail-closed sin clave configurada, rechazo sin header, rechazo
// de clave incorrecta y aceptación de la clave correcta.

const test = require('node:test');
const assert = require('node:assert/strict');

const mockRes = () => {
  const res = {};
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (cuerpo) => {
    res.cuerpo = cuerpo;
    return res;
  };
  return res;
};

test('rechaza con 500 si INTERNAL_API_KEY no está configurada (fail-closed)', async () => {
  const { autenticarApiKeyInterna } = require('../../src/middlewares/internal.middleware');
  // Limpiar también lo que dotenv pudo cargar desde .env al requerir el módulo.
  process.env.INTERNAL_API_KEY = '';
  const res = mockRes();
  autenticarApiKeyInterna({ headers: {} }, res, () => {
    throw new Error('No debería continuar');
  });
  assert.equal(res.statusCode, 500);
  assert.equal(res.cuerpo.ok, false);
});

test('rechaza con 401 si falta el header X-Internal-Api-Key', async () => {
  process.env.INTERNAL_API_KEY = 'clave-interna-secreta-123';
  const { autenticarApiKeyInterna } = require('../../src/middlewares/internal.middleware');
  const res = mockRes();
  autenticarApiKeyInterna({ headers: {} }, res, () => {
    throw new Error('No debería continuar');
  });
  assert.equal(res.statusCode, 401);
});

test('rechaza con 401 si la clave interna es incorrecta', async () => {
  process.env.INTERNAL_API_KEY = 'clave-interna-secreta-123';
  const { autenticarApiKeyInterna } = require('../../src/middlewares/internal.middleware');
  const res = mockRes();
  autenticarApiKeyInterna({ headers: { 'x-internal-api-key': 'clave-incorrecta' } }, res, () => {
    throw new Error('No debería continuar');
  });
  assert.equal(res.statusCode, 401);
});

test('acepta la clave interna correcta y marca req.origenInterno', async () => {
  process.env.INTERNAL_API_KEY = 'clave-interna-secreta-123';
  const { autenticarApiKeyInterna } = require('../../src/middlewares/internal.middleware');
  let nextLlamado = false;
  const req = { headers: { 'x-internal-api-key': 'clave-interna-secreta-123' } };
  autenticarApiKeyInterna(req, mockRes(), () => { nextLlamado = true; });
  assert.equal(nextLlamado, true);
  assert.equal(req.origenInterno, 'pos');
});