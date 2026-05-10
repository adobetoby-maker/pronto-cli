import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

export interface ProntoConfig {
  project_id: string
  source_language: string
  target_languages: string[]
  platform: string
  locale_dir?: string        // React/Next.js: public/locales
  locale_file_pattern?: string // e.g. "{{lng}}/{{ns}}.json"
  do_not_translate?: string[]
  tone?: 'formal' | 'informal' | 'auto'
  domain?: string           // e.g. "medical", "legal", "ecommerce"
  // Platform-specific
  wp_url?: string
  webflow_site_id?: string
  webflow_api_token?: string
  shopify_store?: string
  shopify_api_token?: string
}

const CONFIG_FILE = 'pronto.config.yml'

export function loadConfig(): ProntoConfig | null {
  const path = join(process.cwd(), CONFIG_FILE)
  if (!existsSync(path)) return null
  try {
    return yaml.load(readFileSync(path, 'utf8')) as ProntoConfig
  } catch {
    return null
  }
}

export function saveConfig(config: ProntoConfig): void {
  const path = join(process.cwd(), CONFIG_FILE)
  writeFileSync(path, yaml.dump(config, { lineWidth: 80 }), 'utf8')
}

export function requireConfig(): ProntoConfig {
  const config = loadConfig()
  if (!config) {
    console.error('No pronto.config.yml found. Run: pronto init')
    process.exit(1)
  }
  return config
}
