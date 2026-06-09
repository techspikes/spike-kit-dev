import assert from 'node:assert'
import { readFileSync, writeFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { parseArgs } from 'node:util'
import { config, execute } from '../../../src/commands/table-spec.ts'
import utils from '../../../src/core/utils.ts'
import { runAndCaptureSync } from '../../test-helper/logger.ts'
import {
  createTemporaryDirectory,
  createTemporaryPath,
  deleteTemporaryDirectory
} from '../../test-helper/output.ts'

describe('table-spec command', () => {
  let temporaryDirectory = ''

  before(() => {
    temporaryDirectory = createTemporaryDirectory('table-spec-command-')
  })

  after(() => {
    deleteTemporaryDirectory(temporaryDirectory)
  })

  it('Given a valid YAML specification, When the command executes, Then it writes a Markdown table specification', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-example.md'
    )
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-example.valid.yaml',
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
      normalizeGeneratedMarkdown(readFileSync(outputPath, 'utf-8')),
      utils
        .readCwdRelativePathSync(
          'test/commands/table-spec/fixtures/online-shop-example.expected.md'
        )
        .toString('utf-8')
    )
  })

  it('Given a valid YAML specification and short output option, When the command executes, Then it writes a Markdown table specification', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-example-short.md'
    )
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-example.valid.yaml',
        '-o',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.match(readFileSync(outputPath, 'utf-8'), /^# online-shop/m)
  })

  it('Given a specification with priced products, When the command executes, Then it writes decimal types and defaults', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-priced-products.md'
    )
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-priced-products.valid.yaml',
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
      normalizeGeneratedMarkdown(readFileSync(outputPath, 'utf-8')),
      utils
        .readCwdRelativePathSync(
          'test/commands/table-spec/fixtures/online-shop-priced-products.expected.md'
        )
        .toString('utf-8')
    )
  })

  it('Given a specification with cart items identified by a composite primary key, When the command executes, Then it writes the composite primary key', () => {
    const outputPath = createTemporaryPath(
      temporaryDirectory,
      'online-shop-cart-items.md'
    )
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-cart-items.valid.yaml',
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
      normalizeGeneratedMarkdown(readFileSync(outputPath, 'utf-8')),
      utils
        .readCwdRelativePathSync(
          'test/commands/table-spec/fixtures/online-shop-cart-items.expected.md'
        )
        .toString('utf-8')
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
        'test/commands/table-spec/fixtures/online-shop-tentative-cart-items.valid.yaml',
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
      normalizeGeneratedMarkdown(readFileSync(outputPath, 'utf-8')),
      utils
        .readCwdRelativePathSync(
          'test/commands/table-spec/fixtures/online-shop-tentative-cart-items.expected.md'
        )
        .toString('utf-8')
    )
  })

  it('Given the output file already exists, When the command executes, Then it overwrites the file', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'overwrite.md')
    writeFileSync(outputPath, 'old content')
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-example.valid.yaml',
        '--output',
        outputPath
      ]
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.deepEqual(result.stdout, [])
    assert.deepEqual(result.stderr, [])
    assert.notEqual(readFileSync(outputPath, 'utf-8'), 'old content')
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
      /Usage: shot table-spec <spec file> --output <table spec file>/
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
      /Usage: shot table-spec <spec file> --output <table spec file>/
    )
    assert.deepEqual(result.stderr, [])
  })

  it('Given no output is provided, When the command executes, Then it prints usage', () => {
    const options = parseArgs({
      ...config,
      args: ['test/commands/table-spec/fixtures/online-shop-example.valid.yaml']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    assert.match(
      result.stdout.join(''),
      /Usage: shot table-spec <spec file> --output <table spec file>/
    )
    assert.deepEqual(result.stderr, [])
  })

  it('Given an invalid specification, When the command executes, Then it prints the validation error and does not write output', () => {
    const outputPath = createTemporaryPath(temporaryDirectory, 'invalid.md')
    const options = parseArgs({
      ...config,
      args: [
        'test/commands/table-spec/fixtures/online-shop-unsupported-field-type.invalid.yaml',
        '--output',
        outputPath
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
    assert.throws(() => readFileSync(outputPath, 'utf-8'), /ENOENT/)
  })
})

function normalizeGeneratedMarkdown(markdown: string) {
  return markdown.replace(/^generated_at: .+$/m, 'generated_at: <generated-at>')
}
