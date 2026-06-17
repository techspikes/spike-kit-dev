import assert from 'node:assert'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { executeTableDoc } from '../../../src/commands/tables-doc.ts'
import { parse, renderTablesDoc, validate } from '../../../src/index.ts'
import { runAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot tables-doc [OPTION]... SPEC_FILE'
const fixtureSpec = 'test/commands/tables-doc/fixtures/online-shop.yaml'
const escapingSpec = 'test/commands/tables-doc/fixtures/escaping.yaml'

// ─── CLI behaviour ─────────────────────────────────────────────────────────────

describe('tables-doc CLI', () => {
  let tempDir = ''

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tables-doc-'))
  })

  after(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('Given --help is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = run(['--help'])

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given -h is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = run(['-h'])

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no spec file is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = run([])

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no --output is provided, When the command executes, Then it prints usage and returns a non-zero exit code', () => {
    const { exitCode, stdout, stderr } = run([fixtureSpec])

    assert.equal(exitCode, 1)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given a valid spec file, When the command executes, Then it writes a complete Markdown document', () => {
    const outputPath = join(tempDir, 'output.md')
    const { exitCode, stdout, stderr } = run([fixtureSpec, '--output', outputPath])

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, [])
    assert.deepEqual(stderr, [])

    const content = readFileSync(outputPath, 'utf-8')

    // frontmatter
    assert.match(content, /^---\n/)
    assert.match(content, /\nsource: online-shop\.yaml\n/)
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
    const customersSection = content.slice(
      content.indexOf('\n## customers\n'),
      content.indexOf('\n## orders\n')
    )

    assert.ok(!customersSection.includes('### Foreign Keys'))
    assert.ok(!customersSection.includes('### Unique Constraints'))
    assert.ok(!customersSection.includes('### Check Constraints'))

    // DDL
    assert.match(content, /\n## DDL\n\n```sql\n/)
    assert.match(content, /CREATE TABLE orders \(/)
    assert.match(
      content,
      /CONSTRAINT ck_orders_status CHECK \(status IN \('pending', 'shipped', 'delivered'\)\)/
    )
    assert.match(content, /CREATE INDEX idx_orders_status ON orders \(status\);/)
    assert.match(content, /\n```\n$/)
  })

  it('Given a valid spec file, When the command executes with -o, Then it writes to the output file', () => {
    const outputPath = join(tempDir, 'short-flag.md')
    const { exitCode, stderr } = run([fixtureSpec, '-o', outputPath])

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readFileSync(outputPath, 'utf-8')

    assert.match(content, /^---\n/)
  })

  it('Given an existing output file, When the command executes, Then it overwrites the file', () => {
    const outputPath = join(tempDir, 'overwrite.md')

    run([fixtureSpec, '-o', outputPath])
    run([fixtureSpec, '-o', outputPath])

    const content = readFileSync(outputPath, 'utf-8')

    assert.match(content, /^---\n/)
  })

  it('Given the same spec file run twice, When the command executes, Then it produces the same sha256', () => {
    const outputPath1 = join(tempDir, 'sha256-run1.md')
    const outputPath2 = join(tempDir, 'sha256-run2.md')

    run([fixtureSpec, '-o', outputPath1])
    run([fixtureSpec, '-o', outputPath2])

    const sha1 = extractSha256(readFileSync(outputPath1, 'utf-8'))
    const sha2 = extractSha256(readFileSync(outputPath2, 'utf-8'))

    assert.ok(sha1, 'sha256 should be present in first output')
    assert.equal(sha1, sha2)
  })

  it('Given two specs with identical content but different key order, When the command executes, Then sha256 values match', () => {
    const outputPath1 = join(tempDir, 'sha256-key-ordered.md')
    const outputPath2 = join(tempDir, 'sha256-key-reordered.md')

    run([escapingSpec, '-o', outputPath1])
    run(['test/commands/tables-doc/fixtures/escaping.reordered.yaml', '-o', outputPath2])

    const sha1 = extractSha256(readFileSync(outputPath1, 'utf-8'))
    const sha2 = extractSha256(readFileSync(outputPath2, 'utf-8'))

    assert.ok(sha1, 'sha256 should be present')
    assert.equal(sha1, sha2)
  })

  it('Given a spec without an OpenAPI source, When the command executes, Then detail columns use the VARCHAR(1024) fallback type', () => {
    const outputPath = join(tempDir, 'no-openapi.md')
    const { exitCode, stderr } = run([
      'test/commands/tables-doc/fixtures/no-openapi.yaml',
      '--output',
      outputPath
    ])

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readFileSync(outputPath, 'utf-8')

    assert.match(content, /\| name \| VARCHAR\(1024\) \| no \|/)
    assert.match(content, /\| email \| VARCHAR\(1024\) \| no \|/)
  })

  it('Given a spec with special characters in aliases and enum values, When the command executes, Then cell text and DDL are correctly escaped', () => {
    const outputPath = join(tempDir, 'escaping.md')
    const { exitCode, stderr } = run([escapingSpec, '--output', outputPath])

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

    const content = readFileSync(outputPath, 'utf-8')

    // pipe in alias → \| in Markdown cell
    assert.ok(content.includes('pipe\\|alias'), 'pipe in alias should be escaped in cell')

    // backslash in alias → \\ in Markdown cell
    assert.ok(content.includes('back\\\\slash'), 'backslash in alias should be escaped in cell')

    // constraint name underscores → \_ in Markdown cell
    assert.ok(
      content.includes('ck\\_items\\_status'),
      'underscores in constraint name should be escaped'
    )

    // pipe in enum → \| in Allowed Values cell
    assert.ok(content.includes('pipe\\|enum'), 'pipe in enum should be escaped in Markdown cell')

    // single quote in enum → '' in DDL (SQL string literal escape)
    assert.ok(content.includes("'O''Brien'"), 'single quote in enum should be doubled in DDL')

    // pipe in enum value is NOT escaped in DDL (only SQL rules apply)
    assert.ok(content.includes("'pipe|enum'"), 'pipe in enum should be unescaped in DDL')
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns a non-zero exit code', () => {
    const outputPath = join(tempDir, 'error.md')
    const { exitCode, stdout, stderr } = run(['nonexistent.yaml', '--output', outputPath])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })
})

// ─── Library contract ──────────────────────────────────────────────────────────

describe('renderTablesDoc library contract', () => {
  it('Given an optional OpenAPI field, When renderTablesDoc is called, Then the column shows Nullable: yes', () => {
    const sketch = parse({ path: fixtureSpec })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()
    const content = renderTablesDoc(validated.spec, projection, fixtureSpec)

    // phone is not required in OpenAPI → nullable: true in projection
    assert.match(content, /\| phone \| VARCHAR\(1024\) \| yes \|/)
  })

  it('Given optionals overrides, When renderTablesDoc is called, Then Nullable reflects the override', () => {
    const optionalsSpec = 'test/core/projector/fixtures/online-shop-optionals-override.valid.yaml'
    const sketch = parse({ path: optionalsSpec })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()
    const content = renderTablesDoc(validated.spec, projection, optionalsSpec)

    // requiredField is required in OpenAPI but optionals overrides it to nullable
    assert.match(content, /\| required\\_field \| VARCHAR\(40\) \| yes \|/)

    // optionalField is optional in OpenAPI but optionals overrides it to required
    assert.match(content, /\| optional\\_field \| VARCHAR\(40\) \| no \|/)
  })

  it('Given aliases with pipe and backslash, When renderTablesDoc is called, Then cell text is escaped', () => {
    const sketch = parse({ path: escapingSpec })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()
    const content = renderTablesDoc(validated.spec, projection, escapingSpec)

    assert.ok(content.includes('pipe\\|alias'), 'pipe in alias should be escaped')
    assert.ok(content.includes('back\\\\slash'), 'backslash in alias should be escaped')
  })

  it('Given an enum value with a single quote, When renderTablesDoc is called, Then the DDL uses SQL-escaped literals', () => {
    const sketch = parse({ path: escapingSpec })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()
    const content = renderTablesDoc(validated.spec, projection, escapingSpec)

    assert.ok(content.includes("'O''Brien'"), 'single quote should be doubled in DDL')
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

function run(args: readonly string[]) {
  let exitCode = 0

  const result = runAndCapture(() => {
    exitCode = executeTableDoc(args)
  })

  return { exitCode, stdout: result.stdout, stderr: result.stderr }
}

function extractSha256(content: string): string | undefined {
  return /sha256: ([0-9a-f]{64})/.exec(content)?.[1]
}
