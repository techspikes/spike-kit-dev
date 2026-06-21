import assert from 'node:assert'
import { describe, it } from 'node:test'
import { runCli } from '../src/cli.ts'
import { createTemporaryDirectory, joinFilePath, readJsonFile, removeDirectory } from './test-helper/file-access.ts'
import { runCommandAndCaptureAsync } from './test-helper/logger.ts'

const usageLine = 'Usage: shot [OPTION]... COMMAND [ARG]...'

describe('cli', () => {
  it('prints root usage with no command', async () => {
    const result = await runCommandAndCaptureAsync(() => runCli([]))

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.match(result.stdout.join('\n'), /openapi-summary/)
    assert.match(result.stdout.join('\n'), /spec-check/)
    assert.deepEqual(result.stderr, [])
  })

  it('prints root usage when long help is requested', async () => {
    const result = await runCommandAndCaptureAsync(() => runCli(['--help']))

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('prints root usage when short help is requested', async () => {
    const result = await runCommandAndCaptureAsync(() => runCli(['-h']))

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('dispatches the spec-check command', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      runCli(['spec-check', 'test/commands/spec-check/fixtures/sketches/online-shop.valid.yaml'])
    )

    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.stdout, ['Specification is valid.\n'])
    assert.deepEqual(result.stderr, [])
  })

  it('dispatches the openapi-summary command', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      runCli(['openapi-summary', 'test/commands/openapi-summary/fixtures/request-body-without-json.openapi.yaml'])
    )

    const expected = readJsonFile(
      'test/commands/openapi-summary/fixtures/request-body-without-json.openapi-summary.json'
    )

    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout.join('')), expected)
    assert.deepEqual(result.stderr, [])
  })

  it('dispatches the tables-doc command', async () => {
    const temporaryDirectoryPath = createTemporaryDirectory('tables-doc-cli-test-')
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'output.md')

    try {
      const result = await runCommandAndCaptureAsync(() =>
        runCli([
          'tables-doc',
          'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
          '--output',
          outputFilePath
        ])
      )

      assert.equal(result.exitCode, 0)
      assert.deepEqual(result.stdout, [])
      assert.deepEqual(result.stderr, [])
    } finally {
      removeDirectory(temporaryDirectoryPath)
    }
  })

  it('dispatches the kysely-migration command', async () => {
    const temporaryDirectoryPath = createTemporaryDirectory('kysely-migration-cli-test-')
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'output.ts')

    try {
      const result = await runCommandAndCaptureAsync(() =>
        runCli([
          'kysely-migration',
          'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
          '--output',
          outputFilePath
        ])
      )

      assert.equal(result.exitCode, 0)
    } finally {
      removeDirectory(temporaryDirectoryPath)
    }
  })

  it('returns a non-zero exit code for unknown commands', async () => {
    const result = await runCommandAndCaptureAsync(() => runCli(['missing-command']))

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, ['Unknown command: missing-command\n'])
  })
})
