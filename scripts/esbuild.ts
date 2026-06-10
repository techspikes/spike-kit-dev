import { chmod, rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm('bin', { recursive: true, force: true })

await build({
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  minify: true,
  entryPoints: ['src/cli.ts'],
  outfile: 'bin/cli.mjs',
  banner: {
    js: '#!/usr/bin/env node'
  }
})

await chmod('bin/cli.mjs', 0o755)
