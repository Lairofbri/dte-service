// src/middlewares/uuid.middleware.js
// Validación de UUIDs en params y query params
// Heredado del pos-backend con las mismas reglas

const { error } = require('../utils/response');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const esUuidValido = (valor) => {
  if (!valor || typeof valor !== 'string') return false;
  return UUID_REGEX.test(valor);
};

const validarUuidParam = (param = 'id', nombreLegible = null) => {
  return (req, res, next) => {
    const valor  = req.params[param];
    const nombre = nombreLegible || param;
    if (!esUuidValido(valor)) {
      return error(res, `El parámetro ${nombre} no tiene un formato UUID válido.`, 400);
    }
    next();
  };
};

const validarUuidQuery = (res, valor, nombre) => {
  if (valor && !esUuidValido(valor)) {
    error(res, `El parámetro ${nombre} no tiene un formato UUID válido.`, 400);
    return false;
  }
  return true;
};

module.exports = { esUuidValido, validarUuidParam, validarUuidQuery };
