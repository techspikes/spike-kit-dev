import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse, type ValidatedDataSketch } from '../../../src/core/parser.ts'
import {
  buildRelationalDbProjection,
  type Projector,
  project,
  type RelationalDbProjection,
  relationalDbProjector,
  validateRelationalDbProjection
} from '../../../src/core/projector.ts'
import { openApiValidator, validate } from '../../../src/core/validator.ts'
import { readJsonFile } from '../../test-helper/file-access.ts'

describe('core projector', () => {
  it('buildRelationalDbProjection rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        buildRelationalDbProjection(
          parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' })
        ),
      /DataSketch must be validated/
    )
  })

  it('project rejects a sketch that has not been validated', () => {
    assert.throws(
      () =>
        project(
          parse({
            specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml'
          }) as ValidatedDataSketch,
          []
        ),
      /DataSketch must be validated/
    )
  })

  it('validated sketches can build a relational DB projection through an explicit projector', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('validateRelationalDbProjection accepts a valid relational DB projection', () => {
    const projection = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop.relational-db-projection.json'
    )

    assert.doesNotThrow(() => validateRelationalDbProjection(projection))
  })

  it('project builds a custom projection lazily and memoizes the result', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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

    // Projectors are built only on first lookup and reuse the cached projection after that.
    assert.equal(buildCount, 0)
    assert.equal(projections.get('custom'), 'custom projection')
    assert.equal(projections.get('custom'), 'custom projection')
    assert.equal(buildCount, 1)
  })

  it('project lets a projector depend on another projection', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-with-aliases.valid.yaml' }),
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
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-relation-only.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-relation-only.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection projects claim ID exact-match details as marked foreign keys', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-claim-id-exact-match.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-claim-id-exact-match.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection skips claim ID exact-match inference when the claim has any explicit relation', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-relations-disable-inferred.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-relations-disable-inferred.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection projects relation-only source paths into child tables', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-nested-relation-source-only.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-nested-relation-source-only.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection infers SQL types and nullability from traced OpenAPI fields', () => {
    const sketch = validate({
      specFilePath: 'test/core/projector/fixtures/sketches/online-shop-openapi-inference.valid.yaml',
      validators: [openApiValidator]
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-openapi-inference.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection lets optionals override OpenAPI-inferred nullability', () => {
    const sketch = validate({
      specFilePath: 'test/core/projector/fixtures/sketches/online-shop-optionals-override.valid.yaml',
      validators: [openApiValidator]
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-optionals-override.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection infers fixed-length CHAR types from OpenAPI date/time string formats', () => {
    const sketch = validate({
      specFilePath: 'test/core/projector/fixtures/sketches/online-shop-string-format-inference.valid.yaml',
      validators: [openApiValidator]
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-string-format-inference.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection projects nested array details into child tables', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-nested-array.valid.yaml' }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-nested-array.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection flattens nested object details inside child tables', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/projector/fixtures/sketches/online-shop-child-flattening.valid.yaml' }),
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
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-projected-table-name-conflict.error.yaml'
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
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-projected-column-name-conflict.error.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
      /Projected column name address_city for column address_city in table customer conflicts with column address\.city/
    )
  })

  it('validateRelationalDbProjection rejects an unsupported projection version', () => {
    const projection = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/unsupported-version.relational-db-projection.json'
    )

    assert.throws(
      () => validateRelationalDbProjection(projection),
      /Invalid relational DB projection: unsupported projection version/
    )
  })

  it('validateRelationalDbProjection rejects duplicate table names', () => {
    const projection = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/duplicate-table-name.relational-db-projection.json'
    )

    assert.throws(
      () => validateRelationalDbProjection(projection),
      /Invalid relational DB projection: table name customers is duplicated/
    )
  })

  it('validateRelationalDbProjection rejects a missing foreign key source column', () => {
    const projection = readJsonFile<RelationalDbProjection>('test/core/projector/fixtures/missing-source-column.json')

    assert.throws(
      () => validateRelationalDbProjection(projection),
      /Invalid relational DB projection: foreign key customers\.fk_customers_order references missing source column order/
    )
  })

  it('validateRelationalDbProjection rejects a missing foreign key target table', () => {
    const projection = readJsonFile<RelationalDbProjection>('test/core/projector/fixtures/missing-target-table.json')

    assert.throws(
      () => validateRelationalDbProjection(projection),
      /Invalid relational DB projection: foreign key orders\.fk_orders_customer references missing table customers/
    )
  })

  it('validateRelationalDbProjection rejects a missing foreign key target column', () => {
    const projection = readJsonFile<RelationalDbProjection>('test/core/projector/fixtures/missing-target-column.json')

    assert.throws(
      () => validateRelationalDbProjection(projection),
      /Invalid relational DB projection: foreign key orders\.fk_orders_customer references missing target column customers\.id/
    )
  })

  it('buildRelationalDbProjection rejects circular foreign key dependencies between tables', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-circular-foreign-key.error.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
      /Invalid relational DB projection: foreign key dependency cycle is not allowed: customers -> orders -> customers/
    )
  })

  it('buildRelationalDbProjection allows a self-referencing foreign key', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-self-referencing-foreign-key.valid.yaml'
      }),
      trace: false
    })

    assert.doesNotThrow(() => buildRelationalDbProjectionWithProjector(sketch))
  })

  it('buildRelationalDbProjection rejects invalid x-relational-db-schema overrides', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-relational-db-schema-extension.error.yaml'
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
          'claims.customer.x-relational-db-schema.types.loyaltyFlag.type BIT is not supported',
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
          'claims.order.x-relational-db-schema.keys.foreign[0].column must be a non-empty string',
          'claims.order.x-relational-db-schema.keys.foreign[1].column must be a non-empty string',
          'claims.order.x-relational-db-schema.keys.foreign[2].references.table must be a string',
          'claims.order.x-relational-db-schema.keys.foreign[3].references.column must reference the target surrogate id',
          'claims.order.x-relational-db-schema.keys.foreign[4].column references unknown column doesNotExist',
          'claims.order.x-relational-db-schema.keys.foreign[5].references.table references unknown table doesNotExist',
          'claims.order.x-relational-db-schema.keys.foreign[6] must be an object',
          'claims.order.x-relational-db-schema.keys.foreign[8] matches the same existing foreign key as another override entry',
          'claims.order.x-relational-db-schema.keys.foreign[9].references.table must be a string',
          'claims.order.x-relational-db-schema.keys.foreign[10].name must be a non-empty string when present',
          'claims.order.x-relational-db-schema.keys.foreign[11].references.column must be a non-empty string',
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
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-relational-db-schema-extension.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-relational-db-schema-extension.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection auto-generates omitted foreign key override names', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-foreign-key-name-generation.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-foreign-key-name-generation.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })

  it('buildRelationalDbProjection rejects foreign key override name conflicts', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-foreign-key-name-conflict.error.yaml'
      }),
      trace: false
    })

    assert.throws(
      () => buildRelationalDbProjectionWithProjector(sketch),
      error => {
        const message = (error as Error).message

        const expectedIssues = [
          'claims.order.x-relational-db-schema.keys.foreign[0].name fk_orders_customer conflicts with another foreign key in table orders',
          'claims.order.x-relational-db-schema.keys.foreign[2].name fk_orders_product conflicts with another foreign key in table orders'
        ]

        for (const expectedIssue of expectedIssues) {
          assert.ok(message.includes(expectedIssue), `expected message to include: ${expectedIssue}`)
        }

        return true
      }
    )
  })

  it('buildRelationalDbProjection auto-generates uq_/ck_ constraint names when omitted', () => {
    const sketch = validate({
      sketch: parse({
        specFilePath: 'test/core/projector/fixtures/sketches/online-shop-constraint-name-generation.valid.yaml'
      }),
      trace: false
    })

    const expected = readJsonFile<RelationalDbProjection>(
      'test/core/projector/fixtures/online-shop-constraint-name-generation.relational-db-projection.json'
    )

    assert.deepEqual(buildRelationalDbProjectionWithProjector(sketch), expected)
  })
})

function buildRelationalDbProjectionWithProjector(sketch: ValidatedDataSketch) {
  return project(sketch, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
}
