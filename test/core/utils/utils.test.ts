import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import utils, {
  extractErrorMessages,
  readCwdRelativePathSync,
  readResolvedPathSync
} from '../../../src/core/utils.ts'

describe('core utils', () => {
  it('readCwdRelativePathSync reads a fixture file relative to the current working directory', () => {
    const content = readCwdRelativePathSync(
      'test/core/utils/fixtures/online-shop-example.valid.yaml'
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('readResolvedPathSync reads an absolute fixture path', () => {
    const content = readResolvedPathSync(
      'unused-base-path',
      join(
        process.cwd(),
        'test/core/utils/fixtures/online-shop-example.valid.yaml'
      )
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('readResolvedPathSync reads a fixture path relative to a base path', () => {
    const content = readResolvedPathSync(
      'test/core/utils/fixtures',
      'online-shop-example.valid.yaml'
    ).toString('utf-8')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.0/)
  })

  it('readResolvedPathSync reads a fixture path relative to a base file path', () => {
    const content = readResolvedPathSync(
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
    assert.equal(utils.readCwdRelativePathSync, readCwdRelativePathSync)
    assert.equal(utils.readResolvedPathSync, readResolvedPathSync)
    assert.equal(utils.extractErrorMessages, extractErrorMessages)
  })
})
