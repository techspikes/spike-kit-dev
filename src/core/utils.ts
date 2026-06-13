import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export function resolveCwdRelativePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path)
}

export function resolveCwdRelativeDirectoryPath(path: string) {
  return dirname(resolveCwdRelativePath(path))
}

export function readCwdRelativeTextFile(path: string) {
  return readFileSync(resolveCwdRelativePath(path), 'utf-8')
}

export function readBaseRelativeTextFile(basePath: string, path: string) {
  if (isAbsolute(path)) {
    return readFileSync(path, 'utf-8')
  }

  return readFileSync(join(basePath, path), 'utf-8')
}
