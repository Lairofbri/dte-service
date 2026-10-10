// tests/unit/provisioning.service.test.js
// Pruebas unitarias del servicio de provisión (Fase 2) con DB fake inyectada.
//
// Criterio de salida de Fase 1/2: reintentar la misma operación NO duplica
// tenants. Se verifica: idempotencia por operation_id y tenant_id, rotación
// de API Key solo si el POS no confirmó, aislamiento entre operaciones,
// estados de provisión y ausencia de secretos en respuestas/auditoría.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearServicioProvisioning } = require('../../src/modules/provisioning/provisioning.service');

const TENANT = 'a1000000-0000-4000-8000-000000000001';
const TENANT2 = 'a1000000-0000-4000-8000-000000000002';
const OP = 'b1000000-0000-4000-8000-000000000001';
const OP2 = 'b1000000-0000-4000-8000-000000000002';

// ─────────────────────────────────────────────
// DB fake con almacenamiento en memoria
// ─────────────────────────────────────────────
const crearDbFake = () => {
  const tenants = new Map();
  const establecimientos = new Map();
  const configuraciones = new Map();
  const usuarios = new Map();
  const correlativos = [];
  let siguienteId = 1;

  const query = async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();

    // ── 2026-10-10: transacción del bootstrap ──
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    // ── 2026-10-10: usuarios find-or-create del bootstrap ──
    if (sql.startsWith('INSERT INTO usuarios')) {
      const fila = {
        id: `usr-${siguienteId++}`,
        tenant_id: params[4],
        email: String(params[1]).toLowerCase(),
        nombre: params[0],
        password_hash: params[2],
        rol: 'administrador',
        establecimiento_id: params[3],
      };
      usuarios.set(`${fila.tenant_id}|${fila.email}`, fila);
      return { rows: [fila] };
    }
    if (sql.startsWith('UPDATE usuarios SET establecimiento_id')) {
      const objetivo = [...usuarios.values()].find((u) => u.id === params[1]);
      if (objetivo && objetivo.establecimiento_id == null) objetivo.establecimiento_id = params[0];
      return { rows: objetivo ? [objetivo] : [] };
    }

    // ── 2026-10-10: configuracion + correlativos del bootstrap ──
    if (sql.startsWith('INSERT INTO configuracion')) {
      const fila = {
        tenant_id: params[0],
        nit: params[1],
        nombre: params[3],
        nombre_comercial: params[4],
      };
      configuraciones.set(params[0], fila);
      return { rows: [{ id: `cfg-${siguienteId++}` }] };
    }
    if (sql.startsWith('INSERT INTO correlativos')) {
      correlativos.push({
        tenant_id: params[0],
        tipo_dte: params[1],
        ambiente: params[2],
        establecimiento_id: params[3],
      });
      return { rows: [] };
    }

    // Establecimiento del bootstrap (con códigos MH, sin branch_id).
    if (sql.startsWith('INSERT INTO establecimientos') && sql.includes('cod_estable_mh')) {
      const fila = {
        id: params[0],
        tenant_id: params[1],
        nombre: params[2],
        direccion: params[3],
        telefono: params[4],
        email: params[5],
        cod_estable_mh: params[6],
        cod_punto_venta_mh: params[7],
        tipo_establecimiento: params[8],
        departamento_cod: params[9],
        municipio_cod: params[10],
        fiscal_status: 'ready',
        provisioning_status: 'confirmed',
        activo: true,
      };
      establecimientos.set(`id:${params[0]}`, fila);
      return { rows: [fila] };
    }

    // ── 2026-10-07: usuarios (usuario inicial del tenant) ──
    if (sql.includes('FROM usuarios WHERE email = $1 AND tenant_id = $2')) {
      const fila = usuarios.get(`${params[1]}|${params[0]}`);
      return { rows: fila ? [fila] : [] };
    }

    // Buscar por provisioning_operation_id
    if (sql.includes('FROM tenants WHERE provisioning_operation_id')) {
      const encontrado = [...tenants.values()].find((t) => t.provisioning_operation_id === params[0]);
      return { rows: encontrado ? [encontrado] : [] };
    }

    // Buscar por id
    if (sql.includes('FROM tenants WHERE id = $1') || sql.includes('FROM tenants WHERE id = $1')) {
      const encontrado = tenants.get(params[0]);
      return { rows: encontrado ? [encontrado] : [] };
    }

    // Insertar tenant
    if (sql.startsWith('INSERT INTO tenants')) {
      const tenant = {
        id: params[0],
        nombre: params[1],
        nombre_comercial: params[2],
        nit: params[3],
        nrc: params[4],
        // Alta POS: params[5]=api_key_hash, params[6]=operation_id.
        // Alta plataforma (2026-10-10): api_key_hash NULL literal → 6 params.
        api_key_hash: params.length > 6 ? params[5] : null,
        provisioning_status: 'pending_fiscal_setup',
        provisioning_operation_id: params.length > 6 ? params[6] : params[5],
        activo: true,
        last_pos_sync_at: null,
        creado_en: new Date().toISOString(),
      };
      if (tenants.has(tenant.id)) {
        const err = new Error('duplicate key');
        err.code = '23505';
        err.constraint = 'tenants_pkey';
        throw err;
      }
      tenants.set(tenant.id, tenant);
      return { rows: [tenant] };
    }

    // Actualizar api_key_hash (rotación)
    if (sql.includes('SET api_key_hash')) {
      const tenant = tenants.get(params[1]);
      tenant.api_key_hash = params[0];
      return { rows: [tenant] };
    }

    // Actualizar estado / last_pos_sync_at
    if (sql.startsWith('UPDATE tenants SET provisioning_status')) {
      const tenant = tenants.get(params[1]);
      tenant.provisioning_status = params[0];
      tenant.last_pos_sync_at = new Date().toISOString();
      return { rows: [tenant] };
    }
    if (sql.startsWith('UPDATE tenants SET last_pos_sync_at')) {
      const tenant = tenants.get(params[0]);
      if (tenant) tenant.last_pos_sync_at = new Date().toISOString();
      return { rows: tenant ? [tenant] : [] };
    }

    if (sql.includes('FROM tenants WHERE provisioning_operation_id =')) {
      const encontrado = [...tenants.values()].find((t) => t.provisioning_operation_id === params[0]);
      return { rows: encontrado ? [encontrado] : [] };
    }

    // SELECT con LEFT JOIN eventos_provision (listarEstadoProvision)
    if (sql.includes('FROM tenants t')) {
      const lista = [...tenants.values()]
        .filter((t) => (sql.includes('WHERE t.id = $1') ? t.id === params[0] : true))
        .map((t) => ({
          ...t,
          tiene_api_key: !!(t.api_key_hash),
          eventos_pendientes: '0',
          eventos_fallidos: '0',
        }));
      return { rows: lista };
    }

    // SELECT id, provisioning_status... WHERE id = $1
    if (sql.startsWith('SELECT id, provisioning_status')) {
      const encontrado = tenants.get(params[0]);
      return { rows: encontrado ? [{ id: encontrado.id, provisioning_status: encontrado.provisioning_status, provisioning_operation_id: encontrado.provisioning_operation_id }] : [] };
    }

    // ── FASE 3: establecimientos (vincularSucursal) ──
    // SELECT id, branch_id, nombre, fiscal_status, provisioning_status
    //   FROM establecimientos WHERE tenant_id = $1 AND branch_id = $2
    if (sql.includes('FROM establecimientos WHERE tenant_id = $1 AND branch_id = $2')) {
      const clave = `${params[0]}|${params[1]}`;
      const encontrado = establecimientos.get(clave);
      return { rows: encontrado ? [encontrado] : [] };
    }

    // ── FASE 4: lista de establecimientos del tenant (estado fiscal) ──
    if (sql.includes('FROM establecimientos') && sql.includes('ORDER BY creado_en ASC')) {
      const lista = [...establecimientos.values()]
        .filter((e) => e.tenant_id === params[0])
        .map((e) => ({
          id: e.id,
          branch_id: e.branch_id,
          fiscal_status: e.fiscal_status,
          activo: e.activo,
        }));
      return { rows: lista };
    }

    // ── FASE 4: configuracion del tenant (estado fiscal) ──
    if (sql.includes('FROM configuracion') && sql.includes('WHERE tenant_id = $1')) {
      const config = configuraciones.get(params[0]);
      return { rows: config ? [config] : [] };
    }

    // INSERT INTO establecimientos (solicitud de vínculo de sucursal)
    if (sql.startsWith('INSERT INTO establecimientos') && !sql.includes('cod_estable_mh')) {
      const clave = `${params[0]}|${params[1]}`;
      if (establecimientos.has(clave)) {
        const err = new Error('duplicate key');
        err.code = '23505';
        err.constraint = 'uq_establecimientos_tenant_branch_id';
        throw err;
      }
      const fila = {
        id: `est-${siguienteId++}`,
        tenant_id: params[0],
        branch_id: params[1],
        nombre: params[2],
        direccion: params[3],
        telefono: params[4],
        tipo_establecimiento: '02',
        fiscal_status: 'pending_mh_data',
        provisioning_status: 'pending',
      };
      establecimientos.set(clave, fila);
      return { rows: [fila] };
    }

    throw new Error(`Query no contemplada en el fake: ${sql}`);
  };

  const obtener = (id) => tenants.get(id);
  const marcarConfirmado = (id) => {
    const t = tenants.get(id);
    if (t) t.last_pos_sync_at = new Date().toISOString();
  };
  const conteo = () => tenants.size;
  const idActual = () => `id-${siguienteId++}`;
  const conteoEstablecimientos = () => establecimientos.size;
  const obtenerEstablecimiento = (tenantId, branchId) => establecimientos.get(`${tenantId}|${branchId}`);
  const obtenerEstablecimientoPorId = (id) => establecimientos.get(`id:${id}`);
  const setConfiguracion = (tenantId, config) => configuraciones.set(tenantId, config);
  const contarConfiguraciones = () => configuraciones.size;
  const obtenerConfiguracion = (tenantId) => configuraciones.get(tenantId);
  const contarCorrelativos = () => correlativos.length;
  const guardarUsuario = (tenantId, email, fila) => usuarios.set(`${tenantId}|${email.toLowerCase()}`, fila);
  const obtenerUsuario = (tenantId, email) => usuarios.get(`${tenantId}|${String(email).toLowerCase()}`);
  const contarUsuarios = () => usuarios.size;

  // Cliente de transacción: delega al mismo query fake (BEGIN/COMMIT/ROLLBACK
  // son no-ops) — replica el shape de pg (query + release).
  const getClient = async () => ({
    query,
    release: () => {},
  });

  return {
    query,
    getClient,
    obtener,
    marcarConfirmado,
    conteo,
    idActual,
    conteoEstablecimientos,
    obtenerEstablecimiento,
    obtenerEstablecimientoPorId,
    setConfiguracion,
    contarConfiguraciones,
    obtenerConfiguracion,
    contarCorrelativos,
    guardarUsuario,
    obtenerUsuario,
    contarUsuarios,
  };
};

