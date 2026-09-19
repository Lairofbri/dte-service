-- Migra el tenant histórico del DTE Service al UUID canónico compartido con POS.

DO $$
DECLARE
  tabla RECORD;
  restriccion RECORD;
  viejo CONSTANT UUID := 'a0000000-0000-0000-0000-000000000001';
  canonico CONSTANT UUID := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = viejo) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _dte_tenant_fk_defs (
    tabla REGCLASS NOT NULL,
    nombre TEXT NOT NULL,
    definicion TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _dte_tenant_fk_defs (tabla, nombre, definicion)
  SELECT c.conrelid::regclass, c.conname, pg_get_constraintdef(c.oid)
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%tenant_id%';

  FOR restriccion IN SELECT * FROM _dte_tenant_fk_defs LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', restriccion.tabla, restriccion.nombre);
  END LOOP;

  INSERT INTO tenants (id, nombre, nit, nrc, activo, api_key_hash, encryption_key)
  SELECT canonico, nombre, nit, nrc, activo,
         '$2a$12$IrTzGSj5keHRKx2pm5eyT.ZzvP2BaA2XDkywVEw1MG5zlCxAwnRN6',
         encryption_key
  FROM tenants
  WHERE id = viejo
  ON CONFLICT (id) DO UPDATE SET
    api_key_hash = EXCLUDED.api_key_hash,
    encryption_key = EXCLUDED.encryption_key,
    activo = EXCLUDED.activo;

  FOR tabla IN
    SELECT DISTINCT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET tenant_id = $1 WHERE tenant_id = $2',
      tabla.table_schema,
      tabla.table_name
    ) USING canonico, viejo;
  END LOOP;

  DELETE FROM tenants WHERE id = viejo;

  FOR restriccion IN SELECT * FROM _dte_tenant_fk_defs LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      restriccion.tabla,
      restriccion.nombre,
      restriccion.definicion
    );
  END LOOP;
END $$;
