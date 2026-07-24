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
