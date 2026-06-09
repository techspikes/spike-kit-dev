import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export function readCwdRelativePathSync(path: string) {
  return readFileSync(join(process.cwd(), path))
}

export function readResolvedPathSync(basePath: string, path: string) {
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
  readCwdRelativePathSync,
  readResolvedPathSync,
  extractErrorMessages
}
