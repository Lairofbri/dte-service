-- =============================================
-- Migración 002: Campos adicionales en configuracion
-- Requeridos por los esquemas JSON oficiales de Hacienda
-- =============================================

-- Código de departamento según catálogo de Hacienda
-- 01=Ahuachapán, 02=Santa Ana, 03=Sonsonate, 04=Chalatenango
-- 05=La Libertad, 06=San Salvador, 07=Cuscatlán, 08=La Paz
-- 09=Cabañas, 10=San Vicente, 11=Usulután, 12=San Miguel
-- 13=Morazán, 14=La Unión
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS departamento_cod VARCHAR(2) DEFAULT '06';

-- Código de municipio según catálogo de Hacienda (2 dígitos)
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS municipio_cod VARCHAR(2) DEFAULT '14';

-- Descripción de la actividad económica (requerida en los esquemas)
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS desc_actividad VARCHAR(150);

-- CHECK constraints para los nuevos campos
ALTER TABLE configuracion
  ADD CONSTRAINT chk_departamento_cod
  CHECK (departamento_cod ~ '^(0[1-9]|1[0-4])$');

-- DESPUÉS — mínimo 01, máximo 99
ALTER TABLE configuracion
  ADD CONSTRAINT chk_municipio_cod
  CHECK (municipio_cod ~ '^(0[1-9]|[1-9][0-9])$');


-- ─────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- ─────────────────────────────────────────────
