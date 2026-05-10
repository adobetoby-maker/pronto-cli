import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { requireAuth, PRONTO_API } from '../lib/auth.js'
import { requireConfig } from '../lib/config.js'
import { discoverLocaleFiles, getExistingTranslation, diffStrings } from '../lib/platforms/react.js'
import { discoverNextIntlFiles, detectNextI18nStyle } from '../lib/platforms/nextjs.js'
import { scanPhpFiles } from '../lib/platforms/wordpress.js'
import { flattenJson } from '../lib/translator.js'

export function statusCommand(program: Command) {
  program
    .command('status')
    .description('Show translation coverage for your project')
    .action(async () => {
      const auth = requireAuth()
      const config = requireConfig()
      const cwd = process.cwd()

      console.log(chalk.bold('\nPronto status\n'))
      console.log(chalk.dim(`  Platform:  ${config.platform}`))
      console.log(chalk.dim(`  Source:    ${config.source_language}`))
      console.log(chalk.dim(`  Targets:   ${config.target_languages.join(', ')}`))
      console.log()

      if (config.platform === 'react') {
        const localeFiles = discoverLocaleFiles(config, cwd)
        if (!localeFiles.length) {
          console.log(chalk.yellow('No source locale files found.'))
          return
        }

        let totalSource = 0
        const coverage: Record<string, number> = {}

        for (const file of localeFiles) {
          const flat = flattenJson(file.strings) as Record<string, string>
          totalSource += Object.keys(flat).length
          for (const lang of config.target_languages) {
            const existing = getExistingTranslation(config, cwd, lang, file.namespace)
            const existingFlat = existing ? flattenJson(existing) as Record<string, string> : null
            const { unchanged } = diffStrings(flat, existingFlat)
            coverage[lang] = (coverage[lang] ?? 0) + unchanged
          }
        }

        for (const lang of config.target_languages) {
          const done = coverage[lang] ?? 0
          const pct = totalSource ? Math.round((done / totalSource) * 100) : 0
          const bar = progressBar(pct)
          const color = pct === 100 ? chalk.green : pct > 50 ? chalk.yellow : chalk.red
          console.log(`  ${lang.padEnd(6)} ${bar} ${color(`${pct}%`)}  (${done}/${totalSource} strings)`)
        }

      } else if (config.platform === 'wordpress') {
        const spinner = ora('Scanning PHP files...').start()
        const strings = scanPhpFiles(cwd)
        spinner.stop()
        console.log(chalk.dim(`  Total translatable strings: ${strings.length}`))
        console.log(chalk.dim(`  Run \`pronto translate\` to generate .po files`))

      } else {
        console.log(chalk.dim(`Status for "${config.platform}" coming soon.`))
      }

      // Usage from API
      try {
        const res = await fetch(`${PRONTO_API}/usage/summary`, {
          headers: { Authorization: `Bearer ${auth.apiKey}` },
        })
        if (res.ok) {
          const data = await res.json() as { words_this_month: number; cost_usd: string }
          console.log()
          console.log(chalk.dim(`  Words this month: ${data.words_this_month.toLocaleString()}`))
          console.log(chalk.dim(`  Cost:             $${data.cost_usd}`))
        }
      } catch { /* offline */ }

      console.log()
    })
}

function progressBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width)
  return chalk.dim('[') + chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled)) + chalk.dim(']')
}
