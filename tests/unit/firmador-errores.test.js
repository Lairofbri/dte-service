// tests/unit/firmador-errores.test.js
// Pruebas de parsearErrorFirmador — traducción de códigos del svfe a mensajes
// accionables (803 llave pública, 809 NIT, 810 certificado, 811 contraseña,
// 812 certificado/llave inválidos, códigos desconocidos con el código visible).

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

const servicePath = require.resolve('../../src/modules/firmador/firmador.service');
const envPath = require.resolve('../../src/config/env');

const cargarServicio = () => {
  delete require.cache[envPath];
  delete require.cache[servicePath];
  return require(servicePath);
};

test('803 — no existe llave pública del NIT: mensaje accionable y menciona el certificado', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({
    status: 'ERROR',
    body: { codigo: '803', mensaje: 'No existe llave publica para este nit' },
  });
  assert.match(mensaje, /llave pública/, 'identifica el problema de llave');
  assert.match(mensaje, /certificado/, 'sugiere verificar el certificado');
});

test('809 — llave privada requerida (contraseña de firma vacía): mensaje accionable', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({
    body: { codigo: '809', mensaje: 'Clave privada es requerida' },
  });
  assert.match(mensaje, /contraseña de firma/, 'indica qué falta');
  assert.match(mensaje, /Clave privada es requerida/, 'conserva el mensaje real del svfe');
});

test('810 — certificado no encontrado', () => {
  const { parsearErrorFirmador } = cargarServicio();
  assert.match(
    parsearErrorFirmador({ body: { codigo: '810', mensaje: 'Certificado no encontrado' } }),
    /Certificado no encontrado/
  );
});

test('811 — no pudo procesar el documento: incluye el mensaje crudo (caso real del svfe)', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({
    body: { codigo: '811', mensaje: 'Problemas al convertir String a Json' },
  });
  assert.match(mensaje, /no pudo procesar el documento/, 'contexto real del svfe v20260316');
  assert.match(mensaje, /Problemas al convertir String a Json/, 'nunca inventar el significado del código');
});

test('812 — error interno del firmador: mensaje accionable para el operador de hosting', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({
    body: { codigo: '812', mensaje: "Unexpected character 'R' (code 82) in prolog; expected '<'" },
  });
  assert.match(mensaje, /error interno/, 'traduce el fallo interno del svfe');
  assert.match(mensaje, /hosting|svfe/, 'apunta a revisar el contenedor remoto');
});

test('código desconocido — incluye el código y el detalle crudo del firmador', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({ body: { codigo: '999', mensaje: 'Algo raro' } });
  assert.match(mensaje, /999/, 'visible para diagnóstico');
  assert.match(mensaje, /Algo raro/, 'conserva el detalle del firmador');
});

test('mensaje como array — se une con comas (en el fallback de código desconocido)', () => {
  const { parsearErrorFirmador } = cargarServicio();
  const mensaje = parsearErrorFirmador({
    body: { codigo: '999', mensaje: ['primero', 'segundo'] },
  });
  assert.match(mensaje, /primero, segundo/);
});

test('sin body — error desconocido controlado', () => {
  const { parsearErrorFirmador } = cargarServicio();
  assert.equal(parsearErrorFirmador(undefined), 'Error desconocido del firmador.');
  assert.equal(parsearErrorFirmador({}), 'Error desconocido del firmador.');
});