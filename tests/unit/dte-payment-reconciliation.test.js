const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPagosContraTotal } = require('../../src/modules/generador/payment.utils');

test('acepta pagos fiscales que coinciden con el total del DTE', () => {
  assert.doesNotThrow(() => validarPagosContraTotal([{ codigo: '01', montoPago: 11.3 }], 11.3));
});

test('rechaza pagos fiscales que incluyen propina sobre un total menor', () => {
  assert.throws(
    () => validarPagosContraTotal([{ codigo: '01', montoPago: 12.3 }], 11.3),
    (error) => error?.mensaje?.includes('no coincide con el total fiscal'),
  );
});
