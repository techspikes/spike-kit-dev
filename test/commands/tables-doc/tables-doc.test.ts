import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { executeTableDoc } from '../../../src/commands/tables-doc.ts'
import {
  openApiValidator,
  project,
  type RelationalDbProjection,
  relationalDbProjector,
  renderTablesDoc,
  validate
} from '../../../src/index.ts'
import { createTemporaryDirectory, joinFilePath, readTextFile, removeDirectory } from '../../test-helper/file-access.ts'
import { runCommandAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot tables-doc [OPTION]... SPEC_FILE'
const onlineShopWithOpenApiSpecFilePath = 'test/commands/tables-doc/fixtures/online-shop-with-openapi-source.yaml'
const onlineShopWithoutOpenApiSpecFilePath = 'test/commands/tables-doc/fixtures/online-shop-without-openapi-source.yaml'
const specialCharacterEscapingSpecFilePath = 'test/commands/tables-doc/fixtures/special-character-escaping.yaml'
const specialCharacterEscapingReorderedSpecFilePath =
  'test/commands/tables-doc/fixtures/special-character-escaping-reordered.yaml'

// ─── CLI behaviour ─────────────────────────────────────────────────────────────

describe('tables-doc CLI', () => {
  let temporaryDirectoryPath = ''

  before(() => {
    temporaryDirectoryPath = createTemporaryDirectory('tables-doc-')
  })

  after(() => {
    removeDirectory(temporaryDirectoryPath)
  })

  it('Given --help is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc(['--help']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given -h is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc(['-h']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no spec file is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeTableDoc([]))

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no --output is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc([onlineShopWithOpenApiSpecFilePath])
    )

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given a valid spec file, When the command executes, Then it writes a complete Markdown document', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'output.md')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc([onlineShopWithOpenApiSpecFilePath, '--output', outputFilePath])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, [])
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    // frontmatter
    assert.match(content, /^---\n/)
    assert.match(content, /\nsource: online-shop-with-openapi-source\.yaml\n/)
    assert.match(content, /\nsha256: [0-9a-f]{64}\n/)
    assert.match(content, /\ngenerated_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    assert.match(content, /---\n\n# online-shop\n/)

    // table sections present
    assert.match(content, /\n## customers\n/)
    assert.match(content, /\n## orders\n/)
    assert.match(content, /\n## order_items\n/)

    // tentative caution only on orders
    assert.match(content, /> \[!CAUTION\]\n> This table is tentative and needs review\./)

    // surrogate key fixed description
    assert.match(content, /\| id \| CHAR\(26\) \| no \| Auto-assigned surrogate key \|/)

    // nullable column (phone is optional in OpenAPI)
    assert.match(content, /\| phone \| VARCHAR\(1024\) \| yes \|/)

    // aliases rendered in description
    assert.match(content, /order status/)
    assert.match(content, /item quantity/)

    // constraint sections on orders
    assert.match(content, /### Primary Key/)
    assert.match(content, /### Foreign Keys/)
    assert.match(content, /### Unique Constraints/)
    assert.match(content, /### Check Constraints/)

    // customers table has no FK / unique / check sections
    const customersSection = content.slice(content.indexOf('\n## customers\n'), content.indexOf('\n## orders\n'))

    assert.ok(!customersSection.includes('### Foreign Keys'))
    assert.ok(!customersSection.includes('### Unique Constraints'))
    assert.ok(!customersSection.includes('### Check Constraints'))

    // DDL
    assert.match(content, /\n## DDL\n\n```sql\n/)
    assert.match(content, /CREATE TABLE orders \(/)
    assert.match(content, /CONSTRAINT ck_orders_status CHECK \(status IN \('pending', 'shipped', 'delivered'\)\)/)
    assert.match(content, /CREATE INDEX idx_orders_status ON orders \(status\);/)
    assert.match(content, /\n```\n$/)
  })

  it('Given a valid spec file, When the command executes with -o, Then it writes to the output file', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'short-flag.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([onlineShopWithOpenApiSpecFilePath, '-o', outputFilePath])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.match(content, /^---\n/)
  })

  it('Given an existing output file, When the command executes, Then it overwrites the file', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'overwrite.md')

    runCommandAndCapture(() => executeTableDoc([onlineShopWithOpenApiSpecFilePath, '-o', outputFilePath]))
    runCommandAndCapture(() => executeTableDoc([onlineShopWithOpenApiSpecFilePath, '-o', outputFilePath]))

    const content = readTextFile(outputFilePath)

    assert.match(content, /^---\n/)
  })

  it('Given the same spec file run twice, When the command executes, Then it produces the same sha256', () => {
    const firstOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-run1.md')
    const secondOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-run2.md')

    runCommandAndCapture(() => executeTableDoc([onlineShopWithOpenApiSpecFilePath, '-o', firstOutputFilePath]))
    runCommandAndCapture(() => executeTableDoc([onlineShopWithOpenApiSpecFilePath, '-o', secondOutputFilePath]))

    const sha1 = extractSha256(readTextFile(firstOutputFilePath))
    const sha2 = extractSha256(readTextFile(secondOutputFilePath))

    assert.ok(sha1, 'sha256 should be present in first output')
    assert.equal(sha1, sha2)
  })

  it('Given two specs with identical content but different key order, When the command executes, Then sha256 values match', () => {
    const firstOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-key-ordered.md')
    const secondOutputFilePath = joinFilePath(temporaryDirectoryPath, 'sha256-key-reordered.md')

    runCommandAndCapture(() => executeTableDoc([specialCharacterEscapingSpecFilePath, '-o', firstOutputFilePath]))
    runCommandAndCapture(() =>
      executeTableDoc([specialCharacterEscapingReorderedSpecFilePath, '-o', secondOutputFilePath])
    )

    const sha1 = extractSha256(readTextFile(firstOutputFilePath))
    const sha2 = extractSha256(readTextFile(secondOutputFilePath))

    assert.ok(sha1, 'sha256 should be present')
    assert.equal(sha1, sha2)
  })

  it('Given a spec without an OpenAPI source, When the command executes, Then detail columns use the VARCHAR(1024) fallback type', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'no-openapi.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([onlineShopWithoutOpenApiSpecFilePath, '--output', outputFilePath])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    assert.match(content, /\| name \| VARCHAR\(1024\) \| no \|/)
    assert.match(content, /\| email \| VARCHAR\(1024\) \| no \|/)
  })

  it('Given a spec with special characters in aliases and enum values, When the command executes, Then cell text and DDL are correctly escaped', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'escaping.md')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeTableDoc([specialCharacterEscapingSpecFilePath, '--output', outputFilePath])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readTextFile(outputFilePath)

    // pipe in alias → \| in Markdown cell
    assert.ok(content.includes('pipe\\|alias'), 'pipe in alias should be escaped in cell')

    // backslash in alias → \\ in Markdown cell
    assert.ok(content.includes('back\\\\slash'), 'backslash in alias should be escaped in cell')

    // constraint name underscores → \_ in Markdown cell
    assert.ok(content.includes('ck\\_items\\_status'), 'underscores in constraint name should be escaped')

    // pipe in enum → \| in Allowed Values cell
    assert.ok(content.includes('pipe\\|enum'), 'pipe in enum should be escaped in Markdown cell')

    // single quote in enum → '' in DDL (SQL string literal escape)
    assert.ok(content.includes("'O''Brien'"), 'single quote in enum should be doubled in DDL')

    // pipe in enum value is NOT escaped in DDL (only SQL rules apply)
    assert.ok(content.includes("'pipe|enum'"), 'pipe in enum should be unescaped in DDL')
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns a non-zero exit code', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'error.md')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeTableDoc(['nonexistent.yaml', '--output', outputFilePath])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })
})

// ─── Library contract ──────────────────────────────────────────────────────────

describe('renderTablesDoc library contract', () => {
  it('Given an optional OpenAPI field, When renderTablesDoc is called, Then the column shows Nullable: yes', () => {
    const validated = validate({ specFilePath: onlineShopWithOpenApiSpecFilePath, validators: [openApiValidator] })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, 'custom/source label')

    assert.match(content, /\nsource: custom\/source label\n/)
    assert.match(content, /\| phone \| VARCHAR\(1024\) \| yes \|/)
  })

  it('Given optionals overrides, When renderTablesDoc is called, Then Nullable reflects the override', () => {
    const optionalsSpec = 'test/core/projector/fixtures/online-shop-optionals-override.valid.yaml'

    const validated = validate({ specFilePath: optionalsSpec, validators: [openApiValidator] })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, optionalsSpec)

    // requiredField is required in OpenAPI but optionals overrides it to nullable
    assert.match(content, /\| required\\_field \| VARCHAR\(40\) \| yes \|/)

    // optionalField is optional in OpenAPI but optionals overrides it to required
    assert.match(content, /\| optional\\_field \| VARCHAR\(40\) \| no \|/)
  })

  it('Given aliases with pipe and backslash, When renderTablesDoc is called, Then cell text is escaped', () => {
    const validated = validate({ specFilePath: specialCharacterEscapingSpecFilePath, validators: [openApiValidator] })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, specialCharacterEscapingSpecFilePath)

    assert.ok(content.includes('pipe\\|alias'), 'pipe in alias should be escaped')
    assert.ok(content.includes('back\\\\slash'), 'backslash in alias should be escaped')
  })

  it('Given an enum value with a single quote, When renderTablesDoc is called, Then the DDL uses SQL-escaped literals', () => {
    const validated = validate({ specFilePath: specialCharacterEscapingSpecFilePath, validators: [openApiValidator] })

    const projection = project(validated, [relationalDbProjector]).get<RelationalDbProjection>('relational-db')
    const content = renderTablesDoc(validated.spec, projection, specialCharacterEscapingSpecFilePath)

    assert.ok(content.includes("'O''Brien'"), 'single quote should be doubled in DDL')
  })
})

function extractSha256(content: string): string | undefined {
  return /sha256: ([0-9a-f]{64})/.exec(content)?.[1]
}
