import assert from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import { coreValidator, openApiValidator, type Validator, validate } from '../../../src/core/validator.ts'
import { readJsonFile, readTextFile } from '../../test-helper/file-access.ts'

describe('core validator', () => {
  it('validate marks a sketch as validated when trace is false', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/validator/fixtures/online-shop.valid.yaml' }),
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate parses a path and marks the sketch as validated', () => {
    const sketch = validate({ specFilePath: 'test/core/validator/fixtures/online-shop.valid.yaml', trace: false })

    assert.equal(sketch.metadata.validated, true)
    assert.equal(sketch.spec.info.name, 'online-shop')
  })

  it('validate runs the core validator without explicit registration', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-missing-relation-target-claim.invalid.yaml',
          trace: false
        }),
      /claims\.order\.relations\.customer target claim shopper does not exist/
    )
  })

  it('validate does not run the core validator twice when it is explicitly registered', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-missing-relation-target-claim.invalid.yaml',
          trace: false,
          validators: [coreValidator]
        }),
      error => {
        const issue = 'claims.order.relations.customer target claim shopper does not exist'
        const message = (error as Error).message

        assert.equal(message.split(issue).length - 1, 1)

        return true
      }
    )
  })

  it('validate runs additional validators', () => {
    const customValidator: Validator = {
      name: 'custom',
      validate: () => ['custom validator issue']
    }

    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop.valid.yaml',
          trace: false,
          validators: [customValidator]
        }),
      /custom validator issue/
    )
  })

  it('validate does not load OpenAPI from a sketch source path in pure sketch calls', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/validator/fixtures/online-shop.valid.yaml' })
    })

    assert.equal(sketch.metadata.validated, true)
    assert.equal(sketch.sources?.openapi, undefined)
  })

  it('validate loads OpenAPI from a path even when the OpenAPI validator is not registered', () => {
    const sketch = validate({ specFilePath: 'test/core/validator/fixtures/online-shop.valid.yaml' })

    assert.equal(sketch.metadata.validated, true)
    assert.notEqual(sketch.sources?.openapi, undefined)
  })

  it('validate accepts specs without OpenAPI sources when trace is true', () => {
    const sketch = validate({
      specFilePath: 'test/core/validator/fixtures/online-shop-relation-source-only.valid.yaml'
    })

    assert.equal(sketch.metadata.validated, true)
    assert.equal(sketch.sources?.openapi, undefined)
  })

  it('validate stores the dereferenced OpenAPI source when path validation uses openApiValidator', () => {
    const sketch = validate({
      specFilePath: 'test/core/validator/fixtures/online-shop-openapi-ref.valid.yaml',
      validators: [openApiValidator]
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

  it('validate accepts explicit OpenAPI source strings', () => {
    const sketch = validate({
      sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
      sources: {
        openapi: readTextFile('test/core/validator/fixtures/openapi/openapi.yaml')
      },
      validators: [openApiValidator]
    })

    assert.equal(sketch.metadata.validated, true)
    assert.notEqual(sketch.sources?.openapi, undefined)
  })

  it('validate accepts explicit OpenAPI source objects', () => {
    const sketch = validate({
      sketch: parse({ specFilePath: 'test/core/validator/fixtures/online-shop-missing-openapi.invalid.yaml' }),
      sources: {
        openapi: readJsonFile('test/core/validator/fixtures/openapi/minimal-openapi.json')
      },
      validators: [openApiValidator]
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate keeps explicit OpenAPI source string references unresolved', () => {
    const sketch = validate({
      sketch: parse({
        specSourceText: readTextFile('test/core/validator/fixtures/online-shop-openapi-ref.valid.yaml')
      }),
      sources: {
        openapi: readTextFile('test/core/validator/fixtures/openapi/openapi-with-refs.yaml')
      }
    })

    const openApi = sketch.sources?.openapi as Record<string, unknown>
    const paths = openApi.paths as Record<string, unknown>
    const customerPath = paths['/customers'] as Record<string, unknown>

    assert.equal(customerPath.$ref, '#/components/pathItems/CreateCustomerPath')
  })

  it('validate keeps explicit OpenAPI source object references unresolved', () => {
    const sketch = validate({
      sketch: parse({
        specSourceText: readTextFile('test/core/validator/fixtures/online-shop-openapi-ref.valid.yaml')
      }),
      sources: {
        openapi: readJsonFile('test/core/validator/fixtures/openapi/openapi-with-refs.json')
      }
    })

    const openApi = sketch.sources?.openapi as Record<string, unknown>
    const paths = openApi.paths as Record<string, unknown>
    const customerPath = paths['/customers'] as Record<string, unknown>

    assert.equal(customerPath.$ref, '#/components/pathItems/CreateCustomerPath')
  })

  it('validate accepts already loaded OpenAPI sources on the sketch', () => {
    const parsed = parse({ specFilePath: 'test/core/validator/fixtures/online-shop-missing-openapi.invalid.yaml' })

    const sketch = validate({
      sketch: {
        ...parsed,
        sources: {
          openapi: readJsonFile('test/core/validator/fixtures/openapi/minimal-openapi.json')
        }
      },
      validators: [openApiValidator]
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate does not parse explicit OpenAPI source strings when trace is false', () => {
    const sketch = validate({
      sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
      sources: {
        openapi: 'openapi: ['
      },
      trace: false,
      validators: [openApiValidator]
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate accepts relation source paths that are also listed in details', () => {
    const sketch = validate({
      specFilePath: 'test/core/validator/fixtures/online-shop-relation-source-detail.valid.yaml',
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate accepts relation source paths that are listed only in relations', () => {
    const sketch = validate({
      specFilePath: 'test/core/validator/fixtures/online-shop-relation-source-only.valid.yaml',
      trace: false
    })

    assert.equal(sketch.metadata.validated, true)
  })

  it('validate rejects missing OpenAPI files when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-missing-openapi.invalid.yaml',
          validators: [openApiValidator]
        }),
      /Failed to read OpenAPI:/
    )
  })

  it('validate rejects invalid OpenAPI syntax when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-invalid-openapi.invalid.yaml',
          validators: [openApiValidator]
        }),
      /Failed to parse OpenAPI:/
    )
  })

  it('validate rejects missing traced operationIds when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-missing-operation.invalid.yaml',
          validators: [openApiValidator]
        }),
      /trace operation missingOperation does not exist in OpenAPI operationId/
    )
  })

  it('validate rejects duplicate OpenAPI operationIds when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-duplicate-operation.invalid.yaml',
          validators: [openApiValidator]
        }),
      /OpenAPI operationId createCustomer is duplicated/
    )
  })

  it('validate rejects OpenAPI root values that are not objects when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-openapi-root-null.invalid.yaml',
          validators: [openApiValidator]
        }),
      /OpenAPI root must be an object/
    )
  })

  it('validate rejects OpenAPI files without object paths when path validation uses openApiValidator', () => {
    assert.throws(
      () =>
        validate({
          specFilePath: 'test/core/validator/fixtures/online-shop-openapi-missing-paths.invalid.yaml',
          validators: [openApiValidator]
        }),
      /OpenAPI paths must be an object/
    )
  })

  it('validate rejects missing operations from an explicit OpenAPI source string', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({
            specSourceText: readTextFile('test/core/validator/fixtures/online-shop-missing-operation.invalid.yaml')
          }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/openapi.yaml')
          },
          validators: [openApiValidator]
        }),
      /trace operation missingOperation does not exist in OpenAPI operationId/
    )
  })

  it('validate rejects duplicate operations from an explicit OpenAPI source string', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/duplicate-operation-id.yaml')
          },
          validators: [openApiValidator]
        }),
      /OpenAPI operationId createCustomer is duplicated/
    )
  })

  it('validate rejects invalid explicit OpenAPI source strings', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/invalid-syntax.yaml')
          },
          validators: [openApiValidator]
        }),
      /Failed to parse OpenAPI:/
    )
  })

  it('validate rejects explicit OpenAPI source strings with invalid root shape', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/root-null.yaml')
          },
          validators: [openApiValidator]
        }),
      /OpenAPI root must be an object/
    )
  })

  it('validate rejects explicit OpenAPI source strings without object paths', () => {
    assert.throws(
      () =>
        validate({
          sketch: parse({ specSourceText: readTextFile('test/core/validator/fixtures/online-shop.valid.yaml') }),
          sources: {
            openapi: readTextFile('test/core/validator/fixtures/openapi/missing-paths.yaml')
          },
          validators: [openApiValidator]
        }),
      /OpenAPI paths must be an object/
    )
  })
})
