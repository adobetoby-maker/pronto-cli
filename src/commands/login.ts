import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { saveAuthConfig, PRONTO_API } from '../lib/auth.js'

export function loginCommand(program: Command) {
  program
    .command('login')
    .description('Authenticate with your Pronto account')
    .action(async () => {
      console.log(chalk.bold('\nPronto — Ship in any language\n'))

      const { email, apiKey } = await prompts([
        {
          type: 'text',
          name: 'email',
          message: 'Email address:',
          validate: (v: string) => v.includes('@') || 'Enter a valid email',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key (from pronto-en.worker-bee.app/dashboard/api-keys):',
          validate: (v: string) => v.startsWith('pronto_') || 'API key must start with pronto_',
        },
      ])

      if (!email || !apiKey) {
        console.log(chalk.yellow('\nLogin cancelled.'))
        process.exit(0)
      }

      const spinner = ora('Verifying credentials...').start()

      try {
        const res = await fetch(`${PRONTO_API}/whoami`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (!res.ok) {
          spinner.fail('Invalid API key or account not found.')
          process.exit(1)
        }

        const data = await res.json() as { userId: string; email: string }
        saveAuthConfig({ apiKey, email: data.email, userId: data.userId })
        spinner.succeed(chalk.green(`Logged in as ${chalk.bold(data.email)}`))
        console.log(chalk.dim('\nRun `pronto init` inside your project to get started.\n'))
      } catch {
        spinner.fail('Could not reach Pronto API. Check your connection.')
        process.exit(1)
      }
    })
}