// Fake del módulo de usuarios (creación del administrador inicial del tenant).
// Reproduce la unicidad por (tenant_id, email) del servicio real.
const crearUsuariosFake = (db) => ({
  crearUsuario: async ({ tenant_id, datos }) => {
    if (!datos.password || String(datos.password).length < 8) {
      throw { status: 400, mensaje: 'El password es requerido.' };
    }
    const email = String(datos.email).toLowerCase();
    if (db.obtenerUsuario(tenant_id, email)) {
      throw { status: 409, mensaje: 'Ya existe un usuario con ese email en este tenant.' };
    }
    const fila = {
      id: `usr-${db.idActual()}`,
      tenant_id,
      email,
      nombre: datos.nombre,
      rol: datos.rol,
      establecimiento_id: datos.establecimiento_id || null,
    };
    db.guardarUsuario(tenant_id, email, fila);
    return fila;
  },
});

// Establecimiento fiscal inicial del bootstrap (2026-10-10): la empresa nace
// con una sucursal ready + correlativos + el admin asignado a ella.
const ESTABLECIMIENTO_INICIAL = {
  nombre: 'Casa Matriz',
  direccion: 'Av. Principal 123, San Salvador',
  departamento_cod: '06',
  municipio_cod: '01',
  cod_estable_mh: 'M001',
  cod_punto_venta_mh: 'P001',
  tipo_establecimiento: '02',
};

