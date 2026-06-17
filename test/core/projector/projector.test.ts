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
      'data-sketch/relational-db-projection': '1.0.0-draft.3',
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

    assert.deepEqual(projection.tables.order?.keys.foreign, [
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

    assert.deepEqual(projection.tables.order?.keys.foreign, [
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

    assert.deepEqual(projection.tables['order.items[]']?.keys.foreign, [
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

    assert.deepEqual(projection.tables.productCategory?.keys.foreign, [
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

  it('buildRelationalDbProjection skips claim ID exact-match inference when the claim has any explicit relation', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-relations-disable-inferred.valid.yaml'
      }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.order?.keys.foreign, [
      {
        name: 'fk_orders_assigned_category',
        column: 'assigned_category',
        target: {
          table: 'categories',
          column: 'id'
        },
        kind: 'explicit'
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

    assert.deepEqual(projection.tables['order.items[]']?.keys.foreign, [
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

    assert.deepEqual(projection.tables.product?.keys.foreign, [
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

  it('buildRelationalDbProjection lets optionals override OpenAPI-inferred nullability', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-optionals-override.valid.yaml'
      })
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.widget?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'requiredField',
        name: 'required_field',
        type: 'VARCHAR(40)',
        nullable: true
      },
      {
        id: 'optionalField',
        name: 'optional_field',
        type: 'VARCHAR(40)'
      }
    ])
  })

  it('buildRelationalDbProjection infers fixed-length CHAR types from OpenAPI date/time string formats', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-string-format-inference.valid.yaml'
      })
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.event?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'occurredAt',
        name: 'occurred_at',
        type: 'CHAR(25)'
      },
      {
        id: 'scheduledDate',
        name: 'scheduled_date',
        type: 'CHAR(10)',
        nullable: true
      },
      {
        id: 'alarmTime',
        name: 'alarm_time',
        type: 'CHAR(14)',
        nullable: true
      },
      {
        id: 'occurrences[]',
        name: 'occurrences',
        type: 'CHAR(25)',
        nullable: true
      },
      {
        id: 'recordedAt',
        name: 'recorded_at',
        type: 'VARCHAR(30)',
        nullable: true
      }
    ])

    assert.deepEqual(projection.tables.eventConflict?.columns, [
      {
        id: 'id',
        name: 'id',
        type: 'CHAR(26)'
      },
      {
        id: 'occurredAt',
        name: 'occurred_at',
        type: 'VARCHAR(1024)',
        nullable: true
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

  it('buildRelationalDbProjection rejects invalid x-relational-db-schema overrides', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-relational-db-schema-extension-invalid.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => sketch.projections.relationalDb(),
      error => {
        const message = (error as Error).message

        const expectedIssues = [
          'claims.customer.x-relational-db-schema.types.doesNotExist does not reference an existing projected column',
          'claims.customer.x-relational-db-schema.types.phoneNumber must specify a positive integer length for type CHAR',
          'claims.customer.x-relational-db-schema.types.email must specify a positive integer precision and a non-negative integer scale for type DECIMAL',
          'claims.customer.x-relational-db-schema.types.name.type NUMERIC is not supported',
          'claims.customer.x-relational-db-schema.types.id must be an object with a type',
          'claims.customer.x-relational-db-schema.constraints.unknownConstraintMember is not a supported x-relational-db-schema member',
          'claims.customer.x-relational-db-schema.constraints.unique must be an array',
          'claims.customer.x-relational-db-schema.constraints.check[0] must have a column, a non-empty enum array of non-empty strings, and, when present, a non-empty name',
          'claims.customer.x-relational-db-schema.constraints.check[1].column references unknown column doesNotExist',
          'claims.customer.x-relational-db-schema.constraints.check[2] must have a column, a non-empty enum array of non-empty strings, and, when present, a non-empty name',
          'claims.customer.x-relational-db-schema.constraints.check[3] must have a column, a non-empty enum array of non-empty strings, and, when present, a non-empty name',
          'claims.customer.x-relational-db-schema.indexes[0].columns references unknown column doesNotExist',
          'claims.customer.x-relational-db-schema.indexes[1] must have a non-empty name and a non-empty columns array',
          'claims.customer.x-relational-db-schema.names.unknownNamesMember is not a supported x-relational-db-schema member',
          'claims.customer.x-relational-db-schema.names.tables.doesNotExist does not reference a projected table for this claim',
          'Projected table name products for table customer conflicts with table product',
          'claims.customer.x-relational-db-schema.names.columns.doesNotExist does not reference a projected table for this claim',
          'claims.customer.x-relational-db-schema.names.columns.customer must be an object',
          'claims.order.x-relational-db-schema.names.columns.order.doesNotExist does not reference an existing projected column',
          'claims.order.x-relational-db-schema.names.columns.order.status must be a non-empty string',
          'Projected column name id for column customer in table order conflicts with column id',
          'claims.order.x-relational-db-schema.keys.unknownKeyMember is not a supported x-relational-db-schema member',
          'claims.order.x-relational-db-schema.keys.foreign[0].columns must be an array with exactly one column id',
          'claims.order.x-relational-db-schema.keys.foreign[1].columns must be an array with exactly one column id',
          'claims.order.x-relational-db-schema.keys.foreign[2].references.table must be a string',
          'claims.order.x-relational-db-schema.keys.foreign[3].references.columns references unknown column doesNotExist in table customer',
          'claims.order.x-relational-db-schema.keys.foreign[4].columns references unknown column doesNotExist',
          'claims.order.x-relational-db-schema.keys.foreign[5].references.table references unknown table doesNotExist',
          'claims.order.x-relational-db-schema.keys.foreign[6].name must be a non-empty string',
          'claims.order.x-relational-db-schema.keys.foreign[8] matches the same existing foreign key as another override entry',
          'claims.order.x-relational-db-schema.keys.foreign[9].references.table must be a string',
          'claims.product.x-relational-db-schema.keys.foreign must be an array',
          'claims.widget.x-relational-db-schema must be an object',
          'claims.gadget.x-relational-db-schema.unsupportedTopMember is not a supported x-relational-db-schema member',
          'claims.gadget.x-relational-db-schema.types must be an object',
          'claims.gadget.x-relational-db-schema.keys must be an object',
          'claims.gadget.x-relational-db-schema.constraints must be an object',
          'claims.gadget.x-relational-db-schema.indexes must be an array',
          'claims.gadget.x-relational-db-schema.names must be an object',
          'claims.doohickey.x-relational-db-schema.keys.unknownMember is not a supported x-relational-db-schema member',
          'claims.thingamajig.x-relational-db-schema.constraints.check must be an array',
          'claims.thingamajig.x-relational-db-schema.constraints.unique[0] must have a non-empty columns array and, when present, a non-empty name',
          'claims.thingamajig.x-relational-db-schema.constraints.unique[1] must have a non-empty columns array and, when present, a non-empty name',
          'claims.thingamajig.x-relational-db-schema.constraints.unique[2].columns references unknown column doesNotExist',
          'claims.thingamajig.x-relational-db-schema.names.tables must be an object',
          'claims.thingamajig.x-relational-db-schema.names.columns must be an object',
          'claims.whatsit.x-relational-db-schema.names.tables.whatsit must be a non-empty string'
        ]

        for (const expectedIssue of expectedIssues) {
          assert.ok(
            message.includes(expectedIssue),
            `expected message to include: ${expectedIssue}`
          )
        }

        return true
      }
    )
  })

  it('buildRelationalDbProjection applies x-relational-db-schema overrides', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-relational-db-schema-extension.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-relational-db-schema-extension.relational-db-projection.json'
    )

    assert.deepEqual(sketch.projections.relationalDb(), expected)
  })

  it('buildRelationalDbProjection auto-generates uq_/ck_ constraint names when omitted', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/projector/fixtures/online-shop-constraint-name-generation.valid.yaml'
      }),
      trace: false
    })

    const projection = sketch.projections.relationalDb()

    assert.deepEqual(projection.tables.widget?.constraints, {
      unique: [
        {
          name: 'uq_widgets_sku',
          columns: ['sku']
        },
        {
          name: 'uq_widgets_category_status',
          columns: ['category', 'status']
        }
      ],
      check: [
        {
          name: 'ck_widgets_status',
          column: 'status',
          enum: ['active', 'retired']
        },
        {
          name: 'ck_widgets_explicit_status',
          column: 'category',
          enum: ['tools', 'parts']
        }
      ]
    })
  })
})
