import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import {
  buildRelationalDbProjection,
  type RelationalDbProjection,
  useProjectors
} from '../../../src/core/projector.ts'
import { validate } from '../../../src/core/validator.ts'
import { readJsonFile } from '../../test-helper/file-access.ts'

describe('core projector', () => {
  it('buildRelationalDbProjection rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        buildRelationalDbProjection(
          parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' })
        ),
      /DataSketch must be validated/
    )
  })

  it('validated sketches can build a relational DB projection through the built-in projector', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop.relational-db-projection.json'
    )

    assert.deepEqual(sketch.projections.relationalDb(), expected)
  })

  it('useProjectors can overwrite the built-in relational DB projector', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    const customProjection: RelationalDbProjection = {
      'data-sketch/relational-db-projection': '1.0.0-draft.2',
      claims: []
    }

    const CustomProjector1 = () => customProjection

    const withCustomProjector = useProjectors(sketch, {
      relationalDb: CustomProjector1
    })

    assert.deepEqual(withCustomProjector.projections.relationalDb(), customProjection)
  })

  it('useProjectors adds command projectors and preserves their inferred return types', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    const CustomProjector1 = () => ({
      'data-sketch/extend-field-projection': '1.0.0-draft.2',
      fields: [
        {
          path: 'customer.phoneNumber',
          extensions: {
            'x-display-label': 'Phone number'
          }
        }
      ]
    })

    const CustomProjector2 = () => ({
      'data-sketch/value-context-projection': '1.0.0-draft.2',
      values: [
        {
          claim: 'customer',
          reason:
            'Customer profile information is needed when customers are created and later looked up for ordering and support context.',
          aliases: ['buyer']
        }
      ]
    })

    const withCommandProjectors = useProjectors(sketch, {
      customProjector1: CustomProjector1,
      customProjector2: CustomProjector2
    })

    assert.deepEqual(withCommandProjectors.projections.customProjector1(), {
      'data-sketch/extend-field-projection': '1.0.0-draft.2',
      fields: [
        {
          path: 'customer.phoneNumber',
          extensions: {
            'x-display-label': 'Phone number'
          }
        }
      ]
    })

    assert.deepEqual(withCommandProjectors.projections.customProjector2(), {
      'data-sketch/value-context-projection': '1.0.0-draft.2',
      values: [
        {
          claim: 'customer',
          reason:
            'Customer profile information is needed when customers are created and later looked up for ordering and support context.',
          aliases: ['buyer']
        }
      ]
    })
  })

  it('buildRelationalDbProjection projects relation-only claims with empty details', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop-relation-only.valid.yaml' }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.claims[0]?.details[3], {
      path: 'tags[]',
      name: 'tags',
      type: 'string',
      required: false
    })

    assert.deepEqual(projection.claims[1]?.details, [])

    assert.deepEqual(projection.claims[1]?.relations, [
      {
        path: 'customer',
        to: 'customer',
        targetName: 'customers'
      },
      {
        path: 'missingCustomer',
        to: 'missingCustomer',
        targetName: 'missingCustomer'
      }
    ])
  })
})
