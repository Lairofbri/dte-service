-- =============================================
-- Migración 007: Campos requeridos por Hacienda DTE
-- Actualiza tablas para cumplir con el JSON oficial de Hacienda
-- Basado en análisis de JSONs reales y documentación oficial MH
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: configuracion
-- Agregar campos faltantes del emisor para el JSON de Hacienda
-- ─────────────────────────────────────────────

-- descActividad es obligatorio en el JSON del emisor
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS desc_actividad TEXT;

-- correo en vez de email (nombre oficial de Hacienda)
-- Mantenemos email existente y agregamos correo como alias
-- El generador usará correo para el JSON
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS correo VARCHAR(150);

-- Copiar email existente a correo
UPDATE configuracion SET correo = email WHERE correo IS NULL;

-- ─────────────────────────────────────────────
-- TABLA: establecimientos
-- Los códigos MH pueden ser alfanuméricos (S010, P001, M001)
-- Ampliar de VARCHAR(4) a VARCHAR(10)
-- ─────────────────────────────────────────────

-- Ampliar columnas de código MH para soportar alfanuméricos
ALTER TABLE establecimientos
  ALTER COLUMN cod_estable_mh     TYPE VARCHAR(10),
  ALTER COLUMN cod_punto_venta_mh TYPE VARCHAR(10),
  ALTER COLUMN cod_estable        TYPE VARCHAR(10),
  ALTER COLUMN cod_punto_venta    TYPE VARCHAR(10);

-- Agregar tipo_establecimiento a establecimientos
-- Antes solo estaba en configuracion — ahora cada sucursal tiene el suyo
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS tipo_establecimiento VARCHAR(2) DEFAULT '02'
    CHECK (tipo_establecimiento IN ('01', '02', '04', '07'));

-- Agregar correo al establecimiento (puede ser null)
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS correo VARCHAR(150);

-- Copiar email existente a correo en establecimientos
UPDATE establecimientos SET correo = email WHERE correo IS NULL;

-- ─────────────────────────────────────────────
-- TABLA: correlativos
-- Ampliar columnas de código para soportar alfanuméricos
-- ─────────────────────────────────────────────
-- Los correlativos ya tienen establecimiento_id ✅
-- Solo necesitamos asegurarnos de que el número llega a 15 dígitos

-- ─────────────────────────────────────────────
-- TABLA: dtes
-- Agregar campos para almacenar datos adicionales del DTE
-- que necesitamos para reimpresión y consultas
-- ─────────────────────────────────────────────

-- Condición de operación: 1=Contado, 2=Crédito, 3=Otro
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS condicion_operacion SMALLINT DEFAULT 1
    CHECK (condicion_operacion IN (1, 2, 3));

-- Tipo de ítem dominante del DTE (para búsquedas)
-- 1=Bienes, 2=Servicios, 3=Ambos, 4=Otros
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS tipo_item SMALLINT DEFAULT 2
    CHECK (tipo_item IN (1, 2, 3, 4));

-- Datos adicionales del receptor para consultas sin parsear el JSON
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS receptor_tipo_documento VARCHAR(5),
  ADD COLUMN IF NOT EXISTS receptor_num_documento  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS receptor_correo         VARCHAR(150);

-- Montos adicionales para reportes
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS total_no_suj    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exenta    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_descuento NUMERIC(10,2) DEFAULT 0;

-- Método de pago principal (código de Hacienda)
-- 01=Efectivo, 02=Tarjeta débito, 03=Tarjeta crédito, etc.
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS codigo_pago VARCHAR(2) DEFAULT '01';

-- Ampliar numero_control — puede ser hasta 31 chars según formato Hacienda
-- DTE-03-S010P001-000000000079918 = 31 chars
-- Ya es VARCHAR(40) ✅ — suficiente

-- ─────────────────────────────────────────────
-- TABLA: dtes_items (NUEVA)
-- Almacena los ítems del DTE para consultas y reportes
-- sin necesidad de parsear el JSONB
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dtes_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dte_id          UUID NOT NULL REFERENCES dtes(id) ON DELETE CASCADE,
  num_item        SMALLINT NOT NULL,

  -- Tipo de ítem (CAT-010 Hacienda)
  -- 1=Bienes, 2=Servicios, 3=Ambos, 4=Otros
  tipo_item       SMALLINT NOT NULL DEFAULT 2
                  CHECK (tipo_item IN (1, 2, 3, 4)),

  -- Código interno del producto (puede ser null)
  codigo          VARCHAR(25),

  -- Descripción del producto o servicio
  descripcion     TEXT NOT NULL,

  -- Cantidad y precio
  cantidad        NUMERIC(14,4) NOT NULL CHECK (cantidad > 0),
  uni_medida      SMALLINT NOT NULL DEFAULT 59, -- 59=Unidad
  precio_uni      NUMERIC(10,4) NOT NULL CHECK (precio_uni > 0),
  monto_descu     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_descu >= 0),

  -- Desglose de ventas (como exige Hacienda)
  venta_no_suj    NUMERIC(10,2) NOT NULL DEFAULT 0,
  venta_exenta    NUMERIC(10,2) NOT NULL DEFAULT 0,
  venta_gravada   NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Tributos aplicados (JSON array, ej: ["20"])
  tributos        JSONB,

  -- Otros campos del JSON
  psv             NUMERIC(10,2) DEFAULT 0,
  no_gravado      NUMERIC(10,2) DEFAULT 0,
  iva_item        NUMERIC(10,2), -- Solo FCF

  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para obtener ítems por DTE
CREATE INDEX IF NOT EXISTS idx_dtes_items_dte
  ON dtes_items(dte_id, num_item);

-- ─────────────────────────────────────────────
-- TABLA: configuracion — CHECK de municipio flexible
-- El municipio ahora puede ser 2 dígitos incluyendo 00 para extranjeros
-- ─────────────────────────────────────────────
-- Relajar CHECK de municipio en establecimientos para permitir '00'
ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_municipio_cod_not_null;

ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_municipio_cod_check;

-- Nuevo constraint más flexible — acepta 00-99
ALTER TABLE establecimientos
  ADD CONSTRAINT establecimientos_municipio_cod_check
  CHECK (municipio_cod ~ '^[0-9]{2}$');

-- ─────────────────────────────────────────────
-- ÍNDICES ADICIONALES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dtes_condicion_operacion
  ON dtes(condicion_operacion);

CREATE INDEX IF NOT EXISTS idx_dtes_receptor_num_doc
  ON dtes(receptor_num_documento) WHERE receptor_num_documento IS NOT NULL;

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
