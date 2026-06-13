import assert from 'node:assert'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  readBaseRelativeTextFile as readCoreBaseRelativeTextFile,
  readCwdRelativeTextFile as readCoreCwdRelativeTextFile,
  resolveCwdRelativeDirectoryPath as resolveCoreCwdRelativeDirectoryPath,
  resolveCwdRelativePath as resolveCoreCwdRelativePath
} from '../../../src/core/utils.ts'
import {
  readBaseRelativeTextFile,
  readCwdRelativeTextFile,
  resolveCwdRelativeDirectoryPath,
  resolveCwdRelativePath
} from '../../test-helper/file-access.ts'

describe('core utils', () => {
  it('resolveCwdRelativePath resolves a relative fixture path from the current working directory', () => {
    assert.equal(
      resolveCoreCwdRelativePath('test/core/utils/fixtures/online-shop.valid.yaml'),
      join(process.cwd(), 'test/core/utils/fixtures/online-shop.valid.yaml')
    )
  })

  it('resolveCwdRelativePath returns an absolute fixture path unchanged', () => {
    const fixturePath = join(process.cwd(), 'test/core/utils/fixtures/online-shop.valid.yaml')

    assert.equal(resolveCoreCwdRelativePath(fixturePath), resolveCwdRelativePath(fixturePath))
  })

  it('resolveCwdRelativeDirectoryPath returns the fixture directory path', () => {
    assert.equal(
      resolveCoreCwdRelativeDirectoryPath('test/core/utils/fixtures/online-shop.valid.yaml'),
      join(process.cwd(), 'test/core/utils/fixtures')
    )
  })

  it('readCwdRelativeTextFile reads a fixture path from the current working directory', () => {
    const content = readCoreCwdRelativeTextFile('test/core/utils/fixtures/online-shop.valid.yaml')

    assert.match(content, /data-sketch: 1\.0\.0-draft\.2/)
  })

  it('readBaseRelativeTextFile reads an absolute fixture path', () => {
    const fixturePath = join(process.cwd(), 'test/core/utils/fixtures/online-shop.valid.yaml')
    const content = readCoreBaseRelativeTextFile('unused-base-path', fixturePath)

    assert.equal(content, readBaseRelativeTextFile('unused-base-path', fixturePath))
  })

  it('readBaseRelativeTextFile reads a fixture path relative to a base directory', () => {
    const content = readCoreBaseRelativeTextFile(
      'test/core/utils/fixtures',
      'online-shop.valid.yaml'
    )

    assert.equal(
      content,
      readCwdRelativeTextFile('test/core/utils/fixtures/online-shop.valid.yaml')
    )
    assert.equal(
      resolveCoreCwdRelativeDirectoryPath('test/core/utils/fixtures/online-shop.valid.yaml'),
      resolveCwdRelativeDirectoryPath('test/core/utils/fixtures/online-shop.valid.yaml')
    )
  })
})
