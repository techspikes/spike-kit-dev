import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function createTemporaryDirectory(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function deleteTemporaryDirectory(path: string) {
  rmSync(path, { recursive: true, force: true })
}

export function createTemporaryPath(directory: string, fileName: string) {
  return join(directory, fileName)
}
