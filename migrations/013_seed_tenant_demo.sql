-- =============================================
-- Migración 013: Seed del tenant "Restaurante Demo"
-- Inserta el tenant demo con su API key hash
-- Idempotente: puede ejecutarse múltiples veces
-- =============================================

-- El UUID coincide con el del POS Backend (a0000000-...-000000000001)
-- para mantener trazabilidad entre ambos sistemas
INSERT INTO tenants (id, nombre, nit, nrc, activo, api_key_hash, encryption_key)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Restaurante Demo',
  '0000-000000-000-0',
  NULL,
  TRUE,
  '$2a$12$yDfuqFWJysci5D2.E5LJMuj1r/vpaSfDsi.RJiZLqN0mPtJBwFpYy',
  '6SniMxhgR9CIzdUP3f4DHEkTaj7BOJVK'
)
ON CONFLICT (id) DO UPDATE SET
  api_key_hash   = EXCLUDED.api_key_hash,
  encryption_key = EXCLUDED.encryption_key,
  activo         = EXCLUDED.activo,
  nombre         = EXCLUDED.nombre,
  nit            = EXCLUDED.nit;

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
