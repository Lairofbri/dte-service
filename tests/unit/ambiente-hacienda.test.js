// tests/unit/ambiente-hacienda.test.js
// Cambio de ambiente (00 pruebas ↔ 01 producción) por tenant.
// 1) urlParaAmbiente: las envs de URL del MH se normalizan al host del
//    ambiente ACTUAL del tenant en cada llamada (el host y el campo
//    "ambiente" del cuerpo deben coincidir; MH los valida).
// 2) debeInvalidarToken: el token cacheado de Hacienda solo sirve para el
//    par credenciales + ambiente; cambiar cualquiera lo invalida.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { urlParaAmbiente } = require('../../src/modules/hacienda/hacienda.service');
const { debeInvalidarToken } = require('../../src/modules/configuracion/configuracion.service');

const AUTH_PRUEBAS = 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
const AUTH_PROD    = 'https://api.dtes.mh.gob.sv/seguridad/auth';
const CONSULTA_PRUEBAS = 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';

// ── urlParaAmbiente ──────────────────────────────────────────────

test('ambiente 00 normaliza cualquier URL a apitest', () => {
  assert.equal(urlParaAmbiente(AUTH_PROD, '00'), AUTH_PRUEBAS);
  assert.equal(
    urlParaAmbiente('https://api.dtes.mh.gob.sv/fesv/recepciondte', '00'),
    'https://apitest.dtes.mh.gob.sv/fesv/recepciondte'
  );
});

test('ambiente 01 normaliza cualquier URL a api (producción)', () => {
  assert.equal(urlParaAmbiente(AUTH_PRUEBAS, '01'), AUTH_PROD);
  assert.equal(
    urlParaAmbiente('https://apitest.dtes.mh.gob.sv/fesv/anulardte', '01'),
    'https://api.dtes.mh.gob.sv/fesv/anulardte'
  );
});

test('es idempotente: URL ya en el host correcto no cambia', () => {
  assert.equal(urlParaAmbiente(AUTH_PRUEBAS, '00'), AUTH_PRUEBAS);
  assert.equal(urlParaAmbiente(AUTH_PROD, '01'), AUTH_PROD);
  assert.equal(urlParaAmbiente(CONSULTA_PRUEBAS, '00'), CONSULTA_PRUEBAS);
});

test('preserva path, slash final y query', () => {
  const conQuery = 'https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/?x=1';
  assert.equal(
    urlParaAmbiente(conQuery, '00'),
    'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/?x=1'
  );
});

test('URL desconocida (host custom) pasa sin cambios', () => {
  const custom = 'https://mh-proxy.interno/seguridad/auth';
  assert.equal(urlParaAmbiente(custom, '01'), custom);
  assert.equal(urlParaAmbiente(custom, '00'), custom);
});

test('falsy se devuelve tal cual (nunca rompe)', () => {
  assert.equal(urlParaAmbiente('', '01'), '');
  assert.equal(urlParaAmbiente(undefined, '00'), undefined);
  assert.equal(urlParaAmbiente(null, '01'), null);
});

test('ambiente undefined trata como pruebas (default seguro)', () => {
  // AMBIENTE_HACIENDA default '00' — con undefined no debe ir a producción
  assert.equal(urlParaAmbiente(AUTH_PROD, undefined), AUTH_PRUEBAS);
});

// ── debeInvalidarToken ───────────────────────────────────────────

test('sin cambios no invalida el token', () => {
  assert.equal(debeInvalidarToken({ datos: {}, ambienteActual: '00' }), false);
  assert.equal(
    debeInvalidarToken({ datos: { nombre: 'Otro' }, ambienteActual: '01' }),
    false
  );
});

test('enviar el mismo ambiente no invalida el token', () => {
  assert.equal(
    debeInvalidarToken({ datos: { ambiente: '00' }, ambienteActual: '00' }),
    false
  );
  assert.equal(
    debeInvalidarToken({ datos: { ambiente: '01' }, ambienteActual: '01' }),
    false
  );
});

test('cambiar de ambiente invalida el token (00 → 01 y 01 → 00)', () => {
  assert.equal(
    debeInvalidarToken({ datos: { ambiente: '01' }, ambienteActual: '00' }),
    true
  );
  assert.equal(
    debeInvalidarToken({ datos: { ambiente: '00' }, ambienteActual: '01' }),
    true
  );
});

test('cambiar credenciales invalida el token', () => {
  assert.equal(
    debeInvalidarToken({ datos: { usuario_hacienda: 'nuevo@x.com' }, ambienteActual: '00' }),
    true
  );
  assert.equal(
    debeInvalidarToken({ datos: { password_hacienda: 'secreta' }, ambienteActual: '01' }),
    true
  );
});

test('credenciales y ambiente a la vez sigue invalidando (una sola vez)', () => {
  assert.equal(
    debeInvalidarToken({
      datos: { usuario_hacienda: 'nuevo@x.com', ambiente: '01' },
      ambienteActual: '00',
    }),
    true
  );
});
