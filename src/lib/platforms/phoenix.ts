/**
 * Phoenix/Elixir Gettext support.
 * Scans .ex/.heex files for gettext("string") / dgettext("domain", "string") calls.
 * Writes .po files to priv/gettext/{locale}/LC_MESSAGES/{domain}.po
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { ProntoConfig } from '../config.js'

export interface GettextString {
  key: string
  domain: string
  locations: string[]
}

const GETTEXT_RE = /(?:dgettext|gettext)\("([^"]+)"(?:,\s*"([^"]+)")?\)/g

export function scanElixirFiles(dir: string): GettextString[] {
  const found = new Map<string, GettextString>()

  function scan(path: string) {
    if (!existsSync(path)) return
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '_build') continue
      const full = join(path, entry.name)
      if (entry.isDirectory()) {
        scan(full)
      } else if (entry.name.endsWith('.ex') || entry.name.endsWith('.heex') || entry.name.endsWith('.exs')) {
        const content = readFileSync(full, 'utf8')
        const relPath = relative(dir, full)
        for (const match of content.matchAll(GETTEXT_RE)) {
          // gettext("msg") — domain is "default", msg is first arg
          // dgettext("domain", "msg") — domain is first arg, msg is second
          const hasDomain = match[2] !== undefined
          const domain = hasDomain ? match[1] : 'default'
          const key = hasDomain ? match[2] : match[1]
          if (!key?.trim()) continue
          const lineNum = content.slice(0, match.index).split('\n').length
          const id = `${domain}::${key}`
          if (found.has(id)) {
            found.get(id)!.locations.push(`${relPath}:${lineNum}`)
          } else {
            found.set(id, { key, domain, locations: [`${relPath}:${lineNum}`] })
          }
        }
      }
    }
  }

  scan(dir)
  return Array.from(found.values())
}

export function groupByDomain(strings: GettextString[]): Record<string, GettextString[]> {
  const out: Record<string, GettextString[]> = {}
  for (const s of strings) {
    if (!out[s.domain]) out[s.domain] = []
    out[s.domain].push(s)
  }
  return out
}

export function generateGettextPo(strings: GettextString[], translations: Record<string, string>, lang: string): string {
  const lines = [
    `msgid ""`,
    `msgstr ""`,
    `"Language: ${lang}\\n"`,
    `"Content-Type: text/plain; charset=UTF-8\\n"`,
    ``,
  ]
  for (const s of strings) {
    for (const loc of s.locations) lines.push(`#: ${loc}`)
    lines.push(`msgid "${escPo(s.key)}"`)
    lines.push(`msgstr "${escPo(translations[s.key] ?? '')}"`)
    lines.push(``)
  }
  return lines.join('\n')
}

function escPo(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

export function writeGettextPoFile(cwd: string, lang: string, domain: string, content: string): string {
  const dir = join(cwd, 'priv', 'gettext', lang, 'LC_MESSAGES')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, `${domain}.po`)
  writeFileSync(path, content, 'utf8')
  return path
}
