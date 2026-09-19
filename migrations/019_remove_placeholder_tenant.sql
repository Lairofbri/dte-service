-- 012 creó un tenant placeholder para poder migrar datos históricos.
-- 018 ya corrigió las filas que lo usaban; no debe quedar activo ni visible.
DELETE FROM tenants
WHERE id = 'a0000000-0000-0000-0000-000000000002'
  AND activo = FALSE;
