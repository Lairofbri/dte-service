const { request } = require('@playwright/test')

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000'
const TENANT_ID = process.env.PLAYWRIGHT_TENANT_ID || 'a0000000-0000-4000-8000-000000000001'

async function getApiContext() {
  return await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: {
      'X-Tenant-Id': TENANT_ID,
      'Content-Type': 'application/json',
    },
  })
}

async function loginComoAdmin(email) {
  const context = await getApiContext()
  const res = await context.post('/api/auth/login', {
    data: {
      tenant_id: TENANT_ID,
      email: email || 'gerente@demo.pos',
      password: 'Admin123!',
    },
  })
  const body = await res.json()
  if (!body.data?.access_token) throw new Error(`Login failed: ${JSON.stringify(body)}`)
  return body.data.access_token
}

async function getAuthContext() {
  const token = await loginComoAdmin()
  return await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: {
      'X-Tenant-Id': TENANT_ID,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
}

module.exports = { getApiContext, getAuthContext, loginComoAdmin, API_URL, TENANT_ID }
