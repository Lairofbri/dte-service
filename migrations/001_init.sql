-- =============================================
-- Migración 001: Estructura inicial del DTE Service
-- Una instancia = un cliente = una BD
-- =============================================

-- Extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Función para actualizar timestamps
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- TABLA: configuracion
-- Datos del emisor y credenciales de Hacienda
-- Solo existe UNA fila en esta tabla
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Datos del emisor
  nit                     VARCHAR(20)  NOT NULL,
  nrc                     VARCHAR(20),
  nombre                  VARCHAR(200) NOT NULL,
  nombre_comercial        VARCHAR(200),
  direccion               VARCHAR(255) NOT NULL,
  telefono                VARCHAR(20),
  email                   VARCHAR(150),
  codigo_actividad        VARCHAR(10)  NOT NULL,
  codigo_establecimiento  VARCHAR(4)   DEFAULT '0001',
  codigo_punto_venta      VARCHAR(4)   DEFAULT '0001',
  tipo_establecimiento    VARCHAR(2)   DEFAULT '02',
  -- Credenciales Hacienda (encriptadas con AES-256)
  usuario_hacienda        TEXT         NOT NULL,
  password_hacienda       TEXT         NOT NULL,
  -- Ambiente: 00 = pruebas, 01 = producción
  ambiente                VARCHAR(2)   DEFAULT '00'
                          CHECK (ambiente IN ('00', '01')),
  -- Token de Hacienda cacheado (se renueva cada 24h en prod, 48h en pruebas)
  token_hacienda          TEXT,
  token_expira_en         TIMESTAMPTZ,
  -- Control
  activo                  BOOLEAN DEFAULT TRUE,
  creado_en               TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_configuracion_updated
  BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ─────────────────────────────────────────────
-- TABLA: correlativos
-- Control de numeración por tipo de DTE y ambiente
-- El correlativo es por tipo de DTE y nunca se repite
-- MEJORA FUTURA: agregar columna establecimiento_id
-- para soportar múltiples sucursales con correlativos independientes
-- Ver comentario en generador.utils.js → obtenerSiguienteCorrelativo
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS correlativos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_dte    VARCHAR(2)  NOT NULL,
  ambiente    VARCHAR(2)  NOT NULL CHECK (ambiente IN ('00', '01')),
  ultimo_numero INTEGER   NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  creado_en   TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  -- Un correlativo por tipo de DTE por ambiente
  UNIQUE(tipo_dte, ambiente)
);

CREATE TRIGGER trigger_correlativos_updated
  BEFORE UPDATE ON correlativos
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Correlativos iniciales para ambiente de pruebas
INSERT INTO correlativos (tipo_dte, ambiente) VALUES
  ('01', '00'),  -- Factura Consumidor Final (pruebas)
  ('03', '00'),  -- Comprobante Crédito Fiscal (pruebas)
  ('06', '00'),  -- Nota de Débito (pruebas)
  ('07', '00')   -- Nota de Crédito (pruebas)
ON CONFLICT DO NOTHING;

-- Correlativos iniciales para producción
INSERT INTO correlativos (tipo_dte, ambiente) VALUES
  ('01', '01'),
  ('03', '01'),
  ('06', '01'),
  ('07', '01')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- TABLA: dtes
