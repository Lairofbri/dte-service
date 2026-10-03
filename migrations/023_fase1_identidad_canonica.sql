-- =============================================
-- Migración 023: Fase 1 — Identidad canónica y seguridad
--
-- 1) branch_id canónico en establecimientos:
--    El identificador común de una sucursal operativa/fiscal entre POS y DTE.
--    POS mantiene el mismo valor en sucursales.branch_id (migración 070).
--    DTE lo expone en establecimientos.branch_id; la escritura y el vínculo
--    formal pertenecen a Fase 3 (provisión de sucursales). Aquí solo se
--    establece la identidad y el mapeo canónico del demo.
-- 2) Rol de plataforma para onboarding:
--    Se agrega el rol 'plataforma' al CHECK de usuarios. Este rol permitirá
--    operaciones de onboarding (alta de empresas) en Fase 2. Un operador o
--    administrador normal no puede crear tenants hermanos.
-- Idempotente: puede ejecutarse múltiples veces.
-- =============================================

-- ─────────────────────────────────────────────
-- 1) establecimientos.branch_id — identidad canónica compartida
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Un branch_id solo puede pertenecer a un establecimiento dentro del tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_establecimientos_tenant_branch_id
  ON establecimientos(tenant_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establecimientos_branch_id
  ON establecimientos(branch_id)
  WHERE branch_id IS NOT NULL;

-- Backfill canónico del demo: el establecimiento M001/P001 del tenant demo
-- corresponde a la "Sucursal Principal" del POS (branch_id b000...001).
UPDATE establecimientos
SET branch_id = 'b0000000-0000-4000-8000-000000000001'
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND branch_id IS NULL
  AND cod_estable_mh = 'M001'
  AND cod_punto_venta_mh = 'P001';

-- ─────────────────────────────────────────────
-- 2) usuarios — rol de plataforma para onboarding
-- ─────────────────────────────────────────────
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('administrador', 'operador', 'plataforma'));

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================