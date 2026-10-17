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
const { v5: uuidv5 } = require('uuid');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');
const { registrarEventoAuditoria } = require('../../utils/auditoria');
const {
  crearTenantSchema,
  crearTenantPlataformaSchema,
  actualizarTenantPlataformaSchema,
  actualizarAdminTenantSchema,
  actualizarEstadoSchema,
  habilitarPosSchema,
  vincularSucursalSchema,
} = require('./provisioning.schema');

// BCRYPT_ROUNDS = 12 (mismo estándar que usuarios.service.js y seed.js).
const BCRYPT_ROUNDS = 12;

// Correlativos del establecimiento inicial: mismos tipos y ambientes que
// establecimientos.service.js (spec §10 — secuencias por establecimiento).
const TIPOS_DTE_CORRELATIVOS = ['01', '03', '04', '05', '06', '07', '08', '09', '11', '14', '15'];
const AMBIENTES_CORRELATIVOS = ['00', '01'];

// Namespace determinista de los eventos secundarios del alta (C1, 2026-10-13).
// El POS deduplica los eventos por (tenant_id, operation_id): BRANCH_VINCULADO
// y USUARIO_INICIAL NO pueden reutilizar el operation_id de la operación
// canónica (el mismo de TENANT_CREADO) o el POS descarta el evento por
// "duplicado". uuid v5 mantiene el id estable ante reintentos.
const NAMESPACE_EVENTO_ALTA = '3a7f0c2e-6b1d-4f8a-9c5e-2d4b8a1f6e30';
const operationIdEventoAlta = (tipoEvento, clave) =>
  uuidv5(`${tipoEvento}:${clave}`, NAMESPACE_EVENTO_ALTA);

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

  // Validador de ubicación CAT-012/013/008 — lazy e inyectable (unit tests).
  let validarUbicacionActual = null;
  const obtenerValidarUbicacion = () => {
    if (!validarUbicacionActual) {
      validarUbicacionActual = dependencias.validarUbicacion
        || require('../catalogos/catalogos.service').validarUbicacionCatalogo;
    }
    return validarUbicacionActual;
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
    tiene_pos: !!row.tiene_pos,
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
        provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo
       FROM tenants WHERE provisioning_operation_id = $1`,
      [operationIdNorm]
    );
    if (porOperacion.length > 0) {
      return resolverDuplicado({ tenant: porOperacion[0], operationId: operationIdNorm, generarClave });
    }

    // 2. Idempotencia por tenant_id.
    const { rows: porId } = await obtenerDb().query(
`SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
        provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo
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
            provisioning_operation_id, activo, tiene_pos)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_fiscal_setup', $7, TRUE, $8)`,
        [tenantId, value.nombre, value.nombre_comercial || null, value.nit, value.nrc || null, apiKeyHash, operationIdNorm, generarClave]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Carrera: otra request creó el tenant entre SELECT e INSERT.
        const { rows: existentes } = await obtenerDb().query(
          `SELECT id, nombre, nit, nrc, provisioning_status, provisioning_operation_id,
                  last_pos_sync_at, tiene_pos, creado_en, activo
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
      tiene_pos: !!generarClave,
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
         t.provisioning_operation_id, t.last_pos_sync_at, t.creado_en, t.activo, t.tiene_pos,
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
         WHERE tenant_id = t.id AND 'administrador' = ANY(roles) AND activo = TRUE
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
   *  3. establecimientos           — establecimiento fiscal inicial (ready,
   *                                  con branch_id compartido — spec §6.4)
   *  4. correlativos               — secuencias por tipo DTE × ambiente
   *  5. usuarios                   — administrador inicial ASIGNADO al
   *                                  establecimiento (nunca con NULL)
   * Tras el COMMIT se publican los eventos de provisión (outbox idempotente).
   * El usuario equivalente en POS (mismo admin + PIN) solo se crea si
   * crear_usuario_pos=true (toggle de la UI); la sucursal inicial
   * (BRANCH_VINCULADO) también se sincroniza SOLO con el toggle activo.
   * Los reintentos (mismo operation_id) NO duplican nada.
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

    // Ubicación fiscal del establecimiento inicial contra los catálogos
    // oficiales CAT-012/CAT-013/CAT-008 (migración 034). El MH valida estos
    // códigos al emitir (rechazo 096) — se rechaza el alta con códigos
    // fuera de catálogo.
    const erroresUbicacion = await obtenerValidarUbicacion()({
      departamento_cod: est.departamento_cod,
      municipio_cod:    est.municipio_cod,
      distrito_cod:     est.distrito_cod,
    });
    if (erroresUbicacion.length > 0) {
      throw { status: 400, mensaje: erroresUbicacion.join(' ') };
    }

    const db = obtenerDb();
    const client = await db.getClient();

    let tenantRow = null;
    let duplicado = false;
    // Ids del establecimiento inicial del bootstrap: declarados fuera del
    // try porque los eventos post-COMMIT (BRANCH_VINCULADO) los referencian.
    let establecimientoId = null;
    let branchId = null;

    try {
      await client.query('BEGIN');

      // ── 1. TENANT (idempotencia por operation_id / tenant_id) ──
      const { rows: porOperacion } = await client.query(
        `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo
         FROM tenants WHERE provisioning_operation_id = $1`,
        [operationIdNorm]
      );
      if (porOperacion.length > 0) {
        tenantRow = porOperacion[0];
        duplicado = true;
      } else {
        const { rows: porId } = await client.query(
          `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                  provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo
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
                provisioning_operation_id, activo, tiene_pos)
             VALUES ($1, $2, $3, $4, $5, NULL, 'pending_fiscal_setup', $6, TRUE, $7)
             RETURNING id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                       provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo`,
            [tenantId, datosTenant.nombre, datosTenant.nombre_comercial || null,
             datosTenant.nit, datosTenant.nrc || null, operationIdNorm, !!crearUsuarioPos]
          );
          tenantRow = nuevos[0];
        } catch (err) {
          if (err.code === '23505') {
            // Carrera: otro request creó el tenant entre los SELECT y el INSERT.
            const { rows: existentes } = await client.query(
              `SELECT id, nombre, nombre_comercial, nit, nrc, provisioning_status,
                      provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo
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
        // Nace con branch_id compartido (spec §6.4): el POS proyecta la
        // sucursal con este identificador cuando el toggle POS está activo.
        establecimientoId = crypto.randomUUID();
        branchId = crypto.randomUUID();
        await client.query(
          `INSERT INTO establecimientos
             (id, tenant_id, branch_id, nombre, direccion, telefono, email, cod_estable_mh, cod_punto_venta_mh,
              cod_estable, cod_punto_venta, tipo_establecimiento, departamento_cod, municipio_cod, distrito_cod,
              fiscal_status, provisioning_status, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $9, $10, $11, $12, $13, 'ready', 'confirmed', TRUE)`,
          [establecimientoId, tenantId, branchId, est.nombre, est.direccion, est.telefono || null,
           est.email || null, est.cod_estable_mh, est.cod_punto_venta_mh,
           est.tipo_establecimiento || '02', est.departamento_cod, est.municipio_cod, est.distrito_cod]
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
    // Contrato estricto del receptor POS (Joi allowUnknown=false): el payload
    // solo lleva claves definidas — la sucursal inicial viaja por
    // BRANCH_VINCULADO (regresión del 400 del 2026-10-10, C1).
    await obtenerOutbox().publicarEvento({
      operation_id: operationIdNorm,
      tenant_id: tenantId,
      tipo_evento: 'TENANT_CREADO',
      payload: {
        nombre: tenant.nombre,
        nombre_comercial: tenant.nombre_comercial || null,
        nit: tenant.nit,
        nrc: tenant.nrc || null,
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
      // Sucursal inicial (C1): SOLO las empresas con POS proyectan su
      // establecimiento. operation_id propio (uuid v5) — el POS deduplica
      // por (tenant_id, operation_id) y descartaría un id repetido.
      const operationIdBranch = operationIdEventoAlta('BRANCH_VINCULADO', branchId);
      await obtenerOutbox().publicarEvento({
        operation_id: operationIdBranch,
        tenant_id: tenantId,
        branch_id: branchId,
        tipo_evento: 'BRANCH_VINCULADO',
        payload: {
          branch_id: branchId,
          establecimiento_id: establecimientoId,
          fiscal_status: 'ready',
          nombre: est.nombre,
          direccion: est.direccion || null,
          telefono: est.telefono || null,
          cod_estable_mh: est.cod_estable_mh,
          cod_punto_venta_mh: est.cod_punto_venta_mh,
          tipo_establecimiento: est.tipo_establecimiento || '02',
          departamento_cod: est.departamento_cod,
          municipio_cod: est.municipio_cod,
        },
      });

      await audit({
        tenant_id: tenantId,
        evento: 'PROVISION_BRANCH_VINCULADO',
        detalles: {
          operation_id: operationIdBranch,
          branch_id: branchId,
          establecimiento_id: establecimientoId,
        },
        usuario_id: usuario?.id || null,
        ip,
        status_http: 201,
      });

      logger.info('Sucursal inicial vinculada al POS (bootstrap)', {
        tenant_id: tenantId,
        branch_id: branchId,
        establecimiento_id: establecimientoId,
        fiscal_status: 'ready',
      });

      const operationIdUsuario = operationIdEventoAlta('USUARIO_INICIAL', tenantId);
      await obtenerOutbox().publicarEvento({
        operation_id: operationIdUsuario,
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
          operation_id: operationIdUsuario,
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
                 provisioning_operation_id, last_pos_sync_at, tiene_pos, creado_en, activo`,
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
       WHERE tenant_id = $1 AND 'administrador' = ANY(roles) AND activo = TRUE
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
       RETURNING id, nombre, email, rol, roles, activo`,
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
      roles:  actualizado[0].roles,
      activo: actualizado[0].activo,
    };
  };

  /**
   * Habilita POS para una empresa creada "solo DTE" (2026-10-16).
   *
   * El alta desde DTE puede crear empresas sin POS (toggle desactivado):
   * quedan sin API Key técnica, sin sucursal proyectada y sin usuario POS.
   * Este método cierra ese hueco cuando la empresa decide adquirir POS:
   *   1. Genera la API Key técnica SOLO si no existe (hash bcrypt en DTE;
   *      el texto plano se devuelve UNA vez para que el operador lo cargue).
   *   2. Marca `tenants.tiene_pos = TRUE`.
   *   3. Publica `BRANCH_VINCULADO` por cada establecimiento existente con
   *      `branch_id` (proyección de sucursales en el POS).
   *   4. Publica `USUARIO_INICIAL` con el MISMO password_hash del admin DTE
   *      + el PIN capturado ahora (solo hashes viajan — spec §3.3).
   *
   * Idempotente: si la empresa ya tiene POS, no rota la clave ni reentrega
   * eventos (devuelve `ya_habilitado: true`).
   */
  const habilitarPosTenant = async ({ tenantId, datos, usuario = null, ip = null }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();
    const { error: validacionError, value } = habilitarPosSchema.validate(datos);
    if (validacionError) {
      throw { status: 400, mensaje: validacionError.details[0].message };
    }

    const { rows: tenants } = await obtenerDb().query(
      `SELECT id, nombre, nit, nrc, nombre_comercial, provisioning_status,
              provisioning_operation_id, last_pos_sync_at, tiene_pos, activo,
              api_key_hash
       FROM tenants WHERE id = $1`,
      [tenantIdNorm]
    );
    if (tenants.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }
    const tenant = tenants[0];
    if (!tenant.activo) {
      throw { status: 409, mensaje: 'El tenant está inactivo y no puede habilitar POS.' };
    }

    // Administrador inicial (el más antiguo activo): su contraseña ya rige en
    // DTE; al POS viaja el MISMO hash + el PIN capturado ahora.
    const { rows: admins } = await obtenerDb().query(
      `SELECT id, nombre, email, password_hash
       FROM usuarios
       WHERE tenant_id = $1 AND 'administrador' = ANY(roles) AND activo = TRUE
       ORDER BY creado_en ASC
       LIMIT 1`,
      [tenantIdNorm]
    );
    if (admins.length === 0) {
      throw {
        status: 409,
        mensaje: 'La empresa no tiene un administrador activo para proyectar al POS.',
      };
    }
    const admin = admins[0];

    // Idempotencia: ya tiene POS → no se rota la clave ni se duplican eventos.
    if (tenant.tiene_pos) {
      return { tenant_id: tenantIdNorm, tiene_pos: true, ya_habilitado: true, api_key: null };
    }

    // API Key técnica: se genera solo si no existe. Se devuelve UNA vez.
    let apiKey = null;
    let apiKeyHash = tenant.api_key_hash;
    if (!apiKeyHash) {
      apiKey = generarApiKey();
      apiKeyHash = await bcryptImpl.hash(apiKey, BCRYPT_ROUNDS);
    }

    await obtenerDb().query(
      'UPDATE tenants SET tiene_pos = TRUE, api_key_hash = $1, actualizado_en = NOW() WHERE id = $2',
      [apiKeyHash, tenantIdNorm]
    );

    // Asegurar la proyección del tenant en el POS ANTES de sucursal/usuario.
    // El alta desde DTE ya publica TENANT_CREADO, pero si ese evento nunca se
    // entregó (POS caído / clave interna no configurada al crear la empresa)
    // el POS no tiene el tenant y BRANCH/USUARIO fallarían con 409. Publicar es
    // idempotente (ON CONFLICT por operation_id + tipo_evento).
    await obtenerOutbox().publicarEvento({
      operation_id: tenant.provisioning_operation_id || operationIdEventoAlta('TENANT_CREADO', tenantIdNorm),
      tenant_id: tenantIdNorm,
      tipo_evento: 'TENANT_CREADO',
      payload: {
        nombre: tenant.nombre,
        nombre_comercial: tenant.nombre_comercial || null,
        nit: tenant.nit,
        nrc: tenant.nrc || null,
      },
    });

    // Reactivar eventos fallidos previos para que el worker reintente la cadena
    // completa (si el POS estuvo caído, TENANT_CREADO quedó en 'fallido' y el
    // POS nunca proyectó la empresa).
    if (typeof obtenerOutbox().reactivarEventosTenant === 'function') {
      await obtenerOutbox().reactivarEventosTenant(tenantIdNorm);
    }

    // Sucursales existentes → BRANCH_VINCULADO (proyección operativa en POS).
    const { rows: establecimientos } = await obtenerDb().query(
      `SELECT id, branch_id, nombre, direccion, telefono, cod_estable_mh,
              cod_punto_venta_mh, tipo_establecimiento, departamento_cod,
              municipio_cod, fiscal_status
       FROM establecimientos
       WHERE tenant_id = $1 AND branch_id IS NOT NULL
       ORDER BY creado_en ASC`,
      [tenantIdNorm]
    );

    for (const est of establecimientos) {
      const operationIdBranch = operationIdEventoAlta('BRANCH_VINCULADO', est.branch_id);
      await obtenerOutbox().publicarEvento({
        operation_id: operationIdBranch,
        tenant_id: tenantIdNorm,
        branch_id: est.branch_id,
        tipo_evento: 'BRANCH_VINCULADO',
        payload: {
          branch_id: est.branch_id,
          establecimiento_id: est.id,
          fiscal_status: est.fiscal_status,
          nombre: est.nombre,
          direccion: est.direccion || null,
          telefono: est.telefono || null,
          cod_estable_mh: est.cod_estable_mh || null,
          cod_punto_venta_mh: est.cod_punto_venta_mh || null,
          tipo_establecimiento: est.tipo_establecimiento || '02',
          departamento_cod: est.departamento_cod || null,
          municipio_cod: est.municipio_cod || null,
        },
      });
      await audit({
        tenant_id: tenantIdNorm,
        evento: 'PROVISION_BRANCH_VINCULADO',
        detalles: {
          operation_id: operationIdBranch,
          branch_id: est.branch_id,
          establecimiento_id: est.id,
          origen: 'habilitar_pos',
        },
        usuario_id: usuario?.id || null,
        ip,
        status_http: 201,
      });
    }

    // Usuario inicial → POS (solo hashes bcrypt).
    const operationIdUsuario = operationIdEventoAlta('USUARIO_INICIAL', tenantIdNorm);
    await obtenerOutbox().publicarEvento({
      operation_id: operationIdUsuario,
      tenant_id: tenantIdNorm,
      tipo_evento: 'USUARIO_INICIAL',
      payload: {
        nombre: admin.nombre,
        apellido: null,
        email: admin.email,
        rol: 'administrador',
        password_hash: admin.password_hash,
        pin_hash: await bcryptImpl.hash(value.pin, BCRYPT_ROUNDS),
      },
    });

    await audit({
      tenant_id: tenantIdNorm,
      evento: 'PROVISION_POS_HABILITADO',
      detalles: {
        operation_id: operationIdUsuario,
        email: admin.email,
        sucursales: establecimientos.length,
        api_key_generada: !!apiKey,
      },
      usuario_id: usuario?.id || null,
      ip,
      status_http: 201,
    });

    logger.info('POS habilitado para tenant existente', {
      tenant_id: tenantIdNorm,
      sucursales: establecimientos.length,
      api_key_generada: !!apiKey,
      // NUNCA loguear la API Key ni el PIN.
    });

    return { tenant_id: tenantIdNorm, tiene_pos: true, ya_habilitado: false, api_key: apiKey };
  };

  /**
   * Reintenta la sincronización POS de un tenant (2026-10-16).
   *
   * Caso de uso: la empresa existe en DTE pero NO aparece en el POS porque el
   * evento `TENANT_CREADO` (o los siguientes) quedaron en estado `fallido`
   * (POS caído o clave interna sin configurar al crear la empresa).
   *
   * Acciones:
   *   1. Re-publica `TENANT_CREADO` (idempotente) para garantizar la
   *      proyección del tenant en el POS.
   *   2. Reactiva los eventos `fallido` del tenant (estado → `pendiente`,
   *      intentos = 0) para que el worker reintente la cadena completa.
   *
   * No genera/rota la API Key ni crea usuarios: solo destraba la entrega.
   */
  const reintentarSincronizacionPos = async ({ tenantId, usuario = null, ip = null }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();

    const { rows: tenants } = await obtenerDb().query(
      `SELECT id, nombre, nit, nrc, nombre_comercial, provisioning_operation_id,
              tiene_pos, activo
       FROM tenants WHERE id = $1`,
      [tenantIdNorm]
    );
    if (tenants.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }
    const tenant = tenants[0];
    if (!tenant.activo) {
      throw { status: 409, mensaje: 'El tenant está inactivo.' };
    }

    await obtenerOutbox().publicarEvento({
      operation_id: tenant.provisioning_operation_id || operationIdEventoAlta('TENANT_CREADO', tenantIdNorm),
      tenant_id: tenantIdNorm,
      tipo_evento: 'TENANT_CREADO',
      payload: {
        nombre: tenant.nombre,
        nombre_comercial: tenant.nombre_comercial || null,
        nit: tenant.nit,
        nrc: tenant.nrc || null,
      },
    });

    const eventosReactivados = typeof obtenerOutbox().reactivarEventosTenant === 'function'
      ? await obtenerOutbox().reactivarEventosTenant(tenantIdNorm)
      : 0;

    await audit({
      tenant_id: tenantIdNorm,
      evento: 'PROVISION_SYNC_REINTENTADO',
      detalles: { eventos_reactivados: eventosReactivados, tiene_pos: !!tenant.tiene_pos },
      usuario_id: usuario?.id || null,
      ip,
      status_http: 200,
    });

    logger.info('Sincronización POS reintentada', {
      tenant_id: tenantIdNorm,
      eventos_reactivados: eventosReactivados,
    });

    return {
      tenant_id: tenantIdNorm,
      tiene_pos: !!tenant.tiene_pos,
      eventos_reactivados: eventosReactivados,
    };
  };

  /**
   * Ficha de EMPRESA para el POS (F1, 2026-10-16). El DTE es la única fuente de
   * verdad de empresa/sucursal; el POS la consume server-a-servidor (clave
   * interna `X-Internal-Api-Key`).
   *
   * Devuelve identidad fiscal + configuración (SIN secretos: solo booleanos de
   * "configurada") + las sucursales (establecimientos). `es_principal` se
   * deriva: el establecimiento más antiguo es la matriz (el DTE no tiene esa
   * columna).
   */
  const obtenerEmpresaTenant = async ({ tenantId }) => {
    const tenantIdNorm = String(tenantId).toLowerCase();

    const { rows: tenants } = await obtenerDb().query(
      `SELECT id, nombre, nombre_comercial, nit, nrc, activo,
              provisioning_status, tiene_pos
       FROM tenants WHERE id = $1`,
      [tenantIdNorm]
    );
    if (tenants.length === 0) {
      throw { status: 404, mensaje: 'Tenant no encontrado.' };
    }
    const t = tenants[0];

    const { rows: configs } = await obtenerDb().query(
      `SELECT direccion, telefono, email, correo,
              codigo_actividad, desc_actividad, ambiente,
              (usuario_hacienda IS NOT NULL AND password_hacienda IS NOT NULL) AS tiene_credenciales_hacienda,
              (password_firma IS NOT NULL) AS password_firma_configurada
       FROM configuracion WHERE tenant_id = $1`,
      [tenantIdNorm]
    );
    const cfg = configs[0] || null;

    const { rows: establecimientos } = await obtenerDb().query(
      `SELECT id, branch_id, nombre, direccion, telefono, email, correo,
              cod_estable_mh, cod_punto_venta_mh, cod_estable, cod_punto_venta,
              tipo_establecimiento, departamento_cod, municipio_cod, distrito_cod,
              fiscal_status, provisioning_status, activo, creado_en
       FROM establecimientos
       WHERE tenant_id = $1
       ORDER BY creado_en ASC`,
      [tenantIdNorm]
    );

    return {
      tenant: {
        id: t.id,
        nombre: t.nombre,
        nombre_comercial: t.nombre_comercial || null,
        nit: t.nit,
        nrc: t.nrc || null,
        activo: !!t.activo,
        provisioning_status: t.provisioning_status,
        tiene_pos: !!t.tiene_pos,
      },
      configuracion: cfg ? {
        direccion: cfg.direccion || null,
        telefono: cfg.telefono || null,
        email: cfg.email || cfg.correo || null,
        codigo_actividad: cfg.codigo_actividad || null,
        desc_actividad: cfg.desc_actividad || null,
        ambiente: cfg.ambiente || null,
        tiene_credenciales_hacienda: !!cfg.tiene_credenciales_hacienda,
        password_firma_configurada: !!cfg.password_firma_configurada,
      } : null,
      establecimientos: establecimientos.map((e, i) => ({
        id: e.id,
        branch_id: e.branch_id || null,
        nombre: e.nombre,
        direccion: e.direccion || null,
        telefono: e.telefono || null,
        email: e.email || e.correo || null,
        es_principal: i === 0,
        activo: !!e.activo,
        cod_estable_mh: e.cod_estable_mh || null,
        cod_punto_venta_mh: e.cod_punto_venta_mh || null,
        cod_estable: e.cod_estable || null,
        cod_punto_venta: e.cod_punto_venta || null,
        tipo_establecimiento: e.tipo_establecimiento || null,
        departamento_cod: e.departamento_cod || null,
        municipio_cod: e.municipio_cod || null,
        distrito_cod: e.distrito_cod || null,
        fiscal_status: e.fiscal_status,
        provisioning_status: e.provisioning_status,
      })),
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
    habilitarPosTenant,
    reintentarSincronizacionPos,
    obtenerEmpresaTenant,
    obtenerEstadoFiscalTenant,
  };
};

// El módulo exporta la instancia por defecto (uso normal) y la factory
// (unit tests con dependencias inyectadas).
module.exports = crearServicioProvisioning();
module.exports.crearServicioProvisioning = crearServicioProvisioning;