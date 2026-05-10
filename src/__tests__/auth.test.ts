import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const testHome = join(tmpdir(), `pronto-auth-test-${process.pid}`)

// vi.mock is hoisted before imports so homedir() picks up our fake path
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, homedir: () => testHome }
})

// Import after the mock is registered
const { getAuthConfig, saveAuthConfig, clearAuthConfig } = await import('../lib/auth.js')

const AUTH_FILE = join(testHome, '.pronto', 'auth.json')

beforeEach(() => {
  mkdirSync(join(testHome, '.pronto'), { recursive: true })
})

afterEach(() => {
  rmSync(join(testHome, '.pronto'), { recursive: true, force: true })
})

describe('getAuthConfig', () => {
  it('returns null when auth file does not exist', () => {
    expect(getAuthConfig()).toBeNull()
  })

  it('returns parsed config when file exists', () => {
    const config = { apiKey: 'pronto_test123', email: 'test@example.com', userId: 'user-1' }
    saveAuthConfig(config)
    expect(getAuthConfig()).toEqual(config)
  })

  it('returns null when auth file is empty', () => {
    clearAuthConfig()
    expect(getAuthConfig()).toBeNull()
  })
})

describe('saveAuthConfig', () => {
  it('writes config to disk', () => {
    const config = { apiKey: 'pronto_abc', email: 'a@b.com', userId: 'u1' }
    saveAuthConfig(config)
    const written = JSON.parse(readFileSync(AUTH_FILE, 'utf8'))
    expect(written).toEqual(config)
  })

  it('creates directory if it does not exist', () => {
    rmSync(join(testHome, '.pronto'), { recursive: true, force: true })
    const config = { apiKey: 'pronto_xyz', email: 'x@y.com', userId: 'u2' }
    saveAuthConfig(config)
    expect(existsSync(AUTH_FILE)).toBe(true)
  })
})

describe('clearAuthConfig', () => {
  it('does not throw when no file exists', () => {
    expect(() => clearAuthConfig()).not.toThrow()
  })

  it('empties the file so getAuthConfig returns null', () => {
    saveAuthConfig({ apiKey: 'pronto_test', email: 'e@f.com', userId: 'u3' })
    clearAuthConfig()
    expect(getAuthConfig()).toBeNull()
  })
})
