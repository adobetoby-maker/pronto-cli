/**
 * Flutter ARB (Application Resource Bundle) support.
 * Format: JSON with @metadata keys. Source: lib/l10n/app_en.arb
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProntoConfig } from '../config.js'

export interface ArbFile {
  path: string
  language: string
  strings: Record<string, string>
  metadata: Record<string, unknown>
}

function arbDir(config: ProntoConfig, cwd: string): string {
  return join(cwd, config.locale_dir ?? 'lib/l10n')
}

export function discoverArbFiles(config: ProntoConfig, cwd: string): ArbFile[] {
  const dir = arbDir(config, cwd)
  if (!existsSync(dir)) return []

  const files: ArbFile[] = []
  const sourceLang = config.source_language

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.arb')) continue
    // Match app_en.arb, app_en_US.arb, intl_en.arb etc.
    const langMatch = file.match(/_([a-z]{2}(?:_[A-Z]{2})?)\.arb$/)
    if (!langMatch) continue
    const lang = langMatch[1].replace('_', '-')
    if (lang !== sourceLang && lang !== sourceLang.replace('-', '_')) continue

    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>
    const strings: Record<string, string> = {}
    const metadata: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('@')) {
        metadata[k] = v
      } else if (typeof v === 'string') {
        strings[k] = v
      }
    }

    files.push({ path: join(dir, file), language: lang, strings, metadata })
  }

  return files
}

export function writeArbFile(config: ProntoConfig, cwd: string, lang: string, strings: Record<string, string>, metadata: Record<string, unknown>): string {
  const dir = arbDir(config, cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const prefix = 'app'
  const path = join(dir, `${prefix}_${lang.replace('-', '_')}.arb`)

  // Interleave keys with their @metadata for proper ARB format
  const out: Record<string, unknown> = { '@@locale': lang }
  for (const [k, v] of Object.entries(strings)) {
    out[k] = v
    const meta = metadata[`@${k}`]
    if (meta) out[`@${k}`] = meta
  }

  writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8')
  return path
}

export function getExistingArb(config: ProntoConfig, cwd: string, lang: string): Record<string, string> | null {
  const dir = arbDir(config, cwd)
  const path = join(dir, `app_${lang.replace('-', '_')}.arb`)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => !k.startsWith('@') && typeof v === 'string')
    ) as Record<string, string>
  } catch { return null }
}
