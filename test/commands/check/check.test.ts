import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parseArgs } from 'node:util'
import { config, execute } from '../../../src/commands/check.ts'
import { runAndCaptureSync } from '../../test-helper/logger.ts'

describe('validator', async () => {
  it('test', async () => {
    const options = parseArgs({
      ...config,
      args: ['test/commands/check/fixtures/online-shop-minimal.valid.yaml']
    })

    const result = runAndCaptureSync(() => {
      execute(options)
    })

    console.log(result.stdout.toString())
    console.log(result.stderr.toString())
    assert.ok(true)
  })
})
