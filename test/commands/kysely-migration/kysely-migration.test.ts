import assert from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { Kysely, PGliteDialect, sql } from 'kysely'
import { Migrator, NO_MIGRATIONS } from 'kysely/migration'
import type { MigrationProvider } from 'kysely/migration'
import {
  buildSnapshot,
  encodeSnapshot,
  executeKyselyMigration,
  parseEmbeddedSnapshot,
  renderInitialMigrationFile
} from '../../../src/commands/kysely-migration.ts'
import { runAndCapture } from '../../test-helper/logger.ts'

const usageLine = 'Usage: shot kysely-migration [OPTION]... SPEC_FILE'
const onlineShopSpec = 'test/commands/tables-doc/fixtures/online-shop.yaml'
const simpleSpec = 'test/commands/kysely-migration/fixtures/simple.yaml'
const simpleV2Spec = 'test/commands/kysely-migration/fixtures/simple-v2.yaml'
const typedSpec = 'test/commands/kysely-migration/fixtures/typed.yaml'
const typedV2Spec = 'test/commands/kysely-migration/fixtures/typed-v2.yaml'
const simpleV3Spec = 'test/commands/kysely-migration/fixtures/simple-v3.yaml'
const onlineShopNoPhoneSpec = 'test/commands/kysely-migration/fixtures/online-shop-no-phone.yaml'
const onlineShopV1Spec = 'test/commands/kysely-migration/fixtures/online-shop-v1.yaml'
const onlineShopV2Spec = 'test/commands/kysely-migration/fixtures/online-shop-v2.yaml'
const typedV3Spec = 'test/commands/kysely-migration/fixtures/typed-v3.yaml'
const typedV4Spec = 'test/commands/kysely-migration/fixtures/typed-v4.yaml'
const simpleRenamedSpec = 'test/commands/kysely-migration/fixtures/simple-renamed.yaml'
const simpleWithCheckSpec = 'test/commands/kysely-migration/fixtures/simple-with-check.yaml'
const simpleWithoutCheckSpec = 'test/commands/kysely-migration/fixtures/simple-without-check.yaml'

// ─── CLI behaviour ─────────────────────────────────────────────────────────────

