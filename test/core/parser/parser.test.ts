import assert from 'node:assert'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { parse, readSpecification } from '../../../src/core/parser.ts'
import { readTextFile } from '../../test-helper/file-access.ts'

describe('core parser', () => {
  it('parse reads a valid YAML Data Sketch file into a DataSketch', () => {
    const specPath = 'test/core/parser/fixtures/online-shop.valid.yaml'
    const sketch = parse({ path: specPath })
    const spec = readSpecification(sketch)

    assert.equal(spec.info.name, 'online-shop')
    assert.equal(spec.claims.product.name, 'products')
    assert.equal(sketch.metadata.version, '1.0.0-draft.2')
    assert.equal(sketch.metadata.basePath, join(process.cwd(), dirname(specPath)))
    assert.equal(sketch.metadata.validated, undefined)
  })

  it('parse reads a valid JSON Data Sketch file into a DataSketch', () => {
    const sketch = parse({ path: 'test/core/parser/fixtures/online-shop.valid.json' })
    const spec = readSpecification(sketch)

    assert.equal(spec.info.name, 'online-shop')
    assert.equal(spec.claims.customer.name, 'customers')
  })

  it('parse accepts source text and uses the current working directory as metadata base path', () => {
    const specPath = 'test/core/parser/fixtures/online-shop.valid.yaml'
    const sketch = parse({ input: readTextFile(specPath) })
    const spec = readSpecification(sketch)

    assert.equal(spec.info.name, 'online-shop')
    assert.equal(sketch.metadata.basePath, process.cwd())
  })

  it('parse accepts an absolute specification path for metadata', () => {
    const specPath = join(process.cwd(), 'test/core/parser/fixtures/online-shop.valid.yaml')
    const sketch = parse({ path: specPath })

    assert.equal(sketch.metadata.basePath, join(process.cwd(), 'test/core/parser/fixtures'))
  })

  it('parse rejects invalid YAML syntax', () => {
    assert.throws(
      () => parse({ path: 'test/core/parser/fixtures/online-shop-invalid-syntax.invalid.yaml' }),
      /Failed to parse:/
    )
  })

  it('parse rejects unsupported Data Sketch versions', () => {
    assert.throws(
      () =>
        parse({ path: 'test/core/parser/fixtures/online-shop-unsupported-version.invalid.yaml' }),
      /data-sketch/
    )
  })

  it('parse rejects a claim without details or relations', () => {
    assert.throws(
      () => parse({ path: 'test/core/parser/fixtures/online-shop-empty-claim.invalid.yaml' }),
      /claims\.customer must include details or relations/
    )
  })

  it('readSpecification rejects invalid in-memory specs', () => {
    assert.throws(
      () =>
        readSpecification({
          spec: null,
          metadata: {
            version: '',
            basePath: ''
          },
          projections: {}
        }),
      /Invalid type: Expected Object but received null/
    )
  })
})
