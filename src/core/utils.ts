import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readCwdRelativePathSync(path: string) {
  return readFileSync(join(process.cwd(), path))
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
  extractErrorMessages
}
