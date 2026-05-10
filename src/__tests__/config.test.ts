import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Run each test in its own temp directory simulating a project root
function makeTempDir() {
  const dir = join(tmpdir(), `pronto-config-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const dirs: string[] = []
afterEach(() => {
  dirs.forEach(d => { if (existsSync(d)) rmSync(d, { recursive: true, force: true }) })
  dirs.length = 0
})

// loadConfig uses process.cwd(), so we change into the temp dir
import { loadConfig, saveConfig } from '../lib/config.js'

describe('loadConfig', () => {
  it('returns null when no pronto.config.yml exists', () => {
    const dir = makeTempDir(); dirs.push(dir)
    const orig = process.cwd()
    process.chdir(dir)
    try {
      expect(loadConfig()).toBeNull()
    } finally {
      process.chdir(orig)
    }
  })

  it('parses a valid config file', () => {
    const dir = makeTempDir(); dirs.push(dir)
    writeFileSync(join(dir, 'pronto.config.yml'), `
project_id: proj-123
source_language: en
target_languages:
  - es
  - ja
platform: react
locale_dir: public/locales
tone: formal
domain: medical
`.trim())

    const orig = process.cwd()
    process.chdir(dir)
    try {
      const config = loadConfig()
      expect(config).not.toBeNull()
      expect(config!.project_id).toBe('proj-123')
      expect(config!.source_language).toBe('en')
      expect(config!.target_languages).toEqual(['es', 'ja'])
      expect(config!.platform).toBe('react')
      expect(config!.locale_dir).toBe('public/locales')
      expect(config!.tone).toBe('formal')
      expect(config!.domain).toBe('medical')
    } finally {
      process.chdir(orig)
    }
  })
})

describe('saveConfig + loadConfig round-trip', () => {
  it('saves and reloads config correctly', () => {
    const dir = makeTempDir(); dirs.push(dir)
    const orig = process.cwd()
    process.chdir(dir)
    try {
      const config = {
        project_id: 'round-trip-test',
        source_language: 'en',
        target_languages: ['fr', 'de'],
        platform: 'nextjs',
        locale_dir: 'messages',
        do_not_translate: ['Pronto', 'API'],
      }
      saveConfig(config)
      const loaded = loadConfig()
      expect(loaded).toEqual(config)
    } finally {
      process.chdir(orig)
    }
  })
})
