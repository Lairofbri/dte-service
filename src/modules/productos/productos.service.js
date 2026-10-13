// src/modules/productos/productos.service.js
// Lógica de negocio para el catálogo de productos
// Multi-tenant: todas las queries filtradas por tenant_id (parámetro opcional,
// mismo estilo que clientes.service.js — si llega null/undefined se omiten los filtros)

const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

// ─────────────────────────────────────────────
// HELPER: mapear fila BD → objeto limpio
// NUMERIC(18,8) llega como string desde pg → se convierte a Number
// ─────────────────────────────────────────────
const mapearProducto = (row) => ({
  id:              row.id,
  codigo:          row.codigo        || null,
  nombre:          row.nombre,
  tipo_item:       row.tipo_item,
  uni_medida:      row.uni_medida,
  precio_unitario: Number(row.precio_unitario),
  tipo_venta:      row.tipo_venta,
  activo:          row.activo,
  creado_en:       row.creado_en,
  actualizado_en:  row.actualizado_en,
});

// ─────────────────────────────────────────────
// BUSCAR — búsqueda parcial por nombre y código + filtros + paginación
// Usado por la página Productos y el selector del wizard (server-side)
// ─────────────────────────────────────────────
const buscarProductos = async ({ q, tipo_item, tipo_venta, pagina = 1, limite = 10, tenant_id }) => {
  const offset = (pagina - 1) * limite;
  const params = [];
  const wheres = ['p.activo = true'];

  if (tenant_id) {
    params.push(tenant_id);
    wheres.push(`p.tenant_id = $${params.length}`);
  }

  if (tipo_item) {
    params.push(tipo_item);
    wheres.push(`p.tipo_item = $${params.length}`);
  }

  if (tipo_venta) {
    params.push(tipo_venta);
    wheres.push(`p.tipo_venta = $${params.length}`);
  }

  if (q && q.trim()) {
    const termino = q.trim();
    params.push(`%${termino}%`);
    const p = params.length;
    // Buscar en nombre y código (prefijo con % para soportar coincidencia parcial)
    wheres.push(`(
      p.nombre ILIKE $${p} OR
      p.codigo ILIKE $${p}
    )`);
  }

  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

  // Total para paginación
  const { rows: totalRows } = await query(
    `SELECT COUNT(*) FROM productos p ${where}`,
    params
  );
  const total = parseInt(totalRows[0].count, 10);

  // Resultados
  params.push(limite, offset);
  const { rows } = await query(
    `SELECT p.*
     FROM productos p
     ${where}
     ORDER BY p.nombre ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    productos:  rows.map(mapearProducto),
    paginacion: { total, pagina, limite, paginas: Math.ceil(total / limite) },
  };
};

// ─────────────────────────────────────────────
// OBTENER POR ID — 404 si no existe o es de otro tenant
// ─────────────────────────────────────────────
const obtenerProductoPorId = async (id, tenant_id) => {
  let queryText, params;
  if (tenant_id) {
    queryText = 'SELECT * FROM productos WHERE id = $1 AND tenant_id = $2';
    params = [id, tenant_id];
  } else {
    queryText = 'SELECT * FROM productos WHERE id = $1';
    params = [id];
  }

  const { rows } = await query(queryText, params);

  if (rows.length === 0) {
    throw { status: 404, mensaje: 'Producto no encontrado.' };
  }

  return mapearProducto(rows[0]);
};

// ─────────────────────────────────────────────
// CREAR — 409 si ya existe código activo del mismo tenant
// ─────────────────────────────────────────────
const crearProducto = async (datos, tenant_id) => {
  if (datos.codigo && datos.codigo.trim()) {
    const codigo = datos.codigo.trim();
    let dupQuery, dupParams;
    if (tenant_id) {
      dupQuery = `SELECT id FROM productos
                  WHERE codigo = $1 AND tenant_id = $2 AND activo = true`;
      dupParams = [codigo, tenant_id];
    } else {
      dupQuery = `SELECT id FROM productos
                  WHERE codigo = $1 AND activo = true`;
      dupParams = [codigo];
    }
    const { rows: exist } = await query(dupQuery, dupParams);
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe un producto activo con el código ${codigo}.` };
    }
    datos.codigo = codigo;
  }

  const campos = ['nombre', 'codigo', 'tipo_item', 'uni_medida', 'precio_unitario', 'tipo_venta'];
  const valores = [
    datos.nombre,
    datos.codigo || null,
    datos.tipo_item,
    datos.uni_medida,
    datos.precio_unitario,
    datos.tipo_venta,
  ];

  if (tenant_id) {
    campos.push('tenant_id');
    valores.push(tenant_id);
  }

  const ph = valores.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO productos (${campos.join(', ')})
     VALUES (${ph})
     RETURNING *`,
    valores
  );

  logger.info('Producto creado', { id: rows[0].id, nombre: rows[0].nombre });
  return mapearProducto(rows[0]);
};

// ─────────────────────────────────────────────
// ACTUALIZAR — duplicado de código excluyendo el mismo id
// ─────────────────────────────────────────────
const actualizarProducto = async (id, datos, tenant_id) => {
  // 404 si no existe o es de otro tenant (de paso rescata el producto actual)
  const producto = await obtenerProductoPorId(id, tenant_id);

  if (datos.codigo !== undefined && datos.codigo !== null && datos.codigo.trim()) {
    const codigo = datos.codigo.trim();
    let dupQuery, dupParams;
    if (tenant_id) {
      dupQuery = `SELECT id FROM productos
                  WHERE codigo = $1 AND tenant_id = $2 AND activo = true AND id != $3`;
      dupParams = [codigo, tenant_id, id];
    } else {
      dupQuery = `SELECT id FROM productos
                  WHERE codigo = $1 AND activo = true AND id != $2`;
      dupParams = [codigo, id];
    }
    const { rows: exist } = await query(dupQuery, dupParams);
    if (exist.length > 0) {
      throw { status: 409, mensaje: `Ya existe otro producto activo con el código ${codigo}.` };
    }
    datos.codigo = codigo;
  }

  // Construir SET dinámico solo con campos enviados
  const campos = ['nombre', 'codigo', 'tipo_item', 'uni_medida', 'precio_unitario', 'tipo_venta'];
  const sets   = [];
  const params = [];

  for (const campo of campos) {
    if (campo in datos) {
      // Vaciar codigo → null (un producto puede no tener código)
      params.push(campo === 'codigo' ? (datos[campo] || null) : datos[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    throw { status: 400, mensaje: 'No se proporcionaron campos para actualizar.' };
  }

  params.push(id);
  let where = `WHERE id = $${params.length}`;
  if (tenant_id) {
    params.push(tenant_id);
    where += ` AND tenant_id = $${params.length}`;
  }
  const { rows } = await query(
    `UPDATE productos SET ${sets.join(', ')} ${where} RETURNING *`,
    params
  );

  logger.info('Producto actualizado', {
    id,
    nombrePrevio: producto.nombre,
  });
  return mapearProducto(rows[0]);
};

// ─────────────────────────────────────────────
// SOFT DELETE — activo = false
// ─────────────────────────────────────────────
const eliminarProducto = async (id, tenant_id) => {
  await obtenerProductoPorId(id, tenant_id);

  await query(
    `UPDATE productos SET activo = false WHERE id = $1`,
    [id]
  );

  logger.info('Producto eliminado (soft)', { id });
  return { mensaje: 'Producto eliminado correctamente.' };
};

module.exports = {
  buscarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
};