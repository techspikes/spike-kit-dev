import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse, type ValidatedDataSketch } from '../../../src/core/parser.ts'
import {
  buildRelationalDbProjection,
  type Projector,
  project,
  type RelationalDbProjection,
  relationalDbProjector
} from '../../../src/core/projector.ts'
import { openApiValidator, validate } from '../../../src/core/validator.ts'
import { readJsonFile } from '../../test-helper/file-access.ts'

describe('core projector', () => {
  it('buildRelationalDbProjection rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        buildRelationalDbProjection(
          parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' })
        ),
      /DataSketch must be validated/
    )
  })

  it('project rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        project(
          parse({
            specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml'
          }) as ValidatedDataSketch,
          []
        ),
      /DataSketch must be validated/
    )
  })

  it('validated sketches can build a relational DB projection through an explicit projector', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('project builds a custom projection lazily and memoizes the result', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    let buildCount = 0

    const customProjector: Projector<string> = {
      name: 'custom',
      build: () => {
        buildCount += 1

        return 'custom projection'
      }
    }

    const projections = project(sketch, [customProjector])

    assert.equal(buildCount, 0)
    assert.equal(projections.get('custom'), 'custom projection')
    assert.equal(projections.get('custom'), 'custom projection')
    assert.equal(buildCount, 1)
  })

  it('project lets a projector depend on another projection', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const sourceProjector: Projector<{ readonly value: string }> = {
      name: 'source',
      build: () => ({ value: 'source projection' })
    }

    const dependentProjector: Projector<string> = {
      name: 'dependent',
      build: ({ projection }) => projection<{ readonly value: string }>('source').value
    }

    assert.equal(project(sketch, [dependentProjector, sourceProjector]).get('dependent'), 'source projection')
  })

  it('project rejects duplicate projector names', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const firstProjector: Projector<string> = {
      name: 'custom',
      build: () => 'first'
    }

    const secondProjector: Projector<string> = {
      name: 'custom',
      build: () => 'second'
    }

    assert.throws(() => project(sketch, [firstProjector, secondProjector]), /Projector custom is duplicated/)
  })

  it('project rejects projector names that are not kebab-case', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const customProjector: Projector<string> = {
      name: 'customProjector',
      build: () => 'custom projection'
    }

    assert.throws(() => project(sketch, [customProjector]), /Projector name customProjector must be kebab-case/)
  })

  it('project rejects unregistered projection dependencies', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const dependentProjector: Projector<string> = {
      name: 'dependent',
      build: ({ projection }) => projection('missing')
    }

    assert.throws(() => project(sketch, [dependentProjector]).get('dependent'), /Projector missing is not registered/)
  })

  it('project rejects circular projection dependencies', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const firstProjector: Projector<string> = {
      name: 'first',
      build: ({ projection }) => projection('second')
    }

    const secondProjector: Projector<string> = {
      name: 'second',
      build: ({ projection }) => projection('first')
    }

    assert.throws(
      () => project(sketch, [firstProjector, secondProjector]).get('first'),
      /Projector first has a circular dependency/
    )
  })

  it('buildRelationalDbProjection projects relations using projected column names', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-relation-only.valid.yaml' }),
      trace: false
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-claim-id-exact-match.valid.yaml' }),
      trace: false
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-relations-disable-inferred.valid.yaml' }),
      trace: false
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
        specFilePath: 'test/core/projector/fixtures/online-shop-nested-relation-source-only.valid.yaml'
      }),
      trace: false
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      specFilePath: 'test/core/projector/fixtures/online-shop-openapi-inference.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      specFilePath: 'test/core/projector/fixtures/online-shop-optionals-override.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      specFilePath: 'test/core/projector/fixtures/online-shop-string-format-inference.valid.yaml',
      validators: [openApiValidator]
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-nested-array.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-nested-array.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection flattens nested object details inside child tables', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-child-flattening.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-child-flattening.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection rejects projected table name conflicts', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/online-shop-projected-table-name-conflict.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
      /Projected table name order_items for table orderItems conflicts with table order\.items\[\]/
    )
  })

  it('buildRelationalDbProjection rejects projected column name conflicts', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/online-shop-projected-column-name-conflict.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
      /Projected column name address_city for column address_city in table customer conflicts with column address\.city/
    )
  })

  it('buildRelationalDbProjection rejects invalid x-relational-db-schema overrides', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/online-shop-relational-db-schema-extension-invalid.valid.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
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
          assert.ok(message.includes(expectedIssue), `expected message to include: ${expectedIssue}`)
        }

        return true
      }
    )
  })

  it('buildRelationalDbProjection applies x-relational-db-schema overrides', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/online-shop-relational-db-schema-extension.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-relational-db-schema-extension.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection auto-generates uq_/ck_ constraint names when omitted', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/online-shop-constraint-name-generation.valid.yaml' }),
      trace: false
    })

    const projection = buildRelationalDbProjectionWithProjector(sketch)

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

function buildRelationalDbProjectionWithProjector(sketch: ValidatedDataSketch) {
  return project(sketch, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
}
