const { Router } = require('express');
const controller = require('./tenants.controller');

const router = Router();

// GET /api/tenants — listar tenants activos (público, usado por el login)
router.get('/', controller.listarTenants);

module.exports = router;
