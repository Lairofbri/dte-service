-- =============================================
-- Migración 037: Tercer tipo de cliente — sujeto excluido (DTE-14 / FSE)
--
-- Reglas de identificación en El Salvador:
--   natural          → DUI o NIT (documentos homologados para personas naturales)
--   juridico         → NIT (una empresa no tiene DUI)
--   sujeto_excluido  → DUI (no es empresa; el esquema FSE v2 identifica al
--                      receptor con tipoDocumento/numDocumento, no con NIT)
-- =============================================

-- 'sujeto_excluido' tiene 15 caracteres: el VARCHAR(10) original no alcanza.
ALTER TABLE clientes ALTER COLUMN tipo_cliente TYPE VARCHAR(20);

-- Reemplazar el CHECK original (PostgreSQL lo autogenera como
-- clientes_tipo_cliente_check) por uno que incluya el nuevo tipo.
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_tipo_cliente_check;

ALTER TABLE clientes
  ADD CONSTRAINT clientes_tipo_cliente_check
  CHECK (tipo_cliente IN ('natural', 'juridico', 'sujeto_excluido'));

COMMENT ON COLUMN clientes.tipo_cliente IS
  'natural (DUI/NIT) | juridico (NIT) | sujeto_excluido (DUI, factura FSE-14)';
