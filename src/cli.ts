#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { executeSpecCheck } from './commands/spec-check.ts'

const usage = () =>
  [
    'Usage: shot [OPTION]... COMMAND [ARG]...',
    '',
    'Commands:',
    '  spec-check   Validate a Data Sketch Specification v1 YAML or JSON file.'
  ].join('\n')

export function runCli(args: readonly string[]) {
  const [command, ...commandArgs] = args

  if (!command || command === '-h' || command === '--help') {
    console.log(usage())

    return 0
  }

  if (command === 'spec-check') {
    return executeSpecCheck(commandArgs)
  }

  console.error(`Unknown command: ${command}`)
  console.log(usage())

  return 1
}

/* c8 ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2))
}
