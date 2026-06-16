#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { executeKyselyMigration } from './commands/kysely-migration.ts'
import { executeOpenApiSummary } from './commands/openapi-summary.ts'
import { executeSpecCheck } from './commands/spec-check.ts'
import { executeTableDoc } from './commands/tables-doc.ts'

const usage = () =>
  [
    'Usage: shot [OPTION]... COMMAND [ARG]...',
    '',
    'Commands:',
    '  kysely-migration   Generate a Kysely TypeScript migration from a Data Sketch Specification.',
    '  openapi-summary   Summarize an OpenAPI file for AI-assisted Data Sketch drafting.',
    '  spec-check   Validate a Data Sketch Specification v1 YAML or JSON file.',
    '  tables-doc   Build and render Relational DB Projection table documentation.'
  ].join('\n')

export function runCli(args: readonly string[]) {
  const [command, ...commandArgs] = args

  if (!command || command === '-h' || command === '--help') {
    console.log(usage())

    return 0
  }

  if (command === 'openapi-summary') {
    return executeOpenApiSummary(commandArgs)
  }

  if (command === 'spec-check') {
    return executeSpecCheck(commandArgs)
  }

  if (command === 'kysely-migration') {
    return executeKyselyMigration(commandArgs)
  }

  if (command === 'tables-doc') {
    return executeTableDoc(commandArgs)
  }

  console.error(`Unknown command: ${command}`)
  console.log(usage())

  return 1
}

/* c8 ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2))
}
