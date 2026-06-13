import assert from 'node:assert'
import { describe, it } from 'node:test'
import { executeSpecCheck } from '../../../src/commands/spec-check.ts'
import { runAndCapture, runAndCaptureAsync } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot spec-check [OPTION]... SPEC_FILE'

describe('spec-check command', () => {
  it('Given a valid Data Sketch specification, When the command executes, Then it prints a success message', () => {
    const result = runSpecCheck(['test/commands/spec-check/fixtures/online-shop.valid.yaml'])

    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('Given long help is requested, When the command executes, Then it prints usage', async () => {
    let exitCode = 1

    const result = await runAndCaptureAsync(async () => {
      exitCode = executeSpecCheck(['--help'])
    })

    assert.equal(exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given short help is requested, When the command executes, Then it prints usage', () => {
    const result = runSpecCheck(['-h'])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given no file is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const result = runSpecCheck([])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given an invalid Data Sketch specification, When the command executes, Then it prints a parse error and returns a non-zero exit code', () => {
    const result = runSpecCheck([
      'test/commands/spec-check/fixtures/online-shop-unsupported-version.invalid.yaml'
    ])

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])

    assert.deepEqual(result.stderr, [
      'data-sketch: Invalid type: Expected "1.0.0-draft.2" but received "1.0.0-draft.1"\n'
    ])
  })

  it('Given a Data Sketch specification with a missing traced operation, When the command executes, Then it prints a trace validation error and returns a non-zero exit code', () => {
    const result = runSpecCheck([
      'test/commands/spec-check/fixtures/online-shop-missing-operation.invalid.yaml'
    ])

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])

    assert.deepEqual(result.stderr, [
      'trace operation missingOperation does not exist in OpenAPI operationId\n'
    ])
  })
})

function runSpecCheck(args: readonly string[]) {
  let exitCode = 0

  const result = runAndCapture(() => {
    exitCode = executeSpecCheck(args)
  })

  return {
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  }
}
