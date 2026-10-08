-- =============================================
-- Migración 030: Contraseña de firma (passwordPri) por tenant, CIFRADA en BD
--
-- Contexto: firmador remoto svfe-api-firmador en Bluehost. Multi-empresa:
-- cada tenant carga su propia contraseña del certificado en Configuración.
-- Ya NO se usan variables de entorno (FIRMADOR_PASSWORD_PRI_* / global).
--
-- SEGURIDAD: el valor se guarda CIFRADO con AES-256-GCM (ENCRYPTION_KEY) —
-- nunca texto plano. El módulo firmador la desencripta solo al operar.
-- =============================================

ALTER TABLE configuracion
  ADD COLUMN password_firma TEXT;

COMMENT ON COLUMN configuracion.password_firma IS
  'Contraseña de la llave privada del certificado de firma (passwordPri), CIFRADA AES-256-GCM. Por tenant. Nunca se devuelve al cliente.';

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================