// Outbox fake con deduplicación por (operation_id, tipo_evento), igual que
// el ON CONFLICT de eventos_provision.
const crearOutboxFake = () => {
  const mapa = new Map();
  return {
    eventos: () => [...mapa.values()],
    publicarEvento: async (evento) => {
      const clave = `${evento.operation_id}|${evento.tipo_evento}`;
      if (!mapa.has(clave)) mapa.set(clave, evento);
    },
  };
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────
test('crearTenant crea el tenant en pending_fiscal_setup y devuelve la API Key una sola vez', async () => {
  const db = crearDbFake();
  const auditoria = [];
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async (entrada) => { auditoria.push(entrada); },
  });

  const resultado = await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  assert.equal(resultado.tenant.id, TENANT);
  assert.equal(resultado.tenant.provisioning_status, 'pending_fiscal_setup');
  assert.ok(resultado.api_key, 'debe devolver la API Key');
  assert.equal(resultado.api_key.length, 64);
  assert.equal(resultado.reentregada, false);
  assert.equal(db.conteo(), 1);
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].evento, 'PROVISION_TENANT_CREADO');
  assert.ok(!JSON.stringify(auditoria[0]).includes('api_key'), 'auditoría sin secretos');
});

test('reintentar la misma operación (operation_id) NO duplica el tenant y devuelve la misma instancia', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  const primero = await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  // Simular que el POS confirmó el almacenamiento de la clave.
  db.marcarConfirmado(TENANT);

  const segundo = await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  assert.equal(db.conteo(), 1, 'no debe duplicar el tenant');
  assert.equal(segundo.tenant.id, TENANT);
  assert.equal(segundo.api_key, null, 'la API Key no se reentrega si el POS confirmó');
  assert.equal(segundo.reentregada, false);
  assert.ok(primero.api_key !== segundo.api_key);
});

