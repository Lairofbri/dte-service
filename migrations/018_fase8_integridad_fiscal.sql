-- Migración 018: Fase 8 - integridad fiscal tenant/establecimiento y lotes
-- NO ejecutar directamente en producción.
-- Ejecutar primero en una base de pruebas y revisar todos los prechecks.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM correlativos c
    JOIN establecimientos e ON e.id = c.establecimiento_id
    WHERE c.tenant_id <> e.tenant_id
  ) THEN
    RAISE EXCEPTION 'Existen correlativos con tenant distinto al establecimiento.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtes d
    JOIN establecimientos e ON e.id = d.establecimiento_id
    WHERE d.tenant_id <> e.tenant_id
  ) THEN
    RAISE EXCEPTION 'Existen DTEs con tenant distinto al establecimiento.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtes_items i
    JOIN dtes d ON d.id = i.dte_id
    WHERE i.tenant_id <> d.tenant_id
  ) THEN
    RAISE EXCEPTION 'Existen dtes_items con tenant distinto al DTE.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usuarios u
    JOIN establecimientos e ON e.id = u.establecimiento_id
    WHERE u.tenant_id <> e.tenant_id
  ) THEN
    RAISE EXCEPTION 'Existen usuarios con tenant distinto al establecimiento.';
  END IF;
END $$;

ALTER TABLE correlativos
  DROP CONSTRAINT IF EXISTS correlativos_tipo_dte_ambiente_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_establecimientos_id_tenant') THEN
    ALTER TABLE establecimientos ADD CONSTRAINT uq_establecimientos_id_tenant UNIQUE (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_dtes_id_tenant') THEN
    ALTER TABLE dtes ADD CONSTRAINT uq_dtes_id_tenant UNIQUE (id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_correlativos_establecimiento_tenant') THEN
    ALTER TABLE correlativos ADD CONSTRAINT fk_correlativos_establecimiento_tenant
      FOREIGN KEY (establecimiento_id, tenant_id) REFERENCES establecimientos(id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dtes_establecimiento_tenant') THEN
    ALTER TABLE dtes ADD CONSTRAINT fk_dtes_establecimiento_tenant
      FOREIGN KEY (establecimiento_id, tenant_id) REFERENCES establecimientos(id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dtes_items_dte_tenant') THEN
    ALTER TABLE dtes_items ADD CONSTRAINT fk_dtes_items_dte_tenant
      FOREIGN KEY (dte_id, tenant_id) REFERENCES dtes(id, tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_establecimiento_tenant') THEN
    ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_establecimiento_tenant
      FOREIGN KEY (establecimiento_id, tenant_id) REFERENCES establecimientos(id, tenant_id);
  END IF;
END $$;

ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS codigo_lote UUID;

CREATE INDEX IF NOT EXISTS idx_dtes_tenant_lote
  ON dtes(tenant_id, codigo_lote)
  WHERE codigo_lote IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dtes_items_dte_num_item
  ON dtes_items(dte_id, num_item);

CREATE INDEX IF NOT EXISTS idx_dtes_items_tenant_dte_item
  ON dtes_items(tenant_id, dte_id, num_item);

-- Rollback en pruebas:
-- DROP INDEX IF EXISTS idx_dtes_items_tenant_dte_item;
-- DROP INDEX IF EXISTS uq_dtes_items_dte_num_item;
-- DROP INDEX IF EXISTS idx_dtes_tenant_lote;
-- ALTER TABLE dtes DROP COLUMN IF EXISTS codigo_lote;
-- ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS fk_usuarios_establecimiento_tenant;
-- ALTER TABLE dtes_items DROP CONSTRAINT IF EXISTS fk_dtes_items_dte_tenant;
-- ALTER TABLE dtes DROP CONSTRAINT IF EXISTS fk_dtes_establecimiento_tenant;
-- ALTER TABLE correlativos DROP CONSTRAINT IF EXISTS fk_correlativos_establecimiento_tenant;
-- ALTER TABLE dtes DROP CONSTRAINT IF EXISTS uq_dtes_id_tenant;
-- ALTER TABLE establecimientos DROP CONSTRAINT IF EXISTS uq_establecimientos_id_tenant;
