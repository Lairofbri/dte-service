// tests/unit/tenant-activacion.test.js
// Pruebas de la activación automática del tenant (Fase C2, 2026-10-13).
//
// Entregable verificado:
// - Matriz de la transición: solo `pending_fiscal_setup` + configuración
//   completa (credenciales Hacienda + contraseña de firma) → `active`.
// - El hook se dispara al guardar credenciales y contraseña de firma, y
//   nunca pisa `blocked`/`failed` ni hace downgrade.
// - La auditoría (PROVISION_TENANT_ACTIVADO) se registra solo cuando la
//   transición se aplica.

// Fallbacks de entorno: garantizan el require en CI sin .env (no conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath  = require.resolve('../../src/config/database');
const catalogosPath = require.resolve('../../src/modules/catalogos/catalogos.service');
const auditoriaPath = require.resolve('../../src/utils/auditoria');
const servicePath   = require.resolve('../../src/modules/configuracion/configuracion.service');

// Configura los mocks y recarga el service (captura los mocks vigentes).
// La auditoría también se recarga: su require de la BD captura el mock al
// cargarse (destructuring en load time).
const cargarService = ({ queryMock }) => {
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: {
      query: queryMock || (async () => ({ rows: [] })),
      getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    },
  };
  require.cache[catalogosPath] = {
    id: catalogosPath,
    filename: catalogosPath,
    loaded: true,
    exports: { obtenerActividadEconomica: async () => null },
  };
  delete require.cache[auditoriaPath];
  delete require.cache[servicePath];
  return require(servicePath);
};

const CONFIG_COMPLETA = {
  usuario_hacienda:  'enc:v2:usuario',
  password_hacienda: 'enc:v2:password',
  password_firma:    'enc:v2:firma',
};

// Mock del sync de activación: responde por forma del SQL (nunca por orden).
const mockActivacion = ({ llamadas, estado = 'pending_fiscal_setup', config = CONFIG_COMPLETA, aplicado = true } = {}) =>
  async (text, params) => {
    if (llamadas) llamadas.push({ text, params });
    if (text.includes('FROM tenants t')) {
      return { rows: [{ provisioning_status: estado, ...config }] };
    }
    if (text.startsWith('UPDATE tenants')) {
      return { rows: aplicado ? [{ id: 't1' }] : [] };
    }
    return { rows: [] };
  };

// Fila mínima de configuración para los flujos de guardado.
const filaConfiguracion = () => ({
  id: '1', nit: '06142609671015', nrc: null,
  nombre: 'Empresa Demo', nombre_comercial: null,
  direccion: 'Av. Principal 1', telefono: null, email: null, correo: null,
  codigo_actividad: '56101', codigo_establecimiento: '0001',
  codigo_punto_venta: '0001', tipo_establecimiento: '02',
  departamento_cod: '06', municipio_cod: '14', desc_actividad: 'Restaurantes',
  ambiente: '00', usuario_hacienda: 'enc:v2:u', password_hacienda: 'enc:v2:p',
  token_hacienda: null, token_expira_en: null,
  activo: true, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
});

// ─── Matriz de la transición (helper puro) ───

test('matriz: solo pending_fiscal_setup + configuración completa → active', () => {
  const { determinarTransicionPorConfiguracion } = cargarService({});

  assert.equal(
    determinarTransicionPorConfiguracion({ provisioning_status: 'pending_fiscal_setup', configuracion: CONFIG_COMPLETA }),
    'active'
  );

  // Configuración incompleta → sin cambio
  assert.equal(
    determinarTransicionPorConfiguracion({ provisioning_status: 'pending_fiscal_setup', configuracion: { ...CONFIG_COMPLETA, password_firma: null } }),
    null
  );
  assert.equal(
    determinarTransicionPorConfiguracion({ provisioning_status: 'pending_fiscal_setup', configuracion: { ...CONFIG_COMPLETA, usuario_hacienda: null } }),
    null
  );
  assert.equal(
    determinarTransicionPorConfiguracion({ provisioning_status: 'pending_fiscal_setup', configuracion: null }),
    null
  );

  // Estados que nunca se pisan ni sufren downgrade
  for (const estadoActual of ['active', 'blocked', 'failed']) {
    assert.equal(
      determinarTransicionPorConfiguracion({ provisioning_status: estadoActual, configuracion: CONFIG_COMPLETA }),
      null,
      `${estadoActual} no cambia`
    );
  }
});

// ─── Sincronización (DB) ───

test('sincronizar: completo + pending → UPDATE a active + auditoría', async () => {
  const llamadas = [];
  const { sincronizarProvisioningActivo } = cargarService({ queryMock: mockActivacion({ llamadas }) });

  const estado = await sincronizarProvisioningActivo({ tenant_id: 't1', origen: 'configuracion_credenciales' });

  assert.equal(estado, 'active');
  const update = llamadas.find((l) => l.text.startsWith('UPDATE tenants'));
  assert.ok(update, 'emite UPDATE tenants');
  assert.deepEqual(update.params, ['active', 't1']);

  const auditoria = llamadas.find((l) => l.text.startsWith('INSERT INTO auditoria'));
  assert.ok(auditoria, 'registra la auditoría');
  assert.equal(auditoria.params[1], 'PROVISION_TENANT_ACTIVADO');
});

