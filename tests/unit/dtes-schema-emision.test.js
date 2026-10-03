// tests/unit/dtes-schema-emision.test.js
// Pruebas del contrato Joi de emisión y anulación (Fase 5 — spec §9 y §10 Fase 5).
//
// Fase 5: el POS (API Key) debe poder enviar establecimiento_id/branch_id y
// los códigos MH solo como verificación. Antes, Joi rechazaba estas claves
// ("... is not allowed") y la anulación rechazaba tipo_dte.

// Fallbacks de entorno: garantizan el require en CI sin .env (no se conecta a BD).
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
const {
  emitirFCFSchema,
  emitirCCFSchema,
  emitirFSESchema,
  emitirNotaSchema,
  anularDTESchema,
} = require('../../src/modules/dtes/dtes.schema');

const EST = 'b0000000-0000-4000-8000-000000000001';
const BRANCH = '11111111-1111-4111-8111-111111111111';

const baseFCF = () => ({
  items: [{ codigo: 'A', descripcion: 'Item', cantidad: 1, uni_medida: 59, precio_unitario: 10 }],
  pagos: [{ codigo: '01', montoPago: 10 }],
  receptor: null,
});

const baseNota = () => ({
  items: [{ codigo: 'A', descripcion: 'Item', cantidad: 1, uni_medida: 59, precio_unitario: 10 }],
  pagos: [{ codigo: '01', montoPago: 10 }],
  receptor: {
    nit: '0614-111111-111-1',
    nombre: 'Cliente de prueba',
  },
  documento_relacionado: {
    codigo_generacion: '22222222-2222-4222-8222-222222222222',
    tipo_dte: '01',
    fecha_emision: '2026-09-26',
  },
});

const valida = (schema, payload) => {
  const { error, value } = schema.validate(payload);
  return { error, value };
};

test('FCF: establecimiento_id + branch_id son aceptados', () => {
  const { error } = valida(emitirFCFSchema, {
    ...baseFCF(),
    establecimiento_id: EST,
    branch_id: BRANCH,
  });
  assert.equal(error, undefined);
});

test('FCF: códigos MH son aceptados como verificación (no autoridad)', () => {
  const { error, value } = valida(emitirFCFSchema, {
    ...baseFCF(),
    cod_estable_mh: 'M001',
    cod_punto_venta_mh: 'P001',
  });
  assert.equal(error, undefined);
  assert.equal(value.cod_estable_mh, 'M001');
});

test('FCF: establecimiento_id inválido se rechaza', () => {
  const { error } = valida(emitirFCFSchema, { ...baseFCF(), establecimiento_id: 'no-uuid' });
  assert.ok(error);
  assert.match(error.message, /UUID/i);
});

test('CCF y FSE aceptan establecimiento_id/branch_id/códigos MH', () => {
  const extra = { establecimiento_id: EST, branch_id: BRANCH, cod_estable_mh: 'M001', cod_punto_venta_mh: 'P001' };
  const ccf = valida(emitirCCFSchema, {
    ...baseFCF(),
    receptor: { nit: '0614-111111-111-1', nombre: 'Cliente' },
    ...extra,
  });
  assert.equal(ccf.error, undefined);
  const fse = valida(emitirFSESchema, {
    ...baseFCF(),
    receptor: { nit: '0614-111111-111-1', nombre: 'Sujeto excluido' },
    ...extra,
  });
  assert.equal(fse.error, undefined);
});

test('Nota de crédito/débito aceptan establecimiento_id del body', () => {
  const { error } = valida(emitirNotaSchema, { ...baseNota(), establecimiento_id: EST });
  assert.equal(error, undefined);
});

test('Anulación: acepta establecimiento_id y tipo_dte (compat POS)', () => {
  const { error, value } = valida(anularDTESchema, {
    codigo_generacion: '22222222-2222-4222-8222-222222222222',
    tipo_dte: '01',
    establecimiento_id: EST,
    motivo_tipo: 1,
    motivo_descripcion: 'Error en datos del documento.',
    nombre_responsable: 'Responsable',
    tipo_doc_responsable: '13',
    num_doc_responsable: '12345678',
  });
  assert.equal(error, undefined);
  assert.equal(value.establecimiento_id, EST);
  assert.equal(value.tipo_dte, '01');
});

test('Anulación: establecimiento_id inválido se rechaza', () => {
  const { error } = valida(anularDTESchema, {
    codigo_generacion: '22222222-2222-4222-8222-222222222222',
    establecimiento_id: 'no-uuid',
    motivo_tipo: 1,
    motivo_descripcion: 'Error en datos del documento.',
    nombre_responsable: 'Responsable',
    tipo_doc_responsable: '13',
    num_doc_responsable: '12345678',
  });
  assert.ok(error);
});