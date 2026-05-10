import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { ProntoConfig } from '../config.js'

export interface LocaleFile {
  path: string
  language: string
  namespace: string
  strings: Record<string, unknown>
}

export function discoverLocaleFiles(config: ProntoConfig, cwd: string): LocaleFile[] {
  const localeDir = join(cwd, config.locale_dir ?? 'public/locales')
  if (!existsSync(localeDir)) return []

  const files: LocaleFile[] = []
  const sourceLang = config.source_language

  const langDirs = readdirSync(localeDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name === sourceLang)

  for (const langDir of langDirs) {
    const langPath = join(localeDir, langDir.name)
    const nsFiles = readdirSync(langPath).filter(f => f.endsWith('.json'))
    for (const nsFile of nsFiles) {
      const namespace = nsFile.replace('.json', '')
      const content = JSON.parse(readFileSync(join(langPath, nsFile), 'utf8')) as Record<string, unknown>
      files.push({
        path: join(langPath, nsFile),
        language: langDir.name,
        namespace,
        strings: content,
      })
    }
  }

  return files
}

export function getExistingTranslation(
  config: ProntoConfig,
  cwd: string,
  targetLang: string,
  namespace: string,
): Record<string, unknown> | null {
  const localeDir = join(cwd, config.locale_dir ?? 'public/locales')
  const path = join(localeDir, targetLang, `${namespace}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function writeTranslation(
  config: ProntoConfig,
  cwd: string,
  targetLang: string,
  namespace: string,
  strings: Record<string, unknown>,
): string {
  const localeDir = join(cwd, config.locale_dir ?? 'public/locales')
  const dir = join(localeDir, targetLang)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, `${namespace}.json`)
  writeFileSync(path, JSON.stringify(strings, null, 2) + '\n', 'utf8')
  return path
}

export function diffStrings(
  source: Record<string, string>,
  existing: Record<string, string> | null,
): { changed: Record<string, string>; unchanged: number } {
  const changed: Record<string, string> = {}
  let unchanged = 0

  for (const [key, value] of Object.entries(source)) {
    // A string needs translation if it doesn't exist in target yet
    if (!existing || !(key in existing)) {
      changed[key] = value
    } else {
      unchanged++
    }
  }

  return { changed, unchanged }
}
