// src/modules/clientes/clientes.service.js
// Lógica de negocio para gestión de clientes
// Principio S (SOLID): solo opera datos, no valida HTTP ni responde

const { query } = require('../../config/database');
const logger    = require('../../utils/logger');
const catalogosService = require('../catalogos/catalogos.service');

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
  distrito_cod:     row.distrito_cod      || null,
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
// Usado para autocompletar en DTEEmitir
// ─────────────────────────────────────────────
const buscarClientes = async ({ q, tipo_cliente, pagina = 1, limite = 10, tenant_id }) => {
  const offset = (pagina - 1) * limite;
  const params = [];
  const wheres = ['c.activo = true'];

  if (tenant_id) {
    params.push(tenant_id);
    wheres.push(`c.tenant_id = $${params.length}`);
  }

  if (tipo_cliente) {
    params.push(tipo_cliente);
    wheres.push(`c.tipo_cliente = $${params.length}`);
  }

  if (q && q.trim()) {
    const termino = q.trim();
    params.push(`%${termino}%`);
    const p = params.length;
    // Buscar en nombre, nombre_comercial, nit, num_documento
    wheres.push(`(
      c.nombre           ILIKE $${p} OR
      c.nombre_comercial ILIKE $${p} OR
      c.nit              ILIKE $${p} OR
      c.num_documento    ILIKE $${p} OR
      c.nrc              ILIKE $${p}
    )`);
  }

  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

  // Total para paginación
  const { rows: totalRows } = await query(
    `SELECT COUNT(*) FROM clientes c ${where}`,
    params
  );
  const total = parseInt(totalRows[0].count, 10);

  // Resultados con conteo de DTEs emitidos
  params.push(limite, offset);
  const { rows } = await query(
    `SELECT c.*,
            COUNT(d.id) AS total_dtes
     FROM clientes c
     LEFT JOIN dtes d ON d.cliente_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.nombre ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    clientes:  rows.map(mapearCliente),
    paginacion: { total, pagina, limite, paginas: Math.ceil(total / limite) },
  };
};

// ─────────────────────────────────────────────
// OBTENER POR ID
// ─────────────────────────────────────────────
const obtenerClientePorId = async (id, tenant_id) => {
  let queryText, params;
  if (tenant_id) {
    queryText = `SELECT c.*, COUNT(d.id) AS total_dtes
     FROM clientes c
     LEFT JOIN dtes d ON d.cliente_id = c.id
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id`;
    params = [id, tenant_id];
  } else {
    queryText = `SELECT c.*, COUNT(d.id) AS total_dtes
     FROM clientes c
     LEFT JOIN dtes d ON d.cliente_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`;
    params = [id];
  }

  const { rows } = await query(queryText, params);

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Cliente no encontrado.' };
  }

  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// CREAR
// ─────────────────────────────────────────────
const crearCliente = async (datos, tenant_id) => {
  // NIT duplicado: aplica a jurídicos y a personas naturales contribuyentes
  // (el NIT de una persona natural también es único por tenant).
  if (datos.nit) {
    let dupQuery, dupParams;
    if (tenant_id) {
      dupQuery = 'SELECT id FROM clientes WHERE nit = $1 AND tenant_id = $2 AND activo = true';
      dupParams = [datos.nit, tenant_id];
    } else {
      dupQuery = 'SELECT id FROM clientes WHERE nit = $1 AND activo = true';
      dupParams = [datos.nit];
    }
    const { rows: exist } = await query(dupQuery, dupParams);
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe un cliente activo con el NIT ${datos.nit}.` };
    }
  }

  // Documento duplicado: personas naturales y sujetos excluidos (DUI/NIT)
  if ((datos.tipo_cliente === 'natural' || datos.tipo_cliente === 'sujeto_excluido') && datos.num_documento) {
    let dupQuery, dupParams;
    if (tenant_id) {
      dupQuery = 'SELECT id FROM clientes WHERE num_documento = $1 AND tipo_documento = $2 AND tenant_id = $3 AND activo = true';
      dupParams = [datos.num_documento, datos.tipo_documento || '13', tenant_id];
    } else {
      dupQuery = 'SELECT id FROM clientes WHERE num_documento = $1 AND tipo_documento = $2 AND activo = true';
      dupParams = [datos.num_documento, datos.tipo_documento || '13'];
    }
    const { rows: exist } = await query(dupQuery, dupParams);
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe un cliente activo con ese número de documento.` };
    }
  }

  // Ubicación CAT-013/CAT-008: si se envía dirección, los códigos deben
  // existir en los catálogos oficiales para el departamento (migración 034).
  // El MH rechaza el DTE (código 096) con códigos fuera de catálogo.
  const erroresUbicacion = await catalogosService.validarUbicacionCatalogo({
    departamento_cod: datos.departamento_cod || null,
    municipio_cod:    datos.municipio_cod    || null,
    distrito_cod:     datos.distrito_cod     || null,
  });
  if (erroresUbicacion.length > 0) {
    throw { status: 400, mensaje: erroresUbicacion.join(' ') };
  }

  const camposCli = [
    'tipo_cliente', 'nombre', 'nombre_comercial',
    'tipo_documento', 'num_documento',
    'nit', 'nrc', 'cod_actividad', 'desc_actividad',
    'departamento_cod', 'municipio_cod', 'distrito_cod', 'direccion',
    'telefono', 'correo',
  ];
  const valoresCli = [
    datos.tipo_cliente, datos.nombre, datos.nombre_comercial || null,
    datos.tipo_documento || null, datos.num_documento || null,
    datos.nit || null, datos.nrc || null,
    datos.cod_actividad || null, datos.desc_actividad || null,
    datos.departamento_cod || null, datos.municipio_cod || null, datos.distrito_cod || null,
    datos.direccion || null, datos.telefono || null, datos.correo || null,
  ];

  if (tenant_id) {
    camposCli.push('tenant_id');
    valoresCli.push(tenant_id);
  }

  const phCli = valoresCli.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO clientes (${camposCli.join(', ')})
     VALUES (${phCli})
     RETURNING *`,
    valoresCli
  );

  logger.info('Cliente creado', { id: rows[0].id, nombre: rows[0].nombre });
  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// ACTUALIZAR
