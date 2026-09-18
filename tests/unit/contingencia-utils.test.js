const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DTES_POR_LOTE,
  dividirEnLotes,
  filtrarResultadosDelLote,
} = require('../../src/modules/contingencia/contingencia.utils');

test('divide contingencias en lotes de máximo 100 documentos', () => {
  const documentos = Array.from({ length: MAX_DTES_POR_LOTE + 1 }, (_, indice) => ({ id: indice }));
  const lotes = dividirEnLotes(documentos);

  assert.equal(lotes.length, 2);
  assert.equal(lotes[0].length, MAX_DTES_POR_LOTE);
  assert.equal(lotes[1].length, 1);
});

test('actualiza únicamente resultados pertenecientes al lote consultado', () => {
  const resultado = filtrarResultadosDelLote({
    procesados: [{ codigoGeneracion: 'ABC' }, { codigoGeneracion: 'NO-PERTENECE' }],
    rechazados: [{ codigoGeneracion: 'DEF' }],
  }, ['abc', 'def']);

  assert.deepEqual(resultado.procesados.map((dte) => dte.codigoGeneracion), ['ABC']);
  assert.deepEqual(resultado.rechazados.map((dte) => dte.codigoGeneracion), ['DEF']);
});
