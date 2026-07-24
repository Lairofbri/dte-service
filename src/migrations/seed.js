// src/migrations/seed.js
// Seed de datos demo para reportes DTE
// Idempotente: no duplica datos existentes
// Genera: configuracion, establecimientos, usuarios, clientes, DTEs, contingencias, auditoria
// Uso: node src/migrations/seed.js
//
// ADVERTENCIA: Las migraciones SQL pueden insertar establecimientos con UUIDs
// generados por PostgreSQL (uuid_generate_v4). Este seed resuelve los IDs
// dinámicamente para no depender de UUIDs hardcodeados.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, verificarConexion } = require('../config/database');
const logger = require('../utils/logger');

const TENANT_ID = 'a0000000-0000-4000-8000-000000000001';
const EST_ID_PRINCIPAL_HARD = 'b0000000-0000-4000-8000-000000000001';
const EST_ID_CENTRO_HARD = 'b0000000-0000-4000-8000-000000000002';
const AMBIENTE = '00';

// IDs de establecimientos resueltos desde la BD (pueden diferir de los hardcodeados
// si las migraciones ya crearon establecimientos con UUID generados por PostgreSQL)
let estActualId = null;
let estCentroId = null;

if (process.env.NODE_ENV === 'production') {
  logger.error('Seed bloqueado en producción.');
  process.exit(1);
}

// ─────────────────────────────────────────────
// 1. Configuracion del emisor
// ─────────────────────────────────────────────
const sembrarConfiguracion = async () => {
  const { rows } = await query('SELECT id FROM configuracion WHERE tenant_id = $1', [TENANT_ID]);
  if (rows.length > 0) {
    logger.info('Configuracion ya existe, saltando.');
    return;
  }

  await query(
    `INSERT INTO configuracion (tenant_id, nit, nrc, nombre, nombre_comercial, direccion,
       telefono, email, codigo_actividad, codigo_establecimiento, codigo_punto_venta,
       tipo_establecimiento, usuario_hacienda, password_hacienda, ambiente, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)`,
    [TENANT_ID, '0000-000000-000-0', '00000', 'Restaurante Demo', 'Restaurante Demo',
     'Av. Principal 123, San Salvador', '2200-5000', 'demo@restaurante.com',
     '64101', 'M001', 'P001', '02', 'demo-user-hacienda', 'demo-pass-hacienda', AMBIENTE]
  );
  logger.info('Configuracion del emisor sembrada');
};

