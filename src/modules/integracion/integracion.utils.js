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

// Estados HTTP del MH que se reintentan sin activar contingencia:
// 408 (timeout del propio MH) y 429 (límite de peticiones).
const ESTADOS_HTTP_TRANSITORIOS = [408, 429];

const esErrorTransitorio = (error) => {
  if (!error) return false;
  if (
    ['ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']
      .includes(error.code)
  ) return true;
  if (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout')) return true;

  const status = error.response?.status;
  if (status === undefined) return false;
  return status >= 500 || ESTADOS_HTTP_TRANSITORIOS.includes(status);
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
