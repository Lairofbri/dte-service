const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA_REGISTRY } = require('../../src/modules/validacion-dte/dte-schema-registry');
const { validarDte } = require('../../src/modules/validacion-dte/dte-schema-validator');
const fixturesDir = path.join(__dirname, '../fixtures/dte/fase-4');

const values = {
  nit: '06140101001010',
  nrc: '1234567',
  nombre: 'Contribuyente de Prueba',
  codActividad: '471100',
  descActividad: 'Venta de productos de prueba',
  nombreComercial: 'Comercio de Prueba',
  tipoDocumento: '36',
  numDocumento: '06140101001010',
  direccion: 'Colonia de Prueba, calle principal',
  departamento: '06',
  municipio: '20',
  distrito: '20',
  telefono: '22223333',
  correo: 'prueba@example.com',
  codEstable: 'M001',
  codPuntoVenta: 'P001',
  codigoGeneracion: '11111111-2222-4333-8444-555555555555',
  numeroControl: 'DTE-01-M001P001-000000000000001',
  fecha: '2026-01-15',
  hora: '10:30:00',
  descripcion: 'Producto de prueba',
  totalLetras: 'DIEZ 00/100 DOLARES',
  codigo: '01',
  codTributo: '20',
  fusion: '123456789',
};

const getType = (schema) => {
  if (Array.isArray(schema.type)) return schema.type.find((type) => type !== 'null') || schema.type[0];
  return schema.type;
};

const valueFor = (key, schema) => {
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum.find((value) => value !== null) ?? null;
  if (key === 'numeroControl') return values.numeroControl.replace('01', schema.properties?.tipoDte?.const || '01');
  if (key === 'codigoGeneracion') return values.codigoGeneracion;
  if (key === 'fecEmi' || key === 'fechaEmision') return values.fecha;
  if (key === 'horEmi') return values.hora;
  switch (getType(schema)) {
    case 'boolean': return false;
    case 'integer':
    case 'number': return schema.exclusiveMinimum !== undefined
      ? schema.exclusiveMinimum + 1
      : (schema.minimum || 0);
    case 'array': {
      const itemType = getType(schema.items || {});
      return [itemType === 'object' ? buildObject(schema.items) : valueFor(key, schema.items || {})];
    }
    case 'object': return buildObject(schema);
    case 'null': return null;
    default: {
      if (key === 'tributos' || key === 'codTributo') return '20';
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : 'PRUEBA';
    }
  }
};

const buildObject = (schema) => {
  const result = {};
  for (const key of schema.required || []) {
    result[key] = valueFor(key, schema.properties?.[key] || {});
  }
  return result;
};

const buildValidDte = (tipoDte) => {
  const { file } = SCHEMA_REGISTRY[tipoDte];
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dte = buildObject(schema);
  dte.identificacion.numeroControl = `DTE-${tipoDte}-M001P001-000000000000001`;

  // The schemas require nullable containers to be present even when unused.
  for (const key of ['documentoRelacionado', 'otrosDocumentos', 'ventaTercero', 'apendice']) {
    if (key in schema.properties && !(key in dte)) dte[key] = null;
  }
  return dte;
};

test('los cinco tipos requeridos tienen schemas registrados y versionados', () => {
  assert.deepEqual(Object.keys(SCHEMA_REGISTRY).sort(), ['01', '03', '05', '06', '14']);
  for (const schema of Object.values(SCHEMA_REGISTRY)) {
    assert.equal(fs.existsSync(schema.file), true);
  }
});

test('cada fixture generado por el contrato mínimo es válido', () => {
  for (const tipoDte of Object.keys(SCHEMA_REGISTRY)) {
    const dte = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'valid', `${tipoDte}.json`), 'utf8'));
    try {
      validarDte(dte);
    } catch (error) {
      assert.fail(`${tipoDte}: ${JSON.stringify(error.detalles)}`);
    }
  }
});

test('rechaza propiedades fiscales que el schema oficial no permite', () => {
  const dte = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'invalid', '01-extra-property.json'), 'utf8'));

  assert.throws(
    () => validarDte(dte),
    (error) => error.code === 'DTE_SCHEMA_VALIDATION_FAILED'
      && error.detalles.some((detalle) => detalle.ruta.includes('emisor'))
  );
});

test('rechaza una versión incorrecta', () => {
  const dte = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'invalid', '03-version.json'), 'utf8'));

  assert.throws(
    () => validarDte(dte),
    (error) => error.code === 'DTE_SCHEMA_VALIDATION_FAILED'
      && error.detalles.some((detalle) => detalle.ruta.includes('version'))
  );
});

test('rechaza un receptor incompleto', () => {
  const dte = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'invalid', '14-receptor.json'), 'utf8'));

  assert.throws(
    () => validarDte(dte),
    (error) => error.code === 'DTE_SCHEMA_VALIDATION_FAILED'
      && error.detalles.some((detalle) => detalle.ruta.includes('receptor'))
  );
});
