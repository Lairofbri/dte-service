const service = require('./tenants.service');
const { exito, errorServidor } = require('../../utils/response');
const logger = require('../../utils/logger');

const listarTenants = async (_req, res) => {
  try {
    const tenants = await service.listarActivos();
    return exito(res, tenants);
  } catch (err) {
    logger.error('Error al listar tenants', { error: err.message });
    return errorServidor(res);
  }
};

module.exports = {
  listarTenants,
};
