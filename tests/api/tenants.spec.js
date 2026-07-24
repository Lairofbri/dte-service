const { test, expect } = require('@playwright/test')
const { getApiContext, TENANT_ID } = require('../helpers/api')

test.describe('Tenants API', () => {
  test('GET /api/tenants — debe devolver lista de tenants (público)', async () => {
    const context = await getApiContext()
    const res = await context.get('/api/tenants')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })
})
