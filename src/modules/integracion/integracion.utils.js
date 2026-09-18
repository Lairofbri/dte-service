const JWT_PARTES = 3;
let ultimoIdEnvio = 0;

const esJwt = (valor) => {
  if (typeof valor !== 'string') return false;
  const partes = valor.split('.');
  return partes.length === JWT_PARTES && partes.every((parte) => /^[A-Za-z0-9_-]+$/.test(parte));
};

const generarIdEnvio = () => {
  const ahora = Date.now();
  ultimoIdEnvio = Math.max(ahora, ultimoIdEnvio + 1);
  return ultimoIdEnvio;
};

const esErrorTransitorio = (error) => {
  if (!error) return false;
  if (['ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) return true;
  if (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout')) return true;
  return Boolean(error.response && error.response.status >= 500);
};

const respuestaHaciendaAuditable = (respuesta = {}) => ({
  estado: respuesta.estado || null,
  codigoMsg: respuesta.codigoMsg || respuesta.codigo_error || null,
  descripcionMsg: respuesta.descripcionMsg || respuesta.descripcion || null,
  selloRecibido: respuesta.selloRecibido || respuesta.sello || null,
  fhProcesamiento: respuesta.fhProcesamiento || respuesta.fh_procesamiento || null,
  observaciones: Array.isArray(respuesta.observaciones) ? respuesta.observaciones : [],
});

module.exports = {
  esJwt,
  generarIdEnvio,
  esErrorTransitorio,
  respuestaHaciendaAuditable,
};