test('reintento sin confirmación del POS rota y reentrega la API Key (caso fallo POS)', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  // Sin db.marcarConfirmado — el POS nunca confirmó el almacenamiento.
  const reintento = await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  assert.equal(db.conteo(), 1);
  assert.equal(reintento.reentregada, true);
  assert.ok(reintento.api_key, 'se reentrega una clave nueva');
  assert.equal(reintento.api_key.length, 64);
  const hashAlmacenado = db.obtener(TENANT).api_key_hash;
  assert.ok(hashAlmacenado.startsWith('$2'), 'solo el hash bcrypt se persiste');
});

test('mismo tenant con otro operation_id → 409 (sin duplicar ni pisar)', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  await assert.rejects(
    servicio.crearTenant({
      datos: { tenant_id: TENANT, nombre: 'Otra Operación', nit: '0614-260967-101-5' },
      operationId: OP2,
    }),
    (err) => err.status === 409 && err.mensaje.includes('otra operación')
  );
  assert.equal(db.conteo(), 1);
});

test('crearTenant rechaza payload inválido (sin tenant_id o sin NIT)', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  await assert.rejects(
    servicio.crearTenant({ datos: { nombre: 'Sin ID' }, operationId: OP }),
    (err) => err.status === 400
  );
  await assert.rejects(
    servicio.crearTenant({ datos: { tenant_id: TENANT, nombre: 'Sin NIT' }, operationId: OP }),
    (err) => err.status === 400
  );
  await assert.rejects(
    servicio.crearTenant({ datos: { tenant_id: TENANT, nombre: 'X', nit: '0614-260967-101-5' }, operationId: OP }),
    (err) => err.status === 400
  );
});

test('actualizarEstado es idempotente y registra la transición', async () => {
  const db = crearDbFake();
  const auditoria = [];
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async (entrada) => { auditoria.push(entrada); },
  });

  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  const primero = await servicio.actualizarEstado({
    tenantId: TENANT,
    datos: { status: 'active' },
    operationId: OP,
  });
  assert.equal(primero.duplicado, false);
  assert.equal(primero.status, 'active');

  const repetido = await servicio.actualizarEstado({
    tenantId: TENANT,
    datos: { status: 'active' },
    operationId: OP,
  });
  assert.equal(repetido.duplicado, true, 'mismo estado = no-op idempotente');

  assert.equal(auditoria.filter((a) => a.evento === 'PROVISION_TENANT_ESTADO').length, 1);
});

test('actualizarEstado valida tenant, operation_id y estado permitido', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa Demo', nit: '0614-260967-101-5' },
    operationId: OP,
  });

  await assert.rejects(
    servicio.actualizarEstado({ tenantId: TENANT2, datos: { status: 'active' }, operationId: OP }),
    (err) => err.status === 404
  );
  await assert.rejects(
    servicio.actualizarEstado({ tenantId: TENANT, datos: { status: 'inexistente' }, operationId: OP }),
    (err) => err.status === 400
  );
  await assert.rejects(
    servicio.actualizarEstado({ tenantId: TENANT, datos: { status: 'active' }, operationId: OP2 }),
    (err) => err.status === 409
  );
  await assert.rejects(
    servicio.actualizarEstado({ tenantId: TENANT, datos: { status: 'active' } }),
    (err) => err.status === 400
  );
});

