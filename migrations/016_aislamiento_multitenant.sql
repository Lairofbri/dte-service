-- =============================================
-- Migración 016: Aislamiento multi-tenant (Fase 2)
-- Endurece las restricciones para que NINGÚN tenant pueda
-- consultar, modificar o emitir usando datos de otro tenant.
--
-- REQUISITO PREVIO: la migración 012 (add_tenant_id) debe
-- estar ejecutada. Esta migración detecta datos huérfanos
-- y FALLA de forma segura si algún registro no tiene tenant.
--
-- NO ejecutar en producción directamente: revisar y probar
-- primero sobre una base de pruebas.
-- =============================================

-- ═════════════════════════════════════════════
-- 0. PRE-CHECK: datos huérfanos
--    Si alguna fila crítica quedó sin tenant_id, la migración
--    aborta ANTES de tocar restricciones. Corregir a mano y re-ejecutar.
-- ═════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM establecimientos WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay establecimientos sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM configuracion WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay configuracion sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM correlativos WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay correlativos sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtes WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay dtes sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dtes_items WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay dtes_items sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contingencias WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay contingencias sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auditoria WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay auditoria sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usuarios WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay usuarios sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM refresh_tokens WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay refresh_tokens sin tenant_id — corregir antes de aislar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM clientes WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay clientes sin tenant_id — corregir antes de aislar';
  END IF;
END $$;

-- ═════════════════════════════════════════════
-- 1. NOT NULL + tenant-scoped
--    Garantiza que ninguna operación futura inserte filas
--    globales (sin tenant).
-- ═════════════════════════════════════════════
ALTER TABLE establecimientos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE configuracion    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE correlativos     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE dtes             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE dtes_items       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contingencias    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE auditoria        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE usuarios         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE refresh_tokens   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE clientes         ALTER COLUMN tenant_id SET NOT NULL;

-- ═════════════════════════════════════════════
-- 2. Índices únicos tenant-scoped (reemplazan globales)
-- ═════════════════════════════════════════════

-- Establecimientos: códigos MH únicos DENTRO del tenant
DROP INDEX IF EXISTS uq_establecimientos_tenant_codigos;
CREATE UNIQUE INDEX IF NOT EXISTS uq_establecimientos_tenant_codigos
  ON establecimientos(tenant_id, cod_estable_mh, cod_punto_venta_mh);

-- Correlativos: una secuencia por tenant+tipo+ambiente+establecimiento
DROP INDEX IF EXISTS uq_correlativos_tenant_tipo_ambiente_estable;
CREATE UNIQUE INDEX IF NOT EXISTS uq_correlativos_tenant_tipo_ambiente_estable
  ON correlativos(tenant_id, tipo_dte, ambiente, establecimiento_id);

-- Configuración: UNA fila por tenant
DROP INDEX IF EXISTS uq_configuracion_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS uq_configuracion_tenant
  ON configuracion(tenant_id);

-- Usuarios: email único DENTRO del tenant
DROP INDEX IF EXISTS uq_usuarios_tenant_email;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_tenant_email
  ON usuarios(tenant_id, email) WHERE email IS NOT NULL;

-- ═════════════════════════════════════════════
-- 3. Índices de consulta tenant-first
--    La columna tenant_id encabeza los índices para que el planner
--    use el filtro de aislamiento como primera condición.
-- ═════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_dtes_tenant_fecha
  ON dtes(tenant_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS idx_dtes_tenant_estado
  ON dtes(tenant_id, estado);

CREATE INDEX IF NOT EXISTS idx_dtes_tenant_establecimiento
  ON dtes(tenant_id, establecimiento_id);

CREATE INDEX IF NOT EXISTS idx_correlativos_tenant_busqueda
  ON correlativos(tenant_id, tipo_dte, ambiente, establecimiento_id);

CREATE INDEX IF NOT EXISTS idx_dtes_items_tenant_fk
  ON dtes_items(tenant_id, dte_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_fecha
  ON auditoria(tenant_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_contingencias_tenant_fecha
  ON contingencias(tenant_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_establecimientos_tenant_activo
  ON establecimientos(tenant_id, activo);

-- ═════════════════════════════════════════════
-- 4. (Opcional) Extender correlativos de datos existentes
--    Si algún correlativo previo no tiene fila por tenant
--    (migración 012 los asignó todos al tenant demo), se
--    respetan tal cual. Los establecimientos creados por tenant
--    generan sus correlativos en la capa de aplicación.
-- ═════════════════════════════════════════════

-- =============================================
-- ROLLBACK (documentado)
-- =============================================
-- Para revertir esta migración (si es necesario en pruebas):
--
--   ALTER TABLE establecimientos ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE configuracion    ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE correlativos     ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE dtes             ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE dtes_items       ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE contingencias    ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE auditoria        ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE usuarios         ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE refresh_tokens   ALTER COLUMN tenant_id DROP NOT NULL;
--   ALTER TABLE clientes         ALTER COLUMN tenant_id DROP NOT NULL;
--
-- Los índices se pueden recrear sin tenant cuando se elimine
-- el aislamiento. No se recomienda revertir en producción.
-- =============================================