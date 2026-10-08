// tests/unit/configuracion.seguridad.test.js
// Pruebas de seguridad de la Fase 4 — credenciales y configuración fiscal.
//
// Entregables verificados:
// - Cifrado y redacción verificados: las credenciales Hacienda NUNCA salen
//   en respuestas HTTP (formatearParaRespuesta), se cifran AES-256-GCM en
//   reposo (crypto.js) y los logs las redactan (logger.redactar).
// - Prueba de autenticación Hacienda: POST /api/configuracion/test-hacienda
//   nunca devuelve el token.
// - Contraseña de firma (passwordPri): POR TENANT, CIFRADA en BD
//   (configuracion.password_firma), nunca en entorno, nunca se devuelve.

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);
process.env.URL_AUTH_HACIENDA = process.env.URL_AUTH_HACIENDA || 'https://apitest.dtes.mh.gob.sv/seguridad/auth';
process.env.URL_RECEPCION_HACIENDA = process.env.URL_RECEPCION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte';
process.env.URL_CONSULTA_HACIENDA = process.env.URL_CONSULTA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/';
process.env.URL_CONTINGENCIA_HACIENDA = process.env.URL_CONTINGENCIA_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/contingencia';
process.env.URL_ANULACION_HACIENDA = process.env.URL_ANULACION_HACIENDA || 'https://apitest.dtes.mh.gob.sv/fesv/anulardte';
process.env.URL_FIRMADOR = process.env.URL_FIRMADOR || 'http://localhost:8113/firmardocumento/';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || null;

const test = require('node:test');
const assert = require('node:assert/strict');

const TENANT = 'a1000000-0000-4000-8000-000000000001';

// ─────────────────────────────────────────────
// CIFRADO EN REPOSO (AES-256-GCM)
// ─────────────────────────────────────────────

test('crypto: round-trip encriptar → desencriptar y formato versionado', () => {
  const { encriptar, desencriptar } = require('../../src/config/crypto');

  const cifrado = encriptar('password-hacienda-123');
  assert.ok(cifrado.startsWith('enc:v2:'), 'formato versionado');
  assert.ok(!cifrado.includes('password-hacienda-123'), 'el ciphertext no contiene el texto plano');
  assert.equal(desencriptar(cifrado), 'password-hacienda-123');
});

test('crypto: salt/IV aleatorios → ciphertext único por operación', () => {
  const { encriptar } = require('../../src/config/crypto');

  const a = encriptar('misma-clave');
  const b = encriptar('misma-clave');
  assert.notEqual(a, b, 'cada encriptación usa salt/IV nuevos');
});

test('crypto: encriptar valores vacíos devuelve null', () => {
  const { encriptar } = require('../../src/config/crypto');

  assert.equal(encriptar(null), null);
  assert.equal(encriptar(''), null);
});

// ─────────────────────────────────────────────
// REDACCIÓN EN RESPUESTAS HTTP
// ─────────────────────────────────────────────

test('formatearParaRespuesta NUNCA expone credenciales ni el token Hacienda', () => {
  const { formatearParaRespuesta } = require('../../src/modules/configuracion/configuracion.service');

  const fila = {
    id: '1',
    nit: '0614-260967-101-5',
    nrc: '123456-0',
    nombre: 'Empresa Demo',
    nombre_comercial: null,
    direccion: 'Av. Principal 1',
    telefono: '7777-7777',
    email: 'a@b.c',
    correo: 'a@b.c',
    codigo_actividad: '5610',
    codigo_establecimiento: '0001',
    codigo_punto_venta: '0001',
    tipo_establecimiento: '02',
    departamento_cod: '06',
    municipio_cod: '14',
    desc_actividad: 'Restaurante',
    ambiente: '00',
    usuario_hacienda: 'enc:usuario',
    password_hacienda: 'enc:password',
    token_hacienda: 'enc:token',
    token_expira_en: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    activo: true,
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  };

  const salida = formatearParaRespuesta(fila);

  assert.equal(salida.usuario_hacienda, undefined, 'usuario_hacienda no se expone');
  assert.equal(salida.password_hacienda, undefined, 'password_hacienda no se expone');
  assert.equal(salida.token_hacienda, undefined, 'token_hacienda no se expone');
  assert.equal(salida.tiene_credenciales_hacienda, true, 'solo se expone el booleano');
  assert.equal(salida.token_vigente, true, 'solo se expone el booleano de vigencia');
  assert.ok(salida.token_expira_en, 'la fecha de expiración sí es visible');
  assert.ok(!JSON.stringify(salida).includes('enc:password'), 'ningún valor cifrado filtra');
});

