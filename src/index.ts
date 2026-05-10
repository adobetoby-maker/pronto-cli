#!/usr/bin/env node
import { Command } from 'commander'
import { loginCommand } from './commands/login.js'
import { whoamiCommand } from './commands/whoami.js'
import { initCommand } from './commands/init.js'
import { translateCommand } from './commands/translate.js'
import { statusCommand } from './commands/status.js'

const program = new Command()

program
  .name('pronto')
  .description('Ship in any language, for any platform.')
  .version('0.1.0')

loginCommand(program)
whoamiCommand(program)
initCommand(program)
translateCommand(program)
statusCommand(program)

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    const { clearAuthConfig } = require('./lib/auth.js')
    clearAuthConfig()
    console.log('Logged out.')
  })

program.parse()
