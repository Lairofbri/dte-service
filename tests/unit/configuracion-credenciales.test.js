// tests/unit/configuracion-credenciales.test.js
// Pruebas del manejo de credenciales Hacienda en configuración.
//
// Entregable verificado:
// - Credenciales indescifrables (clave rotada o dato corrupto) devuelven un
//   error CONTROLADO 400 con mensaje accionable, en vez de un error crudo
//   que el controller enmascara como "No se pudo conectar con Hacienda".

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath = require.resolve('../../src/config/database');
const catalogosPath = require.resolve('../../src/modules/catalogos/catalogos.service');
const servicePath = require.resolve('../../src/modules/configuracion/configuracion.service');

const { encriptar } = require('../../src/config/crypto');

// Configura los mocks y recarga el service (captura los mocks vigentes).
const cargarService = ({ queryMock }) => {
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: {
      query: queryMock || (async () => ({ rows: [] })),
      getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    },
  };
  require.cache[catalogosPath] = {
    id: catalogosPath,
    filename: catalogosPath,
    loaded: true,
    exports: { obtenerActividadEconomica: async () => null },
  };
  delete require.cache[servicePath];
  return require(servicePath);
};

// Cifra con la clave de prueba y altera el ciphertext → GCM no autentica.
const cifradoRoto = () => {
  const cifrado = encriptar('demo-pass-hacienda');
  const [salt, iv, tag, data] = cifrado.slice('enc:v2:'.length).split(':');
  const dataBuf = Buffer.from(data, 'base64');
  dataBuf[0] ^= 0xff;
  return `enc:v2:${salt}:${iv}:${tag}:${dataBuf.toString('base64')}`;
};

const filaConfiguracion = (usuarioHacienda, passwordHacienda) => ({
  id:                '1',
  nit:               '0000-000000-000-0',
  nrc:               null,
  nombre:            'Empresa Demo',
  direccion:         'Av. Principal 1',
  telefono:          null,
  email:             null,
  correo:            null,
  codigo_actividad:  '56101',
  codigo_establecimiento: '0001',
  codigo_punto_venta:     '0001',
  tipo_establecimiento:   '02',
  departamento_cod:  '06',
  municipio_cod:     '14',
  desc_actividad:    'Restaurantes',
  ambiente:          '00',
  usuario_hacienda:  usuarioHacienda,
  password_hacienda: passwordHacienda,
  token_hacienda:    null,
  token_expira_en:   null,
  activo:            true,
  creado_en:         new Date().toISOString(),
  actualizado_en:    new Date().toISOString(),
});

test('credenciales indescifrables → 400 controlado con mensaje accionable', async () => {
  const roto = cifradoRoto();
  const { obtenerCredencialesHacienda } = cargarService({
    queryMock: async () => ({ rows: [filaConfiguracion(roto, roto)] }),
  });

  await assert.rejects(
    () => obtenerCredencialesHacienda({ tenant_id: 'a1000000-0000-4000-8000-000000000001' }),
    (err) =>
      err.status === 400 &&
      err.mensaje.includes('descifrar') &&
      err.mensaje.includes('Vuelve a guardarlas') &&
      !err.mensaje.includes('Unsupported state')
  );
});

test('credenciales válidas se desencriptan y devuelven sin exponer cifrado', async () => {
  const { obtenerCredencialesHacienda } = cargarService({
    queryMock: async () => ({
      rows: [filaConfiguracion(encriptar('usuario@demo.sv'), encriptar('pass-real-123'))],
    }),
  });

  const credenciales = await obtenerCredencialesHacienda({ tenant_id: 'a1000000-0000-4000-8000-000000000001' });
  assert.equal(credenciales.usuario, 'usuario@demo.sv');
  assert.equal(credenciales.password, 'pass-real-123');
  assert.equal(credenciales.ambiente, '00');
});

test('sin credenciales configuradas → 400 "no hay credenciales"', async () => {
  const { obtenerCredencialesHacienda } = cargarService({
    queryMock: async () => ({ rows: [filaConfiguracion(null, null)] }),
  });

  await assert.rejects(
    () => obtenerCredencialesHacienda({ tenant_id: 'a1000000-0000-4000-8000-000000000001' }),
    (err) => err.status === 400 && err.mensaje.includes('No hay credenciales')
  );
});