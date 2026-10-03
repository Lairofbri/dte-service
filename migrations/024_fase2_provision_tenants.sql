-- =============================================
-- Migración 024: Fase 2 — Provisión de empresas POS ↔ DTE
-- Spec: Provisión y sincronización POS-DTE
--
-- 1. tenants: provisioning_status, provisioning_operation_id, last_pos_sync_at
-- 2. Outbox de provisión: eventos_provision (eventos hacia POS)
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Estados de provisión del tenant
-- ─────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS provisioning_status VARCHAR(20)
    NOT NULL DEFAULT 'pending_fiscal_setup';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_provisioning_status_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_provisioning_status_check
  CHECK (provisioning_status IN (
    'provisioning', 'pending_fiscal_setup', 'active', 'blocked', 'failed'
  ));

-- Identificador de la operación de provisión (idempotencia).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS provisioning_operation_id UUID;

-- Última confirmación de sincronización del POS.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS last_pos_sync_at TIMESTAMPTZ;

-- Backfill: los tenants existentes ya operan → activos.
UPDATE tenants
SET provisioning_status = 'active'
WHERE provisioning_status = 'pending_fiscal_setup';

-- Idempotencia: reintentar la misma operación no duplica tenants.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_provisioning_operation_id
  ON tenants (provisioning_operation_id)
  WHERE provisioning_operation_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 2. Outbox de provisión — eventos hacia POS
-- El payload NUNCA incluye passwords de Hacienda ni secretos de firma.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eventos_provision (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id         UUID NOT NULL,
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id            UUID,
  tipo_evento          VARCHAR(50) NOT NULL,
  payload              JSONB NOT NULL DEFAULT '{}',
  estado               VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente', 'enviado', 'confirmado', 'fallido')),
  intentos             SMALLINT NOT NULL DEFAULT 0,
  ultimo_error         TEXT,
  proximo_reintento_en TIMESTAMPTZ DEFAULT NOW(),
  creado_en            TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en       TIMESTAMPTZ DEFAULT NOW(),
  confirmado_en        TIMESTAMPTZ,
  UNIQUE (operation_id, tipo_evento)
);

CREATE INDEX IF NOT EXISTS idx_eventos_provision_estado
  ON eventos_provision (estado, proximo_reintento_en);

CREATE INDEX IF NOT EXISTS idx_eventos_provision_tenant
  ON eventos_provision (tenant_id);

-- ─────────────────────────────────────────────
-- ROLLBACK (manual si fuera necesario):
--   DROP TABLE IF EXISTS eventos_provision;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS provisioning_status;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS provisioning_operation_id;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS last_pos_sync_at;
--   DROP INDEX IF EXISTS uq_tenants_provisioning_operation_id;
-- ─────────────────────────────────────────────