import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getCurrentDirectoryPath,
  getFileName,
  readBaseRelativeTextFile,
  readTextFile,
  resolveBaseRelativeFilePath,
  resolveCwdRelativeDirectoryPath,
  resolveCwdRelativeFilePath,
  resolveDirectoryPath,
  writeTextFile
} from '../../../src/core/utils.ts'
import { joinFilePath, readTextFile as readTestTextFile } from '../../test-helper/file-access.ts'

describe('core utils', () => {
  it('resolveCwdRelativeFilePath resolves a relative fixture file path from the current working directory', () => {
    assert.equal(
      resolveCwdRelativeFilePath('test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml'),
      joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
    )
  })

  it('resolveCwdRelativeFilePath returns an absolute fixture file path unchanged', () => {
    assert.equal(
      resolveCwdRelativeFilePath(
        joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
      ),
      joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
    )
  })

  it('resolveCwdRelativeDirectoryPath returns the fixture directory path', () => {
    assert.equal(
      resolveCwdRelativeDirectoryPath('test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml'),
      joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches')
    )
  })

  it('getCurrentDirectoryPath returns the current working directory path', () => {
    assert.equal(getCurrentDirectoryPath(), process.cwd())
  })

  it('resolveDirectoryPath returns the parent directory path', () => {
    assert.equal(resolveDirectoryPath('/tmp/example/file.txt'), '/tmp/example')
  })

  it('resolveBaseRelativeFilePath resolves a relative file path from a base directory', () => {
    assert.equal(
      resolveBaseRelativeFilePath(
        joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches'),
        'online-shop-file-access.valid.yaml'
      ),
      joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
    )
  })

  it('resolveBaseRelativeFilePath returns an absolute file path unchanged', () => {
    assert.equal(
      resolveBaseRelativeFilePath(
        'unused-base-directory',
        joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
      ),
      joinFilePath(process.cwd(), 'test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
    )
  })

  it('getFileName returns the final file path segment', () => {
    assert.equal(
      getFileName('test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml'),
      'online-shop-file-access.valid.yaml'
    )
  })

  it('readTextFile reads a fixture file path', () => {
    const content = readTextFile(
      resolveCwdRelativeFilePath('test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml')
    )

    assert.match(content, /data-sketch: 1\.0\.0-draft\.3/)
  })

  it('readBaseRelativeTextFile reads a fixture file path relative to a base directory', () => {
    const content = readBaseRelativeTextFile('test/core/utils/fixtures/sketches', 'online-shop-file-access.valid.yaml')

    assert.equal(content, readTestTextFile('test/core/utils/fixtures/sketches/online-shop-file-access.valid.yaml'))
  })

  it('writeTextFile writes text to a file path', () => {
    const outputFilePath = '/tmp/spike-kit-utils-write-text-file.txt'

    writeTextFile(outputFilePath, 'written by utils')

    assert.equal(readTextFile(outputFilePath), 'written by utils')
  })
})
