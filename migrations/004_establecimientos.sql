-- =============================================
-- Migración 004: Establecimientos (Sucursales)
-- Agrega soporte multi-sucursal al DTE Service
-- =============================================
-- IMPORTANTE: Esta migración modifica tablas existentes
-- Ejecutar en orden — no saltarse pasos
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: establecimientos
-- Cada sucursal de la empresa con su código de Hacienda
-- Los códigos los asigna Hacienda durante el acreditamiento
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS establecimientos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Código asignado por Hacienda — viene del documento de acreditamiento
  -- NO puede cambiar si ya tiene DTEs emitidos
  cod_estable_mh      VARCHAR(4)   NOT NULL,
  cod_punto_venta_mh  VARCHAR(4)   NOT NULL,

  -- Códigos internos del contribuyente
  -- Por defecto iguales a los de Hacienda
  cod_estable         VARCHAR(4)   NOT NULL,
  cod_punto_venta     VARCHAR(4)   NOT NULL,

  -- Datos descriptivos de la sucursal
  nombre              VARCHAR(150) NOT NULL,
  direccion           VARCHAR(255) NOT NULL,
  departamento_cod    VARCHAR(2)   NOT NULL
                      CHECK (departamento_cod ~ '^(0[1-9]|1[0-4])$'),
  municipio_cod       VARCHAR(2)   NOT NULL
                      CHECK (municipio_cod ~ '^(0[1-9]|[1-9][0-9])$'),
  telefono            VARCHAR(20),
  email               VARCHAR(150),

  -- Control
  -- Soft delete — nunca eliminar porque los DTEs los referencian
  activo              BOOLEAN DEFAULT TRUE,
  creado_en           TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ DEFAULT NOW(),

  -- cod_estable_mh único — Hacienda no permite duplicados por empresa
  UNIQUE(cod_estable_mh),
  -- UNIQUE compuesto para FK tenant-safe en otras tablas
  UNIQUE(id, cod_estable_mh)
);

CREATE TRIGGER trigger_establecimientos_updated
  BEFORE UPDATE ON establecimientos
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Índices
CREATE INDEX IF NOT EXISTS idx_establecimientos_activo
  ON establecimientos(activo);

-- ─────────────────────────────────────────────
-- DATOS INICIALES: establecimiento por defecto
-- Se crea con los datos de configuracion existente
-- Los correlativos actuales se asignarán a este establecimiento
-- ─────────────────────────────────────────────
INSERT INTO establecimientos (
  cod_estable_mh, cod_punto_venta_mh,
  cod_estable, cod_punto_venta,
  nombre, direccion,
  departamento_cod, municipio_cod
)
SELECT
  COALESCE(codigo_establecimiento, '0001'),
  COALESCE(codigo_punto_venta, '0001'),
  COALESCE(codigo_establecimiento, '0001'),
  COALESCE(codigo_punto_venta, '0001'),
  COALESCE(nombre_comercial, nombre, 'Establecimiento Principal'),
  COALESCE(direccion, 'Sin dirección'),
  COALESCE(departamento_cod, '06'),
  COALESCE(municipio_cod, '14')
FROM configuracion
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- ACTUALIZAR TABLA: correlativos
-- Agregar establecimiento_id para correlativos independientes por sucursal
-- MEJORA FUTURA documentada en generador.utils.js
-- ─────────────────────────────────────────────

-- Paso 1: Eliminar el UNIQUE actual que no incluye establecimiento
ALTER TABLE correlativos
  DROP CONSTRAINT IF EXISTS correlativos_tipo_dte_ambiente_key;

-- Paso 2: Agregar columna establecimiento_id
ALTER TABLE correlativos
  ADD COLUMN IF NOT EXISTS establecimiento_id UUID
  REFERENCES establecimientos(id) ON DELETE RESTRICT;

-- Paso 3: Asignar el establecimiento por defecto a los correlativos existentes
UPDATE correlativos
SET establecimiento_id = (SELECT id FROM establecimientos LIMIT 1)
WHERE establecimiento_id IS NULL;

-- Paso 4: Hacer la columna NOT NULL ahora que tiene datos
ALTER TABLE correlativos
  ALTER COLUMN establecimiento_id SET NOT NULL;

-- Paso 5: Nuevo UNIQUE que incluye establecimiento
-- Permite correlativos independientes por sucursal
CREATE UNIQUE INDEX IF NOT EXISTS uq_correlativos_tipo_ambiente_estable
  ON correlativos(tipo_dte, ambiente, establecimiento_id);

-- Paso 6: Agregar correlativos para el establecimiento por defecto
-- (los existentes ya fueron asignados en el paso 3)
-- Para futuras sucursales se insertan al crear el establecimiento

-- ─────────────────────────────────────────────
-- ACTUALIZAR TABLA: dtes
-- Agregar establecimiento_id para filtrar DTEs por sucursal
-- ─────────────────────────────────────────────

-- Paso 1: Agregar columna
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS establecimiento_id UUID
  REFERENCES establecimientos(id) ON DELETE RESTRICT;

-- Paso 2: Asignar establecimiento por defecto a DTEs existentes
UPDATE dtes
SET establecimiento_id = (SELECT id FROM establecimientos LIMIT 1)
WHERE establecimiento_id IS NULL;

-- Paso 3: Hacer NOT NULL
ALTER TABLE dtes
  ALTER COLUMN establecimiento_id SET NOT NULL;

-- Índice para filtrar DTEs por establecimiento
CREATE INDEX IF NOT EXISTS idx_dtes_establecimiento
  ON dtes(establecimiento_id, fecha_emision DESC);

-- ─────────────────────────────────────────────
-- ACTUALIZAR TABLA: auditoria
-- Agregar establecimiento_id para trazabilidad por sucursal
-- Es nullable — algunos eventos son globales (configuracion, etc.)
-- ─────────────────────────────────────────────
ALTER TABLE auditoria
  ADD COLUMN IF NOT EXISTS establecimiento_id UUID
  REFERENCES establecimientos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_establecimiento
  ON auditoria(establecimiento_id) WHERE establecimiento_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
