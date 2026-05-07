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

  // ── Datos del emisor ──
  NIT_EMISOR:              requerida('NIT_EMISOR'),
  NRC_EMISOR:              opcional('NRC_EMISOR'),
  NOMBRE_EMISOR:           requerida('NOMBRE_EMISOR'),
  NOMBRE_COMERCIAL:        opcional('NOMBRE_COMERCIAL'),
  DIRECCION_EMISOR:        requerida('DIRECCION_EMISOR'),
  TELEFONO_EMISOR:         opcional('TELEFONO_EMISOR'),
  EMAIL_EMISOR:            opcional('EMAIL_EMISOR'),
  CODIGO_ACTIVIDAD:        requerida('CODIGO_ACTIVIDAD'),
  CODIGO_ESTABLECIMIENTO:  opcional('CODIGO_ESTABLECIMIENTO', '0001'),
  CODIGO_PUNTO_VENTA:      opcional('CODIGO_PUNTO_VENTA', '0001'),
  TIPO_ESTABLECIMIENTO:    opcional('TIPO_ESTABLECIMIENTO', '02'),

  // ── Hacienda ──
  AMBIENTE_HACIENDA:         opcional('AMBIENTE_HACIENDA', '00'),
  URL_AUTH_HACIENDA:         requerida('URL_AUTH_HACIENDA'),
  URL_RECEPCION_HACIENDA:    requerida('URL_RECEPCION_HACIENDA'),
  URL_CONSULTA_HACIENDA:     requerida('URL_CONSULTA_HACIENDA'),
  URL_CONTINGENCIA_HACIENDA: requerida('URL_CONTINGENCIA_HACIENDA'),
  URL_ANULACION_HACIENDA:    requerida('URL_ANULACION_HACIENDA'),
  USUARIO_HACIENDA:          requerida('USUARIO_HACIENDA'),
  PASSWORD_HACIENDA:         requerida('PASSWORD_HACIENDA'),
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

  // CORS
  CORS_ORIGINS: (opcional('CORS_ORIGINS', 'http://localhost:3000'))
    .split(',')
    .map((o) => o.trim()),

  // Logs
  LOG_LEVEL: opcional('LOG_LEVEL', 'info'),
};
