import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  extractErrorMessages,
  readBaseRelativePathSync,
  readBaseRelativeTextFile,
  readCwdRelativePathSync,
  readCwdRelativeTextFile,
  resolveCwdRelativePath,
  writeCwdRelativePathSync,
  writeCwdRelativeTextFile
} from '../../../src/core/utils.ts'
import {
  createTemporaryDirectory,
  createTemporaryPath,
  deleteTemporaryDirectory
} from '../../test-helper/output.ts'

describe('core utils', () => {
  it('resolveCwdRelativePath resolves a fixture path relative to the current working directory', () => {
    assert.equal(
      resolveCwdRelativePath('test/core/utils/fixtures/online-shop-example.valid.yaml'),
      join(process.cwd(), 'test/core/utils/fixtures/online-shop-example.valid.yaml')
    )
  })

  it('resolveCwdRelativePath returns an absolute fixture path unchanged', () => {
    const path = join(process.cwd(), 'test/core/utils/fixtures/online-shop-example.valid.yaml')

    assert.equal(resolveCwdRelativePath(path), path)
  })

  it('readCwdRelativePathSync reads a fixture file relative to the current working directory', () => {
    const content = readCwdRelativeTextFile(
      'test/core/utils/fixtures/online-shop-example.valid.yaml'
    )

    assert.match(content, /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('writeCwdRelativePathSync writes content to a path relative to the current working directory', () => {
    const directory = createTemporaryDirectory('core-utils-')

    try {
      const path = createTemporaryPath(directory, 'output.txt')

      writeCwdRelativeTextFile(path, 'online shop output')

      assert.equal(readCwdRelativeTextFile(path), 'online shop output')
    } finally {
      deleteTemporaryDirectory(directory)
    }
  })

  it('readCwdRelativePathSync reads a fixture file as a buffer relative to the current working directory', () => {
    const content = readCwdRelativePathSync(
      'test/core/utils/fixtures/online-shop-example.valid.yaml'
    )

    assert.match(content.toString('utf-8'), /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('writeCwdRelativePathSync writes buffer-readable content to a path relative to the current working directory', () => {
    const directory = createTemporaryDirectory('core-utils-')

    try {
      const path = createTemporaryPath(directory, 'output.txt')

      writeCwdRelativePathSync(path, 'online shop buffer output')

      assert.equal(readCwdRelativePathSync(path).toString('utf-8'), 'online shop buffer output')
    } finally {
      deleteTemporaryDirectory(directory)
    }
  })

  it('readBaseRelativePathSync reads an absolute fixture path', () => {
    const content = readBaseRelativeTextFile(
      'unused-base-path',
      join(process.cwd(), 'test/core/utils/fixtures/online-shop-example.valid.yaml')
    )

    assert.match(content, /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('readBaseRelativePathSync reads a fixture path relative to a base path', () => {
    const content = readBaseRelativeTextFile(
      'test/core/utils/fixtures',
      'online-shop-example.valid.yaml'
    )

    assert.match(content, /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('readBaseRelativePathSync reads a fixture path relative to a base file path', () => {
    const content = readBaseRelativeTextFile(
      'test/core/utils/fixtures/online-shop-example.valid.yaml',
      'online-shop-example.valid.yaml'
    )

    assert.match(content, /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('readBaseRelativePathSync reads a fixture path as a buffer relative to a base path', () => {
    const content = readBaseRelativePathSync(
      'test/core/utils/fixtures',
      'online-shop-example.valid.yaml'
    )

    assert.match(content.toString('utf-8'), /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('readBaseRelativePathSync reads an absolute fixture path as a buffer', () => {
    const content = readBaseRelativePathSync(
      'unused-base-path',
      join(process.cwd(), 'test/core/utils/fixtures/online-shop-example.valid.yaml')
    )

    assert.match(content.toString('utf-8'), /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('readBaseRelativePathSync reads a fixture path as a buffer relative to a base file path', () => {
    const content = readBaseRelativePathSync(
      'test/core/utils/fixtures/online-shop-example.valid.yaml',
      'online-shop-example.valid.yaml'
    )

    assert.match(content.toString('utf-8'), /data-sketch: 1\.0\.0-draft\.1/)
  })

  it('extractErrorMessages returns an Error message', () => {
    assert.equal(extractErrorMessages(new Error('validation failed')), 'validation failed')
  })

  it('extractErrorMessages returns a string unchanged', () => {
    assert.equal(extractErrorMessages('plain error'), 'plain error')
  })

  it('extractErrorMessages returns unknown error for unsupported values', () => {
    assert.equal(extractErrorMessages(null), 'unknown error')
    assert.equal(extractErrorMessages({ reason: 'not an error' }), 'unknown error')
  })
})