// ─────────────────────────────────────────────
const actualizarCliente = async (id, datos, tenant_id) => {
  const clientePrevio = await obtenerClientePorId(id, tenant_id);

  // Reglas cruzadas por tipo de cliente (mismo contrato que la creación):
  // jurídico → NIT, sujeto excluido → DUI. Se evalúa el estado RESULTANTE
  // (datos nuevos + previos) para permitir conversiones entre tipos.
  const tipoResultante    = datos.tipo_cliente ?? clientePrevio.tipo_cliente;
  const nitResultante     = 'nit' in datos ? datos.nit : clientePrevio.nit;
  const numDocResultante  = 'num_documento' in datos ? datos.num_documento : clientePrevio.num_documento;
  let   tipoDocResultante = 'tipo_documento' in datos ? datos.tipo_documento : clientePrevio.tipo_documento;

  if (tipoResultante === 'juridico' && !nitResultante) {
    throw { status: 400, mensaje: 'El NIT es obligatorio para clientes jurídicos (CCF/FSE).' };
  }
  if (tipoResultante === 'sujeto_excluido' && !numDocResultante) {
    throw { status: 400, mensaje: 'El número de DUI es obligatorio para un sujeto excluido (FSE).' };
  }
  if (numDocResultante && !tipoDocResultante) {
    if (tipoResultante === 'sujeto_excluido') {
      tipoDocResultante = '13';
      datos.tipo_documento = '13';
    } else {
      throw { status: 400, mensaje: 'Si se provee el número de documento, debe indicar el tipo.' };
    }
  }

  // Ubicación: validar la combinación resultante (datos nuevos + previos)
  // contra los catálogos oficiales CAT-013/CAT-008 (migración 034).
  if ('departamento_cod' in datos || 'municipio_cod' in datos || 'distrito_cod' in datos) {
    const erroresUbicacion = await catalogosService.validarUbicacionCatalogo({
      departamento_cod: datos.departamento_cod ?? clientePrevio.departamento_cod,
      municipio_cod:    datos.municipio_cod    ?? clientePrevio.municipio_cod,
      distrito_cod:     datos.distrito_cod     ?? clientePrevio.distrito_cod,
    });
    if (erroresUbicacion.length > 0) {
      throw { status: 400, mensaje: erroresUbicacion.join(' ') };
    }
  }

  // Verificar duplicado NIT si se está cambiando
  if (datos.nit) {
    const { rows: exist } = await query(
      `SELECT id FROM clientes WHERE nit = $1 AND activo = true AND id != $2`,
      [datos.nit, id]
    );
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe otro cliente activo con el NIT ${datos.nit}.` };
    }
  }

  // Construir SET dinámico solo con campos enviados
  const campos = [
    'tipo_cliente',
    'nombre', 'nombre_comercial', 'tipo_documento', 'num_documento',
    'nit', 'nrc', 'cod_actividad', 'desc_actividad',
    'departamento_cod', 'municipio_cod', 'distrito_cod', 'direccion',
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
  let whereCli = `WHERE id = $${params.length}`;
  if (tenant_id) {
    params.push(tenant_id);
    whereCli += ` AND tenant_id = $${params.length}`;
  }
  const { rows } = await query(
    `UPDATE clientes SET ${sets.join(', ')} ${whereCli} RETURNING *`,
    params
  );

  logger.info('Cliente actualizado', { id });
  return mapearCliente(rows[0]);
};

// ─────────────────────────────────────────────
// SOFT DELETE
// No se puede eliminar si tiene DTEs emitidos
// ─────────────────────────────────────────────
const eliminarCliente = async (id, tenant_id) => {
  const cliente = await obtenerClientePorId(id, tenant_id);

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
