-- =============================================
-- Migración 005: Usuarios del DTE Service
-- Gestión de usuarios con roles y establecimientos
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: usuarios
-- Usuarios del sistema DTE con roles y establecimientos
-- Soft delete — nunca eliminar usuarios
-- El historial de auditoría los referencia
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Datos del usuario
  nombre              VARCHAR(100) NOT NULL,
  email               VARCHAR(150) NOT NULL,

  -- Password hasheado con bcrypt — NUNCA texto plano
  password_hash       TEXT         NOT NULL,

  -- Rol del usuario en el sistema
  -- administrador: acceso total
  -- operador: solo su establecimiento
  rol                 VARCHAR(20)  NOT NULL DEFAULT 'operador'
                      CHECK (rol IN ('administrador', 'operador')),

  -- Establecimiento al que pertenece
  -- NOT NULL — todo usuario debe pertenecer a una sucursal
  establecimiento_id  UUID         NOT NULL
                      REFERENCES establecimientos(id) ON DELETE RESTRICT,

  -- Control de acceso
  activo              BOOLEAN      DEFAULT TRUE,

  -- Seguridad: bloqueo por intentos fallidos
  intentos_fallidos   INTEGER      DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta     TIMESTAMPTZ, -- NULL = no bloqueado

  -- Auditoría de acceso
  ultimo_login        TIMESTAMPTZ,

  -- Control
  creado_en           TIMESTAMPTZ  DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ  DEFAULT NOW(),

  -- Email único en todo el sistema
  UNIQUE(email)
);

CREATE TRIGGER trigger_usuarios_updated
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- Índices
CREATE INDEX IF NOT EXISTS idx_usuarios_email
  ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_establecimiento
  ON usuarios(establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo
  ON usuarios(activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol
  ON usuarios(rol);

-- ─────────────────────────────────────────────
-- ACTUALIZAR TABLA: auditoria
-- Agregar usuario_id para saber quién hizo qué
-- Nullable — algunos eventos son del sistema (no de un usuario)
-- ─────────────────────────────────────────────
ALTER TABLE auditoria
  ADD COLUMN IF NOT EXISTS usuario_id UUID
  REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
  ON auditoria(usuario_id) WHERE usuario_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- USUARIO ADMINISTRADOR POR DEFECTO
-- Se crea con password temporal que DEBE cambiarse
-- Password: Admin@DTE2024! (bcrypt hash)
-- IMPORTANTE: El cliente DEBE cambiar este password
--             en el primer login
-- ─────────────────────────────────────────────
INSERT INTO usuarios (
  nombre, email, password_hash, rol, establecimiento_id
)
SELECT
  'Administrador',
  'admin@dte.local',
  -- Hash bcrypt de 'Admin@DTE2024!' con 12 rondas
  -- El cliente DEBE cambiar este password en el primer login
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lewis.Qcm7KmN.r5u',
  'administrador',
  e.id
FROM establecimientos e
WHERE e.activo = TRUE
ORDER BY e.creado_en ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
