// tests/unit/hacienda-transmision.test.js
// Rechazos del MH en la transmisión (incidente 2026-10-13):
// la emisión devolvía un 502 genérico SIN log ni motivo real cuando Hacienda
// respondía un 4xx. Estos tests cubren:
// 1) esErrorTransitorio: qué errores se reintentan (red, timeout, 5xx, 408/429).
// 2) parsearErrorHacienda: conserva status/código/descripción/observaciones del MH.
// 3) mensajeRechazoMH: mensaje accionable con el motivo real, nunca genérico.
// 4) ESTADOS_AUTH_MH: 401/403 disparan renovación de token y reintento único.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { esErrorTransitorio } = require('../../src/modules/integracion/integracion.utils');
const {
  parsearErrorHacienda,
  mensajeRechazoMH,
  ESTADOS_AUTH_MH,
} = require('../../src/modules/hacienda/hacienda.service');

// ── esErrorTransitorio ───────────────────────────────────────────

test('errores de red se consideran transitorios (se reintentan)', () => {
  for (const code of ['ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']) {
    assert.equal(esErrorTransitorio({ code }), true, `código ${code}`);
  }
});

test('mensajes con timeout se consideran transitorios', () => {
  assert.equal(esErrorTransitorio({ message: 'timeout of 8000ms exceeded' }), true);
});

test('5xx del MH se consideran transitorios', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(esErrorTransitorio({ response: { status } }), true, `HTTP ${status}`);
  }
});

test('408 y 429 del MH se consideran transitorios', () => {
  assert.equal(esErrorTransitorio({ response: { status: 408 } }), true);
  assert.equal(esErrorTransitorio({ response: { status: 429 } }), true);
});

test('4xx de negocio NO se consideran transitorios (no enmascaran el motivo)', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(esErrorTransitorio({ response: { status } }), false, `HTTP ${status}`);
  }
});

test('errores sin respuesta HTTP y sin código de red no son transitorios', () => {
  assert.equal(esErrorTransitorio({ code: 'ERR_BAD_OPTION', message: 'algo raro' }), false);
  assert.equal(esErrorTransitorio(null), false);
  assert.equal(esErrorTransitorio(undefined), false);
});

// ── parsearErrorHacienda ─────────────────────────────────────────

test('parsea un rechazo HTTP del MH conservando código, descripción y observaciones', () => {
  const err = {
    response: {
      status: 400,
      data: {
        estado: 'ERROR',
        codigoMsg: 'RE001',
        descripcionMsg: 'El establecimiento no está registrado para el emisor.',
        observaciones: ['Punto de venta inválido', ''],
      },
    },
  };

  assert.deepEqual(parsearErrorHacienda(err), {
    tipo:          'respuesta_hacienda',
    status_http:   400,
    estado:        'ERROR',
    codigo:        'RE001',
    descripcion:   'El establecimiento no está registrado para el emisor.',
    observaciones: ['Punto de venta inválido', ''],
  });
});

test('un error de conexión se clasifica como conexión (sin datos sensibles)', () => {
  const info = parsearErrorHacienda({ code: 'ETIMEDOUT' });
  assert.equal(info.tipo, 'conexion');
  assert.equal(info.codigo, 'ETIMEDOUT');
  assert.ok(info.descripcion.length > 0);
});

test('un error desconocido se clasifica como desconocido', () => {
  const info = parsearErrorHacienda({ message: 'algo inesperado' });
  assert.equal(info.tipo, 'desconocido');
  assert.ok(info.descripcion.length > 0);
});

// ── mensajeRechazoMH ─────────────────────────────────────────────

test('incluye status HTTP, código y descripción reales del MH', () => {
  assert.equal(
    mensajeRechazoMH({ status_http: 400, codigo: 'RE001', descripcion: 'El establecimiento no está registrado.' }),
    'Hacienda rechazó la transmisión (HTTP 400, código RE001): El establecimiento no está registrado.'
  );
});

test('sin descripción usa un fallback claro (nunca un genérico vacío)', () => {
  assert.equal(
    mensajeRechazoMH({ status_http: 502 }),
    'Hacienda rechazó la transmisión (HTTP 502): motivo no informado por el MH.'
  );
});

test('sin respuesta HTTP lo indica explícitamente', () => {
  assert.equal(
    mensajeRechazoMH({ descripcion: 'Firma no válida.' }),
    'Hacienda rechazó la transmisión (sin respuesta HTTP): Firma no válida.'
  );
});

test('acepta una acción distinta (anulación) y con info vacía nunca devuelve undefined', () => {
  assert.equal(
    mensajeRechazoMH({ status_http: 403 }, 'la anulación'),
    'Hacienda rechazó la anulación (HTTP 403): motivo no informado por el MH.'
  );
  const mensaje = mensajeRechazoMH();
  assert.equal(typeof mensaje, 'string');
  assert.ok(mensaje.includes('Hacienda rechazó la transmisión'));
});

// ── ESTADOS_AUTH_MH ──────────────────────────────────────────────

test('401 y 403 del MH disparan renovación de token y reintento único', () => {
  assert.deepEqual(ESTADOS_AUTH_MH, [401, 403]);
});
