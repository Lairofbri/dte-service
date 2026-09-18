const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esJwt,
  generarIdEnvio,
  esErrorTransitorio,
  respuestaHaciendaAuditable,
} = require('../../src/modules/integracion/integracion.utils');

test('valida el formato estructural del JWT del firmador', () => {
  assert.equal(esJwt('eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.signature'), true);
  assert.equal(esJwt('not-a-jwt'), false);
  assert.equal(esJwt({}), false);
});

test('genera identificadores de envío distintos en llamadas consecutivas', () => {
  const primero = generarIdEnvio();
  const segundo = generarIdEnvio();
  assert.ok(segundo > primero);
});

test('clasifica solamente errores transitorios para reintento', () => {
  assert.equal(esErrorTransitorio({ code: 'ETIMEDOUT' }), true);
  assert.equal(esErrorTransitorio({ response: { status: 503 } }), true);
  assert.equal(esErrorTransitorio({ response: { status: 400 } }), false);
});

test('normaliza la respuesta de Hacienda sin incluir tokens', () => {
  assert.deepEqual(respuestaHaciendaAuditable({
    estado: 'PROCESADO',
    sello: 'sello',
    codigo_error: '0',
    descripcion: 'ok',
    token: 'no debe persistir',
  }), {
    estado: 'PROCESADO',
    codigoMsg: '0',
    descripcionMsg: 'ok',
    selloRecibido: 'sello',
    fhProcesamiento: null,
    observaciones: [],
  });
});
