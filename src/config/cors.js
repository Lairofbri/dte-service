// src/config/cors.js
// Predicado de orígenes para el CORS del DTE Service. Vive fuera de `app.js`
// para poder probarlo sin levantar la app (que exige DATABASE_URL, etc.).
//
// CORS es un mecanismo del NAVEGADOR: el header `Origin` solo lo envían los
// navegadores en requests cross-origin. Las llamadas servidor-a-servidor
// (pos-backend → DTE: `GET /api/tenants` y `/internal/provisioning/*`) NO
// llevan `Origin`; bloquearlas rompía en producción la lectura de
// empresa/sucursal del POS (spec «DTE única fuente de verdad», F1/F3).
//
// Los requests sin `Origin` se permiten SIEMPRE: no hay nada que validar (la
// autenticación sigue siendo por API Key / JWT) y un atacante no necesita
// CORS — puede usar curl.
//
// El match es EXACTO: el `Origin` real nunca lleva barra final, así que una
// entrada `https://dominio/` en `CORS_ORIGINS` jamás coincidiría.

const esOrigenPermitido = (origin, corsOrigins = []) => {
  if (!origin) return true;
  return corsOrigins.includes(origin);
};

module.exports = { esOrigenPermitido };
