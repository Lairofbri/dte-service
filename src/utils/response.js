// src/utils/response.js
// Respuestas HTTP estandarizadas para el dte-service
// Nunca incluir información sensible en las respuestas

/**
 * Respuesta exitosa 200
 */
const exito = (res, data = null, mensaje = 'OK') => {
  return res.status(200).json({
    ok:      true,
    mensaje,
    data,
  });
};

/**
 * Recurso creado 201
 */
const creado = (res, data = null, mensaje = 'Creado exitosamente.') => {
  return res.status(201).json({
    ok:      true,
    mensaje,
    data,
  });
};

/**
 * Error del cliente 400-409
 */
const error = (res, mensaje = 'Error en la solicitud.', status = 400) => {
  return res.status(status).json({
    ok:      false,
    mensaje,
  });
};

/**
 * No autenticado 401
 */
const noAutenticado = (res, mensaje = 'API Key inválida o no proporcionada.') => {
  return res.status(401).json({
    ok:      false,
    mensaje,
  });
};

/**
 * Sin permiso 403
 */
const sinPermiso = (res, mensaje = 'No tiene permiso para realizar esta acción.') => {
  return res.status(403).json({
    ok:      false,
    mensaje,
  });
};

/**
 * No encontrado 404
 */
const noEncontrado = (res, mensaje = 'Recurso no encontrado.') => {
  return res.status(404).json({
    ok:      false,
    mensaje,
  });
};

/**
 * Error interno del servidor 500
 * NUNCA exponer detalles del error en producción
 */
const errorServidor = (res, mensaje = 'Error interno del servidor.') => {
  return res.status(500).json({
    ok:      false,
    mensaje,
  });
};

module.exports = {
  exito,
  creado,
  error,
  noAutenticado,
  sinPermiso,
  noEncontrado,
  errorServidor,
};
