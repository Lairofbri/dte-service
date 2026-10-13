// tests/unit/productos-schema.test.js
// Pruebas del módulo de productos (Fase 3):
//   - crearProductoSchema aplica defaults y valida campos obligatorios.
//   - actualizarProductoSchema acepta actualizaciones parciales.
//   - buscarProductosSchema valida filtros de búsqueda.

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
  crearProductoSchema,
  actualizarProductoSchema,
  buscarProductosSchema,
} = require('../../src/modules/productos/productos.schema');

// ─────────────────────────────────────────────
// CREAR
// ─────────────────────────────────────────────
test('crearProductoSchema acepta un producto válido y aplica defaults', () => {
  const { error, value } = crearProductoSchema.validate({
    nombre: 'Laptop Dell Latitude 5420',
    precio_unitario: 850.5,
  });

  assert.equal(error, undefined);
  assert.equal(value.nombre, 'Laptop Dell Latitude 5420');
  assert.equal(value.codigo, undefined);
  assert.equal(value.tipo_item, 2);      // default CAT-011 (Servicio → 2)
  assert.equal(value.uni_medida, 59);    // default CAT-014 (Unidad)
  assert.equal(value.precio_unitario, 850.5);
  assert.equal(value.tipo_venta, 'gravada');
});

test('crearProductoSchema acepta campos completos y codigo opcional', () => {
  const { error, value } = crearProductoSchema.validate({
    nombre: 'Café molido 1 lb',
    codigo: 'CAFE-001',
    tipo_item: 1,
    uni_medida: 30,
    precio_unitario: 6.75,
    tipo_venta: 'no_sujeta',
  });

  assert.equal(error, undefined);
  assert.equal(value.codigo, 'CAFE-001');
  assert.equal(value.tipo_item, 1);
  assert.equal(value.uni_medida, 30);
  assert.equal(value.tipo_venta, 'no_sujeta');
});

test('crearProductoSchema rechaza sin nombre', () => {
  const { error } = crearProductoSchema.validate({
    precio_unitario: 10,
  });
  assert.ok(error);
  assert.match(error.details[0].message, /nombre/i);
});

test('crearProductoSchema rechaza sin precio_unitario', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto sin precio',
  });
  assert.ok(error);
  assert.match(error.details[0].message, /precio/i);
});

test('crearProductoSchema rechaza tipo_item inválido', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto X',
    precio_unitario: 5,
    tipo_item: 9, // fuera de CAT-011 (1-4)
  });
  assert.ok(error);
  assert.match(error.details[0].message, /tipo de ítem/i);
});

test('crearProductoSchema rechaza uni_medida inválida', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto Y',
    precio_unitario: 5,
    uni_medida: 150, // fuera de CAT-014 (1-99)
  });
  assert.ok(error);
  assert.match(error.details[0].message, /unidad de medida/i);
});

test('crearProductoSchema rechaza tipo_venta inválido', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto Z',
    precio_unitario: 5,
    tipo_venta: 'exonerada',
  });
  assert.ok(error);
  assert.match(error.details[0].message, /tipo de venta/i);
});

test('crearProductoSchema rechaza codigo mayor a 25 caracteres', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto con código largo',
    codigo: 'X'.repeat(26),
    precio_unitario: 5,
  });
  assert.ok(error);
  assert.match(error.details[0].message, /25 caracteres/i);
});

test('crearProductoSchema rechaza precio_unitario negativo', () => {
  const { error } = crearProductoSchema.validate({
    nombre: 'Producto negativo',
    precio_unitario: -1,
  });
  assert.ok(error);
  assert.match(error.details[0].message, /negativo/i);
});

// ─────────────────────────────────────────────
// ACTUALIZAR (parcial)
// ─────────────────────────────────────────────
test('actualizarProductoSchema acepta actualización parcial sin nombre', () => {
  const { error, value } = actualizarProductoSchema.validate({
    precio_unitario: 99.99,
    tipo_venta: 'exenta',
  });

  assert.equal(error, undefined);
  assert.equal(value.precio_unitario, 99.99);
  assert.equal(value.tipo_venta, 'exenta');
  assert.equal(value.nombre, undefined);
});

test('actualizarProductoSchema acepta vaciar codigo con string vacío', () => {
  const { error, value } = actualizarProductoSchema.validate({
    codigo: '',
  });

  assert.equal(error, undefined);
  assert.equal(value.codigo, '');
});

test('actualizarProductoSchema rechaza campos inválidos', () => {
  const { error } = actualizarProductoSchema.validate({
    tipo_item: 0,
  });
  assert.ok(error);
});

// ─────────────────────────────────────────────
// BÚSQUEDA
// ─────────────────────────────────────────────
test('buscarProductosSchema acepta búsqueda con todos los filtros', () => {
  const { error, value } = buscarProductosSchema.validate({
    q: 'café',
    tipo_item: 1,
    tipo_venta: 'gravada',
    pagina: 2,
    limite: 50,
  });

  assert.equal(error, undefined);
  assert.equal(value.q, 'café');
  assert.equal(value.tipo_item, 1);
  assert.equal(value.tipo_venta, 'gravada');
  assert.equal(value.pagina, 2);
  assert.equal(value.limite, 50);
});

test('buscarProductosSchema aplica defaults de paginación', () => {
  const { error, value } = buscarProductosSchema.validate({});

  assert.equal(error, undefined);
  assert.equal(value.pagina, 1);
  assert.equal(value.limite, 10);
});

test('buscarProductosSchema rechaza limite mayor a 100', () => {
  const { error } = buscarProductosSchema.validate({ limite: 101 });
  assert.ok(error);
});

test('buscarProductosSchema rechaza tipo_item fuera de CAT-011', () => {
  const { error } = buscarProductosSchema.validate({ tipo_item: 7 });
  assert.ok(error);
});