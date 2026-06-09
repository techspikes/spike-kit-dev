import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export function resolveCwdRelativePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path)
}

export function readCwdRelativePathSync(path: string) {
  return readFileSync(resolveCwdRelativePath(path))
}

export function writeCwdRelativePathSync(path: string, data: string) {
  writeFileSync(resolveCwdRelativePath(path), data)
}

export function readBaseRelativePathSync(basePath: string, path: string) {
  if (isAbsolute(path)) {
    return readFileSync(path)
  }

  const resolvedBasePath = statSync(basePath).isDirectory()
    ? basePath
    : dirname(basePath)

  return readFileSync(join(resolvedBasePath, path))
}

export function extractErrorMessages(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  } else if (typeof error === 'string') {
    return error
  } else {
    return 'unknown error'
  }
}

export default {
  resolveCwdRelativePath,
  readCwdRelativePathSync,
  writeCwdRelativePathSync,
  readBaseRelativePathSync,
  extractErrorMessages
}
