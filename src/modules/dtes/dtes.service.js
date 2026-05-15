// src/modules/clientes/clientes.service.js
// Lógica de negocio para gestión de clientes
// H3 FIX: obtenerClientePorId filtra activo=true
// H2 FIX: sin defaults silenciosos en tipo_documento
// H5 FIX: actualizarCliente verifica integridad del jurídico post-merge

const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPER: mapear fila BD → objeto limpio
// ─────────────────────────────────────────────
const mapearCliente = (row) => ({
  id:               row.id,
  tipo_cliente:     row.tipo_cliente,
  nombre:           row.nombre,
  nombre_comercial: row.nombre_comercial  || null,
  tipo_documento:   row.tipo_documento    || null,
  num_documento:    row.num_documento     || null,
  nit:              row.nit               || null,
  nrc:              row.nrc               || null,
  cod_actividad:    row.cod_actividad     || null,
  desc_actividad:   row.desc_actividad    || null,
  departamento_cod: row.departamento_cod  || null,
  municipio_cod:    row.municipio_cod     || null,
  direccion:        row.direccion         || null,
  telefono:         row.telefono          || null,
  correo:           row.correo            || null,
  activo:           row.activo,
  creado_en:        row.creado_en,
  actualizado_en:   row.actualizado_en,
  total_dtes:       row.total_dtes !== undefined ? parseInt(row.total_dtes, 10) : undefined,
});