test('sincronizar: configuración incompleta → sin UPDATE ni auditoría', async () => {
  const llamadas = [];
  const { sincronizarProvisioningActivo } = cargarService({
    queryMock: mockActivacion({ llamadas, config: { ...CONFIG_COMPLETA, password_firma: null } }),
  });

  const estado = await sincronizarProvisioningActivo({ tenant_id: 't1', origen: 'configuracion_password_firma' });

  assert.equal(estado, null);
  assert.equal(llamadas.some((l) => l.text.startsWith('UPDATE tenants')), false);
  assert.equal(llamadas.some((l) => l.text.startsWith('INSERT INTO auditoria')), false);
});

test('sincronizar: blocked/failed/active no se pisan (sin UPDATE)', async () => {
  for (const estadoActual of ['blocked', 'failed', 'active']) {
    const llamadas = [];
    const { sincronizarProvisioningActivo } = cargarService({
      queryMock: mockActivacion({ llamadas, estado: estadoActual }),
    });

    const estado = await sincronizarProvisioningActivo({ tenant_id: 't1', origen: 'configuracion_credenciales' });

    assert.equal(estado, null, `${estadoActual}: sin transición`);
    assert.equal(llamadas.some((l) => l.text.startsWith('UPDATE tenants')), false, `${estadoActual}: sin UPDATE`);
  }
});

test('sincronizar: carrera (UPDATE no aplica) → sin auditoría', async () => {
  const llamadas = [];
  const { sincronizarProvisioningActivo } = cargarService({
    queryMock: mockActivacion({ llamadas, aplicado: false }),
  });

  const estado = await sincronizarProvisioningActivo({ tenant_id: 't1', origen: 'configuracion_credenciales' });

  assert.equal(estado, null);
  assert.equal(llamadas.some((l) => l.text.startsWith('INSERT INTO auditoria')), false);
});

// ─── Hooks del guardado ───

test('hook guardarPasswordFirma: activa el tenant cuando la configuración queda completa', async () => {
  const llamadas = [];
  const queryMock = async (text, params) => {
    llamadas.push({ text, params });
    if (text.includes('FROM tenants t')) return { rows: [{ provisioning_status: 'pending_fiscal_setup', ...CONFIG_COMPLETA }] };
    if (text.startsWith('UPDATE tenants')) return { rows: [{ id: 't1' }] };
    return { rows: [{ id: '1' }] };
  };
  const { guardarPasswordFirma } = cargarService({ queryMock });

  const resultado = await guardarPasswordFirma({ password_firma: 'firma-demo', tenant_id: 't1' });

  assert.equal(resultado.password_firma_configurada, true);
  assert.equal(
    llamadas.some((l) => l.text.startsWith('UPDATE tenants') && l.params[0] === 'active'),
    true,
    'el tenant pasa a active'
  );
});

test('hook guardarPasswordFirma: limpiar la firma no evalúa la activación', async () => {
  const llamadas = [];
  const queryMock = async (text, params) => {
    llamadas.push({ text, params });
    return { rows: [{ id: '1' }] };
  };
  const { guardarPasswordFirma } = cargarService({ queryMock });

  const resultado = await guardarPasswordFirma({ password_firma: '', tenant_id: 't1' });

  assert.equal(resultado.password_firma_configurada, false);
  assert.equal(llamadas.some((l) => l.text.includes('FROM tenants t')), false);
});

test('hook actualizarConfiguracion: guardar credenciales evalúa la activación', async () => {
  const llamadas = [];
  const queryMock = async (text, params) => {
    llamadas.push({ text, params });
    if (text.includes('FROM tenants t')) return { rows: [{ provisioning_status: 'pending_fiscal_setup', ...CONFIG_COMPLETA }] };
    if (text.startsWith('UPDATE tenants')) return { rows: [{ id: 't1' }] };
    if (text.startsWith('SELECT')) return { rows: [filaConfiguracion()] };
    return { rows: [filaConfiguracion()] };
  };
  const { actualizarConfiguracion } = cargarService({ queryMock });

  await actualizarConfiguracion({ datos: { password_hacienda: 'nueva-pass' }, tenant_id: 't1' });

  assert.equal(
    llamadas.some((l) => l.text.startsWith('UPDATE tenants') && l.params[0] === 'active'),
    true,
    'el tenant pasa a active'
  );
});

test('hook actualizarConfiguracion: sin credenciales no evalúa la activación', async () => {
  const llamadas = [];
  const queryMock = async (text, params) => {
    llamadas.push({ text, params });
    if (text.startsWith('SELECT') && text.includes('FROM configuracion')) return { rows: [filaConfiguracion()] };
    return { rows: [filaConfiguracion()] };
  };
  const { actualizarConfiguracion } = cargarService({ queryMock });

  await actualizarConfiguracion({ datos: { telefono: '2200-5000' }, tenant_id: 't1' });

  assert.equal(llamadas.some((l) => l.text.includes('FROM tenants t')), false);
});
