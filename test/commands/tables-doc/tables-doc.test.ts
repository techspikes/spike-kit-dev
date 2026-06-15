import assert from 'node:assert'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  canonicalizeJson,
  executeTableDoc,
  renderTablesDoc
} from '../../../src/commands/tables-doc.ts'
import { parse } from '../../../src/core/parser.ts'
import { validate } from '../../../src/core/validator.ts'
import { runAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot tables-doc [OPTION]... SPEC_FILE'
const fixtureSpec = 'test/commands/tables-doc/fixtures/online-shop.yaml'

describe('tables-doc command', () => {
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

  it('Given a valid spec file, When the command executes, Then it writes a Markdown document to the output file', () => {
    const outputPath = join(tempDir, 'output.md')
    const { exitCode, stdout, stderr } = run([fixtureSpec, '--output', outputPath])

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, [])
    assert.deepEqual(stderr, [])

    const content = readFileSync(outputPath, 'utf-8')

    assert.match(content, /^---\n/)
    assert.match(content, /\nsource: online-shop\.yaml\n/)
    assert.match(content, /\nsha256: [0-9a-f]{64}\n/)
    assert.match(content, /\ngenerated_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    assert.match(content, /---\n\n# online-shop\n/)

    assert.match(content, /\n## customers\n/)
    assert.match(content, /\n## orders\n/)
    assert.match(content, /> \[!CAUTION\]\n> This table is tentative and needs human review\./)
    assert.match(content, /\n## order_items\n/)

    assert.match(content, /\| Column \| Data Type \| Nullable \| Description \|/)
    assert.match(content, /\| id \| CHAR\(26\) \| no \| Auto-assigned surrogate key \|/)

    assert.match(content, /order status/)
    assert.match(content, /item quantity/)

    assert.match(content, /### Primary Key/)
    assert.match(content, /### Foreign Keys/)
    assert.match(content, /### Unique Constraints/)
    assert.match(content, /### Check Constraints/)
    assert.match(content, /\| ck\\_orders\\_status \| status \| pending, shipped, delivered \|/)

    assert.match(content, /\n## DDL\n\n```sql\n/)
    assert.match(content, /CREATE TABLE orders \(/)
    assert.match(
      content,
      /CONSTRAINT ck_orders_status CHECK \(status IN \('pending', 'shipped', 'delivered'\)\)/
    )
    assert.match(content, /CREATE INDEX idx_orders_status ON orders \(status\);/)
    assert.match(content, /\n```\n$/)
  })

  it('Given a valid spec file, When the command executes with -o, Then it writes the same output as --output', () => {
    const outputPath = join(tempDir, 'short-flag.md')
    const { exitCode, stderr } = run([fixtureSpec, '-o', outputPath])

    assert.equal(exitCode, 0)
    assert.deepEqual(stderr, [])

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

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns a non-zero exit code', () => {
    const outputPath = join(tempDir, 'error.md')
    const { exitCode, stdout, stderr } = run(['nonexistent.yaml', '--output', outputPath])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })
})

describe('canonicalizeJson', () => {
  it('sorts object keys in UTF-16 order', () => {
    const result = canonicalizeJson({ b: 1, a: 2 })

    assert.equal(result, '{"a":2,"b":1}')
  })

  it('preserves array element order', () => {
    const result = canonicalizeJson([3, 1, 2])

    assert.equal(result, '[3,1,2]')
  })

  it('handles null', () => {
    assert.equal(canonicalizeJson(null), 'null')
  })

  it('handles nested objects', () => {
    const result = canonicalizeJson({ z: { b: 1, a: 2 }, a: [{ c: 3, b: 4 }] })

    assert.equal(result, '{"a":[{"b":4,"c":3}],"z":{"a":2,"b":1}}')
  })
})

describe('renderTablesDoc', () => {
  it('Given a spec with a nullable column, When rendered, Then the column shows nullable: yes', () => {
    const sketch = parse({
      path: fixtureSpec
    })
    const validated = validate({ sketch, trace: true })
    const projection = validated.projections.relationalDb()

    const nullableProjection = {
      ...projection,
      tables: {
        ...projection.tables,
        customer: {
          ...projection.tables.customer,
          columns: projection.tables.customer.columns.map(col =>
            col.name === 'name' ? { ...col, nullable: true as const } : col
          )
        }
      }
    }

    const content = renderTablesDoc(validated.spec, nullableProjection, 'test.yaml')

    assert.match(content, /\| name \| VARCHAR\(100\) \| yes \|/)
  })
})

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
