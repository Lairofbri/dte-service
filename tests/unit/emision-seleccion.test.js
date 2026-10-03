// tests/unit/emision-seleccion.test.js
// Pruebas de verificarSeleccionEstablecimiento (Fase 5 — spec §9 y §10 Fase 5).
//
// Verifica que la emisión:
// - solo ocurre con establecimiento fiscal 'ready' (activo + datos completos);
// - valida que branch_id del request corresponda al establecimiento;
// - usa los códigos MH del request SOLO como verificación, nunca como autoridad;
// - falla en claro (409) ante cualquier inconsistencia.

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

const { verificarSeleccionEstablecimiento } = require('../../src/modules/generador/generador.service');

const EST = 'b0000000-0000-4000-8000-000000000001';
const BRANCH = '11111111-1111-4111-8111-111111111111';
const OTRO_BRANCH = '33333333-3333-4333-8333-333333333333';

const ESTABLECIMIENTO_READY = {
  id: EST,
  branch_id: BRANCH,
  fiscal_status: 'ready',
  cod_estable_mh: 'M001',
  cod_punto_venta_mh: 'P001',
};

const expect409 = (fn) => {
  try {
    fn();
    assert.fail('Debería haber lanzado un error 409.');
  } catch (err) {
    assert.equal(err.status, 409);
    return err;
  }
};

test('establecimiento ready sin datos adicionales → OK', () => {
  assert.doesNotThrow(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
  }));
});

test('establecimiento no ready → 409 (bloquea emisión)', () => {
  for (const fiscal_status of ['pending_link', 'pending_mh_data', 'inactive', 'blocked', null]) {
    const err = expect409(() => verificarSeleccionEstablecimiento({
      establecimiento: { ...ESTABLECIMIENTO_READY, fiscal_status },
    }));
    assert.match(err.mensaje, /no está listo para emitir/i);
  }
});

test('establecimiento ausente → 409', () => {
  const err = expect409(() => verificarSeleccionEstablecimiento({ establecimiento: null }));
  assert.match(err.mensaje, /establecimiento fiscal/i);
});

test('branch_id que no corresponde al establecimiento → 409', () => {
  const err = expect409(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { branch_id: OTRO_BRANCH },
  }));
  assert.match(err.mensaje, /branch_id no corresponde/i);
});

test('branch_id correcto → OK', () => {
  assert.doesNotThrow(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { branch_id: BRANCH },
  }));
});

test('códigos MH del request que no coinciden → 409 (verificación, no autoridad)', () => {
  const errEst = expect409(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { cod_estable_mh: 'M999' },
  }));
  assert.match(errEst.mensaje, /establecimiento MH no coincide/i);

  const errPv = expect409(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { cod_punto_venta_mh: 'P999' },
  }));
  assert.match(errPv.mensaje, /punto de venta MH no coincide/i);
});

test('códigos MH del request que coinciden → OK', () => {
  assert.doesNotThrow(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { cod_estable_mh: 'M001', cod_punto_venta_mh: 'P001' },
  }));
});

test('establecimiento ready + branch + códigos correctos → OK', () => {
  assert.doesNotThrow(() => verificarSeleccionEstablecimiento({
    establecimiento: ESTABLECIMIENTO_READY,
    datos: { branch_id: BRANCH, cod_estable_mh: 'M001', cod_punto_venta_mh: 'P001' },
  }));
});