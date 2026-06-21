import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function createTemporaryDirectory(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function joinFilePath(...filePathSegments: string[]) {
  return join(...filePathSegments)
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

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readTextFile(filePath)) as T
}

export function writeTextFile(filePath: string, content: string) {
  writeFileSync(filePath, content)
}

export function removeDirectory(directoryPath: string) {
  rmSync(directoryPath, { recursive: true, force: true })
}