test('formatearParaRespuesta: token expirado → token_vigente false', () => {
  const { formatearParaRespuesta } = require('../../src/modules/configuracion/configuracion.service');

  const fila = {
    id: '1', nit: '0614-260967-101-5', nrc: null, nombre: 'X',
    direccion: 'Av. 1', telefono: null, email: null, correo: null,
    codigo_actividad: '5610', codigo_establecimiento: '0001',
    codigo_punto_venta: '0001', tipo_establecimiento: '02',
    departamento_cod: '06', municipio_cod: '14', desc_actividad: null,
    ambiente: '00', usuario_hacienda: 'enc:u', password_hacienda: 'enc:p',
    token_hacienda: 'enc:t', token_expira_en: new Date(Date.now() - 60 * 1000).toISOString(),
    activo: true, creado_en: null, actualizado_en: null,
  };

  const salida = formatearParaRespuesta(fila);
  assert.equal(salida.tiene_credenciales_hacienda, true);
  assert.equal(salida.token_vigente, false);
});

test('formatearParaRespuesta: sin credenciales → tiene_credenciales_hacienda false', () => {
  const { formatearParaRespuesta } = require('../../src/modules/configuracion/configuracion.service');

  const fila = {
    id: '1', nit: '0614-260967-101-5', nrc: null, nombre: 'X',
    direccion: 'Av. 1', telefono: null, email: null, correo: null,
    codigo_actividad: '5610', codigo_establecimiento: '0001',
    codigo_punto_venta: '0001', tipo_establecimiento: '02',
    departamento_cod: '06', municipio_cod: '14', desc_actividad: null,
    ambiente: '00', usuario_hacienda: null, password_hacienda: null,
    token_hacienda: null, token_expira_en: null,
    activo: true, creado_en: null, actualizado_en: null,
  };

  const salida = formatearParaRespuesta(fila);
  assert.equal(salida.tiene_credenciales_hacienda, false);
  assert.equal(salida.token_vigente, false);
});

// ─────────────────────────────────────────────
// REDACCIÓN EN LOGS
// ─────────────────────────────────────────────

test('logger.redactar oculta credenciales Hacienda, API Keys y JWT', () => {
  const { redactar } = require('../../src/utils/logger');

  const jwtLargo = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

  const entrada = {
    password_hacienda: 'MiPass123!',
    usuario_hacienda: 'usuario-hacienda',
    api_key: 'abcdef123456',
    anidado: { password: 'x', normal: 'ok' },
    normal: 'visible',
    documento: jwtLargo,
  };

  const salida = redactar(entrada);

  assert.equal(salida.password_hacienda, '[REDACTADO]');
  assert.equal(salida.usuario_hacienda, '[REDACTADO]');
  assert.equal(salida.api_key, '[REDACTADO]');
  assert.equal(salida.anidado.password, '[REDACTADO]');
  assert.equal(salida.anidado.normal, 'ok');
  assert.equal(salida.normal, 'visible');
  assert.equal(salida.documento, '[REDACTADO-JWT]');
  assert.ok(!JSON.stringify(salida).includes('MiPass123!'));
});

// ─────────────────────────────────────────────
// PRUEBA DE AUTENTICACIÓN HACIENDA (test-hacienda)
// ─────────────────────────────────────────────

const crearRes = () => {
  const res = {};
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (cuerpo) => {
    res.cuerpo = cuerpo;
    return res;
  };
  return res;
};

const inyectarServicioHacienda = (mock) => {
  const rutaHacienda = require.resolve('../../src/modules/hacienda/hacienda.service');
  require.cache[rutaHacienda] = {
    id: rutaHacienda,
    filename: rutaHacienda,
    loaded: true,
    exports: { autenticar: mock },
  };
};

test('test-hacienda exitoso devuelve conexión sin token ni credenciales', async () => {
  inyectarServicioHacienda(async () => ({ ambiente: '00' }));
  const controller = require('../../src/modules/configuracion/configuracion.controller');

  const res = crearRes();
  await controller.testHacienda({ tenantId: TENANT }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.cuerpo.data.conexion, 'exitosa');
  assert.equal(res.cuerpo.data.ambiente, '00');
  assert.equal(res.cuerpo.data.token, undefined, 'el token nunca viaja en la respuesta');
  assert.ok(!JSON.stringify(res.cuerpo).includes('token_hacienda'));
  assert.ok(!JSON.stringify(res.cuerpo).includes('password'));
});

test('test-hacienda con credenciales inválidas devuelve 400 sin secretos', async () => {
  inyectarServicioHacienda(async () => {
    throw { response: { status: 401 } };
  });
  const controller = require('../../src/modules/configuracion/configuracion.controller');

  const res = crearRes();
  await controller.testHacienda({ tenantId: TENANT }, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.cuerpo.mensaje.includes('Credenciales de Hacienda inválidas'));
});

