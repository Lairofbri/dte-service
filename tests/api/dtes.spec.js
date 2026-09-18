const { test, expect, request } = require('@playwright/test')
const { getAuthContext, loginComoAdmin, API_URL } = require('../helpers/api')

test.describe('DTE API', () => {
  test('GET /api/dte — debe devolver lista de DTEs (o array vacío)', async () => {
    const context = await getAuthContext()
    const res = await context.get('/api/dte')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveProperty('dtes')
  })

  test('GET /api/establecimientos — debe devolver establecimientos del tenant', async () => {
    const token = await loginComoAdmin('admin@demo.pos')
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const res = await ctx.get('/api/establecimientos')
    expect(res.status()).toBe(200)
  })
})

test.describe('DTE API — Idempotencia (Fase 3)', () => {
  test('emitir con la misma idempotency_key reutiliza el mismo DTE', async () => {
    const context = await getAuthContext()

    const bodyBase = {
      items: [{ descripcion: 'Prueba idempotencia', precio_unitario: 10, cantidad: 1, descuento: 0 }],
      receptor: { nombre: 'Consumidor Final', tipo_documento: '13', num_documento: '000000000' },
      metodo_pago: 'efectivo',
      monto_efectivo: 10,
      monto_tarjeta: 0,
      pagos: [{ codigo: '01', montoPago: 10 }],
      idempotency_key: `test-idem-${Date.now()}`,
    }

    const primera = await context.post('/api/dte/emitir/fcf', { data: bodyBase })
    if (!primera.ok()) {
      test.info().annotations.push({
        type: 'note',
        description: `Emisión no disponible en este entorno (status ${primera.status()}): ${(await primera.json()).mensaje ?? ''}. Requiere tenant con configuracion/establecimiento + firmador + Hacienda de pruebas.`,
      })
      expect([400, 422, 500, 503]).toContain(primera.status())
      return
    }

    const primeraData = (await primera.json()).data
    expect(primeraData.codigo_generacion).toBeTruthy()

    // Reintento con la misma clave: NO debe generar un nuevo correlativo ni UUID.
    const segunda = await context.post('/api/dte/emitir/fcf', { data: bodyBase })
    expect(segunda.ok()).toBeTruthy()
    const segundaData = (await segunda.json()).data
    expect(segundaData.codigo_generacion).toBe(primeraData.codigo_generacion)
    expect(segundaData.numero_control).toBe(primeraData.numero_control)
    expect(segundaData.reutilizado).toBe(true)
  })
})
