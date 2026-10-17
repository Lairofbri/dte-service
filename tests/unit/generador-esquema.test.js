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
const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const {
  construirEmisor,
  construirEmisorPorTipo,
  construirResumen,
  construirReceptorFCF,
  construirReceptorCCF,
  construirReceptorNCND,
} = require('../../src/modules/generador/generador.utils');
const { SCHEMA_REGISTRY } = require('../../src/modules/validacion-dte/dte-schema-registry');

const ajv = new Ajv({ allErrors: true, strict: false, multipleOfPrecision: 6 });
addFormats(ajv);

const validadorReceptor = (tipoDte) => {
  const { file } = SCHEMA_REGISTRY[tipoDte];
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  return ajv.compile(schema.properties.receptor);
};

const erroresDe = (validar, valor) =>
  validar(valor) ? [] : (validar.errors || []).map((e) => `${e.instancePath} ${e.message}`);

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

// ─────────────────────────────────────────────────────────────
// Regresión 2026-10-17 — receptor sin calle / sin ubicación
//
// El POS emitía FCF (01) con `departamento_cod`/`municipio_cod` y sin
// `direccion` → `complemento: ''` → el JSON generado fallaba el esquema
// oficial (minLength 1) y el DTE respondía 422 «El DTE no cumple el esquema
// oficial de Hacienda». Además CCF/NC/ND exigían `direccion` como objeto y
// devolvían null si el receptor no traía ubicación.
// ─────────────────────────────────────────────────────────────
test('receptor FCF (01): sin calle usa complemento S/D y cumple el esquema', () => {
  const receptor = construirReceptorFCF({
    nombre: 'Consumidor Final', tipo_documento: '37', num_documento: '000000',
    departamento_cod: '06', municipio_cod: '20',
  });

  assert.equal(receptor.direccion.complemento, 'S/D');
  assert.deepEqual(erroresDe(validadorReceptor('01'), receptor), []);
});

test('receptor FCF (01): sin ubicación del receptor deja direccion null y cumple el esquema', () => {
  const receptor = construirReceptorFCF({
    nombre: 'Consumidor Final', tipo_documento: '37', num_documento: '000000',
  });

  assert.equal(receptor.direccion, null);
  assert.deepEqual(erroresDe(validadorReceptor('01'), receptor), []);
});

test('receptor CCF (03): con ubicación del receptor cumple el esquema', () => {
  const receptor = construirReceptorCCF({
    nit: '06140101001010', nrc: '1234567', nombre: 'Cliente de Prueba',
    cod_actividad: '471100', desc_actividad: 'Venta de productos de prueba',
    departamento_cod: '06', municipio_cod: '14',
  });

  assert.equal(receptor.direccion.complemento, 'S/D');
  assert.deepEqual(erroresDe(validadorReceptor('03'), receptor), []);
});

test('receptor CCF (03): sin ubicación deja direccion null (el POS lo bloquea antes)', () => {
  const receptor = construirReceptorCCF({
    nit: '06140101001010', nrc: '1234567', nombre: 'Cliente de Prueba',
    cod_actividad: '471100', desc_actividad: 'Venta de productos de prueba',
  });

  assert.equal(receptor.direccion, null);
});

test('receptor NC/ND (05/06): con ubicación del receptor cumple el esquema', () => {
  const receptor = construirReceptorNCND({
    nit: '06140101001010', nrc: '1234567', nombre: 'Cliente de Prueba',
    cod_actividad: '471100', desc_actividad: 'Venta de productos de prueba',
    departamento_cod: '06', municipio_cod: '14',
  });

  assert.deepEqual(erroresDe(validadorReceptor('05'), receptor), []);
  assert.deepEqual(erroresDe(validadorReceptor('06'), receptor), []);
});