/**
 * Framer localization support.
 * Framer exports a translations.json file with this shape:
 * {
 *   "en-US": { "key": "value", ... },
 *   "es": { "key": "value", ... }
 * }
 *
 * Workflow:
 * 1. Export translations.json from Framer → drop in project root
 * 2. pronto translate — fills in all target languages
 * 3. Upload updated translations.json back to Framer
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ProntoConfig } from '../config.js'

export type FramerTranslations = Record<string, Record<string, string>>

function translationsPath(config: ProntoConfig, cwd: string): string {
  return join(cwd, config.locale_dir ?? '.', 'translations.json')
}

export function loadFramerFile(config: ProntoConfig, cwd: string): FramerTranslations | null {
  const path = translationsPath(config, cwd)
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as FramerTranslations } catch { return null }
}

export function getFramerSourceStrings(data: FramerTranslations, sourceLang: string): Record<string, string> {
  // Framer uses locale codes like "en-US", "en", etc.
  const key = Object.keys(data).find(k => k === sourceLang || k.startsWith(sourceLang + '-'))
  return key ? data[key] : {}
}

export function getFramerExistingTranslation(data: FramerTranslations, lang: string): Record<string, string> | null {
  const key = Object.keys(data).find(k => k === lang || k.startsWith(lang + '-'))
  return key ? data[key] : null
}

export function writeFramerFile(config: ProntoConfig, cwd: string, data: FramerTranslations): string {
  const path = translationsPath(config, cwd)
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return path
}
