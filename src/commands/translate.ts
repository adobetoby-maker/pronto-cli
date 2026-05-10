import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { requireAuth, PRONTO_API } from '../lib/auth.js'
import { requireConfig } from '../lib/config.js'
import { translateBatch, flattenJson, unflattenJson } from '../lib/translator.js'
import { getChangedFiles, hasChangedSourceFiles } from '../lib/git-diff.js'

// Platform parsers
import { discoverLocaleFiles, getExistingTranslation, writeTranslation, diffStrings } from '../lib/platforms/react.js'
import { discoverNextIntlFiles, writeNextIntlTranslation, detectNextI18nStyle } from '../lib/platforms/nextjs.js'
import { scanPhpFiles, generatePot, generatePo, writePotFile, writePoFile } from '../lib/platforms/wordpress.js'
import { discoverArbFiles, writeArbFile, getExistingArb } from '../lib/platforms/flutter.js'
import { discoverStringsFiles, writeStringsFile, getExistingStrings } from '../lib/platforms/ios.js'
import { discoverAndroidFiles, writeAndroidStrings, getExistingAndroid } from '../lib/platforms/android.js'
import { scanElixirFiles, groupByDomain, generateGettextPo, writeGettextPoFile } from '../lib/platforms/phoenix.js'
import { discoverGoI18nFiles, writeGoI18nJson, messagesToTranslationMap, applyTranslationsToMessages } from '../lib/platforms/go-i18n.js'

