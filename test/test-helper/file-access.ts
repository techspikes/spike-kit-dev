import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function createTemporaryDirectory(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function joinFilePath(...filePathSegments: string[]) {
  return join(...filePathSegments)
}

export function getFileName(filePath: string) {
  return basename(filePath)
}

export function resolveCwdRelativeFilePath(filePath: string) {
  return resolve(filePath)
}

export function resolveCwdRelativeDirectoryPath(filePath: string) {
  return dirname(resolveCwdRelativeFilePath(filePath))
}

export function getFileImportUrl(filePath: string) {
  return pathToFileURL(filePath).href
}

export function readTextFile(filePath: string) {
  return readFileSync(filePath, 'utf-8')
}

export function readFileBytes(filePath: string) {
  return readFileSync(filePath)
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readTextFile(filePath)) as T
}

export function writeTextFile(filePath: string, content: string) {
  writeFileSync(filePath, content)
}

export function removeDirectory(directoryPath: string) {
  rmSync(directoryPath, { recursive: true, force: true })
}

export function listFilePathsRecursively(directoryPath: string) {
  const entries = readdirSync(directoryPath, { withFileTypes: true })
  const filePaths: string[] = []

  for (const entry of entries) {
    const entryFilePath = joinFilePath(directoryPath, entry.name)

    if (entry.isDirectory()) {
      filePaths.push(...listFilePathsRecursively(entryFilePath))
      continue
    }

    if (entry.isFile()) {
      filePaths.push(entryFilePath)
    }
  }

  return filePaths.sort()
}
