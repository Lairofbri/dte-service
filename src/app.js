// src/app.js
// Configuración central de Express para el dte-service
// Seguridad máxima: este servicio maneja documentos tributarios legales

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { CORS_ORIGINS, ES_PRODUCCION } = require('./config/env');
const logger     = require('./utils/logger');
const { noEncontrado, errorServidor } = require('./utils/response');

// ── Importar rutas ──
const configuracionRoutes = require('./modules/configuracion/configuracion.routes');
const dteRoutes           = require('./modules/dtes/dtes.routes');
const contingenciaRoutes  = require('./modules/contingencia/contingencia.routes');
const auditoriaRoutes     = require('./modules/auditoria/auditoria.routes');
const haciendaRoutes      = require('./modules/hacienda/hacienda.routes');
const firmadorRoutes      = require('./modules/firmador/firmador.routes');

const app = express();

// ─────────────────────────────────────────────
// SEGURIDAD: Helmet — headers HTTP de seguridad
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: ES_PRODUCCION,
  crossOriginEmbedderPolicy: ES_PRODUCCION,
}));

// ─────────────────────────────────────────────
// CORS — solo el POS puede consumir este servicio
// ─────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin solo en desarrollo (Postman, etc.)
    if (!origin && !ES_PRODUCCION) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    logger.warn('CORS bloqueado', { origin });
    callback(new Error(`Origen no permitido: ${origin}`));
  },
  methods:     ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
  credentials: false,
}));

// ─────────────────────────────────────────────
// RATE LIMITING
// Más estricto que el POS — documentos tributarios son críticos
// ─────────────────────────────────────────────

// Límite general
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max:      100,
  message:  { ok: false, mensaje: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// Límite estricto para emisión de DTEs
// Un restaurante no debería emitir más de 60 DTEs por minuto
const limiteDTE = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max:      60,
  message:  { ok: false, mensaje: 'Límite de emisión de DTEs alcanzado.' },
  keyGenerator: (req) => req.ip,
});

// ─────────────────────────────────────────────
// PARSEO DE BODY
// ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────
// LOGGING de requests entrantes
// ─────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info('Request entrante', {
    metodo: req.method,
    ruta:   req.path,
    ip:     req.ip,
    // NUNCA loguear headers que puedan contener la API Key
  });
  next();
});

// ─────────────────────────────────────────────
// HEALTH CHECK — sin autenticación
// Railway lo usa para verificar que el servicio está vivo
// ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok:        true,
    servicio:  'dte-service',
    estado:    'activo',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// RUTAS DE LA API
// Todas requieren API Key (middleware aplicado en cada router)
// ─────────────────────────────────────────────
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/dte',           limiteDTE, dteRoutes);
app.use('/api/contingencia',  contingenciaRoutes);
app.use('/api/auditoria',     auditoriaRoutes);
app.use('/api/hacienda',      haciendaRoutes);
app.use('/api/firmador',      firmadorRoutes);

// ─────────────────────────────────────────────
// 404 — Ruta no encontrada
// ─────────────────────────────────────────────
app.use((_req, res) => {
  noEncontrado(res, 'Ruta no encontrada.');
});

// ─────────────────────────────────────────────
// Error handler global
// ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ ok: false, mensaje: err.message });
  }

  logger.error('Error no capturado', {
    error: err.message,
    stack: ES_PRODUCCION ? undefined : err.stack,
    ruta:  req.path,
  });

  return errorServidor(res);
});

module.exports = app;
