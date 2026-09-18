const path = require('path');

const SCHEMA_REGISTRY = Object.freeze({
  '01': Object.freeze({
    version: 2,
    file: path.join(__dirname, '../../schemas/mh/v2/fe-f-v2.json'),
  }),
  '03': Object.freeze({
    version: 4,
    file: path.join(__dirname, '../../schemas/mh/v4/fe-ccf-v4.json'),
  }),
  '05': Object.freeze({
    version: 4,
    file: path.join(__dirname, '../../schemas/mh/v4/fe-nc-v4.json'),
  }),
  '06': Object.freeze({
    version: 4,
    file: path.join(__dirname, '../../schemas/mh/v4/fe-nd-v4.json'),
  }),
  '14': Object.freeze({
    version: 2,
    file: path.join(__dirname, '../../schemas/mh/v2/fe-fse-v2.json'),
  }),
});

const obtenerSchemaDte = (tipoDte) => {
  const schema = SCHEMA_REGISTRY[tipoDte];
  if (!schema) {
    throw new Error(`No existe un JSON Schema registrado para el tipo DTE ${tipoDte}.`);
  }
  return schema;
};

module.exports = {
  SCHEMA_REGISTRY,
  obtenerSchemaDte,
};
