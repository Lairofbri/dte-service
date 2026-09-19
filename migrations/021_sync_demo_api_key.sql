-- API key de desarrollo compartida con pos-backend/.env para el entorno local.
UPDATE tenants
SET api_key_hash = '$2a$12$IrTzGSj5keHRKx2pm5eyT.ZzvP2BaA2XDkywVEw1MG5zlCxAwnRN6'
WHERE id = 'a0000000-0000-4000-8000-000000000001';
