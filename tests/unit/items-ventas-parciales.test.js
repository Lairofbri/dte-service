// tests/unit/items-ventas-parciales.test.js
// Pruebas del soporte de tratamiento fiscal por ítem:
//   - Joi (dtes.schema.itemSchema) acepta venta_no_suj / venta_exenta / compra.
//   - El generador refleja ventaNoSuj/ventaExenta en el ítem y ajusta
//     ventaGravada; FSE usa el campo compra (oficial o derivado).

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
const { emitirFCFSchema, emitirCCFSchema, emitirFSESchema, emitirNotaSchema } = require('../../src/modules/dtes/dtes.schema');
const { construirItem, construirItemFSE } = require('../../src/modules/generador/generador.utils');

// ─────────────────────────────────────────────
// Joi — el schema acepta el tratamiento fiscal por ítem
// ─────────────────────────────────────────────
test('itemSchema acepta venta_no_suj, venta_exenta y compra', () => {
  const { error: errorFCF, value } = emitirFCFSchema.validate({
    items: [{
      descripcion: 'Helado', cantidad: 2, precio_unitario: 10,
      venta_no_suj: 0, venta_exenta: 5,
    }],
    pagos: [{ codigo: '01', montoPago: 15 }],
    receptor: null,
  });
  assert.equal(errorFCF, undefined);
  assert.equal(value.items[0].venta_no_suj, 0);
  assert.equal(value.items[0].venta_exenta, 5);
});

test('FSE acepta el campo compra en el ítem', () => {
  const { error } = emitirFSESchema.validate({
    items: [{
      descripcion: 'Servicio excluido', cantidad: 1, precio_unitario: 100,
      compra: 90,
    }],
    pagos: [{ codigo: '01', montoPago: 90 }],
    receptor: { nit: '0614-010101-001-5', nombre: 'Receptor de prueba' },
  });
  assert.equal(error, undefined);
});

// ─────────────────────────────────────────────
// Generador — FCF/CCF/NC/ND
// ─────────────────────────────────────────────
test('construirItem refleja ventaNoSuj/ventaExenta y ajusta ventaGravada (FCF)', () => {
  const item = construirItem({
    descripcion: 'Producto', cantidad: 2, precio_unitario: 100,
    venta_no_suj: 10, venta_exenta: 5, descuento: 0,
  }, 1, '01');

  assert.equal(item.ventaNoSuj, 10);
  assert.equal(item.ventaExenta, 5);
  assert.equal(item.ventaGravada, 185); // 200 - 10 - 5
  assert.equal(item.ivaItem, 21.28318584); // 185 - 185/1.13 (redondear8)
});

test('construirItem con 0/no enviado mantiene el comportamiento histórico', () => {
  const item = construirItem({
    descripcion: 'Producto', cantidad: 3, precio_unitario: 10,
  }, 1, '03');

  assert.equal(item.ventaNoSuj, 0);
  assert.equal(item.ventaExenta, 0);
  assert.equal(item.ventaGravada, 30);
});

test('construirItem no permite gravada negativa', () => {
  const item = construirItem({
    descripcion: 'Producto', cantidad: 1, precio_unitario: 5,
    venta_no_suj: 10,
  }, 1, '01');

  assert.equal(item.ventaGravada, 0);
  assert.equal(item.ventaNoSuj, 10);
});

// ─────────────────────────────────────────────
// Generador — FSE (campo compra)
// ─────────────────────────────────────────────
test('construirItemFSE usa el campo compra oficial si llega', () => {
  const item = construirItemFSE({
    descripcion: 'Servicio', cantidad: 1, precio_unitario: 100,
    compra: 77,
  }, 1);

  assert.equal(item.compra, 77);
});

test('construirItemFSE deriva compra de cantidad x precio si no llega', () => {
  const item = construirItemFSE({
    descripcion: 'Servicio', cantidad: 2, precio_unitario: 50,
    descuento: 10,
  }, 1);

  assert.equal(item.compra, 90); // 100 - 10
});

// ─────────────────────────────────────────────
// CCF / Nota — también aceptan los campos
// ─────────────────────────────────────────────
test('emitirCCFSchema y emitirNotaSchema aceptan tratamiento fiscal', () => {
  const receptor = { nit: '0614-111111-111-1', nombre: 'Cliente de prueba' };
  const base = (pagos) => ({
    items: [{
      descripcion: 'Item', cantidad: 1, precio_unitario: 10,
      venta_exenta: 3,
    }],
    pagos,
    receptor,
  });

  const { error: errorCCF } = emitirCCFSchema.validate(base([{ codigo: '01', montoPago: 7 }]));
  assert.equal(errorCCF, undefined);

  const { error: errorNota } = emitirNotaSchema.validate({
    ...base([{ codigo: '01', montoPago: 7 }]),
    documento_relacionado: {
      codigo_generacion: '22222222-2222-4222-8222-222222222222',
      tipo_dte: '01',
      fecha_emision: '2026-09-26',
    },
  });
  assert.equal(errorNota, undefined);
});