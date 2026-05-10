import { describe, it, expect } from 'vitest'

// Smoke tests against the live Pronto API.
// Set PRONTO_API_KEY env var to run authenticated tests.
// Set PRONTO_API_URL to override the default endpoint.

const BASE = process.env.PRONTO_API_URL ?? 'https://pronto-en.worker-bee.app/api'
const API_KEY = process.env.PRONTO_API_KEY ?? ''

describe('API smoke — unauthenticated', () => {
  it('GET /whoami without key → 401', async () => {
    const res = await fetch(`${BASE}/whoami`)
    expect(res.status).toBe(401)
  })

  it('POST /translate without key → 401', async () => {
    const res = await fetch(`${BASE}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strings: { hello: 'Hello' }, targetLanguage: 'es' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /translate with malformed key → 401', async () => {
    const res = await fetch(`${BASE}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not_a_real_key',
      },
      body: JSON.stringify({ strings: { hello: 'Hello' }, targetLanguage: 'es' }),
    })
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!API_KEY)('API smoke — authenticated (PRONTO_API_KEY required)', () => {
  it('GET /whoami returns user info', async () => {
    const res = await fetch(`${BASE}/whoami`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string; email: string }
    expect(body).toHaveProperty('userId')
    expect(body).toHaveProperty('email')
    expect(body.email).toContain('@')
  })

  it('POST /translate returns translated strings', async () => {
    const res = await fetch(`${BASE}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        strings: { greeting: 'Hello', farewell: 'Goodbye' },
        targetLanguage: 'es',
        config: { source_language: 'en' },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { strings: Record<string, string> }
    expect(body).toHaveProperty('strings')
    expect(typeof body.strings.greeting).toBe('string')
    expect(body.strings.greeting.length).toBeGreaterThan(0)
  }, 30_000)
})
