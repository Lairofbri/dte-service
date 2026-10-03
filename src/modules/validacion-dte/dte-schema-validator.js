const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { obtenerSchemaDte } = require('./dte-schema-registry');

// multipleOfPrecision: corrige el falso negativo de ajv con `multipleOf` decimal
// (p.ej. 0.29 no pasa `multipleOf: 0.01` por representación binaria, pero es un
// valor válido). Se usa una tolerancia relativa (1e-6) sobre el cociente, que
// sigue rechazando valores que no son múltiplos reales (p.ej. 0.2875 con 0.01).
// El esquema oficial NO se modifica; solo se ajusta el motor de validación local.
const ajv = new Ajv({ allErrors: true, strict: false, multipleOfPrecision: 6 });
addFormats(ajv);

const validadores = new Map();

const obtenerValidador = (tipoDte) => {
  if (!validadores.has(tipoDte)) {
    const { file } = obtenerSchemaDte(tipoDte);
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    validadores.set(tipoDte, ajv.compile(schema));
  }
  return validadores.get(tipoDte);
};

const validarDte = (jsonDte) => {
  const tipoDte = jsonDte?.identificacion?.tipoDte;
  const validar = obtenerValidador(tipoDte);
  const valido = validar(jsonDte);

  if (!valido) {
    const error = new Error('El JSON DTE no cumple el JSON Schema oficial de Hacienda.');
    error.code = 'DTE_SCHEMA_VALIDATION_FAILED';
    error.status = 422;
    error.mensaje = 'El DTE no cumple el esquema oficial de Hacienda.';
    error.detalles = (validar.errors || []).map(({ instancePath, schemaPath, keyword, message, params }) => ({
      ruta: instancePath || '$',
      regla: schemaPath,
      keyword,
      mensaje: message,
      parametros: params,
    }));
    throw error;
  }

  return true;
};

module.exports = {
  validarDte,
};