export function translateCommand(program: Command) {
  program
    .command('translate')
    .description('Translate your project strings')
    .option('-l, --lang <lang>', 'Translate only a specific target language')
    .option('--dry-run', 'Show what would be translated without writing files')
    .option('--force', 'Retranslate all strings, not just new/changed ones')
    .option('--no-git', 'Skip git diff check, treat all files as changed')
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

      // Git diff awareness
      const gitInfo = opts.git !== false ? getChangedFiles(cwd) : { isGitRepo: false, changedFiles: [] }
      const sourceChanged = !gitInfo.isGitRepo || opts.force || hasChangedSourceFiles(gitInfo.changedFiles, config.source_language)

      if (gitInfo.isGitRepo && !sourceChanged && !opts.force) {
        console.log(chalk.green('✓ No source locale changes since last commit. Everything is up to date.'))
        console.log(chalk.dim('  Use --force to retranslate all strings.\n'))
        return
      }

      if (gitInfo.isGitRepo) {
        console.log(chalk.dim(`  Git: ${gitInfo.changedFiles.length} changed files detected`))
      }

      let totalWords = 0
      let totalStrings = 0
      const writtenFiles: string[] = []

      // ── React ──────────────────────────────────────────────────────
      if (config.platform === 'react') {
        const localeFiles = discoverLocaleFiles(config, cwd)
        if (!localeFiles.length) {
          console.log(chalk.yellow(`No locale files found in ${config.locale_dir ?? 'public/locales'}/{source}`))
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
              spinner.succeed(chalk.dim(`  ${file.namespace} — up to date (${unchanged} strings)`)); continue
            }
            if (opts.dryRun) {
              spinner.info(`  ${file.namespace} — would translate ${Object.keys(changed).length} strings`); continue
            }
            try {
              const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
              const merged = { ...(existingFlat ?? {}), ...result.strings }
              const path = writeTranslation(config, cwd, lang, file.namespace, unflattenJson(merged) as Record<string, unknown>)
              writtenFiles.push(path)
              totalWords += result.wordsProcessed
              totalStrings += Object.keys(changed).length
              spinner.succeed(`  ${file.namespace} — ${chalk.green(Object.keys(changed).length + ' strings')}`)
            } catch (err) { spinner.fail(`  ${file.namespace} — ${chalk.red(String(err))}`) }
          }
        }
      }

      // ── Next.js ────────────────────────────────────────────────────
      else if (config.platform === 'nextjs') {
        const style = detectNextI18nStyle(cwd)

        if (style === 'next-intl') {
          const sourceFiles = discoverNextIntlFiles(config, cwd)
          if (!sourceFiles.length) {
            console.log(chalk.yellow(`No messages/${config.source_language}.json found`)); process.exit(1)
          }
          for (const lang of targetLangs) {
            console.log(chalk.cyan(`\n→ ${lang}`))
            const spinner = ora(`  messages/${lang}.json`).start()
            if (opts.dryRun) {
              spinner.info(`  messages/${lang}.json — would translate`); continue
            }
            try {
              const flat = flattenJson(sourceFiles[0].strings) as Record<string, string>
              const result = await translateBatch({ strings: flat, targetLanguage: lang, config })
              const path = writeNextIntlTranslation(cwd, lang, unflattenJson(result.strings) as Record<string, unknown>)
              writtenFiles.push(path)
              totalWords += result.wordsProcessed
              totalStrings += Object.keys(flat).length
              spinner.succeed(`  messages/${lang}.json — ${chalk.green(Object.keys(flat).length + ' strings')}`)
            } catch (err) { spinner.fail(`  ${String(err)}`) }
          }
        } else {
          // next-i18next: same as react
          config.platform = 'react'
          console.log(chalk.dim('Detected next-i18next — using public/locales/ structure'))
          // Re-enter react branch by falling through; easier: just call the react logic inline
          const localeFiles = discoverLocaleFiles(config, cwd)
          for (const lang of targetLangs) {
            console.log(chalk.cyan(`\n→ ${lang}`))
            for (const file of localeFiles) {
              const spinner = ora(`  ${file.namespace}`).start()
              const flat = flattenJson(file.strings) as Record<string, string>
              const existing = opts.force ? null : getExistingTranslation(config, cwd, lang, file.namespace)
              const existingFlat = existing ? flattenJson(existing) as Record<string, string> : null
              const { changed } = diffStrings(flat, existingFlat)
              if (!Object.keys(changed).length) { spinner.succeed(chalk.dim(`  up to date`)); continue }
              try {
                const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
                const merged = { ...(existingFlat ?? {}), ...result.strings }
                const path = writeTranslation(config, cwd, lang, file.namespace, unflattenJson(merged) as Record<string, unknown>)
                writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
                spinner.succeed(`  ${file.namespace} — ${chalk.green(Object.keys(changed).length + ' strings')}`)
              } catch (err) { spinner.fail(`  ${String(err)}`) }
            }
          }
        }
      }

      // ── WordPress ──────────────────────────────────────────────────
      else if (config.platform === 'wordpress') {
        const spinner = ora('Scanning PHP files...').start()
        const strings = scanPhpFiles(cwd)
        spinner.succeed(`Found ${strings.length} unique strings`)
        if (!strings.length) { console.log(chalk.yellow('No __() calls found. Run from theme/plugin root.')); process.exit(1) }

        const domain = (config.project_id ?? 'pronto').slice(0, 20).replace(/[^a-z0-9-]/g, '-')
        writePotFile(cwd, domain, generatePot(strings, domain, 'Project'))
        const stringMap = Object.fromEntries(strings.map(s => [s.key, s.key]))

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          const spin2 = ora(`  Translating ${strings.length} strings...`).start()
          if (opts.dryRun) { spin2.info(`  Would translate ${strings.length} strings`); continue }
          try {
            const result = await translateBatch({ strings: stringMap, targetLanguage: lang, config })
            const path = writePoFile(cwd, domain, lang, generatePo(strings, result.strings, lang))
            writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += strings.length
            spin2.succeed(`  languages/${domain}-${lang}.po — ${chalk.green(strings.length + ' strings')}`)
          } catch (err) { spin2.fail(`  ${String(err)}`) }
        }
      }

      // ── Flutter ────────────────────────────────────────────────────
      else if (config.platform === 'flutter') {
        const arbFiles = discoverArbFiles(config, cwd)
        if (!arbFiles.length) {
          console.log(chalk.yellow(`No .arb files found in ${config.locale_dir ?? 'lib/l10n'}`)); process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          for (const file of arbFiles) {
            const spinner = ora(`  app_${lang}.arb`).start()
            const existing = opts.force ? null : getExistingArb(config, cwd, lang)
            const { changed, unchanged } = diffStrings(file.strings, existing)
            if (!Object.keys(changed).length) { spinner.succeed(chalk.dim(`  up to date (${unchanged} strings)`)); continue }
            if (opts.dryRun) { spinner.info(`  Would translate ${Object.keys(changed).length} strings`); continue }
            try {
              const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
              const merged = { ...(existing ?? {}), ...result.strings }
              const path = writeArbFile(config, cwd, lang, merged, file.metadata)
              writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
              spinner.succeed(`  app_${lang}.arb — ${chalk.green(Object.keys(changed).length + ' strings')}`)
            } catch (err) { spinner.fail(`  ${String(err)}`) }
          }
        }
      }

      // ── iOS ────────────────────────────────────────────────────────
      else if (config.platform === 'ios') {
        const strFiles = discoverStringsFiles(config, cwd)
        if (!strFiles.length) {
          console.log(chalk.yellow(`No ${config.source_language}.lproj/Localizable.strings found`)); process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          const spinner = ora(`  ${lang}.lproj/Localizable.strings`).start()
          const existing = opts.force ? null : getExistingStrings(config, cwd, lang)
          const { changed, unchanged } = diffStrings(strFiles[0].strings, existing)
          if (!Object.keys(changed).length) { spinner.succeed(chalk.dim(`  up to date (${unchanged} strings)`)); continue }
          if (opts.dryRun) { spinner.info(`  Would translate ${Object.keys(changed).length} strings`); continue }
          try {
            const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
            const merged = { ...(existing ?? {}), ...result.strings }
            const path = writeStringsFile(config, cwd, lang, merged)
            writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
            spinner.succeed(`  ${lang}.lproj/Localizable.strings — ${chalk.green(Object.keys(changed).length + ' strings')}`)
          } catch (err) { spinner.fail(`  ${String(err)}`) }
        }
      }

      // ── Android ────────────────────────────────────────────────────
      else if (config.platform === 'android') {
        const resFiles = discoverAndroidFiles(config, cwd)
        if (!resFiles.length) {
          console.log(chalk.yellow('No res/values/strings.xml found')); process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          const spinner = ora(`  res/values-${lang}/strings.xml`).start()
          const existing = opts.force ? null : getExistingAndroid(config, cwd, lang)
          const { changed, unchanged } = diffStrings(resFiles[0].strings, existing)
          if (!Object.keys(changed).length) { spinner.succeed(chalk.dim(`  up to date (${unchanged} strings)`)); continue }
          if (opts.dryRun) { spinner.info(`  Would translate ${Object.keys(changed).length} strings`); continue }
          try {
            const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
            const merged = { ...(existing ?? {}), ...result.strings }
            const path = writeAndroidStrings(config, cwd, lang, merged)
            writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
            spinner.succeed(`  res/values-${lang}/strings.xml — ${chalk.green(Object.keys(changed).length + ' strings')}`)
          } catch (err) { spinner.fail(`  ${String(err)}`) }
        }
      }

      // ── Phoenix/Gettext ────────────────────────────────────────────
      else if (config.platform === 'phoenix') {
        const spinner = ora('Scanning Elixir/HEEx files...').start()
        const strings = scanElixirFiles(cwd)
        spinner.succeed(`Found ${strings.length} unique strings across ${Object.keys(groupByDomain(strings)).length} domain(s)`)
        if (!strings.length) { console.log(chalk.yellow('No gettext() calls found. Run from Phoenix app root.')); process.exit(1) }

        const byDomain = groupByDomain(strings)
        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          for (const [domain, domainStrings] of Object.entries(byDomain)) {
            const spinner2 = ora(`  ${domain}.po`).start()
            if (opts.dryRun) { spinner2.info(`  Would translate ${domainStrings.length} strings`); continue }
            try {
              const strMap = Object.fromEntries(domainStrings.map(s => [s.key, s.key]))
              const result = await translateBatch({ strings: strMap, targetLanguage: lang, config })
              const path = writeGettextPoFile(cwd, lang, domain, generateGettextPo(domainStrings, result.strings, lang))
              writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += domainStrings.length
              spinner2.succeed(`  priv/gettext/${lang}/LC_MESSAGES/${domain}.po — ${chalk.green(domainStrings.length + ' strings')}`)
            } catch (err) { spinner2.fail(`  ${String(err)}`) }
          }
        }
      }

      // ── go-i18n ────────────────────────────────────────────────────
      else if (config.platform === 'go-i18n') {
        const sourceFiles = discoverGoI18nFiles(config, cwd)
        if (!sourceFiles.length) {
          console.log(chalk.yellow(`No go-i18n files found. Expected: active.${config.source_language}.json or .toml`))
          process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          for (const file of sourceFiles) {
            const spinner = ora(`  active.${lang}.json`).start()
            const strMap = messagesToTranslationMap(file.messages)
            if (opts.dryRun) { spinner.info(`  Would translate ${file.messages.length} messages`); continue }
            try {
              const result = await translateBatch({ strings: strMap, targetLanguage: lang, config })
              const translated = applyTranslationsToMessages(file.messages, result.strings)
              const path = writeGoI18nJson(config, cwd, lang, translated)
              writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += file.messages.length
              spinner.succeed(`  active.${lang}.json — ${chalk.green(file.messages.length + ' messages')}`)
            } catch (err) { spinner.fail(`  ${String(err)}`) }
          }
        }
      }

      else {
        console.log(chalk.yellow(`Platform "${config.platform}" is not yet supported.`))
        console.log(chalk.dim('Supported: react, nextjs, wordpress, flutter, ios, android, phoenix, go-i18n, webflow, shopify, framer, wix'))
        process.exit(1)
      }

      // ── Summary ────────────────────────────────────────────────────
      if (totalStrings > 0) {
        console.log(chalk.bold(`\n✓ Done — ${totalStrings} strings, ~${totalWords} words\n`))
        for (const f of writtenFiles) console.log(chalk.dim(`  ${f}`))
        try {
          await fetch(`${PRONTO_API}/usage`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: totalWords, project_id: config.project_id }),
          })
        } catch { /* offline */ }
      } else if (!opts.dryRun) {
        console.log(chalk.green('\n✓ Everything is up to date.\n'))
      }
    })
}