test('crearTenantDesdePlataforma (DTE) aplica el bootstrap completo: tenant + config + establecimiento + correlativos + admin asignado', async () => {
  const db = crearDbFake();
  const auditoria = [];
  const outbox = crearOutboxFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async (entrada) => { auditoria.push(entrada); },
    outbox,
  });

  const resultado = await servicio.crearTenantDesdePlataforma({
    datos: {
      tenant_id: TENANT2,
      nombre: 'Empresa Desde DTE',
      nit: '0614-260967-201-7',
      email_admin: 'admin@demo.sv',
      password: 'ClaveInicial123!',
      pin: '123456',
      nombre_usuario: 'Admin Demo',
      apellido: 'Inicial',
      crear_usuario_pos: true,
      establecimiento: ESTABLECIMIENTO_INICIAL,
    },
    operationId: OP2,
    usuario: { id: 'u1', rol: 'plataforma' },
  });

  assert.equal(resultado.tenant.provisioning_status, 'pending_fiscal_setup');
  assert.equal(resultado.api_key, null, 'el alta desde DTE no entrega API Key');
  assert.equal(db.obtener(TENANT2).api_key_hash, null, 'sin clave generada desde DTE');

  // Bootstrap completo: configuración, establecimiento ready y correlativos.
  assert.equal(db.contarConfiguraciones(), 1, 'configuracion del emisor creada');
  assert.equal(db.contarCorrelativos(), 22, 'correlativos: 11 tipos × 2 ambientes');
  assert.equal(db.conteoEstablecimientos(), 1, 'establecimiento fiscal inicial creado');

  // Admin con establecimiento ASIGNADO (nunca NULL → los mantenimientos operan).
  const adminDte = db.obtenerUsuario(TENANT2, 'admin@demo.sv');
  assert.ok(adminDte, 'el usuario administrador existe en el tenant DTE');
  assert.equal(adminDte.rol, 'administrador');
  assert.ok(adminDte.establecimiento_id, 'el admin queda asignado al establecimiento');
  assert.ok(db.obtenerEstablecimientoPorId(adminDte.establecimiento_id), 'el establecimiento asignado existe');
  assert.match(adminDte.password_hash, /^\$2[aby]\$\d{2}\$/, 'password_hash es bcrypt');
  assert.equal(db.contarUsuarios(), 1);

  // Dos eventos: TENANT_CREADO (proyección) + USUARIO_INICIAL (credenciales).
  const eventos = outbox.eventos();
  assert.equal(eventos.length, 2);
  const tenantEvento = eventos.find((e) => e.tipo_evento === 'TENANT_CREADO');
  const usuarioEvento = eventos.find((e) => e.tipo_evento === 'USUARIO_INICIAL');
  assert.ok(tenantEvento, 'evento TENANT_CREADO publicado');
  assert.ok(usuarioEvento, 'evento USUARIO_INICIAL publicado');
  assert.equal(usuarioEvento.tenant_id, TENANT2);
  assert.equal(usuarioEvento.payload.email, 'admin@demo.sv');
  assert.equal(usuarioEvento.payload.rol, 'administrador');
  assert.ok(!JSON.stringify(tenantEvento).includes('password'), 'TENANT_CREADO sin secretos');
  const textoUsuarioEvento = JSON.stringify(usuarioEvento);
  assert.ok(!textoUsuarioEvento.includes('ClaveInicial123!'), 'el password en claro NUNCA viaja al POS');
  assert.ok(!textoUsuarioEvento.includes('123456'), 'el PIN en claro NUNCA viaja al POS');
  assert.match(usuarioEvento.payload.password_hash, /^\$2[aby]\$\d{2}\$/, 'password_hash es bcrypt');
  assert.match(usuarioEvento.payload.pin_hash, /^\$2[aby]\$\d{2}\$/, 'pin_hash es bcrypt');

  assert.equal(auditoria.some((a) => a.evento === 'PROVISION_USUARIO_INICIAL'), true);
  assert.ok(!JSON.stringify(auditoria).includes('ClaveInicial123!'), 'auditoría sin secretos');
});

test('crearTenantDesdePlataforma es idempotente: el reintento NO duplica tenant, config, establecimiento, correlativos, usuario ni eventos', async () => {
  const db = crearDbFake();
  const outbox = crearOutboxFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    outbox,
  });

  const datos = {
    tenant_id: TENANT2,
    nombre: 'Empresa Desde DTE',
    nit: '0614-260967-201-7',
    email_admin: 'admin@demo.sv',
    password: 'ClaveInicial123!',
    pin: '123456',
    nombre_usuario: 'Admin Demo',
    crear_usuario_pos: true,
    establecimiento: ESTABLECIMIENTO_INICIAL,
  };

  const primero = await servicio.crearTenantDesdePlataforma({ datos, operationId: OP2, usuario: { id: 'u1', rol: 'plataforma' } });
  const repetido = await servicio.crearTenantDesdePlataforma({ datos, operationId: OP2, usuario: { id: 'u1', rol: 'plataforma' } });

  assert.equal(primero.tenant.id, repetido.tenant.id);
  assert.equal(db.conteo(), 1, 'no duplica el tenant');
  assert.equal(db.contarUsuarios(), 1, 'no duplica el usuario administrador');
  assert.equal(db.contarConfiguraciones(), 1, 'no duplica la configuración');
  assert.equal(db.conteoEstablecimientos(), 1, 'no duplica el establecimiento');
  assert.equal(db.contarCorrelativos(), 22, 'no duplica los correlativos');
  assert.equal(outbox.eventos().length, 2, 'no duplica los eventos de provisión');
});

