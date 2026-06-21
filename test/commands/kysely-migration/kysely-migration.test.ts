import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { Kysely, PGliteDialect, sql } from 'kysely'
import type { MigrationProvider } from 'kysely/migration'
import { Migrator, NO_MIGRATIONS } from 'kysely/migration'
import {
  executeKyselyMigration,
  parseEmbeddedSnapshot,
  renderInitialMigrationFile
} from '../../../src/commands/kysely-migration.ts'
import {
  createTemporaryDirectory,
  getFileImportUrl,
  joinFilePath,
  readTextFile,
  removeDirectory,
  writeTextFile
} from '../../test-helper/file-access.ts'
import { runCommandAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot kysely-migration [OPTION]... SPEC_FILE'
const onlineShopWithTentativeOrderSpecFilePath =
  'test/commands/kysely-migration/fixtures/online-shop-with-tentative-order.valid.yaml'
const simpleSpec = 'test/commands/kysely-migration/fixtures/simple.valid.yaml'
const simpleV2Spec = 'test/commands/kysely-migration/fixtures/simple-v2.valid.yaml'
const typedSpec = 'test/commands/kysely-migration/fixtures/typed.valid.yaml'
const typedDoublePrecisionSpec = 'test/commands/kysely-migration/fixtures/typed-double-precision.valid.yaml'
const typedV2Spec = 'test/commands/kysely-migration/fixtures/typed-v2.valid.yaml'
const simpleV3Spec = 'test/commands/kysely-migration/fixtures/simple-v3.valid.yaml'
const onlineShopNoPhoneSpec = 'test/commands/kysely-migration/fixtures/online-shop-no-phone.valid.yaml'
const onlineShopV1Spec = 'test/commands/kysely-migration/fixtures/online-shop-v1.valid.yaml'
const onlineShopV2Spec = 'test/commands/kysely-migration/fixtures/online-shop-v2.valid.yaml'
const typedV3Spec = 'test/commands/kysely-migration/fixtures/typed-v3.valid.yaml'
const typedV4Spec = 'test/commands/kysely-migration/fixtures/typed-v4.valid.yaml'
const simpleRenamedSpec = 'test/commands/kysely-migration/fixtures/simple-renamed.valid.yaml'
const simpleWithCheckSpec = 'test/commands/kysely-migration/fixtures/simple-with-check.valid.yaml'
const simpleWithoutCheckSpec = 'test/commands/kysely-migration/fixtures/simple-without-check.valid.yaml'

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
    assert.ok(stderr.length > 0)
    assert.ok(stderr.join('').includes(usageLine))
  })

  it('Given no --output is provided, When the command executes, Then it prints usage to stderr and returns exit code 1', () => {
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([onlineShopWithTentativeOrderSpecFilePath])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
    assert.ok(stderr.join('').includes(usageLine))
  })

  it('Given --types-output without .d.ts extension, When the command executes, Then it prints an error and returns exit code 1', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'migration.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopWithTentativeOrderSpecFilePath,
        '--output',
        outputFilePath,
        '--types-output',
        'types.ts'
      ])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.join('').includes('.d.ts'))
  })

  it('Given the online shop spec with --include-tentative, When the command executes, Then it writes a complete initial migration', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'initial.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopWithTentativeOrderSpecFilePath,
        '--output',
        outputFilePath,
        '--include-tentative'
      ])
    )

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Migration generated'))

    const content = readTextFile(outputFilePath)

    // Embedded snapshot block present
    assert.match(content, /\/\/ ---/)
    assert.match(content, /\/\/ data-sketch\/embedded-db-projection-snapshot: 1\.0\.0-draft\.0/)
    assert.match(content, /\/\/ generated_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    assert.match(content, /\/\/ payload: \|/)

    // Kysely import
    assert.match(content, /import type \{ Kysely \} from 'kysely'/)

    // MigrationDatabase interface
    assert.match(content, /interface MigrationDatabase \{/)
    assert.match(content, /'customers'/)
    assert.match(content, /'orders'/)
    assert.match(content, /'order_items'/)

    // createTable calls
    assert.match(content, /\.createTable\('customers'\)/)
    assert.match(content, /\.createTable\('orders'\)/)
    assert.match(content, /\.createTable\('order_items'\)/)

    // orders has FK and unique constraint
    assert.match(content, /\.addForeignKeyConstraint\('fk_orders_customer', \['customer'\], 'customers', \['id'\]\)/)
    assert.match(content, /\.addUniqueConstraint\('uq_orders_status_customer', \['status', 'customer'\]\)/)

    // order_items has structural FK
    assert.match(content, /\.addForeignKeyConstraint\('fk_order_items_order', \['order'\], 'orders', \['id'\]\)/)

    // up and down functions
    assert.match(content, /export async function up\(db: Kysely<MigrationDatabase>\): Promise<void>/)
    assert.match(content, /export async function down\(db: Kysely<MigrationDatabase>\): Promise<void>/)

    // down function has dropTable calls
    assert.match(content, /\.dropTable\('order_items'\)/)
    assert.match(content, /\.dropTable\('orders'\)/)
    assert.match(content, /\.dropTable\('customers'\)/)

    // Tables are in correct topo order (customers before orders, orders before order_items)
    const customersPos = content.indexOf("createTable('customers')")
    const ordersPos = content.indexOf("createTable('orders')")
    const orderItemsPos = content.indexOf("createTable('order_items')")

    assert.ok(customersPos < ordersPos, 'customers must come before orders')
    assert.ok(ordersPos < orderItemsPos, 'orders must come before order_items')

    // Check constraint warning in stderr
    assert.ok(stderr.join('').includes('ck_orders_status'))
    assert.ok(
      stderr.join('').includes('Warning: Check constraint ignored by migration renderer: orders.ck_orders_status')
    )
  })

  it('Given the online shop spec with --include-tentative and a check constraint, When the command executes, Then stderr has check constraint warning', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'check-warn.ts')
    const { stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopWithTentativeOrderSpecFilePath,
        '--output',
        outputFilePath,
        '--include-tentative'
      ])
    )

    assert.ok(
      stderr.join('').includes('Warning: Check constraint ignored by migration renderer: orders.ck_orders_status')
    )
  })

  it('Given a spec with optionals overrides, When the command executes, Then notNull reflects the override', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'optionals-override.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        'test/core/projector/fixtures/online-shop-optionals-override.valid.yaml',
        '--output',
        outputFilePath
      ])
    )

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)

    // requiredField is required in OpenAPI but optionals overrides it to nullable
    assert.match(content, /\.addColumn\('required_field', 'varchar\(40\)'\)\n/)

    // optionalField is optional in OpenAPI but optionals overrides it to required
    assert.match(content, /\.addColumn\('optional_field', 'varchar\(40\)', column => column\.notNull\(\)\)/)
  })

  it('Given --dry-run, When the command executes, Then no files are written and stdout contains "Dry run completed"', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'dry-run.ts')
    const { exitCode, stdout } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', outputFilePath, '--dry-run'])
    )

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Dry run completed'))

    // File should NOT be written
    assert.throws(() => readTextFile(outputFilePath), 'File should not exist after dry-run')
  })

  it('Given a spec with a tentative claim, When the command executes without --include-tentative, Then the tentative table is excluded and a warning is emitted', () => {
    // The online shop spec has 'order' claim with tentative: true
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'tentative-excluded.ts')
    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([onlineShopWithTentativeOrderSpecFilePath, '--output', outputFilePath])
    )

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)

    // orders should NOT appear (tentative)
    assert.ok(!content.includes("createTable('orders')"), 'orders should be excluded')
    assert.ok(!content.includes("createTable('order_items')"), 'order_items should be excluded')

    // customers should appear
    assert.match(content, /createTable\('customers'\)/)

    // Warning in stderr
    assert.ok(
      stderr.join('').includes('Warning: Tentative claim excluded from migration: orders'),
      'Should warn about excluded tentative table'
    )
  })

  it('Given a spec with a tentative claim, When the command executes with --include-tentative, Then the tentative table is included', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'tentative-included.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopWithTentativeOrderSpecFilePath,
        '--output',
        outputFilePath,
        '--include-tentative'
      ])
    )

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)

    assert.match(content, /createTable\('orders'\)/)
  })

  it('Given --previous-migration pointing to the same spec, When the command executes, Then it generates an empty diff migration', () => {
    // First run: generate initial migration
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Second run: diff against the same initial (no changes expected)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-empty.ts')
    const { exitCode: exitCode2, stdout } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleSpec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)
    assert.ok(stdout.join('').includes('Migration generated'))

    const content = readTextFile(diffMigrationFilePath)

    // Still has embedded snapshot and Kysely import
    assert.match(content, /\/\/ data-sketch\/embedded-db-projection-snapshot: 1\.0\.0-draft\.0/)
    assert.match(content, /import type \{ Kysely \} from 'kysely'/)

    // up and down functions are present but empty (no operations)
    assert.match(content, /export async function up\(db: Kysely<MigrationDatabase>\): Promise<void>/)
    assert.match(content, /export async function down\(db: Kysely<MigrationDatabase>\): Promise<void>/)

    // No createTable or dropTable (no changes)
    assert.ok(!content.includes('.createTable('), 'no createTable for empty diff')
    assert.ok(!content.includes('.dropTable('), 'no dropTable for empty diff')
  })

  it('Given --previous-migration with simple.valid.yaml, When the command runs against simple-v2.valid.yaml, Then diff migration adds the new tag table', () => {
    // First run: initial migration for simple.valid.yaml
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-v1.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Second run: diff migration to simple-v2.valid.yaml (adds 'tag' claim)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'diff-v2.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleV2Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // up should createTable tags
    assert.match(content, /createTable\('tags'\)/)

    // down should dropTable tags
    assert.match(content, /dropTable\('tags'\)/)
  })

  it('Given --types-output with .d.ts extension, When the command executes, Then the types file is written with Database interface', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'types-migration.ts')
    const typesOutputFilePath = joinFilePath(temporaryDirectoryPath, 'types-db.d.ts')
    const { exitCode, stdout } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', outputFilePath, '--types-output', typesOutputFilePath])
    )

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Type definitions written'))
    assert.ok(stdout.join('').includes('Migration generated'))

    // Types file must exist
    const typesContent = readTextFile(typesOutputFilePath)

    // Has embedded snapshot
    assert.match(typesContent, /\/\/ data-sketch\/embedded-db-projection-snapshot: 1\.0\.0-draft\.0/)

    // Has Database export interface
    assert.match(typesContent, /export interface Database \{/)
    assert.match(typesContent, /'authors'/)
    assert.match(typesContent, /'posts'/)
  })

  it('Given a diff that adds a nullable column to an existing table, When the command executes, Then it generates addColumn without notNull callback', () => {
    // Generate initial migration from no-phone spec (customers without phone)
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'no-phone-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([onlineShopNoPhoneSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to spec with nullable phone added
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'add-phone-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopV1Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Nullable addColumn: no notNull callback
    assert.match(content, /alterTable\('customers'\)\.addColumn\('phone', 'varchar\(1024\)'\)\.execute\(\)/)
    // down drops the column
    assert.match(content, /alterTable\('customers'\)\.dropColumn\('phone'\)/)
  })

  it('Given a diff that renames a column, When the command executes, Then it generates renameColumn', () => {
    // Generate initial migration from online-shop-v1 (phone column)
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'rename-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([onlineShopV1Spec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to online-shop-v2 (phone renamed to contact_phone)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'rename-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopV2Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Column rename in up
    assert.match(content, /renameColumn\('phone', 'contact_phone'\)/)
    // Column rename reversed in down
    assert.match(content, /renameColumn\('contact_phone', 'phone'\)/)
  })

  it('Given a diff that renames tables, When the command executes, Then it generates renameTable and drops/recreates PKs', () => {
    // Generate initial migration from simple.valid.yaml
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'table-rename-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to simple-renamed.valid.yaml (authors→writers, posts→articles)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'table-rename-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleRenamedSpec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Table renames
    assert.match(content, /renameTable\('authors', 'writers'\)/)
    assert.match(content, /renameTable\('posts', 'articles'\)/)

    // PK dropped (old name) and re-added (new name)
    assert.match(content, /dropConstraint\('pk_authors'\)/)
    assert.match(content, /addPrimaryKeyConstraint\('pk_writers'/)
  })

  it('Given a diff that changes a column type, When the command executes, Then it generates alterColumn with setDataType', () => {
    // Generate initial migration from typed.valid.yaml
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'col-type-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([typedSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to typed-v3.valid.yaml (price changes from DECIMAL(10,2) to DECIMAL(10,4))
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'col-type-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        typedV3Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Column type change
    assert.match(content, /alterColumn\('price', col => col\.setDataType\('decimal\(10, 4\)'\)\.setNotNull\(\)\)/)
    // down reverses
    assert.match(content, /alterColumn\('price', col => col\.setDataType\('decimal\(10, 2\)'\)\.setNotNull\(\)\)/)
  })

  it('Given a diff that adds a table with a check constraint, When the command executes, Then it warns about the check constraint', () => {
    // Generate initial migration from online-shop (without tentative = just customers)
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-diff-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([onlineShopWithTentativeOrderSpecFilePath, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to online-shop with --include-tentative (adds orders table with ck_orders_status)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-diff.ts')
    const { exitCode: exitCode2, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        onlineShopWithTentativeOrderSpecFilePath,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath,
        '--include-tentative'
      ])
    )

    assert.equal(exitCode2, 0)

    // Should warn about added check constraint
    assert.ok(
      stderr.join('').includes('Warning: Check constraint ignored by migration renderer: orders.ck_orders_status'),
      'Should warn about added check constraint in diff mode'
    )
  })

  it('Given a diff that removes a check constraint from an existing table, When the command executes, Then it warns about the removed check constraint', () => {
    // Generate initial migration from simple-with-check (authors with ck_authors_status)
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-remove-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleWithCheckSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to simple-without-check (authors table still exists but ck_authors_status removed)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'ck-remove-diff.ts')
    const { exitCode: exitCode2, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleWithoutCheckSpec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    // Should warn about removed check constraint
    assert.ok(
      stderr.join('').includes('Warning: Check constraint ignored by migration renderer: authors.ck_authors_status'),
      'Should warn about removed check constraint in diff mode'
    )
  })

  it('Given a diff that removes an index entirely, When the command executes, Then it drops the index', () => {
    // Generate initial migration from typed.valid.yaml (has idx_products_sku)
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'drop-ix-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([typedSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Diff to typed-v4.valid.yaml (index removed)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'drop-ix-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        typedV4Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // up drops the index
    assert.match(content, /dropIndex\('idx_products_sku'\)/)
    // down re-creates the index
    assert.match(content, /createIndex\('idx_products_sku'\)/)
  })

  it('Given --previous-migration pointing to a file without an embedded snapshot, When the command executes, Then it returns exit code 1', () => {
    const noSnapshotFilePath = joinFilePath(temporaryDirectoryPath, 'no-snapshot.ts')
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'no-snapshot-output.ts')

    // Write a file that has no embedded snapshot block
    writeTextFile(noSnapshotFilePath, '// Just a regular TypeScript file\nexport const x = 1\n')

    const { exitCode, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', outputFilePath, '--previous-migration', noSnapshotFilePath])
    )

    assert.equal(exitCode, 1)
    assert.ok(stderr.join('').includes('No embedded DB projection snapshot found'))
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns exit code 1', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'error.ts')
    const { exitCode, stdout, stderr } = runCommandAndCapture(() =>
      executeKyselyMigration(['nonexistent.yaml', '--output', outputFilePath])
    )

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })

  it('Given typed.valid.yaml with DECIMAL and BOOLEAN columns, When the command executes, Then it maps types correctly in the migration', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'typed-initial.ts')
    const { exitCode } = runCommandAndCapture(() => executeKyselyMigration([typedSpec, '--output', outputFilePath]))

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)

    // DECIMAL maps to number
    assert.match(content, /'price': number/)
    // BOOLEAN maps to boolean
    assert.match(content, /'active': boolean/)
    // addColumn uses lowercase types
    assert.match(content, /\.addColumn\('price', 'decimal\(10, 2\)'/)
    assert.match(content, /\.addColumn\('active', 'boolean'/)
    // Unique constraint is present
    assert.match(content, /\.addUniqueConstraint\('uq_products_sku'/)
    // Index is present
    assert.match(content, /\.createIndex\('idx_products_sku'\)/)
  })

  it('Given typed-double-precision.valid.yaml with a DOUBLE PRECISION column, When the command executes, Then it maps the type correctly in the migration', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'typed-double-precision-initial.ts')

    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([typedDoublePrecisionSpec, '--output', outputFilePath])
    )

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)

    assert.match(content, /'rating': number/) // Static fixture is impractical because the migration embeds a generated timestamp and snapshot payload.
    assert.match(content, /\.addColumn\('rating', 'double precision'/) // Static fixture is impractical because the migration embeds a generated timestamp and snapshot payload.
  })

  it('Given simple.valid.yaml to simple-v3.valid.yaml diff, When the command executes, Then it adds a column to an existing table and a new table with a UQ', () => {
    // Generate initial migration from simple.valid.yaml
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'v3-diff-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Generate diff migration to simple-v3.valid.yaml
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'v3-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleV3Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Step 8: createTable tags with UQ
    assert.match(content, /createTable\('tags'\)/)
    assert.match(content, /addUniqueConstraint\('uq_tags_label', \['label'\]\)/)

    // Step 9: add bio column to authors
    assert.match(content, /alterTable\('authors'\)\.addColumn\('bio'/)

    // down: dropColumn bio
    assert.match(content, /dropColumn\('bio'\)/)
    // down: dropTable tags
    assert.match(content, /dropTable\('tags'\)/)
  })

  it('Given typed.valid.yaml to typed-v2.valid.yaml diff with changed UQ and index, When the command executes, Then it generates correct diff operations', () => {
    // Generate initial migration from typed.valid.yaml
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'typed-diff-initial.ts')
    const { exitCode: exitCode1 } = runCommandAndCapture(() =>
      executeKyselyMigration([typedSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(exitCode1, 0)

    // Generate diff migration to typed-v2.valid.yaml (UQ and index columns changed)
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, 'typed-diff.ts')
    const { exitCode: exitCode2 } = runCommandAndCapture(() =>
      executeKyselyMigration([
        typedV2Spec,
        '--output',
        diffMigrationFilePath,
        '--previous-migration',
        initialMigrationFilePath
      ])
    )

    assert.equal(exitCode2, 0)

    const content = readTextFile(diffMigrationFilePath)

    // Step 1: drop changed index
    assert.match(content, /dropIndex\('idx_products_sku'\)/)

    // Step 2: drop changed UQ
    assert.match(content, /dropConstraint\('uq_products_sku'\)/)

    // Step 10: add new UQ with new columns
    assert.match(content, /addUniqueConstraint\('uq_products_sku', \['sku', 'price'\]\)/)

    // Step 11: add new index with new columns
    assert.match(content, /createIndex\('idx_products_sku'\)/)
    assert.match(content, /\.columns\(\['sku', 'price'\]\)/)
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

  it('runs the generated up migration and creates tables, columns, constraints, and indexes', async () => {
    const migrationFilePath = joinFilePath(temporaryDirectoryPath, 'up_test.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleWithIndexSpec, '--output', migrationFilePath])
    )

    assert.equal(exitCode, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const migration = await import(getFileImportUrl(migrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return { '001_up': migration }
      }
    }
    const migrator = new Migrator({ db, provider })
    const { error } = await migrator.migrateToLatest()

    assert.equal(error, undefined)
    assert.deepEqual(await readTableNames(db), ['authors', 'posts'])
    assert.deepEqual(await readConstraintNames(db), ['fk_posts_author', 'pk_authors', 'pk_posts'])
    assert.deepEqual(await readIndexNames(db), ['idx_authors_pen_name'])

    await db.destroy()
  })

  it('runs the generated down migration and removes all tables', async () => {
    const migrationFilePath = joinFilePath(temporaryDirectoryPath, 'down_test.ts')
    const { exitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleWithIndexSpec, '--output', migrationFilePath])
    )

    assert.equal(exitCode, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const migration = await import(getFileImportUrl(migrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return { '001_down': migration }
      }
    }
    const migrator = new Migrator({ db, provider })

    const upResult = await migrator.migrateToLatest()

    assert.equal(upResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['authors', 'posts'])

    const downResult = await migrator.migrateTo(NO_MIGRATIONS)

    assert.equal(downResult.error, undefined)
    assert.deepEqual(await readTableNames(db), [])

    await db.destroy()
  })

  it('runs initial migration followed by a diff migration that adds a table', async () => {
    const initialMigrationFilePath = joinFilePath(temporaryDirectoryPath, '001_initial.ts')
    const diffMigrationFilePath = joinFilePath(temporaryDirectoryPath, '002_add_tags.ts')

    const { exitCode: initialExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([simpleSpec, '--output', initialMigrationFilePath])
    )

    assert.equal(initialExitCode, 0)

    const { exitCode: diffExitCode } = runCommandAndCapture(() =>
      executeKyselyMigration([
        simpleV2Spec,
        '--previous-migration',
        initialMigrationFilePath,
        '--output',
        diffMigrationFilePath
      ])
    )

    assert.equal(diffExitCode, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const initialMigration = await import(getFileImportUrl(initialMigrationFilePath))
    const diffMigration = await import(getFileImportUrl(diffMigrationFilePath))
    const provider: MigrationProvider = {
      async getMigrations() {
        return {
          '001_initial': initialMigration,
          '002_add_tags': diffMigration
        }
      }
    }
    const migrator = new Migrator({ db, provider })

    const upResult = await migrator.migrateToLatest()

    assert.equal(upResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['authors', 'posts', 'tags'])

    const downToInitialResult = await migrator.migrateTo('001_initial')

    assert.equal(downToInitialResult.error, undefined)
    assert.deepEqual(await readTableNames(db), ['authors', 'posts'])

    const downResult = await migrator.migrateTo(NO_MIGRATIONS)

    assert.equal(downResult.error, undefined)
    assert.deepEqual(await readTableNames(db), [])

    await db.destroy()
  })

  it('encodes and decodes embedded snapshot round-trip', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'snap_test.ts')
    const { exitCode } = runCommandAndCapture(() => executeKyselyMigration([simpleSpec, '--output', outputFilePath]))

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)
    const roundTripped = parseEmbeddedSnapshot(content)

    assert.equal(roundTripped['data-sketch/db-projection-snapshot'], '1.0.0-draft.0')
    assert.ok(roundTripped.tables.length > 0)
    assert.ok(roundTripped.tables.every(t => typeof t.id === 'string' && typeof t.name === 'string'))
  })

  it('renderInitialMigrationFile preserves the embedded snapshot', () => {
    const outputFilePath = joinFilePath(temporaryDirectoryPath, 'render_test.ts')
    const { exitCode } = runCommandAndCapture(() => executeKyselyMigration([simpleSpec, '--output', outputFilePath]))

    assert.equal(exitCode, 0)

    const content = readTextFile(outputFilePath)
    const fromFile = parseEmbeddedSnapshot(content)

    // Build snapshot directly and re-encode to verify consistency
    const warnings: string[] = []
    const rendered = renderInitialMigrationFile(fromFile, warnings)
    const fromRendered = parseEmbeddedSnapshot(rendered)

    assert.deepEqual(fromFile, fromRendered)
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

const simpleWithIndexSpec = 'test/commands/kysely-migration/fixtures/simple-with-index.valid.yaml'

async function readTableNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ table_name: string }>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name NOT IN ('kysely_migration', 'kysely_migration_lock')
    ORDER BY table_name
  `.execute(db)

  return result.rows.map(r => r.table_name)
}

async function readConstraintNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ constraint_name: string }>`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name NOT IN ('kysely_migration', 'kysely_migration_lock')
      AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
    ORDER BY constraint_name
  `.execute(db)

  return result.rows.map(r => r.constraint_name)
}

async function readIndexNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ index_name: string }>`
    SELECT ic.relname AS index_name
    FROM pg_index i
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tc.relnamespace
    JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE ns.nspname = 'public'
      AND tc.relname NOT IN ('kysely_migration', 'kysely_migration_lock')
      AND i.indisprimary = false
      AND i.indisunique = false
    ORDER BY ic.relname
  `.execute(db)

  return result.rows.map(r => r.index_name)
}
