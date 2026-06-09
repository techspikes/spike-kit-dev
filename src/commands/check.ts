import type { ParseArgsConfig, parseArgs } from 'node:util'
import utils from '../core/utils.ts'
import { parseSpecification } from '../core/validator.ts'

const usage = () =>
  [
    'Usage: shot spec-check <spec file>',
    '',
    'Validate a Data Sketch Specification v1 YAML or JSON file.',
    '',
    'Options:',
    '  -h, --help  Show this help'
  ].join('\n')

export const config: ParseArgsConfig = {
  allowPositionals: true,
  strict: true,
  options: {
    help: { type: 'boolean', short: 'h' }
  }
}

export function execute(options: ReturnType<typeof parseArgs<typeof config>>) {
  try {
    if (options.values.help || !options.positionals[0]) {
      console.log(usage())
    } else {
      parseSpecification(
        utils.readCwdRelativePathSync(options.positionals[0]).toString('utf-8'),
        { trace: true, specPath: options.positionals[0] }
      )
      console.log('Specification is valid.')
    }
  } catch (error) {
    console.error(utils.extractErrorMessages(error))
  }
}
