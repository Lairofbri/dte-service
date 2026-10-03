-- Migración 026: Fase 7 — Backfill del vínculo de la Sucursal Centro del demo.
--
-- El establecimiento "Sucursal Centro" (M002/P001) quedó en fiscal_status 'ready'
-- en Fase 3 pero sin branch_id compartido. La migración POS 075 asignó a la
-- Sucursal Centro operativa (b0000000-0000-4000-8000-000000000002) el
-- dte_establecimiento_id = b0000000-0000-4000-8000-000000000002 (este mismo
-- establecimiento). Para que el vínculo POS ↔ DTE sea consistente (spec §10
-- Fase 7: cero diferencias no justificadas), se asigna aquí el branch_id
-- compartido al establecimiento.
--
-- Idempotente y scoped al tenant demo: re-ejecutar es no-op (guard branch_id IS NULL).
-- No toca otros tenants.
--
-- Rollback:
--   UPDATE establecimientos SET branch_id = NULL
--   WHERE id = 'b0000000-0000-4000-8000-000000000002'
--     AND tenant_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE establecimientos
SET branch_id = 'b0000000-0000-4000-8000-000000000002'
WHERE id = 'b0000000-0000-4000-8000-000000000002'
  AND tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND branch_id IS NULL;