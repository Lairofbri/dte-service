-- =============================================
-- Migración 008: Tabla clientes
-- Almacena datos de receptores para autocompletar en DTEEmitir
-- Campos basados en requerimientos oficiales de Hacienda por tipo de DTE
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: clientes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tipo de cliente determina qué campos son obligatorios
  -- natural  → DUI/Pasaporte, sin NIT/NRC/actividad obligatorios
  -- juridico → NIT obligatorio, NRC/actividad económica
  tipo_cliente VARCHAR(10) NOT NULL DEFAULT 'natural'
    CHECK (tipo_cliente IN ('natural', 'juridico')),

  -- ── Datos comunes ──
  nombre            VARCHAR(250) NOT NULL,
  nombre_comercial  VARCHAR(150),

  -- ── Identificación persona natural (FCF) ──
  -- CAT-022: 36=NIT, 13=DUI, 37=Otro, 03=Pasaporte, 02=Carnet Residente
  tipo_documento    VARCHAR(5),
  num_documento     VARCHAR(30),

  -- ── Identificación jurídica (CCF/FSE) ──
  -- NIT formato con guiones: 0000-000000-000-0
  nit               VARCHAR(20)
    CHECK (nit ~ '^\d{4}-\d{6}-\d{3}-\d{1}$' OR nit IS NULL),
  nrc               VARCHAR(15),

  -- ── Actividad económica (CCF/FSE) ──
  cod_actividad     VARCHAR(6),
  desc_actividad    TEXT,

  -- ── Dirección (CCF requerida) ──
  departamento_cod  VARCHAR(2),
  municipio_cod     VARCHAR(2)
    CHECK (municipio_cod ~ '^[0-9]{2}$' OR municipio_cod IS NULL),
  direccion         VARCHAR(250),

  -- ── Contacto ──
  telefono          VARCHAR(20),
  correo            VARCHAR(150)
    CHECK (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR correo IS NULL),

  -- ── Control ──
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ÍNDICES — búsqueda rápida por campos frecuentes
-- ─────────────────────────────────────────────

-- Búsqueda por nombre (parcial, case-insensitive)
CREATE INDEX IF NOT EXISTS idx_clientes_nombre
  ON clientes USING gin(nombre gin_trgm_ops);

-- Búsqueda por NIT exacto y parcial
CREATE INDEX IF NOT EXISTS idx_clientes_nit
  ON clientes(nit) WHERE nit IS NOT NULL;

-- Búsqueda por num_documento (DUI, pasaporte)
CREATE INDEX IF NOT EXISTS idx_clientes_num_documento
  ON clientes(num_documento) WHERE num_documento IS NOT NULL;

-- Búsqueda por nombre_comercial
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_comercial
  ON clientes USING gin(nombre_comercial gin_trgm_ops)
  WHERE nombre_comercial IS NOT NULL;

-- Solo clientes activos
CREATE INDEX IF NOT EXISTS idx_clientes_activo
  ON clientes(activo, tipo_cliente);

-- ─────────────────────────────────────────────
-- EXTENSIÓN TRIGRAM — necesaria para ILIKE eficiente
-- Si ya está instalada no falla
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────
-- TRIGGER: actualizar actualizado_en automáticamente
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_actualizado_en
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ─────────────────────────────────────────────
-- RELACIÓN OPCIONAL: dtes → cliente
-- Para saber qué cliente generó cada DTE
-- ─────────────────────────────────────────────
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS cliente_id UUID
    REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dtes_cliente_id
  ON dtes(cliente_id) WHERE cliente_id IS NOT NULL;
