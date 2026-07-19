-- =============================================
-- Migración 012: Agregar tenant_id a todas las tablas
-- Multi-tenancy: compartir BD entre empresas
-- =============================================
-- NOTA: Ejecutar DESPUÉS de 011_multitenant.sql
-- que crea la tabla tenants y la fila inicial.
-- =============================================

-- ═════════════════════════════════════════════
-- TABLA: establecimientos
-- ═════════════════════════════════════════════
ALTER TABLE establecimientos
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE establecimientos
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE establecimientos
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_establecimientos_tenant
  ON establecimientos(tenant_id);

-- Reemplazar unique por tenant-scoped
ALTER TABLE establecimientos
  DROP CONSTRAINT IF EXISTS establecimientos_cod_estable_cod_pvta_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_establecimientos_tenant_codigos
  ON establecimientos(tenant_id, cod_estable_mh, cod_punto_venta_mh);

-- ═════════════════════════════════════════════
-- TABLA: configuracion
-- ═════════════════════════════════════════════
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE configuracion
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE configuracion
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_configuracion_tenant
  ON configuracion(tenant_id);

-- Una fila de config por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_configuracion_tenant
  ON configuracion(tenant_id);

-- ═════════════════════════════════════════════
-- TABLA: correlativos
-- ═════════════════════════════════════════════
ALTER TABLE correlativos
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE correlativos
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE correlativos
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_correlativos_tenant
  ON correlativos(tenant_id);

-- Reemplazar unique index por tenant-scoped
DROP INDEX IF EXISTS uq_correlativos_tipo_ambiente_estable;
CREATE UNIQUE INDEX IF NOT EXISTS uq_correlativos_tenant_tipo_ambiente_estable
  ON correlativos(tenant_id, tipo_dte, ambiente, establecimiento_id);

-- ═════════════════════════════════════════════
-- TABLA: dtes
-- ═════════════════════════════════════════════
ALTER TABLE dtes
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE dtes
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE dtes
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dtes_tenant
  ON dtes(tenant_id, fecha_emision DESC);

-- ═════════════════════════════════════════════
-- TABLA: dtes_items
-- ═════════════════════════════════════════════
ALTER TABLE dtes_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE dtes_items
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE dtes_items
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dtes_items_tenant
  ON dtes_items(tenant_id);

-- ═════════════════════════════════════════════
-- TABLA: contingencias
-- ═════════════════════════════════════════════
ALTER TABLE contingencias
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE contingencias
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE contingencias
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contingencias_tenant
  ON contingencias(tenant_id);

-- ═════════════════════════════════════════════
-- TABLA: auditoria
-- ═════════════════════════════════════════════
ALTER TABLE auditoria
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE auditoria
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE auditoria
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant
  ON auditoria(tenant_id);

-- ═════════════════════════════════════════════
-- TABLA: usuarios
-- ═════════════════════════════════════════════
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE usuarios
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE usuarios
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant
  ON usuarios(tenant_id);

-- Reemplazar unique(email) por tenant-scoped
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_tenant_email
  ON usuarios(tenant_id, email) WHERE email IS NOT NULL;

-- ═════════════════════════════════════════════
-- TABLA: refresh_tokens
-- ═════════════════════════════════════════════
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE refresh_tokens rt
SET tenant_id = (SELECT tenant_id FROM usuarios WHERE id = rt.usuario_id)
WHERE tenant_id IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant
  ON refresh_tokens(tenant_id);

-- ═════════════════════════════════════════════
-- TABLA: clientes
-- ═════════════════════════════════════════════
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE clientes
SET tenant_id = 'a0000000-0000-0000-0000-000000000002'
WHERE tenant_id IS NULL;

ALTER TABLE clientes
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_tenant
  ON clientes(tenant_id);

-- ═════════════════════════════════════════════
-- FIN DE MIGRACIÓN
-- ═════════════════════════════════════════════
