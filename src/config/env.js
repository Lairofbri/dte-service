// src/config/env.js
// Carga y valida TODAS las variables de entorno al arrancar
// Si falta alguna crítica el servidor NO arranca — fail-fast
// En el DTE Service esto es especialmente importante:
// arrancar sin credenciales podría emitir DTEs inválidos

require('dotenv').config();

const requerida = (nombre) => {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `[DTE-SERVICE] Variable de entorno crítica no definida: ${nombre}\n` +
      `El servicio no puede arrancar sin esta variable.`
    );
  }
  return valor;
};

const opcionalInt = (nombre, porDefecto) => {
  const valor = process.env[nombre];
  return valor ? parseInt(valor, 10) : porDefecto;
};

const opcional = (nombre, porDefecto = null) =>
  process.env[nombre] || porDefecto;

module.exports = {
  // Servidor
  NODE_ENV:       process.env.NODE_ENV || 'development',
  PORT:           opcionalInt('PORT', 4000),
  ES_PRODUCCION:  process.env.NODE_ENV === 'production',

  // Base de datos
  DATABASE_URL: requerida('DATABASE_URL'),
  DB_SSL_REJECT_UNAUTHORIZED: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',

  // ── Seguridad del servicio ──
  // API Key hasheada con bcrypt — el POS envía la API Key raw
  // este servicio la compara contra el hash. Opcional: si no está en env,
  // se obtiene de la tabla tenants (multi-tenant).
  API_KEY_HASH:    opcional('API_KEY_HASH'),
  // Clave para cifrar credenciales sensibles en BD (AES-256-GCM vía scrypt).
  // OBLIGATORIA: sin ella el servicio no arranca (fail-fast).
  // Mínimo 32 caracteres para garantizar una clave fuerte.
  ENCRYPTION_KEY: (() => {
    const clave = requerida('ENCRYPTION_KEY');
    if (clave.length < 32) {
      throw new Error(
        '[DTE-SERVICE] ENCRYPTION_KEY debe tener al menos 32 caracteres.\n' +
        'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    }
    return clave;
  })(),

  // ── Hacienda — URLs OFICIALES del MH (templates) ──
  // Los datos del emisor (NIT, nombre, credenciales) viven en la BD
  // tabla configuracion — nunca en variables de entorno.
  //
  // MULTI-EMPRESA: el ambiente es POR EMPRESA (configuracion.ambiente,
  // editable desde el panel: 00 = pruebas, 01 = producción). En cada
  // llamada (auth, recepción, consulta, contingencia, anulación, lotes)
  // el servicio normaliza el HOST al ambiente de la empresa
  // (urlParaAmbiente): apitest.dtes.mh.gob.sv ↔ api.dtes.mh.gob.sv.
  // Por eso NO hace falta tocar estas variables para que cada empresa
  // use su ambiente — son opcionales y apuntan a los hosts oficiales.
  // Solo se definen si algún día el MH cambiara de host/path.
  AMBIENTE_HACIENDA:         opcional('AMBIENTE_HACIENDA', '00'),
  URL_AUTH_HACIENDA:         opcional('URL_AUTH_HACIENDA', 'https://apitest.dtes.mh.gob.sv/seguridad/auth'),
  URL_RECEPCION_HACIENDA:    opcional('URL_RECEPCION_HACIENDA', 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte'),
  URL_CONSULTA_HACIENDA:     opcional('URL_CONSULTA_HACIENDA', 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/'),
  URL_CONTINGENCIA_HACIENDA: opcional('URL_CONTINGENCIA_HACIENDA', 'https://apitest.dtes.mh.gob.sv/fesv/contingencia'),
  URL_ANULACION_HACIENDA:    opcional('URL_ANULACION_HACIENDA', 'https://apitest.dtes.mh.gob.sv/fesv/anulardte'),
  TIMEOUT_HACIENDA:          opcionalInt('TIMEOUT_HACIENDA', 8000),
  MAX_REINTENTOS_HACIENDA:   opcionalInt('MAX_REINTENTOS_HACIENDA', 2),

  // ── Firmador ──
  URL_FIRMADOR:     requerida('URL_FIRMADOR'),
  TIMEOUT_FIRMADOR: opcionalInt('TIMEOUT_FIRMADOR', 10000),
  // NOTA: el firmador remoto (svfe-api-firmador en Bluehost) NO requiere
  // autenticación por token/API key — la seguridad es HTTPS + IP allowlist.
  // La contraseña del certificado (passwordPri) es POR TENANT y vive CIFRADA
  // en BD (configuracion.password_firma) — nunca en variables de entorno.

  // ── S3/R2 ──
  S3_ENDPOINT:   opcional('S3_ENDPOINT'),
  S3_BUCKET:     opcional('S3_BUCKET', 'dte-json'),
  S3_ACCESS_KEY: opcional('S3_ACCESS_KEY'),
  S3_SECRET_KEY: opcional('S3_SECRET_KEY'),
  S3_REGION:     opcional('S3_REGION', 'auto'),

  // ── JWT ──
  // Secreto para firmar tokens JWT — mínimo 256 bits
  // Generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  // 256 bits = 32 bytes = 64 caracteres hex
// Usamos 64 caracteres como mínimo para garantizar al menos 256 bits
JWT_SECRET: (() => {
  const secret = requerida('JWT_SECRET');
  if (secret.length < 64) {
    throw new Error(
      '[DTE-SERVICE] JWT_SECRET debe tener al menos 64 caracteres (256 bits mínimo).\n' +
      'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
  return secret;
})(),
  JWT_EXPIRA_EN:         opcional('JWT_EXPIRA_EN', '15m'),
  JWT_REFRESH_EXPIRA_EN: opcional('JWT_REFRESH_EXPIRA_EN', '7d'),

  // CORS
  CORS_ORIGINS: (opcional('CORS_ORIGINS', 'http://localhost:3000'))
    .split(',')
    .map((o) => o.trim()),

  // ── Provisión interna POS ↔ DTE (Fase 2) ──
  // Clave interna servidor-a-servidor para /internal/provisioning/*.
  // DISTINTA de la API Key técnica del POS. Sin ella las rutas internas
  // fallan cerradas (503) — nunca se habilitan sin credencial.
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || null,
  // URL y clave de salida para publicar eventos de provisión hacia el POS
  // (outbox). Si POS_PROVISIONING_URL no está configurada, el worker no corre.
  POS_PROVISIONING_URL: process.env.POS_PROVISIONING_URL || null,
  POS_PROVISIONING_API_KEY: process.env.POS_PROVISIONING_API_KEY || null,

  // Logs
  LOG_LEVEL: opcional('LOG_LEVEL', 'info'),
};
