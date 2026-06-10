import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createDbProjectionSnapshot } from '../../../src/core/projector.ts'
import utils from '../../../src/core/utils.ts'
import { parseSpecification } from '../../../src/core/validator.ts'

describe('core projector', () => {
  it('createDbProjectionSnapshot projects an online shop specification into a name-based db snapshot', () => {
    const specification = parseSpecification(
      utils
        .readCwdRelativePathSync('test/core/projector/fixtures/online-shop-example.valid.yaml')
        .toString('utf-8')
    )
    const expected = JSON.parse(
      utils
        .readCwdRelativePathSync(
          'test/core/projector/fixtures/online-shop-example.db-projection-snapshot.json'
        )
        .toString('utf-8')
    )

    assert.deepEqual(createDbProjectionSnapshot(specification), expected)
  })
})
