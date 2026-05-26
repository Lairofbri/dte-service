-- =============================================
-- Migración 009: Agregar columna version a tabla dtes
-- Almacena la versión del esquema JSON usado al emitir el DTE
-- =============================================

ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS version SMALLINT DEFAULT 1;

-- Actualizar DTEs existentes extrayendo la versión del JSON almacenado
-- Versiones conocidas: FCF=2, CCF=4, FSE=2, NC=4, ND=4, NR=4, CD=2, CL=2, CR=2, DCL=2, FEX=3
UPDATE dtes
SET version = COALESCE(
  (json_dte -> 'identificacion' ->> 'version')::SMALLINT,
  1
)
WHERE version = 1;

-- Hacer NOT NULL después de actualizar datos existentes
ALTER TABLE dtes
  ALTER COLUMN version SET NOT NULL;

-- Índice para filtrar por versión
CREATE INDEX IF NOT EXISTS idx_dtes_version
  ON dtes(version);

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
