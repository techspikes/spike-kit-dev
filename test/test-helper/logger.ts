import { AsyncLocalStorage } from 'node:async_hooks'

const logStdout = new AsyncLocalStorage<string[]>()
const logStderr = new AsyncLocalStorage<string[]>()

const originalStdoutWrite = process.stdout.write
const originalStderrWrite = process.stderr.write

type CaptureOptions = {
  readonly stdout?: boolean
  readonly stderr?: boolean
}

type CaptureResult = {
  readonly stdout: string[]
  readonly stderr: string[]
}

export async function runAndCapture(
  targetFn: () => Promise<void>,
  options: CaptureOptions = { stdout: true, stderr: true }
): Promise<CaptureResult> {
  const stdoutResult: string[] = []
  const stderrResult: string[] = []

  const executeWithStderr = async () => {
    if (options.stderr) {
      return logStderr.run(stderrResult, async () => {
        await targetFn()
      })
    }
    return targetFn()
  }

  const executeWithStdout = async () => {
    if (options.stdout) {
      return logStdout.run(stdoutResult, async () => {
        await executeWithStderr()
      })
    }
    return executeWithStderr()
  }

  await executeWithStdout()

  return {
    stdout: stdoutResult,
    stderr: stderrResult
  }
}

export function runAndCaptureSync(
  targetFn: () => void,
  options: CaptureOptions = { stdout: true, stderr: true }
): CaptureResult {
  const stdoutResult: string[] = []
  const stderrResult: string[] = []

  const executeWithStderr = () => {
    if (options.stderr) {
      return logStderr.run(stderrResult, () => {
        targetFn()
      })
    }
    return targetFn()
  }

  const executeWithStdout = () => {
    if (options.stdout) {
      return logStdout.run(stdoutResult, () => {
        executeWithStderr()
      })
    }
    return executeWithStderr()
  }

  executeWithStdout()

  return {
    stdout: stdoutResult,
    stderr: stderrResult
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

    return originalWrite.apply(context, [
      chunk,
      typeof encoding === 'function' ? undefined : encoding,
      callback
    ])
  }
}

process.stdout.write = createCapturedWrite(
  originalStdoutWrite,
  process.stdout,
  logStdout
)
process.stderr.write = createCapturedWrite(
  originalStderrWrite,
  process.stderr,
  logStderr
)
