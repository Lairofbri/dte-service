const { query } = require('../../config/database');

const listarActivos = async () => {
  const { rows } = await query(
    `SELECT
       t.id,
       t.nombre,
       t.nit
     FROM tenants t
     WHERE t.activo = TRUE
     ORDER BY t.nombre`
  );

  return rows;
};

module.exports = {
  listarActivos,
};
