import { chmod, rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('bin', { recursive: true, force: true })
await rm('lib', { recursive: true, force: true })

await build({
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  minify: true,
  target: 'node22',
  entryPoints: ['src/cli.ts'],
  outfile: 'bin/cli.mjs'
})

await build({
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  minify: true,
  target: 'node22',
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.mjs'
})

await chmod('bin/cli.mjs', 0o755)