// ─────────────────────────────────────────────
// BUSCAR — búsqueda parcial por nombre, NIT, num_documento
// ─────────────────────────────────────────────
const buscarClientes = async ({ q, tipo_cliente, pagina = 1, limite = 10 }) => {
  const offset = (pagina - 1) * limite;
  const params = [];
  const wheres = ['c.activo = true'];

  if (tipo_cliente) {
    params.push(tipo_cliente);
    wheres.push(`c.tipo_cliente = $${params.length}`);
  }

  if (q && q.trim()) {
    const termino = q.trim();
    params.push(`%${termino}%`);
    const p = params.length;
    wheres.push(`(
      c.nombre           ILIKE $${p} OR
      c.nombre_comercial ILIKE $${p} OR
      c.nit              ILIKE $${p} OR
      c.num_documento    ILIKE $${p} OR
      c.nrc              ILIKE $${p}
    )`);
  }

  const where = `WHERE ${wheres.join(' AND ')}`;

  const { rows: totalRows } = await query(
    `SELECT COUNT(*) FROM clientes c ${where}`,
    params
  );
  const total = parseInt(totalRows[0].count, 10);

  params.push(limite, offset);
  const { rows } = await query(
    `SELECT c.*, COUNT(d.id) AS total_dtes
     FROM clientes c
     LEFT JOIN dtes d ON d.cliente_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.nombre ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    clientes:   rows.map(mapearCliente),
    paginacion: { total, pagina, limite, paginas: Math.ceil(total / limite) },
  };
};

// ─────────────────────────────────────────────
// OBTENER POR ID
// H3 FIX: filtra activo = true — consistente con listar()
// Un cliente soft-deleted no debe ser accesible por ninguna vía pública
// ─────────────────────────────────────────────
const obtenerClientePorId = async (id, { incluirInactivo = false } = {}) => {
  const filtroActivo = incluirInactivo ? '' : 'AND c.activo = true';

  const { rows } = await query(
    `SELECT c.*, COUNT(d.id) AS total_dtes
     FROM clientes c
     LEFT JOIN dtes d ON d.cliente_id = c.id
     WHERE c.id = $1 ${filtroActivo}
     GROUP BY c.id`,
    [id]
  );

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Cliente no encontrado.' };
  }

  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// CREAR
// H2 FIX: sin default silencioso en tipo_documento
// El schema ya garantiza que tipo_documento existe si hay num_documento
// ─────────────────────────────────────────────
const crearCliente = async (datos) => {
  // Verificar duplicado por NIT si es jurídico
  if (datos.tipo_cliente === 'juridico' && datos.nit) {
    const { rows: exist } = await query(
      `SELECT id FROM clientes WHERE nit = $1 AND activo = true`,
      [datos.nit]
    );
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe un cliente activo con el NIT ${datos.nit}.` };
    }
  }

  // H2 FIX: verificar duplicado con tipo_documento real — sin default silencioso
  // Solo verificar si ambos campos están presentes y son consistentes
  if (datos.tipo_cliente === 'natural' && datos.num_documento && datos.tipo_documento) {
    const { rows: exist } = await query(
      `SELECT id FROM clientes
       WHERE num_documento = $1 AND tipo_documento = $2 AND activo = true`,
      [datos.num_documento, datos.tipo_documento]
    );
    if (exist.length > 0) {
      throw {
        status: 409,
        mensaje: `Ya existe un cliente activo con ese número de documento (${datos.tipo_documento}).`,
      };
    }
  }

  const { rows } = await query(
    `INSERT INTO clientes (
       tipo_cliente, nombre, nombre_comercial,
       tipo_documento, num_documento,
       nit, nrc, cod_actividad, desc_actividad,
       departamento_cod, municipio_cod, direccion,
       telefono, correo
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      datos.tipo_cliente,
      datos.nombre,
      datos.nombre_comercial  || null,
      datos.tipo_documento    || null,  // H2 FIX: null real, no '13'
      datos.num_documento     || null,
      datos.nit               || null,
      datos.nrc               || null,
      datos.cod_actividad     || null,
      datos.desc_actividad    || null,
      datos.departamento_cod  || null,
      datos.municipio_cod     || null,
      datos.direccion         || null,
      datos.telefono          || null,
      datos.correo            || null,
    ]
  );

  logger.info('Cliente creado', { id: rows[0].id, nombre: rows[0].nombre });
  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// ACTUALIZAR
// H5 FIX: verifica integridad del jurídico después de aplicar los cambios
// Se hace merge de datos actuales + nuevos antes de validar
// ─────────────────────────────────────────────
const actualizarCliente = async (id, datos) => {
  // H3: usa incluirInactivo: false — no se puede editar un cliente eliminado
  const clienteActual = await obtenerClientePorId(id);

  // Verificar duplicado NIT si se está cambiando
  if (datos.nit && datos.nit !== clienteActual.nit) {
    const { rows: exist } = await query(
      `SELECT id FROM clientes WHERE nit = $1 AND activo = true AND id != $2`,
      [datos.nit, id]
    );
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe otro cliente activo con el NIT ${datos.nit}.` };
    }
  }

  // H5 FIX: construir el estado resultante y verificar integridad fiscal
  // Merge: datos actuales + nuevos cambios
  const resultante = { ...clienteActual, ...datos };

  if (resultante.tipo_cliente === 'juridico') {
    // NIT no puede quedar vacío en un jurídico
    if (!resultante.nit) {
      throw {
        status: 400,
        mensaje: 'No se puede dejar un cliente jurídico sin NIT. Hacienda lo exige en CCF/FSE.',
      };
    }
    // NRC no puede quedar vacío en un jurídico
    if (!resultante.nrc) {
      throw {
        status: 400,
        mensaje: 'No se puede dejar un cliente jurídico sin NRC. Hacienda lo exige en CCF.',
      };
    }
    // Actividad no puede quedar vacía
    if (!resultante.cod_actividad) {
      throw {
        status: 400,
        mensaje: 'No se puede dejar un cliente jurídico sin código de actividad económica.',
      };
    }
  }

  // H4 FIX: municipio requiere departamento en el estado resultante
  if (resultante.municipio_cod && !resultante.departamento_cod) {
    throw {
      status: 400,
      mensaje: 'Debe indicar el departamento cuando se especifica el municipio.',
    };
  }

  // Construir SET dinámico solo con campos enviados
  const campos = [
    'nombre', 'nombre_comercial', 'tipo_documento', 'num_documento',
    'nit', 'nrc', 'cod_actividad', 'desc_actividad',
    'departamento_cod', 'municipio_cod', 'direccion',
    'telefono', 'correo',
  ];

  const sets   = [];
  const params = [];

  for (const campo of campos) {
    if (campo in datos) {
      params.push(datos[campo] ?? null);
      sets.push(`${campo} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    throw { status: 400, mensaje: 'No se proporcionaron campos para actualizar.' };
  }

  params.push(id);
  const { rows } = await query(
    `UPDATE clientes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  logger.info('Cliente actualizado', { id, nombre: rows[0].nombre });
  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// SOFT DELETE
// No se puede eliminar si tiene DTEs emitidos
// ─────────────────────────────────────────────
const eliminarCliente = async (id) => {
  const cliente = await obtenerClientePorId(id);

  if (cliente.total_dtes > 0) {
    throw {
      status:  409,
      mensaje: `No se puede eliminar un cliente con ${cliente.total_dtes} DTE(s) emitido(s). Puedes desactivarlo.`,
    };
  }

  await query(
    `UPDATE clientes SET activo = false WHERE id = $1`,
    [id]
  );

  logger.info('Cliente eliminado (soft)', { id, nombre: cliente.nombre });
  return { mensaje: 'Cliente eliminado correctamente.' };
};

module.exports = {
  buscarClientes,
  obtenerClientePorId,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
};
