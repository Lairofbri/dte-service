// src/modules/provisioning/provisioning.service.js
// Lógica de negocio de provisión de empresas (Fase 2).
//
// REGLAS CRÍTICAS (spec):
// → DTE es la fuente de verdad fiscal; POS es proyección operativa.
// → Reintentar la misma operación (mismo operation_id) NO duplica tenants.
// → La API Key técnica se genera en DTE, se guarda SOLO su hash (bcrypt) y
//   se devuelve en claro UNA sola vez por canal seguro.
//   Reintento idempotente: si el POS nunca confirmó almacenamiento
//   (last_pos_sync_at IS NULL) la clave se rota y se reentrega; si ya
//   confirmó, no se reentrega.
// → Nunca se escriben secretos en logs ni en auditoría.
//
// TESTABILIDAD: la DB se carga de forma perezosa (lazy) para que los unit
// tests puedan inyectar un fake sin variable DATABASE_URL en el entorno.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');
const { registrarEventoAuditoria } = require('../../utils/auditoria');
const {
  crearTenantSchema,
  crearTenantPlataformaSchema,
  actualizarTenantPlataformaSchema,
  actualizarAdminTenantSchema,
  actualizarEstadoSchema,
  vincularSucursalSchema,
} = require('./provisioning.schema');

// BCRYPT_ROUNDS = 12 (mismo estándar que usuarios.service.js y seed.js).
const BCRYPT_ROUNDS = 12;

