// tests/unit/catalogos.service.test.js
// Pruebas del módulo de catálogos oficiales de Hacienda (migración 027).
//
// Entregables verificados:
// - Whitelist estática: 33 catálogos (CAT-001 a CAT-033), slug → tabla.
// - listarCatalogo consulta la tabla de la whitelist ordenada por `orden`.
// - Slugs desconocidos → 404 (nunca SQL dinámico con entrada del cliente).
// - obtenerActividadEconomica resuelve código → descripción oficial (CAT-019).

const test = require('node:test');
const assert = require('node:assert/strict');

// Mock del pool: ningún test conecta a una BD real.
const databasePath = require.resolve('../../src/config/database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: { query: async () => ({ rows: [] }) },
};

const servicePath = require.resolve('../../src/modules/catalogos/catalogos.service');

// Recarga el service para que capture el mock vigente de `query`.
const cargarServicio = () => {
  delete require.cache[servicePath];
  return require(servicePath);
};

const { CATALOGOS } = cargarServicio();

test('whitelist: 33 catálogos con slug → tabla física (migración 027)', () => {
  assert.equal(Object.keys(CATALOGOS).length, 33);
  assert.equal(CATALOGOS['actividad-economica'], 'cat_019_actividad_economica');
  assert.equal(CATALOGOS['tipo-documento'], 'cat_002_tipo_documento');
  assert.equal(CATALOGOS['tipo-establecimiento'], 'cat_009_tipo_establecimiento');
  assert.equal(CATALOGOS['tipo-regimen'], 'cat_033_tipo_regimen');
});

test('listarCatalogo consulta la tabla de la whitelist ordenada por orden', async () => {
  let consultado = null;
  require.cache[databasePath].exports.query = async (texto) => {
    consultado = texto;
    return {
      rows: [
        { codigo: '01', descripcion: 'Factura' },
        { codigo: '03', descripcion: 'Comprobante de crédito fiscal' },
      ],
    };
  };

  const { listarCatalogo } = cargarServicio();
  const filas = await listarCatalogo({ catalogo: 'tipo-documento' });

  assert.ok(consultado.includes('cat_002_tipo_documento'), 'usa la tabla de la whitelist');
  assert.ok(consultado.includes('ORDER BY orden'), 'conserva el orden del Excel oficial');
  assert.equal(filas.length, 2);
  assert.equal(filas[0].codigo, '01');
});

test('listarCatalogo con slug desconocido devuelve 404 sin tocar la BD', async () => {
  let consultas = 0;
  require.cache[databasePath].exports.query = async () => {
    consultas++;
    return { rows: [] };
  };

  const { listarCatalogo } = cargarServicio();
  await assert.rejects(
    () => listarCatalogo({ catalogo: 'cat_019; DROP TABLE dtes;' }),
    (err) => err.status === 404 && Boolean(err.mensaje)
  );
  assert.equal(consultas, 0, 'nunca se interpola entrada del cliente en SQL');
});

test('obtenerActividadEconomica devuelve la fila oficial si el código existe', async () => {
  require.cache[databasePath].exports.query = async (texto, params) => {
    assert.ok(texto.includes('cat_019_actividad_economica'));
    return { rows: [{ codigo: params[0], descripcion: 'Restaurantes' }] };
  };

  const { obtenerActividadEconomica } = cargarServicio();
  const fila = await obtenerActividadEconomica({ codigo: '56101' });
  assert.equal(fila.codigo, '56101');
  assert.equal(fila.descripcion, 'Restaurantes');
});

test('obtenerActividadEconomica devuelve null si el código no existe o falta', async () => {
  require.cache[databasePath].exports.query = async () => ({ rows: [] });

  const { obtenerActividadEconomica } = cargarServicio();
  assert.equal(await obtenerActividadEconomica({ codigo: '64101' }), null);
  assert.equal(await obtenerActividadEconomica({ codigo: null }), null);
  assert.equal(await obtenerActividadEconomica({}), null);
});