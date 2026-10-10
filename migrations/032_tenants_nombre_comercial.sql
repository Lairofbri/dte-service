-- =============================================
-- Migración 032: tenants.nombre_comercial (nombre de login/display)
--
-- Contexto (2026-10-07): se distingue el nombre de la empresa requerido por
-- Hacienda (tenants.nombre = razón social) del nombre comercial que aparece
-- al iniciar sesión (tenants.nombre_comercial).
--
-- Backfill: los tenants existentes usan su razón social como nombre comercial.
-- =============================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(150);

UPDATE tenants
SET nombre_comercial = nombre
WHERE nombre_comercial IS NULL;

COMMENT ON COLUMN tenants.nombre_comercial IS
  'Nombre comercial (muestra en el selector de login). Si es NULL se usa tenants.nombre (razón social fiscal).';

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================