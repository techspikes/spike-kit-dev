import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createDbProjectionSnapshot } from '../../../src/core/projector.ts'
import { parseSpecification } from '../../../src/core/validator.ts'
import { readTextFile } from '../../test-helper/output.ts'

describe('core projector', () => {
  it('createDbProjectionSnapshot projects an online shop specification into a name-based db snapshot', () => {
    const specification = parseSpecification(
      readTextFile('test/core/projector/fixtures/online-shop-example.valid.yaml')
    )

    const expected = JSON.parse(
      readTextFile('test/core/projector/fixtures/online-shop-example.db-projection-snapshot.json')
    )

    assert.deepEqual(createDbProjectionSnapshot(specification), expected)
  })
})