// ─────────────────────────────────────────────
// 2. Establecimientos
// Resuelve IDs dinámicamente: si las migraciones ya crearon establecimientos
// con códigos MH coincidentes (pero UUID diferente), usa los existentes.
// Si no existen, inserta con los hardcodeados.
// ─────────────────────────────────────────────
const sembrarEstablecimientos = async () => {
  const establecimientos = [
    { id: EST_ID_PRINCIPAL_HARD, cod_mh: 'M001', cod_pv: 'P001',
      nombre: 'Sucursal Principal', direccion: 'Av. Principal 123, San Salvador' },
    { id: EST_ID_CENTRO_HARD, cod_mh: 'M002', cod_pv: 'P001',
      nombre: 'Sucursal Centro', direccion: 'Av. Roosevelt 456, San Salvador' },
  ];

  for (const e of establecimientos) {
    const { rows } = await query(
      'SELECT id FROM establecimientos WHERE cod_estable_mh = $1 AND cod_punto_venta_mh = $2',
      [e.cod_mh, e.cod_pv]
    );
    if (rows.length > 0) {
      if (e.id === EST_ID_PRINCIPAL_HARD) estActualId = rows[0].id;
      else estCentroId = rows[0].id;
      await query(
        'UPDATE establecimientos SET tenant_id = $1 WHERE id = $2 AND tenant_id IS DISTINCT FROM $1',
        [TENANT_ID, rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO establecimientos (id, tenant_id, cod_estable_mh, cod_punto_venta_mh,
           cod_estable, cod_punto_venta, nombre, direccion, departamento_cod, municipio_cod, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
        [e.id, TENANT_ID, e.cod_mh, e.cod_pv, e.cod_mh, e.cod_pv, e.nombre, e.direccion, '06', '14']
      );
      if (e.id === EST_ID_PRINCIPAL_HARD) estActualId = e.id;
      else estCentroId = e.id;
    }
  }

  logger.info('Establecimientos sembrados', { estActualId, estCentroId });
};

// ─────────────────────────────────────────────
// 3. Correlativos para demo tenant
// ─────────────────────────────────────────────
const sembrarCorrelativos = async () => {
  const tipos = ['01', '03', '05', '06', '07'];
  for (const tipo of tipos) {
    for (const estId of [estActualId, estCentroId]) {
      await query(
        `INSERT INTO correlativos (tenant_id, establecimiento_id, tipo_dte, ambiente, ultimo_numero)
         VALUES ($1, $2, $3, $4, 0) ON CONFLICT DO NOTHING`,
        [TENANT_ID, estId, tipo, AMBIENTE]
      );
    }
  }
  logger.info('Correlativos sembrados');
};

// ─────────────────────────────────────────────
// 4. Usuarios demo
// ─────────────────────────────────────────────
const sembrarUsuarios = async () => {
  const SALT = 12;
  const hash = await bcrypt.hash('Admin123!', SALT);
  const usuarios = [
    { id: 'e0000000-0000-4000-8000-000000000001', nombre: 'Carlos', email: 'mesero1@demo.pos', rol: 'operador' },
    { id: 'e0000000-0000-4000-8000-000000000002', nombre: 'María', email: 'mesero2@demo.pos', rol: 'operador' },
    { id: 'e0000000-0000-4000-8000-000000000003', nombre: 'Pedro', email: 'cajero1@demo.pos', rol: 'operador' },
    { id: 'e0000000-0000-4000-8000-000000000004', nombre: 'Ana', email: 'cocina1@demo.pos', rol: 'operador' },
    { id: 'e0000000-0000-4000-8000-000000000005', nombre: 'Roberto', email: 'gerente@demo.pos', rol: 'operador' },
  ];

  // Verificar si ya existe el admin
  const { rows: admins } = await query(
    'SELECT id FROM usuarios WHERE tenant_id = $1 AND email = $2',
    [TENANT_ID, 'admin@demo.pos']
  );
  if (admins.length === 0) {
    await query(
      `INSERT INTO usuarios (id, tenant_id, establecimiento_id, nombre, email, password_hash, rol)
       VALUES ($1,$2,$3,$4,$5,$6,'administrador') ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), TENANT_ID, estActualId, 'Admin Demo', 'admin@demo.pos', hash]
    );
  }

  for (const u of usuarios) {
    await query(
      `INSERT INTO usuarios (id, tenant_id, establecimiento_id, nombre, email, password_hash, rol)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol`,
      [u.id, TENANT_ID, estActualId, u.nombre, u.email, hash, u.rol]
    );
  }
  logger.info('Usuarios DTE sembrados');
};

// ─────────────────────────────────────────────
// 5. Clientes demo
// ─────────────────────────────────────────────
const sembrarClientes = async () => {
  const clientes = [
    { id: 'f0000000-0000-4000-8000-000000000001', nombre: 'Juan', nit: '0000-000001-000-0', email: 'juan@email.com' },
    { id: 'f0000000-0000-4000-8000-000000000002', nombre: 'Elena', nit: '0000-000002-000-0', email: 'elena@email.com' },
    { id: 'f0000000-0000-4000-8000-000000000003', nombre: 'Luis', nit: '0000-000003-000-0', email: 'luis@email.com' },
    { id: 'f0000000-0000-4000-8000-000000000004', nombre: 'Sofía', nit: '0000-000004-000-0', email: 'sofia@email.com' },
    { id: 'f0000000-0000-4000-8000-000000000005', nombre: 'Andrés', nit: '0000-000005-000-0', email: 'andres@email.com' },
  ];

  // Migración 008_clientes.sql crea la tabla clientes
  // Verificar si la tabla existe
  try {
    const { rows: tablas } = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'clientes'"
    );
    if (tablas.length === 0) return;

    for (const c of clientes) {
      await query(
        `INSERT INTO clientes (id, tenant_id, nombre, nit, email)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [c.id, TENANT_ID, c.nombre, c.nit, c.email]
      );
    }
    logger.info('Clientes DTE sembrados');
  } catch {
    logger.info('Tabla clientes no disponible en DTE Service, saltando.');
  }
};

// ─────────────────────────────────────────────
// 6. Generar DTEs demo
// ─────────────────────────────────────────────
const sembrarDTEs = async () => {
  const { rows: existentes } = await query(
    'SELECT COUNT(*) as cnt FROM dtes WHERE tenant_id = $1 AND ambiente = $2',
    [TENANT_ID, AMBIENTE]
  );
  if (parseInt(existentes[0].cnt) > 5) {
    logger.info('Ya existen DTEs demo, saltando.', { count: existentes[0].cnt });
    return;
  }

  const hoy = new Date();
  let correlativo = 1000;
  const { rows: configs } = await query(
    'SELECT id, nit, nombre FROM configuracion WHERE tenant_id = $1 LIMIT 1',
    [TENANT_ID]
  );
  const config = configs[0] || { id: crypto.randomUUID(), nit: '0000-000000-000-0', nombre: 'Restaurante Demo' };

  const tipos = [
    { tipo: '01', peso: 45, label: 'FCF' },
    { tipo: '03', peso: 25, label: 'CCF' },
    { tipo: '05', peso: 10, label: 'FSE' },
    { tipo: '06', peso: 10, label: 'ND' },
    { tipo: '07', peso: 10, label: 'NC' },
  ];
  const elegirPonderado = (arr) => {
    const total = arr.reduce((s, x) => s + x.peso, 0);
    let r = Math.random() * total;
    for (const x of arr) {
      r -= x.peso;
      if (r <= 0) return x;
    }
    return arr[0];
  };
  const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const estados = ['aceptado', 'aceptado', 'aceptado', 'aceptado', 'aceptado',
    'rechazado', 'generado', 'generado', 'anulado', 'contingencia'];

  const receptorData = [
    { nit: '0000-000001-000-0', nombre: 'Juan Pérez' },
    { nit: '0000-000002-000-0', nombre: 'Elena Rodríguez' },
    { nit: '0000-000003-000-0', nombre: 'Luis Mendoza' },
    { nit: '0000-000004-000-0', nombre: 'Sofía Cruz' },
    { nit: '0000-000005-000-0', nombre: 'Andrés Vásquez' },
    { nit: '0000-000000-000-0', nombre: 'Consumidor Final' },
  ];

  const totalesGeneradores = [25.50, 48.00, 12.75, 95.30, 150.00, 35.60, 78.90, 210.50, 18.00, 62.40];

  for (let i = 0; i < 30; i++) {
    const tipo = elegirPonderado(tipos);
    const estado = elegir(estados);
    const receptor = elegir(receptorData);
    const estId = Math.random() < 0.65 ? estActualId : estCentroId;
    const total = elegir(totalesGeneradores);
    const gravado = +(total * 0.87).toFixed(2);
    const iva = +(total * 0.13).toFixed(2);
    const diasAtras = Math.floor(Math.random() * 30);
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - diasAtras);
    fecha.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);

    correlativo++;
    const codEst = estId === estActualId ? 'M001' : 'M002';
    const numControl = `DTE-${tipo.tipo}-${codEst}P001-${String(correlativo).padStart(14, '0')}`;
    const codGeneracion = crypto.randomUUID();
    const horaEmision = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}:00`;

    const jsonDte = {
      identificacion: {
        version: 1, ambiente: AMBIENTE, tipoDte: tipo.tipo,
        numeroControl: numControl, codigoGeneracion: codGeneracion,
        tipoModelo: 1, tipoOperacion: 1, feEmision: fecha.toISOString().split('T')[0],
        horEmision: horaEmision,
      },
      emisor: { nit: config.nit, nombre: config.nombre, codEstable: codEst, codPuntoVenta: 'P01' },
      receptor: { tipoDocumento: '13', numDocumento: receptor.nit, nombre: receptor.nombre },
      cuerpoDocumento: [{ numItem: 1, tipoItem: 1, cantidad: 1, precioUnitario: total }],
      resumen: { totalNoSujeto: 0, totalExento: 0, totalGravado: gravado, subTotal: total, ivaRetenido: 0, ivaPerciVido: 0, total, totalLetras: '' },
    };

    let sello = null;
    let errorHacienda = null;
    if (estado === 'aceptado') {
      sello = `SelloMH${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    } else if (estado === 'rechazado') {
      errorHacienda = { codigo: 'MH-${Math.floor(Math.random() * 5) + 1}', descripcion: 'Error en validación de datos del DTE' };
    }

    await query(
      `INSERT INTO dtes (id, tenant_id, establecimiento_id, tipo_dte, codigo_generacion, numero_control,
         ambiente, estado, sello_recepcion, receptor_nombre, receptor_nit,
         total_gravado, total_iva, total, json_dte, json_firmado, errores_hacienda,
         fecha_emision, hora_emision, creado_en, orden_referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT DO NOTHING`,
      [
        crypto.randomUUID(), TENANT_ID, estId, tipo.tipo, codGeneracion, numControl,
        AMBIENTE, estado, sello, receptor.nombre, receptor.nit,
        gravado, iva, total, JSON.stringify(jsonDte),
        estado === 'aceptado' ? `FirmadoDigitalmente${codGeneracion}`.slice(0, 50) : null,
        errorHacienda ? JSON.stringify(errorHacienda) : null,
        fecha, horaEmision, fecha,
        i < 20 ? String(10000 + i) : null,
      ]
    );
  }

  logger.info('DTEs demo sembrados', { total: 30 });
};

