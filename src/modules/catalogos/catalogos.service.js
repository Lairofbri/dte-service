// src/modules/catalogos/catalogos.service.js
// Lógica de negocio del módulo de catálogos oficiales de Hacienda
// Principio S (SOLID): solo opera datos, no valida ni responde HTTP
//
// SEGURIDAD: los nombres de tabla provienen EXCLUSIVAMENTE de la whitelist
// estática CATALOGOS (migración 027). Nunca se interpola un valor del
// cliente en SQL — el slug se resuelve contra la whitelist y no existe
// tabla dinámica por entrada del usuario.

const { query } = require('../../config/database');

// Whitelist: slug público → tabla física (migración 027_catalogos_hacienda.sql)
const CATALOGOS = {
  'ambiente-destino':              'cat_001_ambiente_destino',
  'tipo-documento':                'cat_002_tipo_documento',
  'modelo-facturacion':            'cat_003_modelo_facturacion',
  'tipo-transmision':              'cat_004_tipo_transmision',
  'tipo-contingencia':             'cat_005_tipo_contingencia',
  'retencion-iva':                 'cat_006_retencion_iva',
  'tipo-generacion':               'cat_007_tipo_generacion',
  'distrito':                      'cat_008_distrito',
  'tipo-establecimiento':          'cat_009_tipo_establecimiento',
  'tipo-servicio-medico':          'cat_010_tipo_servicio_medico',
  'tipo-item':                     'cat_011_tipo_item',
  'departamento':                  'cat_012_departamento',
  'municipio':                     'cat_013_municipio',
  'unidad-medida':                 'cat_014_unidad_medida',
  'tributos':                      'cat_015_tributos',
  'condicion-operacion':           'cat_016_condicion_operacion',
  'forma-pago':                    'cat_017_forma_pago',
  'plazo':                         'cat_018_plazo',
  'actividad-economica':           'cat_019_actividad_economica',
  'pais':                          'cat_020_pais',
  'documentos-asociados':          'cat_021_documentos_asociados',
  'tipo-documento-identificacion': 'cat_022_tipo_documento_identificacion',
  'operaciones-especiales':        'cat_023_operaciones_especiales',
  'motivo-evento':                 'cat_024_motivo_evento',
  'titulo-bienes':                 'cat_025_titulo_bienes',
  'tipo-donacion':                 'cat_026_tipo_donacion',
  'recinto-fiscal':                'cat_027_recinto_fiscal',
  'regimen':                       'cat_028_regimen',
  'tipo-persona':                  'cat_029_tipo_persona',
  'transporte':                    'cat_030_transporte',
  'incoterms':                     'cat_031_incoterms',
  'domicilio-fiscal':              'cat_032_domicilio_fiscal',
  'tipo-regimen':                  'cat_033_tipo_regimen',
};

/**
 * Listar un catálogo completo (código + descripción) en el orden del Excel oficial.
 * Solo acepta slugs de la whitelist — cualquier otro slug es 404.
 */
const listarCatalogo = async ({ catalogo } = {}) => {
  const tabla = CATALOGOS[catalogo];
  if (!tabla) {
    throw { status: 404, mensaje: 'Catálogo no encontrado.' };
  }

  const { rows } = await query(
    `SELECT codigo, descripcion FROM ${tabla} ORDER BY orden`
  );
  return rows;
};

/**
 * Buscar una actividad económica por código en CAT-019.
 * Devuelve la fila oficial (codigo + descripcion) o null si no existe.
 * Usado por el módulo de configuración para resolver la descripción oficial.
 */
const obtenerActividadEconomica = async ({ codigo } = {}) => {
  if (!codigo) return null;

  const { rows } = await query(
    'SELECT codigo, descripcion FROM cat_019_actividad_economica WHERE codigo = $1',
    [codigo]
  );
  return rows[0] || null;
};

module.exports = {
  CATALOGOS,
  listarCatalogo,
  obtenerActividadEconomica,
};