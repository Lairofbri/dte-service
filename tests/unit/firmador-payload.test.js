// tests/unit/firmador-payload.test.js
// Contrato del request al firmador svfe v20260316 (Bluehost):
//
//   { nit: '<NIT sin guiones>', activo: true, passwordPri: '<secreto>',
//     dteJson: { ...DTE como OBJETO JSON... } }
//
// El svfe actual espera `dteJson` como OBJETO embebido. Enviarlo como string
// (JSON.stringify — contrato del firmador Windows anterior) produce el error
// interno 811 "Problemas al convertir String a Json" (verificado en vivo).

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_AUTH_HACIENDA = process.env.URL_AUTH_HACIENDA || 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
process.env.URL_RECEPCION_HACIENDA = process.env.URL_RECEPCION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte';
process.env.URL_CONSULTA_HACIENDA = process.env.URL_CONSULTA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';
process.env.URL_CONTINGENCIA_HACIENDA = process.env.URL_CONTINGENCIA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/contingencia';
process.env.URL_ANULACION_HACIENDA = process.env.URL_ANULACION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/anulardte';
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'https://firmador.cuscatec.com/firmardocumento/';

const test = require('node:test');
const assert = require('node:assert/strict');

// JWT mínimo que pasa `esJwt` (header.payload.firma en base64url)
const JWT_DUMMY = 'eyJhbGciOiJSUzUxMiJ9.eyJ0ZXN0IjoxfQ.firma-dummy';

// Carga el service del firmador con dependencias simuladas (sin BD) y el
// cliente HTTP capturado — así se inspecciona el body real del POST.
const cargarConClienteCapturado = () => {
  const envPath     = require.resolve('../../src/config/env');
  const configPath  = require.resolve('../../src/modules/configuracion/configuracion.service');
  const credPath    = require.resolve('../../src/modules/firmador/credenciales.service');
  const servicePath = require.resolve('../../src/modules/firmador/firmador.service');

  // Fakes en require.cache ANTES de cargar el service (evita BD)
  require.cache[configPath] = {
    id: configPath, filename: configPath, loaded: true,
    exports: { obtenerConfiguracion: async () => ({ nit: '0623-271125-102-2' }) },
  };
  require.cache[credPath] = {
    id: credPath, filename: credPath, loaded: true,
    exports: {
      obtenerPasswordFirma: async () => 'secreto-de-prueba',
      hayCredencialFirma:   async () => true,
    },
  };

  delete require.cache[envPath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  const capturado = { url: null, body: null };
  service.clienteFirmador.post = async (url, body) => {
    capturado.url  = url;
    capturado.body = body;
    return { data: { status: 'OK', body: JWT_DUMMY } };
  };

  return { service, capturado };
};

test('firmarDTE envía dteJson como OBJETO y el NIT sin guiones (contrato svfe v20260316)', async () => {
  const { service, capturado } = cargarConClienteCapturado();

  const jsonDte = {
    identificacion: { tipoDte: '01', numeroControl: 'DTE-01-M001P001-000000000000001' },
    emisor:         { nit: '06232711251022' },
    resumen:        { totalPagar: 10 },
  };

  const resultado = await service.firmarDTE({ jsonDte, tenant_id: 'tenant-prueba' });

  assert.equal(resultado, JWT_DUMMY, 'devuelve el JWT del firmador');
  assert.equal(capturado.url, process.env.URL_FIRMADOR);

  // El punto clave del contrato: objeto embebido, NUNCA un string
  assert.equal(typeof capturado.body.dteJson, 'object', 'dteJson va como objeto JSON');
  assert.equal(Array.isArray(capturado.body.dteJson), false);
  assert.deepEqual(capturado.body.dteJson, jsonDte, 'el DTE viaja completo e intacto');

  assert.equal(capturado.body.nit, '06232711251022', 'NIT sin guiones');
  assert.equal(capturado.body.activo, true);
  assert.equal(capturado.body.passwordPri, 'secreto-de-prueba', 'la contraseña se resuelve del proveedor');
});

test('firmarDTE traduce el error 811 del svfe sin inventar el significado', async () => {
  const { service, capturado } = cargarConClienteCapturado();
  service.clienteFirmador.post = async () => ({
    data: {
      status: 'ERROR',
      body: { codigo: '811', mensaje: 'Problemas al convertir String a Json' },
    },
  });
  void capturado;

  await assert.rejects(
    service.firmarDTE({ jsonDte: { identificacion: { tipoDte: '01' } }, tenant_id: 't' }),
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.mensaje, /no pudo procesar el documento/);
      assert.match(err.mensaje, /Problemas al convertir String a Json/, 'conserva el crudo del svfe');
      return true;
    }
  );
});