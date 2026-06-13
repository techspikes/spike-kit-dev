import { parseArgs } from 'node:util'
import { config as checkConfig, execute as executeCheck } from './commands/check.ts'
import { execute as executeTablesDoc, config as tablesDocConfig } from './commands/tables-doc.ts'

const usage = () =>
  [
    'Usage: shot <command> [options]',
    '',
    'Commands:',
    '  spec-check   Validate a Data Sketch Specification v1 YAML or JSON file.',
    '  tables-doc   Write a Markdown table specification.'
  ].join('\n')

const [command, ...args] = process.argv.slice(2)

if (!command || command === '-h' || command === '--help') {
  console.log(usage())
} else if (command === 'spec-check') {
  executeCheck(parseArgs({ ...checkConfig, args }))
} else if (command === 'tables-doc') {
  executeTablesDoc(parseArgs({ ...tablesDocConfig, args }))
} else {
  console.log(usage())
}