-- Registro de todos los DTEs emitidos
-- Inmutable: nunca se eliminan registros
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dtes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Tipo de DTE: 01=FCF, 03=CCF, 06=Nota Débito, 07=Nota Crédito
  tipo_dte          VARCHAR(2)   NOT NULL
                    CHECK (tipo_dte IN ('01', '03', '06', '07')),
  -- Identificación única del DTE (UUID v4 generado por nosotros)
  codigo_generacion UUID         NOT NULL UNIQUE,
  -- Número de control: DTE-01-00000001-000000000000001
  numero_control    VARCHAR(40)  NOT NULL UNIQUE,
  -- Ambiente donde fue emitido
  ambiente          VARCHAR(2)   NOT NULL CHECK (ambiente IN ('00', '01')),
  -- Estado del DTE en el flujo de transmisión
  estado            VARCHAR(20)  NOT NULL DEFAULT 'generado'
                    CHECK (estado IN (
                      'generado',    -- JSON construido
                      'firmado',     -- Firmado por el firmador
                      'transmitido', -- Enviado a Hacienda
                      'aceptado',    -- Hacienda lo aceptó (tiene sello)
                      'rechazado',   -- Hacienda lo rechazó
                      'contingencia', -- Hacienda no respondió
                      'anulado'      -- Invalidado
                    )),
  -- Sello de recepción de Hacienda (solo si estado = aceptado)
  sello_recepcion   VARCHAR(100),
  -- Referencia al sistema del POS que originó este DTE
  -- No es FK porque este servicio es independiente
  orden_referencia  VARCHAR(100),
  -- Datos del receptor (para consultas rápidas)
  receptor_nombre   VARCHAR(250),
  receptor_nit      VARCHAR(20),
  receptor_nrc      VARCHAR(20),
  -- Montos
  total_gravado     NUMERIC(10,2) DEFAULT 0 CHECK (total_gravado >= 0),
  total_iva         NUMERIC(10,2) DEFAULT 0 CHECK (total_iva >= 0),
  total             NUMERIC(10,2) DEFAULT 0 CHECK (total >= 0),
  -- JSON completo del DTE (para auditoría y reimpresión)
  json_dte          JSONB        NOT NULL,
  -- JWT firmado (se guarda para reimpresión y consultas)
  json_firmado      TEXT,
  -- Errores de Hacienda si fue rechazado
  errores_hacienda  JSONB,
  -- Observaciones de Hacienda (pueden venir aunque sea aceptado)
  observaciones     JSONB,
  -- URL en S3/R2 donde está almacenado el JSON
  url_storage       VARCHAR(500),
  -- Fecha y hora de emisión
  fecha_emision     DATE         NOT NULL DEFAULT CURRENT_DATE,
  hora_emision      TIME         NOT NULL DEFAULT CURRENT_TIME,
  -- Control
  creado_en         TIMESTAMPTZ  DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TRIGGER trigger_dtes_updated
  BEFORE UPDATE ON dtes
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_dtes_codigo_generacion ON dtes(codigo_generacion);
CREATE INDEX IF NOT EXISTS idx_dtes_numero_control     ON dtes(numero_control);
CREATE INDEX IF NOT EXISTS idx_dtes_estado             ON dtes(estado);
CREATE INDEX IF NOT EXISTS idx_dtes_tipo_fecha         ON dtes(tipo_dte, fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_dtes_receptor_nit       ON dtes(receptor_nit) WHERE receptor_nit IS NOT NULL;

-- ─────────────────────────────────────────────
-- TABLA: contingencias
-- Registro de eventos de contingencia
-- Cuando Hacienda no responde se registra aquí
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contingencias (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Tipo de contingencia (según catálogo de Hacienda)
  tipo            VARCHAR(2) NOT NULL DEFAULT '1',
  motivo          VARCHAR(500) NOT NULL,
  -- Rango de tiempo de la contingencia
  fecha_inicio    TIMESTAMPTZ NOT NULL,
  fecha_fin       TIMESTAMPTZ,
  -- Estado del evento de contingencia
  estado          VARCHAR(20) NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa', 'notificada', 'procesada')),
  -- Sello de Hacienda al notificar
  sello_recepcion VARCHAR(100),
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_contingencias_updated
  BEFORE UPDATE ON contingencias
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ─────────────────────────────────────────────
-- TABLA: auditoria
-- Log inmutable de todas las operaciones críticas
-- NUNCA se eliminan registros de esta tabla
-- Solo INSERT — no UPDATE, no DELETE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Tipo de evento auditado
  evento      VARCHAR(50) NOT NULL,
  -- DTE relacionado (si aplica)
  dte_id      UUID REFERENCES dtes(id) ON DELETE RESTRICT,
  -- Detalles del evento en JSON
  detalles    JSONB,
  -- IP desde donde se originó la request
  ip          VARCHAR(45),
  -- HTTP status de la respuesta
  status_http INTEGER,
  -- Timestamp inmutable
  creado_en   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices de auditoría
CREATE INDEX IF NOT EXISTS idx_auditoria_evento   ON auditoria(evento);
CREATE INDEX IF NOT EXISTS idx_auditoria_dte      ON auditoria(dte_id) WHERE dte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha    ON auditoria(creado_en DESC);

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
