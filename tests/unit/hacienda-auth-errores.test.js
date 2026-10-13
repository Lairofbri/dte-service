// tests/unit/hacienda-auth-errores.test.js
// Traducción de rechazos de autenticación del MH a mensajes accionables.
//
// Contexto real (verificado en vivo contra el MH):
// - El endpoint /seguridad/auth responde HTTP 200 con el rechazo en el body:
//   {"status":"ERROR","body":{"codigoMsg":"101","descripcionMsg":"..."}}
// - Códigos observados: 101 = usuario no encontrado/no habilitado para API
//   (correo del cliente e usuarios inventados), 106 = credenciales inválidas
//   (usuario existe con contraseña incorrecta).
// - Antes este motivo se descartaba y todo error se veía idéntico en la UI.

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

const { mensajeRechazo } = require('../../src/modules/hacienda/hacienda.service');

test('código 101 (usuario no encontrado) → mensaje que menciona el NIT como usuario de aplicación', () => {
  const mensaje = mensajeRechazo({ codigo: '101', descripcion: 'ERROR CONTACTAR CON SOPORTE TÉCNICO' });
  assert.match(mensaje, /no reconoce el usuario/);
  assert.match(mensaje, /NIT del emisor/);
  assert.match(mensaje, /usuario de aplicación/);
});

test('código 106 (credenciales inválidas) → mensaje de contraseña incorrecta', () => {
  const mensaje = mensajeRechazo({ codigo: '106', descripcion: 'CREDENCIALES INVÁLIDAS' });
  assert.match(mensaje, /Contraseña de Hacienda incorrecta/);
});

test('código 103 (contraseña expirada) → mensaje de expiración', () => {
  const mensaje = mensajeRechazo({ codigo: '103' });
  assert.match(mensaje, /expiró/);
  assert.match(mensaje, /portal del MH/);
});

test('código 102 (no se pudo autenticar) → mensaje de verificación', () => {
  const mensaje = mensajeRechazo({ codigo: '102' });
  assert.match(mensaje, /No se pudo autenticar/);
});

test('código desconocido con descripción → usa la descripción del MH como respaldo', () => {
  const mensaje = mensajeRechazo({ codigo: '999', descripcion: 'FALLA INTERNA X' });
  assert.match(mensaje, /código 999/);
  assert.match(mensaje, /FALLA INTERNA X/);
});

test('sin código ni descripción → mensaje genérico', () => {
  assert.equal(
    mensajeRechazo(),
    'Hacienda rechazó las credenciales. Verifica usuario y contraseña.'
  );
  assert.equal(
    mensajeRechazo({ codigo: null, descripcion: null }),
    'Hacienda rechazó las credenciales. Verifica usuario y contraseña.'
  );
});

test('código numérico (no string) también se mapea', () => {
  assert.match(mensajeRechazo({ codigo: 106 }), /Contraseña de Hacienda incorrecta/);
});