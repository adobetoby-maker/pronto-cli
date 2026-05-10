/**
 * go-i18n support.
 * Format: JSON or TOML message files.
 * Source: active.en.toml / active.en.json (or translate.en.*)
 * go-i18n message shape: { id, description?, one?, other?, translation? }
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProntoConfig } from '../config.js'

export interface GoI18nMessage {
  id: string
  description?: string
  one?: string
  other?: string
  translation?: string  // older go-i18n v1 format
}

function localeDir(config: ProntoConfig, cwd: string): string {
  return join(cwd, config.locale_dir ?? '.')
}

function parseGoI18nJson(content: string): GoI18nMessage[] {
  const parsed = JSON.parse(content) as unknown
  if (Array.isArray(parsed)) return parsed as GoI18nMessage[]
  // Object-keyed format: { "welcome": { "other": "Welcome!" } }
  return Object.entries(parsed as Record<string, unknown>).map(([id, v]) => ({
    id,
    ...(typeof v === 'object' && v !== null ? v : { other: String(v) }),
  })) as GoI18nMessage[]
}

function parseToml(content: string): GoI18nMessage[] {
  const messages: GoI18nMessage[] = []
  // Simple TOML block parser for go-i18n format:
  // [MessageID]
  // description = "..."
  // other = "..."
  const blockRe = /\[([^\]]+)\]\n((?:[^[]+|\n)*)/g
  for (const block of content.matchAll(blockRe)) {
    const id = block[1].trim()
    const body = block[2]
    const msg: GoI18nMessage = { id }
    const fieldRe = /^(\w+)\s*=\s*"""([\s\S]*?)"""|^(\w+)\s*=\s*"([^"]*)"/gm
    for (const field of body.matchAll(fieldRe)) {
      const key = (field[1] ?? field[3]) as keyof GoI18nMessage
      const val = (field[2] ?? field[4] ?? '').trim()
      if (key === 'id' || key === 'description' || key === 'one' || key === 'other' || key === 'translation') {
        msg[key] = val
      }
    }
    messages.push(msg)
  }
  return messages
}

export function discoverGoI18nFiles(config: ProntoConfig, cwd: string): { path: string; messages: GoI18nMessage[]; format: 'json' | 'toml' }[] {
  const dir = localeDir(config, cwd)
  if (!existsSync(dir)) return []

  const sourceLang = config.source_language
  const results: { path: string; messages: GoI18nMessage[]; format: 'json' | 'toml' }[] = []

  for (const file of readdirSync(dir)) {
    // Match: active.en.json, translate.en.toml, en.json, etc.
    const match = file.match(/(?:^|[._])([a-z]{2}(?:-[A-Z]{2})?)\.([jt]son|toml)$/)
    if (!match) continue
    const lang = match[1]
    const ext = match[2]
    if (lang !== sourceLang) continue

    const path = join(dir, file)
    const content = readFileSync(path, 'utf8')
    const format = ext === 'toml' ? 'toml' : 'json'
    const messages = format === 'toml' ? parseToml(content) : parseGoI18nJson(content)
    results.push({ path, messages, format })
  }

  return results
}

export function writeGoI18nJson(config: ProntoConfig, cwd: string, lang: string, messages: GoI18nMessage[]): string {
  const dir = localeDir(config, cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Use same filename pattern as source but with target lang
  const path = join(dir, `active.${lang}.json`)
  writeFileSync(path, JSON.stringify(messages, null, 2) + '\n', 'utf8')
  return path
}

export function messagesToTranslationMap(messages: GoI18nMessage[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of messages) {
    // Prefer 'other' (plural default), fall back to 'translation' (v1), then 'one'
    out[m.id] = m.other ?? m.translation ?? m.one ?? ''
  }
  return out
}

export function applyTranslationsToMessages(
  sourceMessages: GoI18nMessage[],
  translations: Record<string, string>,
): GoI18nMessage[] {
  return sourceMessages.map(m => ({
    ...m,
    other: translations[m.id] ?? m.other,
    ...(m.one ? { one: translations[`${m.id}__one`] ?? translations[m.id] } : {}),
    translation: undefined, // normalize to v2 format
  }))
}
