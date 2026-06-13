import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import {
  buildExtensionProjection,
  buildRelationalDbProjection,
  type ExtensionProjection,
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

  it('buildExtensionProjection rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        buildExtensionProjection(
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

  it('validated sketches can build an empty extension projection through the built-in projector', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    assert.deepEqual(sketch.projections.extensions(), {
      'data-sketch/extension-projection': '1.0.0-draft.2',
      extensions: []
    })
  })

  it('validated sketches can build an extension projection through the built-in projector', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop-extensions.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<ExtensionProjection>(
      'test/core/projector/fixtures/online-shop.extension-projection.json'
    )

    assert.deepEqual(sketch.projections.extensions(), expected)
  })

  it('useProjectors can overwrite the built-in relational DB projector', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    const customProjection: RelationalDbProjection = {
      'data-sketch/relational-db-projection': '1.0.0-draft.2',
      tables: {}
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

  it('buildRelationalDbProjection projects relations using projected column names', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop-relation-only.valid.yaml' }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.customer?.columns[4], {
      id: 'tags[]',
      name: 'tags',
      type: 'VARCHAR(1024)'
    })

    assert.deepEqual(projection.tables.order?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'status',
        name: 'status',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'customer',
        name: 'customer',
        type: 'CHAR(26)'
      }
    ])

    assert.deepEqual(projection.tables.order?.foreignKeys, [
      {
        name: 'fk_orders_customer',
        column: 'customer',
        target: {
          table: 'customers',
          column: 'id'
        },
        kind: 'explicit'
      }
    ])
  })

  it('buildRelationalDbProjection projects claim ID exact-match details as marked foreign keys', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-claim-id-exact-match.valid.yaml'
      }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.order?.foreignKeys, [
      {
        name: 'fk_orders_customer',
        column: 'customer',
        target: {
          table: 'customers',
          column: 'id'
        },
        kind: 'inferred'
      }
    ])

    assert.deepEqual(projection.tables['order.items[]']?.foreignKeys, [
      {
        name: 'fk_order_items_order',
        column: 'order',
        target: {
          table: 'orders',
          column: 'id'
        },
        kind: 'structural'
      },
      {
        name: 'fk_order_items_product',
        column: 'product',
        target: {
          table: 'products',
          column: 'id'
        },
        kind: 'inferred'
      }
    ])

    assert.deepEqual(projection.tables.productCategory?.foreignKeys, [
      {
        name: 'fk_product_categories_product',
        column: 'product',
        target: {
          table: 'products',
          column: 'id'
        },
        kind: 'inferred'
      },
      {
        name: 'fk_product_categories_category',
        column: 'category',
        target: {
          table: 'categories',
          column: 'id'
        },
        kind: 'inferred'
      }
    ])
  })

  it('buildRelationalDbProjection projects relation-only source paths into child tables', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-nested-relation-source-only.valid.yaml'
      }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables['order.items[]']?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'order',
        name: 'order',
        type: 'CHAR(26)'
      },
      {
        id: 'items[].quantity',
        name: 'quantity',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'items[].product',
        name: 'product',
        type: 'CHAR(26)'
      }
    ])

    assert.deepEqual(projection.tables['order.items[]']?.foreignKeys, [
      {
        name: 'fk_order_items_order',
        column: 'order',
        target: {
          table: 'orders',
          column: 'id'
        },
        kind: 'structural'
      },
      {
        name: 'fk_order_items_product',
        column: 'product',
        target: {
          table: 'products',
          column: 'id'
        },
        kind: 'explicit'
      }
    ])
  })

  it('buildRelationalDbProjection infers SQL types and nullability from traced OpenAPI fields', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-openapi-inference.valid.yaml'
      })
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.product?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'displayName',
        name: 'display_name',
        type: 'VARCHAR(80)'
      },
      {
        id: 'sku',
        name: 'sku',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'price',
        name: 'price',
        type: 'INTEGER'
      },
      {
        id: 'stock',
        name: 'stock',
        type: 'INTEGER'
      },
      {
        id: 'discontinued',
        name: 'discontinued',
        type: 'BOOLEAN'
      },
      {
        id: 'optionalNote',
        name: 'optional_note',
        type: 'VARCHAR(120)',
        nullable: true
      },
      {
        id: 'rating',
        name: 'rating',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'internalCode',
        name: 'internal_code',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'tags[]',
        name: 'tags',
        type: 'VARCHAR(15)'
      },
      {
        id: 'legacyCode',
        name: 'legacy_code',
        type: 'VARCHAR(25)'
      },
      {
        id: 'metadata',
        name: 'metadata',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'markers[]',
        name: 'markers',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'unknownUnion',
        name: 'unknown_union',
        type: 'VARCHAR(1024)'
      },
      {
        id: 'looseObject.code',
        name: 'loose_object_code',
        type: 'VARCHAR(10)',
        nullable: true
      },
      {
        id: 'category',
        name: 'category',
        type: 'CHAR(26)'
      }
    ])

    assert.deepEqual(projection.tables['product.variants[]']?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'product',
        name: 'product',
        type: 'CHAR(26)'
      },
      {
        id: 'variants[].name',
        name: 'name',
        type: 'VARCHAR(30)'
      }
    ])

    assert.deepEqual(projection.tables.product?.foreignKeys, [
      {
        name: 'fk_products_category',
        column: 'category',
        target: {
          table: 'categories',
          column: 'id'
        },
        kind: 'explicit'
      }
    ])
  })

  it('buildRelationalDbProjection projects nested array details into child tables', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/projector/fixtures/online-shop-nested-array.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-nested-array.relational-db-projection.json'
    )

    assert.deepEqual(sketch.projections.relationalDb(), expected)
  })

  it('buildRelationalDbProjection flattens nested object details inside child tables', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-child-flattening.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-child-flattening.relational-db-projection.json'
    )

    assert.deepEqual(sketch.projections.relationalDb(), expected)
  })

  it('buildRelationalDbProjection rejects projected table name conflicts', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-projected-table-name-conflict.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => sketch.projections.relationalDb(),
      /Projected table name order_items for table orderItems conflicts with table order\.items\[\]/
    )
  })

  it('buildRelationalDbProjection rejects projected column name conflicts', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-projected-column-name-conflict.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => sketch.projections.relationalDb(),
      /Projected column name address_city for column address_city in table customer conflicts with column address\.city/
    )
  })
})
