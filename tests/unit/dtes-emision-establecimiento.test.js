// tests/unit/dtes-emision-establecimiento.test.js
// Fase C3: resolución del establecimiento de emisión en el controller.
// - Administrador JWT: el `establecimiento_id` del body tiene precedencia
//   (selector de sucursal post-login); sin body cae al del JWT.
// - Operador JWT: SIEMPRE el del JWT (el body se ignora).
// - API Key (POS): el del body (no hay usuario autenticado).
// La pertenencia al tenant se valida aguas abajo (generador.service).

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

const { resolverEstablecimientoId } = require('../../src/modules/dtes/dtes.controller');

const EST_JWT  = 'fd07ba3f-ff41-4e3a-a60d-a1801df1b8f1';
const EST_BODY = '2cbb14c9-f2d0-492b-a9c2-9e4328413715';

test('administrador: el establecimiento del body gana al del JWT (C3)', () => {
  assert.equal(
    resolverEstablecimientoId({ rol: 'administrador', establecimiento_id: EST_JWT }, EST_BODY),
    EST_BODY
  );
});

test('administrador sin body: cae al establecimiento del JWT', () => {
  assert.equal(
    resolverEstablecimientoId({ rol: 'administrador', establecimiento_id: EST_JWT }, undefined),
    EST_JWT
  );
  assert.equal(
    resolverEstablecimientoId({ rol: 'administrador', establecimiento_id: EST_JWT }, null),
    EST_JWT
  );
});

test('operador: SIEMPRE el establecimiento del JWT (el body se ignora)', () => {
  assert.equal(
    resolverEstablecimientoId({ rol: 'operador', establecimiento_id: EST_JWT }, EST_BODY),
    EST_JWT
  );
});

test('operador sin establecimiento en JWT: cae al body (borde, no bloquea el flujo)', () => {
  assert.equal(
    resolverEstablecimientoId({ rol: 'operador', establecimiento_id: null }, EST_BODY),
    EST_BODY
  );
});

test('API Key (sin usuario): el establecimiento del body (POS de confianza)', () => {
  assert.equal(resolverEstablecimientoId(undefined, EST_BODY), EST_BODY);
  assert.equal(resolverEstablecimientoId(null, EST_BODY), EST_BODY);
});

test('sin usuario y sin body: null (el generador falla con 400 accionable)', () => {
  assert.equal(resolverEstablecimientoId(undefined, undefined), null);
  assert.equal(resolverEstablecimientoId({ rol: 'administrador', establecimiento_id: null }, undefined), null);
});
