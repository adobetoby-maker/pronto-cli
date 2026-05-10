import { Command } from 'commander'
import chalk from 'chalk'
import { getAuthConfig } from '../lib/auth.js'

export function whoamiCommand(program: Command) {
  program
    .command('whoami')
    .description('Show current authenticated user')
    .action(() => {
      const auth = getAuthConfig()
      if (!auth) {
        console.log(chalk.yellow('Not logged in. Run: pronto login'))
        process.exit(1)
      }
      console.log(chalk.bold('\nPronto — Current user\n'))
      console.log(`  Email:  ${chalk.cyan(auth.email)}`)
      console.log(`  User:   ${chalk.dim(auth.userId)}`)
      console.log(`  Key:    ${chalk.dim(auth.apiKey.slice(0, 12) + '...')}`)
      console.log()
    })
}
