-- =============================================
-- Migración 035: Usuarios con roles múltiples
--
-- Un usuario puede tener VARIOS roles a la vez. Se agrega `usuarios.roles`
-- (TEXT[]) y se conserva `usuarios.rol` como "rol principal" (legacy) para no
-- romper código que aún lo lee.
--
-- Sincronización `rol` ↔ `roles` (trigger BEFORE INSERT/UPDATE):
--   → Si solo se escribe `rol` (código legado/seed) → roles := ARRAY[rol].
--   → Si se escribe `roles` → rol := roles[1] (el de mayor privilegio).
-- El orden de privilegio lo garantiza el backend (src/utils/roles.js).
--
-- Idempotente: puede ejecutarse múltiples veces.
-- =============================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: cada usuario existente recibe su rol actual como único rol.
UPDATE usuarios
SET roles = ARRAY[rol]
WHERE roles IS NULL OR cardinality(roles) = 0;

-- Todo rol debe pertenecer al conjunto válido y debe haber al menos uno.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_roles_validos;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_roles_validos
  CHECK (roles <@ ARRAY['administrador', 'operador', 'plataforma']::text[])
  NOT VALID;

ALTER TABLE usuarios
  VALIDATE CONSTRAINT usuarios_roles_validos;

CREATE INDEX IF NOT EXISTS idx_usuarios_roles
  ON usuarios USING GIN (roles);

-- ─────────────────────────────────────────────
-- Trigger de consistencia rol/roles
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sincronizar_roles_usuario() RETURNS trigger AS $$
BEGIN
  -- Sin roles explícitos → derivar del rol legacy.
  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[NEW.rol];
  END IF;
  -- El rol principal (legacy) siempre refleja el primer rol (mayor privilegio).
  NEW.rol := NEW.roles[1];
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_usuarios_roles ON usuarios;
CREATE TRIGGER trigger_usuarios_roles
  BEFORE INSERT OR UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION sincronizar_roles_usuario();

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
