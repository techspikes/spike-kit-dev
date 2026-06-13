import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import { validate } from '../../../src/core/validator.ts'
import { readTextFile } from '../../test-helper/file-access.ts'

describe('core validator', () => {
  it('validate marks a sketch as validated and adds a DB projector when trace is false', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/validator/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
    assert.equal(typeof sketch.projections.relationalDb, 'function')
    assert.equal(sketch.projections.relationalDb().claims[0]?.id, 'customer')
  })

  it('validate defaults to trace true for spec sources.openapi', () => {
    const sketch = validate({
      sketch: parse({ path: 'test/core/validator/fixtures/online-shop.valid.yaml' })
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate defaults to trace true for explicit OpenAPI source strings', () => {
    const sketch = validate({
      sketch: parse({ input: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
      sources: {
        openapi: readTextFile('test/core/validator/fixtures/openapi/openapi.yaml')
      }
    })

    assert.equal(sketch.metadata.validated, true)
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
