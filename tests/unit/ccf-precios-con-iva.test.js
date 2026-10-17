// tests/unit/ccf-precios-con-iva.test.js
// Regresión 2026-10-17 — CCF/NC/ND emitidos desde el POS (precios con IVA
// incluido).
//
// El esquema oficial declara los CCF/NC/ND con precios SIN IVA y el resumen
// sumaba 13% sobre el precio del POS, que ya incluía IVA → el total del DTE
// quedaba 13% arriba de lo cobrado y la emisión fallaba con
// «La suma de pagos (10.00) no coincide con el total fiscal (11.30)».
//
// Con `precios_con_iva: true` (el POS convierte los ítems a base) el resumen
// declara el IVA **contenido** en lo cobrado: base + IVA = lo cobrado exacto.
// El frontend DTE (precios netos) NO manda el flag y conserva la fórmula
// histórica (IVA = base × 13%).

// Fallbacks de entorno: garantizan el require en CI sin .env (no se conecta a BD).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dte_service_test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c'.repeat(48);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');
const { emitirCCFSchema } = require('../../src/modules/dtes/dtes.schema');
const { construirItem, construirResumen, redondear2 } = require('../../src/modules/generador/generador.utils');
const { validarPagosContraTotal } = require('../../src/modules/generador/payment.utils');

/** Misma conversión que hace el POS: importe con IVA incluido → base sin IVA. */
const aBaseSinIva = (valor) => Math.round((valor / 1.13) * 1e8) / 1e8;

const pago = (monto) => [{ codigo: '01', montoPago: monto, referencia: null, plazo: null, periodo: null }];

/** CCF v4 no lleva `totalIva` en el resumen: el IVA se declara en `tributos`. */
const ivaDelResumen = (resumen) => resumen.totalIva ?? resumen.tributos?.[0]?.valor ?? 0;

/** Simula el payload que arma el POS para un CCF de un solo ítem. */
const resumenCcfDelPos = (precioConIva, cantidad = 1, descuentoConIva = 0) => {
  const item = construirItem({
    descripcion: 'Producto',
    cantidad,
    precio_unitario: aBaseSinIva(precioConIva),
    descuento: aBaseSinIva(descuentoConIva),
  }, 1, '03');
  const cobrado = redondear2(precioConIva * cantidad - descuentoConIva);
  const resumen = construirResumen([item], '03', 1, pago(cobrado), null, { preciosConIva: true });
  return { resumen, item, cobrado };
};

test('CCF del POS: base + IVA = lo cobrado exacto (100% de los casos, sin descuadre de centavos)', () => {
  // Contrato con `pos-backend` (tests/unit/emitir-payload.test.ts): esta tabla
  // (importe cobrado con IVA incluido → base sin IVA) debe coincidir en ambos
  // repos. Incluye montos donde `base × 13%` NO coincide con el IVA contenido
  // (p. ej. 1.00 → 0.88 + 0.12 = 1.00, mientras la fórmula daría 0.99).
  const montos = [
    { cobrado: 0.01, base: 0.00884956 },
    { cobrado: 0.5, base: 0.44247788 },
    { cobrado: 0.99, base: 0.87610619 },
    { cobrado: 1, base: 0.88495575 },
    { cobrado: 1.13, base: 1 },
    { cobrado: 3.35, base: 2.96460177 },
    { cobrado: 5.25, base: 4.6460177 },
    { cobrado: 10, base: 8.84955752 },
    { cobrado: 12.34, base: 10.92035398 },
    { cobrado: 46.72, base: 41.34513274 },
    { cobrado: 100, base: 88.49557522 },
    { cobrado: 1234.56, base: 1092.53097345 },
  ];

  for (const { cobrado, base } of montos) {
    assert.equal(aBaseSinIva(cobrado), base, `base de ${cobrado} (contrato con pos-backend)`);

    const { resumen } = resumenCcfDelPos(cobrado);
    const iva = ivaDelResumen(resumen);
    assert.equal(resumen.subTotal + iva, cobrado, `base + IVA debe ser ${cobrado}`);
    assert.equal(resumen.montoTotalOperacion, cobrado, `montoTotalOperacion debe ser ${cobrado}`);
    assert.equal(resumen.totalPagar, cobrado, `totalPagar debe ser ${cobrado}`);
    if (resumen.tributos) {
      assert.equal(resumen.tributos[0].valor, iva, 'el tributo debe declarar el IVA del resumen');
    }
    assert.doesNotThrow(
      () => validarPagosContraTotal(pago(cobrado), resumen.totalPagar),
      `los pagos fiscales (${cobrado}) deben cuadrar con el total del DTE`
    );
  }
});

test('CCF del POS: el IVA declarado es el contenido (no suma 13% sobre un precio con IVA)', () => {
  const { resumen, item } = resumenCcfDelPos(10);

  assert.equal(item.ventaGravada, 8.84955752); // base
  assert.equal(resumen.totalGravada, 8.85);
  assert.equal(ivaDelResumen(resumen), 1.15); // 10 − 8.85: IVA contenido
  assert.equal(resumen.totalPagar, 10);
  // La fórmula histórica (base × 13%) daría 1.15 aquí por casualidad; el caso
  // discriminante es 1.00 → 0.12 (contenido) vs 0.11 (fórmula).
  const { resumen: r1 } = resumenCcfDelPos(1);
  assert.equal(ivaDelResumen(r1), 0.12);
  assert.equal(r1.totalPagar, 1);
});

test('CCF del POS: descuento por ítem convertido a base y total exacto', () => {
  const { resumen } = resumenCcfDelPos(10, 1, 1);

  assert.equal(resumen.totalGravada, 8.85);
  assert.equal(resumen.totalDescu, 0.88);
  assert.equal(resumen.subTotal, 7.97);
  assert.equal(ivaDelResumen(resumen), 1.03);
  assert.equal(resumen.totalPagar, 9);
});

test('CCF del POS: varias líneas suman el total cobrado', () => {
  const items = [3.33, 6.67].map((precio, idx) => construirItem({
    descripcion: `Producto ${idx + 1}`, cantidad: 1, precio_unitario: aBaseSinIva(precio), descuento: 0,
  }, idx + 1, '03'));
  const resumen = construirResumen(items, '03', 1, pago(10), null, { preciosConIva: true });

  assert.equal(resumen.totalGravada, 8.85);
  assert.equal(ivaDelResumen(resumen), 1.15);
  assert.equal(resumen.totalPagar, 10);
});

test('CCF sin el flag (frontend DTE, precios netos): conserva la fórmula base × 13%', () => {
  const item = construirItem({ descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, descuento: 0 }, 1, '03');
  const resumen = construirResumen([item], '03', 1, pago(113));

  assert.equal(resumen.totalGravada, 100);
  assert.equal(resumen.subTotal, 100);
  assert.equal(ivaDelResumen(resumen), 13); // 100 × 0.13
  assert.equal(resumen.totalPagar, 113);
});

test('el schema de emisión acepta precios_con_iva y lo deja en false si no viene', () => {
  const base = {
    items: [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 8.84955752 }],
    receptor: { nit: '0614-010101-010-1', nombre: 'Empresa X' },
    pagos: [{ codigo: '01', montoPago: 10 }],
  };

  const conFlag = emitirCCFSchema.validate({ ...base, precios_con_iva: true });
  assert.equal(conFlag.error, undefined);
  assert.equal(conFlag.value.precios_con_iva, true);

  const sinFlag = emitirCCFSchema.validate(base);
  assert.equal(sinFlag.error, undefined);
  assert.equal(sinFlag.value.precios_con_iva, false);
});
