-- =============================================
-- Migración 029: Normalización de formato visual en configuracion
-- NIT/NRC/teléfono se almacenan SOLO con dígitos (Hacienda los recibe sin
-- guiones en el JSON del DTE: emisor.nit maxLength 14). Los guiones son
-- solo presentación (máscara en el frontend).
-- =============================================

UPDATE configuracion
  SET nit      = replace(nit, '-', ''),
      nrc      = replace(nrc, '-', ''),
      telefono = replace(telefono, '-', '')
  WHERE nit LIKE '%-%'
     OR nrc LIKE '%-%'
     OR telefono LIKE '%-%';

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================