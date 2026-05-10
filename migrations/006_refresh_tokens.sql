-- =============================================
-- Migración 006: Refresh Tokens para Auth JWT
-- Almacena tokens de refresco hasheados
-- DELETE real está bien — no son datos históricos
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: refresh_tokens
-- Tokens de refresco hasheados con bcrypt
-- Se eliminan al hacer logout o al expirar
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID NOT NULL
              REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Token hasheado con bcrypt — NUNCA texto plano
  token_hash  TEXT NOT NULL,
  -- Fecha de expiración — 7 días desde creación
  expira_en   TIMESTAMPTZ NOT NULL,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar por usuario al hacer logout
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario
  ON refresh_tokens(usuario_id);

-- Índice para limpiar tokens expirados
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expira
  ON refresh_tokens(expira_en);

-- Índice para búsqueda O(1) por hash SHA-256
-- Requerido por el fix de SHA-256 en refresh y logout
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash
  ON refresh_tokens(token_hash);

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
