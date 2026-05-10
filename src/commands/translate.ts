import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { requireAuth, PRONTO_API } from '../lib/auth.js'
import { requireConfig } from '../lib/config.js'
import { translateBatch, flattenJson, unflattenJson } from '../lib/translator.js'
import { discoverLocaleFiles, getExistingTranslation, writeTranslation, diffStrings } from '../lib/platforms/react.js'
import { discoverNextIntlFiles, writeNextIntlTranslation, detectNextI18nStyle } from '../lib/platforms/nextjs.js'
import { scanPhpFiles, generatePot, generatePo, writePotFile, writePoFile } from '../lib/platforms/wordpress.js'

export function translateCommand(program: Command) {
  program
    .command('translate')
    .description('Translate your project strings')
    .option('-l, --lang <lang>', 'Translate only a specific target language')
    .option('--dry-run', 'Show what would be translated without writing files')
    .option('--force', 'Retranslate all strings, not just new ones')
    .action(async (opts) => {
      const auth = requireAuth()
      const config = requireConfig()
      const cwd = process.cwd()

      const targetLangs = opts.lang
        ? config.target_languages.filter((l: string) => l === opts.lang)
        : config.target_languages

      if (!targetLangs.length) {
        console.log(chalk.red(`Language "${opts.lang}" not in target_languages. Check pronto.config.yml`))
        process.exit(1)
      }

      console.log(chalk.bold('\nPronto translate\n'))

      let totalWords = 0
      let totalStrings = 0
      const writtenFiles: string[] = []

      // ── React / Next.js ────────────────────────────────────────────
      if (config.platform === 'react') {
        const localeFiles = discoverLocaleFiles(config, cwd)
        if (!localeFiles.length) {
          console.log(chalk.yellow(`No locale files found in ${config.locale_dir ?? 'public/locales'}`))
          console.log(chalk.dim('Create: public/locales/en/common.json with your source strings'))
          process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          for (const file of localeFiles) {
            const spinner = ora(`  ${file.namespace}`).start()
            const flat = flattenJson(file.strings) as Record<string, string>
            const existing = opts.force ? null : getExistingTranslation(config, cwd, lang, file.namespace)
            const existingFlat = existing ? flattenJson(existing) as Record<string, string> : null
            const { changed, unchanged } = diffStrings(flat, existingFlat)

            if (!Object.keys(changed).length) {
              spinner.succeed(chalk.dim(`  ${file.namespace} — up to date (${unchanged} strings)`))
              continue
            }

            if (opts.dryRun) {
              spinner.info(`  ${file.namespace} — would translate ${Object.keys(changed).length} strings`)
              continue
            }

            try {
              const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
              const merged = { ...(existingFlat ?? {}), ...result.strings }
              const unflat = unflattenJson(merged)
              const path = writeTranslation(config, cwd, lang, file.namespace, unflat as Record<string, unknown>)
              writtenFiles.push(path)
              totalWords += result.wordsProcessed
              totalStrings += Object.keys(changed).length
              spinner.succeed(`  ${file.namespace} — ${chalk.green(Object.keys(changed).length + ' strings')} translated`)
            } catch (err) {
              spinner.fail(`  ${file.namespace} — ${chalk.red(String(err))}`)
            }
          }
        }
      }

      // ── Next.js (next-intl: messages/{locale}.json) ─────────────
      else if (config.platform === 'nextjs') {
        const style = detectNextI18nStyle(cwd)
        if (style === 'next-intl') {
          const sourceFiles = discoverNextIntlFiles(config, cwd)
          if (!sourceFiles.length) {
            console.log(chalk.yellow(`No messages/${config.source_language}.json found`))
            process.exit(1)
          }

          for (const lang of targetLangs) {
            console.log(chalk.cyan(`\n→ ${lang}`))
            for (const file of sourceFiles) {
              const spinner = ora(`  messages/${lang}.json`).start()
              const flat = flattenJson(file.strings) as Record<string, string>

              if (opts.dryRun) {
                spinner.info(`  messages/${lang}.json — would translate ${Object.keys(flat).length} strings`)
                continue
              }

              try {
                const result = await translateBatch({ strings: flat, targetLanguage: lang, config })
                const unflat = unflattenJson(result.strings)
                const path = writeNextIntlTranslation(cwd, lang, unflat as Record<string, unknown>)
                writtenFiles.push(path)
                totalWords += result.wordsProcessed
                totalStrings += Object.keys(flat).length
                spinner.succeed(`  messages/${lang}.json — ${chalk.green(Object.keys(flat).length + ' strings')} translated`)
              } catch (err) {
                spinner.fail(`  ${String(err)}`)
              }
            }
          }
        } else {
          // Fall back to react-style locale handling
          config.platform = 'react'
          console.log(chalk.dim('Using next-i18next locale structure (public/locales/)'))
          // Recurse — simplified: just note the re-dispatch
          console.log(chalk.yellow('Re-run: platform is now treated as react (next-i18next). Make sure locale_dir is set.'))
        }
      }

      // ── WordPress ───────────────────────────────────────────────
      else if (config.platform === 'wordpress') {
        const spinner = ora('Scanning PHP files for translatable strings...').start()
        const strings = scanPhpFiles(cwd)
        spinner.succeed(`Found ${strings.length} unique strings`)

        if (!strings.length) {
          console.log(chalk.yellow('No __() or _e() calls found. Make sure you are in your theme/plugin root.'))
          process.exit(1)
        }

        const domain = config.project_id.slice(0, 20).replace(/[^a-z0-9-]/g, '-')
        const pot = generatePot(strings, domain, 'Project')
        writePotFile(cwd, domain, pot)
        console.log(chalk.dim(`  .pot template written to languages/${domain}.pot`))

        const stringMap = Object.fromEntries(strings.map(s => [s.key, s.key]))

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          const spin2 = ora(`  Translating ${strings.length} strings...`).start()

          if (opts.dryRun) {
            spin2.info(`  Would translate ${strings.length} strings to ${lang}`)
            continue
          }

          try {
            const result = await translateBatch({ strings: stringMap, targetLanguage: lang, config })
            const po = generatePo(strings, result.strings, lang)
            const path = writePoFile(cwd, domain, lang, po)
            writtenFiles.push(path)
            totalWords += result.wordsProcessed
            totalStrings += strings.length
            spin2.succeed(`  languages/${domain}-${lang}.po — ${chalk.green(strings.length + ' strings')} translated`)
          } catch (err) {
            spin2.fail(`  ${String(err)}`)
          }
        }
      }

      else {
        console.log(chalk.yellow(`Platform "${config.platform}" support coming soon.`))
        console.log(chalk.dim('Supported now: react, nextjs, wordpress'))
        process.exit(0)
      }

      // ── Summary ─────────────────────────────────────────────────
      if (totalStrings > 0) {
        console.log(chalk.bold(`\n✓ Done — ${totalStrings} strings, ~${totalWords} words\n`))
        console.log(chalk.dim('Files written:'))
        for (const f of writtenFiles) console.log(chalk.dim(`  ${f}`))

        // Report usage to API (best-effort)
        try {
          await fetch(`${PRONTO_API}/usage`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: totalWords, project_id: config.project_id }),
          })
        } catch { /* ignore */ }
      } else if (!opts.dryRun) {
        console.log(chalk.green('\n✓ Everything is up to date.\n'))
      }
    })
}
