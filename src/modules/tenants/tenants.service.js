const { query } = require('../../config/database');

const listarActivos = async () => {
  const { rows } = await query(
    `SELECT
       t.id,
       t.nombre,
       t.nombre_comercial,
       t.provisioning_status
     FROM tenants t
     WHERE t.activo = TRUE
     ORDER BY t.nombre`
  );

  return rows;
};

module.exports = {
  listarActivos,
};
