/**
 * Vue / Nuxt i18n support.
 * Handles vue-i18n (v9+): locales/{lang}.json or src/locales/{lang}.json
 * Also handles Nuxt i18n module: same file structure.
 * Flat or nested JSON — same flatten/unflatten as React.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProntoConfig } from '../config.js'

function localeDir(config: ProntoConfig, cwd: string): string {
  // Check common Vue/Nuxt locations in order
  for (const candidate of [
    config.locale_dir,
    'locales',
    'src/locales',
    'lang',
    'src/lang',
    'i18n/locales',
  ]) {
    if (candidate && existsSync(join(cwd, candidate))) return join(cwd, candidate)
  }
  return join(cwd, config.locale_dir ?? 'locales')
}

export interface VueLocaleFile {
  path: string
  language: string
  strings: Record<string, unknown>
}

export function discoverVueFiles(config: ProntoConfig, cwd: string): VueLocaleFile[] {
  const dir = localeDir(config, cwd)
  if (!existsSync(dir)) return []

  const sourceLang = config.source_language
  const files: VueLocaleFile[] = []

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') && !file.endsWith('.js') && !file.endsWith('.ts')) continue
    const lang = file.replace(/\.(json|js|ts)$/, '')
    if (lang !== sourceLang) continue
    const path = join(dir, file)
    try {
      const content = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      files.push({ path, language: lang, strings: content })
    } catch { /* skip non-JSON */ }
  }

  return files
}

export function getExistingVue(config: ProntoConfig, cwd: string, lang: string): Record<string, unknown> | null {
  const dir = localeDir(config, cwd)
  for (const ext of ['json', 'js', 'ts']) {
    const path = join(dir, `${lang}.${ext}`)
    if (existsSync(path)) {
      try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { return null }
    }
  }
  return null
}

export function writeVueLocale(config: ProntoConfig, cwd: string, lang: string, strings: Record<string, unknown>): string {
  const dir = localeDir(config, cwd)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, `${lang}.json`)
  writeFileSync(path, JSON.stringify(strings, null, 2) + '\n', 'utf8')
  return path
}

export function resolvedLocaleDir(config: ProntoConfig, cwd: string): string {
  return localeDir(config, cwd)
}
