// tests/unit/configuracion.seguridad.test.js
// Pruebas de seguridad de la Fase 4 — credenciales y configuración fiscal.
//
// Entregables verificados:
// - Cifrado y redacción verificados: las credenciales Hacienda NUNCA salen
//   en respuestas HTTP (formatearParaRespuesta), se cifran AES-256-GCM en
//   reposo (crypto.js) y los logs las redactan (logger.redactar).
// - Prueba de autenticación Hacienda: POST /api/configuracion/test-hacienda
//   nunca devuelve el token.
// - Estado de firma por tenant: la credencial de firma proviene del entorno
//   (Secret Manager), nunca se persiste ni se devuelve.

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
process.env.FIRMADOR_PASSWORD_PRI = process.env.FIRMADOR_PASSWORD_PRI || 'secreto-global-test';
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
// ESTADO DE FIRMA POR TENANT — credencial desde
// Secret Manager/env, nunca persistida
// ─────────────────────────────────────────────

test('credenciales de firma: secreto por tenant (env/Secret Manager), sin persistencia', () => {
  const { obtenerPasswordFirma, hayCredencialFirma } = require('../../src/modules/firmador/credenciales.service');

  const TENANT_A = 'a2000000-0000-4000-8000-000000000001';
  const TENANT_B = 'a2000000-0000-4000-8000-000000000002';
  const claveOriginal = process.env[`FIRMADOR_PASSWORD_PRI_${TENANT_A}`];

  try {
    delete process.env[`FIRMADOR_PASSWORD_PRI_${TENANT_A}`];
    // Sin secreto por tenant → cae al global (definido arriba).
    assert.equal(obtenerPasswordFirma({ tenant_id: TENANT_A }), 'secreto-global-test');
    assert.equal(hayCredencialFirma({ tenant_id: TENANT_A }), true);

    // Secreto por tenant (simula Secret Manager inyectado por tenant).
    process.env[`FIRMADOR_PASSWORD_PRI_${TENANT_A}`] = 'secreto-tenant-A';
    assert.equal(obtenerPasswordFirma({ tenant_id: TENANT_A }), 'secreto-tenant-A');
    assert.equal(hayCredencialFirma({ tenant_id: TENANT_A }), true);

    // Otro tenant sin secreto propio → global.
    assert.equal(obtenerPasswordFirma({ tenant_id: TENANT_B }), 'secreto-global-test');
  } finally {
    if (claveOriginal === undefined) delete process.env[`FIRMADOR_PASSWORD_PRI_${TENANT_A}`];
    else process.env[`FIRMADOR_PASSWORD_PRI_${TENANT_A}`] = claveOriginal;
  }
});

test('obtenerEstadoFirmaTenant agrega el estado por tenant sin exponer secretos', async () => {
  const { obtenerEstadoFirmaTenant } = require('../../src/modules/firmador/firmador.service');

  const estado = await obtenerEstadoFirmaTenant({ tenant_id: TENANT, nit: '0614-260967-101-5' });

  assert.equal(estado.tenant_id, TENANT);
  assert.equal(estado.nit, '0614-260967-101-5');
  assert.ok(['listo', 'firmador_offline', 'sin_credencial'].includes(estado.estado));
  assert.equal(typeof estado.firmador_disponible, 'boolean');
  assert.equal(typeof estado.credencial_firma_disponible, 'boolean');
  assert.ok(!JSON.stringify(estado).includes('password'), 'el estado de firma nunca expone secretos');
});