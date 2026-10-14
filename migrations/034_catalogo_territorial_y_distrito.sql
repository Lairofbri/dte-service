-- =============================================
-- Migración 034: Vínculo territorial oficial (departamento ↔ municipio/distrito)
-- y distrito CAT-008 por establecimiento/cliente.
-- Fuente: "Catálogos - Facturación Electrónica V1.1" (Excel oficial MH).
--
-- CAT-013 (Municipio) y CAT-008 (Distrito) repiten códigos entre
-- departamentos: el par (departamento, código) es la clave real del catálogo.
-- Se agrega departamento_codigo y se backfillea por los bloques oficiales
-- (el orden de la migración 027 sigue exactamente el orden del Excel).
--
-- Además: distrito_cod (CAT-008) en establecimientos y clientes — el esquema
-- oficial (FCF v2 / CCF v4) exige departamento + municipio + distrito +
-- complemento en la dirección. Antes, el generador usaba el código de
-- municipio como respaldo de distrito (dato fiscal incorrecto).
-- =============================================

ALTER TABLE cat_013_municipio ADD COLUMN IF NOT EXISTS departamento_codigo VARCHAR(16);
ALTER TABLE cat_008_distrito  ADD COLUMN IF NOT EXISTS departamento_codigo VARCHAR(16);

-- Backfill CAT-013 Municipio (45 filas: orden 1 = '00 Otro'; bloques por
-- departamento en el orden oficial 01..14).
UPDATE cat_013_municipio SET departamento_codigo = '00' WHERE orden = 1;
UPDATE cat_013_municipio SET departamento_codigo = '01' WHERE orden BETWEEN 2  AND 4;
UPDATE cat_013_municipio SET departamento_codigo = '02' WHERE orden BETWEEN 5  AND 8;
UPDATE cat_013_municipio SET departamento_codigo = '03' WHERE orden BETWEEN 9  AND 12;
UPDATE cat_013_municipio SET departamento_codigo = '04' WHERE orden BETWEEN 13 AND 15;
UPDATE cat_013_municipio SET departamento_codigo = '05' WHERE orden BETWEEN 16 AND 21;
UPDATE cat_013_municipio SET departamento_codigo = '06' WHERE orden BETWEEN 22 AND 26;
UPDATE cat_013_municipio SET departamento_codigo = '07' WHERE orden BETWEEN 27 AND 28;
UPDATE cat_013_municipio SET departamento_codigo = '08' WHERE orden BETWEEN 29 AND 31;
UPDATE cat_013_municipio SET departamento_codigo = '09' WHERE orden BETWEEN 32 AND 33;
UPDATE cat_013_municipio SET departamento_codigo = '10' WHERE orden BETWEEN 34 AND 35;
UPDATE cat_013_municipio SET departamento_codigo = '11' WHERE orden BETWEEN 36 AND 38;
UPDATE cat_013_municipio SET departamento_codigo = '12' WHERE orden BETWEEN 39 AND 41;
UPDATE cat_013_municipio SET departamento_codigo = '13' WHERE orden BETWEEN 42 AND 43;
UPDATE cat_013_municipio SET departamento_codigo = '14' WHERE orden BETWEEN 44 AND 45;

-- Backfill CAT-008 Distrito (263 filas: orden 1 = '00 Otro'; 262 distritos por
-- departamento en el orden oficial 01..14).
UPDATE cat_008_distrito SET departamento_codigo = '00' WHERE orden = 1;
UPDATE cat_008_distrito SET departamento_codigo = '01' WHERE orden BETWEEN 2   AND 13;
UPDATE cat_008_distrito SET departamento_codigo = '02' WHERE orden BETWEEN 14  AND 26;
UPDATE cat_008_distrito SET departamento_codigo = '03' WHERE orden BETWEEN 27  AND 42;
UPDATE cat_008_distrito SET departamento_codigo = '04' WHERE orden BETWEEN 43  AND 75;
UPDATE cat_008_distrito SET departamento_codigo = '05' WHERE orden BETWEEN 76  AND 97;
UPDATE cat_008_distrito SET departamento_codigo = '06' WHERE orden BETWEEN 98  AND 116;
UPDATE cat_008_distrito SET departamento_codigo = '07' WHERE orden BETWEEN 117 AND 132;
UPDATE cat_008_distrito SET departamento_codigo = '08' WHERE orden BETWEEN 133 AND 154;
UPDATE cat_008_distrito SET departamento_codigo = '09' WHERE orden BETWEEN 155 AND 163;
UPDATE cat_008_distrito SET departamento_codigo = '10' WHERE orden BETWEEN 164 AND 176;
UPDATE cat_008_distrito SET departamento_codigo = '11' WHERE orden BETWEEN 177 AND 199;
UPDATE cat_008_distrito SET departamento_codigo = '12' WHERE orden BETWEEN 200 AND 219;
UPDATE cat_008_distrito SET departamento_codigo = '13' WHERE orden BETWEEN 220 AND 245;
UPDATE cat_008_distrito SET departamento_codigo = '14' WHERE orden BETWEEN 246 AND 263;

-- El par (departamento_codigo, codigo) es la clave real del catálogo.
-- El índice único protege la integridad del backfill y de futuras cargas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_013_municipio_depto_codigo
  ON cat_013_municipio (departamento_codigo, codigo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_008_distrito_depto_codigo
  ON cat_008_distrito (departamento_codigo, codigo);

-- Distrito CAT-008 en establecimientos (dirección fiscal del emisor)
ALTER TABLE establecimientos DROP CONSTRAINT IF EXISTS establecimientos_distrito_cod_check;
ALTER TABLE establecimientos ADD COLUMN IF NOT EXISTS distrito_cod VARCHAR(2);
ALTER TABLE establecimientos
  ADD CONSTRAINT establecimientos_distrito_cod_check
  CHECK (distrito_cod IS NULL OR distrito_cod ~ '^[0-9]{2}$');

-- Distrito CAT-008 en clientes (dirección del receptor)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_distrito_cod_check;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS distrito_cod VARCHAR(2);
ALTER TABLE clientes
  ADD CONSTRAINT clientes_distrito_cod_check
  CHECK (distrito_cod IS NULL OR distrito_cod ~ '^[0-9]{2}$');