// ─────────────────────────────────────────────
// 7. Contingencias demo
// ─────────────────────────────────────────────
const sembrarContingencias = async () => {
  const { rows: existentes } = await query(
    'SELECT COUNT(*) as cnt FROM contingencias WHERE tenant_id = $1',
    [TENANT_ID]
  );
  if (parseInt(existentes[0].cnt) > 0) return;

  const hoy = new Date();
  const contingencias = [
    { tipo: '1', motivo: 'Sin conexión con Hacienda por mantenimiento programado', estado: 'procesada', diasAtras: 20 },
    { tipo: '2', motivo: 'Fallo en la red eléctrica del establecimiento', estado: 'notificada', diasAtras: 10 },
    { tipo: '1', motivo: 'Servicio de Hacienda no disponible', estado: 'activa', diasAtras: 2 },
  ];

  for (const c of contingencias) {
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - c.diasAtras);
    const fin = c.estado === 'activa' ? null : new Date(inicio);
    if (fin) fin.setHours(fin.getHours() + 3);

    await query(
      `INSERT INTO contingencias (id, tenant_id, tipo, motivo, fecha_inicio, fecha_fin, estado, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), TENANT_ID, c.tipo, c.motivo, inicio, fin, c.estado, inicio]
    );
  }

  logger.info('Contingencias sembradas');
};

// ─────────────────────────────────────────────
// 8. Auditoria demo
// ─────────────────────────────────────────────
const sembrarAuditoria = async () => {
  const { rows: existentes } = await query(
    'SELECT COUNT(*) as cnt FROM auditoria WHERE tenant_id = $1',
    [TENANT_ID]
  );
  if (parseInt(existentes[0].cnt) > 5) return;

  const { rows: dtes } = await query(
    'SELECT id, codigo_generacion FROM dtes WHERE tenant_id = $1 LIMIT 10',
    [TENANT_ID]
  );

  const eventos = [
    { evento: 'login', dte: null, status: 200, ip: '192.168.1.10' },
    { evento: 'login', dte: null, status: 401, ip: '10.0.0.50' },
    { evento: 'emision_dte', dte: 0, status: 201, ip: '192.168.1.10' },
    { evento: 'emision_dte', dte: 1, status: 201, ip: '192.168.1.10' },
    { evento: 'consulta_dte', dte: 0, status: 200, ip: '192.168.1.20' },
    { evento: 'anulacion_dte', dte: 2, status: 200, ip: '192.168.1.10' },
    { evento: 'consulta_hacienda', dte: 0, status: 200, ip: '172.16.0.1' },
    { evento: 'error_recepcion', dte: 0, status: 502, ip: '172.16.0.1' },
    { evento: 'contingencia_activa', dte: null, status: 200, ip: '192.168.1.10' },
    { evento: 'login', dte: null, status: 200, ip: '192.168.1.30' },
    { evento: 'emision_dte', dte: 1, status: 201, ip: '192.168.1.20' },
    { evento: 'consulta_dte', dte: 0, status: 200, ip: '192.168.1.5' },
    { evento: 'error_firmador', dte: null, status: 500, ip: '192.168.1.10' },
    { evento: 'refresh_token', dte: null, status: 200, ip: '192.168.1.10' },
    { evento: 'logout', dte: null, status: 200, ip: '192.168.1.10' },
  ];

  for (const ev of eventos) {
    const dteId = ev.dte !== null ? dtes[ev.dte]?.id || null : null;
    await query(
      `INSERT INTO auditoria (id, tenant_id, evento, dte_id, detalles, ip, status_http, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() - interval '${Math.floor(Math.random() * 28)} days') ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), TENANT_ID, ev.evento, dteId,
       JSON.stringify({ descripcion: `Evento: ${ev.evento}` }), ev.ip, ev.status]
    );
  }

  logger.info('Auditoria sembrada');
};

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
const ejecutarSeed = async () => {
  logger.info('Iniciando seed de datos DTE...');
  await verificarConexion();

  await sembrarConfiguracion();
  await sembrarEstablecimientos();
  await sembrarCorrelativos();
  await sembrarUsuarios();
  await sembrarClientes();
  await sembrarDTEs();
  await sembrarContingencias();
  await sembrarAuditoria();

  logger.info('Seed DTE completado exitosamente.');

  process.exit(0);
};

if (require.main === module) {
  ejecutarSeed().catch((err) => {
    logger.error('Error en seed DTE', { error: err.message });
    process.exit(1);
  });
}
