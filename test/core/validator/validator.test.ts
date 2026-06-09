import assert from 'node:assert'
import { describe, it } from 'node:test'
import utils from '../../../src/core/utils.ts'
import { parseSpecification } from '../../../src/core/validator.ts'

describe('validator', () => {
  it('parseSpecification accepts a minimal valid YAML specification', () => {
    const specification = parseSpecification(
      utils
        .readCwdRelativePathSync(
          'test/core/validator/fixtures/online-shop-example.valid.yaml'
        )
        .toString('utf-8')
    )

    assert.equal(specification.info.name, 'online-shop')
    assert.equal(
      specification.stores.customer.fields.publicId.type.name,
      'char'
    )
    assert.equal(
      specification.stores.order.keys?.foreign?.[0]?.references.store,
      'customer'
    )
  })

  it('parseSpecification accepts a minimal valid JSON specification', () => {
    const specification = parseSpecification(
      utils
        .readCwdRelativePathSync(
          'test/core/validator/fixtures/online-shop-example.valid.json'
        )
        .toString('utf-8')
    )

    assert.equal(specification.info.name, 'online-shop')
    assert.equal(
      specification.stores.customer.fields.publicId.type.name,
      'char'
    )
    assert.equal(
      specification.stores.order.keys?.foreign?.[0]?.references.store,
      'customer'
    )
  })

  it('parseSpecification accepts an ordered index field specification', () => {
    const specification = parseSpecification(
      utils
        .readCwdRelativePathSync(
          'test/core/validator/fixtures/online-shop-example-index-sort-order.valid.yaml'
        )
        .toString('utf-8')
    )
    const indexField = specification.stores.order.indexes?.[1]?.fields[0]

    assert.deepEqual(indexField, { field: 'createdAt', order: 'desc' })
  })

  it('parseSpecification rejects invalid YAML syntax', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-invalid-syntax.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /Failed to parse:/
    )
  })

  it('parseSpecification rejects an unsupported field type', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-field-unsupported-type.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /stores\.customer\.fields\.id\.type\.name/
    )
  })

  it('parseSpecification rejects a root value that is not an object', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-root-null.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /Invalid type: Expected Object but received null/
    )
  })

  it('parseSpecification rejects an empty stores map', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-empty-stores.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /stores must contain at least one store/
    )
  })

  it('parseSpecification rejects a store with no fields', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-store-empty-fields.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /stores\.customer\.fields must contain at least one field/
    )
  })

  it('parseSpecification rejects duplicate implementation names', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-duplicate-store-and-field-names.invalid.yaml'
            )
            .toString('utf-8')
        ),
      error => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /store name customers is duplicated/)
        assert.match(
          error.message,
          /field name in store customer id is duplicated/
        )
        return true
      }
    )
  })

  it('parseSpecification rejects invalid key and index field references', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-missing-local-field-references.invalid.yaml'
            )
            .toString('utf-8')
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
        assert.match(
          error.message,
          /indexes\.0\.fields references missing field missingStatus/
        )
        return true
      }
    )
  })

  it('parseSpecification rejects invalid foreign key references', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-invalid-foreign-key-references.invalid.yaml'
            )
            .toString('utf-8')
        ),
      error => {
        assert.ok(error instanceof Error)
        assert.match(
          error.message,
          /references\.store references missing store missingCustomer/
        )
        assert.match(
          error.message,
          /local and referenced field counts must match/
        )
        return true
      }
    )
  })

  it('parseSpecification rejects missing referenced foreign key fields', () => {
    assert.throws(
      () =>
        parseSpecification(
          utils
            .readCwdRelativePathSync(
              'test/core/validator/fixtures/online-shop-missing-referenced-field.invalid.yaml'
            )
            .toString('utf-8')
        ),
      /references\.fields references missing field missingId in store customer/
    )
  })
})
