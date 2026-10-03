// tests/unit/configuracion.schema.test.js
// Pruebas de validación Joi del módulo de configuración.
//
// Entregable verificado:
// - Credenciales Hacienda SIN restricciones de formato: la validez la
//   verifica Hacienda al autenticar. Password vacío = no cambiar.
// - Creación posible solo con datos del emisor (credenciales opcionales).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearConfiguracionSchema,
  actualizarConfiguracionSchema,
} = require('../../src/modules/configuracion/configuracion.schema');

const baseEmisor = {
  nit:              '0614-260967-101-5',
  nombre:           'Empresa Demo',
  direccion:        'Av. Principal 1',
  codigo_actividad: '56101',
  ambiente:         '00',
};

test('update: acepta password corta sin caracteres especiales (la valida Hacienda)', () => {
  const resultado = actualizarConfiguracionSchema.validate({ password_hacienda: 'abc123' });
  assert.equal(resultado.error, undefined);
});

test('update: acepta password larga y usuario de correo largo', () => {
  const resultado = actualizarConfiguracionSchema.validate({
    usuario_hacienda:  'usuario.largo@empresa.com.gob.sv',
    password_hacienda: 'x'.repeat(50),
  });
  assert.equal(resultado.error, undefined);
});

test('update: password vacío es válido (no cambiar)', () => {
  const resultado = actualizarConfiguracionSchema.validate({ password_hacienda: '' });
  assert.equal(resultado.error, undefined);
});

test('update: solo datos del emisor sin credenciales es válido', () => {
  const resultado = actualizarConfiguracionSchema.validate({ nombre: 'Empresa Renombrada' });
  assert.equal(resultado.error, undefined);
});

test('create: credenciales opcionales — se puede crear solo con datos del emisor', () => {
  const resultado = crearConfiguracionSchema.validate(baseEmisor);
  assert.equal(resultado.error, undefined);
});

test('create: acepta credenciales de cualquier formato', () => {
  const resultado = crearConfiguracionSchema.validate({
    ...baseEmisor,
    usuario_hacienda:  'user',
    password_hacienda: 'corta',
  });
  assert.equal(resultado.error, undefined);
});

test('create: sigue exigiendo los datos fiscales del emisor', () => {
  const resultado = crearConfiguracionSchema.validate({ ...baseEmisor, nit: undefined });
  assert.ok(resultado.error, 'el NIT sigue siendo requerido');
});

test('create: acepta NIT y NRC sin guiones (formato normalizado)', () => {
  const resultado = crearConfiguracionSchema.validate({
    ...baseEmisor,
    nit: '06142609671015',
    nrc: '1234560',
  });
  assert.equal(resultado.error, undefined);
});

test('update: acepta NIT y NRC en ambos formatos (con y sin guiones)', () => {
  assert.equal(actualizarConfiguracionSchema.validate({ nit: '0614-260967-101-5' }).error, undefined);
  assert.equal(actualizarConfiguracionSchema.validate({ nit: '06142609671015' }).error, undefined);
  assert.equal(actualizarConfiguracionSchema.validate({ nrc: '123456-0' }).error, undefined);
  assert.equal(actualizarConfiguracionSchema.validate({ nrc: '1234560' }).error, undefined);
  assert.equal(actualizarConfiguracionSchema.validate({ telefono: '2200-5000' }).error, undefined);
  assert.equal(actualizarConfiguracionSchema.validate({ telefono: '22005000' }).error, undefined);
});