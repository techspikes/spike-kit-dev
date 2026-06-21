import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import type { MigrationProvider } from 'kysely/migration'
import { Migrator, NO_MIGRATIONS } from 'kysely/migration'
import { executeKyselyMigration } from '../../../src/commands/kysely-migration.ts'
import {
  createPgliteKyselyDb,
  readColumnIsNullable,
  readColumnNames,
  readConstraintNames,
  readIndexNames,
  readPgliteNumericParserSamples,
  readTableNames
} from '../../test-helper/db.ts'
import {
  createTemporaryDirectory,
  getFileImportUrl,
  joinFilePath,
  readTextFile,
  removeDirectory
} from '../../test-helper/file-access.ts'
import { runCommandAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot kysely-migration [OPTION]... SPEC_FILE'
const migrationGeneratedStdout = ['Migration generated\n']
const dryRunCompletedStdout = ['Dry run completed\n']

const tentativeMigrationWarningsStderr = `Warning: Tentative table included in migration and needs review: orders
Warning: Tentative table included in migration and needs review: order_items
Warning: Check constraint ignored by migration renderer: orders.ck_orders_status
`

const orderStatusCheckWarningStderr =
  'Warning: Check constraint ignored by migration renderer: orders.ck_orders_status\n'

// ─── CLI behaviour ─────────────────────────────────────────────────────────────

describe('kysely-migration CLI', () => {
  let temporaryDirectoryPath = ''

  before(() => {
    temporaryDirectoryPath = createTemporaryDirectory('kysely-migration-')
  })

  after(() => {
    removeDirectory(temporaryDirectoryPath)
  })

  it('Given --help is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeKyselyMigration(['--help']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given -h is provided, When the command executes, Then it prints usage and returns exit code 0', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeKyselyMigration(['-h']))

    assert.equal(exitCode, 0)
    assert.equal(stdout[0]?.split('\n')[0], usageLine)
    assert.deepEqual(stderr, [])
  })

  it('Given no spec file is provided, When the command executes, Then it prints usage to stderr and returns exit code 1', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() => executeKyselyMigration([]))

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.equal(stderr[0]?.split('\n')[0], usageLine)
  })

  it('Given no --output is provided, When the command executes, Then it prints usage to stderr and returns exit code 1', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml'
      ])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.equal(stderr[0]?.split('\n')[0], usageLine)
  })

  it('Given --types-output without .d.ts extension, When the command executes, Then it prints an error and returns exit code 1', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'migration.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath,
        '--types-output',
        'types.ts'
      ])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.equal(stderr.join('').split('\n')[0], 'Error: --types-output path must end in .d.ts')
    assert.equal(stderr.join('').split('\n')[2], usageLine)
  })

  it('Given the online shop spec with a tentative claim, When the command executes, Then it writes a complete initial migration and warns', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'initial.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, migrationGeneratedStdout)
    assert.equal(stderr.join(''), tentativeMigrationWarningsStderr)

    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/initial-with-tentative.ts')
    )
  })

  it('Given the online shop spec with a check constraint, When the command executes, Then stderr has check constraint warning', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'check-warn.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), tentativeMigrationWarningsStderr)
  })

  it('Given a spec with optionals overrides, When the command executes, Then notNull reflects the override', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'optionals-override.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-optionals-override.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/optionals-override.ts')
    )
  })

  it('Given --dry-run, When the command executes, Then no files are written', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'dry-run.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        outputFilePath,
        '--dry-run'
      ])
    )

    assert.equal(exitCode, 0)
    assert.deepEqual(stdout, dryRunCompletedStdout)
    assert.equal(stderr.join(''), '')

    assert.throws(() => readTextFile(outputFilePath), 'File should not exist after dry-run')
  })

  it('Given a spec with a tentative claim, When the command executes, Then the tentative table is included and a warning is emitted', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'tentative-included.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), tentativeMigrationWarningsStderr)
    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/initial-with-tentative.ts')
    )
  })

  it('Given --include-tentative is provided, When the command executes, Then it rejects the removed option', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'tentative-removed-option.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-tentative-order.valid.yaml',
        '--output',
        outputFilePath,
        '--include-tentative'
      ])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.equal(
      stderr.join(''),
      "Unknown option '--include-tentative'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--include-tentative\"\n"
    )
  })

  it('Given --previous-migration pointing to the same spec, When the command executes, Then it generates an empty diff migration', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-empty.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/empty-diff.ts')
    )
  })

  it('Given --previous-migration with the online shop order spec, When the command runs against the product spec, Then diff migration adds the new product table', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-v1.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-v2.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-products.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/add-products-diff.ts')
    )
  })

  it('Given --types-output with .d.ts extension, When the command executes, Then the types file is written with Database interface', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'types-migration.ts')
    const typesOutputFilePath = joinFilePath(temporaryDirectoryPath, 'types-db.d.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        outputFilePath,
        '--types-output',
        typesOutputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/types-output.ts')
    )
    assert.equal(
      normalizeGeneratedAt(readTextFile(typesOutputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/types/types-output.d.ts')
    )
  })

  it('Given a diff that adds a nullable column to an existing table, When the command executes, Then it generates addColumn without notNull callback', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'no-phone-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-no-phone.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'add-phone-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-v1.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/add-phone-diff.ts')
    )
  })

  it('Given a diff that renames a column, When the command executes, Then it generates renameColumn', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'rename-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-v1.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'rename-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-v2.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/rename-column-diff.ts')
    )
  })

  it('Given a diff that renames tables, When the command executes, Then it generates renameTo and drops/recreates PKs', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'table-rename-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'table-rename-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-renamed-tables.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/rename-table-diff.ts')
    )
  })

  it('Given a diff that changes a column type, When the command executes, Then it generates alterColumn with setDataType', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'col-type-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'col-type-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed-price-scale.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/column-type-diff.ts')
    )
  })

  it('Given a diff that adds a table with a check constraint, When the command executes, Then it warns about the check constraint', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-diff-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-without-order-status-check.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-order-status-check.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), orderStatusCheckWarningStderr)
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/check-add-diff.ts')
    )
  })

  it('Given a diff that removes a check constraint from an existing table, When the command executes, Then it warns about the removed check constraint', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-remove-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-order-status-check.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), orderStatusCheckWarningStderr)

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-remove-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-without-order-status-check.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), orderStatusCheckWarningStderr)
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/check-remove-diff.ts')
    )
  })

  it('Given a diff that removes an index entirely, When the command executes, Then it drops the index', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'drop-ix-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'drop-ix-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed-without-index.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/drop-index-diff.ts')
    )
  })

  it('Given --previous-migration pointing to a file without an embedded snapshot, When the command executes, Then it returns exit code 1', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'no-snapshot-output.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        outputFilePath,
        '--previous-migration',
        'test/commands/kysely-migration/fixtures/migrations/no-embedded-snapshot-migration.ts'
      ])
    )

    assert.equal(exitCode, 1)
    assert.equal(stderr.join(''), 'No embedded relational DB projection found in previous migration file\n')
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns exit code 1', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'error.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration(['nonexistent.yaml', '--output', outputFilePath])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.equal(stderr.join(''), `ENOENT: no such file or directory, open '${process.cwd()}/nonexistent.yaml'\n`)
  })

  it('Given the online shop product spec with DECIMAL and BOOLEAN columns, When the command executes, Then it maps types correctly in the migration', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'typed-initial.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/typed-initial.ts')
    )
  })

  it('Given the online shop product rating spec with a DOUBLE PRECISION column, When the command executes, Then it maps the type correctly in the migration', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'typed-double-precision-initial.ts')

    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-rating.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)
    assert.equal(stderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(outputFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/typed-double-precision-initial.ts')
    )
  })

  it('Given the online shop order spec to product order spec diff, When the command executes, Then it adds a column to an existing table and a new table with a UQ', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'v3-diff-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-orders.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'v3-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-product-orders.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/add-order-items-diff.ts')
    )
  })

  it('Given online shop product specs with changed UQ and index, When the command executes, Then it generates correct diff operations', () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'typed-diff-initial.ts')
    const { exitCode: initialExitCode, stderr: initialStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)
    assert.equal(initialStderr.join(''), '')

    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'typed-diff.ts')
    const { exitCode: diffExitCode, stderr: diffStderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-products-typed-index-change.valid.yaml',
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)
    assert.equal(diffStderr.join(''), '')
    assert.equal(
      normalizeGeneratedAt(readTextFile(diffMigrationFilePath)),
      readTextFile('test/commands/kysely-migration/fixtures/migrations/typed-v2-diff.ts')
    )
  })
})

