import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { getFileName, listFilePathsRecursively, readFileBytes } from './test-helper/file-access.ts'

describe('fixture rules', () => {
  it('fixture files with the same name have the same content', () => {
    const fixtureFilePaths = listFilePathsRecursively('test').filter(filePath => filePath.includes('/fixtures/'))
    const filePathsByHashByFileName = new Map<string, Map<string, string[]>>()

    for (const fixtureFilePath of fixtureFilePaths) {
      const fileName = getFileName(fixtureFilePath)
      const hash = createHash('sha256').update(readFileBytes(fixtureFilePath)).digest('hex')
      const filePathsByHash = filePathsByHashByFileName.get(fileName) ?? new Map<string, string[]>()
      const matchingFilePaths = filePathsByHash.get(hash) ?? []

      filePathsByHash.set(hash, [...matchingFilePaths, fixtureFilePath])
      filePathsByHashByFileName.set(fileName, filePathsByHash)
    }

    const mismatches: string[] = []

    for (const [fileName, filePathsByHash] of filePathsByHashByFileName) {
      if (filePathsByHash.size > 1) {
        const mismatchFilePaths = [...filePathsByHash.values()].flat()

        const messageLines = [
          `${fileName} has different content across fixtures:`,
          ...mismatchFilePaths.map(filePath => `  ${filePath}`)
        ]

        mismatches.push(messageLines.join('\n'))
      }
    }

    assert.deepEqual(mismatches, [])
  })

  it('fixture files with the same content have the same name', () => {
    const fixtureFilePaths = listFilePathsRecursively('test').filter(filePath => filePath.includes('/fixtures/'))
    const filePathsByFileNameByHash = new Map<string, Map<string, string[]>>()

    for (const fixtureFilePath of fixtureFilePaths) {
      const fileName = getFileName(fixtureFilePath)
      const hash = createHash('sha256').update(readFileBytes(fixtureFilePath)).digest('hex')
      const filePathsByFileName = filePathsByFileNameByHash.get(hash) ?? new Map<string, string[]>()
      const matchingFilePaths = filePathsByFileName.get(fileName) ?? []

      filePathsByFileName.set(fileName, [...matchingFilePaths, fixtureFilePath])
      filePathsByFileNameByHash.set(hash, filePathsByFileName)
    }

    const mismatches: string[] = []

    for (const filePathsByFileName of filePathsByFileNameByHash.values()) {
      if (filePathsByFileName.size > 1) {
        const mismatchFilePaths = [...filePathsByFileName.values()].flat()

        const messageLines = [
          'Fixture files have the same content with different names:',
          ...mismatchFilePaths.map(filePath => `  ${filePath}`)
        ]

        mismatches.push(messageLines.join('\n'))
      }
    }

    assert.deepEqual(mismatches, [])
  })
})
