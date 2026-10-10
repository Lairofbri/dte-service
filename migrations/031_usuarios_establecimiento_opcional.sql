-- =============================================
-- Migración 031: usuarios.establecimiento_id opcional
--
-- Contexto (2026-10-07): el alta de empresas desde DTE crea el usuario
-- administrador inicial del tenant nuevo cuando todavía no existen
-- establecimientos (provisioning_status = pending_fiscal_setup). La emisión
-- queda ligada a su establecimiento cuando se cree (spec §3.4).
--
-- SEGURIDAD: el aislamiento tenant_id se mantiene; solo se relaja el NOT NULL.
-- El servicio valida establecimiento activo + pertenencia al tenant cuando
-- el campo viene informado.
-- =============================================

ALTER TABLE usuarios
  ALTER COLUMN establecimiento_id DROP NOT NULL;

COMMENT ON COLUMN usuarios.establecimiento_id IS
  'Establecimiento fijo del usuario. NULL permitido desde 2026-10-07: administradores iniciales de tenants en provisión (pending_fiscal_setup) aún sin establecimientos.';

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================