test('test-hacienda sin credenciales configuradas devuelve 400', async () => {
  inyectarServicioHacienda(async () => {
    throw { status: 400, mensaje: 'No hay credenciales de Hacienda configuradas.' };
  });
  const controller = require('../../src/modules/configuracion/configuracion.controller');

  const res = crearRes();
  await controller.testHacienda({ tenantId: TENANT }, res);

  assert.equal(res.statusCode, 400);
  assert.ok(!JSON.stringify(res.cuerpo).includes('password'));
});

// ─────────────────────────────────────────────
// CONTRASEÑA DE FIRMA (passwordPri) POR TENANT — cifrada en BD,
// nunca en entorno, nunca devuelta al cliente
// ─────────────────────────────────────────────

test('logger.redactar oculta password_firma', () => {
  const { redactar } = require('../../src/utils/logger');

  const salida = redactar({ password_firma: 'clave-super-secreta', normal: 'ok' });

  assert.equal(salida.password_firma, '[REDACTADO]');
  assert.equal(salida.normal, 'ok');
});

test('credenciales de firma: se obtienen de la BD (cifrada) por tenant, no del entorno', async () => {
  const mockBD = async ({ tenant_id }) => {
    if (tenant_id === 'TENANT-CON-CLAVE') return 'clave-tenant-A';
    return null;
  };
  const rutaConfiguracion = require.resolve('../../src/modules/configuracion/configuracion.service');
  require.cache[rutaConfiguracion] = {
    id: rutaConfiguracion,
    filename: rutaConfiguracion,
    loaded: true,
    exports: { obtenerPasswordFirma: mockBD },
  };

  const rutaCredenciales = require.resolve('../../src/modules/firmador/credenciales.service');
  delete require.cache[rutaCredenciales];
  const { obtenerPasswordFirma, hayCredencialFirma } = require(rutaCredenciales);

  // Tenant con contraseña cargada → se obtiene.
  assert.equal(await obtenerPasswordFirma({ tenant_id: 'TENANT-CON-CLAVE' }), 'clave-tenant-A');
  assert.equal(await hayCredencialFirma({ tenant_id: 'TENANT-CON-CLAVE' }), true);

  // Tenant sin contraseña → error controlado 503 / false.
  await assert.rejects(
    () => obtenerPasswordFirma({ tenant_id: 'TENANT-SIN-CLAVE' }),
    (err) => err.status === 503 && err.mensaje.includes('No hay contraseña de firma configurada')
  );
  assert.equal(await hayCredencialFirma({ tenant_id: 'TENANT-SIN-CLAVE' }), false);

  // El entorno NUNCA influye (aunque existan variables obsoletas).
  process.env.FIRMADOR_PASSWORD_PRI = 'secreto-que-ya-no-se-usa';
  process.env.FIRMADOR_PASSWORD_PRI_TENANT_CON_CLAVE = 'otro-secreto';
  assert.equal(await obtenerPasswordFirma({ tenant_id: 'TENANT-CON-CLAVE' }), 'clave-tenant-A');
  delete process.env.FIRMADOR_PASSWORD_PRI;
  delete process.env.FIRMADOR_PASSWORD_PRI_TENANT_CON_CLAVE;
});

test('obtenerEstadoFirmaTenant agrega el estado por tenant sin exponer secretos', async () => {
  const rutaCredenciales = require.resolve('../../src/modules/firmador/credenciales.service');
  require.cache[rutaCredenciales] = {
    id: rutaCredenciales,
    filename: rutaCredenciales,
    loaded: true,
    exports: {
      obtenerPasswordFirma: async () => 'clave-tenant-A',
      hayCredencialFirma: async () => true,
    },
  };

  const rutaFirmador = require.resolve('../../src/modules/firmador/firmador.service');
  delete require.cache[rutaFirmador];
  const { obtenerEstadoFirmaTenant } = require(rutaFirmador);

  const estado = await obtenerEstadoFirmaTenant({ tenant_id: TENANT, nit: '0614-260967-101-5' });

  assert.equal(estado.tenant_id, TENANT);
  assert.equal(estado.nit, '0614-260967-101-5');
  assert.ok(['listo', 'firmador_offline', 'sin_credencial'].includes(estado.estado));
  assert.equal(typeof estado.firmador_disponible, 'boolean');
  assert.equal(typeof estado.credencial_firma_disponible, 'boolean');
  assert.equal(estado.credencial_firma_disponible, true, 'la credencial viene de la BD por tenant');
  assert.ok(!JSON.stringify(estado).includes('password'), 'el estado de firma nunca expone secretos');
});