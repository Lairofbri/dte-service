-- =============================================
-- Migración 028: Credenciales Hacienda NULLABLE
-- Permite guardar primero los datos del emisor y cargar las credenciales
-- de Hacienda después (flujo por pasos de Configuración).
-- La validez de usuario/contraseña la verifica Hacienda al autenticar,
-- no se imponen restricciones de formato locales.
-- =============================================

ALTER TABLE configuracion
  ALTER COLUMN usuario_hacienda DROP NOT NULL,
  ALTER COLUMN password_hacienda DROP NOT NULL;

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================