-- =============================================
-- Migración 033: Tabla productos
-- Catálogo de bienes/servicios del cliente para autocompletar ítems al emitir DTEs
-- Multi-tenant: queries siempre filtradas por tenant_id (mismo patrón que clientes)
-- =============================================

-- pg_trgm ya habilitada en migración 008; CREATE EXTENSION por seguridad
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────
-- TABLA: productos
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Código interno/SKU opcional; único por tenant solo si está presente y activo
  codigo VARCHAR(25),

  -- Descripción fiscal del ítem (va a `descripcion` del DTE)
  nombre VARCHAR(1000) NOT NULL,

  -- CAT-011: 1=Producto, 2=Servicio, 3=Bien, 4=Otro (default 2)
  tipo_item INTEGER NOT NULL DEFAULT 2 CHECK (tipo_item IN (1,2,3,4)),

  -- CAT-014: unidad de medida (default 59 = Unidad, rango catálogo oficial 1-99)
  uni_medida INTEGER NOT NULL DEFAULT 59 CHECK (uni_medida BETWEEN 1 AND 99),

  -- Precio unitario sin IVA (NUMERIC alta precisión, como columnas de dtes)
  precio_unitario NUMERIC(18,8) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),

  -- Determina cómo se precarga el ítem al emitir:
  -- gravada → ventaGravada | no_sujeta → venta_no_suj | exenta → venta_exenta
  tipo_venta VARCHAR(20) NOT NULL DEFAULT 'gravada'
    CHECK (tipo_venta IN ('gravada','no_sujeta','exenta')),

  -- Control
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────

-- Listado por tenant + estado activo (búsqueda server-side del selector)
CREATE INDEX IF NOT EXISTS idx_productos_tenant
  ON productos(tenant_id, activo);

-- Búsqueda parcial por nombre (ILIKE, case-insensitive)
CREATE INDEX IF NOT EXISTS idx_productos_nombre
  ON productos USING gin(nombre gin_trgm_ops);

-- Código único por tenant mientras esté presente y activo
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_tenant_codigo
  ON productos(tenant_id, codigo)
  WHERE codigo IS NOT NULL AND activo = true;

-- ─────────────────────────────────────────────
-- TRIGGER: actualizar actualizado_en automáticamente
-- Reutiliza actualizar_timestamp() creada en migración 008
-- ─────────────────────────────────────────────
CREATE TRIGGER trg_productos_actualizado_en
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();