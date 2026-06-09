import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import utils, {
  extractErrorMessages,
  readBaseRelativePathSync,
  readCwdRelativePathSync,
  resolveCwdRelativePath,
  writeCwdRelativePathSync
} from '../../../src/core/utils.ts'
import {
  createTemporaryDirectory,
  createTemporaryPath,
  deleteTemporaryDirectory
} from '../../test-helper/output.ts'

describe('core utils', () => {
  it('resolveCwdRelativePath resolves a fixture path relative to the current working directory', () => {
    assert.equal(
      resolveCwdRelativePath(
        'test/core/utils/fixtures/online-shop-example.valid.yaml'
      ),
      join(
        process.cwd(),
        'test/core/utils/fixtures/online-shop-example.valid.yaml'
      )
    )
  })

  it('resolveCwdRelativePath returns an absolute fixture path unchanged', () => {
    const path = join(
      process.cwd(),
      'test/core/utils/fixtures/online-shop-example.valid.yaml'
    )

    assert.equal(resolveCwdRelativePath(path), path)
  })

  it('readCwdRelativePathSync reads a fixture file relative to the current working directory', () => {
    const content = readCwdRelativePathSync(
      'test/core/utils/fixtures/online-shop-example.valid.yaml'
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('writeCwdRelativePathSync writes content to a path relative to the current working directory', () => {
    const directory = createTemporaryDirectory('core-utils-')

    try {
      const path = createTemporaryPath(directory, 'output.txt')

      writeCwdRelativePathSync(path, 'online shop output')

      assert.equal(
        readCwdRelativePathSync(path).toString('utf-8'),
        'online shop output'
      )
    } finally {
      deleteTemporaryDirectory(directory)
    }
  })

  it('readBaseRelativePathSync reads an absolute fixture path', () => {
    const content = readBaseRelativePathSync(
      'unused-base-path',
      join(
        process.cwd(),
        'test/core/utils/fixtures/online-shop-example.valid.yaml'
      )
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('readBaseRelativePathSync reads a fixture path relative to a base path', () => {
    const content = readBaseRelativePathSync(
      'test/core/utils/fixtures',
      'online-shop-example.valid.yaml'
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('readBaseRelativePathSync reads a fixture path relative to a base file path', () => {
    const content = readBaseRelativePathSync(
      'test/core/utils/fixtures/online-shop-example.valid.yaml',
      'online-shop-example.valid.yaml'
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('extractErrorMessages returns an Error message', () => {
    assert.equal(
      extractErrorMessages(new Error('validation failed')),
      'validation failed'
    )
  })

  it('extractErrorMessages returns a string unchanged', () => {
    assert.equal(extractErrorMessages('plain error'), 'plain error')
  })

  it('extractErrorMessages returns unknown error for unsupported values', () => {
    assert.equal(extractErrorMessages(null), 'unknown error')
    assert.equal(
      extractErrorMessages({ reason: 'not an error' }),
      'unknown error'
    )
  })

  it('default export exposes the utility functions', () => {
    assert.equal(utils.resolveCwdRelativePath, resolveCwdRelativePath)
    assert.equal(utils.readBaseRelativePathSync, readBaseRelativePathSync)
    assert.equal(utils.readCwdRelativePathSync, readCwdRelativePathSync)
    assert.equal(utils.writeCwdRelativePathSync, writeCwdRelativePathSync)
    assert.equal(utils.extractErrorMessages, extractErrorMessages)
  })
})
