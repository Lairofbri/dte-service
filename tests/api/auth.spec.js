const { test, expect } = require('@playwright/test')
const { getApiContext, getAuthContext, TENANT_ID } = require('../helpers/api')

test.describe('Auth API', () => {
  test('POST /api/auth/login — debe devolver token con credenciales válidas', async () => {
    const context = await getApiContext()
    const res = await context.post('/api/auth/login', {
      data: {
        tenant_id: TENANT_ID,
        email: 'gerente@demo.pos',
        password: 'Admin123!',
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveProperty('access_token')
  })

  test('POST /api/auth/login — debe devolver 401 con credenciales inválidas', async () => {
    const context = await getApiContext()
    const res = await context.post('/api/auth/login', {
      data: {
        tenant_id: TENANT_ID,
        email: 'gerente@demo.pos',
        password: 'wrong-password',
      },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/auth/me — debe devolver usuario autenticado', async () => {
    const context = await getAuthContext()
    const res = await context.get('/api/auth/me')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveProperty('id')
    expect(body.data).toHaveProperty('email')
  })

  test('POST /api/auth/logout — debe cerrar sesión', async () => {
    const context = await getAuthContext()
    const res = await context.post('/api/auth/logout')
    expect(res.status()).toBe(200)
  })

  test('GET /api/auth/me — debe devolver 401 sin token', async () => {
    const context = await getApiContext()
    const res = await context.get('/api/auth/me')
    expect(res.status()).toBe(401)
  })
})
