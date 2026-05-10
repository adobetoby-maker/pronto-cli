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
import { discoverVueFiles, getExistingVue, writeVueLocale } from '../lib/platforms/vue.js'
import { loadFramerFile, getFramerSourceStrings, getFramerExistingTranslation, writeFramerFile } from '../lib/platforms/framer.js'
import { getWebflowLocales, getWebflowPages, getPageStrings, pushPageTranslations, getWebflowToken } from '../lib/platforms/webflow.js'
import { getTranslatableResources, registerTranslations, getShopifyToken, TRANSLATABLE_RESOURCE_TYPES } from '../lib/platforms/shopify.js'

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

      // ── Vue / Nuxt ─────────────────────────────────────────────────
      else if (config.platform === 'vue' || config.platform === 'nuxt') {
        const sourceFiles = discoverVueFiles(config, cwd)
        if (!sourceFiles.length) {
          console.log(chalk.yellow(`No ${config.source_language}.json found in locales/ or src/locales/`))
          console.log(chalk.dim('Create locales/en.json with your source strings, then re-run.'))
          process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          for (const file of sourceFiles) {
            const spinner = ora(`  locales/${lang}.json`).start()
            const flat = flattenJson(file.strings) as Record<string, string>
            const existing = opts.force ? null : getExistingVue(config, cwd, lang)
            const existingFlat = existing ? flattenJson(existing) as Record<string, string> : null
            const { changed, unchanged } = diffStrings(flat, existingFlat)

            if (!Object.keys(changed).length) {
              spinner.succeed(chalk.dim(`  locales/${lang}.json — up to date (${unchanged} strings)`)); continue
            }
            if (opts.dryRun) { spinner.info(`  Would translate ${Object.keys(changed).length} strings`); continue }
            try {
              const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
              const merged = { ...(existingFlat ?? {}), ...result.strings }
              const path = writeVueLocale(config, cwd, lang, unflattenJson(merged) as Record<string, unknown>)
              writtenFiles.push(path); totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
              spinner.succeed(`  locales/${lang}.json — ${chalk.green(Object.keys(changed).length + ' strings')}`)
            } catch (err) { spinner.fail(`  ${String(err)}`) }
          }
        }
      }

      // ── Framer ─────────────────────────────────────────────────────
      else if (config.platform === 'framer') {
        const framerData = loadFramerFile(config, cwd)
        if (!framerData) {
          console.log(chalk.yellow('No translations.json found.'))
          console.log(chalk.dim('Export it from Framer: Site Settings → Localization → Export → drop in project root'))
          process.exit(1)
        }

        const sourceStrings = getFramerSourceStrings(framerData, config.source_language)
        if (!Object.keys(sourceStrings).length) {
          console.log(chalk.yellow(`No strings found for source language "${config.source_language}" in translations.json`))
          process.exit(1)
        }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))
          const spinner = ora(`  translations.json [${lang}]`).start()
          const existing = opts.force ? null : getFramerExistingTranslation(framerData, lang)
          const { changed, unchanged } = diffStrings(sourceStrings, existing)

          if (!Object.keys(changed).length) {
            spinner.succeed(chalk.dim(`  [${lang}] up to date (${unchanged} strings)`)); continue
          }
          if (opts.dryRun) { spinner.info(`  Would translate ${Object.keys(changed).length} strings`); continue }
          try {
            const result = await translateBatch({ strings: changed, targetLanguage: lang, config })
            const merged = { ...(existing ?? {}), ...result.strings }
            framerData[lang] = merged
            totalWords += result.wordsProcessed; totalStrings += Object.keys(changed).length
            spinner.succeed(`  [${lang}] — ${chalk.green(Object.keys(changed).length + ' strings')}`)
          } catch (err) { spinner.fail(`  ${String(err)}`) }
        }

        if (totalStrings > 0 && !opts.dryRun) {
          const path = writeFramerFile(config, cwd, framerData)
          writtenFiles.push(path)
          console.log(chalk.dim('\n  Upload translations.json back to Framer:'))
          console.log(chalk.dim('  Site Settings → Localization → Import'))
        }
      }

      // ── Webflow ────────────────────────────────────────────────────
      else if (config.platform === 'webflow') {
        const siteId = config.webflow_site_id
        if (!siteId) {
          console.log(chalk.yellow('webflow_site_id not set in pronto.config.yml'))
          console.log(chalk.dim('Find it in Webflow: Site Settings → General → Site ID'))
          process.exit(1)
        }

        let token: string
        try { token = getWebflowToken(config) } catch (e) { console.log(chalk.red(String(e))); process.exit(1) }

        const spinner = ora('Fetching Webflow locales...').start()
        const locales = await getWebflowLocales(siteId, token)
        const pages = await getWebflowPages(siteId, token)
        spinner.succeed(`Found ${locales.length} locales, ${pages.length} pages`)

        const primaryLocale = locales.find(l => l.primary)
        if (!primaryLocale) { console.log(chalk.red('No primary locale found in Webflow')); process.exit(1) }

        for (const lang of targetLangs) {
          const targetLocale = locales.find(l => l.tag === lang || l.tag.startsWith(lang + '-'))
          if (!targetLocale) {
            console.log(chalk.yellow(`\n  Language "${lang}" not configured in Webflow. Add it in Site Settings → Localization.`))
            continue
          }

          console.log(chalk.cyan(`\n→ ${lang} (locale: ${targetLocale.displayName})`))

          for (const page of pages) {
            const spinner2 = ora(`  ${page.slug}`).start()
            try {
              const sourceStrings = await getPageStrings(page.id, primaryLocale.cmsLocaleId, token)
              if (!sourceStrings.length) { spinner2.succeed(chalk.dim(`  ${page.slug} — no translatable text`)); continue }

              const strMap = Object.fromEntries(sourceStrings.map(s => [s.key, s.value]))
              if (opts.dryRun) { spinner2.info(`  ${page.slug} — would translate ${sourceStrings.length} strings`); continue }

              const result = await translateBatch({ strings: strMap, targetLanguage: lang, config })
              await pushPageTranslations(page.id, targetLocale.cmsLocaleId, result.strings, token)

              totalWords += result.wordsProcessed; totalStrings += sourceStrings.length
              spinner2.succeed(`  ${page.slug} — ${chalk.green(sourceStrings.length + ' strings')} pushed to Webflow`)
            } catch (err) { spinner2.fail(`  ${page.slug} — ${chalk.red(String(err))}`) }
          }
        }
      }

      // ── Shopify ────────────────────────────────────────────────────
      else if (config.platform === 'shopify') {
        const store = config.shopify_store
        if (!store) {
          console.log(chalk.yellow('shopify_store not set in pronto.config.yml'))
          console.log(chalk.dim('Example: shopify_store: mystore.myshopify.com'))
          process.exit(1)
        }

        let token: string
        try { token = getShopifyToken(config) } catch (e) { console.log(chalk.red(String(e))); process.exit(1) }

        for (const lang of targetLangs) {
          console.log(chalk.cyan(`\n→ ${lang}`))

          for (const resourceType of TRANSLATABLE_RESOURCE_TYPES) {
            const spinner2 = ora(`  ${resourceType}`).start()
            try {
              const items = await getTranslatableResources(store, token, resourceType, lang)
              if (!items.length) { spinner2.succeed(chalk.dim(`  ${resourceType} — nothing to translate`)); continue }

              const strMap = Object.fromEntries(items.map(i => [i.digest, i.value]))
              if (opts.dryRun) { spinner2.info(`  ${resourceType} — would translate ${items.length} strings`); continue }

              const result = await translateBatch({ strings: strMap, targetLanguage: lang, config })

              // Group by resourceId and push
              const byResource = new Map<string, typeof items>()
              for (const item of items) {
                if (!byResource.has(item.resourceId)) byResource.set(item.resourceId, [])
                byResource.get(item.resourceId)!.push(item)
              }

              for (const [resourceId, resourceItems] of byResource) {
                const translations = resourceItems
                  .filter(i => result.strings[i.digest])
                  .map(i => ({ key: i.key, value: result.strings[i.digest], translatableContentDigest: i.digest }))
                if (translations.length) {
                  await registerTranslations(store, token, resourceId, lang, translations)
                }
              }

              totalWords += result.wordsProcessed; totalStrings += items.length
              spinner2.succeed(`  ${resourceType} — ${chalk.green(items.length + ' strings')} pushed to Shopify`)
            } catch (err) { spinner2.fail(`  ${resourceType} — ${chalk.red(String(err))}`) }
          }
        }
      }

      else {
        console.log(chalk.yellow(`Platform "${config.platform}" is not yet supported.`))
        console.log(chalk.dim('Supported: react, nextjs, vue, nuxt, wordpress, flutter, ios, android, phoenix, go-i18n, webflow, shopify, framer'))
        console.log(chalk.dim('Coming soon: squarespace, wix'))
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
