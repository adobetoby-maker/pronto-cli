import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { join } from 'path'
import { existsSync } from 'fs'
import { requireAuth, PRONTO_API } from '../lib/auth.js'
import { saveConfig, loadConfig } from '../lib/config.js'
import { detectNextI18nStyle } from '../lib/platforms/nextjs.js'

const PLATFORMS = [
  { title: 'React (CRA / Vite)', value: 'react' },
  { title: 'Next.js (next-intl / next-i18next)', value: 'nextjs' },
  { title: 'Vue / Nuxt', value: 'vue' },
  { title: 'Flutter', value: 'flutter' },
  { title: 'iOS (Xcode .strings)', value: 'ios' },
  { title: 'Android (strings.xml)', value: 'android' },
  { title: 'Phoenix / Gettext', value: 'phoenix' },
  { title: 'go-i18n', value: 'go-i18n' },
  { title: 'WordPress (PHP)', value: 'wordpress' },
  { title: 'Webflow (CSV export)', value: 'webflow' },
  { title: 'Shopify (Liquid)', value: 'shopify' },
  { title: 'Squarespace', value: 'squarespace' },
  { title: 'Framer (JSON)', value: 'framer' },
  { title: 'Wix (JSON)', value: 'wix' },
]

const LANGUAGES = [
  { title: 'Spanish (es)', value: 'es' },
  { title: 'French (fr)', value: 'fr' },
  { title: 'German (de)', value: 'de' },
  { title: 'Japanese (ja)', value: 'ja' },
  { title: 'Portuguese (pt)', value: 'pt' },
  { title: 'Chinese Simplified (zh)', value: 'zh' },
  { title: 'Italian (it)', value: 'it' },
  { title: 'Korean (ko)', value: 'ko' },
  { title: 'Dutch (nl)', value: 'nl' },
  { title: 'Russian (ru)', value: 'ru' },
  { title: 'Arabic (ar)', value: 'ar' },
  { title: 'Hindi (hi)', value: 'hi' },
  { title: 'Turkish (tr)', value: 'tr' },
  { title: 'Swedish (sv)', value: 'sv' },
  { title: 'Polish (pl)', value: 'pl' },
]

export function initCommand(program: Command) {
  program
    .command('init')
    .description('Initialize Pronto in your project')
    .option('--yes', 'Accept defaults without prompts')
    .action(async (opts) => {
      const auth = requireAuth()
      const cwd = process.cwd()

      if (loadConfig()) {
        console.log(chalk.yellow('pronto.config.yml already exists. Delete it to re-run init.'))
        process.exit(0)
      }

      console.log(chalk.bold('\nPronto — Initialize project\n'))

      // Auto-detect platform
      let detectedPlatform: string | undefined
      const hasPkgJson = existsSync(join(cwd, 'package.json'))
      if (hasPkgJson) {
        const style = detectNextI18nStyle(cwd)
        if (style !== 'unknown') detectedPlatform = 'nextjs'
        else if (existsSync(join(cwd, 'public/locales'))) detectedPlatform = 'react'
      }
      if (existsSync(join(cwd, 'wp-config.php'))) detectedPlatform = 'wordpress'

      const { platform } = await prompts({
        type: 'select',
        name: 'platform',
        message: 'Platform:',
        choices: PLATFORMS.map(p => ({
          ...p,
          title: p.value === detectedPlatform ? `${p.title} ${chalk.green('(detected)')}` : p.title,
        })),
        initial: PLATFORMS.findIndex(p => p.value === detectedPlatform) ?? 0,
      })

      const { targetLangs } = await prompts({
        type: 'multiselect',
        name: 'targetLangs',
        message: 'Target languages (space to select, enter to confirm):',
        choices: LANGUAGES,
        min: 1,
      })

      const { projectName } = await prompts({
        type: 'text',
        name: 'projectName',
        message: 'Project name:',
        initial: cwd.split('/').pop() ?? 'my-project',
      })

      if (!platform || !targetLangs?.length || !projectName) {
        console.log(chalk.yellow('\nInit cancelled.'))
        process.exit(0)
      }

      const spinner = ora('Creating project...').start()

      // Create project via API
      let projectId = `local_${Date.now()}`
      try {
        const res = await fetch(`${PRONTO_API}/projects`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectName,
            platform,
            source_language: 'en',
            target_languages: targetLangs,
          }),
        })
        if (res.ok) {
          const data = await res.json() as { id: string }
          projectId = data.id
        }
      } catch {
        // offline — use local ID, will sync later
      }

      saveConfig({
        project_id: projectId,
        source_language: 'en',
        target_languages: targetLangs,
        platform,
        locale_dir: platform === 'react' ? 'public/locales' : platform === 'nextjs' ? 'messages' : undefined,
      })

      spinner.succeed(chalk.green('pronto.config.yml created'))
      console.log(chalk.dim(`\n  Platform: ${platform}`))
      console.log(chalk.dim(`  Languages: ${targetLangs.join(', ')}`))
      console.log(chalk.bold('\nRun `pronto translate` to start translating.\n'))
    })
}