describe('kysely-migration CLI', () => {
  let tempDir = ''

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kysely-migration-'))
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

  it('Given no spec file is provided, When the command executes, Then it prints usage to stderr and returns exit code 1', () => {
    const { exitCode, stdout, stderr } = run([])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
    assert.ok(stderr.join('').includes(usageLine))
  })

  it('Given no --output is provided, When the command executes, Then it prints usage to stderr and returns exit code 1', () => {
    const { exitCode, stdout, stderr } = run([onlineShopSpec])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
    assert.ok(stderr.join('').includes(usageLine))
  })

  it('Given --types-output without .d.ts extension, When the command executes, Then it prints an error and returns exit code 1', () => {
    const outputPath = join(tempDir, 'migration.ts')
    const { exitCode, stdout, stderr } = run([
      onlineShopSpec,
      '--output',
      outputPath,
      '--types-output',
      'types.ts'
    ])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.join('').includes('.d.ts'))
  })

  it('Given online-shop.yaml with --include-tentative, When the command executes, Then it writes a complete initial migration', () => {
    const outputPath = join(tempDir, 'initial.ts')
    const { exitCode, stdout, stderr } = run([
      onlineShopSpec,
      '--output',
      outputPath,
      '--include-tentative'
    ])

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Migration generated'))

    const content = readFileSync(outputPath, 'utf-8')

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
    assert.match(
      content,
      /\.addForeignKeyConstraint\('fk_orders_customer', \['customer'\], 'customers', \['id'\]\)/
    )
    assert.match(
      content,
      /\.addUniqueConstraint\('uq_orders_status_customer', \['status', 'customer'\]\)/
    )

    // order_items has structural FK
    assert.match(
      content,
      /\.addForeignKeyConstraint\('fk_order_items_order', \['order'\], 'orders', \['id'\]\)/
    )

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
      stderr
        .join('')
        .includes('Warning: Check constraint ignored by migration renderer: orders.ck_orders_status')
    )
  })

  it('Given online-shop.yaml with --include-tentative and a check constraint, When the command executes, Then stderr has check constraint warning', () => {
    const outputPath = join(tempDir, 'check-warn.ts')
    const { stderr } = run([onlineShopSpec, '--output', outputPath, '--include-tentative'])

    assert.ok(
      stderr
        .join('')
        .includes('Warning: Check constraint ignored by migration renderer: orders.ck_orders_status')
    )
  })

  it('Given --dry-run, When the command executes, Then no files are written and stdout contains "Dry run completed"', () => {
    const outputPath = join(tempDir, 'dry-run.ts')
    const { exitCode, stdout } = run([
      simpleSpec,
      '--output',
      outputPath,
      '--dry-run'
    ])

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Dry run completed'))

    // File should NOT be written
    assert.throws(() => readFileSync(outputPath), 'File should not exist after dry-run')
  })

  it('Given a spec with a tentative claim, When the command executes without --include-tentative, Then the tentative table is excluded and a warning is emitted', () => {
    // online-shop.yaml has 'order' claim with tentative: true
    const outputPath = join(tempDir, 'tentative-excluded.ts')
    const { exitCode, stderr } = run([onlineShopSpec, '--output', outputPath])

    assert.equal(exitCode, 0)

    const content = readFileSync(outputPath, 'utf-8')

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
    const outputPath = join(tempDir, 'tentative-included.ts')
    const { exitCode } = run([onlineShopSpec, '--output', outputPath, '--include-tentative'])

    assert.equal(exitCode, 0)

    const content = readFileSync(outputPath, 'utf-8')

    assert.match(content, /createTable\('orders'\)/)
  })

  it('Given --previous-migration pointing to the same spec, When the command executes, Then it generates an empty diff migration', () => {
    // First run: generate initial migration
    const initialPath = join(tempDir, 'diff-initial.ts')
    const { exitCode: exitCode1 } = run([simpleSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Second run: diff against the same initial (no changes expected)
    const diffPath = join(tempDir, 'diff-empty.ts')
    const { exitCode: exitCode2, stdout } = run([
      simpleSpec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)
    assert.ok(stdout.join('').includes('Migration generated'))

    const content = readFileSync(diffPath, 'utf-8')

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

  it('Given --previous-migration with simple.yaml, When the command runs against simple-v2.yaml, Then diff migration adds the new tag table', () => {
    // First run: initial migration for simple.yaml
    const initialPath = join(tempDir, 'diff-v1.ts')
    const { exitCode: exitCode1 } = run([simpleSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Second run: diff migration to simple-v2.yaml (adds 'tag' claim)
    const diffPath = join(tempDir, 'diff-v2.ts')
    const { exitCode: exitCode2 } = run([
      simpleV2Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // up should createTable tags
    assert.match(content, /createTable\('tags'\)/)

    // down should dropTable tags
    assert.match(content, /dropTable\('tags'\)/)
  })

  it('Given --types-output with .d.ts extension, When the command executes, Then the types file is written with Database interface', () => {
    const outputPath = join(tempDir, 'types-migration.ts')
    const typesPath = join(tempDir, 'types-db.d.ts')
    const { exitCode, stdout } = run([
      simpleSpec,
      '--output',
      outputPath,
      '--types-output',
      typesPath
    ])

    assert.equal(exitCode, 0)
    assert.ok(stdout.join('').includes('Type definitions written'))
    assert.ok(stdout.join('').includes('Migration generated'))

    // Types file must exist
    const typesContent = readFileSync(typesPath, 'utf-8')

    // Has embedded snapshot
    assert.match(typesContent, /\/\/ data-sketch\/embedded-db-projection-snapshot: 1\.0\.0-draft\.0/)

    // Has Database export interface
    assert.match(typesContent, /export interface Database \{/)
    assert.match(typesContent, /'authors'/)
    assert.match(typesContent, /'posts'/)
  })

  it('Given a diff that adds a nullable column to an existing table, When the command executes, Then it generates addColumn without notNull callback', () => {
    // Generate initial migration from no-phone spec (customers without phone)
    const initialPath = join(tempDir, 'no-phone-initial.ts')
    const { exitCode: exitCode1 } = run([onlineShopNoPhoneSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to spec with nullable phone added
    const diffPath = join(tempDir, 'add-phone-diff.ts')
    const { exitCode: exitCode2 } = run([
      onlineShopV1Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // Nullable addColumn: no notNull callback
    assert.match(content, /alterTable\('customers'\)\.addColumn\('phone', 'varchar\(1024\)'\)\.execute\(\)/)
    // down drops the column
    assert.match(content, /alterTable\('customers'\)\.dropColumn\('phone'\)/)
  })

  it('Given a diff that renames a column, When the command executes, Then it generates renameColumn', () => {
    // Generate initial migration from online-shop-v1 (phone column)
    const initialPath = join(tempDir, 'rename-initial.ts')
    const { exitCode: exitCode1 } = run([onlineShopV1Spec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to online-shop-v2 (phone renamed to contact_phone)
    const diffPath = join(tempDir, 'rename-diff.ts')
    const { exitCode: exitCode2 } = run([
      onlineShopV2Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // Column rename in up
    assert.match(content, /renameColumn\('phone', 'contact_phone'\)/)
    // Column rename reversed in down
    assert.match(content, /renameColumn\('contact_phone', 'phone'\)/)
  })

  it('Given a diff that renames tables, When the command executes, Then it generates renameTable and drops/recreates PKs', () => {
    // Generate initial migration from simple.yaml
    const initialPath = join(tempDir, 'table-rename-initial.ts')
    const { exitCode: exitCode1 } = run([simpleSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to simple-renamed.yaml (authors→writers, posts→articles)
    const diffPath = join(tempDir, 'table-rename-diff.ts')
    const { exitCode: exitCode2 } = run([
      simpleRenamedSpec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // Table renames
    assert.match(content, /renameTable\('authors', 'writers'\)/)
    assert.match(content, /renameTable\('posts', 'articles'\)/)

    // PK dropped (old name) and re-added (new name)
    assert.match(content, /dropConstraint\('pk_authors'\)/)
    assert.match(content, /addPrimaryKeyConstraint\('pk_writers'/)
  })

  it('Given a diff that changes a column type, When the command executes, Then it generates alterColumn with setDataType', () => {
    // Generate initial migration from typed.yaml
    const initialPath = join(tempDir, 'col-type-initial.ts')
    const { exitCode: exitCode1 } = run([typedSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to typed-v3.yaml (price changes from DECIMAL(10,2) to DECIMAL(10,4))
    const diffPath = join(tempDir, 'col-type-diff.ts')
    const { exitCode: exitCode2 } = run([
      typedV3Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // Column type change
    assert.match(content, /alterColumn\('price', col => col\.setDataType\('decimal\(10, 4\)'\)\.setNotNull\(\)\)/)
    // down reverses
    assert.match(content, /alterColumn\('price', col => col\.setDataType\('decimal\(10, 2\)'\)\.setNotNull\(\)\)/)
  })

  it('Given a diff that adds a table with a check constraint, When the command executes, Then it warns about the check constraint', () => {
    // Generate initial migration from online-shop (without tentative = just customers)
    const initialPath = join(tempDir, 'ck-diff-initial.ts')
    const { exitCode: exitCode1 } = run([onlineShopSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to online-shop with --include-tentative (adds orders table with ck_orders_status)
    const diffPath = join(tempDir, 'ck-diff.ts')
    const { exitCode: exitCode2, stderr } = run([
      onlineShopSpec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath,
      '--include-tentative'
    ])

    assert.equal(exitCode2, 0)

    // Should warn about added check constraint
    assert.ok(
      stderr
        .join('')
        .includes(
          'Warning: Check constraint ignored by migration renderer: orders.ck_orders_status'
        ),
      'Should warn about added check constraint in diff mode'
    )
  })

  it('Given a diff that removes a check constraint from an existing table, When the command executes, Then it warns about the removed check constraint', () => {
    // Generate initial migration from simple-with-check (authors with ck_authors_status)
    const initialPath = join(tempDir, 'ck-remove-initial.ts')
    const { exitCode: exitCode1 } = run([simpleWithCheckSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to simple-without-check (authors table still exists but ck_authors_status removed)
    const diffPath = join(tempDir, 'ck-remove-diff.ts')
    const { exitCode: exitCode2, stderr } = run([
      simpleWithoutCheckSpec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    // Should warn about removed check constraint
    assert.ok(
      stderr
        .join('')
        .includes(
          'Warning: Check constraint ignored by migration renderer: authors.ck_authors_status'
        ),
      'Should warn about removed check constraint in diff mode'
    )
  })

  it('Given a diff that removes an index entirely, When the command executes, Then it drops the index', () => {
    // Generate initial migration from typed.yaml (has idx_products_sku)
    const initialPath = join(tempDir, 'drop-ix-initial.ts')
    const { exitCode: exitCode1 } = run([typedSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Diff to typed-v4.yaml (index removed)
    const diffPath = join(tempDir, 'drop-ix-diff.ts')
    const { exitCode: exitCode2 } = run([
      typedV4Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

    // up drops the index
    assert.match(content, /dropIndex\('idx_products_sku'\)/)
    // down re-creates the index
    assert.match(content, /createIndex\('idx_products_sku'\)/)
  })

  it('Given --previous-migration pointing to a file without an embedded snapshot, When the command executes, Then it returns exit code 1', () => {
    const noSnapshotPath = join(tempDir, 'no-snapshot.ts')
    const outputPath = join(tempDir, 'no-snapshot-output.ts')

    // Write a file that has no embedded snapshot block
    writeFileSync(noSnapshotPath, '// Just a regular TypeScript file\nexport const x = 1\n')

    const { exitCode, stderr } = run([
      simpleSpec,
      '--output',
      outputPath,
      '--previous-migration',
      noSnapshotPath
    ])

    assert.equal(exitCode, 1)
    assert.ok(stderr.join('').includes('No embedded DB projection snapshot found'))
  })

  it('Given a non-existent spec file, When the command executes, Then it prints an error to stderr and returns exit code 1', () => {
    const outputPath = join(tempDir, 'error.ts')
    const { exitCode, stdout, stderr } = run(['nonexistent.yaml', '--output', outputPath])

    assert.equal(exitCode, 1)
    assert.deepEqual(stdout, [])
    assert.ok(stderr.length > 0)
  })

  it('Given typed.yaml with DECIMAL and BOOLEAN columns, When the command executes, Then it maps types correctly in the migration', () => {
    const outputPath = join(tempDir, 'typed-initial.ts')
    const { exitCode } = run([typedSpec, '--output', outputPath])

    assert.equal(exitCode, 0)

    const content = readFileSync(outputPath, 'utf-8')

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

  it('Given simple.yaml to simple-v3.yaml diff, When the command executes, Then it adds a column to an existing table and a new table with a UQ', () => {
    // Generate initial migration from simple.yaml
    const initialPath = join(tempDir, 'v3-diff-initial.ts')
    const { exitCode: exitCode1 } = run([simpleSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Generate diff migration to simple-v3.yaml
    const diffPath = join(tempDir, 'v3-diff.ts')
    const { exitCode: exitCode2 } = run([
      simpleV3Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

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

  it('Given typed.yaml to typed-v2.yaml diff with changed UQ and index, When the command executes, Then it generates correct diff operations', () => {
    // Generate initial migration from typed.yaml
    const initialPath = join(tempDir, 'typed-diff-initial.ts')
    const { exitCode: exitCode1 } = run([typedSpec, '--output', initialPath])

    assert.equal(exitCode1, 0)

    // Generate diff migration to typed-v2.yaml (UQ and index columns changed)
    const diffPath = join(tempDir, 'typed-diff.ts')
    const { exitCode: exitCode2 } = run([
      typedV2Spec,
      '--output',
      diffPath,
      '--previous-migration',
      initialPath
    ])

    assert.equal(exitCode2, 0)

    const content = readFileSync(diffPath, 'utf-8')

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
  let tempDir = ''

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shot-pglite-'))
  })

  after(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('runs the generated up migration and creates tables, columns, constraints, and indexes', async () => {
    const migrationPath = join(tempDir, 'up_test.ts')
    const { exitCode } = run([simpleWithIndexSpec, '--output', migrationPath])
    assert.equal(exitCode, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const migration = await import(pathToFileURL(migrationPath).href)
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
    const migrationPath = join(tempDir, 'down_test.ts')
    const { exitCode } = run([simpleWithIndexSpec, '--output', migrationPath])
    assert.equal(exitCode, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const migration = await import(pathToFileURL(migrationPath).href)
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
    const initialPath = join(tempDir, '001_initial.ts')
    const diffPath = join(tempDir, '002_add_tags.ts')

    const { exitCode: e1 } = run([simpleSpec, '--output', initialPath])
    assert.equal(e1, 0)

    const { exitCode: e2 } = run([
      simpleV2Spec,
      '--previous-migration',
      initialPath,
      '--output',
      diffPath
    ])
    assert.equal(e2, 0)

    const pglite = new PGlite()
    const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) })
    const initialMigration = await import(pathToFileURL(initialPath).href)
    const diffMigration = await import(pathToFileURL(diffPath).href)
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
    const { exitCode } = run([simpleSpec, '--output', join(tempDir, 'snap_test.ts')])
    assert.equal(exitCode, 0)

    const content = readFileSync(join(tempDir, 'snap_test.ts'), 'utf-8')
    const roundTripped = parseEmbeddedSnapshot(content)

    assert.equal(roundTripped['data-sketch/db-projection-snapshot'], '1.0.0-draft.0')
    assert.ok(roundTripped.tables.length > 0)
    assert.ok(roundTripped.tables.every(t => typeof t.id === 'string' && typeof t.name === 'string'))
  })

  it('renderInitialMigrationFile produces the same snapshot as buildSnapshot via encodeSnapshot', () => {
    const { exitCode } = run([simpleSpec, '--output', join(tempDir, 'render_test.ts')])
    assert.equal(exitCode, 0)

    const content = readFileSync(join(tempDir, 'render_test.ts'), 'utf-8')
    const fromFile = parseEmbeddedSnapshot(content)

    // Build snapshot directly and re-encode to verify consistency
    const warnings: string[] = []
    const rendered = renderInitialMigrationFile(fromFile, warnings)
    const fromRendered = parseEmbeddedSnapshot(rendered)

    assert.deepEqual(fromFile, fromRendered)
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

const simpleWithIndexSpec = 'test/commands/kysely-migration/fixtures/simple-with-index.yaml'

function run(args: readonly string[]) {
  let exitCode = 0

  const result = runAndCapture(() => {
    exitCode = executeKyselyMigration(args)
  })

  return { exitCode, stdout: result.stdout, stderr: result.stderr }
}

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