test('crearTenantDesdePlataforma sin toggle POS: crea solo el admin DTE (sin PIN, sin USUARIO_INICIAL)', async () => {
  const db = crearDbFake();
  const outbox = crearOutboxFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    outbox,
  });

  const resultado = await servicio.crearTenantDesdePlataforma({
    datos: {
      tenant_id: TENANT2,
      nombre: 'Empresa Solo DTE',
      nit: '0614-260967-201-7',
      email_admin: 'admin@demo.sv',
      password: 'ClaveInicial123!',
      nombre_usuario: 'Admin Demo',
      establecimiento: ESTABLECIMIENTO_INICIAL,
      // Sin PIN ni crear_usuario_pos: la empresa no usará POS.
    },
    operationId: OP2,
    usuario: { id: 'u1', rol: 'plataforma' },
  });

  assert.equal(resultado.tenant.provisioning_status, 'pending_fiscal_setup');
  const admin = db.obtenerUsuario(TENANT2, 'admin@demo.sv');
  assert.ok(admin, 'el admin DTE se crea SIEMPRE');
  assert.ok(admin.establecimiento_id, 'el admin queda asignado aunque no haya POS');
  assert.equal(db.contarConfiguraciones(), 1, 'la configuración se crea aunque no haya POS');

  const eventos = outbox.eventos();
  assert.equal(eventos.length, 1, 'solo TENANT_CREADO — sin usuario POS');
  assert.equal(eventos[0].tipo_evento, 'TENANT_CREADO');
  assert.ok(!JSON.stringify(eventos).includes('hash'), 'sin hashes ni credenciales POS');
});

test('crearTenantDesdePlataforma rechaza payloads inválidos (credenciales, PIN y establecimiento faltante)', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    outbox: { publicarEvento: async () => {} },
  });

  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2, nombre: 'Empresa Desde DTE', nit: '0614-260967-201-7',
        establecimiento: ESTABLECIMIENTO_INICIAL,
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && err.mensaje.includes('email del administrador')
  );

  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2,
        nombre: 'Empresa Desde DTE',
        nit: '0614-260967-201-7',
        email_admin: 'admin@demo.sv',
        password: 'corta',
        pin: '123456',
        nombre_usuario: 'Admin Demo',
        establecimiento: ESTABLECIMIENTO_INICIAL,
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && /password/i.test(err.mensaje)
  );

  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2,
        nombre: 'Empresa Desde DTE',
        nit: '0614-260967-201-7',
        email_admin: 'admin@demo.sv',
        password: 'ClaveInicial123!',
        pin: '12',
        nombre_usuario: 'Admin Demo',
        crear_usuario_pos: true,
        establecimiento: ESTABLECIMIENTO_INICIAL,
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && /PIN/i.test(err.mensaje)
  );

  // Toggle POS activo sin PIN → 400 (el PIN es obligatorio cuando hay POS).
  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2,
        nombre: 'Empresa Desde DTE',
        nit: '0614-260967-201-7',
        email_admin: 'admin@demo.sv',
        password: 'ClaveInicial123!',
        nombre_usuario: 'Admin Demo',
        crear_usuario_pos: true,
        establecimiento: ESTABLECIMIENTO_INICIAL,
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && /PIN/i.test(err.mensaje)
  );

  // Sin establecimiento fiscal inicial → 400 (bootstrap incompleto).
  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2,
        nombre: 'Empresa Desde DTE',
        nit: '0614-260967-201-7',
        email_admin: 'admin@demo.sv',
        password: 'ClaveInicial123!',
        nombre_usuario: 'Admin Demo',
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && /establecimiento/i.test(err.mensaje)
  );

  // Códigos MH inválidos → 400.
  await assert.rejects(
    servicio.crearTenantDesdePlataforma({
      datos: {
        tenant_id: TENANT2,
        nombre: 'Empresa Desde DTE',
        nit: '0614-260967-201-7',
        email_admin: 'admin@demo.sv',
        password: 'ClaveInicial123!',
        nombre_usuario: 'Admin Demo',
        establecimiento: { ...ESTABLECIMIENTO_INICIAL, cod_estable_mh: 'ABC' },
      },
      operationId: OP2,
      usuario: { id: 'u1', rol: 'plataforma' },
    }),
    (err) => err.status === 400 && /cod_estable_mh/i.test(err.mensaje)
  );

  assert.equal(db.conteo(), 0, 'ningún tenant creado con payload inválido');
  assert.equal(db.contarUsuarios(), 0);
  assert.equal(db.contarConfiguraciones(), 0, 'nada del bootstrap se persiste si falla la validación');
});

test('listarEstadoProvision separa alcance plataforma vs administrador', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa A', nit: '0614-260967-101-5' },
    operationId: OP,
  });
  await servicio.crearTenant({
    datos: { tenant_id: TENANT2, nombre: 'Empresa B', nit: '0614-260967-201-7' },
    operationId: OP2,
  });

  const todos = await servicio.listarEstadoProvision({ tenant_id: TENANT, esPlataforma: true });
  assert.equal(todos.length, 2);

  const uno = await servicio.listarEstadoProvision({ tenant_id: TENANT, esPlataforma: false });
  assert.equal(uno.length, 1);
  assert.equal(uno[0].id, TENANT);
});

// ═════════════════════════════════════════════
// FASE 3 — vincularSucursal (vínculo de sucursales)
// ═════════════════════════════════════════════

const BRANCH = 'b2000000-0000-4000-8000-000000000001';
const BRANCH2 = 'b2000000-0000-4000-8000-000000000002';
const OP_BRANCH = 'c2000000-0000-4000-8000-000000000001';

