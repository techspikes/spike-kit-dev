import assert from 'node:assert'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { parse } from '../../../src/core/parser.ts'
import { readTextFile } from '../../test-helper/file-access.ts'

describe('core parser', () => {
  it('parse reads a valid YAML Data Sketch file into a DataSketch', () => {
    const specPath = 'test/core/parser/fixtures/online-shop.valid.yaml'
    const sketch = parse({ path: specPath })

    assert.equal(sketch.spec.info.name, 'online-shop')
    assert.equal(sketch.spec.claims.product.name, 'products')
    assert.equal(sketch.metadata.version, '1.0.0-draft.2')
    assert.equal(sketch.metadata.basePath, join(process.cwd(), dirname(specPath)))
    assert.equal(sketch.metadata.validated, undefined)
  })

  it('parse reads a valid JSON Data Sketch file into a DataSketch', () => {
    const sketch = parse({ path: 'test/core/parser/fixtures/online-shop.valid.json' })

    assert.equal(sketch.spec.info.name, 'online-shop')
    assert.equal(sketch.spec.claims.customer.name, 'customers')
  })

  it('parse accepts source text and uses the current working directory as metadata base path', () => {
    const specPath = 'test/core/parser/fixtures/online-shop.valid.yaml'
    const sketch = parse({ input: readTextFile(specPath) })

    assert.equal(sketch.spec.info.name, 'online-shop')
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

  it('parse rejects a claim without details', () => {
    assert.throws(
      () => parse({ path: 'test/core/parser/fixtures/online-shop-empty-claim.invalid.yaml' }),
      /claims\.customer must include details/
    )
  })

  it('parse rejects duplicate claim logical IDs', () => {
    assert.throws(
      () =>
        parse({ path: 'test/core/parser/fixtures/online-shop-duplicate-claim-id.invalid.yaml' }),
      /Failed to parse: duplicated mapping key/
    )
  })

  it('parse rejects duplicate claim implementation names', () => {
    assert.throws(
      () =>
        parse({ path: 'test/core/parser/fixtures/online-shop-duplicate-claim-name.invalid.yaml' }),
      /claims\.shopper\.name customers is duplicated/
    )
  })

  it('parse rejects claim logical IDs that contain path separators or array markers', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-claim-id-with-projection-separators.invalid.yaml'
        }),
      /claims\.customer\.profile must not contain \. or \[\]\nclaims\.order\[\] must not contain \. or \[\]/
    )
  })

  it('parse rejects a claim implementation name that contains whitespace', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-claim-name-with-whitespace.invalid.yaml'
        }),
      /claims\.customer\.name: must not contain whitespace/
    )
  })

  it('parse accepts double underscores in claim IDs, details, and relations', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-double-underscore.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.customer__profile.details, ['address__city'])
    assert.deepEqual(sketch.spec.claims.order.details, ['items__product'])
    assert.deepEqual(sketch.spec.claims.order.relations, { items__product: 'customer__profile' })
  })

  it('parse accepts claim-level detail aliases', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-detail-aliases.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.product.details, ['name', 'discontinued'])
    assert.deepEqual(sketch.spec.claims.product.aliases, {
      name: ['product name'],
      discontinued: ['discontinued flag']
    })
  })

  it('parse accepts claim-level detail optionals overrides', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-detail-optionals.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.product.details, ['name', 'discontinued'])
    assert.deepEqual(sketch.spec.claims.product.optionals, {
      name: false,
      discontinued: true
    })
  })

  it('parse accepts x-* extension fields on extensible objects', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-extension-fields.valid.yaml'
    })

    assert.equal((sketch.spec as Record<string, unknown>)['x-note'], 'used by an external tool')
    assert.equal((sketch.spec.info as Record<string, unknown>)['x-owner'], 'shop team')
    assert.equal((sketch.spec.sources as Record<string, unknown>)['x-source-kind'], 'contract')
    assert.equal(
      (sketch.spec.claims.customer as Record<string, unknown>)['x-relational-db-schema'],
      'customer overrides'
    )
    assert.equal(
      (sketch.spec.claims.customer.traces as Record<string, unknown>)['x-trace-source'],
      'shopping journey'
    )
  })

  it('parse rejects unsupported root fields that are not x-* extensions', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-unsupported-root-field.invalid.yaml'
        }),
      /summary is not supported; use x-\* for extension fields/
    )
  })

  it('parse rejects unsupported claim fields that are not x-* extensions', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-unsupported-claim-field.invalid.yaml'
        }),
      /claims\.customer\.displayLabel is not supported; use x-\* for extension fields/
    )
  })

  it('parse rejects duplicate list-form detail IDs', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-duplicate-list-detail-id.invalid.yaml'
        }),
      /claims\.customer\.details\.email is duplicated/
    )
  })

  it('parse rejects list-form detail paths with empty segments', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-empty-segment.invalid.yaml'
        }),
      /claims\.order\.details\.carrier\.\.name must not contain empty path segments/
    )
  })

  it('parse rejects list-form detail paths with array markers that have no segment name', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-empty-array-segment.invalid.yaml'
        }),
      /claims\.order\.details\.\[\]\.product segment \[\] must be either <name> or <name>\[\]/
    )
  })

  it('parse rejects list-form detail paths where one path is a strict prefix of another', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-strict-prefix.invalid.yaml'
        }),
      /claims\.order\.details\.carrier must not be a strict prefix of carrier\.name/
    )
  })

  it('parse rejects list-form detail paths where a later path is a strict prefix of an earlier path', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-reverse-strict-prefix.invalid.yaml'
        }),
      /claims\.order\.details\.carrier must not be a strict prefix of carrier\.name/
    )
  })

  it('parse rejects list-form detail paths that mix object and array form for a segment', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-array-object-conflict.invalid.yaml'
        }),
      /claims\.order\.details\.items\.product conflicts with items\[\]\.product because segment items uses both object and array form/
    )
  })

  it('parse rejects list-form identity detail paths', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-list-detail-reserved-id.invalid.yaml'
        }),
      /claims\.customer\.details\.id is a reserved identity detail path/
    )
  })

  it('parse accepts list-form details with the same terminal path segment', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-list-form-detail-terminal-name-overlap.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.customer.details, ['billing.name', 'shipping.name'])
  })

  it('parse accepts a relation source path that is also listed in details', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-relation-source-detail-overlap.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.order.details, ['customer'])
    assert.deepEqual(sketch.spec.claims.order.relations, { customer: 'customer' })
  })

  it('parse accepts a relation source path that is listed only in relations', () => {
    const sketch = parse({
      path: 'test/core/parser/fixtures/online-shop-relation-source-only.valid.yaml'
    })

    assert.deepEqual(sketch.spec.claims.order.details, ['status'])
    assert.deepEqual(sketch.spec.claims.order.relations, { customer: 'customer' })
  })

  it('parse rejects relation source paths with empty segments', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-relation-source-empty-segment.invalid.yaml'
        }),
      /claims\.order\.relations\.customer\.\.profile must not contain empty path segments/
    )
  })

  it('parse rejects relation source identity paths', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-relation-source-reserved-id.invalid.yaml'
        }),
      /claims\.order\.relations\.id is a reserved identity detail path/
    )
  })

  it('parse rejects effective detail paths where a relation source path is a strict prefix', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-relation-source-strict-prefix.invalid.yaml'
        }),
      /claims\.order\.relations\.customer must not be a strict prefix of customer\.name/
    )
  })

  it('parse rejects relation source paths that mix object and array form for a segment', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-relation-source-array-object-conflict.invalid.yaml'
        }),
      /claims\.order\.relations\.items\.product conflicts with items\[\]\.product because segment items uses both object and array form/
    )
  })

  it('parse rejects object-form details', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-object-form-details.invalid.yaml'
        }),
      /claims\.customer\.details: Invalid type/
    )
  })

  it('parse rejects aliases for paths that are not listed in details', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-unknown-detail-alias.invalid.yaml'
        }),
      /claims\.product\.aliases\.sku must also be listed in details/
    )
  })

  it('parse rejects empty alias lists', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-empty-detail-alias.invalid.yaml'
        }),
      /claims\.product\.aliases\.name: Invalid length/
    )
  })

  it('parse rejects optionals for paths that are not listed in details', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-unknown-detail-optional.invalid.yaml'
        }),
      /claims\.product\.optionals\.sku must also be listed in details/
    )
  })

  it('parse rejects object-form relations', () => {
    assert.throws(
      () =>
        parse({
          path: 'test/core/parser/fixtures/online-shop-object-form-relation.invalid.yaml'
        }),
      /claims\.order\.relations\.customer: Invalid type/
    )
  })

  it('parse rejects root values that are not objects', () => {
    assert.throws(
      () => parse({ path: 'test/core/parser/fixtures/online-shop-root-null.invalid.yaml' }),
      /Invalid type: Expected Object but received null/
    )
  })
})
