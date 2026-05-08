-- =============================================
-- Migración 003: Actualizar CHECK de tipo_dte
-- Incluir todos los tipos de DTE soportados
-- =============================================

-- Eliminar el constraint actual que solo tenía 4 tipos
ALTER TABLE dtes DROP CONSTRAINT IF EXISTS dtes_tipo_dte_check;

-- Agregar constraint actualizado con todos los tipos
ALTER TABLE dtes
  ADD CONSTRAINT dtes_tipo_dte_check
  CHECK (tipo_dte IN ('01','03','04','05','06','07','08','09','11','14','15'));

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
