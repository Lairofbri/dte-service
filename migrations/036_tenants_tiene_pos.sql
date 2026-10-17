-- =============================================
-- Migración 036: tenants.tiene_pos
--
-- Marca si una empresa usa el POS (proyección operativa) además de DTE.
-- Permite:
--   → Mostrar el estado en el Onboarding ("Con POS" / "Solo DTE").
--   → Habilitar POS DESPUÉS del alta (endpoint `habilitar-pos`): una empresa
--     creada "solo DTE" puede adquirir POS más tarde.
--
-- Backfill: un tenant con API Key técnica (api_key_hash) ya tiene integración
-- POS; el resto queda como "solo DTE".
--
-- Idempotente: puede ejecutarse múltiples veces.
-- =============================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tiene_pos BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tenants
SET tiene_pos = TRUE
WHERE api_key_hash IS NOT NULL
  AND tiene_pos = FALSE;

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
