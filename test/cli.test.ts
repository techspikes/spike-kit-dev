import assert from 'node:assert'
import { describe, it } from 'node:test'
import { runCli } from '../src/cli.ts'
import { exec } from './test-helper/exec.ts'
import { readJsonFile } from './test-helper/file-access.ts'
import { runAndCapture, runAndCaptureAsync } from './test-helper/logger.ts'

const usageLine = 'Usage: shot [OPTION]... COMMAND [ARG]...'

describe('cli', () => {
  it('prints root usage with no command', async () => {
    const result = await runShot([])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.match(result.stdout.join('\n'), /openapi-summary/)
    assert.match(result.stdout.join('\n'), /spec-check/)
    assert.deepEqual(result.stderr, [])
  })

  it('prints root usage when long help is requested', async () => {
    const result = await runShot(['--help'])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('prints root usage when short help is requested', async () => {
    const result = await runShot(['-h'])

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('dispatches the spec-check command', async () => {
    const result = await runShot([
      'spec-check',
      'test/commands/spec-check/fixtures/online-shop.valid.yaml'
    ])

    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('dispatches the openapi-summary command', async () => {
    const result = await runShot([
      'openapi-summary',
      'test/commands/openapi-summary/fixtures/request-body-without-json.openapi.yaml'
    ])

    const expected = readJsonFile(
      'test/commands/openapi-summary/fixtures/request-body-without-json.openapi-summary.json'
    )

    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout.join('')), expected)
    assert.deepEqual(result.stderr, [])
  })

  it('runs the spec-check command from the CLI entrypoint', () => {
    const result = runAndCapture(() => {
      exec('node src/cli.ts spec-check test/commands/spec-check/fixtures/online-shop.valid.yaml')
    })

    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('returns a non-zero exit code for unknown commands', async () => {
    const result = await runShot(['missing-command'])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, ['Unknown command: missing-command\n'])
  })
})

async function runShot(args: readonly string[]) {
  let exitCode = 0

  const result = await runAndCaptureAsync(async () => {
    exitCode = await runCli(args)
  })

  return {
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  }
}
