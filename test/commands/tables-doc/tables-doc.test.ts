import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { executeTableDoc, renderTablesDoc } from '../../../src/commands/tables-doc.ts'
import { project, type RelationalDbProjection, relationalDbProjector } from '../../../src/core/projector.ts'
import { openApiValidator, validate } from '../../../src/core/validator.ts'
import { createTemporaryDirectory, joinFilePath, readTextFile, removeDirectory } from '../../test-helper/file-access.ts'
import { runCommandAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot tables-doc [OPTION]... SPEC_FILE'

// ─── CLI behaviour ─────────────────────────────────────────────────────────────

describe('tables-doc CLI', () => {
  let temporaryDirectoryPath = ''

  before(() => {
    temporaryDirectoryPath = createTemporaryDirectory('tables-doc-')
  })

  after(() => {
    removeDirectory(temporaryDirectoryPath)
  })

  it('Given --help is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc(['--help']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given -h is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc(['-h']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no spec file is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc([]))

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no --output is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc(['test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml'])
    )

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given a valid spec file, When the command executes, Then it writes a complete Markdown document', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'output.md')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, [])
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-with-tentative-order.md')
    )
  })

  it('Given a valid spec file, When the command executes with -o, Then it writes to the output file', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'short-flag.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '-o',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-with-tentative-order.md')
    )
  })

  it('Given an existing output file, When the command executes, Then it overwrites the file', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'overwrite.md')

    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '-o',
        outputFilePath
      ])
    )
    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '-o',
        outputFilePath
      ])
    )

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-with-tentative-order.md')
    )
  })

  it('Given the same spec file run twice, When the command executes, Then it produces the same sha256', () => {
    const firstOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-run1.md')
    const secondOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-run2.md')

    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '-o',
        firstOutputFilePath
      ])
    )
    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '-o',
        secondOutputFilePath
      ])
    )

    const sha1 = getFrontmatterValue(readTextFile(firstOutputFilePath), 'sha256')
    const sha2 = getFrontmatterValue(readTextFile(secondOutputFilePath), 'sha256')

    assert.notEqual(sha1, undefined)
    assert.equal(sha1, sha2)
  })

  it('Given two specs with identical content but different key order, When the command executes, Then sha256 values match', () => {
    const firstOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-key-ordered.md')
    const secondOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-key-reordered.md')

    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/special-character-escaping.valid.yaml',
        '-o',
        firstOutputFilePath
      ])
    )
    runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/special-character-escaping-reordered.valid.yaml',
        '-o',
        secondOutputFilePath
      ])
    )

    const sha1 = getFrontmatterValue(readTextFile(firstOutputFilePath), 'sha256')
    const sha2 = getFrontmatterValue(readTextFile(secondOutputFilePath), 'sha256')

    assert.notEqual(sha1, undefined)
    assert.equal(sha1, sha2)
  })

  it('Given a spec without an OpenAPI source, When the command executes, Then detail columns use the VARCHAR(1024) fallback type', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'no-openapi.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-without-openapi-source.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-without-openapi-source.md')
    )
  })

  it('Given a spec with special characters in aliases and enum values, When the command executes, Then cell text and DDL are correctly escaped', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'escaping.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/special-character-escaping.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/special-character-escaping.md')
    )
  })

  it('Given a spec with Mermaid-unsafe identifiers, When the command executes, Then the ER diagram uses sanitized identifiers', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'mermaid-identifiers.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([
        'test/commands/tables-doc/fixtures/sketches/online-shop-mermaid-identifier-sanitization.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-mermaid-identifier-sanitization.md')
    )
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns a non-zero exit code', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'error.md')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc(['nonexistent.yaml', '--output', outputFilePath])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })
})

// ─── Library contract ──────────────────────────────────────────────────────────

describe('renderTablesDoc library contract', () => {
  it('Given an optional OpenAPI field, When renderTablesDoc is called, Then the column shows Nullable: yes', () => {
    const validated = validate({
      specFilePath: 'test/commands/tables-doc/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, 'custom/source label')

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/custom-source-label.md')
    )
  })

  it('Given optionals overrides, When renderTablesDoc is called, Then Nullable reflects the override', () => {
    const validated = validate({
      specFilePath: 'test/commands/tables-doc/fixtures/sketches/online-shop-optionals-override.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(
      validated.spec,
      projection,
      'test/commands/tables-doc/fixtures/sketches/online-shop-optionals-override.valid.yaml'
    )

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/online-shop-optionals-override.md')
    )
  })

  it('Given aliases with pipe and backslash, When renderTablesDoc is called, Then cell text is escaped', () => {
    const validated = validate({
      specFilePath: 'test/commands/tables-doc/fixtures/sketches/special-character-escaping.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, 'special-character-escaping.valid.yaml')

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/special-character-escaping.md')
    )
  })

  it('Given an enum value with a single quote, When renderTablesDoc is called, Then the DDL uses SQL-escaped literals', () => {
    const validated = validate({
      specFilePath: 'test/commands/tables-doc/fixtures/sketches/special-character-escaping.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, 'special-character-escaping.valid.yaml')

    assert.equal(
      normalizeGeneratedAt(content),
      readTextFile('test/commands/tables-doc/fixtures/markdown/special-character-escaping.md')
    )
  })
})

function normalizeGeneratedAt(content: string) {
  return content.replace(/^generated_at: .+$/m, 'generated_at: <generated_at>') // generated_at is rendered at runtime.
}

function getFrontmatterValue(content: string, fieldName: string): string | undefined {
  const prefix = `${fieldName}: `
  const line = content.split('\n').find(contentLine => contentLine.startsWith(prefix))

  return line?.slice(prefix.length)
}
