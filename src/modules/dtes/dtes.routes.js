// src/modules/dtes/dtes.routes.js
// Define las rutas del módulo de DTEs
// Principio S (SOLID): solo enruta, no valida ni opera
//
// SEGURIDAD: todas las rutas requieren API Key válida

const { Router }           = require('express');
const controller           = require('./dtes.controller');
const { autenticarApiKey } = require('../../middlewares/apikey.middleware');

const router = Router();

// Todas las rutas requieren API Key
router.use(autenticarApiKey);

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
