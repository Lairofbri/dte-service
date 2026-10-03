// tests/unit/establecimientos-fiscal.test.js
// Pruebas unitarias del determinador de estado fiscal de establecimientos
// (Fase 3 — spec §5 Estados de sucursal y §10 Fase 3).
//
// Verifica el criterio "solo ready puede emitir":
// - ready exige códigos MH + tipo CAT-009 + dirección + departamento/municipio.
// - Un establecimiento vinculado sin datos completos queda pending_mh_data.
// - Un establecimiento desactivado queda inactive (nunca ready).

// Fallbacks de entorno: el módulo requiere config/env al cargarse; estos
// valores solo garantizan el require en CI sin .env (no se conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_AUTH_HACIENDA = process.env.URL_AUTH_HACIENDA || 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
process.env.URL_RECEPCION_HACIENDA = process.env.URL_RECEPCION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte';
process.env.URL_CONSULTA_HACIENDA = process.env.URL_CONSULTA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';
process.env.URL_CONTINGENCIA_HACIENDA = process.env.URL_CONTINGENCIA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/contingencia';
process.env.URL_ANULACION_HACIENDA = process.env.URL_ANULACION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/anulardte';
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'http://localhost:8113/firmardocumento/';

const test = require('node:test');
const assert = require('node:assert/strict');
const { determinarEstadoFiscal } = require('../../src/modules/establecimientos/establecimientos.service');

const COMPLETO = {
  activo: true,
  branch_id: 'b0000000-0000-4000-8000-000000000001',
  cod_estable_mh: 'M001',
  cod_punto_venta_mh: 'P001',
  tipo_establecimiento: '02',
  direccion: 'Av. Principal 1',
  departamento_cod: '06',
  municipio_cod: '14',
};

test('datos fiscales completos + branch_id → ready', () => {
  assert.equal(determinarEstadoFiscal(COMPLETO), 'ready');
});

test('datos fiscales completos sin branch_id → ready (establecimiento operativo)', () => {
  const { branch_id: _ignorado, ...sinBranch } = COMPLETO;
  assert.equal(determinarEstadoFiscal(sinBranch), 'ready');
});

test('vinculado sin códigos MH → pending_mh_data', () => {
  const sinCodigos = { ...COMPLETO, cod_estable_mh: null, cod_punto_venta_mh: null };
  assert.equal(determinarEstadoFiscal(sinCodigos), 'pending_mh_data');
});

test('sin vínculo ni datos fiscales → pending_link', () => {
  const { branch_id: _ignorado, cod_estable_mh: _c1, cod_punto_venta_mh: _c2, ...basico } = COMPLETO;
  assert.equal(determinarEstadoFiscal(basico), 'pending_link');
});

test('inactivo → inactive, incluso con datos completos', () => {
  assert.equal(determinarEstadoFiscal({ ...COMPLETO, activo: false }), 'inactive');
});

test('cada dato faltante impide ready (pending_mh_data si está vinculado)', () => {
  for (const campo of ['cod_estable_mh', 'cod_punto_venta_mh', 'tipo_establecimiento', 'direccion', 'departamento_cod', 'municipio_cod']) {
    const fila = { ...COMPLETO, [campo]: null };
    assert.equal(
      determinarEstadoFiscal(fila),
      'pending_mh_data',
      `campo faltante ${campo} debe impedir ready`
    );
  }
});