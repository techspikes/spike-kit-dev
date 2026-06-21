import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'

export function getCurrentDirectoryPath() {
  return process.cwd()
}

export function resolveCwdRelativeFilePath(filePath: string) {
  return resolve(filePath)
}

export function resolveCwdRelativeDirectoryPath(filePath: string) {
  return resolveDirectoryPath(resolveCwdRelativeFilePath(filePath))
}

export function resolveDirectoryPath(filePath: string) {
  return dirname(filePath)
}

export function resolveBaseRelativeFilePath(baseDirectoryPath: string, filePath: string) {
  if (isAbsolute(filePath)) {
    return filePath
  }

  return resolve(baseDirectoryPath, filePath)
}

export function getFileName(filePath: string) {
  return basename(filePath)
}

export function readTextFile(filePath: string) {
  return readFileSync(filePath, 'utf-8')
}

export function readBaseRelativeTextFile(baseDirectoryPath: string, filePath: string) {
  return readTextFile(resolveBaseRelativeFilePath(baseDirectoryPath, filePath))
}

export function writeTextFile(filePath: string, content: string) {
  writeFileSync(filePath, content)
}
