import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parseSpecification } from '../../../src/core/validator.ts'
import { readTextFile } from '../../test-helper/output.ts'

describe('core validator', () => {
  it('parseSpecification accepts a valid YAML example specification', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example.valid.yaml')
    )

    assert.equal(specification.info.name, 'online-shop')
    assert.equal(specification.stores.customer.fields.publicId.type.name, 'char')

    assert.equal(
      specification.stores.customer.fields.publicId.reason,
      "Customers need a stable public identifier that doesn't reveal the internal sequential id."
    )

    assert.equal(specification.stores.order.keys?.foreign?.[0]?.references.store, 'customer')
  })

  it('parseSpecification accepts a valid JSON example specification', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example.valid.json')
    )

    assert.equal(specification.info.name, 'online-shop')
    assert.equal(specification.stores.customer.fields.publicId.type.name, 'char')
    assert.equal(specification.stores.order.keys?.foreign?.[0]?.references.store, 'customer')
  })

  it('parseSpecification accepts an ordered index field specification', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example-index-sort-order.valid.yaml')
    )

    const indexField = specification.stores.order.indexes?.[1]?.fields[0]

    assert.deepEqual(indexField, { field: 'createdAt', order: 'desc' })
  })

  it('parseSpecification does not validate OpenAPI trace by default', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example-missing-openapi.valid.yaml')
    )

    assert.equal(specification.sources?.openapi, './openapi/missing.yaml')
  })

  it('parseSpecification does not validate OpenAPI trace when trace is false', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example-missing-openapi.valid.yaml'),
      { trace: false }
    )

    assert.equal(specification.sources?.openapi, './openapi/missing.yaml')
  })

  it('parseSpecification accepts trace true when sources.openapi is omitted', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example-without-sources.valid.yaml'),
      {
        trace: true,
        specPath: 'test/core/validator/fixtures/online-shop-example-without-sources.valid.yaml'
      }
    )

    assert.equal(specification.sources, undefined)
  })

  it('parseSpecification validates traced operations against sources.openapi', () => {
    const specification = parseSpecification(
      readTextFile('test/core/validator/fixtures/online-shop-example-trace-valid.valid.yaml'),
      {
        trace: true,
        specPath: 'test/core/validator/fixtures/online-shop-example-trace-valid.valid.yaml'
      }
    )

    assert.equal(specification.sources?.openapi, './openapi/openapi.yaml')
  })

  it('parseSpecification validates traced operations against an absolute sources.openapi', () => {
    const specification = parseSpecification(
      readTextFile(
        'test/core/validator/fixtures/online-shop-example-trace-absolute-openapi.valid.yaml'
      ),
      {
        trace: true,
        specPath:
          'test/core/validator/fixtures/online-shop-example-trace-absolute-openapi.valid.yaml'
      }
    )

    assert.match(specification.sources?.openapi ?? '', /^\/workspaces\//)
  })

  it('parseSpecification rejects missing OpenAPI files', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-missing-openapi.valid.yaml'
          ),
          {
            trace: true,
            specPath: 'test/core/validator/fixtures/online-shop-example-missing-openapi.valid.yaml'
          }
        ),
      /Failed to read OpenAPI:/
    )
  })

  it('parseSpecification rejects missing traced operationId', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-trace-missing-operation.invalid.yaml'
          ),
          {
            trace: true,
            specPath:
              'test/core/validator/fixtures/online-shop-example-trace-missing-operation.invalid.yaml'
          }
        ),
      /trace operation missingOperation does not exist in OpenAPI operationId/
    )
  })

  it('parseSpecification rejects duplicate OpenAPI operationId', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-trace-duplicate-operation.invalid.yaml'
          ),
          {
            trace: true,
            specPath:
              'test/core/validator/fixtures/online-shop-example-trace-duplicate-operation.invalid.yaml'
          }
        ),
      /OpenAPI operationId createCustomer is duplicated/
    )
  })

  it('parseSpecification rejects invalid OpenAPI syntax', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-trace-invalid-openapi.invalid.yaml'
          ),
          {
            trace: true,
            specPath:
              'test/core/validator/fixtures/online-shop-example-trace-invalid-openapi.invalid.yaml'
          }
        ),
      /Failed to parse OpenAPI:/
    )
  })

  it('parseSpecification rejects OpenAPI root values that are not objects', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-trace-root-null-openapi.invalid.yaml'
          ),
          {
            trace: true,
            specPath:
              'test/core/validator/fixtures/online-shop-example-trace-root-null-openapi.invalid.yaml'
          }
        ),
      /OpenAPI root must be an object/
    )
  })

  it('parseSpecification rejects OpenAPI without object paths', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-example-trace-missing-paths.invalid.yaml'
          ),
          {
            trace: true,
            specPath:
              'test/core/validator/fixtures/online-shop-example-trace-missing-paths.invalid.yaml'
          }
        ),
      /OpenAPI paths must be an object/
    )
  })

  it('parseSpecification ignores non-operation OpenAPI members while collecting operationIds', () => {
    const specification = parseSpecification(
      readTextFile(
        'test/core/validator/fixtures/online-shop-example-trace-ignored-openapi-members.valid.yaml'
      ),
      {
        trace: true,
        specPath:
          'test/core/validator/fixtures/online-shop-example-trace-ignored-openapi-members.valid.yaml'
      }
    )

    assert.equal(specification.stores.customer.traces.operations[0], 'createCustomer')
  })

  it('parseSpecification rejects invalid YAML syntax', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile('test/core/validator/fixtures/online-shop-invalid-syntax.invalid.yaml')
        ),
      /Failed to parse:/
    )
  })

  it('parseSpecification rejects an unsupported field type', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-field-unsupported-type.invalid.yaml'
          )
        ),
      /stores\.customer\.fields\.id\.type\.name/
    )
  })

  it('parseSpecification rejects a root value that is not an object', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile('test/core/validator/fixtures/online-shop-root-null.invalid.yaml')
        ),
      /Invalid type: Expected Object but received null/
    )
  })

  it('parseSpecification rejects an empty stores map', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile('test/core/validator/fixtures/online-shop-empty-stores.invalid.yaml')
        ),
      /stores must contain at least one store/
    )
  })

  it('parseSpecification rejects a store with no fields', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile('test/core/validator/fixtures/online-shop-store-empty-fields.invalid.yaml')
        ),
      /stores\.customer\.fields must contain at least one field/
    )
  })

  it('parseSpecification rejects duplicate implementation names', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-duplicate-store-and-field-names.invalid.yaml'
          )
        ),
      error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /store name customers is duplicated/)
        assert.match(error.message, /field name in store customer id is duplicated/)

        return true
      }
    )
  })

  it('parseSpecification rejects duplicate store names', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-duplicate-store-names.invalid.yaml'
          )
        ),
      /store name customers is duplicated/
    )
  })

  it('parseSpecification rejects duplicate field names in the same store', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-duplicate-field-names.invalid.yaml'
          )
        ),
      /field name in store customer id is duplicated/
    )
  })

  it('parseSpecification rejects null default for a not nullable field', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-not-nullable-field-null-default.invalid.yaml'
          )
        ),
      /stores\.customer\.fields\.id default cannot be null when nullable is false/
    )
  })

  it('parseSpecification rejects invalid key and index field references', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-missing-local-field-references.invalid.yaml'
          )
        ),
      error => {
        assert.ok(error instanceof Error)
        assert.match(
          error.message,
          /keys\.primary\.fields references missing field missingPrimaryId/
        )
        assert.match(
          error.message,
          /keys\.unique\.0\.fields references missing field missingPublicId/
        )
        assert.match(
          error.message,
          /keys\.foreign\.0\.fields references missing field missingCustomerId/
        )
        assert.match(error.message, /indexes\.0\.fields references missing field missingStatus/)

        return true
      }
    )
  })

  it('parseSpecification rejects invalid foreign key references', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-invalid-foreign-key-references.invalid.yaml'
          )
        ),
      error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /references\.store references missing store missingCustomer/)
        assert.match(error.message, /local and referenced field counts must match/)

        return true
      }
    )
  })

  it('parseSpecification rejects missing referenced foreign key fields', () => {
    assert.throws(
      () =>
        parseSpecification(
          readTextFile(
            'test/core/validator/fixtures/online-shop-missing-referenced-field.invalid.yaml'
          )
        ),
      /references\.fields references missing field missingId in store customer/
    )
  })
})