const prepararTenant = async (servicio, id = TENANT, operationId = OP, nit = '0614-260967-101-5') => {
  await servicio.crearTenant({
    datos: { tenant_id: id, nombre: 'Empresa Demo', nit },
    operationId,
  });
};

test('vincularSucursal crea el establecimiento en pending_mh_data SIN inventar códigos MH', async () => {
  const db = crearDbFake();
  const auditoria = [];
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async (entrada) => { auditoria.push(entrada); },
  });
  await prepararTenant(servicio);

  const resultado = await servicio.vincularSucursal({
    tenantId: TENANT,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte', direccion: 'Av. Norte 123' },
    operationId: OP_BRANCH,
  });

  assert.equal(resultado.duplicado, false);
  assert.equal(resultado.establecimiento.branch_id, BRANCH);
  assert.equal(resultado.establecimiento.fiscal_status, 'pending_mh_data');
  assert.equal(resultado.establecimiento.provisioning_status, 'pending');
  assert.equal(db.conteoEstablecimientos(), 1);

  const guardado = db.obtenerEstablecimiento(TENANT, BRANCH);
  assert.equal(guardado.cod_estable_mh, undefined, 'no se inventan códigos MH');
  assert.equal(guardado.tipo_establecimiento, '02');

  assert.equal(auditoria.some((a) => a.evento === 'PROVISION_BRANCH_SOLICITADO'), true);
  assert.ok(!JSON.stringify(auditoria).includes('password'), 'auditoría sin secretos');
});

test('vincularSucursal es idempotente: reintentar el mismo branch_id NO duplica el establecimiento', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });
  await prepararTenant(servicio);

  const primero = await servicio.vincularSucursal({
    tenantId: TENANT,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
    operationId: OP_BRANCH,
  });

  const segundo = await servicio.vincularSucursal({
    tenantId: TENANT,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
    operationId: OP_BRANCH,
  });

  assert.equal(db.conteoEstablecimientos(), 1, 'no debe duplicar el establecimiento');
  assert.equal(segundo.duplicado, true);
  assert.equal(segundo.establecimiento.establecimiento_id, primero.establecimiento.establecimiento_id);
});

test('vincularSucursal valida tenant: inexistente → 404, inactivo → 409', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });
  await prepararTenant(servicio);
  db.obtener(TENANT).activo = false;

  await assert.rejects(
    servicio.vincularSucursal({
      tenantId: TENANT2,
      datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
      operationId: OP_BRANCH,
    }),
    (err) => err.status === 404
  );

  await assert.rejects(
    servicio.vincularSucursal({
      tenantId: TENANT,
      datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
      operationId: OP_BRANCH,
    }),
    (err) => err.status === 409 && err.mensaje.includes('inactivo')
  );
  assert.equal(db.conteoEstablecimientos(), 0);
});

test('vincularSucursal rechaza payload inválido y exige operation_id', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });
  await prepararTenant(servicio);

  await assert.rejects(
    servicio.vincularSucursal({ tenantId: TENANT, datos: { nombre: 'Sin branch' }, operationId: OP_BRANCH }),
    (err) => err.status === 400
  );
  await assert.rejects(
    servicio.vincularSucursal({ tenantId: TENANT, datos: { branch_id: BRANCH, nombre: 'X' }, operationId: OP_BRANCH }),
    (err) => err.status === 400
  );
  await assert.rejects(
    servicio.vincularSucursal({ tenantId: TENANT, datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' } }),
    (err) => err.status === 400 && err.mensaje.includes('operation_id')
  );
  assert.equal(db.conteoEstablecimientos(), 0);
});

test('vincularSucursal aísla por tenant: el mismo branch_id en otro tenant crea otro establecimiento', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });
  await prepararTenant(servicio, TENANT, OP, '0614-260967-101-5');
  await prepararTenant(servicio, TENANT2, OP2, '0614-260967-201-7');

  const a = await servicio.vincularSucursal({
    tenantId: TENANT,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
    operationId: OP_BRANCH,
  });
  const b = await servicio.vincularSucursal({
    tenantId: TENANT2,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte 2' },
    operationId: OP_BRANCH,
  });

  assert.equal(db.conteoEstablecimientos(), 2, 'mismo branch_id permitido en tenants distintos');
  assert.notEqual(a.establecimiento.establecimiento_id, b.establecimiento.establecimiento_id);
  assert.equal(db.obtenerEstablecimiento(TENANT2, BRANCH).tenant_id, TENANT2);
});

// ═════════════════════════════════════════════
// FASE 4 — estado fiscal consultable por el POS
// (spec §12 Emisión: POS puede consultar estado fiscal, nunca secretos)
// ═════════════════════════════════════════════

