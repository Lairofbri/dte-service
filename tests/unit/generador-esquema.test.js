// tests/unit/generador-esquema.test.js
// Guarda contra regresión la conformidad del generador con los esquemas
// oficiales de Hacienda (additionalProperties: false).
//
// Corrige la discrepancia documentada (2026-09-26): el emisor ya NO emite
// tipoEstablecimiento/codEstableMH/codPuntoVentaMH, el resumen incluye
// ivaRete (y no reteRenta/ivaRete1/ivaPerci1), y los campos se limitan a
// los admitidos por cada tipo DTE.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirEmisor,
  construirEmisorPorTipo,
  construirResumen,
} = require('../../src/modules/generador/generador.utils');

const CONFIG = {
  nit: '0000-000000-000-0',
  nrc: '00000',
  nombre: 'Restaurante Demo',
  codigo_actividad: '64101',
  desc_actividad: 'Venta de alimentos y bebidas',
  nombre_comercial: 'Restaurante Demo',
  correo: 'demo@restaurante.com',
  telefono: '2200-5000',
  email: 'demo@restaurante.com',
  direccion: 'Av. Principal 123',
};

const ESTABLECIMIENTO = {
  cod_estable_mh: 'M001',
  cod_punto_venta_mh: 'P001',
  cod_estable: 'M001',
  cod_punto_venta: 'P001',
  tipo_establecimiento: '02',
  departamento_cod: '06',
  municipio_cod: '14',
  distrito_cod: '14',
  direccion: 'Local 1',
  telefono: '2200-5000',
  correo: 'demo@restaurante.com',
};

const PROPS_EMISOR_01 = ['nit', 'nrc', 'nombre', 'codActividad', 'descActividad', 'nombreComercial', 'direccion', 'telefono', 'correo', 'codEstable', 'codPuntoVenta'];

test('construirEmisor no emite propiedades prohibidas del emisor FCF v2', () => {
  const emisor = construirEmisor(CONFIG, ESTABLECIMIENTO);
  const keys = Object.keys(emisor);
  for (const extra of ['tipoEstablecimiento', 'codEstableMH', 'codPuntoVentaMH']) {
    assert.ok(!keys.includes(extra), `no debe emitir ${extra}`);
  }
  assert.deepEqual(keys.sort(), PROPS_EMISOR_01.sort());
  assert.ok(emisor.descActividad.length >= 5);
});

test('construirEmisorPorTipo: FSE sin nombreComercial, NC/ND sin codEstable/codPuntoVenta', () => {
  const fse = construirEmisorPorTipo(CONFIG, ESTABLECIMIENTO, '14');
  assert.ok(!('nombreComercial' in fse));
  const nc = construirEmisorPorTipo(CONFIG, ESTABLECIMIENTO, '05');
  assert.ok(!('codEstable' in nc) && !('codPuntoVenta' in nc));
  const ccf = construirEmisorPorTipo(CONFIG, ESTABLECIMIENTO, '03');
  assert.ok('nombreComercial' in ccf && 'codEstable' in ccf);
});

const item01 = { numItem: 1, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 2.5, montoDescu: 0 };

test('construirResumen FCF (01): incluye ivaRete y excluye reteRenta/ivaRete1', () => {
  const resumen = construirResumen([item01], '01', 1, [{ codigo: '01', montoPago: 2.5, referencia: null, plazo: null, periodo: null }]);
  const keys = Object.keys(resumen);
  assert.ok(keys.includes('ivaRete'));
  assert.ok(keys.includes('totalIva'));
  assert.ok(!keys.includes('reteRenta'));
  assert.ok(!keys.includes('ivaRete1'));
  assert.ok(!keys.includes('ivaPerci1'));
  assert.equal(resumen.ivaRete, 0);
});

test('construirResumen CCF (03): incluye ivaPerci/ivaRete y NO totalIva', () => {
  const resumen = construirResumen([item01], '03', 1, [{ codigo: '01', montoPago: 2.83, referencia: null, plazo: null, periodo: null }]);
  assert.ok(resumen.ivaPerci === 0);
  assert.ok(resumen.ivaRete === 0);
  assert.ok(!('totalIva' in resumen));
  assert.ok(!('reteRenta' in resumen));
  assert.ok(!('ivaRete1' in resumen));
});

test('construirResumen NC/ND (05/06): sin pagos, con codigoRetencionMH', () => {
  const nc = construirResumen([item01], '05', 1, null);
  assert.ok(!('pagos' in nc));
  assert.ok('codigoRetencionMH' in nc);
  assert.ok('ivaRete' in nc && 'ivaPerci' in nc);
  const nd = construirResumen([item01], '06', 1, null);
  assert.ok(!('pagos' in nd));
  assert.ok('numPagoElectronico' in nd);
});