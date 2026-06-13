import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export function resolveCwdRelativePath(path: string) {
  return isAbsolute(path) ? path : join(process.cwd(), path)
}

export function readCwdRelativeTextFile(path: string) {
  return readFileSync(resolveCwdRelativePath(path), 'utf-8')
}

export function readCwdRelativePathSync(path: string) {
  return readFileSync(resolveCwdRelativePath(path))
}

export function writeCwdRelativeTextFile(path: string, data: string) {
  writeFileSync(resolveCwdRelativePath(path), data)
}

export function writeCwdRelativePathSync(path: string, data: string) {
  writeFileSync(resolveCwdRelativePath(path), data)
}

export function readBaseRelativeTextFile(basePath: string, path: string) {
  if (isAbsolute(path)) {
    return readFileSync(path, 'utf-8')
  }

  const resolvedBasePath = statSync(basePath).isDirectory() ? basePath : dirname(basePath)

  return readFileSync(join(resolvedBasePath, path), 'utf-8')
}

export function readBaseRelativePathSync(basePath: string, path: string) {
  if (isAbsolute(path)) {
    return readFileSync(path)
  }

  const resolvedBasePath = statSync(basePath).isDirectory() ? basePath : dirname(basePath)

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
