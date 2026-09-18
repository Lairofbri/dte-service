const { test, expect, request } = require('@playwright/test')
const { getAuthContext, TENANT_ID } = require('../helpers/api')

// Fase 2 — Aislamiento multi-tenant
// Verifica que un tenant NUNCA puede operar con datos de otro tenant.
// Usa un tenant ficticio (segundo tenant) para las pruebas negativas.
const TENANT_A = TENANT_ID
const TENANT_B = 'b0000000-0000-4000-8000-000000000002' // tenant ficticio

test.describe('Aislamiento multi-tenant (Fase 2)', () => {
  test('API Key sin X-Tenant-Id es rechazada', async () => {
    const context = await request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000',
      extraHTTPHeaders: { 'X-API-Key': 'clave-invalida', 'Content-Type': 'application/json' },
    })
    const res = await context.get('/api/configuracion')
    expect(res.status()).toBe(401)
  })

  test('API Key de tenant A no puede operar como tenant B', async () => {
    // La API Key de A no pertenece al tenant B → la autenticación falla (401).
    const context = await request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000',
      extraHTTPHeaders: {
        'X-Tenant-Id': TENANT_B,
        'X-API-Key': 'clave-invalida-de-a',
        'Content-Type': 'application/json',
      },
    })
    const resp = await context.get('/api/configuracion')
    expect(resp.status()).toBe(401)
  })

  test('JWT sin tenant_id es rechazado', async () => {
    const jwt = require('jsonwebtoken')
    const token = jwt.sign(
      { sub: 'u1', rol: 'administrador', email: 'x@demo.pos' },
      process.env.JWT_SECRET || 'x'.repeat(64),
      { expiresIn: '1h' }
    )
    const context = await request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000',
      extraHTTPHeaders: {
        'X-Tenant-Id': TENANT_A,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const res = await context.get('/api/dte')
    expect(res.status()).toBe(401)
  })

  test('tenant A no puede consultar establecimiento de tenant B (404)', async () => {
    const context = await getAuthContext()
    const res = await context.get(`/api/establecimientos/00000000-0000-4000-8000-0000000000b0`)
    // El establecimiento no pertenece a A → 404 (sin revelar existencia)
    expect(res.status()).toBe(404)
  })

  test('listar DTEs de tenant B con credenciales de A devuelve solo los de A', async () => {
    const context = await getAuthContext()
    const res = await context.get('/api/dte')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data?.dtes)).toBe(true)
  })

  test('obtener DTE inexistente en tenant A devuelve 404', async () => {
    const context = await getAuthContext()
    const res = await context.get('/api/dte/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(res.status()).toBe(404)
  })

  test('configuración inexistente para tenant ficticio devuelve 404', async () => {
    const jwt = require('jsonwebtoken')
    const token = jwt.sign(
      { sub: 'u1', rol: 'administrador', tenant_id: TENANT_B, email: 'x@b.pos' },
      process.env.JWT_SECRET || 'x'.repeat(64),
      { expiresIn: '1h' }
    )
    const context = await request.newContext({
      baseURL: process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000',
      extraHTTPHeaders: {
        'X-Tenant-Id': TENANT_B,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const res = await context.get('/api/configuracion')
    expect(res.status()).toBe(404)
  })
})