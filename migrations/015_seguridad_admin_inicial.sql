-- =============================================
-- Migración 015: Neutralizar administrador inicial
-- Seguridad Fase 1
--
-- La migración 005 insertó un usuario administrador con una
-- contraseña conocida. Si esa contraseña nunca fue cambiada, la
-- cuenta es un riesgo de acceso no autorizado.
--
-- Esta migración DESACTIVA únicamente las cuentas que todavía
-- usan el hash bcrypt de la contraseña predeterminada conocida.
-- Las cuentas cuyo password fue cambiado NO se ven afectadas.
--
-- ACCIÓN REQUERIDA: después de aplicar, un administrador debe
-- crear/activar el primer usuario real mediante un flujo seguro.
-- =============================================

-- Hash bcrypt de la contraseña predeterminada documentada en 005_usuarios.sql
-- (corresponde a 'Admin@DTE2024!' con 12 rondas)
UPDATE usuarios
SET activo = FALSE,
    bloqueado_hasta = NOW() + INTERVAL '1 hour'
WHERE password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lewis.Qcm7KmN.r5u'
  AND activo = TRUE;

-- Auditoría de la acción
INSERT INTO auditoria (evento, detalles, status_http)
SELECT 'SEGURIDAD_ADMIN_INICIAL_DESACTIVADO',
       json_build_object(
         'usuario_id', u.id,
         'email', u.email,
         'motivo', 'Contraseña predeterminada conocida — desactivado por migración 015'
       ),
       200
FROM usuarios u
WHERE u.password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lewis.Qcm7KmN.r5u'
  AND u.activo = FALSE;

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================