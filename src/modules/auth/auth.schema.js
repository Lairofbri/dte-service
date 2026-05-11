// src/modules/auth/auth.schema.js
// Validación Joi para el módulo de autenticación
// Principio S (SOLID): solo valida, no opera ni responde

const Joi = require('joi');

/**
 * Schema para login
 * Email + password — sin más datos
 * El establecimiento viene del JWT después del login
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .required()
    .messages({
      'string.email': 'El email no tiene un formato válido.',
      'any.required': 'El email es requerido.',
    }),
  // Password sin validación de complejidad en login
  // Solo verificamos que no está vacío
  // La complejidad se valida al crear/actualizar el usuario
  password: Joi.string().min(1).required().messages({
    'any.required': 'El password es requerido.',
  }),
});

// refreshSchema y logoutSchema eliminados —
// el refresh token ya no viene en el body
// viene en una httpOnly cookie — más seguro contra XSS
// el navegador la envía automáticamente en cada request

module.exports = {
  loginSchema,
};
