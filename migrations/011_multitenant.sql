-- =============================================
-- Migración 011: Multi-tenancy
-- Agrega tabla tenants para soporte multi-tenant
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: tenants
-- Cada tenant es una empresa/cliente del DTE Service
-- Almacena API key y encryption key por tenant
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre          VARCHAR(150) NOT NULL,
  nit             VARCHAR(20)  NOT NULL UNIQUE,
  nrc             VARCHAR(20),
  activo          BOOLEAN DEFAULT TRUE,
  -- Auth: bcrypt hash de la API Key que usa el POS Backend
  api_key_hash    VARCHAR(60),
  -- Cifrado: clave AES-256 para credenciales Hacienda de este tenant
  encryption_key  VARCHAR(64),
  -- Control
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trigger_tenants_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE INDEX IF NOT EXISTS idx_tenants_activo
  ON tenants(activo);

-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