// ─── PGlite integration ────────────────────────────────────────────────────────

describe('generated migrations in PGlite', () => {
  let temporaryDirectoryPath = ''

  before(() => {
    temporaryDirectoryPath = createTemporaryDirectory('shot-pglite-')
  })

  after(() => {
    removeDirectory(temporaryDirectoryPath)
  })

  it('Given a generated up migration, When it runs in PGlite, Then it creates tables, constraints, and indexes', async () => {
    const migrationFilePath = joinFilePath(temporaryDirectoryPath, 'up_test.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-customer-name-index.valid.yaml',
        '--output',
        migrationFilePath
      ])
    )

    assert.equal(exitCode, 0)

    const db = createPgliteKyselyDb()
    const migration = await import(getFileImportUrl(migrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return { '001_up': migration }
      }
    }
    const migrator = new Migrator({ db, provider })
    const { error } = await migrator.migrateToLatest()

    assert.equal(error, undefined)
    assert.deepEqual(await readTableNames(db), ['customers', 'orders'])
    assert.deepEqual(await readConstraintNames(db), ['fk_orders_customer', 'pk_customers', 'pk_orders'])
    assert.deepEqual(await readIndexNames(db), ['idx_customers_name'])

    await db.destroy()
  })

  it('Given a generated migration is applied, When it migrates down in PGlite, Then it removes all tables', async () => {
    const migrationFilePath = joinFilePath(temporaryDirectoryPath, 'down_test.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-with-customer-name-index.valid.yaml',
        '--output',
        migrationFilePath
      ])
    )

    assert.equal(exitCode, 0)

    const db = createPgliteKyselyDb()
    const migration = await import(getFileImportUrl(migrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return { '001_down': migration }
      }
    }
    const migrator = new Migrator({ db, provider })

    const upResult = await migrator.migrateToLatest()

    assert.equal(upResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['customers', 'orders'])

    const downResult = await migrator.migrateTo(NO_MIGRATIONS)

    assert.equal(downResult.error, undefined)
    assert.deepEqual(await readTableNames(db), [])

    await db.destroy()
  })

  it('Given initial and three diff migrations, When they run in PGlite, Then generated rename, add, alter, and drop operations migrate up and down', async () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, '001_online_shop.ts')
    const renameMigrationFilePath = joinFilePath(temporaryDirectoryPath, '002_rename_customer_order.ts')
    const addProductMigrationFilePath = joinFilePath(temporaryDirectoryPath, '003_add_products.ts')
    const changeProductMigrationFilePath = joinFilePath(temporaryDirectoryPath, '004_change_products.ts')

    const { exitCode: initialExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-pglite-v1.valid.yaml',
        '--output',
        initialMigrationFilePath
      ])
    )

    assert.equal(initialExitCode, 0)

    const { exitCode: renameExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-pglite-v2.valid.yaml',
        '--previous-migration',
        initialMigrationFilePath,
        '--output',
        renameMigrationFilePath
      ])
    )

    assert.equal(renameExitCode, 0)

    const { exitCode: addProductExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-pglite-v3.valid.yaml',
        '--previous-migration',
        renameMigrationFilePath,
        '--output',
        addProductMigrationFilePath
      ])
    )

    assert.equal(addProductExitCode, 0)

    const { exitCode: changeProductExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/commands/kysely-migration/fixtures/sketches/online-shop-pglite-v4.valid.yaml',
        '--previous-migration',
        addProductMigrationFilePath,
        '--output',
        changeProductMigrationFilePath
      ])
    )

    assert.equal(changeProductExitCode, 0)

    const db = createPgliteKyselyDb()
    const initialMigration = await import(getFileImportUrl(initialMigrationFilePath))
    const renameMigration = await import(getFileImportUrl(renameMigrationFilePath))
    const addProductMigration = await import(getFileImportUrl(addProductMigrationFilePath))
    const changeProductMigration = await import(getFileImportUrl(changeProductMigrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return {
          '001_online_shop': initialMigration,
          '002_rename_customer_order': renameMigration,
          '003_add_products': addProductMigration,
          '004_change_products': changeProductMigration
        }
      }
    }
    const migrator = new Migrator({ db, provider })

    const renameResult = await migrator.migrateTo('002_rename_customer_order')

    assert.equal(renameResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['clients', 'purchases'])
    assert.deepEqual(await readColumnNames(db, 'clients'), ['id', 'name', 'email_address'])
    assert.deepEqual(await readColumnNames(db, 'purchases'), ['id', 'status', 'customer_ref'])
    assert.deepEqual(await readIndexNames(db), ['idx_clients_name', 'idx_purchases_status'])

    const addProductResult = await migrator.migrateTo('003_add_products')

    assert.equal(addProductResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['clients', 'products', 'purchases'])
    assert.deepEqual(await readColumnNames(db, 'products'), ['id', 'sku', 'price', 'active', 'inventory_count'])
    assert.deepEqual(await readColumnNames(db, 'purchases'), ['id', 'status', 'customer_ref', 'product', 'notes'])
    assert.equal(await readColumnIsNullable(db, 'purchases', 'notes'), 'YES')
    assert.deepEqual(await readIndexNames(db), ['idx_clients_name', 'idx_products_sku', 'idx_purchases_status'])

    assert.deepEqual(await readPgliteNumericParserSamples(db), {
      bigint_value: '9007199254740993',
      decimal_value: '19.99'
    })

    const changeProductResult = await migrator.migrateToLatest()

    assert.equal(changeProductResult.error, undefined)
    assert.equal(await readColumnIsNullable(db, 'purchases', 'notes'), 'NO')
    assert.deepEqual(await readIndexNames(db), ['idx_clients_name', 'idx_products_sku'])

    const downToAddProductResult = await migrator.migrateTo('003_add_products')

    assert.equal(downToAddProductResult.error, undefined)
    assert.equal(await readColumnIsNullable(db, 'purchases', 'notes'), 'YES')
    assert.deepEqual(await readIndexNames(db), ['idx_clients_name', 'idx_products_sku', 'idx_purchases_status'])

    const downToRenameResult = await migrator.migrateTo('002_rename_customer_order')

    assert.equal(downToRenameResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['clients', 'purchases'])
    assert.deepEqual(await readColumnNames(db, 'clients'), ['id', 'name', 'email_address'])

    const downToInitialResult = await migrator.migrateTo('001_online_shop')

    assert.equal(downToInitialResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['customers', 'orders'])
    assert.deepEqual(await readColumnNames(db, 'customers'), ['id', 'name', 'email'])
    assert.deepEqual(await readColumnNames(db, 'orders'), ['id', 'status', 'customer'])

    const downResult = await migrator.migrateTo(NO_MIGRATIONS)

    assert.equal(downResult.error, undefined)
    assert.deepEqual(await readTableNames(db), [])

    await db.destroy()
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeGeneratedAt(content: string): string {
  return content.replace(/^\/\/ generated_at: .+$/mu, '// generated_at: <GENERATED_AT>') // generated_at is nondeterministic.
}
