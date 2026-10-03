-- =============================================
-- Migración 025: Fase 3 — Provisión y vínculo de sucursales
-- Spec: Provisión y sincronización POS-DTE
--
-- 1. establecimientos.fiscal_status: estados del vínculo POS ↔ DTE
--    (pending_link / pending_mh_data / ready / inactive / blocked).
-- 2. establecimientos.provisioning_status: estado de sincronización.
-- 3. establecimientos.sync_error: último error de sincronización.
-- 4. Los códigos MH y los datos fiscales pasan a NULLables: un
--    establecimiento pendiente creado desde POS (spec §6.3) no tiene
--    códigos MH todavía; solo el administrador DTE los completa.
-- 5. Unicidad de códigos MH tenant-scoped: la UNIQUE global heredada de la
--    migración 004 se reemplaza por un índice único por tenant.
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Estados fiscales del establecimiento
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS fiscal_status VARCHAR(20) NOT NULL DEFAULT 'pending_link';

ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_fiscal_status_check;
ALTER TABLE establecimientos
  ADD CONSTRAINT establecimientos_fiscal_status_check
  CHECK (fiscal_status IN ('pending_link', 'pending_mh_data', 'ready', 'inactive', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_establecimientos_tenant_fiscal_status
  ON establecimientos (tenant_id, fiscal_status);

-- ─────────────────────────────────────────────
-- 2. Estado de sincronización de provisión
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS provisioning_status VARCHAR(20) NOT NULL DEFAULT 'confirmed';

ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_provisioning_status_check;
ALTER TABLE establecimientos
  ADD CONSTRAINT establecimientos_provisioning_status_check
  CHECK (provisioning_status IN ('pending', 'confirmed', 'failed'));

-- ─────────────────────────────────────────────
-- 3. Último error de sincronización
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- ─────────────────────────────────────────────
-- 4. Códigos MH y datos fiscales NULLables
-- Un establecimiento en pending_mh_data no tiene códigos de Hacienda;
-- el admin los completa antes de pasar a ready.
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  ALTER COLUMN cod_estable_mh     DROP NOT NULL,
  ALTER COLUMN cod_punto_venta_mh DROP NOT NULL,
  ALTER COLUMN cod_estable        DROP NOT NULL,
  ALTER COLUMN cod_punto_venta    DROP NOT NULL,
  ALTER COLUMN direccion          DROP NOT NULL,
  ALTER COLUMN departamento_cod   DROP NOT NULL,
  ALTER COLUMN municipio_cod      DROP NOT NULL;

-- ─────────────────────────────────────────────
-- 5. Backfill de estados fiscales
-- Los establecimientos operativos con códigos MH (incl. el demo M001/P001
-- ya vinculado a la Sucursal Principal) quedan ready. Los que no tienen
-- códigos quedan pendientes de datos MH.
-- ─────────────────────────────────────────────
UPDATE establecimientos
SET fiscal_status = 'ready'
WHERE fiscal_status = 'pending_link'
  AND cod_estable_mh IS NOT NULL
  AND cod_punto_venta_mh IS NOT NULL;

UPDATE establecimientos
SET fiscal_status = 'pending_mh_data'
WHERE fiscal_status = 'pending_link'
  AND (cod_estable_mh IS NULL OR cod_punto_venta_mh IS NULL);

-- ─────────────────────────────────────────────
-- 6. Unicidad de códigos MH por tenant
-- La UNIQUE global (004) se reemplaza por un índice único tenant-scoped:
-- dos tenants distintos pueden usar la misma combinación de códigos.
-- ─────────────────────────────────────────────
ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_cod_estable_mh_cod_punto_venta_mh_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_establecimientos_tenant_codigos_mh
  ON establecimientos (tenant_id, cod_estable_mh, cod_punto_venta_mh)
  WHERE cod_estable_mh IS NOT NULL AND cod_punto_venta_mh IS NOT NULL;

-- ─────────────────────────────────────────────
-- ROLLBACK (manual si fuera necesario):
--   ALTER TABLE establecimientos DROP COLUMN IF EXISTS fiscal_status;
--   ALTER TABLE establecimientos DROP COLUMN IF EXISTS provisioning_status;
--   ALTER TABLE establecimientos DROP COLUMN IF EXISTS sync_error;
--   ALTER TABLE establecimientos ALTER COLUMN cod_estable_mh SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN cod_punto_venta_mh SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN cod_estable SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN cod_punto_venta SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN direccion SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN departamento_cod SET NOT NULL;
--   ALTER TABLE establecimientos ALTER COLUMN municipio_cod SET NOT NULL;
--   DROP INDEX IF EXISTS uq_establecimientos_tenant_codigos_mh;
-- ─────────────────────────────────────────────