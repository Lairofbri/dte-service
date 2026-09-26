-- =============================================
-- Migración 022: alinear API key demo local
-- El hash sembrado en 021 no corresponde a la clave
-- 'empresa-demo-local' de pos-backend/.env. Se corrige
-- para que el POS local autentique contra el tenant demo.
-- Idempotente: puede ejecutarse múltiples veces.
-- =============================================

UPDATE tenants
SET api_key_hash = '$2a$12$l.lnPLzSSjvEHmE/9UtmG.ZmCf0b8S.HNH6/4XZDNVr/Z8EcVOrOG'
WHERE id = 'a0000000-0000-4000-8000-000000000001';

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================