// tests/unit/catalogos-territoriales.test.js
// Catálogos territoriales (incidente 2026-10-13 — rechazo 096 del MH por
// "emisor.direccion.municipio"): CAT-013 (municipio) y CAT-008 (distrito)
// repiten códigos entre departamentos — el par (departamento, código) es la
// clave real (migración 034).
// 1) construirConsultaCatalogo: filtro por departamento, columnas y errores.
// 2) validarUbicacionCatalogo: guardas sin BD y forma de los errores.

// Fallbacks de entorno: el módulo requiere config/env al cargarse; estos
// valores solo garantizan el require en CI sin .env (no se conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirConsultaCatalogo,
  validarUbicacionCatalogo,
} = require('../../src/modules/catalogos/catalogos.service');

// ── construirConsultaCatalogo ────────────────────────────────────

test('municipio sin filtro devuelve departamento_codigo y ordena por orden', () => {
  const { sql, params } = construirConsultaCatalogo('municipio');
  assert.match(sql, /SELECT codigo, descripcion, departamento_codigo FROM cat_013_municipio/);
  assert.match(sql, /ORDER BY orden$/);
  assert.ok(!sql.includes('WHERE'));
  assert.deepEqual(params, []);
});

test('municipio filtrado por departamento usa el par (departamento, código)', () => {
  const { sql, params } = construirConsultaCatalogo('municipio', '06');
  assert.match(sql, /WHERE departamento_codigo = \$1/);
  assert.deepEqual(params, ['06']);
});

test('distrito filtrado por departamento usa cat_008_distrito', () => {
  const { sql, params } = construirConsultaCatalogo('distrito', '06');
  assert.match(sql, /FROM cat_008_distrito/);
  assert.match(sql, /departamento_codigo = \$1/);
  assert.deepEqual(params, ['06']);
});

test('catálogos no territoriales no incluyen departamento_codigo ni aceptan filtro', () => {
  const { sql } = construirConsultaCatalogo('tipo-item');
  assert.ok(!sql.includes('departamento_codigo'));
  assert.throws(
    () => construirConsultaCatalogo('tipo-item', '06'),
    (err) => err.status === 400 && /no se filtra por departamento/i.test(err.mensaje)
  );
});

test('catálogo inexistente → 404 (whitelist)', () => {
  assert.throws(
    () => construirConsultaCatalogo('../../etc/passwd'),
    (err) => err.status === 404
  );
});

test('departamento con formato inválido → 400 (2 dígitos)', () => {
  for (const invalido of ['6', 'abc', '066']) {
    assert.throws(
      () => construirConsultaCatalogo('municipio', invalido),
      (err) => err.status === 400 && /2 dígitos/i.test(err.mensaje),
      `departamento inválido: ${JSON.stringify(invalido)}`
    );
  }
});

// ── validarUbicacionCatalogo (guardas sin BD) ────────────────────

test('sin datos devuelve sin errores y sin consultar la BD', async () => {
  assert.deepEqual(await validarUbicacionCatalogo({}), []);
  assert.deepEqual(await validarUbicacionCatalogo(), []);
});

test('municipio sin departamento → error de guarda (amarra departamento↔municipio)', async () => {
  const errores = await validarUbicacionCatalogo({ municipio_cod: '23' });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /departamento.*municipio/i);
});

test('distrito sin departamento → error de guarda', async () => {
  const errores = await validarUbicacionCatalogo({ distrito_cod: '19' });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /departamento.*distrito/i);
});
