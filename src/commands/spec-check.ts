import { parseArgs } from 'node:util'
import { parse } from '../core/parser.ts'
import { validate } from '../core/validator.ts'

const usage = () =>
  [
    'Usage: shot spec-check [OPTION]... SPEC_FILE',
    '',
    'Validate a Data Sketch Specification v1 YAML or JSON file.',
    '',
    'Options:',
    '  -h, --help  Show this help'
  ].join('\n')

export function executeSpecCheck(args: readonly string[]) {
  try {
    const options = parseArgs({
      allowPositionals: true,
      strict: true,
      args: [...args],
      options: {
        help: { type: 'boolean', short: 'h' }
      }
    })

    const specFile = options.positionals[0]

    if (options.values.help) {
      console.log(usage())

      return 0
    }

    if (!specFile) {
      console.log(usage())

      return 1
    }

    validate({
      sketch: parse({ path: specFile }),
      trace: true
    })

    console.log('Specification is valid.')

    return 0
  } catch (error) {
    console.error((error as Error).message)

    return 1
  }
}
