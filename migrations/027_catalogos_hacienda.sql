-- =============================================
-- Migración 027: Catálogos oficiales Hacienda (CAT-001 a CAT-033)
-- Fuente: "Catálogos - Facturación Electrónica V1.1" del Ministerio de
--         Hacienda de El Salvador (libro de Excel oficial).
-- Tablas GENERALES de referencia: no tienen tenant_id (son globales).
-- Cada tabla: id (clave técnica), codigo, descripcion, orden.
-- Notas de normalización:
--   - CAT-008 (Distrito) y CAT-013 (Municipio) repiten códigos por
--     departamento; se conservan tal cual, en orden del Excel.
--   - CAT-015 (Tributos) repite códigos entre secciones; se conservan.
--   - CAT-019 (Actividad Económica): solo filas con código (774);
--     los encabezados jerárquicos sin código se excluyen.
-- =============================================

-- --------------------------------------------------
-- CAT-001 Ambiente de destino — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_001_ambiente_destino (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_001_ambiente_destino_codigo ON cat_001_ambiente_destino (codigo);

INSERT INTO cat_001_ambiente_destino (codigo, descripcion, orden) VALUES
  ('00', 'Modo prueba', 1),
  ('01', 'Modo producción', 2)
;

-- --------------------------------------------------
-- CAT-002 Tipo de Documento / Evento — 13 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_002_tipo_documento (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_002_tipo_documento_codigo ON cat_002_tipo_documento (codigo);

INSERT INTO cat_002_tipo_documento (codigo, descripcion, orden) VALUES
  ('01', 'Factura', 1),
  ('03', 'Comprobante de crédito fiscal', 2),
  ('04', 'Nota de remisión', 3),
  ('05', 'Nota de crédito', 4),
  ('06', 'Nota de débito', 5),
  ('07', 'Comprobante de retención', 6),
  ('08', 'Comprobante de liquidación', 7),
  ('09', 'Documento contable de liquidación', 8),
  ('11', 'Facturas de exportación', 9),
  ('14', 'Factura de sujeto excluido', 10),
  ('15', 'Comprobante de donación', 11),
  ('17', 'Evento de Operaciones Especiales', 12),
  ('18', 'Evento de Retorno', 13)
;

-- --------------------------------------------------
-- CAT-003 Modelo de Facturación — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_003_modelo_facturacion (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_003_modelo_facturacion_codigo ON cat_003_modelo_facturacion (codigo);

INSERT INTO cat_003_modelo_facturacion (codigo, descripcion, orden) VALUES
  ('1', 'Modelo Facturación previo', 1),
  ('2', 'Modelo Facturación diferido', 2)
;

-- --------------------------------------------------
-- CAT-004 Tipo de Transmisión — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_004_tipo_transmision (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_004_tipo_transmision_codigo ON cat_004_tipo_transmision (codigo);

INSERT INTO cat_004_tipo_transmision (codigo, descripcion, orden) VALUES
  ('1', 'Transmisión normal', 1),
  ('2', 'Transmisión por contingencia', 2)
;

-- --------------------------------------------------
-- CAT-005 Tipo de Contingencia — 5 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_005_tipo_contingencia (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_005_tipo_contingencia_codigo ON cat_005_tipo_contingencia (codigo);

INSERT INTO cat_005_tipo_contingencia (codigo, descripcion, orden) VALUES
  ('1', 'No disponibilidad de sistema del MH', 1),
  ('2', 'No disponibilidad de sistema del emisor', 2),
  ('3', 'Falla en el suministro de servicio de Internet del Emisor', 3),
  ('4', 'Falla en el suministro de servicio de energía eléctrica del emisor que impida la transmisión de los DTE', 4),
  ('5', 'Otro (deberá digitar un máximo de 500 caracteres explicando el motivo)', 5)
;

-- --------------------------------------------------
-- CAT-006 Retención IVA MH — 3 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_006_retencion_iva (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_006_retencion_iva_codigo ON cat_006_retencion_iva (codigo);

INSERT INTO cat_006_retencion_iva (codigo, descripcion, orden) VALUES
  ('22', 'Retención IVA 1%', 1),
  ('C4', 'Retención IVA 13%', 2),
  ('C9', 'Otras retenciones IVA casos especiales', 3)
;

-- --------------------------------------------------
-- CAT-007 Tipo de Generación del Documento — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_007_tipo_generacion (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_007_tipo_generacion_codigo ON cat_007_tipo_generacion (codigo);

INSERT INTO cat_007_tipo_generacion (codigo, descripcion, orden) VALUES
  ('1', 'Físico', 1),
  ('2', 'Electrónico', 2)
;

-- --------------------------------------------------
-- CAT-008 Distrito — 263 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_008_distrito (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_008_distrito_codigo ON cat_008_distrito (codigo);

INSERT INTO cat_008_distrito (codigo, descripcion, orden) VALUES
  ('00', 'Otro (Para extranjeros)', 1),
  ('01', 'AHUACHAPÁN', 2),
  ('02', 'APANECA', 3),
  ('03', 'ATIQUIZAYA', 4),
  ('04', 'CONCEPCIÓN DE ATACO', 5),
  ('05', 'EL REFUGIO', 6),
  ('06', 'GUAYMANGO', 7),
  ('07', 'JUJUTLA', 8),
  ('08', 'SAN FRANCISCO MENÉNDEZ', 9),
  ('09', 'SAN LORENZO', 10),
  ('10', 'SAN PEDRO PUXTLA', 11),
  ('11', 'TACUBA', 12),
  ('12', 'TURÍN', 13),
  ('01', 'CANDELARIA DE LA FRONTERA', 14),
  ('02', 'COATEPEQUE', 15),
  ('03', 'CHALCHUAPA', 16),
  ('04', 'EL CONGO', 17),
  ('05', 'EL PORVENIR', 18),
  ('06', 'MASAHUAT', 19),
  ('07', 'METAPÁN', 20),
  ('08', 'SAN ANTONIO PAJONAL', 21),
  ('09', 'SAN SEBASTIÁN SALITRILLO', 22),
  ('10', 'SANTA ANA', 23),
  ('11', 'STA ROSA GUACHI', 24),
  ('12', 'STGO D LA FRONT', 25),
  ('13', 'TEXISTEPEQUE', 26),
  ('01', 'ACAJUTLA', 27),
  ('02', 'ARMENIA', 28),
  ('03', 'CALUCO', 29),
  ('04', 'CUISNAHUAT', 30),
  ('05', 'STA I ISHUATAN', 31),
  ('06', 'IZALCO', 32),
  ('07', 'JUAYÚA', 33),
  ('08', 'NAHUIZALCO', 34),
  ('09', 'NAHULINGO', 35),
  ('10', 'SALCOATITÁN', 36),
  ('11', 'SAN ANTONIO DEL MONTE', 37),
  ('12', 'SAN JULIÁN', 38),
  ('13', 'STA C MASAHUAT', 39),
  ('14', 'SANTO DOMINGO GUZMÁN', 40),
  ('15', 'SONSONATE', 41),
  ('16', 'SONZACATE', 42),
  ('01', 'AGUA CALIENTE', 43),
  ('02', 'ARCATAO', 44),
  ('03', 'AZACUALPA', 45),
  ('04', 'CITALÁ', 46),
  ('05', 'COMALAPA', 47),
  ('06', 'CONCEPCIÓN QUEZALTEPEQUE', 48),
  ('07', 'CHALATENANGO', 49),
  ('08', 'DULCE NOM MARÍA', 50),
  ('09', 'EL CARRIZAL', 51),
  ('10', 'EL PARAÍSO', 52),
  ('11', 'LA LAGUNA', 53),
  ('12', 'LA PALMA', 54),
  ('13', 'LA REINA', 55),
  ('14', 'LAS VUELTAS', 56),
  ('15', 'NOMBRE DE JESUS', 57),
  ('16', 'NVA CONCEPCIÓN', 58),
  ('17', 'NUEVA TRINIDAD', 59),
  ('18', 'OJOS DE AGUA', 60),
  ('19', 'POTONICO', 61),
  ('20', 'SAN ANT LA CRUZ', 62),
  ('21', 'SAN ANT RANCHOS', 63),
  ('22', 'SAN FERNANDO', 64),
  ('23', 'SAN FRANCISCO LEMPA', 65),
  ('24', 'SAN FRANCISCO MORAZÁN', 66),
  ('25', 'SAN IGNACIO', 67),
  ('26', 'SAN I LABRADOR', 68),
  ('27', 'SAN J CANCASQUE', 69),
  ('28', 'SAN JOSE FLORES', 70),
  ('29', 'SAN LUIS CARMEN', 71),
  ('30', 'SN MIG MERCEDES', 72),
  ('31', 'SAN RAFAEL', 73),
  ('32', 'SANTA RITA', 74),
  ('33', 'TEJUTLA', 75),
  ('01', 'ANTGO CUSCATLÁN', 76),
  ('02', 'CIUDAD ARCE', 77),
  ('03', 'COLON', 78),
  ('04', 'COMASAGUA', 79),
  ('05', 'CHILTIUPAN', 80),
  ('06', 'HUIZÚCAR', 81),
  ('07', 'JAYAQUE', 82),
  ('08', 'JICALAPA', 83),
  ('09', 'LA LIBERTAD', 84),
  ('10', 'NUEVO CUSCATLÁN', 85),
  ('11', 'SANTA TECLA', 86),
  ('12', 'QUEZALTEPEQUE', 87),
  ('13', 'SACACOYO', 88),
  ('14', 'SN J VILLANUEVA', 89),
  ('15', 'SAN JUAN OPICO', 90),
  ('16', 'SAN MATÍAS', 91),
  ('17', 'SAN P TACACHICO', 92),
  ('18', 'TAMANIQUE', 93),
  ('19', 'TALNIQUE', 94),
  ('20', 'TEOTEPEQUE', 95),
  ('21', 'TEPECOYO', 96),
  ('22', 'ZARAGOZA', 97),
  ('01', 'AGUILARES', 98),
  ('02', 'APOPA', 99),
  ('03', 'AYUTUXTEPEQUE', 100),
  ('04', 'CUSCATANCINGO', 101),
  ('05', 'EL PAISNAL', 102),
  ('06', 'GUAZAPA', 103),
  ('07', 'ILOPANGO', 104),
  ('08', 'MEJICANOS', 105),
  ('09', 'NEJAPA', 106),
  ('10', 'PANCHIMALCO', 107),
  ('11', 'ROSARIO DE MORA', 108),
  ('12', 'SAN MARCOS', 109),
  ('13', 'SAN MARTIN', 110),
  ('14', 'SAN SALVADOR', 111),
  ('15', 'STG TEXACUANGOS', 112),
  ('16', 'SANTO TOMAS', 113),
  ('17', 'SOYAPANGO', 114),
  ('18', 'TONACATEPEQUE', 115),
  ('19', 'CIUDAD DELGADO', 116),
  ('01', 'CANDELARIA', 117),
  ('02', 'COJUTEPEQUE', 118),
  ('03', 'EL CARMEN', 119),
  ('04', 'EL ROSARIO', 120),
  ('05', 'MONTE SAN JUAN', 121),
  ('06', 'ORAT CONCEPCIÓN', 122),
  ('07', 'SAN B PERULAPIA', 123),
  ('08', 'SAN CRISTÓBAL', 124),
  ('09', 'SAN J GUAYABAL', 125),
  ('10', 'SAN P PERULAPÁN', 126),
  ('11', 'SAN RAF CEDROS', 127),
  ('12', 'SAN RAMON', 128),
  ('13', 'STA C ANALQUITO', 129),
  ('14', 'STA C MICHAPA', 130),
  ('15', 'SUCHITOTO', 131),
  ('16', 'TENANCINGO', 132),
  ('01', 'CUYULTITÁN', 133),
  ('02', 'EL ROSARIO', 134),
  ('03', 'JERUSALÉN', 135),
  ('04', 'MERCED LA CEIBA', 136),
  ('05', 'OLOCUILTA', 137),
  ('06', 'PARAÍSO OSORIO', 138),
  ('07', 'SN ANT MASAHUAT', 139),
  ('08', 'SAN EMIGDIO', 140),
  ('09', 'SN FCO CHINAMEC', 141),
  ('10', 'SAN J NONUALCO', 142),
  ('11', 'SAN JUAN TALPA', 143),
  ('12', 'SAN JUAN TEPEZONTES', 144),
  ('13', 'SAN LUIS TALPA', 145),
  ('14', 'SAN MIGUEL TEPEZONTES', 146),
  ('15', 'SAN PEDRO MASAHUAT', 147),
  ('16', 'SAN PEDRO NONUALCO', 148),
  ('17', 'SAN R OBRAJUELO', 149),
  ('18', 'STA MA OSTUMA', 150),
  ('19', 'STGO NONUALCO', 151),
  ('20', 'TAPALHUACA', 152),
  ('21', 'ZACATECOLUCA', 153),
  ('22', 'SN LUIS LA HERR', 154),
  ('01', 'CINQUERA', 155),
  ('02', 'GUACOTECTI', 156),
  ('03', 'ILOBASCO', 157),
  ('04', 'JUTIAPA', 158),
  ('05', 'SAN ISIDRO', 159),
  ('06', 'SENSUNTEPEQUE', 160),
  ('07', 'TEJUTEPEQUE', 161),
  ('08', 'VICTORIA', 162),
  ('09', 'DOLORES', 163),
  ('01', 'APASTEPEQUE', 164),
  ('02', 'GUADALUPE', 165),
  ('03', 'SAN CAY ISTEPEQ', 166),
  ('04', 'SANTA CLARA', 167),
  ('05', 'SANTO DOMINGO', 168),
  ('06', 'SN EST CATARINA', 169),
  ('07', 'SAN ILDEFONSO', 170),
  ('08', 'SAN LORENZO', 171),
  ('09', 'SAN SEBASTIÁN', 172),
  ('10', 'SAN VICENTE', 173),
  ('11', 'TECOLUCA', 174),
  ('12', 'TEPETITÁN', 175),
  ('13', 'VERAPAZ', 176),
  ('01', 'ALEGRÍA', 177),
  ('02', 'BERLÍN', 178),
  ('03', 'CALIFORNIA', 179),
  ('04', 'CONCEP BATRES', 180),
  ('05', 'EL TRIUNFO', 181),
  ('06', 'EREGUAYQUÍN', 182),
  ('07', 'ESTANZUELAS', 183),
  ('08', 'JIQUILISCO', 184),
  ('09', 'JUCUAPA', 185),
  ('10', 'JUCUARÁN', 186),
  ('11', 'MERCEDES UMAÑA', 187),
  ('12', 'NUEVA GRANADA', 188),
  ('13', 'OZATLÁN', 189),
  ('14', 'PTO EL TRIUNFO', 190),
  ('15', 'SAN AGUSTÍN', 191),
  ('16', 'SN BUENAVENTURA', 192),
  ('17', 'SAN DIONISIO', 193),
  ('18', 'SANTA ELENA', 194),
  ('19', 'SAN FCO JAVIER', 195),
  ('20', 'SANTA MARÍA', 196),
  ('21', 'STGO DE MARÍA', 197),
  ('22', 'TECAPÁN', 198),
  ('23', 'USULUTÁN', 199),
  ('01', 'CAROLINA', 200),
  ('02', 'CIUDAD BARRIOS', 201),
  ('03', 'COMACARÁN', 202),
  ('04', 'CHAPELTIQUE', 203),
  ('05', 'CHINAMECA', 204),
  ('06', 'CHIRILAGUA', 205),
  ('07', 'EL TRANSITO', 206),
  ('08', 'LOLOTIQUE', 207),
  ('09', 'MONCAGUA', 208),
  ('10', 'NUEVA GUADALUPE', 209),
  ('11', 'NVO EDÉN S JUAN', 210),
  ('12', 'QUELEPA', 211),
  ('13', 'SAN ANT D MOSCO', 212),
  ('14', 'SAN GERARDO', 213),
  ('15', 'SAN JORGE', 214),
  ('16', 'SAN LUIS REINA', 215),
  ('17', 'SAN MIGUEL', 216),
  ('18', 'SAN RAF ORIENTE', 217),
  ('19', 'SESORI', 218),
  ('20', 'ULUAZAPA', 219),
  ('01', 'ARAMBALA', 220),
  ('02', 'CACAOPERA', 221),
  ('03', 'CORINTO', 222),
  ('04', 'CHILANGA', 223),
  ('05', 'DELIC DE CONCEP', 224),
  ('06', 'EL DIVISADERO', 225),
  ('07', 'EL ROSARIO', 226),
  ('08', 'GUALOCOCTI', 227),
  ('09', 'GUATAJIAGUA', 228),
  ('10', 'JOATECA', 229),
  ('11', 'JOCOAITIQUE', 230),
  ('12', 'JOCORO', 231),
  ('13', 'LOLOTIQUILLO', 232),
  ('14', 'MEANGUERA', 233),
  ('15', 'OSICALA', 234),
  ('16', 'PERQUÍN', 235),
  ('17', 'SAN CARLOS', 236),
  ('18', 'SAN FERNANDO', 237),
  ('19', 'SAN FCO GOTERA', 238),
  ('20', 'SAN ISIDRO', 239),
  ('21', 'SAN SIMÓN', 240),
  ('22', 'SENSEMBRA', 241),
  ('23', 'SOCIEDAD', 242),
  ('24', 'TOROLA', 243),
  ('25', 'YAMABAL', 244),
  ('26', 'YOLOAIQUÍN', 245),
  ('01', 'ANAMOROS', 246),
  ('02', 'BOLÍVAR', 247),
  ('03', 'CONCEP DE OTE', 248),
  ('04', 'CONCHAGUA', 249),
  ('05', 'EL CARMEN', 250),
  ('06', 'EL SAUCE', 251),
  ('07', 'INTIPUCÁ', 252),
  ('08', 'LA UNIÓN', 253),
  ('09', 'LISLIQUE', 254),
  ('10', 'MEANG DEL GOLFO', 255),
  ('11', 'NUEVA ESPARTA', 256),
  ('12', 'PASAQUINA', 257),
  ('13', 'POLORÓS', 258),
  ('14', 'SAN ALEJO', 259),
  ('15', 'SAN JOSE', 260),
  ('16', 'SANTA ROSA LIMA', 261),
  ('17', 'YAYANTIQUE', 262),
  ('18', 'YUCUAIQUÍN', 263)
;

-- --------------------------------------------------
-- CAT-009 Tipo de establecimiento — 4 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_009_tipo_establecimiento (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_009_tipo_establecimiento_codigo ON cat_009_tipo_establecimiento (codigo);

INSERT INTO cat_009_tipo_establecimiento (codigo, descripcion, orden) VALUES
  ('01', 'Sucursal', 1),
  ('02', 'Casa Matriz', 2),
  ('04', 'Bodega', 3),
  ('07', 'Patio', 4)
;

-- --------------------------------------------------
-- CAT-010 Código tipo de Servicio (Médico) — 6 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_010_tipo_servicio_medico (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_010_tipo_servicio_medico_codigo ON cat_010_tipo_servicio_medico (codigo);

INSERT INTO cat_010_tipo_servicio_medico (codigo, descripcion, orden) VALUES
  ('1', 'Cirugía', 1),
  ('2', 'Operación', 2),
  ('3', 'Tratamiento médico', 3),
  ('4', 'Cirugía instituto salvadoreño de Bienestar Magisterial', 4),
  ('5', 'Operación Instituto Salvadoreño de Bienestar Magisterial', 5),
  ('6', 'Tratamiento médico Instituto Salvadoreño de Bienestar Magisterial', 6)
;

-- --------------------------------------------------
-- CAT-011 Tipo de ítem — 4 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_011_tipo_item (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_011_tipo_item_codigo ON cat_011_tipo_item (codigo);

INSERT INTO cat_011_tipo_item (codigo, descripcion, orden) VALUES
  ('1', 'Bienes', 1),
  ('2', 'Servicios', 2),
  ('3', 'Ambos (Bienes y Servicios, incluye los dos inherente a los Productos o servicios)', 3),
  ('4', 'Otros tributos por ítem', 4)
;

-- --------------------------------------------------
-- CAT-012 Departamento — 15 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_012_departamento (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_012_departamento_codigo ON cat_012_departamento (codigo);

INSERT INTO cat_012_departamento (codigo, descripcion, orden) VALUES
  ('00', 'Otro (Para extranjeros)', 1),
  ('01', 'Ahuachapán', 2),
  ('02', 'Santa Ana', 3),
  ('03', 'Sonsonate', 4),
  ('04', 'Chalatenango', 5),
  ('05', 'La Libertad', 6),
  ('06', 'San Salvador', 7),
  ('07', 'Cuscatlán', 8),
  ('08', 'La Paz', 9),
  ('09', 'Cabañas', 10),
  ('10', 'San Vicente', 11),
  ('11', 'Usulután', 12),
  ('12', 'San Miguel', 13),
  ('13', 'Morazán', 14),
  ('14', 'La Unión', 15)
;

-- --------------------------------------------------
-- CAT-013 Municipio — 45 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_013_municipio (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_013_municipio_codigo ON cat_013_municipio (codigo);

INSERT INTO cat_013_municipio (codigo, descripcion, orden) VALUES
  ('00', 'Otro (Para extranjeros)', 1),
  ('13', 'AHUACHAPAN NORTE', 2),
  ('14', 'AHUACHAPAN CENTRO', 3),
  ('15', 'AHUACHAPAN SUR', 4),
  ('14', 'SANTA ANA NORTE', 5),
  ('15', 'SANTA ANA CENTRO', 6),
  ('16', 'SANTA ANA ESTE', 7),
  ('17', 'SANTA ANA OESTE', 8),
  ('17', 'SONSONATE NORTE', 9),
  ('18', 'SONSONATE CENTRO', 10),
  ('19', 'SONSONATE ESTE', 11),
  ('20', 'SONSONATE OESTE', 12),
  ('34', 'CHALATENANGO NORTE', 13),
  ('35', 'CHALATENANGO CENTRO', 14),
  ('36', 'CHALATENANGO SUR', 15),
  ('23', 'LA LIBERTAD NORTE', 16),
  ('24', 'LA LIBERTAD CENTRO', 17),
  ('25', 'LA LIBERTAD OESTE', 18),
  ('26', 'LA LIBERTAD ESTE', 19),
  ('27', 'LA LIBERTAD COSTA', 20),
  ('28', 'LA LIBERTAD SUR', 21),
  ('20', 'SAN SALVADOR NORTE', 22),
  ('21', 'SAN SALVADOR OESTE', 23),
  ('22', 'SAN SALVADOR ESTE', 24),
  ('23', 'SAN SALVADOR CENTRO', 25),
  ('24', 'SAN SALVADOR SUR', 26),
  ('17', 'CUSCATLAN NORTE', 27),
  ('18', 'CUSCATLAN SUR', 28),
  ('23', 'LA PAZ OESTE', 29),
  ('24', 'LA PAZ CENTRO', 30),
  ('25', 'LA PAZ ESTE', 31),
  ('10', 'CABAÑAS ESTE', 32),
  ('11', 'CABAÑAS OESTE', 33),
  ('14', 'SAN VICENTE NORTE', 34),
  ('15', 'SAN VICENTE SUR', 35),
  ('24', 'USULUTAN NORTE', 36),
  ('25', 'USULUTAN ESTE', 37),
  ('26', 'USULUTAN OESTE', 38),
  ('21', 'SAN MIGUEL NORTE', 39),
  ('22', 'SAN MIGUEL CENTRO', 40),
  ('23', 'SAN MIGUEL OESTE', 41),
  ('27', 'MORAZAN NORTE', 42),
  ('28', 'MORAZAN SUR', 43),
  ('19', 'LA UNION NORTE', 44),
  ('20', 'LA UNION SUR', 45)
;

-- --------------------------------------------------
-- CAT-014 Unidad de Medida   — 40 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_014_unidad_medida (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_014_unidad_medida_codigo ON cat_014_unidad_medida (codigo);

INSERT INTO cat_014_unidad_medida (codigo, descripcion, orden) VALUES
  ('1', 'metro', 1),
  ('2', 'Yarda 1', 2),
  ('6', 'milímetro', 3),
  ('9', 'kilómetro cuadrado', 4),
  ('10', 'Hectárea', 5),
  ('13', 'metro cuadrado', 6),
  ('15', 'Vara cuadrada 2', 7),
  ('18', 'metro cúbico', 8),
  ('20', 'Barril 3', 9),
  ('22', 'Galón 1, 4', 10),
  ('23', 'Litro', 11),
  ('24', 'Botella', 12),
  ('26', 'Mililitro', 13),
  ('30', 'Tonelada', 14),
  ('32', 'Quintal 1', 15),
  ('33', 'Arroba 1', 16),
  ('34', 'Kilogramo', 17),
  ('36', 'Libra 1', 18),
  ('37', 'Onza troy 5', 19),
  ('38', 'Onza 1', 20),
  ('39', 'Gramo', 21),
  ('40', 'Miligramo', 22),
  ('42', 'Megawatt', 23),
  ('43', 'Kilowatt', 24),
  ('44', 'Watt', 25),
  ('45', 'Megavoltio-amperio', 26),
  ('46', 'Kilovoltio-amperio', 27),
  ('47', 'Voltio-amperio', 28),
  ('49', 'Gigawatt-hora', 29),
  ('50', 'Megawatt-hora', 30),
  ('51', 'Kilowatt-hora', 31),
  ('52', 'Watt-hora', 32),
  ('53', 'Kilovoltio', 33),
  ('54', 'Voltio', 34),
  ('55', 'Millar', 35),
  ('56', 'Medio millar', 36),
  ('57', 'Ciento', 37),
  ('58', 'Docena', 38),
  ('59', 'Unidad', 39),
  ('99', 'Otra 6', 40)
;

-- --------------------------------------------------
-- CAT-015 Tributos — 49 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_015_tributos (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_015_tributos_codigo ON cat_015_tributos (codigo);

INSERT INTO cat_015_tributos (codigo, descripcion, orden) VALUES
  ('20', 'Impuesto al Valor Agregado 13%', 1),
  ('C3', 'Impuesto al Valor Agregado (exportaciones) 0%', 2),
  ('59', 'Turismo: por alojamiento (5%)', 3),
  ('71', 'Turismo: salida del país por vía aérea $7.00', 4),
  ('D1', 'FOVIAL ($0.20 Ctvs. por galón)', 5),
  ('C8', 'COTRANS ($0.10 Ctvs. por galón)', 6),
  ('D5', 'Otras tasas casos especiales', 7),
  ('D4', 'Otros impuestos casos especiales', 8),
  ('A8', 'Impuesto Especial al Combustible (0%, 0.5%, 1%)', 9),
  ('57', 'Impuesto industria de Cemento', 10),
  ('90', 'Impuesto especial a la primera matrícula', 11),
  ('D4', 'Otros impuestos casos especiales', 12),
  ('D5', 'Otras tasas casos especiales', 13),
  ('A6', 'Impuesto ad- valorem, armas de fuego, municiones explosivas y artículos similares', 14),
  ('C5', 'Impuesto ad- valorem por diferencial de precios de bebidas alcohólicas (8%)', 15),
  ('C6', 'Impuesto ad- valorem por diferencial de precios al tabaco cigarrillos (39%)', 16),
  ('C7', 'Impuesto ad- valorem por diferencial de precios al tabaco cigarros (100%)', 17),
  ('19', 'Fabricante de Bebidas Gaseosas, Isotónicas, Deportivas, Fortificantes, Energizante o Estimulante', 18),
  ('28', 'Importador de Bebidas Gaseosas, Isotónicas, Deportivas, Fortificantes, Energizante o Estimulante', 19),
  ('31', 'Detallistas o Expendedores de Bebidas Alcohólicas', 20),
  ('32', 'Fabricante de Cerveza', 21),
  ('33', 'Importador de Cerveza', 22),
  ('34', 'Fabricante de Productos de Tabaco', 23),
  ('35', 'Importador de Productos de Tabaco', 24),
  ('36', 'Fabricante de Armas de Fuego, Municiones y Artículos Similares', 25),
  ('37', 'Importador de Arma de Fuego, Munición y Artículos. Similares', 26),
  ('38', 'Fabricante de Explosivos', 27),
  ('39', 'Importador de Explosivos', 28),
  ('42', 'Fabricante de Productos Pirotécnicos', 29),
  ('43', 'Importador de Productos Pirotécnicos', 30),
  ('44', 'Productor de Tabaco', 31),
  ('50', 'Distribuidor de Bebidas Gaseosas, Isotónicas, Deportivas, Fortificantes, Energizante o Estimulante', 32),
  ('51', 'Bebidas Alcohólicas', 33),
  ('52', 'Cerveza', 34),
  ('53', 'Productos del Tabaco', 35),
  ('54', 'Bebidas Carbonatadas o Gaseosas Simples o Endulzadas', 36),
  ('55', 'Otros Específicos', 37),
  ('58', 'Alcohol', 38),
  ('77', 'Importador de Jugos, Néctares, Bebidas con Jugo y Refrescos', 39),
  ('78', 'Distribuidor de Jugos, Néctares, Bebidas con Jugo y Refrescos', 40),
  ('79', 'Sobre Llamadas Telefónicas Provenientes del Ext.', 41),
  ('85', 'Detallista de Jugos, Néctares, Bebidas con Jugo y Refrescos', 42),
  ('86', 'Fabricante de Preparaciones Concentradas o en Polvo para la Elaboración de Bebidas', 43),
  ('91', 'Fabricante de Jugos, Néctares, Bebidas con Jugo y Refrescos', 44),
  ('92', 'Importador de Preparaciones Concentradas o en Polvo para la Elaboración de Bebidas', 45),
  ('A1', 'Específicos y Ad-Valorem', 46),
  ('A5', 'Bebidas Gaseosas, Isotónicas, Deportivas, Fortificantes, Energizantes o Estimulantes', 47),
  ('A7', 'Alcohol Etílico', 48),
  ('A9', 'Sacos Sintéticos', 49)
;

-- --------------------------------------------------
-- CAT-016 Condición de la Operación — 3 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_016_condicion_operacion (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_016_condicion_operacion_codigo ON cat_016_condicion_operacion (codigo);

INSERT INTO cat_016_condicion_operacion (codigo, descripcion, orden) VALUES
  ('1', 'Contado', 1),
  ('2', 'A crédito', 2),
  ('3', 'Otro', 3)
;

-- --------------------------------------------------
-- CAT-017 Forma de Pago — 12 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_017_forma_pago (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_017_forma_pago_codigo ON cat_017_forma_pago (codigo);

INSERT INTO cat_017_forma_pago (codigo, descripcion, orden) VALUES
  ('01', 'Billetes y monedas', 1),
  ('02', 'Tarjeta Débito', 2),
  ('03', 'Tarjeta Crédito', 3),
  ('04', 'Cheque', 4),
  ('05', 'Transferencia-Depósito Bancario', 5),
  ('08', 'Dinero electrónico', 6),
  ('09', 'Monedero electrónico', 7),
  ('11', 'Bitcoin', 8),
  ('12', 'Otras Criptomonedas', 9),
  ('13', 'Cuentas por pagar del receptor', 10),
  ('14', 'Giro bancario', 11),
  ('99', 'Otros (se debe indicar el medio de pago)', 12)
;

-- --------------------------------------------------
-- CAT-018 Plazo — 3 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_018_plazo (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_018_plazo_codigo ON cat_018_plazo (codigo);

INSERT INTO cat_018_plazo (codigo, descripcion, orden) VALUES
  ('01', 'Días', 1),
  ('02', 'Meses', 2),
  ('03', 'Años', 3)
;

-- --------------------------------------------------
-- CAT-019 Código de Actividad Económica — 774 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_019_actividad_economica (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_019_actividad_economica_codigo ON cat_019_actividad_economica (codigo);

INSERT INTO cat_019_actividad_economica (codigo, descripcion, orden) VALUES
  ('01111', 'Cultivo de cereales excepto arroz y para forrajes', 1),
  ('01112', 'Cultivo de legumbres', 2),
  ('01113', 'Cultivo de semillas oleaginosas', 3),
  ('01114', 'Cultivo de plantas para la preparación de semillas', 4),
  ('01119', 'Cultivo de otros cereales excepto arroz y forrajeros n.c.p.', 5),
  ('01120', 'Cultivo de arroz', 6),
  ('01131', 'Cultivo de raíces y tubérculos', 7),
  ('01132', 'Cultivo de brotes, bulbos, vegetales tubérculos y cultivos similares', 8),
  ('01133', 'Cultivo hortícola de fruto', 9),
  ('01134', 'Cultivo de hortalizas de hoja y otras hortalizas ncp', 10),
  ('01140', 'Cultivo de caña de azúcar', 11),
  ('01150', 'Cultivo de tabaco', 12),
  ('01161', 'Cultivo de algodón', 13),
  ('01162', 'Cultivo de fibras vegetales excepto algodón', 14),
  ('01191', 'Cultivo de plantas no perennes para la producción de semillas y flores', 15),
  ('01192', 'Cultivo de cereales y pastos para la alimentación animal', 16),
  ('01199', 'Producción de cultivos no estacionales ncp', 17),
  ('01220', 'Cultivo de frutas tropicales', 18),
  ('01230', 'Cultivo de cítricos', 19),
  ('01240', 'Cultivo de frutas de pepita y hueso', 20),
  ('01251', 'Cultivo de frutas ncp', 21),
  ('01252', 'Cultivo de otros frutos y nueces de árboles y arbustos', 22),
  ('01260', 'Cultivo de frutos oleaginosos', 23),
  ('01271', 'Cultivo de café', 24),
  ('01272', 'Cultivo de plantas para la elaboración de bebidas excepto café', 25),
  ('01281', 'Cultivo de especias y aromáticas', 26),
  ('01282', 'Cultivo de plantas para la obtención de productos medicinales y farmacéuticos', 27),
  ('01291', 'Cultivo de árboles de hule (caucho) para la obtención de látex', 28),
  ('01292', 'Cultivo de plantas para la obtención de productos químicos y colorantes', 29),
  ('01299', 'Producción de cultivos perennes ncp', 30),
  ('01300', 'Propagación de plantas', 31),
  ('01301', 'Cultivo de plantas y flores ornamentales', 32),
  ('01410', 'Cría y engorde de ganado bovino', 33),
  ('01420', 'Cría de caballos y otros equinos', 34),
  ('01440', 'Cría de ovejas y cabras', 35),
  ('01450', 'Cría de cerdos', 36),
  ('01460', 'Cría de aves de corral y producción de huevos', 37),
  ('01491', 'Cría de abejas apicultura para la obtención de miel y otros productos apícolas', 38),
  ('01492', 'Cría de conejos', 39),
  ('01493', 'Cría de iguanas y garrobos', 40),
  ('01494', 'Cría de mariposas y otros insectos', 41),
  ('01499', 'Cría y obtención de productos animales n.c.p.', 42),
  ('01500', 'Cultivo de productos agrícolas en combinación con la cría de animales', 43),
  ('01611', 'Servicios de maquinaria agrícola', 44),
  ('01612', 'Control de plagas', 45),
  ('01613', 'Servicios de riego', 46),
  ('01614', 'Servicios de contratación de mano de obra para la agricultura', 47),
  ('01619', 'Servicios agrícolas ncp', 48),
  ('01621', 'Actividades para mejorar la reproducción, el crecimiento y el rendimiento de los animales y sus productos', 49),
  ('01622', 'Servicios de mano de obra pecuaria', 50),
  ('01629', 'Servicios pecuarios ncp', 51),
  ('01631', 'Labores post cosecha de preparación de los productos agrícolas para su comercialización o para la industria', 52),
  ('01632', 'Servicio de beneficio de café', 53),
  ('01633', 'Servicio de beneficiado de plantas textiles (incluye el beneficiado cuando este es realizado en la misma explotación agropecuaria)', 54),
  ('01640', 'Tratamiento de semillas para la propagación', 55),
  ('01700', 'Caza ordinaria y mediante trampas, repoblación de animales de caza y servicios conexos', 56),
  ('02100', 'Silvicultura y otras actividades forestales', 57),
  ('02200', 'Extracción de madera', 58),
  ('02300', 'Recolección de productos diferentes a la madera', 59),
  ('02400', 'Servicios de apoyo a la silvicultura', 60),
  ('03110', 'Pesca marítima de altura y costera', 61),
  ('03120', 'Pesca de agua dulce', 62),
  ('03210', 'Acuicultura marítima', 63),
  ('03220', 'Acuicultura de agua dulce', 64),
  ('03300', 'Servicios de apoyo a la pesca y acuicultura', 65),
  ('05100', 'Extracción de hulla', 66),
  ('05200', 'Extracción y aglomeración de lignito', 67),
  ('06100', 'Extracción de petróleo crudo', 68),
  ('06200', 'Extracción de gas natural', 69),
  ('07100', 'Extracción de minerales de hierro', 70),
  ('07210', 'Extracción de minerales de uranio y torio', 71),
  ('07290', 'Extracción de minerales metalíferos no ferrosos', 72),
  ('08100', 'Extracción de piedra, arena y arcilla', 73),
  ('08910', 'Extracción de minerales para la fabricación de abonos y productos químicos', 74),
  ('08920', 'Extracción y aglomeración de turba', 75),
  ('08930', 'Extracción de sal', 76),
  ('08990', 'Explotación de otras minas y canteras ncp', 77),
  ('09100', 'Actividades de apoyo a la extracción de petróleo y gas natural', 78),
  ('09900', 'Actividades de apoyo a la explotación de minas y canteras', 79),
  ('10101', 'Servicio de rastros y mataderos de bovinos y porcinos', 80),
  ('10102', 'Matanza y procesamiento de bovinos y porcinos', 81),
  ('10103', 'Matanza y procesamientos de aves de corral', 82),
  ('10104', 'Elaboración y conservación de embutidos y tripas naturales', 83),
  ('10105', 'Servicios de conservación y empaque de carnes', 84),
  ('10106', 'Elaboración y conservación de grasas y aceites animales', 85),
  ('10107', 'Servicios de molienda de carne', 86),
  ('10108', 'Elaboración de productos de carne ncp', 87),
  ('10201', 'Procesamiento y conservación de pescado, crustáceos y moluscos', 88),
  ('10209', 'Fabricación de productos de pescado ncp', 89),
  ('10301', 'Elaboración de jugos de frutas y hortalizas', 90),
  ('10302', 'Elaboración y envase de jaleas, mermeladas y frutas deshidratadas', 91),
  ('10309', 'Elaboración de productos de frutas y hortalizas n.c.p.', 92),
  ('10401', 'Fabricación de aceites y grasas vegetales y animales comestibles', 93),
  ('10402', 'Fabricación de aceites y grasas vegetales y animales no comestibles', 94),
  ('10409', 'Servicio de maquilado de aceites', 95),
  ('10501', 'Fabricación de productos lácteos excepto sorbetes y quesos sustitutos', 96),
  ('10502', 'Fabricación de sorbetes y helados', 97),
  ('10503', 'Fabricación de quesos', 98),
  ('10611', 'Molienda de cereales', 99),
  ('10612', 'Elaboración de cereales para el desayuno y similares', 100),
  ('10613', 'Servicios de beneficiado de productos agrícolas ncp (excluye Beneficio de azúcar rama 1072 y beneficio de café rama 0163)', 101),
  ('10621', 'Fabricación de almidón', 102),
  ('10628', 'Servicio de molienda de maíz húmedo molino para nixtamal', 103),
  ('10711', 'Elaboración de tortillas', 104),
  ('10712', 'Fabricación de pan, galletas y barquillos', 105),
  ('10713', 'Fabricación de repostería', 106),
  ('10721', 'Ingenios azucareros', 107),
  ('10722', 'Molienda de caña de azúcar para la elaboración de dulces', 108),
  ('10723', 'Elaboración de jarabes de azúcar y otros similares', 109),
  ('10724', 'Maquilado de azúcar de caña', 110),
  ('10730', 'Fabricación de cacao, chocolates y productos de confitería', 111),
  ('10740', 'Elaboración de macarrones, fideos, y productos farináceos similares', 112),
  ('10750', 'Elaboración de comidas y platos preparados para la reventa en locales y/o para exportación', 113),
  ('10791', 'Elaboración de productos de café', 114),
  ('10792', 'Elaboración de especies, sazonadores y condimentos', 115),
  ('10793', 'Elaboración de sopas, cremas y consomé', 116),
  ('10794', 'Fabricación de bocadillos tostados y/o fritos', 117),
  ('10799', 'Elaboración de productos alimenticios ncp', 118),
  ('10800', 'Elaboración de alimentos preparados para animales', 119),
  ('11012', 'Fabricación de aguardiente y licores', 120),
  ('11020', 'Elaboración de vinos', 121),
  ('11030', 'Fabricación de cerveza', 122),
  ('11041', 'Fabricación de aguas gaseosas', 123),
  ('11042', 'Fabricación y envasado de agua', 124),
  ('11043', 'Elaboración de refrescos', 125),
  ('11048', 'Maquilado de aguas gaseosas', 126),
  ('11049', 'Elaboración de bebidas no alcohólicas', 127),
  ('12000', 'Elaboración de productos de tabaco', 128),
  ('13111', 'Preparación de fibras textiles', 129),
  ('13112', 'Fabricación de hilados', 130),
  ('13120', 'Fabricación de telas', 131),
  ('13130', 'Acabado de productos textiles', 132),
  ('13910', 'Fabricación de tejidos de punto y ganchillo', 133),
  ('13921', 'Fabricación de productos textiles para el hogar', 134),
  ('13922', 'Sacos, bolsas y otros artículos textiles', 135),
  ('13929', 'Fabricación de artículos confeccionados con materiales textiles, excepto prendas de vestir n.c.p', 136),
  ('13930', 'Fabricación de tapices y alfombras', 137),
  ('13941', 'Fabricación de cuerdas de henequén y otras fibras naturales (lazos, pitas)', 138),
  ('13942', 'Fabricación de redes de diversos materiales', 139),
  ('13948', 'Maquilado de productos trenzables de cualquier material (petates, sillas, etc.)', 140),
  ('13991', 'Fabricación de adornos, etiquetas y otros artículos para prendas de vestir', 141),
  ('13992', 'Servicio de bordados en artículos y prendas de tela', 142),
  ('13999', 'Fabricación de productos textiles ncp', 143),
  ('14101', 'Fabricación de ropa interior, para dormir y similares', 144),
  ('14102', 'Fabricación de ropa para niños', 145),
  ('14103', 'Fabricación de prendas de vestir para ambos sexos', 146),
  ('14104', 'Confección de prendas a medida', 147),
  ('14105', 'Fabricación de prendas de vestir para deportes', 148),
  ('14106', 'Elaboración de artesanías de uso personal confeccionadas especialmente de materiales textiles', 149),
  ('14108', 'Maquilado de prendas de vestir, accesorios y otros', 150),
  ('14109', 'Fabricación de prendas y accesorios de vestir n.c.p.', 151),
  ('14200', 'Fabricación de artículos de piel', 152),
  ('14301', 'Fabricación de calcetines, calcetas, medias (panty house) y otros similares', 153),
  ('14302', 'Fabricación de ropa interior de tejido de punto', 154),
  ('14309', 'Fabricación de prendas de vestir de tejido de punto ncp', 155),
  ('15110', 'Curtido y adobo de cueros; adobo y teñido de pieles', 156),
  ('15121', 'Fabricación de maletas, bolsos de mano y otros artículos de marroquinería', 157),
  ('15122', 'Fabricación de monturas, accesorios y vainas talabartería', 158),
  ('15123', 'Fabricación de artesanías principalmente de cuero natural y sintético', 159),
  ('15128', 'Maquilado de artículos de cuero natural, sintético y de otros materiales', 160),
  ('15201', 'Fabricación de calzado', 161),
  ('15202', 'Fabricación de partes y accesorios de calzado', 162),
  ('15208', 'Maquilado de partes y accesorios de calzado', 163),
  ('16100', 'Aserradero y acepilladura de madera', 164),
  ('16210', 'Fabricación de madera laminada, terciada, enchapada y contrachapada, paneles para la construcción', 165),
  ('16220', 'Fabricación de partes y piezas de carpintería para edificios y construcciones', 166),
  ('16230', 'Fabricación de envases y recipientes de madera', 167),
  ('16292', 'Fabricación de artesanías de madera, semillas, materiales trenzables', 168),
  ('16299', 'Fabricación de productos de madera, corcho, paja y materiales trenzables ncp', 169),
  ('17010', 'Fabricación de pasta de madera, papel y cartón', 170),
  ('17020', 'Fabricación de papel y cartón ondulado y envases de papel y cartón', 171),
  ('17091', 'Fabricación de artículos de papel y cartón de uso personal y doméstico', 172),
  ('17092', 'Fabricación de productos de papel ncp', 173),
  ('18110', 'Impresión', 174),
  ('18120', 'Servicios relacionados con la impresión', 175),
  ('18200', 'Reproducción de grabaciones', 176),
  ('19100', 'Fabricación de productos de hornos de coque', 177),
  ('19201', 'Fabricación de combustible', 178),
  ('19202', 'Fabricación de aceites y lubricantes', 179),
  ('20111', 'Fabricación de materias primas para la fabricación de colorantes', 180),
  ('20112', 'Fabricación de materiales curtientes', 181),
  ('20113', 'Fabricación de gases industriales', 182),
  ('20114', 'Fabricación de alcohol etílico', 183),
  ('20119', 'Fabricación de sustancias químicas básicas', 184),
  ('20120', 'Fabricación de abonos y fertilizantes', 185),
  ('20130', 'Fabricación de plástico y caucho en formas primarias', 186),
  ('20210', 'Fabricación de plaguicidas y otros productos químicos de uso agropecuario', 187),
  ('20220', 'Fabricación de pinturas, barnices y productos de revestimiento similares; tintas de imprenta y masillas', 188),
  ('20231', 'Fabricación de jabones, detergentes y similares para limpieza', 189),
  ('20232', 'Fabricación de perfumes, cosméticos y productos de higiene y cuidado personal, incluyendo tintes, champú, etc.', 190),
  ('20291', 'Fabricación de tintas y colores para escribir y pintar; fabricación de cintas para impresoras', 191),
  ('20292', 'Fabricación de productos pirotécnicos, explosivos y municiones', 192),
  ('20299', 'Fabricación de productos químicos n.c.p.', 193),
  ('20300', 'Fabricación de fibras artificiales', 194),
  ('21001', 'Manufactura de productos farmacéuticos, sustancias químicas y productos botánicos', 195),
  ('21008', 'Maquilado de medicamentos', 196),
  ('22110', 'Fabricación de cubiertas y cámaras; renovación y recauchutado de cubiertas', 197),
  ('22190', 'Fabricación de otros productos de caucho', 198),
  ('22201', 'Fabricación de envases plásticos', 199),
  ('22202', 'Fabricación de productos plásticos para uso personal o doméstico', 200),
  ('22208', 'Maquila de plásticos', 201),
  ('22209', 'Fabricación de productos plásticos n.c.p.', 202),
  ('23101', 'Fabricación de vidrio', 203),
  ('23102', 'Fabricación de recipientes y envases de vidrio', 204),
  ('23108', 'Servicio de maquilado', 205),
  ('23109', 'Fabricación de productos de vidrio ncp', 206),
  ('23910', 'Fabricación de productos refractarios', 207),
  ('23920', 'Fabricación de productos de arcilla para la construcción', 208),
  ('23931', 'Fabricación de productos de cerámica y porcelana no refractaria', 209),
  ('23932', 'Fabricación de productos de cerámica y porcelana ncp', 210),
  ('23940', 'Fabricación de cemento, cal y yeso', 211),
  ('23950', 'Fabricación de artículos de hormigón, cemento y yeso', 212),
  ('23960', 'Corte, tallado y acabado de la piedra', 213),
  ('23990', 'Fabricación de productos minerales no metálicos ncp', 214),
  ('24100', 'Industrias básicas de hierro y acero', 215),
  ('24200', 'Fabricación de productos primarios de metales preciosos y metales no ferrosos', 216),
  ('24310', 'Fundición de hierro y acero', 217),
  ('24320', 'Fundición de metales no ferrosos', 218),
  ('25111', 'Fabricación de productos metálicos para uso estructural', 219),
  ('25118', 'Servicio de maquila para la fabricación de estructuras metálicas', 220),
  ('25120', 'Fabricación de tanques, depósitos y recipientes de metal', 221),
  ('25130', 'Fabricación de generadores de vapor, excepto calderas de agua caliente para calefacción central', 222),
  ('25200', 'Fabricación de armas y municiones', 223),
  ('25910', 'Forjado, prensado, estampado y laminado de metales; pulvimetalurgia', 224),
  ('25920', 'Tratamiento y revestimiento de metales', 225),
  ('25930', 'Fabricación de artículos de cuchillería, herramientas de mano y artículos de ferretería', 226),
  ('25991', 'Fabricación de envases y artículos conexos de metal', 227),
  ('25992', 'Fabricación de artículos metálicos de uso personal y/o doméstico', 228),
  ('25999', 'Fabricación de productos elaborados de metal ncp', 229),
  ('26100', 'Fabricación de componentes electrónicos', 230),
  ('26200', 'Fabricación de computadoras y equipo conexo', 231),
  ('26300', 'Fabricación de equipo de comunicaciones', 232),
  ('26400', 'Fabricación de aparatos electrónicos de consumo para audio, video radio y televisión', 233),
  ('26510', 'Fabricación de instrumentos y aparatos para medir, verificar, ensayar, navegar y de control de procesos industriales', 234),
  ('26520', 'Fabricación de relojes y piezas de relojes', 235),
  ('26600', 'Fabricación de equipo médico de irradiación y equipo electrónico de uso médico y terapéutico', 236),
  ('26700', 'Fabricación de instrumentos de óptica y equipo fotográfico', 237),
  ('26800', 'Fabricación de medios magnéticos y ópticos', 238),
  ('27100', 'Fabricación de motores, generadores, transformadores eléctricos, aparatos de distribución y control de electricidad', 239),
  ('27200', 'Fabricación de pilas, baterías y acumuladores', 240),
  ('27310', 'Fabricación de cables de fibra óptica', 241),
  ('27320', 'Fabricación de otros hilos y cables eléctricos', 242),
  ('27330', 'Fabricación de dispositivos de cableados', 243),
  ('27400', 'Fabricación de equipo eléctrico de iluminación', 244),
  ('27500', 'Fabricación de aparatos de uso doméstico', 245),
  ('27900', 'Fabricación de otros tipos de equipo eléctrico', 246),
  ('28110', 'Fabricación de motores y turbinas, excepto motores para aeronaves, vehículos automotores y motocicletas', 247),
  ('28120', 'Fabricación de equipo hidráulico', 248),
  ('28130', 'Fabricación de otras bombas, compresores, grifos y válvulas', 249),
  ('28140', 'Fabricación de cojinetes, engranajes, trenes de engranajes y piezas de transmisión', 250),
  ('28150', 'Fabricación de hornos y quemadores', 251),
  ('28160', 'Fabricación de equipo de elevación y manipulación', 252),
  ('28170', 'Fabricación de maquinaria y equipo de oficina', 253),
  ('28180', 'Fabricación de herramientas manuales', 254),
  ('28190', 'Fabricación de otros tipos de maquinaria de uso general', 255),
  ('28210', 'Fabricación de maquinaria agropecuaria y forestal', 256),
  ('28220', 'Fabricación de máquinas para conformar metales y maquinaria herramienta', 257),
  ('28230', 'Fabricación de maquinaria metalúrgica', 258),
  ('28240', 'Fabricación de maquinaria para la explotación de minas y canteras y para obras de construcción', 259),
  ('28250', 'Fabricación de maquinaria para la elaboración de alimentos, bebidas y tabaco', 260),
  ('28260', 'Fabricación de maquinaria para la elaboración de productos textiles, prendas de vestir y cueros', 261),
  ('28291', 'Fabricación de máquinas para imprenta', 262),
  ('28299', 'Fabricación de maquinaria de uso especial ncp', 263),
  ('29100', 'Fabricación vehículos automotores', 264),
  ('29200', 'Fabricación de carrocerías para vehículos automotores; fabricación de remolques y semiremolques', 265),
  ('29300', 'Fabricación de partes, piezas y accesorios para vehículos automotores', 266),
  ('30110', 'Fabricación de buques', 267),
  ('30120', 'Construcción y reparación de embarcaciones de recreo', 268),
  ('30200', 'Fabricación de locomotoras y de material rodante', 269),
  ('30300', 'Fabricación de aeronaves y naves espaciales', 270),
  ('30400', 'Fabricación de vehículos militares de combate', 271),
  ('30910', 'Fabricación de motocicletas', 272),
  ('30920', 'Fabricación de bicicletas y sillones de ruedas para inválidos', 273),
  ('30990', 'Fabricación de equipo de transporte ncp', 274),
  ('31001', 'Fabricación de colchones y somier', 275),
  ('31002', 'Fabricación de muebles y otros productos de madera a medida', 276),
  ('31008', 'Servicios de maquilado de muebles', 277),
  ('31009', 'Fabricación de muebles ncp', 278),
  ('32110', 'Fabricación de joyas platerías y joyerías', 279),
  ('32120', 'Fabricación de joyas de imitación (fantasía) y artículos conexos', 280),
  ('32200', 'Fabricación de instrumentos musicales', 281),
  ('32301', 'Fabricación de artículos de deporte', 282),
  ('32308', 'Servicio de maquila de productos deportivos', 283),
  ('32401', 'Fabricación de juegos de mesa y de salón', 284),
  ('32402', 'Servicio de maquilado de juguetes y juegos', 285),
  ('32409', 'Fabricación de juegos y juguetes n.c.p.', 286),
  ('32500', 'Fabricación de instrumentos y materiales médicos y odontológicos', 287),
  ('32901', 'Fabricación de lápices, bolígrafos, sellos y artículos de librería en general', 288),
  ('32902', 'Fabricación de escobas, cepillos, pinceles y similares', 289),
  ('32903', 'Fabricación de artesanías de materiales diversos', 290),
  ('32904', 'Fabricación de artículos de uso personal y domésticos n.c.p.', 291),
  ('32905', 'Fabricación de accesorios para las confecciones y la marroquinería n.c.p.', 292),
  ('32908', 'Servicios de maquila ncp', 293),
  ('32909', 'Fabricación de productos manufacturados n.c.p.', 294),
  ('33110', 'Reparación y mantenimiento de productos elaborados de metal', 295),
  ('33120', 'Reparación y mantenimiento de maquinaria', 296),
  ('33130', 'Reparación y mantenimiento de equipo electrónico y óptico', 297),
  ('33140', 'Reparación y mantenimiento de equipo eléctrico', 298),
  ('33150', 'Reparación y mantenimiento de equipo de transporte, excepto vehículos automotores', 299),
  ('33190', 'Reparación y mantenimiento de equipos n.c.p.', 300),
  ('33200', 'Instalación de maquinaria y equipo industrial', 301),
  ('35101', 'Generación de energía eléctrica', 302),
  ('35102', 'Transmisión de energía eléctrica', 303),
  ('35103', 'Distribución de energía eléctrica', 304),
  ('35200', 'Fabricación de gas, distribución de combustibles gaseosos por tuberías', 305),
  ('35300', 'Suministro de vapor y agua caliente', 306),
  ('36000', 'Captación, tratamiento y suministro de agua', 307),
  ('37000', 'Evacuación de aguas residuales (alcantarillado)', 308),
  ('38110', 'Recolección y transporte de desechos sólidos proveniente de hogares y sector urbano', 309),
  ('38120', 'Recolección de desechos peligrosos', 310),
  ('38210', 'Tratamiento y eliminación de desechos inicuos', 311),
  ('38220', 'Tratamiento y eliminación de desechos peligrosos', 312),
  ('38301', 'Reciclaje de desperdicios y desechos textiles', 313),
  ('38302', 'Reciclaje de desperdicios y desechos de plástico y caucho', 314),
  ('38303', 'Reciclaje de desperdicios y desechos de vidrio', 315),
  ('38304', 'Reciclaje de desperdicios y desechos de papel y cartón', 316),
  ('38305', 'Reciclaje de desperdicios y desechos metálicos', 317),
  ('38309', 'Reciclaje de desperdicios y desechos no metálicos n.c.p.', 318),
  ('39000', 'Actividades de Saneamiento y otros Servicios de Gestión de Desechos', 319),
  ('41001', 'Construcción de edificios residenciales', 320),
  ('41002', 'Construcción de edificios no residenciales', 321),
  ('42100', 'Construcción de carreteras, calles y caminos', 322),
  ('42200', 'Construcción de proyectos de servicio público', 323),
  ('42900', 'Construcción de obras de ingeniería civil n.c.p.', 324),
  ('43110', 'Demolición', 325),
  ('43120', 'Preparación de terreno', 326),
  ('43210', 'Instalaciones eléctricas', 327),
  ('43220', 'Instalación de fontanería, calefacción y aire acondicionado', 328),
  ('43290', 'Otras instalaciones para obras de construcción', 329),
  ('43300', 'Terminación y acabado de edificios', 330),
  ('43900', 'Otras actividades especializadas de construcción', 331),
  ('43901', 'Fabricación de techos y materiales diversos', 332),
  ('45100', 'Venta de vehículos automotores', 333),
  ('45201', 'Reparación mecánica de vehículos automotores', 334),
  ('45202', 'Reparaciones eléctricas del automotor y recarga de baterías', 335),
  ('45203', 'Enderezado y pintura de vehículos automotores', 336),
  ('45204', 'Reparaciones de radiadores, escapes y silenciadores', 337),
  ('45205', 'Reparación y reconstrucción de vías, stop y otros artículos de fibra de vidrio', 338),
  ('45206', 'Reparación de llantas de vehículos automotores', 339),
  ('45207', 'Polarizado de vehículos (mediante la adhesión de papel especial a los vidrios)', 340),
  ('45208', 'Lavado y pasteado de vehículos (carwash)', 341),
  ('45209', 'Reparaciones de vehículos n.c.p.', 342),
  ('45211', 'Remolque de vehículos automotores', 343),
  ('45301', 'Venta de partes, piezas y accesorios nuevos para vehículos automotores', 344),
  ('45302', 'Venta de partes, piezas y accesorios usados para vehículos automotores', 345),
  ('45401', 'Venta de motocicletas', 346),
  ('45402', 'Venta de repuestos, piezas y accesorios de motocicletas', 347),
  ('45403', 'Mantenimiento y reparación de motocicletas', 348),
  ('46100', 'Venta al por mayor a cambio de retribución o por contrata', 349),
  ('46201', 'Venta al por mayor de materias primas agrícolas', 350),
  ('46202', 'Venta al por mayor de productos de la silvicultura', 351),
  ('46203', 'Venta al por mayor de productos pecuarios y de granja', 352),
  ('46211', 'Venta de productos para uso agropecuario', 353),
  ('46291', 'Venta al por mayor de granos básicos (cereales, leguminosas)', 354),
  ('46292', 'Venta al por mayor de semillas mejoradas para cultivo', 355),
  ('46293', 'Venta al por mayor de café oro y uva', 356),
  ('46294', 'Venta al por mayor de caña de azúcar', 357),
  ('46295', 'Venta al por mayor de flores, plantas y otros productos naturales', 358),
  ('46296', 'Venta al por mayor de productos agrícolas', 359),
  ('46297', 'Venta al por mayor de ganado bovino (vivo)', 360),
  ('46298', 'Venta al por mayor de animales porcinos, ovinos, caprino, canículas, apícolas, avícolas vivos', 361),
  ('46299', 'Venta de otras especies vivas del reino animal', 362),
  ('46301', 'Venta al por mayor de alimentos', 363),
  ('46302', 'Venta al por mayor de bebidas', 364),
  ('46303', 'Venta al por mayor de tabaco', 365),
  ('46371', 'Venta al por mayor de frutas, hortalizas (verduras), legumbres y tubérculos', 366),
  ('46372', 'Venta al por mayor de pollos, gallinas destazadas, pavos y otras aves', 367),
  ('46373', 'Venta al por mayor de carne bovina y porcina, productos de carne y embutidos', 368),
  ('46374', 'Venta al por mayor de huevos', 369),
  ('46375', 'Venta al por mayor de productos lácteos', 370),
  ('46376', 'Venta al por mayor de productos farináceos de panadería (pan dulce, cakes, respostería, etc.)', 371),
  ('46377', 'Venta al por mayor de pastas alimenticias, aceites y grasas comestibles vegetal y animal', 372),
  ('46378', 'Venta al por mayor de sal comestible', 373),
  ('46379', 'Venta al por mayor de azúcar', 374),
  ('46391', 'Venta al por mayor de abarrotes (vinos, licores, productos alimenticios envasados, etc.)', 375),
  ('46392', 'Venta al por mayor de aguas gaseosas', 376),
  ('46393', 'Venta al por mayor de agua purificada', 377),
  ('46394', 'Venta al por mayor de refrescos y otras bebidas, líquidas o en polvo', 378),
  ('46395', 'Venta al por mayor de cerveza y licores', 379),
  ('46396', 'Venta al por mayor de hielo', 380),
  ('46411', 'Venta al por mayor de hilados, tejidos y productos textiles de mercería', 381),
  ('46412', 'Venta al por mayor de artículos textiles excepto confecciones para el hogar', 382),
  ('46413', 'Venta al por mayor de confecciones textiles para el hogar', 383),
  ('46414', 'Venta al por mayor de prendas de vestir y accesorios de vestir', 384),
  ('46415', 'Venta al por mayor de ropa usada', 385),
  ('46416', 'Venta al por mayor de calzado', 386),
  ('46417', 'Venta al por mayor de artículos de marroquinería y talabartería', 387),
  ('46418', 'Venta al por mayor de artículos de peletería', 388),
  ('46419', 'Venta al por mayor de otros artículos textiles n.c.p.', 389),
  ('46471', 'Venta al por mayor de instrumentos musicales', 390),
  ('46472', 'Venta al por mayor de colchones, almohadas, cojines, etc.', 391),
  ('46473', 'Venta al por mayor de artículos de aluminio para el hogar y para otros usos', 392),
  ('46474', 'Venta al por mayor de depósitos y otros artículos plásticos para el hogar y otros usos, incluyendo los desechables de durapax y no desechables', 393),
  ('46475', 'Venta al por mayor de cámaras fotográficas, accesorios y materiales', 394),
  ('46482', 'Venta al por mayor de medicamentos, artículos y otros productos de uso veterinario', 395),
  ('46483', 'Venta al por mayor de productos y artículos de belleza y de uso personal', 396),
  ('46484', 'Venta de productos farmacéuticos y medicinales', 397),
  ('46491', 'Venta al por mayor de productos medicinales, cosméticos, perfumería y productos de limpieza', 398),
  ('46492', 'Venta al por mayor de relojes y artículos de joyería', 399),
  ('46493', 'Venta al por mayor de electrodomésticos y artículos del hogar excepto bazar; artículos de iluminación', 400),
  ('46494', 'Venta al por mayor de artículos de bazar y similares', 401),
  ('46495', 'Venta al por mayor de artículos de óptica', 402),
  ('46496', 'Venta al por mayor de revistas, periódicos, libros, artículos de librería y artículos de papel y cartón en general', 403),
  ('46497', 'Venta de artículos deportivos, juguetes y rodados', 404),
  ('46498', 'Venta al por mayor de productos usados para el hogar o el uso personal', 405),
  ('46499', 'Venta al por mayor de enseres domésticos y de uso personal n.c.p.', 406),
  ('46500', 'Venta al por mayor de bicicletas, partes, accesorios y otros', 407),
  ('46510', 'Venta al por mayor de computadoras, equipo periférico y programas informáticos', 408),
  ('46520', 'Venta al por mayor de equipos de comunicación', 409),
  ('46530', 'Venta al por mayor de maquinaria y equipo agropecuario, accesorios, partes y suministros', 410),
  ('46590', 'Venta de equipos e instrumentos de uso profesional y científico y aparatos de medida y control', 411),
  ('46591', 'Venta al por mayor de maquinaria equipo, accesorios y materiales para la industria de la madera y sus productos', 412),
  ('46592', 'Venta al por mayor de maquinaria, equipo, accesorios y materiales para la industria gráfica y del papel, cartón y productos de papel y cartón', 413),
  ('46593', 'Venta al por mayor de maquinaria, equipo, accesorios y materiales para la industria de productos químicos, plástico y caucho', 414),
  ('46594', 'Venta al por mayor de maquinaria, equipo, accesorios y materiales para la industria metálica y de sus productos', 415),
  ('46595', 'Venta al por mayor de equipamiento para uso médico, odontológico, veterinario y servicios conexos', 416),
  ('46596', 'Venta al por mayor de maquinaria, equipo, accesorios y partes para la industria de la alimentación', 417),
  ('46597', 'Venta al por mayor de maquinaria, equipo, accesorios y partes para la industria textil, confecciones y cuero', 418),
  ('46598', 'Venta al por mayor de maquinaria, equipo y accesorios para la construcción y explotación de minas y canteras', 419),
  ('46599', 'Venta al por mayor de otro tipo de maquinaria y equipo con sus accesorios y partes', 420),
  ('46610', 'Venta al por mayor de otros combustibles sólidos, líquidos, gaseosos y de productos conexos', 421),
  ('46612', 'Venta al por mayor de combustibles para automotores, aviones, barcos, maquinaria y otros', 422),
  ('46613', 'Venta al por mayor de lubricantes, grasas y otros aceites para automotores, maquinaria industrial, etc.', 423),
  ('46614', 'Venta al por mayor de gas propano', 424),
  ('46615', 'Venta al por mayor de leña y carbón', 425),
  ('46620', 'Venta al por mayor de metales y minerales metalíferos', 426),
  ('46631', 'Venta al por mayor de puertas, ventanas, vitrinas y similares', 427),
  ('46632', 'Venta al por mayor de artículos de ferretería y pinturerías', 428),
  ('46633', 'Vidrierías', 429),
  ('46634', 'Venta al por mayor de maderas', 430),
  ('46639', 'Venta al por mayor de materiales para la construcción n.c.p.', 431),
  ('46691', 'Venta al por mayor de sal industrial sin yodar', 432),
  ('46692', 'Venta al por mayor de productos intermedios y desechos de origen textil', 433),
  ('46693', 'Venta al por mayor de productos intermedios y desechos de origen metálico', 434),
  ('46694', 'Venta al por mayor de productos intermedios y desechos de papel y cartón', 435),
  ('46695', 'Venta al por mayor fertilizantes, abonos, agroquímicos y productos similares', 436),
  ('46696', 'Venta al por mayor de productos intermedios y desechos de origen plástico', 437),
  ('46697', 'Venta al por mayor de tintas para imprenta, productos curtientes y materias y productos colorantes', 438),
  ('46698', 'Venta de productos intermedios y desechos de origen químico y de caucho', 439),
  ('46699', 'Venta al por mayor de productos intermedios y desechos ncp', 440),
  ('46701', 'Venta de algodón en oro', 441),
  ('46900', 'Venta al por mayor de otros productos', 442),
  ('46901', 'Venta al por mayor de cohetes y otros productos pirotécnicos', 443),
  ('46902', 'Venta al por mayor de artículos diversos para consumo humano', 444),
  ('46903', 'Venta al por mayor de armas de fuego, municiones y accesorios', 445),
  ('46904', 'Venta al por mayor de toldos y tiendas de campaña de cualquier material', 446),
  ('46905', 'Venta al por mayor de exhibidores publicitarios y rótulos', 447),
  ('46906', 'Venta al por mayor de artículos promocionales diversos', 448),
  ('47111', 'Venta en supermercados', 449),
  ('47112', 'Venta en tiendas de artículos de primera necesidad', 450),
  ('47119', 'Almacenes (venta de diversos artículos)', 451),
  ('47120', 'Almacenes (venta de diversos artículos), y venta de vehículos automotores y motocicletas', 452),
  ('47190', 'Venta al por menor de otros productos en comercios no especializados', 453),
  ('47199', 'Venta de establecimientos no especializados con surtido compuesto principalmente de alimentos, bebidas y tabaco', 454),
  ('47211', 'Venta al por menor de frutas y hortalizas', 455),
  ('47212', 'Venta al por menor de carnes, embutidos y productos de granja', 456),
  ('47213', 'Venta al por menor de pescado y mariscos', 457),
  ('47214', 'Venta al por menor de productos lácteos', 458),
  ('47215', 'Venta al por menor de productos de panadería, repostería y galletas', 459),
  ('47216', 'Venta al por menor de huevos', 460),
  ('47217', 'Venta al por menor de carnes y productos cárnicos', 461),
  ('47218', 'Venta al por menor de granos básicos y otros', 462),
  ('47219', 'Venta al por menor de alimentos n.c.p.', 463),
  ('47221', 'Venta al por menor de hielo', 464),
  ('47223', 'Venta de bebidas no alcohólicas, para su consumo fuera del establecimiento', 465),
  ('47224', 'Venta de bebidas alcohólicas, para su consumo fuera del establecimiento', 466),
  ('47225', 'Venta de bebidas alcohólicas para su consumo dentro del establecimiento', 467),
  ('47230', 'Venta al por menor de tabaco', 468),
  ('47300', 'Venta de combustibles, lubricantes y otros (gasolineras)', 469),
  ('47411', 'Venta al por menor de computadoras y equipo periférico', 470),
  ('47412', 'Venta de equipo y accesorios de telecomunicación', 471),
  ('47420', 'Venta al por menor de equipo de audio y video', 472),
  ('47510', 'Venta al por menor de hilados, tejidos y productos textiles de mercería; confecciones para el hogar y textiles n.c.p.', 473),
  ('47521', 'Venta al por menor de productos de madera', 474),
  ('47522', 'Venta al por menor de artículos de ferretería', 475),
  ('47523', 'Venta al por menor de productos de pinturerías', 476),
  ('47524', 'Venta al por menor en vidrierías', 477),
  ('47529', 'Venta al por menor de materiales de construcción y artículos conexos', 478),
  ('47530', 'Venta al por menor de tapices, alfombras y revestimientos de paredes y pisos en comercios especializados', 479),
  ('47591', 'Venta al por menor de muebles', 480),
  ('47592', 'Venta al por menor de artículos de bazar', 481),
  ('47593', 'Venta al por menor de aparatos electrodomésticos, repuestos y accesorios', 482),
  ('47594', 'Venta al por menor de artículos eléctricos y de iluminación', 483),
  ('47598', 'Venta al por menor de instrumentos musicales', 484),
  ('47610', 'Venta al por menor de libros, periódicos y artículos de papelería en comercios especializados', 485),
  ('47620', 'Venta al por menor de discos láser, cassettes, cintas de video y otros', 486),
  ('47630', 'Venta al por menor de productos y equipos de deporte', 487),
  ('47631', 'Venta al por menor de bicicletas, accesorios y repuestos', 488),
  ('47640', 'Venta al por menor de juegos y juguetes en comercios especializados', 489),
  ('47711', 'Venta al por menor de prendas de vestir y accesorios de vestir', 490),
  ('47712', 'Venta al por menor de calzado', 491),
  ('47713', 'Venta al por menor de artículos de peletería, marroquinería y talabartería', 492),
  ('47721', 'Venta al por menor de medicamentos farmacéuticos y otros materiales y artículos de uso médico, odontológico y veterinario', 493),
  ('47722', 'Venta al por menor de productos cosméticos y de tocador', 494),
  ('47731', 'Venta al por menor de productos de joyería, bisutería, óptica, relojería', 495),
  ('47732', 'Venta al por menor de plantas, semillas, animales y artículos conexos', 496),
  ('47733', 'Venta al por menor de combustibles de uso doméstico (gas propano y gas licuado)', 497),
  ('47734', 'Venta al por menor de artesanías, artículos cerámicos y recuerdos en general', 498),
  ('47735', 'Venta al por menor de ataúdes, lápidas y cruces, trofeos, artículos religiosos en general', 499),
  ('47736', 'Venta al por menor de armas de fuego, municiones y accesorios', 500),
  ('47737', 'Venta al por menor de artículos de cohetería y pirotécnicos', 501),
  ('47738', 'Venta al por menor de artículos desechables de uso personal y doméstico (servilletas, papel higiénico, pañales, toallas sanitarias, etc.)', 502),
  ('47739', 'Venta al por menor de otros productos n.c.p.', 503),
  ('47741', 'Venta al por menor de artículos usados', 504),
  ('47742', 'Venta al por menor de textiles y confecciones usados', 505),
  ('47743', 'Venta al por menor de libros, revistas, papel y cartón usados', 506),
  ('47749', 'Venta al por menor de productos usados n.c.p.', 507),
  ('47811', 'Venta al por menor de frutas, verduras y hortalizas', 508),
  ('47814', 'Venta al por menor de productos lácteos', 509),
  ('47815', 'Venta al por menor de productos de panadería, galletas y similares', 510),
  ('47816', 'Venta al por menor de bebidas', 511),
  ('47818', 'Venta al por menor en tiendas de mercado y puestos', 512),
  ('47821', 'Venta al por menor de hilados, tejidos y productos textiles de mercería en puestos de mercados y ferias', 513),
  ('47822', 'Venta al por menor de artículos textiles excepto confecciones para el hogar en puestos de mercados y ferias', 514),
  ('47823', 'Venta al por menor de confecciones textiles para el hogar en puestos de mercados y ferias', 515),
  ('47824', 'Venta al por menor de prendas de vestir, accesorios de vestir y similares en puestos de mercados y ferias', 516),
  ('47825', 'Venta al por menor de ropa usada', 517),
  ('47826', 'Venta al por menor de calzado, artículos de marroquinería y talabartería en puestos de mercados y ferias', 518),
  ('47827', 'Venta al por menor de artículos de marroquinería y talabartería en puestos de mercados y ferias', 519),
  ('47829', 'Venta al por menor de artículos textiles ncp en puestos de mercados y ferias', 520),
  ('47891', 'Venta al por menor de animales, flores y productos conexos en puestos de feria y mercados', 521),
  ('47892', 'Venta al por menor de productos medicinales, cosméticos, de tocador y de limpieza en puestos de ferias y mercados', 522),
  ('47893', 'Venta al por menor de artículos de bazar en puestos de ferias y mercados', 523),
  ('47894', 'Venta al por menor de artículos de papel, envases, libros, revistas y conexos en puestos de feria y mercados', 524),
  ('47895', 'Venta al por menor de materiales de construcción, electrodomésticos, accesorios para autos y similares en puestos de feria y mercados', 525),
  ('47896', 'Venta al por menor de equipos accesorios para las comunicaciones en puestos de feria y mercados', 526),
  ('47899', 'Venta al por menor en puestos de ferias y mercados n.c.p.', 527),
  ('47910', 'Venta al por menor por correo o Internet', 528),
  ('47990', 'Otros tipos de venta al por menor no realizada, en almacenes, puestos de venta o mercado', 529),
  ('49110', 'Transporte interurbano de pasajeros por ferrocarril', 530),
  ('49120', 'Transporte de carga por ferrocarril', 531),
  ('49211', 'Transporte de pasajeros urbanos e interurbano mediante buses', 532),
  ('49212', 'Transporte de pasajeros interdepartamental mediante microbuses', 533),
  ('49213', 'Transporte de pasajeros urbanos e interurbano mediante microbuses', 534),
  ('49214', 'Transporte de pasajeros interdepartamental mediante buses', 535),
  ('49221', 'Transporte internacional de pasajeros', 536),
  ('49222', 'Transporte de pasajeros mediante taxis y autos con chofer', 537),
  ('49223', 'Transporte escolar', 538),
  ('49225', 'Transporte de pasajeros para excursiones', 539),
  ('49226', 'Servicios de transporte de personal', 540),
  ('49229', 'Transporte de pasajeros por vía terrestre ncp', 541),
  ('49231', 'Transporte de carga urbano', 542),
  ('49232', 'Transporte nacional de carga', 543),
  ('49233', 'Transporte de carga internacional', 544),
  ('49234', 'Servicios de mudanza', 545),
  ('49235', 'Alquiler de vehículos de carga con conductor', 546),
  ('49300', 'Transporte por oleoducto o gasoducto', 547),
  ('50110', 'Transporte de pasajeros marítimo y de cabotaje', 548),
  ('50120', 'Transporte de carga marítimo y de cabotaje', 549),
  ('50211', 'Transporte de pasajeros por vías de navegación interiores', 550),
  ('50212', 'Alquiler de equipo de transporte de pasajeros por vías de navegación interior con conductor', 551),
  ('50220', 'Transporte de carga por vías de navegación interiores', 552),
  ('51100', 'Transporte aéreo de pasajeros', 553),
  ('51201', 'Transporte de carga por vía aérea', 554),
  ('51202', 'Alquiler de equipo de aerotransporte con operadores para el propósito de transportar carga', 555),
  ('52101', 'Alquiler de instalaciones de almacenamiento en zonas francas', 556),
  ('52102', 'Alquiler de silos para conservación y almacenamiento de granos', 557),
  ('52103', 'Alquiler de instalaciones con refrigeración para almacenamiento y conservación de alimentos y otros productos', 558),
  ('52109', 'Alquiler de bodegas para almacenamiento y depósito n.c.p.', 559),
  ('52211', 'Servicio de garaje y estacionamiento', 560),
  ('52212', 'Servicios de terminales para el transporte por vía terrestre', 561),
  ('52219', 'Servicios para el transporte por vía terrestre n.c.p.', 562),
  ('52220', 'Servicios para el transporte acuático', 563),
  ('52230', 'Servicios para el transporte aéreo', 564),
  ('52240', 'Manipulación de carga', 565),
  ('52290', 'Servicios para el transporte ncp', 566),
  ('52291', 'Agencias de tramitaciones aduanales', 567),
  ('53100', 'Servicios de correo nacional', 568),
  ('53200', 'Actividades de correo distintas a las actividades postales nacionales', 569),
  ('53201', 'Agencia privada de correo y encomiendas', 570),
  ('55101', 'Actividades de alojamiento para estancias cortas', 571),
  ('55102', 'Hoteles', 572),
  ('55200', 'Actividades de campamentos, parques de vehículos de recreo y parques de caravanas', 573),
  ('55900', 'Alojamiento n.c.p.', 574),
  ('56101', 'Restaurantes', 575),
  ('56106', 'Pupusería', 576),
  ('56107', 'Actividades varias de restaurantes', 577),
  ('56108', 'Comedores', 578),
  ('56109', 'Merenderos ambulantes', 579),
  ('56210', 'Preparación de comida para eventos especiales', 580),
  ('56291', 'Servicios de provisión de comidas por contrato', 581),
  ('56292', 'Servicios de concesión de cafetines y chalet en empresas e instituciones', 582),
  ('56299', 'Servicios de preparación de comidas ncp', 583),
  ('56301', 'Servicio de expendio de bebidas en salones y bares', 584),
  ('56302', 'Servicio de expendio de bebidas en puestos callejeros, mercados y ferias', 585),
  ('58110', 'Edición de libros, folletos, partituras y otras ediciones distintas a estas', 586),
  ('58120', 'Edición de directorios y listas de correos', 587),
  ('58130', 'Edición de periódicos, revistas y otras publicaciones periódicas', 588),
  ('58190', 'Otras actividades de edición', 589),
  ('58200', 'Edición de programas informáticos (software)', 590),
  ('59110', 'Actividades de producción cinematográfica', 591),
  ('59120', 'Actividades de post producción de películas, videos y programas de televisión', 592),
  ('59130', 'Actividades de distribución de películas cinematográficas, videos y programas de televisión', 593),
  ('59140', 'Actividades de exhibición de películas cinematográficas y cintas de vídeo', 594),
  ('59200', 'Actividades de edición y grabación de música', 595),
  ('60100', 'Servicios de difusiones de radio', 596),
  ('60201', 'Actividades de programación y difusión de televisión abierta', 597),
  ('60202', 'Actividades de suscripción y difusión de televisión por cable y/o suscripción', 598),
  ('60299', 'Servicios de televisión, incluye televisión por cable', 599),
  ('60900', 'Programación y transmisión de radio y televisión', 600),
  ('61101', 'Servicio de telefonía', 601),
  ('61102', 'Servicio de Internet', 602),
  ('61103', 'Servicio de telefonía fija', 603),
  ('61109', 'Servicio de Internet n.c.p.', 604),
  ('61201', 'Servicios de telefonía celular', 605),
  ('61202', 'Servicios de Internet inalámbrico', 606),
  ('61209', 'Servicios de telecomunicaciones inalámbrico n.c.p.', 607),
  ('61301', 'Telecomunicaciones satelitales', 608),
  ('61309', 'Comunicación vía satélite n.c.p.', 609),
  ('61900', 'Actividades de telecomunicación n.c.p.', 610),
  ('62010', 'Programación Informática', 611),
  ('62020', 'Consultorías y gestión de servicios informáticos', 612),
  ('62090', 'Otras actividades de tecnología de información y servicios de computadora', 613),
  ('63110', 'Procesamiento de datos y Actividades relacionadas', 614),
  ('63120', 'Portales WEB', 615),
  ('63910', 'Servicios de Agencias de Noticias', 616),
  ('63990', 'Otros servicios de información n.c.p.', 617),
  ('64110', 'Servicios provistos por el Banco Central de El salvador', 618),
  ('64190', 'Bancos', 619),
  ('64192', 'Entidades dedicadas al envío de remesas', 620),
  ('64199', 'Otras entidades financieras', 621),
  ('64200', 'Actividades de sociedades de cartera', 622),
  ('64300', 'Fideicomisos, fondos y otras fuentes de financiamiento', 623),
  ('64910', 'Arrendamientos financieros', 624),
  ('64920', 'Asociaciones cooperativas de ahorro y crédito dedicadas a la intermediación financiera', 625),
  ('64921', 'Instituciones emisoras de tarjetas de crédito y otros', 626),
  ('64922', 'Tipos de crédito ncp', 627),
  ('64928', 'Prestamistas y casas de empeño', 628),
  ('64990', 'Actividades de servicios financieros, excepto la financiación de planes de seguros y de pensiones n.c.p.', 629),
  ('65110', 'Planes de seguros de vida', 630),
  ('65120', 'Planes de seguro excepto de vida', 631),
  ('65199', 'Seguros generales de todo tipo', 632),
  ('65200', 'Planes se seguro', 633),
  ('65300', 'Planes de pensiones', 634),
  ('66110', 'Administración de mercados financieros (Bolsa de Valores)', 635),
  ('66120', 'Actividades bursátiles (Corredores de Bolsa)', 636),
  ('66190', 'Actividades auxiliares de la intermediación financiera ncp', 637),
  ('66210', 'Evaluación de riesgos y daños', 638),
  ('66220', 'Actividades de agentes y corredores de seguros', 639),
  ('66290', 'Otras actividades auxiliares de seguros y fondos de pensiones', 640),
  ('66300', 'Actividades de administración de fondos', 641),
  ('68101', 'Servicio de alquiler y venta de lotes en cementerios', 642),
  ('68109', 'Actividades inmobiliarias realizadas con bienes propios o arrendados n.c.p.', 643),
  ('68200', 'Actividades Inmobiliarias Realizadas a Cambio de una Retribución o por Contrata', 644),
  ('69100', 'Actividades jurídicas', 645),
  ('69200', 'Actividades de contabilidad, teneduría de libros y auditoría; asesoramiento en materia de impuestos', 646),
  ('70100', 'Actividades de oficinas centrales de sociedades de cartera', 647),
  ('70200', 'Actividades de consultoría en gestión empresarial', 648),
  ('71101', 'Servicios de arquitectura y planificación urbana y servicios conexos', 649),
  ('71102', 'Servicios de ingeniería', 650),
  ('71103', 'Servicios de agrimensura, topografía, cartografía, prospección y geofísica y servicios conexos', 651),
  ('71200', 'Ensayos y análisis técnicos', 652),
  ('72100', 'Investigaciones y desarrollo experimental en el campo de las ciencias naturales y la ingeniería', 653),
  ('72199', 'Investigaciones científicas', 654),
  ('72200', 'Investigaciones y desarrollo experimental en el campo de las ciencias sociales y las humanidades científica y desarrollo', 655),
  ('73100', 'Publicidad', 656),
  ('73200', 'Investigación de mercados y realización de encuestas de opinión pública', 657),
  ('74100', 'Actividades de diseño especializado', 658),
  ('74200', 'Actividades de fotografía', 659),
  ('74900', 'Servicios profesionales y científicos ncp', 660),
  ('75000', 'Actividades veterinarias', 661),
  ('77101', 'Alquiler de equipo de transporte terrestre', 662),
  ('77102', 'Alquiler de equipo de transporte acuático', 663),
  ('77103', 'Alquiler de equipo de transporte por vía aérea', 664),
  ('77210', 'Alquiler y arrendamiento de equipo de recreo y deportivo', 665),
  ('77220', 'Alquiler de cintas de video y discos', 666),
  ('77290', 'Alquiler de otros efectos personales y enseres domésticos', 667),
  ('77300', 'Alquiler de maquinaria y equipo', 668),
  ('77400', 'Arrendamiento de productos de propiedad intelectual', 669),
  ('78100', 'Obtención y dotación de personal', 670),
  ('78200', 'Actividades de las agencias de trabajo temporal', 671),
  ('78300', 'Dotación de recursos humanos y gestión; gestión de las funciones de recursos humanos', 672),
  ('79110', 'Actividades de agencias de viajes y organizadores de viajes; actividades de asistencia a turistas', 673),
  ('79120', 'Actividades de los operadores turísticos', 674),
  ('79900', 'Otros servicios de reservas y actividades relacionadas', 675),
  ('80100', 'Servicios de seguridad privados', 676),
  ('80201', 'Actividades de servicios de sistemas de seguridad', 677),
  ('80202', 'Actividades para la prestación de sistemas de seguridad', 678),
  ('80300', 'Actividades de investigación', 679),
  ('81100', 'Actividades combinadas de mantenimiento de edificios e instalaciones', 680),
  ('81210', 'Limpieza general de edificios', 681),
  ('81290', 'Otras actividades combinadas de mantenimiento de edificios e instalaciones ncp', 682),
  ('81300', 'Servicio de jardinería', 683),
  ('82110', 'Servicios administrativos de oficinas', 684),
  ('82190', 'Servicio de fotocopiado y similares, excepto en imprentas', 685),
  ('82200', 'Actividades de las centrales de llamadas (call center)', 686),
  ('82300', 'Organización de convenciones y ferias de negocios', 687),
  ('82910', 'Actividades de agencias de cobro y oficinas de crédito', 688),
  ('82921', 'Servicios de envase y empaque de productos alimenticios', 689),
  ('82922', 'Servicios de envase y empaque de productos medicinales', 690),
  ('82929', 'Servicio de envase y empaque ncp', 691),
  ('82990', 'Actividades de apoyo empresariales ncp', 692),
  ('84110', 'Actividades de la Administración Pública en general', 693),
  ('84111', 'Alcaldías Municipales', 694),
  ('84120', 'Regulación de las actividades de prestación de servicios sanitarios, educativos, culturales y otros servicios sociales, excepto seguridad social', 695),
  ('84130', 'Regulación y facilitación de la actividad económica', 696),
  ('84210', 'Actividades de administración y funcionamiento del Ministerio de Relaciones Exteriores', 697),
  ('84220', 'Actividades de defensa', 698),
  ('84230', 'Actividades de mantenimiento del orden público y de seguridad', 699),
  ('84300', 'Actividades de planes de seguridad social de afiliación obligatoria', 700),
  ('85101', 'Guardería educativa', 701),
  ('85102', 'Enseñanza preescolar o parvularia', 702),
  ('85103', 'Enseñanza primaria', 703),
  ('85104', 'Servicio de educación preescolar y primaria integrada', 704),
  ('85211', 'Enseñanza secundaria tercer ciclo (7°, 8° y 9°)', 705),
  ('85212', 'Enseñanza secundaria de formación general bachillerato', 706),
  ('85221', 'Enseñanza secundaria de formación técnica y profesional', 707),
  ('85222', 'Enseñanza secundaria de formación técnica y profesional integrada con enseñanza primaria', 708),
  ('85301', 'Enseñanza superior universitaria', 709),
  ('85302', 'Enseñanza superior no universitaria', 710),
  ('85303', 'Enseñanza superior integrada a educación secundaria y/o primaria', 711),
  ('85410', 'Educación deportiva y recreativa', 712),
  ('85420', 'Educación cultural', 713),
  ('85490', 'Otros tipos de enseñanza n.c.p.', 714),
  ('85499', 'Enseñanza formal', 715),
  ('85500', 'Servicios de apoyo a la enseñanza', 716),
  ('86100', 'Actividades de hospitales', 717),
  ('86201', 'Clínicas médicas', 718),
  ('86202', 'Servicios de Odontología', 719),
  ('86203', 'Servicios médicos', 720),
  ('86901', 'Servicios de análisis y estudios de diagnóstico', 721),
  ('86902', 'Actividades de atención de la salud humana', 722),
  ('86909', 'Otros Servicio relacionados con la salud ncp', 723),
  ('87100', 'Residencias de ancianos con atención de enfermería', 724),
  ('87200', 'Instituciones dedicadas al tratamiento del retraso mental, problemas de salud mental y el uso indebido de sustancias nocivas', 725),
  ('87300', 'Instituciones dedicadas al cuidado de ancianos y discapacitados', 726),
  ('87900', 'Actividades de asistencia a niños y jóvenes', 727),
  ('87901', 'Otras actividades de atención en instituciones', 728),
  ('88100', 'Actividades de asistencia sociales sin alojamiento para ancianos y discapacitados', 729),
  ('88900', 'servicios sociales sin alojamiento ncp', 730),
  ('90000', 'Actividades creativas artísticas y de esparcimiento', 731),
  ('91010', 'Actividades de bibliotecas y archivos', 732),
  ('91020', 'Actividades de museos y preservación de lugares y edificios históricos', 733),
  ('91030', 'Actividades de jardines botánicos, zoológicos y de reservas naturales', 734),
  ('92000', 'Actividades de juegos y apuestas', 735),
  ('93110', 'Gestión de instalaciones deportivas', 736),
  ('93120', 'Actividades de clubes deportivos', 737),
  ('93190', 'Otras actividades deportivas', 738),
  ('93210', 'Actividades de parques de atracciones y parques temáticos', 739),
  ('93291', 'Discotecas y salas de baile', 740),
  ('93298', 'Centros vacacionales', 741),
  ('93299', 'Actividades de esparcimiento ncp', 742),
  ('94110', 'Actividades de organizaciones empresariales y de empleadores', 743),
  ('94120', 'Actividades de organizaciones profesionales', 744),
  ('94200', 'Actividades de sindicatos', 745),
  ('94910', 'Actividades de organizaciones religiosas', 746),
  ('94920', 'Actividades de organizaciones políticas', 747),
  ('94990', 'Actividades de asociaciones n.c.p.', 748),
  ('95110', 'Reparación de computadoras y equipo periférico', 749),
  ('95120', 'Reparación de equipo de comunicación', 750),
  ('95210', 'Reparación de aparatos electrónicos de consumo', 751),
  ('95220', 'Reparación de aparatos doméstico y equipo de hogar y jardín', 752),
  ('95230', 'Reparación de calzado y artículos de cuero', 753),
  ('95240', 'Reparación de muebles y accesorios para el hogar', 754),
  ('95291', 'Reparación de Instrumentos musicales', 755),
  ('95292', 'Servicios de cerrajería y copiado de llaves', 756),
  ('95293', 'Reparación de joyas y relojes', 757),
  ('95294', 'Reparación de bicicletas, sillas de ruedas y rodados n.c.p.', 758),
  ('95299', 'Reparaciones de enseres personales n.c.p.', 759),
  ('96010', 'Lavado y limpieza de prendas de tela y de piel, incluso la limpieza en seco', 760),
  ('96020', 'Peluquería y otros tratamientos de belleza', 761),
  ('96030', 'Pompas fúnebres y actividades conexas', 762),
  ('96091', 'Servicios de sauna y otros servicios para la estética corporal n.c.p.', 763),
  ('96092', 'Servicios n.c.p.', 764),
  ('97000', 'Actividad de los hogares en calidad de empleadores de personal doméstico', 765),
  ('98100', 'Actividades indiferenciadas de producción de bienes de los hogares privados para uso propio', 766),
  ('98200', 'Actividades indiferenciadas de producción de servicios de los hogares privados para uso propio', 767),
  ('99000', 'Actividades de organizaciones y órganos extraterritoriales', 768),
  ('10001', 'Empleados', 769),
  ('10002', 'Pensionado', 770),
  ('10003', 'Estudiante', 771),
  ('10004', 'Desempleado', 772),
  ('10005', 'Otros', 773),
  ('10006', 'Comerciante', 774)
;

-- --------------------------------------------------
-- CAT-020 País — 249 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_020_pais (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_020_pais_codigo ON cat_020_pais (codigo);

INSERT INTO cat_020_pais (codigo, descripcion, orden) VALUES
  ('AF', 'Afganistán', 1),
  ('AX', 'Aland', 2),
  ('AL', 'Albania', 3),
  ('DE', 'Alemania', 4),
  ('AD', 'Andorra', 5),
  ('AO', 'Angola', 6),
  ('AI', 'Anguila', 7),
  ('AQ', 'Antártica', 8),
  ('AG', 'Antigua y Barbuda', 9),
  ('AW', 'Aruba', 10),
  ('SA', 'Arabia Saudita', 11),
  ('DZ', 'Argelia', 12),
  ('AR', 'Argentina', 13),
  ('AM', 'Armenia', 14),
  ('AU', 'Australia', 15),
  ('AT', 'Austria', 16),
  ('AZ', 'Azerbaiyán', 17),
  ('BS', 'Bahamas', 18),
  ('BH', 'Bahrein', 19),
  ('BD', 'Bangladesh', 20),
  ('BB', 'Barbados', 21),
  ('BE', 'Bélgica', 22),
  ('BZ', 'Belice', 23),
  ('BJ', 'Benin', 24),
  ('BM', 'Bermudas', 25),
  ('BY', 'Bielorrusia', 26),
  ('BO', 'Bolivia', 27),
  ('BQ', 'Bonaire, Sint Eustatius and Saba', 28),
  ('BA', 'Bosnia-Herzegovina', 29),
  ('BW', 'Botswana', 30),
  ('BR', 'Brasil', 31),
  ('BN', 'Brunei', 32),
  ('BG', 'Bulgaria', 33),
  ('BF', 'Burkina Faso', 34),
  ('BI', 'Burundi', 35),
  ('BT', 'Bután', 36),
  ('CV', 'Cabo Verde', 37),
  ('KY', 'Caimán, Islas', 38),
  ('KH', 'Camboya', 39),
  ('CM', 'Camerún', 40),
  ('CA', 'Canadá', 41),
  ('CF', 'Centroafricana, República', 42),
  ('TD', 'Chad', 43),
  ('CL', 'Chile', 44),
  ('CN', 'China', 45),
  ('CY', 'Chipre', 46),
  ('VA', 'Ciudad del Vaticano', 47),
  ('CO', 'Colombia', 48),
  ('KM', 'Comoras', 49),
  ('CG', 'Congo', 50),
  ('CI', 'Costa de Marfil', 51),
  ('CR', 'Costa Rica', 52),
  ('HR', 'Croacia', 53),
  ('CU', 'Cuba', 54),
  ('CW', 'Curazao', 55),
  ('DK', 'Dinamarca', 56),
  ('DM', 'Dominica', 57),
  ('DJ', 'Djiboutí', 58),
  ('EC', 'Ecuador', 59),
  ('EG', 'Egipto', 60),
  ('SV', 'El Salvador', 61),
  ('AE', 'Emiratos Árabes Unidos', 62),
  ('ER', 'Eritrea', 63),
  ('SK', 'Eslovaquia', 64),
  ('SI', 'Eslovenia', 65),
  ('ES', 'España', 66),
  ('US', 'Estados Unidos', 67),
  ('EE', 'Estonia', 68),
  ('ET', 'Etiopía', 69),
  ('FJ', 'Fiji', 70),
  ('PH', 'Filipinas', 71),
  ('FI', 'Finlandia', 72),
  ('FR', 'Francia', 73),
  ('GA', 'Gabón', 74),
  ('GM', 'Gambia', 75),
  ('GE', 'Georgia', 76),
  ('GH', 'Ghana', 77),
  ('GI', 'Gibraltar', 78),
  ('GD', 'Granada', 79),
  ('GR', 'Grecia', 80),
  ('GL', 'Groenlandia', 81),
  ('GP', 'Guadalupe', 82),
  ('GU', 'Guam', 83),
  ('GT', 'Guatemala', 84),
  ('GF', 'Guayana Francesa', 85),
  ('GG', 'Guernsey', 86),
  ('GN', 'Guinea', 87),
  ('GQ', 'Guinea Ecuatorial', 88),
  ('GW', 'Guinea-Bissau', 89),
  ('GY', 'Guyana', 90),
  ('HT', 'Haití', 91),
  ('HN', 'Honduras', 92),
  ('HK', 'Hong Kong', 93),
  ('HU', 'Hungría', 94),
  ('IN', 'India', 95),
  ('ID', 'Indonesia', 96),
  ('IQ', 'Irak', 97),
  ('IE', 'Irlanda', 98),
  ('BV', 'Isla Bouvet', 99),
  ('IM', 'Isla de Man', 100),
  ('NF', 'Isla Norfolk', 101),
  ('IS', 'Islandia', 102),
  ('CX', 'Islas Navidad', 103),
  ('CC', 'Islas Cocos', 104),
  ('CK', 'Islas Cook', 105),
  ('FO', 'Islas Faroe', 106),
  ('GS', 'Islas Georgias d. S.-Sandwich d. S.', 107),
  ('HM', 'Islas Heard y McDonald', 108),
  ('FK', 'Islas Malvinas (Falkland)', 109),
  ('MP', 'Islas Marianas del Norte', 110),
  ('MH', 'Islas Marshall', 111),
  ('PN', 'Islas Pitcairn', 112),
  ('TC', 'Islas Turcas y Caicos', 113),
  ('UM', 'Islas Ultramarinas de E.E.U.U', 114),
  ('VI', 'Islas Vírgenes', 115),
  ('IL', 'Israel', 116),
  ('IT', 'Italia', 117),
  ('JM', 'Jamaica', 118),
  ('JP', 'Japón', 119),
  ('JE', 'Jersey', 120),
  ('JO', 'Jordania', 121),
  ('KZ', 'Kazajistán', 122),
  ('KE', 'Kenia', 123),
  ('KG', 'Kirguistán', 124),
  ('KI', 'Kiribati', 125),
  ('KW', 'Kuwait', 126),
  ('LA', 'Laos, República Democrática', 127),
  ('LS', 'Lesotho', 128),
  ('LV', 'Letonia', 129),
  ('LB', 'Líbano', 130),
  ('LR', 'Liberia', 131),
  ('LY', 'Libia', 132),
  ('LI', 'Liechtenstein', 133),
  ('LT', 'Lituania', 134),
  ('LU', 'Luxemburgo', 135),
  ('MO', 'Macao', 136),
  ('MK', 'Macedonia', 137),
  ('MG', 'Madagascar', 138),
  ('MY', 'Malasia', 139),
  ('MW', 'Malawi', 140),
  ('MV', 'Maldivas', 141),
  ('ML', 'Malí', 142),
  ('MT', 'Malta', 143),
  ('MA', 'Marruecos', 144),
  ('MQ', 'Martinica e.a.', 145),
  ('MU', 'Mauricio', 146),
  ('MR', 'Mauritania', 147),
  ('YT', 'Mayotte', 148),
  ('MX', 'México', 149),
  ('FM', 'Micronesia', 150),
  ('MD', 'Moldavia, República de', 151),
  ('MC', 'Mónaco', 152),
  ('MN', 'Mongolia', 153),
  ('ME', 'Montenegro', 154),
  ('MS', 'Montserrat', 155),
  ('MZ', 'Mozambique', 156),
  ('MM', 'Myanmar', 157),
  ('NA', 'Namibia', 158),
  ('NR', 'Nauru', 159),
  ('NP', 'Nepal', 160),
  ('NI', 'Nicaragua', 161),
  ('NE', 'Níger', 162),
  ('NG', 'Nigeria', 163),
  ('NU', 'Niue', 164),
  ('NO', 'Noruega', 165),
  ('NC', 'Nueva Caledonia', 166),
  ('NZ', 'Nueva Zelanda', 167),
  ('OM', 'Omán', 168),
  ('NL', 'Países Bajos', 169),
  ('PK', 'Pakistán', 170),
  ('PW', 'Palaos', 171),
  ('PS', 'Palestina', 172),
  ('PA', 'Panamá', 173),
  ('PG', 'Papúa, Nueva Guinea', 174),
  ('PY', 'Paraguay', 175),
  ('PE', 'Perú', 176),
  ('PF', 'Polinesia Francesa', 177),
  ('PL', 'Polonia', 178),
  ('PT', 'Portugal', 179),
  ('PR', 'Puerto Rico', 180),
  ('QA', 'Qatar', 181),
  ('GB', 'Reino Unido', 182),
  ('KP', 'Rep. Democrática popular de Corea', 183),
  ('CZ', 'República Checa', 184),
  ('KR', 'República de Corea', 185),
  ('CD', 'República Democrática del Congo', 186),
  ('DO', 'República Dominicana', 187),
  ('IR', 'República Islámica de Irán', 188),
  ('RE', 'Reunión', 189),
  ('RW', 'Ruanda', 190),
  ('RO', 'Rumania', 191),
  ('RU', 'Rusia', 192),
  ('EH', 'Sahara Occidental', 193),
  ('BL', 'Saint Barthélemy', 194),
  ('MF', 'Saint Martin (French part)', 195),
  ('SB', 'Salomón, Islas', 196),
  ('WS', 'Samoa', 197),
  ('AS', 'Samoa Americana', 198),
  ('KN', 'San Cristóbal y Nieves', 199),
  ('SM', 'San Marino', 200),
  ('PM', 'San Pedro y Miquelón', 201),
  ('VC', 'San Vicente y las Granadinas', 202),
  ('SH', 'Santa Elena', 203),
  ('LC', 'Santa Lucía', 204),
  ('ST', 'Santo Tomé y Príncipe', 205),
  ('SN', 'Senegal', 206),
  ('RS', 'Serbia', 207),
  ('SC', 'Seychelles', 208),
  ('SL', 'Sierra Leona', 209),
  ('SG', 'Singapur', 210),
  ('SX', 'Sint Maarten (Dutch part)', 211),
  ('SY', 'Siria', 212),
  ('SO', 'Somalia', 213),
  ('SS', 'South Sudan', 214),
  ('LK', 'Sri Lanka', 215),
  ('ZA', 'Sudáfrica', 216),
  ('SD', 'Sudán', 217),
  ('SE', 'Suecia', 218),
  ('CH', 'Suiza', 219),
  ('SR', 'Surinám', 220),
  ('SJ', 'Svalbard y Jan Mayen', 221),
  ('SZ', 'Swazilandia', 222),
  ('TH', 'Tailandia', 223),
  ('TW', 'Taiwan, Provincia de China', 224),
  ('TZ', 'Tanzania, República Unida de', 225),
  ('TJ', 'Tayikistán', 226),
  ('IO', 'Territorio Británico Océano Indico', 227),
  ('TF', 'Territorios Australes Franceses', 228),
  ('TL', 'Timor Oriental', 229),
  ('TG', 'Togo', 230),
  ('TK', 'Tokelau', 231),
  ('TO', 'Tonga', 232),
  ('TT', 'Trinidad y Tobago', 233),
  ('TN', 'Túnez', 234),
  ('TM', 'Turkmenistán', 235),
  ('TR', 'Turquía', 236),
  ('TV', 'Tuvalu', 237),
  ('UA', 'Ucrania', 238),
  ('UG', 'Uganda', 239),
  ('UY', 'Uruguay', 240),
  ('UZ', 'Uzbekistán', 241),
  ('VU', 'Vanuatu', 242),
  ('VE', 'Venezuela', 243),
  ('VN', 'Vietnam', 244),
  ('VG', 'Islas Vírgenes Británicas', 245),
  ('WF', 'Wallis y Fortuna, Islas', 246),
  ('YE', 'Yemen', 247),
  ('ZM', 'Zambia', 248),
  ('ZW', 'Zimbabue', 249)
;

-- --------------------------------------------------
-- CAT-021 Documentos Asociados — 4 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_021_documentos_asociados (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_021_documentos_asociados_codigo ON cat_021_documentos_asociados (codigo);

INSERT INTO cat_021_documentos_asociados (codigo, descripcion, orden) VALUES
  ('1', 'Emisor', 1),
  ('2', 'Receptor', 2),
  ('3', 'Médico (solo aplica para contribuyentes obligados a la presentación de F-958)', 3),
  ('4', 'Transporte (solo aplica para Factura de exportación)', 4)
;

-- --------------------------------------------------
-- CAT-022 Tipo de documento de identificación  — 5 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_022_tipo_documento_identificacion (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_022_tipo_documento_identificacion_codigo ON cat_022_tipo_documento_identificacion (codigo);

INSERT INTO cat_022_tipo_documento_identificacion (codigo, descripcion, orden) VALUES
  ('36', 'NIT', 1),
  ('13', 'DUI', 2),
  ('37', 'Otro', 3),
  ('03', 'Pasaporte', 4),
  ('02', 'Carnet de Residente', 5)
;

-- --------------------------------------------------
-- CAT-023 Operaciones Especiales — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_023_operaciones_especiales (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_023_operaciones_especiales_codigo ON cat_023_operaciones_especiales (codigo);

INSERT INTO cat_023_operaciones_especiales (codigo, descripcion, orden) VALUES
  ('02', 'Factura de venta simplificada', 1),
  ('97', 'Comprobantes de Control Interno', 2)
;

-- --------------------------------------------------
-- CAT-024 Motivo del evento — 3 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_024_motivo_evento (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_024_motivo_evento_codigo ON cat_024_motivo_evento (codigo);

INSERT INTO cat_024_motivo_evento (codigo, descripcion, orden) VALUES
  ('1', 'Error en la Información del Documento Tributario Electrónico a invalidar.', 1),
  ('2', 'Rescindir de la operación realizada.', 2),
  ('3', 'Otro', 3)
;

-- --------------------------------------------------
-- CAT-025 Título a que se remiten los bienes — 5 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_025_titulo_bienes (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_025_titulo_bienes_codigo ON cat_025_titulo_bienes (codigo);

INSERT INTO cat_025_titulo_bienes (codigo, descripcion, orden) VALUES
  ('01', 'Depósito', 1),
  ('02', 'Propiedad', 2),
  ('03', 'Consignación', 3),
  ('04', 'Traslado', 4),
  ('05', 'Otros', 5)
;

-- --------------------------------------------------
-- CAT-026 Tipo de Donación — 3 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_026_tipo_donacion (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_026_tipo_donacion_codigo ON cat_026_tipo_donacion (codigo);

INSERT INTO cat_026_tipo_donacion (codigo, descripcion, orden) VALUES
  ('1', 'Efectivo', 1),
  ('2', 'Bien', 2),
  ('3', 'Servicio', 3)
;

-- --------------------------------------------------
-- CAT-027 Recinto fiscal — 48 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_027_recinto_fiscal (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_027_recinto_fiscal_codigo ON cat_027_recinto_fiscal (codigo);

INSERT INTO cat_027_recinto_fiscal (codigo, descripcion, orden) VALUES
  ('01', 'Terrestre San Bartolo', 1),
  ('02', 'Marítima de Acajutla', 2),
  ('03', 'Aérea De Comalapa', 3),
  ('04', 'Terrestre Las Chinamas', 4),
  ('05', 'Terrestre La Hachadura', 5),
  ('06', 'Terrestre Santa Ana', 6),
  ('07', 'Terrestre San Cristóbal', 7),
  ('08', 'Terrestre Anguiatú', 8),
  ('09', 'Terrestre El Amatillo', 9),
  ('10', 'Marítima La Unión', 10),
  ('11', 'Terrestre El Poy', 11),
  ('12', 'Terrestre Metalío', 12),
  ('15', 'Fardos Postales', 13),
  ('16', 'Z.F. San Marcos', 14),
  ('17', 'Z.F. El Pedregal', 15),
  ('18', 'Z.F. San Bartolo', 16),
  ('20', 'Z.F. Exportsalva', 17),
  ('21', 'Z.F. American Park', 18),
  ('23', 'Z.F. Internacional', 19),
  ('24', 'Z.F. Diez', 20),
  ('26', 'Z.F. Miramar', 21),
  ('27', 'Z.F. Santo Tomas', 22),
  ('28', 'Z.F. Santa Tecla', 23),
  ('29', 'Z.F. Santa Ana', 24),
  ('30', 'Z.F. La Concordia', 25),
  ('31', 'Aérea Ilopango', 26),
  ('32', 'Z.F. Pipil', 27),
  ('33', 'Puerto Barillas', 28),
  ('34', 'Z.F. Calvo Conservas', 29),
  ('35', 'Feria Internacional', 30),
  ('36', 'Aduana El Papalón', 31),
  ('37', 'Z.F. Sam-Li', 32),
  ('38', 'Z.F. San José', 33),
  ('39', 'Z.F. Las Mercedes', 34),
  ('40', 'Z.F. EMCO', 35),
  ('41', 'Z.F. Gigante', 36),
  ('42', 'Z.F. NOVABES', 37),
  ('43', 'Z.F. INHDELVA', 38),
  ('71', 'Aldesa', 39),
  ('72', 'Agdosa Merliot', 40),
  ('73', 'Bodesa', 41),
  ('76', 'Delegacion DHL', 42),
  ('77', 'Transauto', 43),
  ('80', 'Nejapa', 44),
  ('81', 'Almaconsa', 45),
  ('83', 'Agdosa Apopa', 46),
  ('85', 'Gutiérrez Courier Y Cargo', 47),
  ('99', 'San Bartolo Envío Hn/Gt', 48)
;

-- --------------------------------------------------
-- CAT-028 Régimen — 90 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_028_regimen (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_028_regimen_codigo ON cat_028_regimen (codigo);

INSERT INTO cat_028_regimen (codigo, descripcion, orden) VALUES
  ('1000.000', 'Exportación Definitiva, Régimen Común', 1),
  ('1040.000', 'Exportación Definitiva Sustitución de Mercancías, Régimen Común', 2),
  ('1041.020', 'Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI', 3),
  ('1041.021', 'Exportación Definitiva Proveniente de Franquicia Provisional, Franq. Presidenciales exento de DAI e IVA', 4),
  ('1048.025', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Maquinaria y Equipo LZF. DPA', 5),
  ('1048.031', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Distribución Internacional', 6),
  ('1048.032', 'Exportación Definitiva Proveniente. de Franquicia Definitiva, Operaciones Internacionales de Logística', 7),
  ('1048.033', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Centro Internacional de llamadas(Call Center)', 8),
  ('1048.034', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Tecnologias de Información LSI', 9),
  ('1048.035', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Investigación y Desarrollo LSI', 10),
  ('1048.036', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Embarcaciones Marítimas LSI', 11),
  ('1048.037', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Aeronaves LSI', 12),
  ('1048.038', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Procesos Empresariales LSI', 13),
  ('1048.039', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Medico-Hospitalarios LSI', 14),
  ('1048.040', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Servicios Financieros Internacionales LSI', 15),
  ('1048.043', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación y Mantenimiento de Contenedores LSI', 16),
  ('1048.044', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Reparación de Equipos Tecnológicos LSI', 17),
  ('1048.054', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Atención Ancianos y Convalecientes LSI', 18),
  ('1048.055', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Telemedicina LSI', 19),
  ('1048.056', 'Exportación Definitiva Proveniente de Franquicia Definitiva, Cinematografía LSI', 20),
  ('1052.000', 'Exportación Definitiva de DPA con origen en Compras Locales, Régimen Común', 21),
  ('1054.000', 'Exportación Definitiva de Zona Franca con origen en Compras Locales, Régimen Común', 22),
  ('1100.000', 'Exportación Definitiva de Envíos de Socorro , Régimen Común', 23),
  ('1200.000', 'Exportación Definitiva de Envíos Postales, Régimen Común', 24),
  ('1300.000', 'Exportación Definitiva Envíos que  requieren despacho urgente, Régimen Común', 25),
  ('1400.000', 'Exportación Definitiva  Courier, Régimen Común', 26),
  ('1400.011', 'Exportación Definitiva  Courier, Muestras Sin Valor Comercial', 27),
  ('1400.012', 'Exportación Definitiva  Courier, Material Publicitario', 28),
  ('1400.017', 'Exportación Definitiva  Courier, Declaración de Documentos', 29),
  ('1500.000', 'Exportación Definitiva Menaje de casa, Régimen Común', 30),
  ('2100.000', 'Exportación Temporal para Perfeccionamiento Pasivo, Régimen Común', 31),
  ('2100.065', 'Exportación Temporal para Perfeccionamiento Pasivo, De Mercado Nacional a ZF o DPA', 32),
  ('2200.000', 'Exportación Temporal con Reimportación en el mismo estado, Régimen Común', 33),
  ('2200.065', 'Exportación Temporal con Reimportación en el mismo estado, De Mercado Nacional a ZF o DPA', 34),
  ('2400.000', 'Traslados Definitivos', 35),
  ('3050.000', 'Reexportación Proveniente de Importación Temporal, Régimen Común', 36),
  ('3051.000', 'Reexportación Proveniente de Tiendas Libres, Régimen Común', 37),
  ('3052.000', 'Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo, Régimen Común', 38),
  ('3053.000', 'Reexportación Proveniente de Admisión Temporal, Régimen Común', 39),
  ('3054.000', 'Reexportación Proveniente de Régimen de Zona Franca, Régimen Común', 40),
  ('3055.000', 'Reexportación Proveniente de Admisión Temporal para Perfeccionamiento Activo con Garantía, Régimen Común', 41),
  ('3056.000', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Régimen Común', 42),
  ('3056.047', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión a Departamento de Subastas', 43),
  ('3056.057', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios', 44),
  ('3056.058', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios', 45),
  ('3056.072', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Decreto 738 Eléctricos e Híbridos', 46),
  ('3056.081', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, Remisión entre Usuarios Directos LSI', 47),
  ('3056.084', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, De una LSI para un DPA', 48),
  ('3056.085', 'Reexportación Proveniente de Admisión Temporal Distribución Internacional Parque de Servicios, De una LSI para una ZF', 49),
  ('3057.000', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Régimen Común', 50),
  ('3057.047', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión a Departamento de Subastas', 51),
  ('3057.057', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios', 52),
  ('3057.058', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios', 53),
  ('3057.081', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, Remisión entre Usuarios Directos LSI', 54),
  ('3057.084', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, De una LSI para un DPA', 55),
  ('3057.085', 'Reexportación Proveniente de Admisión Temporal Operaciones Internacional de Logística Parque de Servicios, De una LSI para una ZF', 56),
  ('3058.033', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Centro Internacional de llamadas(Call Center)', 57),
  ('3058.034', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Tecnologías de Información LSI', 58),
  ('3058.035', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Investigación y Desarrollo LSI', 59),
  ('3058.036', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Embarcaciones Marítimas LSI', 60),
  ('3058.037', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Aeronaves LSI', 61),
  ('3058.038', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Procesos Empresariales LSI', 62),
  ('3058.039', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Servicios Medico-Hospitalarios LSI', 63),
  ('3058.040', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Servicios Financieros Internacionales LSI', 64),
  ('3058.043', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación y Mantenimiento de Contenedores LSI', 65),
  ('3058.044', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Reparación de Equipos Tecnológicos LSI', 66),
  ('3058.054', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Atención Ancianos y Convalecientes LSI', 67),
  ('3058.055', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Telemedicina LSI', 68),
  ('3058.056', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Cinematografía LSI', 69),
  ('3058.082', 'Reexportación Proveniente de Admisión Temporal Centro Servicio LSI, Remisión entre Centros de Servicios LSI', 70),
  ('3059.000', 'Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Régimen Común', 71),
  ('3059.057', 'Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos del Mismo Parque de Servicios', 72),
  ('3059.058', 'Reexportación Proveniente de Admisión Temporal Reparación de Equipo Tecnológico Parque de Servicios, Remisión entre Usuarios Directos de Diferente Parque de Servicios', 73),
  ('3059.033', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Centro Internacional de llamadas(Call Center)', 74),
  ('3059.034', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Tecnologías de Información LSI', 75),
  ('3059.035', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Investigación y Desarrollo LSI', 76),
  ('3059.038', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Procesos Empresariales LSI', 77),
  ('3059.039', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Servicios Medico-Hospitalarios LSI', 78),
  ('3059.040', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Servicios Financieros Internacionales LSI', 79),
  ('3059.044', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Reparación de Equipos Tecnológicos LSI', 80),
  ('3059.047', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Remisión a Departamento de Subastas', 81),
  ('3059.054', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Atención Ancianos y Convalecientes LSI', 82),
  ('3059.055', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Telemedicina LS', 83),
  ('3059.056', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Cinematografía LSI', 84),
  ('3059.081', 'Reexportación Proveniente de Servicios Internacionales en Parques de Servicios, Remisión entre Usuarios Directos', 85),
  ('3070.000', 'Reexportación Proveniente de Depósito., Régimen Común', 86),
  ('3070.047', 'Reexportación Proveniente de Depósito., Remisión a Departamento de Subastas', 87),
  ('3070.072', 'Reexportación Proveniente de Depósito., Decreto 738 Eléctricos e Híbridos', 88),
  ('3071.000', 'Reexp. Prov. de Deposito.', 89),
  ('0000.000', 'Tránsito Aduanero', 90)
;

-- --------------------------------------------------
-- CAT-029 Tipo de persona — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_029_tipo_persona (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_029_tipo_persona_codigo ON cat_029_tipo_persona (codigo);

INSERT INTO cat_029_tipo_persona (codigo, descripcion, orden) VALUES
  ('1', 'Persona Natural', 1),
  ('2', 'Persona Jurídica', 2)
;

-- --------------------------------------------------
-- CAT-030 Transporte  — 6 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_030_transporte (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_030_transporte_codigo ON cat_030_transporte (codigo);

INSERT INTO cat_030_transporte (codigo, descripcion, orden) VALUES
  ('1', 'TERRESTRE', 1),
  ('2', 'AÉREO', 2),
  ('3', 'MARÍTIMO', 3),
  ('4', 'FERREO', 4),
  ('5', 'MULTIMODAL', 5),
  ('6', 'CORREO', 6)
;

-- --------------------------------------------------
-- CAT-031 INCOTERMS — 11 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_031_incoterms (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_031_incoterms_codigo ON cat_031_incoterms (codigo);

INSERT INTO cat_031_incoterms (codigo, descripcion, orden) VALUES
  ('01', 'EXW-En fabrica', 1),
  ('02', 'FCA-Libre transportista', 2),
  ('03', 'CPT-Transporte pagado hasta', 3),
  ('04', 'CIP-Transporte y seguro pagado hasta', 4),
  ('05', 'DAP-Entrega en el lugar', 5),
  ('06', 'DPU-Entregado en el lugar descargado', 6),
  ('07', 'DDP-Entrega con impuestos pagados', 7),
  ('08', 'FAS-Libre al costado del buque', 8),
  ('09', 'FOB-Libre a bordo', 9),
  ('10', 'CFR-Costo y flete', 10),
  ('11', 'CIF- Costo seguro y flete', 11)
;

-- --------------------------------------------------
-- CAT-032 Domicilio Fiscal — 2 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_032_domicilio_fiscal (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_032_domicilio_fiscal_codigo ON cat_032_domicilio_fiscal (codigo);

INSERT INTO cat_032_domicilio_fiscal (codigo, descripcion, orden) VALUES
  ('1', 'Domiciliado', 1),
  ('2', 'No Domiciliado', 2)
;

-- --------------------------------------------------
-- CAT-033 Tipo de Régimen — 4 registros
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS cat_033_tipo_regimen (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(16)  NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  orden       INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cat_033_tipo_regimen_codigo ON cat_033_tipo_regimen (codigo);

INSERT INTO cat_033_tipo_regimen (codigo, descripcion, orden) VALUES
  ('EX-1', 'Exportación Definitiva', 1),
  ('EX-2', 'Exportación Temporal', 2),
  ('EX-3', 'Reexportación', 3),
  ('TA-1', 'Tránsito Aduanero', 4)
;

-- ─────────────────────────────────────────────
-- ADECUACIÓN: configuracion.desc_actividad
-- La descripción oficial de CAT-019 puede alcanzar los 144 caracteres y el
-- servicio la resuelve automáticamente desde el catálogo. Se amplía la
-- columna a VARCHAR(500) para igualar el catálogo y dar margen futuro.
-- ─────────────────────────────────────────────
ALTER TABLE configuracion
  ALTER COLUMN desc_actividad TYPE VARCHAR(500);

-- =============================================
-- FIN DE MIGRACIÓN
-- =============================================