// Correlativos del establecimiento inicial: mismos tipos y ambientes que
// establecimientos.service.js (spec §10 — secuencias por establecimiento).
const TIPOS_DTE_CORRELATIVOS = ['01', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15'];
const AMBIENTES_CORRELATIVOS = ['00', '01'];

/**
 * Genera una API Key técnica de integración POS ↔ DTE.
 * 64 caracteres hex (256 bits de entropía) — nunca en logs.
 */
const generarApiKey = () => crypto.randomBytes(32).toString('hex');

/**
 * Factory del servicio. Acepta dependencias inyectadas para unit tests
 * (db fake, auditoría, outbox). El módulo se exporta como instancia por defecto.
 */
const crearServicioProvisioning = (dependencias = {}) => {
  let dbActual = null;
  const obtenerDb = () => {
    if (!dbActual) dbActual = dependencias.db || require('../../config/database');
    return dbActual;
  };

  const audit = dependencias.auditoria || registrarEventoAuditoria;
  const bcryptImpl = dependencias.bcrypt || bcrypt;

  let outboxActual = null;
  const obtenerOutbox = () => {
    if (!outboxActual) outboxActual = dependencias.outbox || require('./outbox.service');
    return outboxActual;
  };

  // Estado de firma por tenant (Fase 4). Inyectable para unit tests: la
  // verificación del firmador es una llamada HTTP que no corre en tests.
  // Se carga de forma perezosa para no acoplar el módulo al env del firmador.
  let estadoFirmaActual = null;
  const obtenerEstadoFirma = () => {
    if (!estadoFirmaActual) {
      estadoFirmaActual =
        dependencias.estadoFirma ||
        require('../firmador/firmador.service').obtenerEstadoFirmaTenant;
    }
    return estadoFirmaActual;
  };

  const formatearTenant = (row) => ({
    id: row.id,
    nombre: row.nombre,
    nombre_comercial: row.nombre_comercial || row.nombre || null,
    nit: row.nit,
    nrc: row.nrc || null,
    provisioning_status: row.provisioning_status,
    provisioning_operation_id: row.provisioning_operation_id || null,
    last_pos_sync_at: row.last_pos_sync_at || null,
    creado_en: row.creado_en,
    activo: row.activo,
  });

  /**
   * Resuelve la respuesta para una operación repetida.
   * - Si el POS nunca confirmó (last_pos_sync_at IS NULL) y la operación
   *   genera clave: rota la API Key y la reentrega (caso "falló POS durante
   *   la provisión" del spec §12).
   * - Si ya confirmó: devuelve el tenant sin clave.
   * - Origen DTE (plataforma): nunca entrega ni rota claves.
   */
  const resolverDuplicado = async ({ tenant, operationId, generarClave }) => {
    if (tenant.provisioning_operation_id !== operationId) {
      throw {
        status: 409,
        mensaje: 'El tenant ya existe y fue creado por otra operación de provisión.',
      };
    }
    if (generarClave && !tenant.last_pos_sync_at) {
      const apiKey = generarApiKey();
      const apiKeyHash = await bcryptImpl.hash(apiKey, BCRYPT_ROUNDS);
      await obtenerDb().query(
        'UPDATE tenants SET api_key_hash = $1, actualizado_en = NOW() WHERE id = $2',
        [apiKeyHash, tenant.id]
      );
      logger.info('API Key rotada en reintento de provisión', { tenant_id: tenant.id });
      return {
        tenant: formatearTenant(tenant),
        api_key: apiKey,
        reentregada: true,
      };
    }
    return {
      tenant: formatearTenant(tenant),
      api_key: null,
      reentregada: false,
    };
  };

  /**
   * Crea (o reconcilia) un tenant fiscal.
   * Idempotente por operation_id y por tenant_id.
   * @param {boolean} generarClave — POS-initiated: genera y entrega la API
   *   Key técnica una sola vez. DTE-initiated (plataforma): no genera clave
   *   hasta la activación (Fase 4).
   */
  const crearTenant = async ({
    datos,
    operationId,
    ip = null,
    origen = 'pos',
    generarClave = true,
    schema = crearTenantSchema,
  }) => {
    const { error: validacionError, value } = schema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const tenantId = value.tenant_id.toLowerCase();
    const operationIdNorm = (operationId || value.operation_id || '').toLowerCase();

    if (!operationIdNorm) {
      throw { status: 400, mensaje: 'operation_id es requerido (header Idempotency-Key o body).' };
    }

    // 1. Idempotencia por operation_id.
    const { rows: porOperacion } = await obtenerDb().query(
`SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
        provisioning_operation_id, last_pos_sync_at, creado_en, activo
       FROM tenants WHERE provisioning_operation_id = $1`,
      [operationIdNorm]
    );
    if (porOperacion.length > 0) {
      return resolverDuplicado({ tenant: porOperacion[0], operationId: operationIdNorm, generarClave });
    }

    // 2. Idempotencia por tenant_id.
    const { rows: porId } = await obtenerDb().query(
`SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
        provisioning_operation_id, last_pos_sync_at, creado_en, activo
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (porId.length > 0) {
      return resolverDuplicado({ tenant: porId[0], operationId: operationIdNorm, generarClave });
    }

    // 3. Crear tenant con estado pending_fiscal_setup (+ API Key técnica si aplica).
    let apiKey = null;
    let apiKeyHash = null;
    if (generarClave) {
      apiKey = generarApiKey();
      apiKeyHash = await bcryptImpl.hash(apiKey, BCRYPT_ROUNDS);
    }

    try {
      await obtenerDb().query(
        `INSERT INTO tenants
           (id, nombre, nombre_comercial, nit, nrc, api_key_hash, provisioning_status,
            provisioning_operation_id, activo)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_fiscal_setup', $7, TRUE)`,
        [tenantId, value.nombre, value.nombre_comercial || null, value.nit, value.nrc || null, apiKeyHash, operationIdNorm]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Carrera: otra request creó el tenant entre SELECT e INSERT.
        const { rows: existentes } = await obtenerDb().query(
          `SELECT id, nombre, nit, nrc, provisioning_status, provisioning_operation_id,
                  last_pos_sync_at, creado_en, activo
           FROM tenants WHERE id = $1`,
          [tenantId]
        );
        if (existentes.length > 0) {
          return resolverDuplicado({ tenant: existentes[0], operationId: operationIdNorm, generarClave });
        }
        if (err.constraint === 'tenants_nit_key') {
          throw { status: 409, mensaje: 'Ya existe una empresa con ese NIT.' };
        }
      }
      throw err;
    }

    const tenant = {
      id: tenantId,
      nombre: value.nombre,
      nombre_comercial: value.nombre_comercial || value.nombre,
      nit: value.nit,
      nrc: value.nrc || null,
      provisioning_status: 'pending_fiscal_setup',
      provisioning_operation_id: operationIdNorm,
      last_pos_sync_at: null,
      creado_en: new Date().toISOString(),
      activo: true,
    };

    await audit({
      tenant_id: tenantId,
      evento: 'PROVISION_TENANT_CREADO',
      detalles: { operation_id: operationIdNorm, origen },
      ip,
      status_http: 201,
    });

    logger.info('Tenant fiscal creado por provisión', {
      tenant_id: tenantId,
      origen,
      provisioning_status: 'pending_fiscal_setup',
    });

    return { tenant: formatearTenant(tenant), api_key: apiKey, reentregada: false };
  };

  /**
   * Actualiza el estado de provisión del tenant (confirmación del POS).
   * Idempotente: repetir el mismo estado es un no-op.
   */
  const actualizarEstado = async ({ tenantId, datos, operationId, ip = null }) => {
    const { error: validacionError, value } = actualizarEstadoSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const tenantIdNorm = tenantId.toLowerCase();
    const operationIdNorm = (operationId || value.operation_id || '').toLowerCase();

    const { rows } = await obtenerDb().query(
      'SELECT id, provisioning_status, provisioning_operation_id FROM tenants WHERE id = $1',
      [tenantIdNorm]
    );
    if (rows.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }
    const tenant = rows[0];

    if (!operationIdNorm) {
      throw { status: 400, mensaje: 'operation_id es requerido para confirmar el estado.' };
    }
    if (tenant.provisioning_operation_id && tenant.provisioning_operation_id !== operationIdNorm) {
      throw {
        status: 409,
        mensaje: 'operation_id no corresponde a la operación de provisión del tenant.',
      };
    }

    if (tenant.provisioning_status === value.status) {
      // No-op idempotente, pero refresca la marca de sincronización.
      await obtenerDb().query(
        'UPDATE tenants SET last_pos_sync_at = NOW(), actualizado_en = NOW() WHERE id = $1',
        [tenantIdNorm]
      );
      return { tenant_id: tenantIdNorm, status: value.status, duplicado: true };
    }

    await obtenerDb().query(
      `UPDATE tenants
       SET provisioning_status = $1, last_pos_sync_at = NOW(),
           actualizado_en = NOW()
       WHERE id = $2`,
      [value.status, tenantIdNorm]
    );

    await audit({
      tenant_id: tenantIdNorm,
      evento: 'PROVISION_TENANT_ESTADO',
      detalles: {
        operation_id: operationIdNorm,
        estado_anterior: tenant.provisioning_status,
        estado_nuevo: value.status,
        error: value.error || null,
      },
      ip,
      status_http: 200,
    });

    logger.info('Estado de provisión actualizado', {
      tenant_id: tenantIdNorm,
      estado_anterior: tenant.provisioning_status,
      estado_nuevo: value.status,
    });

    return { tenant_id: tenantIdNorm, status: value.status, duplicado: false };
  };

  /**
   * Estado de provisión visible al administrador DTE.
   * Plataforma: todos los tenants. Administrador: solo su tenant.
   */
  const listarEstadoProvision = async ({ tenant_id, esPlataforma }) => {
    const condicion = esPlataforma ? 'TRUE' : 't.id = $1';
    const params = esPlataforma ? [] : [tenant_id];

    const { rows } = await obtenerDb().query(
      `SELECT
         t.id, t.nombre, t.nit, t.nrc, t.provisioning_status,
         t.provisioning_operation_id, t.last_pos_sync_at, t.creado_en, t.activo,
         (t.api_key_hash IS NOT NULL) AS tiene_api_key,
         COUNT(e.id) FILTER (WHERE e.estado IN ('pendiente', 'enviado')) AS eventos_pendientes,
         COUNT(e.id) FILTER (WHERE e.estado = 'fallido') AS eventos_fallidos,
         a.id            AS admin_id,
         a.email         AS admin_email,
         a.nombre        AS admin_nombre
       FROM tenants t
       LEFT JOIN eventos_provision e ON e.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT id, email, nombre
         FROM usuarios
         WHERE tenant_id = t.id AND rol = 'administrador' AND activo = TRUE
         ORDER BY creado_en ASC
         LIMIT 1
       ) a ON TRUE
       WHERE ${condicion}
       GROUP BY t.id, a.id, a.email, a.nombre
       ORDER BY t.creado_en DESC`,
      params
    );

    return rows.map((row) => ({
      ...formatearTenant(row),
      // Fase 4: separa visualmente la API Key técnica (integración) de las
      // credenciales oficiales Hacienda. El valor NUNCA se expone — solo el
      // hecho de que existe (spec §3.3).
      tiene_api_key: !!row.tiene_api_key,
      eventos_pendientes: parseInt(row.eventos_pendientes || 0, 10),
      eventos_fallidos: parseInt(row.eventos_fallidos || 0, 10),
      // Admin inicial del tenant (email/nombre): necesario para prellenar la
      // edición desde plataforma. Nunca incluye password ni hashes.
      admin: row.admin_id ? {
        id:     row.admin_id,
        email:  row.admin_email,
        nombre: row.admin_nombre,
      } : null,
    }));
  };

  /**
   * Alta de empresa iniciada desde DTE (rol plataforma).
   * Bootstrap COMPLETO en una sola transacción (2026-10-10):
   *  1. tenants                    — identidad fiscal (pending_fiscal_setup)
   *  2. configuracion              — datos del emisor (sin credenciales aún)
   *  3. establecimientos           — establecimiento fiscal inicial (ready)
   *  4. correlativos               — secuencias por tipo DTE × ambiente
   *  5. usuarios                   — administrador inicial ASIGNADO al
   *                                  establecimiento (nunca con NULL)
   * Tras el COMMIT se publican los eventos de provisión (outbox idempotente).
   * El usuario equivalente en POS (mismo admin + PIN) solo se crea si
   * crear_usuario_pos=true (toggle de la UI). Los reintentos (mismo
   * operation_id) NO duplican nada.
   */
  const crearTenantDesdePlataforma = async ({ datos, operationId, usuario = null, ip = null }) => {
    const { error: validacionError, value } = crearTenantPlataformaSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const tenantId = value.tenant_id.toLowerCase();
    const operationIdNorm = (operationId || value.operation_id || '').toLowerCase();
    const {
      email_admin: emailAdmin,
      password: passwordUsuario,
      pin,
      nombre_usuario: nombreUsuario,
      apellido: apellidoUsuario,
      crear_usuario_pos: crearUsuarioPos,
      establecimiento: est,
      ...datosTenant
    } = value;
    const emailNorm = emailAdmin.toLowerCase();

    const db = obtenerDb();
    const client = await db.getClient();

    let tenantRow = null;
    let duplicado = false;

    try {
      await client.query('BEGIN');

      // ── 1. TENANT (idempotencia por operation_id / tenant_id) ──
      const { rows: porOperacion } = await client.query(
        `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                provisioning_operation_id, last_pos_sync_at, creado_en, activo
         FROM tenants WHERE provisioning_operation_id = $1`,
        [operationIdNorm]
      );
      if (porOperacion.length > 0) {
        tenantRow = porOperacion[0];
        duplicado = true;
      } else {
        const { rows: porId } = await client.query(
          `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                  provisioning_operation_id, last_pos_sync_at, creado_en, activo
           FROM tenants WHERE id = $1`,
          [tenantId]
        );
        if (porId.length > 0) {
          tenantRow = porId[0];
          duplicado = true;
        }
      }

      if (!duplicado) {
        try {
          const { rows: nuevos } = await client.query(
            `INSERT INTO tenants
               (id, nombre, nombre_comercial, nit, nrc, api_key_hash, provisioning_status,
                provisioning_operation_id, activo)
             VALUES ($1, $2, $3, $4, $5, NULL, 'pending_fiscal_setup', $6, TRUE)
             RETURNING id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                       provisioning_operation_id, last_pos_sync_at, creado_en, activo`,
            [tenantId, datosTenant.nombre, datosTenant.nombre_comercial || null,
             datosTenant.nit, datosTenant.nrc || null, operationIdNorm]
          );
          tenantRow = nuevos[0];
        } catch (err) {
          if (err.code === '23505') {
            // Carrera: otro request creó el tenant entre los SELECT y el INSERT.
            const { rows: existentes } = await client.query(
              `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                      provisioning_operation_id, last_pos_sync_at, creado_en, activo
               FROM tenants WHERE id = $1`,
              [tenantId]
            );
            if (existentes.length > 0) {
              tenantRow = existentes[0];
              duplicado = true;
            } else if (err.constraint === 'tenants_nit_key') {
              throw { status: 409, mensaje: 'Ya existe una empresa con ese NIT.' };
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      if (!duplicado) {
        // ── 2. CONFIGURACION — datos del emisor (bootstrap) ──
        // Credenciales Hacienda quedan vacías (nullable desde migración 028);
        // el admin las completa en la pestaña Configuración.
        await client.query(
          `INSERT INTO configuracion
             (tenant_id, nit, nrc, nombre, nombre_comercial, direccion, telefono, email,
              codigo_actividad, desc_actividad, codigo_establecimiento, codigo_punto_venta,
              tipo_establecimiento, departamento_cod, municipio_cod, ambiente)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', '', $9, $10, $11, $12, $13, '00')`,
          [tenantId, datosTenant.nit, datosTenant.nrc || null, datosTenant.nombre,
           datosTenant.nombre_comercial || null, est.direccion, est.telefono || null,
           est.email || null, est.cod_estable_mh, est.cod_punto_venta_mh,
           est.tipo_establecimiento || '02', est.departamento_cod, est.municipio_cod]
        );

        // ── 3. ESTABLECIMIENTO fiscal inicial (ready → puede emitir) ──
        const establecimientoId = crypto.randomUUID();
        await client.query(
          `INSERT INTO establecimientos
             (id, tenant_id, nombre, direccion, telefono, email, cod_estable_mh, cod_punto_venta_mh,
              cod_estable, cod_punto_venta, tipo_establecimiento, departamento_cod, municipio_cod,
              fiscal_status, provisioning_status, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $8, $9, $10, $11, 'ready', 'confirmed', TRUE)`,
          [establecimientoId, tenantId, est.nombre, est.direccion, est.telefono || null,
           est.email || null, est.cod_estable_mh, est.cod_punto_venta_mh,
           est.tipo_establecimiento || '02', est.departamento_cod, est.municipio_cod]
        );

        // ── 4. CORRELATIVOS — secuencias por tipo DTE × ambiente (spec §10) ──
        for (const tipoDte of TIPOS_DTE_CORRELATIVOS) {
          for (const ambiente of AMBIENTES_CORRELATIVOS) {
            await client.query(
              `INSERT INTO correlativos (tenant_id, tipo_dte, ambiente, establecimiento_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [tenantId, tipoDte, ambiente, establecimientoId]
            );
          }
        }

        // ── 5. ADMINISTRADOR inicial — SIEMPRE asignado al establecimiento ──
        // Idempotente por (tenant_id, email): un reintento no duplica y solo
        // reasigna el establecimiento si aún estaba NULL.
        const { rows: admins } = await client.query(
          'SELECT id FROM usuarios WHERE email = $1 AND tenant_id = $2',
          [emailNorm, tenantId]
        );
        if (admins.length > 0) {
          await client.query(
            'UPDATE usuarios SET establecimiento_id = $1 WHERE id = $2 AND establecimiento_id IS NULL',
            [establecimientoId, admins[0].id]
          );
        } else {
          const passwordHash = await bcryptImpl.hash(passwordUsuario, BCRYPT_ROUNDS);
          await client.query(
            `INSERT INTO usuarios (nombre, email, password_hash, rol, establecimiento_id, tenant_id)
             VALUES ($1, $2, $3, 'administrador', $4, $5)`,
            [nombreUsuario, emailNorm, passwordHash, establecimientoId, tenantId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* idealmente ya rolleado */ }
      throw err;
    } finally {
      if (client && typeof client.release === 'function') client.release();
    }

    const tenant = formatearTenant(tenantRow);

    if (duplicado) {
      return resolverDuplicado({ tenant: tenantRow, operationId: operationIdNorm, generarClave: false });
    }

    // Eventos de provisión (FUERA de la transacción — outbox idempotente).
    await obtenerOutbox().publicarEvento({
      operation_id: operationIdNorm,
      tenant_id: tenantId,
      tipo_evento: 'TENANT_CREADO',
      payload: {
        nombre: tenant.nombre,
        nombre_comercial: tenant.nombre_comercial || null,
        nit: tenant.nit,
        nrc: tenant.nrc || null,
        establecimiento: {
          id: null, // el establecimiento es del tenant DTE; POS lo crea por vínculo
          nombre: est.nombre,
          cod_estable_mh: est.cod_estable_mh,
          cod_punto_venta_mh: est.cod_punto_venta_mh,
        },
      },
    });

    await audit({
      tenant_id: tenantId,
      evento: 'PROVISION_TENANT_CREADO',
      detalles: { operation_id: operationIdNorm, origen: 'dte' },
      usuario_id: usuario?.id || null,
      ip,
      status_http: 201,
    });

    // Usuario POS (opcional — toggle "esta empresa usará POS"): SOLO hashes
    // bcrypt (password y PIN), nunca texto plano (spec §3.3).
    if (crearUsuarioPos) {
      await obtenerOutbox().publicarEvento({
        operation_id: operationIdNorm,
        tenant_id: tenantId,
        tipo_evento: 'USUARIO_INICIAL',
        payload: {
          nombre: nombreUsuario,
          apellido: apellidoUsuario || null,
          email: emailNorm,
          rol: 'administrador',
          password_hash: await bcryptImpl.hash(passwordUsuario, BCRYPT_ROUNDS),
          pin_hash: await bcryptImpl.hash(pin, BCRYPT_ROUNDS),
        },
      });

      await audit({
        tenant_id: tenantId,
        evento: 'PROVISION_USUARIO_INICIAL',
        detalles: {
          operation_id: operationIdNorm,
          email: emailNorm,
          rol: 'administrador',
          destino: 'pos',
        },
        usuario_id: usuario?.id || null,
        ip,
        status_http: 201,
      });

      logger.info('Usuario inicial del tenant creado (DTE + POS)', {
        tenant_id: tenantId,
        email: emailNorm,
        rol: 'administrador',
        // NUNCA loguear password ni PIN.
      });
    } else {
      logger.info('Tenant creado sin usuario POS (empresa solo DTE)', {
        tenant_id: tenantId,
        email_admin: emailNorm,
      });
    }

    logger.info('Tenant fiscal creado por plataforma (bootstrap completo)', {
      tenant_id: tenantId,
      provisioning_status: 'pending_fiscal_setup',
      establecimiento: est.nombre,
    });

    return { tenant, api_key: null, reentregada: false };
  };

  /**
   * Edición de los datos de la empresa desde la plataforma DTE (rol plataforma).
   * El NIT es INMUTABLE (schema lo rechaza con 400). Solo nombre,
   * nombre_comercial y nrc se actualizan en `tenants` y se sincronizan en la
   * fila de `configuracion` (si existe) para no desfasar la pestaña
   * Configuración con la identidad que muestra el login.
   */
  const actualizarTenantDesdePlataforma = async ({ tenantId, datos, usuario = null, ip = null }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();
    const { error: validacionError, value } = actualizarTenantPlataformaSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const { rows: existentes } = await obtenerDb().query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantIdNorm]
    );
    if (existentes.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }

    const camposEditables = ['nombre', 'nombre_comercial', 'nrc'];
    const normalizar = (campo, valor) =>
      campo === 'nombre_comercial' && !valor ? null : valor;

    const campos  = [];
    const valores = [];
    let idx = 1;
    for (const campo of camposEditables) {
      if (value[campo] !== undefined) {
        campos.push(`${campo} = $${idx++}`);
        valores.push(normalizar(campo, value[campo]));
      }
    }

    const { rows: actualizados } = await obtenerDb().query(
      `UPDATE tenants SET ${campos.join(', ')}, actualizado_en = NOW()
       WHERE id = $${idx}
       RETURNING id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                 provisioning_operation_id, last_pos_sync_at, creado_en, activo`,
      [...valores, tenantIdNorm]
    );

    // Sincronización con configuracion (solo si la fila ya existe).
    const camposConfig  = [];
    const valoresConfig = [];
    let idxConfig = 1;
    for (const campo of camposEditables) {
      if (value[campo] !== undefined) {
        camposConfig.push(`${campo} = $${idxConfig++}`);
        valoresConfig.push(normalizar(campo, value[campo]));
      }
    }
    await obtenerDb().query(
      `UPDATE configuracion SET ${camposConfig.join(', ')}, actualizado_en = NOW()
       WHERE tenant_id = $${idxConfig}`,
      [...valoresConfig, tenantIdNorm]
    );

    await audit({
      tenant_id: tenantIdNorm,
      evento: 'PROVISION_TENANT_EDITADO',
      detalles: { campos: Object.keys(value) },
      usuario_id: usuario?.id || null,
      ip,
      status_http: 200,
    });

    logger.info('Tenant editado desde plataforma', {
      tenant_id: tenantIdNorm,
      campos: Object.keys(value),
    });

    return formatearTenant(actualizados[0]);
  };

  /**
   * Edición del usuario administrador INICIAL del tenant (rol plataforma).
   * El administrador inicial es el más antiguo con rol administrador —
   * si olvidaste sus credenciales, este endpoint permite corregirlas.
   * Password ausente = no cambia; si cambia, se resetean intentos y bloqueo.
   */
  const actualizarAdminDesdePlataforma = async ({ tenantId, datos, usuario = null, ip = null }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();
    const { error: validacionError, value } = actualizarAdminTenantSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const { rows: existentes } = await obtenerDb().query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantIdNorm]
    );
    if (existentes.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }

    const { rows: admins } = await obtenerDb().query(
      `SELECT id, email FROM usuarios
       WHERE tenant_id = $1 AND rol = 'administrador' AND activo = TRUE
       ORDER BY creado_en ASC
       LIMIT 1`,
      [tenantIdNorm]
    );
    if (admins.length === 0) {
      throw { status: 404, mensaje: 'El tenant no tiene un usuario administrador activo.' };
    }
    const admin = admins[0];

    if (value.email) {
      const { rows: duplicados } = await obtenerDb().query(
        'SELECT id FROM usuarios WHERE email = $1 AND tenant_id = $2 AND id != $3',
        [value.email.toLowerCase(), tenantIdNorm, admin.id]
      );
      if (duplicados.length > 0) {
        throw { status: 409, mensaje: 'Ya existe otro usuario con ese email en este tenant.' };
      }
    }

    const campos  = [];
    const valores = [];
    let idx = 1;

    if (value.email !== undefined) {
      campos.push(`email = $${idx++}`);
      valores.push(value.email.toLowerCase());
    }
    if (value.nombre !== undefined) {
      campos.push(`nombre = $${idx++}`);
      valores.push(value.nombre);
    }
    if (value.password) {
      campos.push(`password_hash = $${idx++}`);
      valores.push(await bcryptImpl.hash(value.password, BCRYPT_ROUNDS));
      campos.push(`intentos_fallidos = $${idx++}`);
      valores.push(0);
      campos.push(`bloqueado_hasta = $${idx++}`);
      valores.push(null);
    }

    const { rows: actualizado } = await obtenerDb().query(
      `UPDATE usuarios SET ${campos.join(', ')}, actualizado_en = NOW()
       WHERE id = $${idx}
       RETURNING id, nombre, email, rol, activo`,
      [...valores, admin.id]
    );

    await audit({
      tenant_id: tenantIdNorm,
      evento: 'PROVISION_ADMIN_EDITADO',
      detalles: { campos: Object.keys(value).filter((c) => c !== 'password'), password_cambiada: !!value.password },
      usuario_id: usuario?.id || null,
      ip,
      status_http: 200,
    });

    logger.info('Admin inicial del tenant editado desde plataforma', {
      tenant_id: tenantIdNorm,
      campos: Object.keys(value).filter((c) => c !== 'password'),
      // NUNCA loguear password
    });

    return {
      id:     actualizado[0].id,
      nombre: actualizado[0].nombre,
      email:  actualizado[0].email,
      rol:    actualizado[0].rol,
      activo: actualizado[0].activo,
    };
  };

  /**
   * Solicita el vínculo fiscal de una sucursal POS (spec §6.3).
   *
   * Flujo:
   * 1. POS crea la sucursal operativa con branch_id compartido.
   * 2. POS solicita la vinculación fiscal al DTE Service.
   * 3. DTE registra una solicitud pendiente SIN inventar códigos MH
   *    (fiscal_status = pending_mh_data; el administrador los completa).
   *
   * Idempotente: la misma (tenant_id, branch_id) nunca duplica el
   * establecimiento. operation_id se registra como referencia de la
   * operación (spec §8: idempotencia obligatoria).
   */
  const vincularSucursal = async ({ tenantId, datos, operationId, ip = null }) => {
    const { error: validacionError, value } = vincularSucursalSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const tenantIdNorm = tenantId.toLowerCase();
    const branchId = value.branch_id.toLowerCase();
    const operationIdNorm = (operationId || value.operation_id || '').toLowerCase();

    if (!operationIdNorm) {
      throw { status: 400, mensaje: 'operation_id es requerido (header Idempotency-Key o body).' };
    }

    // 1. El tenant debe existir y estar activo.
    const { rows: tenants } = await obtenerDb().query(
      'SELECT id, activo FROM tenants WHERE id = $1',
      [tenantIdNorm]
    );
    if (tenants.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }
    if (!tenants[0].activo) {
      throw { status: 409, mensaje: 'El tenant está inactivo y no puede vincular sucursales.' };
    }

    const formatearVinculo = (row) => ({
      establecimiento_id: row.id,
      branch_id: row.branch_id,
      nombre: row.nombre,
      fiscal_status: row.fiscal_status,
      provisioning_status: row.provisioning_status,
    });

    // 2. Idempotencia por branch_id (único dentro del tenant — índice 023).
    const { rows: porBranch } = await obtenerDb().query(
      `SELECT id, branch_id, nombre, fiscal_status, provisioning_status
       FROM establecimientos
       WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantIdNorm, branchId]
    );
    if (porBranch.length > 0) {
      return { establecimiento: formatearVinculo(porBranch[0]), duplicado: true };
    }

    // 3. Crear el establecimiento pendiente (sin códigos MH — los completa el admin).
    try {
      const { rows } = await obtenerDb().query(
        `INSERT INTO establecimientos
           (tenant_id, branch_id, nombre, direccion, telefono,
            tipo_establecimiento, fiscal_status, provisioning_status)
         VALUES ($1, $2, $3, $4, $5, '02', 'pending_mh_data', 'pending')
         RETURNING id, branch_id, nombre, fiscal_status, provisioning_status`,
        [tenantIdNorm, branchId, value.nombre, value.direccion || null, value.telefono || null]
      );

      await audit({
        tenant_id: tenantIdNorm,
        evento: 'PROVISION_BRANCH_SOLICITADO',
        detalles: {
          operation_id: operationIdNorm,
          branch_id: branchId,
          establecimiento_id: rows[0].id,
        },
        ip,
        status_http: 201,
      });

      logger.info('Vínculo de sucursal solicitado', {
        tenant_id: tenantIdNorm,
        branch_id: branchId,
        establecimiento_id: rows[0].id,
        fiscal_status: 'pending_mh_data',
      });

      return { establecimiento: formatearVinculo(rows[0]), duplicado: false };
    } catch (err) {
      if (err.code === '23505') {
        // Carrera: otra request creó el establecimiento entre SELECT e INSERT.
        const { rows: existentes } = await obtenerDb().query(
          `SELECT id, branch_id, nombre, fiscal_status, provisioning_status
           FROM establecimientos
           WHERE tenant_id = $1 AND branch_id = $2`,
          [tenantIdNorm, branchId]
        );
        if (existentes.length > 0) {
          return { establecimiento: formatearVinculo(existentes[0]), duplicado: true };
        }
      }
      throw err;
    }
  };

  /**
   * Estado fiscal de lectura para el POS (Fase 4 — spec §12 Emisión, criterio
   * "POS puede consultar estado fiscal, pero nunca leer ni modificar secretos").
   *
   * Devuelve señales operativas SIN ningún secreto:
   * - provisioning_status del tenant.
   * - credenciales_hacienda / token_vigente (booleanos, no valores).
   * - estado de firma por tenant (firmador_disponible, credencial_disponible).
   * - establecimientos con su fiscal_status (solo ready puede emitir).
   */
  const obtenerEstadoFiscalTenant = async ({ tenantId }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();

    const { rows: tenants } = await obtenerDb().query(
      'SELECT id, provisioning_status FROM tenants WHERE id = $1',
      [tenantIdNorm]
    );
    if (tenants.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }

    const { rows: configs } = await obtenerDb().query(
      `SELECT
         (usuario_hacienda IS NOT NULL AND password_hacienda IS NOT NULL) AS tiene_credenciales,
         (token_hacienda IS NOT NULL) AS tiene_token,
         token_expira_en
       FROM configuracion
       WHERE tenant_id = $1`,
      [tenantIdNorm]
    );
    const config = configs[0] || null;
    const credencialesHacienda = !!(config && config.tiene_credenciales);
    const tokenVigente = !!(
      config && config.tiene_token && config.token_expira_en &&
      new Date(config.token_expira_en) > new Date()
    );

    const { rows: establecimientos } = await obtenerDb().query(
      `SELECT id, branch_id, fiscal_status, activo
       FROM establecimientos
       WHERE tenant_id = $1
       ORDER BY creado_en ASC`,
      [tenantIdNorm]
    );

    const firma = await obtenerEstadoFirma()({ tenant_id: tenantIdNorm });

    return {
      tenant_id: tenantIdNorm,
      provisioning_status: tenants[0].provisioning_status,
      credenciales_hacienda: credencialesHacienda,
      token_vigente: tokenVigente,
      firma,
      establecimientos: establecimientos.map((e) => ({
        establecimiento_id: e.id,
        branch_id: e.branch_id || null,
        fiscal_status: e.fiscal_status,
        activo: e.activo,
      })),
    };
  };

  return {
    generarApiKey,
    crearTenant,
    actualizarEstado,
    vincularSucursal,
    listarEstadoProvision,
    crearTenantDesdePlataforma,
    actualizarTenantDesdePlataforma,
    actualizarAdminDesdePlataforma,
    obtenerEstadoFiscalTenant,
  };
};

// El módulo exporta la instancia por defecto (uso normal) y la factory
// (unit tests con dependencias inyectadas).
module.exports = crearServicioProvisioning();
module.exports.crearServicioProvisioning = crearServicioProvisioning;