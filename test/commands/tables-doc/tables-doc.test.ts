import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { parseArgs } from 'node:util'
import { config, execute } from '../../../src/commands/tables-doc.ts'
import { runAndCaptureSync } from '../../test-helper/logger.ts'
import { normalizeMarkdown } from '../../test-helper/normalize.ts'
import {
  createTemporaryDirectory,
  createTemporaryPath,
  deleteTemporaryDirectory,
  readTextFile,
  writeTextFile
} from '../../test-helper/output.ts'

describe('tables-doc command', () => {
  let temporaryDirectory = ''

  before(() => {
    temporaryDirectory = createTemporaryDirectory('tables-doc-command-')
  })

  after(() => {
    deleteTemporaryDirectory(temporaryDirectory)
  })

  it('Given a valid YAML specification, When the command executes, Then it writes a Markdown table specification', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'online-shop-example.md')

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-example.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.equal(
      normalizeMarkdown(readTextFile(outputPath)).markdown,
      readTextFile('test/commands/tables-doc/fixtures/online-shop-example.expected.md')
    )
  })

  it('Given a valid YAML specification and short output option, When the command executes, Then it writes a Markdown table specification', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'online-shop-example-short.md')

    const options = parseArgs({
      ...config,
      args: ['test/commands/tables-doc/fixtures/online-shop-example.valid.yaml', '-o', outputPath]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.match(readTextFile(outputPath), /^# online-shop/m)
  })

  it('Given a specification with a different key order, When the command executes, Then it writes the same normalized hash', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-example-different-key-order.md'
    )

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-example-different-key-order.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])

    const actual = normalizeMarkdown(readTextFile(outputPath))

    const expected = normalizeMarkdown(
      readTextFile('test/commands/tables-doc/fixtures/online-shop-example.expected.md')
    )

    assert.notEqual(actual.sha256, undefined)
    assert.notEqual(expected.sha256, undefined)
    assert.equal(actual.sha256, expected.sha256)
  })

  it('Given a specification with priced products, When the command executes, Then it writes decimal types and defaults', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'online-shop-priced-products.md')

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-priced-products.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.equal(
      normalizeMarkdown(readTextFile(outputPath)).markdown,
      readTextFile('test/commands/tables-doc/fixtures/online-shop-priced-products.expected.md')
    )
  })

  it('Given a specification with cart items identified by a composite primary key, When the command executes, Then it writes the composite primary key', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'online-shop-cart-items.md')

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-cart-items.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.equal(
      normalizeMarkdown(readTextFile(outputPath)).markdown,
      readTextFile('test/commands/tables-doc/fixtures/online-shop-cart-items.expected.md')
    )
  })

  it('Given a specification with a tentative store, When the command executes, Then it writes a warning before the column table', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-tentative-cart-items.md'
    )

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-tentative-cart-items.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.equal(
      normalizeMarkdown(readTextFile(outputPath)).markdown,
      readTextFile(
        'test/commands/tables-doc/fixtures/online-shop-tentative-cart-items.expected.md'
      )
    )
  })

  it('Given the output file already exists, When the command executes, Then it overwrites the file', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'overwrite.md')

    writeTextFile(outputPath, 'old content')
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-example.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.notEqual(readTextFile(outputPath), 'old content')
  })

  it('Given help is requested, When the command executes, Then it prints usage', () => {
    const options = parseArgs({
      ...config,
      args: ['--help']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.match(
      result.stdout.join(''),
      /Usage: shot tables-doc <spec file> --output <table spec file>/
    )
    assert.match(result.stdout.join(''), /-o, --output/)
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

    assert.match(
      result.stdout.join(''),
      /Usage: shot tables-doc <spec file> --output <table spec file>/
    )
    assert.deepEqual(result.stderr, [])
  })

  it('Given no output is provided, When the command executes, Then it prints usage', () => {
    const options = parseArgs({
      ...config,
      args: ['test/commands/tables-doc/fixtures/online-shop-example.valid.yaml']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.match(
      result.stdout.join(''),
      /Usage: shot tables-doc <spec file> --output <table spec file>/
    )
    assert.deepEqual(result.stderr, [])
  })

  it('Given an invalid specification, When the command executes, Then it prints the validation error and does not write output', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'invalid.md')

    const options = parseArgs({
      ...config,
      args: [
        'test/commands/tables-doc/fixtures/online-shop-unsupported-field-type.invalid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.match(result.stderr.join(''), /stores\.customer\.fields\.id\.type\.name/)
    assert.throws(() => readTextFile(outputPath), /ENOENT/)
  })
})
