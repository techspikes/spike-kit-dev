import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parseArgs } from 'node:util'
import { config, execute } from '../../../src/commands/check.ts'
import { runAndCaptureSync } from '../../test-helper/logger.ts'

describe('check command', () => {
  it('Given a valid YAML specification, When the command executes, Then it prints a success message', () => {
    const options = parseArgs({
      ...config,
      args: ['test/commands/check/fixtures/online-shop-minimal.valid.yaml']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('Given help is requested, When the command executes, Then it prints usage', () => {
    const options = parseArgs({
      ...config,
      args: ['--help']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.match(result.stdout.join(''), /Usage: shot spec-check <spec file>/)
    assert.match(result.stdout.join(''), /-h, --help/)
    assert.deepEqual(result.stderr, [])
  })

  it('Given no file is provided, When the command executes, Then it prints usage', () => {
    const options = parseArgs({
      ...config,
      args: []
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.match(result.stdout.join(''), /Usage: shot spec-check <spec file>/)
    assert.match(result.stdout.join(''), /-h, --help/)
    assert.deepEqual(result.stderr, [])
  })

  it('Given an invalid specification, When the command executes, Then it prints the validation error', () => {
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/check/fixtures/online-shop-unsupported-field-type.invalid.yaml'
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.match(
      result.stderr.join(''),
      /stores\.customer\.fields\.id\.type\.name/
    )
  })
})
