// tests/unit/clientes-tipos.test.js
// Reglas de identificación de clientes (receptores DTE) en El Salvador:
//   natural          → DUI o NIT (documentos homologados)
//   juridico         → NIT (una empresa no tiene DUI)
//   sujeto_excluido  → DUI (no es empresa; factura FSE-14)
//
// Cubre el contrato Joi de clientes, la normalización del receptor FSE
// (tipoDocumento/numDocumento en vez de NIT) y el generador.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearClienteSchema,
  actualizarClienteSchema,
  buscarClientesSchema,
} = require('../../src/modules/clientes/clientes.schema');
const { emitirFSESchema } = require('../../src/modules/dtes/dtes.schema');
const { construirReceptorFSE } = require('../../src/modules/generador/generador.utils');

const valida = (schema, payload) => schema.validate(payload);

const DUI = '01234567-8';
const NIT = '0614-010101-001-5';

// ── Clientes ──

test('natural: acepta DUI (documento homologado)', () => {
  const { error } = valida(crearClienteSchema, {
    tipo_cliente: 'natural', nombre: 'Ana Pérez',
    tipo_documento: '13', num_documento: DUI,
  });
  assert.equal(error, undefined);
});

test('natural: acepta NIT (homologado con el DUI)', () => {
  const { error } = valida(crearClienteSchema, {
    tipo_cliente: 'natural', nombre: 'Ana Pérez',
    tipo_documento: '36', num_documento: NIT,
  });
  assert.equal(error, undefined);
});

test('juridico: exige NIT', () => {
  const { error } = valida(crearClienteSchema, {
    tipo_cliente: 'juridico', nombre: 'Comercial S.A. de C.V.',
  });
  assert.ok(error);
  assert.match(error.message, /NIT/i);
});

test('juridico: acepta NIT (una empresa no tiene DUI)', () => {
  const { error } = valida(crearClienteSchema, {
    tipo_cliente: 'juridico', nombre: 'Comercial S.A. de C.V.', nit: NIT,
  });
  assert.equal(error, undefined);
});

test('sujeto_excluido: exige el número de DUI', () => {
  const { error } = valida(crearClienteSchema, {
    tipo_cliente: 'sujeto_excluido', nombre: 'Juan Sujeto Excluido',
  });
  assert.ok(error);
  assert.match(error.message, /DUI/i);
});

test('sujeto_excluido: acepta DUI y normaliza tipo_documento=13', () => {
  const { error, value } = valida(crearClienteSchema, {
    tipo_cliente: 'sujeto_excluido', nombre: 'Juan Sujeto Excluido', num_documento: DUI,
  });
  assert.equal(error, undefined);
  assert.equal(value.tipo_documento, '13');
});

test('buscar: acepta el filtro sujeto_excluido', () => {
  const { error, value } = valida(buscarClientesSchema, { tipo_cliente: 'sujeto_excluido' });
  assert.equal(error, undefined);
  assert.equal(value.tipo_cliente, 'sujeto_excluido');
});

test('actualizar: acepta convertir el tipo de cliente', () => {
  const { error, value } = valida(actualizarClienteSchema, { tipo_cliente: 'sujeto_excluido' });
  assert.equal(error, undefined);
  assert.equal(value.tipo_cliente, 'sujeto_excluido');
});

// ── FSE: sujeto excluido con DUI ──

const itemsFSE = [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 10 }];

test('FSE: acepta receptor solo con DUI (tipo_documento + num_documento)', () => {
  const { error } = valida(emitirFSESchema, {
    items: itemsFSE,
    receptor: { tipo_documento: '13', num_documento: DUI, nombre: 'Juan Sujeto Excluido' },
  });
  assert.equal(error, undefined);
});

test('FSE: sigue aceptando receptor con NIT', () => {
  const { error } = valida(emitirFSESchema, {
    items: itemsFSE,
    receptor: { nit: NIT, nombre: 'Sujeto Excluido' },
  });
  assert.equal(error, undefined);
});

test('FSE: acepta el alias sujeto_excluido con DUI', () => {
  const { error } = valida(emitirFSESchema, {
    items: itemsFSE,
    sujeto_excluido: { tipo_documento: '13', numero_documento: DUI, nombre: 'Juan Sujeto Excluido' },
  });
  assert.equal(error, undefined);
});

test('FSE: rechaza receptor sin NIT ni número de documento', () => {
  const { error } = valida(emitirFSESchema, {
    items: itemsFSE,
    receptor: { nombre: 'Sujeto Excluido' },
  });
  assert.ok(error);
  assert.match(error.message, /NIT|documento/i);
});

test('generador FSE: con DUI usa tipoDocumento=13 y numDocumento del DUI', () => {
  const receptor = construirReceptorFSE({
    tipo_documento: '13', num_documento: DUI, nombre: 'Juan Sujeto Excluido',
  });
  assert.equal(receptor.tipoDocumento, '13');
  assert.equal(receptor.numDocumento, DUI);
  assert.equal(receptor.nombre, 'Juan Sujeto Excluido');
});

test('generador FSE: sin documento explícito cae al NIT (compatibilidad)', () => {
  const receptor = construirReceptorFSE({ nit: NIT, nombre: 'Sujeto Excluido' });
  assert.equal(receptor.tipoDocumento, '36');
  assert.equal(receptor.numDocumento, '06140101010015');
});
