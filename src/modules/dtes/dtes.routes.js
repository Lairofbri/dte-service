// src/modules/dtes/dtes.routes.js
// Define las rutas del módulo de DTEs
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD:
// → API Key (POS): acceso completo — el POS es de confianza
// → JWT (frontend): acceso filtrado por establecimiento_id del token
//   Un operador solo ve y emite DTEs de su establecimiento

const { Router }           = require('express');
const controller           = require('./dtes.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');
const { autenticarDual }   = require('../../middlewares/jwt.middleware');
const { puedeAdministrarTenant } = require('../../utils/roles');

const router = Router();

// Autenticación dual — API Key o JWT
router.use(autenticarDual);

// Middleware de scoping por establecimiento para JWT de operadores.
// Los administradores conservan alcance tenant-wide para consultas; la
// emisión resuelve el establecimiento en el controller: admin → precedencia
// del body (selector de sucursal, Fase C3), operador → fijo del JWT.
// Si viene con API Key, req.establecimientoId queda undefined (sin filtro).
router.use((req, res, next) => {
  if (!puedeAdministrarTenant(req.usuario) && req.usuario?.establecimiento_id) {
    req.establecimientoId = req.usuario.establecimiento_id;
  }
  next();
});

// ─────────────────────────────────────────────
// RUTAS ESPECÍFICAS ANTES DE /:codigoGeneracion
// para que Express no confunda 'anular' o 'emitir' con un UUID
// ─────────────────────────────────────────────

// Emisión de DTEs
router.post('/emitir/fcf',          controller.emitirFCF);
router.post('/emitir/ccf',          controller.emitirCCF);
router.post('/emitir/nota-credito', controller.emitirNotaCredito);
router.post('/emitir/nota-debito',  controller.emitirNotaDebito);
router.post('/emitir/fse',          controller.emitirFSE);

// Anulación de DTEs
router.post('/anular', controller.anularDTE);

// Listado y consulta
router.get('/',                      controller.listarDTEs);
router.get('/:codigoGeneracion',     controller.obtenerDTE);

module.exports = router;
