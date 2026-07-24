-- =============================================
-- Migración 014: Agregar activo a refresh_tokens
-- Permite reuse detection: si un token ya rotado
-- es reutilizado, detectamos el replay y revocamos
-- todas las sesiones del usuario
-- =============================================

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

-- Marcar todos los tokens existentes como activos
UPDATE refresh_tokens SET activo = TRUE WHERE activo IS NULL;

-- Índice para búsqueda por usuario (reuse detection)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario_activo
  ON refresh_tokens(usuario_id, activo);

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
