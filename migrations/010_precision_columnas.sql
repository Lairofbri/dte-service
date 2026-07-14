-- =============================================
-- Migración 010: Precisión de columnas monetarias
-- MH permite 8 decimales en campos por ítem
-- =============================================

-- ─────────────────────────────────────────────
-- TABLA: dtes_items
-- Columnas con precisión de 8 decimales según MH
-- ─────────────────────────────────────────────
ALTER TABLE dtes_items
  ALTER COLUMN precio_uni    TYPE NUMERIC(18,8),
  ALTER COLUMN monto_descu   TYPE NUMERIC(18,8),
  ALTER COLUMN venta_no_suj  TYPE NUMERIC(18,8),
  ALTER COLUMN venta_exenta  TYPE NUMERIC(18,8),
  ALTER COLUMN venta_gravada TYPE NUMERIC(18,8),
  ALTER COLUMN psv           TYPE NUMERIC(18,8),
  ALTER COLUMN no_gravado    TYPE NUMERIC(18,8),
  ALTER COLUMN iva_item      TYPE NUMERIC(18,8);

-- ─────────────────────────────────────────────
-- TABLA: dtes
-- Totales también a 8 decimales para consistencia
-- ─────────────────────────────────────────────
ALTER TABLE dtes
  ALTER COLUMN total_gravado  TYPE NUMERIC(18,8),
  ALTER COLUMN total_iva      TYPE NUMERIC(18,8),
  ALTER COLUMN total          TYPE NUMERIC(18,8);

ALTER TABLE dtes
  ALTER COLUMN total_no_suj    TYPE NUMERIC(18,8),
  ALTER COLUMN total_exenta    TYPE NUMERIC(18,8),
  ALTER COLUMN total_descuento TYPE NUMERIC(18,8);
