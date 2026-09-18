const MAX_DTES_POR_LOTE = 100;

const dividirEnLotes = (items, maximo = MAX_DTES_POR_LOTE) => {
  if (!Array.isArray(items) || maximo < 1) return [];
  const lotes = [];
  for (let indice = 0; indice < items.length; indice += maximo) {
    lotes.push(items.slice(indice, indice + maximo));
  }
  return lotes;
};

const filtrarResultadosDelLote = (resultado, codigosGeneracion = []) => {
  const permitidos = new Set(codigosGeneracion.filter((codigo) => typeof codigo === 'string').map((codigo) => codigo.toLowerCase()));
  const procesados = Array.isArray(resultado?.procesados) ? resultado.procesados : [];
  const rechazados = Array.isArray(resultado?.rechazados) ? resultado.rechazados : [];
  return {
    procesados: procesados.filter((dte) => typeof dte.codigoGeneracion === 'string' && permitidos.has(dte.codigoGeneracion.toLowerCase())),
    rechazados: rechazados.filter((dte) => typeof dte.codigoGeneracion === 'string' && permitidos.has(dte.codigoGeneracion.toLowerCase())),
  };
};

module.exports = {
  MAX_DTES_POR_LOTE,
  dividirEnLotes,
  filtrarResultadosDelLote,
};