const estadoFirmaFake = (sobreescribe = {}) => async ({ tenant_id }) => ({
  tenant_id,
  nit: null,
  estado: 'listo',
  firmador_disponible: true,
  credencial_firma_disponible: true,
  ...sobreescribe,
});

const prepararConfigFiscal = (db) => {
  db.setConfiguracion(TENANT, {
    tiene_credenciales: true,
    tiene_token: true,
    token_expira_en: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
};

test('obtenerEstadoFiscalTenant devuelve estado fiscal SIN secretos', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    estadoFirma: estadoFirmaFake(),
  });
  await prepararTenant(servicio);
  prepararConfigFiscal(db);

  const vinculado = await servicio.vincularSucursal({
    tenantId: TENANT,
    datos: { branch_id: BRANCH, nombre: 'Sucursal Norte' },
    operationId: OP_BRANCH,
  });

  const estado = await servicio.obtenerEstadoFiscalTenant({ tenantId: TENANT });

  assert.equal(estado.tenant_id, TENANT);
  assert.equal(estado.provisioning_status, 'pending_fiscal_setup');
  assert.equal(estado.credenciales_hacienda, true);
  assert.equal(estado.token_vigente, true);
  assert.equal(estado.firma.estado, 'listo');
  assert.equal(estado.firma.firmador_disponible, true);
  assert.equal(estado.firma.credencial_firma_disponible, true);
  assert.equal(estado.establecimientos.length, 1);
  assert.equal(estado.establecimientos[0].establecimiento_id, vinculado.establecimiento.establecimiento_id);
  assert.equal(estado.establecimientos[0].fiscal_status, 'pending_mh_data');
  assert.ok(!JSON.stringify(estado).includes('password'), 'el estado fiscal nunca expone secretos');
  assert.ok(!JSON.stringify(estado).includes('token_hacienda'), 'el estado fiscal nunca expone el token');
});

test('obtenerEstadoFiscalTenant: tenant inexistente → 404', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    estadoFirma: estadoFirmaFake(),
  });

  await assert.rejects(
    servicio.obtenerEstadoFiscalTenant({ tenantId: TENANT }),
    (err) => err.status === 404
  );
});

test('obtenerEstadoFiscalTenant: sin configuración → credenciales_hacienda false y token_vigente false', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    estadoFirma: estadoFirmaFake(),
  });
  await prepararTenant(servicio);

  const estado = await servicio.obtenerEstadoFiscalTenant({ tenantId: TENANT });

  assert.equal(estado.credenciales_hacienda, false);
  assert.equal(estado.token_vigente, false);
  assert.equal(estado.establecimientos.length, 0);
});

test('obtenerEstadoFiscalTenant: token expirado → token_vigente false', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    estadoFirma: estadoFirmaFake(),
  });
  await prepararTenant(servicio);
  db.setConfiguracion(TENANT, {
    tiene_credenciales: true,
    tiene_token: true,
    token_expira_en: new Date(Date.now() - 60 * 1000).toISOString(),
  });

  const estado = await servicio.obtenerEstadoFiscalTenant({ tenantId: TENANT });

  assert.equal(estado.credenciales_hacienda, true);
  assert.equal(estado.token_vigente, false);
});

test('obtenerEstadoFiscalTenant refleja el estado de firma real por tenant', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({
    db,
    auditoria: async () => {},
    estadoFirma: estadoFirmaFake({ estado: 'firmador_offline', firmador_disponible: false }),
  });
  await prepararTenant(servicio);

  const estado = await servicio.obtenerEstadoFiscalTenant({ tenantId: TENANT });

  assert.equal(estado.firma.estado, 'firmador_offline');
  assert.equal(estado.firma.firmador_disponible, false);
});

test('listarEstadoProvision separa la API Key técnica (bool) de las credenciales oficiales', async () => {
  const db = crearDbFake();
  const servicio = crearServicioProvisioning({ db, auditoria: async () => {} });

  // Origen POS: genera API Key técnica → api_key_hash presente.
  await servicio.crearTenant({
    datos: { tenant_id: TENANT, nombre: 'Empresa A', nit: '0614-260967-101-5' },
    operationId: OP,
  });
  // Origen DTE: sin API Key hasta la activación (Fase 4).
  await servicio.crearTenant({
    datos: { tenant_id: TENANT2, nombre: 'Empresa B', nit: '0614-260967-201-7' },
    operationId: OP2,
    generarClave: false,
  });

  const todos = await servicio.listarEstadoProvision({ tenant_id: TENANT, esPlataforma: true });
  const porId = (id) => todos.find((t) => t.id === id);

  assert.equal(porId(TENANT).tiene_api_key, true, 'tenant POS tiene API Key técnica');
  assert.equal(porId(TENANT2).tiene_api_key, false, 'tenant DTE aún sin API Key');
  assert.ok(!JSON.stringify(todos).includes('api_key_hash'), 'el estado nunca expone el hash ni la clave');
});