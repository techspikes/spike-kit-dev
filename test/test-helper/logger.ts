/* c8 ignore file */
import { AsyncLocalStorage } from 'node:async_hooks'

const logStdout = new AsyncLocalStorage<string[]>()
const logStderr = new AsyncLocalStorage<string[]>()

const originalStdoutWrite = process.stdout.write
const originalStderrWrite = process.stderr.write

type CaptureResult = {
  readonly stdout: string[]
  readonly stderr: string[]
}

export function runAndCapture(targetFn: () => void): CaptureResult {
  const stdoutResult: string[] = []
  const stderrResult: string[] = []

  logStdout.run(stdoutResult, () => {
    logStderr.run(stderrResult, () => {
      targetFn()
    })
  })

  return {
    stdout: stdoutResult,
    stderr: stderrResult
  }
}

async function runAndCaptureAsync(targetFn: () => Promise<void>): Promise<CaptureResult> {
  const stdoutResult: string[] = []
  const stderrResult: string[] = []

  await logStdout.run(stdoutResult, async () => {
    await logStderr.run(stderrResult, async () => {
      await targetFn()
    })
  })

  return {
    stdout: stdoutResult,
    stderr: stderrResult
  }
}

export function runCommandAndCapture(targetFn: () => number) {
  let exitCode = 0

  const result = runAndCapture(() => {
    exitCode = targetFn()
  })

  return {
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

export async function runCommandAndCaptureAsync(targetFn: () => number | Promise<number>) {
  let exitCode = 0

  const result = await runAndCaptureAsync(async () => {
    exitCode = await targetFn()
  })

  return {
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

function createCapturedWrite(
  originalWrite: typeof originalStdoutWrite,
  context: typeof process.stdout | typeof process.stderr,
  storage: AsyncLocalStorage<string[]>
) {
  return (
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean => {
    const store = storage.getStore()

    if (store) {
      store.push(chunk.toString())

      return true
    }

    return originalWrite.apply(context, [chunk, typeof encoding === 'function' ? undefined : encoding, callback])
  }
}

process.stdout.write = createCapturedWrite(originalStdoutWrite, process.stdout, logStdout)
process.stderr.write = createCapturedWrite(originalStderrWrite, process.stderr, logStderr)
