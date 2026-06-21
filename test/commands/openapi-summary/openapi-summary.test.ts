import assert from 'node:assert'
import { describe, it } from 'node:test'
import { executeOpenApiSummary } from '../../../src/commands/openapi-summary.ts'
import { readJsonFile } from '../../test-helper/file-access.ts'
import { runCommandAndCaptureAsync } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot openapi-summary [OPTION]... OPENAPI_FILE'

describe('openapi-summary command', () => {
  it('Given an OpenAPI file with local references, When the command executes, Then it prints an AI-oriented JSON summary', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/online-shop-summary.openapi.yaml'])
    )

    const expected = readJsonFile('test/commands/openapi-summary/fixtures/online-shop.openapi-summary.json')

    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout.join('')), expected)
    assert.deepEqual(result.stderr, [])
  })

  it('Given long help is requested, When the command executes, Then it prints usage', async () => {
    const result = await runCommandAndCaptureAsync(() => executeOpenApiSummary(['--help']))

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given short help is requested, When the command executes, Then it prints usage', async () => {
    const result = await runCommandAndCaptureAsync(() => executeOpenApiSummary(['-h']))

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given no OpenAPI file is provided, When the command executes, Then it prints usage and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() => executeOpenApiSummary([]))

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(result.stderr, [])
  })

  it('Given an OpenAPI request body without JSON content, When the command executes, Then it omits the request body from the summary', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/request-body-without-json.openapi.yaml'])
    )

    const expected = readJsonFile(
      'test/commands/openapi-summary/fixtures/request-body-without-json.openapi-summary.json'
    )

    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout.join('')), expected)
    assert.deepEqual(result.stderr, [])
  })

  it('Given an OpenAPI file with incomplete shapes, When the command executes, Then it preserves operations and summarizes unknown fields defensively', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/defensive-shapes.openapi.yaml'])
    )

    const expected = readJsonFile('test/commands/openapi-summary/fixtures/defensive-shapes.openapi-summary.json')

    assert.equal(result.exitCode, 0)
    assert.deepEqual(JSON.parse(result.stdout.join('')), expected)
    assert.deepEqual(result.stderr, [])
  })

  it('Given an OpenAPI file with a remote reference, When the command executes, Then it rejects the remote reference', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/remote-reference.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['Remote OpenAPI $ref is not supported: https://example.com/schema.yaml\n'])
  })

  it('Given an OpenAPI file with a protocol-relative reference, When the command executes, Then it rejects the remote reference', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/protocol-relative-reference.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['Remote OpenAPI $ref is not supported: //example.com/schema.yaml\n'])
  })

  it('Given an OpenAPI file with a missing local reference, When the command executes, Then it prints a read error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/missing-local-reference.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.match(result.stderr.join(''), /Failed to read OpenAPI:/)
  })

  it('Given an OpenAPI file with a missing JSON pointer target, When the command executes, Then it prints a reference error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/missing-pointer.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['OpenAPI $ref target does not exist: #/components/schemas/customer\n'])
  })

  it('Given an OpenAPI file with a circular reference, When the command executes, Then it prints a circular reference error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/circular-reference.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['Circular OpenAPI $ref is not supported: #/components/schemas/customer\n'])
  })

  it('Given an OpenAPI file with a malformed JSON pointer reference, When the command executes, Then it prints a reference error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/bad-pointer-reference.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['OpenAPI $ref must use a JSON pointer fragment: #components/schemas/customer\n'])
  })

  it('Given an OpenAPI file whose root is not an object, When the command executes, Then it prints a root shape error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/root-null.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, ['OpenAPI root must be an object\n'])
  })

  it('Given invalid OpenAPI YAML, When the command executes, Then it prints a parse error and returns a non-zero exit code', async () => {
    const result = await runCommandAndCaptureAsync(() =>
      executeOpenApiSummary(['test/commands/openapi-summary/fixtures/invalid.openapi.yaml'])
    )

    assert.equal(result.exitCode, 1)
    assert.deepEqual(result.stdout, [])
    assert.match(result.stderr.join(''), /Failed to parse OpenAPI:/)
  })
})
