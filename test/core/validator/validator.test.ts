import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import { validate } from '../../../src/core/validator.ts'
import { readTextFile } from '../../test-helper/file-access.ts'

describe('core validator', () => {
  it('validate marks a sketch as validated and adds built-in projectors when trace is false', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/validator/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
    assert.equal(typeof sketch.projections.extensions, 'function')
    assert.equal(typeof sketch.projections.relationalDb, 'function')

    assert.deepEqual(sketch.projections.extensions(), {
      'data-sketch/extension-projection': '1.0.0-draft.2',
      extensions: []
    })

    assert.equal(sketch.projections.relationalDb().tables.customer?.name, 'customers')
  })

  it('validate defaults to trace true for spec sources.openapi', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/validator/fixtures/online-shop.valid.yaml' })
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate stores the dereferenced OpenAPI source when trace validation uses spec sources.openapi', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/validator/fixtures/online-shop-openapi-ref.valid.yaml' })
    })

    const openApi = sketch.sources?.openapi as Record<string, unknown>
    const paths = openApi.paths as Record<string, unknown>
    const customerPath = paths['/customers'] as Record<string, unknown>
    const operation = customerPath.post as Record<string, unknown>
    const requestBody = operation.requestBody as Record<string, unknown>
    const content = requestBody.content as Record<string, unknown>
    const jsonContent = content['application/json'] as Record<string, unknown>
    const schema = jsonContent.schema as Record<string, unknown>

    assert.equal(customerPath.$ref, undefined)
    assert.equal(operation.operationId, 'createCustomer')
    assert.equal(schema.$ref, undefined)
    assert.equal(schema.type, 'object')
  })

  it('validate defaults to trace true for explicit OpenAPI source strings', () => {
    const sketch = validate({
      sketch: parse({ input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
      sources: {
        openapi: readTextFile('test/core/validator/fixtures/openapi/openapi.yaml')
      }
    })

    assert.equal(sketch.metadata.validated, true)
    assert.notEqual(sketch.sources?.openapi, undefined)
  })

  it('validate does not parse explicit OpenAPI source strings when trace is false', () => {
    const sketch = validate({
      sketch: parse({ input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
      sources: {
        openapi: 'openapi: ['
      },
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate accepts relation source paths that are also listed in details', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/validator/fixtures/online-shop-relation-source-detail.valid.yaml'
      }),
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate rejects missing relation target claims', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-missing-relation-target-claim.invalid.yaml'
          }),
          trace: false
        }),
      /claims\.order\.relations\.customer target claim shopper does not exist/
    )
  })

  it('validate accepts relation source paths that are listed only in relations', () => {
    const sketch = validate({
      sketch: parse({
        path: 'test/core/validator/fixtures/online-shop-relation-source-only.valid.yaml'
      }),
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate rejects array-of-scalars relation source paths', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-array-scalar-relation-source.invalid.yaml'
          }),
          trace: false
        }),
      /claims\.order\.relations\.products\[\] must not use an array-of-scalars detail as a relation source/
    )
  })

  it('validate rejects relation targets that are not claim IDs', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-relation-target-detail.invalid.yaml'
          }),
          trace: false
        }),
      /claims\.order\.relations\.items\[\]\.productSku target claim product\.sku does not exist/
    )
  })

  it('validate rejects relation targets that include the target identity path', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-relation-target-identity.invalid.yaml'
          }),
          trace: false
        }),
      /claims\.order\.relations\.items\[\]\.product target product\.id must be a claim ID; do not write \.id/
    )
  })

  it('validate rejects missing OpenAPI files when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-missing-openapi.invalid.yaml'
          }),
          trace: true
        }),
      /Failed to read OpenAPI:/
    )
  })

  it('validate rejects invalid OpenAPI syntax when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-invalid-openapi.invalid.yaml'
          }),
          trace: true
        }),
      /Failed to parse OpenAPI:/
    )
  })

  it('validate rejects missing traced operationIds when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-missing-operation.invalid.yaml'
          }),
          trace: true
        }),
      /trace operation missingOperation does not exist in OpenAPI operationId/
    )
  })

  it('validate rejects duplicate OpenAPI operationIds when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-duplicate-operation.invalid.yaml'
          }),
          trace: true
        }),
      /OpenAPI operationId createCustomer is duplicated/
    )
  })

  it('validate rejects OpenAPI root values that are not objects when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-openapi-root-null.invalid.yaml'
          }),
          trace: true
        }),
      /OpenAPI root must be an object/
    )
  })

  it('validate rejects OpenAPI files without object paths when trace is true', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            path: 'test/core/validator/fixtures/online-shop-openapi-missing-paths.invalid.yaml'
          }),
          trace: true
        }),
      /OpenAPI paths must be an object/
    )
  })

  it('validate rejects missing operations from an explicit OpenAPI source string', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            input: readTextFile(
              'test/core/validator/fixtures/online-shop-missing-operation.invalid.yaml'
            )
          }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/openapi.yaml')
          },
          trace: true
        }),
      /trace operation missingOperation does not exist in OpenAPI operationId/
    )
  })

  it('validate rejects duplicate operations from an explicit OpenAPI source string', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml')
          }),
          sources: {
            openapi: readTextFile(
              'test/core/validator/fixtures/openapi/duplicate-operation-id.yaml'
            )
          },
          trace: true
        }),
      /OpenAPI operationId createCustomer is duplicated/
    )
  })

  it('validate rejects invalid explicit OpenAPI source strings', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml')
          }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/invalid-syntax.yaml')
          }
        }),
      /Failed to parse OpenAPI:/
    )
  })

  it('validate rejects explicit OpenAPI source strings with invalid root shape', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml')
          }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/root-null.yaml')
          },
          trace: true
        }),
      /OpenAPI root must be an object/
    )
  })

  it('validate rejects explicit OpenAPI source strings without object paths', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml')
          }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/missing-paths.yaml')
          },
          trace: true
        }),
      /OpenAPI paths must be an object/
    )
  })
})
