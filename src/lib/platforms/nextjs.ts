/**
 * Next.js i18n support — handles both:
 * 1. next-intl: messages/{locale}.json (flat or nested)
 * 2. next-i18next: public/locales/{locale}/{namespace}.json
 * 3. next-i18n-router: app/[locale]/... with messages/
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProntoConfig } from '../config.js'

export type NextI18nStyle = 'next-intl' | 'next-i18next' | 'unknown'

export function detectNextI18nStyle(cwd: string): NextI18nStyle {
  const pkg = join(cwd, 'package.json')
  if (existsSync(pkg)) {
    const content = readFileSync(pkg, 'utf8')
    if (content.includes('"next-intl"')) return 'next-intl'
    if (content.includes('"next-i18next"')) return 'next-i18next'
  }
  // Fallback: check directory structure
  if (existsSync(join(cwd, 'messages'))) return 'next-intl'
  if (existsSync(join(cwd, 'public/locales'))) return 'next-i18next'
  return 'unknown'
}

export interface NextLocaleFile {
  path: string
  language: string
  strings: Record<string, unknown>
}

export function discoverNextIntlFiles(config: ProntoConfig, cwd: string): NextLocaleFile[] {
  const messagesDir = join(cwd, 'messages')
  if (!existsSync(messagesDir)) return []

  const files: NextLocaleFile[] = []
  const sourceLang = config.source_language

  const jsonFiles = readdirSync(messagesDir).filter(f => f.endsWith('.json'))
  for (const file of jsonFiles) {
    const lang = file.replace('.json', '')
    if (lang !== sourceLang) continue
    const content = JSON.parse(readFileSync(join(messagesDir, file), 'utf8')) as Record<string, unknown>
    files.push({ path: join(messagesDir, file), language: lang, strings: content })
  }

  return files
}

export function writeNextIntlTranslation(
  cwd: string,
  targetLang: string,
  strings: Record<string, unknown>,
): string {
  const messagesDir = join(cwd, 'messages')
  if (!existsSync(messagesDir)) mkdirSync(messagesDir, { recursive: true })
  const path = join(messagesDir, `${targetLang}.json`)
  writeFileSync(path, JSON.stringify(strings, null, 2) + '\n', 'utf8')
  return path
}
