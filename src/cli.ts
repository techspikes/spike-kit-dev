import { parseArgs } from 'node:util'
import {
  config as checkConfig,
  execute as executeCheck
} from './commands/check.ts'
import {
  execute as executeTableSpec,
  config as tableSpecConfig
} from './commands/table-spec.ts'

const usage = () =>
  [
    'Usage: shot <command> [options]',
    '',
    'Commands:',
    '  spec-check   Validate a Data Sketch Specification v1 YAML or JSON file.',
    '  table-spec   Write a Markdown table specification.'
  ].join('\n')

const [command, ...args] = process.argv.slice(2)

if (!command || command === '-h' || command === '--help') {
  console.log(usage())
} else if (command === 'spec-check') {
  executeCheck(parseArgs({ ...checkConfig, args }))
} else if (command === 'table-spec') {
  executeTableSpec(parseArgs({ ...tableSpecConfig, args }))
} else {
  console.log(usage())
}
