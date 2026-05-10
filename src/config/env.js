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

  // ── Seguridad del servicio ──
  // API Key hasheada con bcrypt — el POS envía la API Key raw
  // este servicio la compara contra el hash almacenado aquí
  API_KEY_HASH:    requerida('API_KEY_HASH'),
  // Clave AES-256 para encriptar credenciales sensibles en BD
  ENCRYPTION_KEY:  requerida('ENCRYPTION_KEY'),

  // ── Hacienda — solo URLs e infraestructura ──
  // Los datos del emisor (NIT, nombre, credenciales) viven en la BD
  // tabla configuracion — nunca en variables de entorno
  // Esto permite vender el servicio a múltiples clientes
  // sin cambiar el código — solo cambia la BD
  AMBIENTE_HACIENDA:         opcional('AMBIENTE_HACIENDA', '00'),
  URL_AUTH_HACIENDA:         requerida('URL_AUTH_HACIENDA'),
  URL_RECEPCION_HACIENDA:    requerida('URL_RECEPCION_HACIENDA'),
  URL_CONSULTA_HACIENDA:     requerida('URL_CONSULTA_HACIENDA'),
  URL_CONTINGENCIA_HACIENDA: requerida('URL_CONTINGENCIA_HACIENDA'),
  URL_ANULACION_HACIENDA:    requerida('URL_ANULACION_HACIENDA'),
  TIMEOUT_HACIENDA:          opcionalInt('TIMEOUT_HACIENDA', 8000),
  MAX_REINTENTOS_HACIENDA:   opcionalInt('MAX_REINTENTOS_HACIENDA', 2),

  // ── Firmador ──
  URL_FIRMADOR:     requerida('URL_FIRMADOR'),
  TIMEOUT_FIRMADOR: opcionalInt('TIMEOUT_FIRMADOR', 10000),

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
  JWT_EXPIRA_EN:         opcional('JWT_EXPIRA_EN', '8h'),
  JWT_REFRESH_EXPIRA_EN: opcional('JWT_REFRESH_EXPIRA_EN', '7d'),

  // CORS
  CORS_ORIGINS: (opcional('CORS_ORIGINS', 'http://localhost:3000'))
    .split(',')
    .map((o) => o.trim()),

  // Logs
  LOG_LEVEL: opcional('LOG_LEVEL', 'info'),
};
