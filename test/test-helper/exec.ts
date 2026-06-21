import { execSync } from 'node:child_process'

export function exec(cmd: string): void {
  const out = execSync(cmd, { stdio: 'pipe' })

  if (out.length > 0) {
    process.stdout.write(out)
  }
}
