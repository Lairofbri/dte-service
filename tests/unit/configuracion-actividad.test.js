// tests/unit/configuracion-actividad.test.js
// Pruebas de la resolución de actividad económica (CAT-019) en configuración.
//
// Entregable verificado:
// - La descripción de actividad se deriva SIEMPRE del catálogo oficial de
//   Hacienda cuando se envía codigo_actividad (nunca una inventada).
// - Códigos inexistentes en CAT-019 → 400.
// - Sin código, la descripción enviada se conserva (compatibilidad legada).

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');

// Mock de catalogos.service: evita la BD en los tests.
const catalogosPath = require.resolve('../../src/modules/catalogos/catalogos.service');
require.cache[catalogosPath] = {
  id: catalogosPath,
  filename: catalogosPath,
  loaded: true,
  exports: { obtenerActividadEconomica: async () => null },
};

const configPath = require.resolve('../../src/modules/configuracion/configuracion.service');

// Recarga configuracion.service para que capture el mock vigente del catálogo.
const cargarService = () => {
  delete require.cache[configPath];
  return require(configPath);
};

test('resuelve la descripción oficial cuando el código existe en CAT-019', async () => {
  require.cache[catalogosPath].exports.obtenerActividadEconomica = async ({ codigo }) => ({
    codigo,
    descripcion: 'Restaurantes',
  });

  const { resolverDescripcionActividad } = cargarService();
  const descripcion = await resolverDescripcionActividad({
    codigo_actividad: '56101',
    desc_actividad:   'Descripción inventada por el cliente',
  });

  assert.equal(descripcion, 'Restaurantes');
});

test('rechaza con 400 un código inexistente en CAT-019', async () => {
  require.cache[catalogosPath].exports.obtenerActividadEconomica = async () => null;

  const { resolverDescripcionActividad } = cargarService();
  await assert.rejects(
    () => resolverDescripcionActividad({
      codigo_actividad: '64101',
      desc_actividad:   'Cualquier cosa',
    }),
    (err) => err.status === 400 && err.mensaje.includes('64101') && err.mensaje.includes('CAT-019')
  );
});

test('sin código conserva la descripción enviada (compatibilidad legada)', async () => {
  require.cache[catalogosPath].exports.obtenerActividadEconomica = async () => {
    throw new Error('no debería consultar el catálogo sin código');
  };

  const { resolverDescripcionActividad } = cargarService();
  assert.equal(
    await resolverDescripcionActividad({ codigo_actividad: undefined, desc_actividad: 'Manual' }),
    'Manual'
  );
  assert.equal(await resolverDescripcionActividad({ codigo_actividad: null, desc_actividad: null }), null);
});