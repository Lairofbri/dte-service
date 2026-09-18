-- =============================================
-- Migración 017: Idempotencia de emisión DTE (Fase 3)
-- Garantiza que una misma clave de negocio (tenant + orden + tipo)
-- produzca como máximo un DTE. Los reintentos reutilizan el mismo
-- registro en vez de generar un nuevo UUID/correlativo.
-- =============================================

-- Clave idempotente proporcionada por el cliente (p.ej. "ordenId:tipoDte").
-- Se indexa por tenant para garantizar aislamiento multi-tenant.
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

-- Restricción única: una sola emisión por (tenant, clave idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dtes_tenant_idempotency
  ON dtes(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Búsqueda rápida de la clave idempotente.
CREATE INDEX IF NOT EXISTS idx_dtes_idempotency_key
  ON dtes(idempotency_key)
  WHERE idempotency_key IS NOT NULL;