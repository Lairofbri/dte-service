const validarPagosContraTotal = (pagos, total) => {
  const totalPagos = pagos.reduce((sum, pago) => sum + Math.round(Number(pago.montoPago || 0) * 100), 0);
  const totalEsperado = Math.round(Number(total || 0) * 100);
  if (totalPagos !== totalEsperado) {
    throw {
      status: 400,
      mensaje: `La suma de pagos (${(totalPagos / 100).toFixed(2)}) no coincide con el total fiscal (${(totalEsperado / 100).toFixed(2)}).`,
    };
  }
};

module.exports = { validarPagosContraTotal };
