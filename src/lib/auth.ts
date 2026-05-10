import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.pronto')
const AUTH_FILE = join(CONFIG_DIR, 'auth.json')

export interface AuthConfig {
  apiKey: string
  email: string
  userId: string
}

export function getAuthConfig(): AuthConfig | null {
  if (!existsSync(AUTH_FILE)) return null
  try {
    return JSON.parse(readFileSync(AUTH_FILE, 'utf8'))
  } catch {
    return null
  }
}

export function saveAuthConfig(config: AuthConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function clearAuthConfig(): void {
  if (existsSync(AUTH_FILE)) {
    writeFileSync(AUTH_FILE, '', { mode: 0o600 })
  }
}

export function requireAuth(): AuthConfig {
  const auth = getAuthConfig()
  if (!auth) {
    console.error('Not logged in. Run: pronto login')
    process.exit(1)
  }
  return auth
}

export const PRONTO_API = process.env.PRONTO_API_URL ?? 'https://pronto-en.worker-bee.app/api'
